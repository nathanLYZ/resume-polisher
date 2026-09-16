/**
 * watch daemon —— Phase 3 端到端自动化的本地入口
 *
 * 为什么是本地 daemon 而不是 Vercel Cron:
 *   Hobby 档 Cron 只有 daily 且 serverless 有时长上限,而深度润色是
 *   50s 级 LLM 循环;油猴脚本本来就要求本地应用常驻,定时任务放本地零基础设施。
 *
 * 用法:
 *   npm run watch            # 默认 30 分钟一轮,读 .data/watch-config.json
 *   npm run watch -- --once  # 只跑一轮(调试)
 *
 * 配置(.data/watch-config.json,不存在时自动生成模板并退出):
 *   sources: 职位源(rss/json);resume: 你的简历文本;
 *   fitThreshold: 进深度润色的门槛;notifyWebhook: 飞书机器人(可选)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { config as loadEnv } from "dotenv";
import {
  type WatchConfig, type WatchState, type WatchRecord, type JobPosting,
  fetchJobs, expandJobDetail, scoreFit, dedupe, markSeen, notifyLark,
} from "./pipeline";

loadEnv(); // .env.local(DeepSeek Key,主应用也在用)

const DATA_DIR = join(process.cwd(), ".data", "watch");
const CONFIG_PATH = join(DATA_DIR, "watch-config.json");
const STATE_PATH = join(DATA_DIR, "state.json");
const RECORDS_PATH = join(DATA_DIR, "records.json");
const POLL_MINUTES = Number(process.argv.includes("--once") ? 0 : process.env.WATCH_INTERVAL_MIN ?? 30);

// ---------------------------------------------------------------- 配置与状态

function writeConfigTemplate(): WatchConfig {
  const template: WatchConfig = {
    sources: [
      // 通用职位 RSS 示例;替换为你所在市场的真实源(如 GitHub Jobs RSS、V2EX、Remotive 等)
      { name: "example", type: "rss", url: "https://hnrss.org/jobs?q=engineer" },
    ],
    resume: "在此粘贴你的简历全文(用于粗筛与 fit 打分)",
    mustKeywords: [],
    fitThreshold: 60,
    appBaseUrl: process.env.APP_BASE_URL || "http://localhost:3000",
  };
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(template, null, 2));
  return template;
}

function loadConfig(): WatchConfig {
  if (!existsSync(CONFIG_PATH)) {
    const t = writeConfigTemplate();
    console.log(`[watch] 未找到配置,已生成模板 → ${CONFIG_PATH}\n[watch] 请编辑后重新运行 npm run watch`);
    process.exit(0);
  }
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as WatchConfig;
  if (!cfg.resume || cfg.resume.includes("在此粘贴")) {
    console.error("[watch] 配置里的 resume 还是模板占位文本,请填入真实简历");
    process.exit(1);
  }
  return cfg;
}

function loadState(): WatchState {
  if (existsSync(STATE_PATH)) {
    return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as WatchState;
  }
  return { seenIds: [] };
}

function persist(state: WatchState, records: WatchRecord[]) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state));
  const all = existsSync(RECORDS_PATH)
    ? ([...(JSON.parse(readFileSync(RECORDS_PATH, "utf-8")) as WatchRecord[]), ...records])
    : records;
  // 只留最近 200 条
  writeFileSync(RECORDS_PATH, JSON.stringify(all.slice(-200), null, 2));
}

// ---------------------------------------------------------------- 深度润色(走本地主应用)

async function deepPolish(cfg: WatchConfig, job: JobPosting): Promise<{ polished?: string; atsScore?: number; atsDelta?: number }> {
  try {
    const res = await fetch(`${cfg.appBaseUrl}/api/ats/screen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ original: cfg.resume, polished: "", jd: `${job.title}\n${job.description}` }),
      signal: AbortSignal.timeout(30_000),
    });
    void res;
    // ATS 模拟走本地纯函数,深度润色(50s 级 LLM 循环)只对 top 岗位做,且由用户在 UI 确认后触发
    // —— 自动化层不烧 LLM 预算,只把高 fit 岗位准备好
    return {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------- 一轮

async function runOnce(cfg: WatchConfig): Promise<WatchRecord[]> {
  let state = loadState();
  const out: WatchRecord[] = [];

  // 1) 拉源(单源失败不阻断)
  const jobs: JobPosting[] = [];
  for (const src of cfg.sources) {
    try {
      const fetched = await fetchJobs(src);
      jobs.push(...fetched);
      console.log(`[watch] ${src.name}: ${fetched.length} 条`);
    } catch (e) {
      console.error(`[watch] 源 ${src.name} 拉取失败:`, e instanceof Error ? e.message : e);
    }
  }

  // 2) 去重
  const fresh = dedupe(jobs, state);
  if (fresh.length === 0) {
    console.log(`[watch] 无新岗位(共 ${jobs.length} 条,全部已见)`);
    return out;
  }

  // 3) 粗筛:mustKeywords 命中其一(未配置则全部放行)
  const must = cfg.mustKeywords ?? [];
  const keywordPass = must.length === 0
    ? fresh
    : fresh.filter((j) => {
        const t = `${j.title}\n${j.description}`.toLowerCase();
        return must.some((k) => t.includes(k.toLowerCase()));
      });
  console.log(`[watch] 新岗位 ${fresh.length} 条 → 粗筛后 ${keywordPass.length} 条`);

  // 4) fit 打分(零成本);详情太短的先展开
  const scored: WatchRecord[] = [];
  for (const job of keywordPass) {
    const detailed = await expandJobDetail(job);
    const fit = scoreFit(detailed, cfg.resume);
    scored.push({ job: detailed, fit, processedAt: new Date().toISOString() });
  }
  scored.sort((a, b) => b.fit.score - a.fit.score);

  // 5) 高分岗位补深度信息(预留;当前仅记录)
  const top = scored.filter((r) => r.fit.score >= cfg.fitThreshold);
  for (const rec of top.slice(0, 3)) {
    const extra = await deepPolish(cfg, rec.job);
    Object.assign(rec, extra);
  }

  // 6) 落盘 + 更新状态(所有 fresh 都标已见,避免下轮重复处理)
  state = markSeen(state, fresh);
  persist(state, scored);
  console.log(`[watch] fit≥${cfg.fitThreshold}: ${top.length} 条 → ${RECORDS_PATH}`);

  // 7) 通知
  if (cfg.notifyWebhook && top.length > 0) {
    const ok = await notifyLark(cfg.notifyWebhook, top);
    console.log(`[watch] 飞书通知: ${ok ? "已发送" : "失败"}`);
  }

  out.push(...scored);
  return out;
}

// ---------------------------------------------------------------- 主循环

async function main() {
  const cfg = loadConfig();
  if (POLL_MINUTES > 0) {
    console.log(`[watch] 启动,每 ${POLL_MINUTES} 分钟一轮;源: ${cfg.sources.map((s) => s.name).join(", ")}`);
    for (;;) {
      const started = Date.now();
      try {
        await runOnce(cfg);
      } catch (e) {
        console.error("[watch] 本轮失败:", e);
      }
      const waitMs = Math.max(60_000, POLL_MINUTES * 60_000 - (Date.now() - started));
      await new Promise((r) => setTimeout(r, waitMs));
    }
  } else {
    console.log("[watch] 单轮模式(--once)");
    await runOnce(cfg);
  }
}

main().catch((e) => {
  console.error("[watch] fatal:", e);
  process.exit(1);
});