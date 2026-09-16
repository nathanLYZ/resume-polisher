/**
 * Phase 3 端到端 pipeline —— 纯逻辑核心,被 watch.ts(daemon)与单测共用
 *
 * 链路:拉取职位源(RSS/JSON) → 去重 → 关键词粗筛(零成本) → fit 打分
 *   → 高分岗位 → 深度润色(调本地 API)→ ATS 模拟 → 落盘 → 通知
 *
 * 设计原则:
 * 1. LLM 调用只花在高分岗位上(粗筛用词库/正则,免费)
 * 2. 每个环节独立容错:单个岗位/单个源失败不影响整轮
 * 3. 全部产物写 .data/watch/,重启不丢
 * 4. 本模块不 import Next.js 代码 —— 可在 node 直接单测
 */
import { TECH_TERMS } from "../src/lib/techTerms";
import { extractFromHtml } from "../src/lib/jdExtract";

// ---------------------------------------------------------------- 类型

export interface JobPosting {
  id: string; // 源内唯一 id(URL hash 或 guid)
  title: string;
  company?: string;
  url: string;
  description: string;
  publishedAt?: string;
}

export interface WatchConfig {
  sources: { name: string; type: "rss" | "json"; url: string }[];
  /** 用户简历文本(粗筛与 fit 的对象) */
  resume: string;
  /** 粗筛词:职位必须命中其一(不配则全部放行) */
  mustKeywords?: string[];
  /** fit ≥ 此值的岗位才进深度润色 */
  fitThreshold: number;
  /** 通知 webhook(飞书群机器人);空则跳过通知 */
  notifyWebhook?: string;
  /** 本地应用地址(深度润色走它的 API) */
  appBaseUrl: string;
}

export interface FitResult {
  score: number; // 0-100
  reasons: string[]; // 命中点(人读)
}

export interface WatchRecord {
  job: JobPosting;
  fit: FitResult;
  polished?: string;
  atsScore?: number;
  atsDelta?: number;
  processedAt: string;
}

// ---------------------------------------------------------------- fit 粗筛(零 LLM 成本)

/** JD 关键词覆盖率 fit:与 resume-polisher 主应用同一套词库逻辑 */
export function scoreFit(job: JobPosting, resume: string): FitResult {
  const text = `${job.title}\n${job.description}`.toLowerCase();
  const reasons: string[] = [];
  let hits = 0;
  let total = 0;

  // ① JD 中的技术词(内置词库)在简历中是否出现 —— 命中越多越匹配
  for (const term of TECH_TERMS) {
    if (term.length < 2) continue;
    if (!text.includes(term)) continue;
    total++;
    if (resume.toLowerCase().includes(term)) {
      hits++;
      reasons.push(`技术词「${term}」双方命中`);
    }
  }

  // ② 简历技能在 JD 中的出现率(反向:你会的东西 JD 要多少)
  //    仅在 JD 本身是技术岗位(① 命中过技术词)时参与,泛职位(储备干部/销售类)不拉分
  const resumeTerms = [...TECH_TERMS].filter((t) => t.length >= 2 && resume.toLowerCase().includes(t));
  if (resumeTerms.length > 0 && total > 0) {
    const asked = resumeTerms.filter((t) => text.includes(t));
    const askRatio = asked.length / resumeTerms.length;
    hits += askRatio * 8;
    total += 8;
    if (asked.length > 0) reasons.push(`简历 ${resumeTerms.length} 项技能中 JD 提到 ${asked.length} 项`);
  }

  // ③ 标题命中加权(岗位名直接对口的信号更强)
  const titleTerms = ["工程师", "开发", "架构", "后端", "前端", "全栈", "算法", "数据", "产品", "测试", "运维"];
  if (titleTerms.some((t) => job.title.includes(t))) {
    hits += 2;
    total += 2;
    reasons.push(`岗位方向匹配(标题:${job.title})`);
  }

  const score = total === 0 ? 40 : Math.min(100, Math.round((hits / total) * 100));
  return { score, reasons: reasons.slice(0, 6) };
}

// ---------------------------------------------------------------- 源拉取

/** RSS/Atom via rss-parser;json 源约定为 { items: [{ title, link, description }] } */
export async function fetchJobs(source: WatchConfig["sources"][number]): Promise<JobPosting[]> {
  if (source.type === "rss") {
    const Parser = (await import("rss-parser")).default;
    const parser = new Parser();
    const feed = await parser.parseURL(source.url);
    return (feed.items ?? [])
      .map((it) => ({
        id: it.guid || it.link || `${source.name}:${it.title}`,
        title: it.title ?? "(untitled)",
        company: it.creator ?? undefined,
        url: it.link ?? "",
        description: it.contentSnippet ?? it.content ?? "",
        publishedAt: it.isoDate,
      }))
      .filter((j) => j.url) as JobPosting[];
  }
  const res = await fetch(source.url, { signal: AbortSignal.timeout(15_000) });
  const data = (await res.json()) as { items?: { title?: string; link?: string; description?: string }[] };
  return (data.items ?? [])
    .map((it) => ({
      id: `${source.name}:${it.link ?? it.title}`,
      title: it.title ?? "(untitled)",
      url: it.link ?? "",
      description: it.description ?? "",
    }))
    .filter((j) => j.url) as JobPosting[];
}

/** URL 抓取职位详情(复用主应用的 Readability 抽取,SSRF 守卫同源) */
export async function expandJobDetail(job: JobPosting): Promise<JobPosting> {
  if (job.description.length >= 300) return job; // RSS 已带全文
  try {
    const { guardUrl } = await import("../src/lib/ssrf");
    const target = guardUrl(job.url);
    const res = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (!res.ok) return job;
    const html = (await res.text()).slice(0, 2_000_000);
    const { title, text } = extractFromHtml(html, target.href);
    // 招聘站详情页往往能抽到正文;只信比 snippet 长的
    if (text.length > job.description.length) {
      return { ...job, description: text, title: job.title || title };
    }
    return job;
  } catch {
    return job; // 详情抓取失败不致命,粗筛降级用 snippet
  }
}

// ---------------------------------------------------------------- 状态与去重

export interface WatchState {
  seenIds: string[]; // 已处理(不再重复通知/润色)
  lastRunAt?: string;
}

export function dedupe(jobs: JobPosting[], state: WatchState): JobPosting[] {
  const seen = new Set(state.seenIds);
  return jobs.filter((j) => j.id && !seen.has(j.id));
}

export function markSeen(state: WatchState, jobs: JobPosting[]): WatchState {
  const seen = new Set(state.seenIds);
  for (const j of jobs) seen.add(j.id);
  // 上限 5000,防无限增长
  return { ...state, seenIds: [...seen].slice(-5000), lastRunAt: new Date().toISOString() };
}

// ---------------------------------------------------------------- 通知

/** 飞书群机器人 webhook(text 消息) */
export async function notifyLark(webhook: string, records: WatchRecord[]): Promise<boolean> {
  if (!webhook || records.length === 0) return false;
  const lines = records
    .slice(0, 5)
    .map((r) => `【fit ${r.fit.score}】${r.job.title}${r.job.company ? ` @ ${r.job.company}` : ""} → ${r.job.url}${r.atsDelta !== undefined ? `(ATS ${r.atsScore},+${r.atsDelta})` : ""}`)
    .join("\n");
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msg_type: "text",
      content: { text: `简历润色助手 · 新匹配岗位 ${records.length} 个\n\n${lines}\n\n高分校录已生成润色稿,打开 localhost:3000 查看` },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  return res.ok;
}