/**
 * 确定性检查器(纯函数,零 LLM 调用)
 *
 * 设计原则(见 docs/agent-refactor-plan.md §2.2):
 * 1. 能写成代码的检查不交给模型 —— 便宜、稳定、模型无法跳过
 * 2. 每个检查器返回 Issue[],severity 分 blocker(必须修订)/ warning(提示人工确认)
 * 3. 检查器只判定,不修改 —— 修订由 drafter 带着 issue 清单完成
 */

export type CheckName =
  | "number_conservation"
  | "timeline"
  | "keyword_coverage"
  | "jd_copy"
  | "structure"
  | "keyword_stuffing"
  | "age_tenure"
  | "english_mixing"
  | "page_estimate"
  | "date_format_consistency"
  | "arabic_numerals";

export interface Issue {
  check: CheckName;
  severity: "blocker" | "warning";
  location: string; // 润色稿中的位置(行号/区块)
  evidence: string; // 命中的具体内容
  fixHint: string; // 给 drafter 的修改指令
}

export interface ChecksInput {
  original: string; // 简历原文
  jd: string; // JD 原文
  polished: string; // 润色稿
  matchedKeywords: string[]; // 模型声称已覆盖的关键词
  templateId?: string; // 风格模板(影响个别检查的阈值与豁免)
}

export function runAllChecks(input: ChecksInput): Issue[] {
  return [
    ...checkNumberConservation(input.original, input.polished),
    ...checkTimeline(input.original, input.polished),
    ...checkKeywordCoverage(input.matchedKeywords, input.polished),
    ...checkJdCopy(input.original, input.jd, input.polished),
    ...checkStructure(input.original, input.polished, input.templateId),
    ...checkKeywordStuffing(input.matchedKeywords, input.polished),
    ...checkAgeTenure(input.original, input.polished),
    ...checkEnglishMixing(input.original, input.jd, input.polished, input.templateId),
    ...checkPageEstimate(input.polished, input.templateId),
    ...checkDateFormatConsistency(input.polished),
    ...checkArabicNumerals(input.polished),
  ];
}

export function hasBlocker(issues: { severity: "blocker" | "warning" }[]): boolean {
  return issues.some((i) => i.severity === "blocker");
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 润色稿按行拆分,用于 issue 定位 */
function lineOf(text: string, index: number): { line: number; snippet: string } {
  const upTo = text.slice(0, index);
  const line = upTo.split("\n").length;
  const lineText = text.split("\n")[line - 1] || "";
  return { line, snippet: lineText.trim().slice(0, 60) };
}

function loc(text: string, index: number): string {
  const { line } = lineOf(text, index);
  return `第${line}行`;
}

// ---------------------------------------------------------------------------
// ① 数字守恒 —— "数字只能来自原文"(量化纪律的机械化)
// ---------------------------------------------------------------------------

interface NumToken {
  scaled: number; // 归一化后的数值(万→×1e4,%→×0.01)
  isQuantified: boolean; // 带百分比/规模单位(金额、用户量等语境)
  index: number; // 在原文中的位置
}

const NUM_RE =
  /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(%|万亿|亿万|亿|万|千人|万人|万元|亿元|元|倍|[kKMwW])?/g;

function scaleFactor(unit: string | undefined): number {
  switch (unit) {
    case "%": return 0.01;
    case "万亿": case "亿万": return 1e12;
    case "亿": case "亿元": return 1e8;
    case "万": case "万人": case "万元": case "w": case "W": return 1e4;
    case "千人": return 1e3;
    case "k": case "K": return 1e3;
    case "M": return 1e6;
    case "倍": case "元": return 1;
    default: return 1;
  }
}

/** 抹掉日期/年份片段(等长空格占位,索引不变),避免 "2020.03" 的月份泄漏进数字守恒检查 */
function stripDates(text: string): string {
  const rangeRe = new RegExp(
    `((?:19|20)\\d{2})\\s*[.\\-/年]\\s*(\\d{1,2})?\\s*[.\\-/月]?${RANGE_SEP.source}((?:19|20)\\d{2})\\s*[.\\-/年]\\s*(\\d{1,2})?\\s*[.\\-/月]?`,
    "g"
  );
  let out = text.replace(rangeRe, (m) => " ".repeat(m.length));
  out = out.replace(DATE_RE, (m) => " ".repeat(m.length));
  return out;
}

function extractNumbers(text: string): NumToken[] {
  const tokens: NumToken[] = [];
  for (const m of stripDates(text).matchAll(NUM_RE)) {
    const raw = m[1].replace(/,/g, "");
    const value = parseFloat(raw);
    if (Number.isNaN(value)) continue;

    const index = m.index ?? 0;
    const unit = m[2];

    // 年份(1950-2099 的裸四位数)不参与数字守恒,由时间线检查负责
    if (!unit && /^\d{4}$/.test(raw) && value >= 1950 && value <= 2099) continue;

    // 行首列表序号("1. 负责…" "2、主导…")跳过
    const lineStart = text.lastIndexOf("\n", index) + 1;
    const before = text.slice(lineStart, index);
    const after = text.slice(index + m[0].length, index + m[0].length + 2);
    if (!before.trim() && /^[.、)）.]/.test(after)) continue;

    const scaled = value * scaleFactor(unit);
    tokens.push({ scaled, isQuantified: Boolean(unit), index });
  }
  return tokens;
}

/** 相对误差 <2% 视为同一数字(吸收四舍五入,如 30.5% → 31%) */
function closeEnough(a: number, b: number): boolean {
  const base = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / base < 0.02;
}

export function checkNumberConservation(original: string, polished: string): Issue[] {
  const origNums = extractNumbers(original);
  const newIssues: Issue[] = [];
  for (const tok of extractNumbers(polished)) {
    if (origNums.some((o) => closeEnough(o.scaled, tok.scaled))) continue;
    const { snippet } = lineOf(polished, tok.index);
    newIssues.push({
      check: "number_conservation",
      severity: tok.isQuantified ? "blocker" : "warning",
      location: loc(polished, tok.index),
      evidence: `原文中不存在的数字「${snippet}」`,
      fixHint: tok.isQuantified
        ? "删除该数字或替换为原文中已有的数据;原文没有时改为定性表述并写入 suggestions"
        : "确认该数字来自原文,否则删除",
    });
  }
  // 同一行多个新数字会各报一条,按行去重
  const seen = new Set<string>();
  return newIssues.filter((i) => {
    const key = `${i.location}|${i.severity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// ② 时间线一致性 —— 新增时间点几乎必然是编造的经历
// ---------------------------------------------------------------------------

interface DatePoint {
  year: number;
  month?: number;
}

const DATE_RE = /((?:19|20)\d{2})\s*[.\-/年]\s*(\d{1,2})?\s*[.\-/月]?/g;
const RANGE_SEP = /\s*(?:[-–—~]|至今|当前|现在|present|至|到)\s*/i;

export function extractDates(text: string): { points: DatePoint[]; ranges: [DatePoint, DatePoint][] } {
  const points: DatePoint[] = [];
  // 先抽区间("2020.03-2022.05" / "2020.03-至今"),避免区间端点被重复当散点;
  // "至今"端点用当前时间补齐,使"2023.07-至今"也能算出经历时长
  const rangeRe = new RegExp(
    `((?:19|20)\\d{2})\\s*[.\\-/年]\\s*(\\d{1,2})?\\s*[.\\-/月]?${RANGE_SEP.source}((?:19|20)\\d{2})\\s*[.\\-/年]\\s*(\\d{1,2})?\\s*[.\\-/月]?`,
    "gi"
  );
  const rangeToNowRe = new RegExp(
    `((?:19|20)\\d{2})\\s*[.\\-/年]\\s*(\\d{1,2})?\\s*[.\\-/月]?\\s*(?:至今|当前|现在|present)`,
    "gi"
  );
  const now = new Date();
  const nowPoint: DatePoint = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const ranges: [DatePoint, DatePoint][] = [];
  const consumed = new Set<number>();
  for (const m of text.matchAll(rangeRe)) {
    // "2023.07-至今"的右侧不是年份,不会落到这条 path
    const i = m.index ?? 0;
    consumed.add(i);
    for (let k = i; k < i + m[0].length; k++) consumed.add(k);
    const start = { year: +m[1], month: m[2] ? clampMonth(+m[2]) : undefined };
    const end = { year: +m[3], month: m[4] ? clampMonth(+m[4]) : undefined };
    ranges.push([start, end]);
    points.push(start, end);
  }
  for (const m of text.matchAll(rangeToNowRe)) {
    const i = m.index ?? 0;
    consumed.add(i);
    for (let k = i; k < i + m[0].length; k++) consumed.add(k);
    const start = { year: +m[1], month: m[2] ? clampMonth(+m[2]) : undefined };
    ranges.push([start, nowPoint]);
    points.push(start, nowPoint);
  }
  for (const m of text.matchAll(DATE_RE)) {
    const i = m.index ?? 0;
    if (consumed.has(i)) continue;
    points.push({ year: +m[1], month: m[2] ? clampMonth(+m[2]) : undefined });
  }
  return { points, ranges };
}

function clampMonth(m: number): number | undefined {
  return m >= 1 && m <= 12 ? m : undefined;
}

function toNum(p: DatePoint): number {
  return p.year + (p.month ? (p.month - 1) / 12 : 0);
}

function inAnyRange(p: DatePoint, ranges: [DatePoint, DatePoint][]): boolean {
  return ranges.some(([a, b]) => {
    const lo = Math.min(toNum(a), toNum(b));
    const hi = Math.max(toNum(a), toNum(b));
    return toNum(p) >= lo && toNum(p) <= hi;
  });
}

export function checkTimeline(original: string, polished: string): Issue[] {
  const orig = extractDates(original);
  const origKeys = new Set(orig.points.map((p) => `${p.year}.${p.month ?? 0}`));
  const origYears = new Set(orig.points.map((p) => p.year));
  const issues: Issue[] = [];

  for (const m of polished.matchAll(DATE_RE)) {
    const index = m.index ?? 0;
    const p: DatePoint = { year: +m[1], month: m[2] ? clampMonth(+m[2]) : undefined };
    if (origKeys.has(`${p.year}.${p.month ?? 0}`)) continue;

    const { snippet } = lineOf(polished, index);
    const base = { check: "timeline" as const, location: loc(polished, index), evidence: `原文中不存在的时间点「${m[0].trim()}」(${snippet})` };

    if (p.month !== undefined) {
      // 月精度的新时间点:落在原文区间内视为区间推断,否则编造
      if (inAnyRange(p, orig.ranges)) {
        issues.push({ ...base, severity: "warning", fixHint: "该月份原文未直接出现,请确认可由原文区间推出,否则改为原文中的时间" });
      } else {
        issues.push({ ...base, severity: "blocker", fixHint: "删除该时间点或替换为原文中的时间,不得新增经历时间段" });
      }
    } else if (!origYears.has(p.year)) {
      const years = orig.points.map((q) => q.year);
      const min = Math.min(...years);
      const max = Math.max(...years);
      if (years.length > 0 && p.year >= min && p.year <= max) {
        issues.push({ ...base, severity: "warning", fixHint: "该年份原文未直接出现(在原时间范围内),请确认有原文依据" });
      } else {
        issues.push({ ...base, severity: "blocker", fixHint: "删除该年份或替换为原文中的时间" });
      }
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// ③ 关键词真实覆盖 —— matchedKeywords 是模型自报,必须对文本核实
// ---------------------------------------------------------------------------

/** 常见同义写法豁免表(小写键) */
const KW_VARIANTS: Record<string, string[]> = {
  k8s: ["kubernetes", "容器编排"],
  kubernetes: ["k8s", "容器编排"],
  js: ["javascript"],
  javascript: ["js"],
  ts: ["typescript"],
  typescript: ["ts"],
  golang: ["go 语言", "go"],
  springboot: ["spring boot", "spring"],
  nodejs: ["node", "node.js"],
  微服务: ["微服务架构"],
  大模型: ["llm", "大语言模型"],
  llm: ["大模型", "大语言模型"],
  aigc: ["生成式ai", "生成式人工智能"],
};

export function keywordPresent(kw: string, text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes(kw.toLowerCase())) return true;
  const variants = KW_VARIANTS[kw.toLowerCase()];
  return (variants ?? []).some((v) => lower.includes(v));
}

export function checkKeywordCoverage(matchedKeywords: string[], polished: string): Issue[] {
  return matchedKeywords
    .filter((kw) => kw.trim() && !keywordPresent(kw, polished))
    .map((kw) => ({
      check: "keyword_coverage" as const,
      severity: "blocker" as const,
      location: "全文",
      evidence: `matchedKeywords 声称已覆盖「${kw}」,但润色稿中没有出现`,
      fixHint: `从 matchedKeywords 挪到 missingKeywords,或把「${kw}」落入对应的真实经历描述`,
    }));
}

// ---------------------------------------------------------------------------
// ④ JD 照搬检测 —— "严禁将 JD 内容搬进简历"(绝对红线 #1 的机械化)
// ---------------------------------------------------------------------------

const NGRAM_LEN = 12; // 中文 12 字连续相同基本可断定照搬

function normalizeForNgram(text: string): string {
  return text.replace(/\s+/g, "");
}

function buildNgramSet(text: string): Set<string> {
  const t = normalizeForNgram(text);
  const set = new Set<string>();
  for (let i = 0; i + NGRAM_LEN <= t.length; i++) set.add(t.slice(i, i + NGRAM_LEN));
  return set;
}

/** 在 text 中找出存在于 jdNgrams 的片段,返回去重后的 {snippet, indexInNormalized} */
function findCopiedSnippets(text: string, jdNgrams: Set<string>, max = 5): string[] {
  const t = normalizeForNgram(text);
  const found: string[] = [];
  let i = 0;
  while (i + NGRAM_LEN <= t.length) {
    if (jdNgrams.has(t.slice(i, i + NGRAM_LEN))) {
      // 向两侧扩展出完整重叠片段
      let start = i;
      let end = i + NGRAM_LEN;
      while (start > 0 && jdNgrams.has(t.slice(start - 1, start - 1 + NGRAM_LEN))) start--;
      while (end < t.length && jdNgrams.has(t.slice(end - NGRAM_LEN + 1, end + 1))) end++;
      found.push(t.slice(start, end));
      i = end;
      if (found.length >= max) break;
    } else {
      i++;
    }
  }
  return found;
}

export function checkJdCopy(original: string, jd: string, polished: string): Issue[] {
  const jdNgrams = buildNgramSet(jd);
  const origNorm = normalizeForNgram(original);
  return findCopiedSnippets(polished, jdNgrams).map((snippet) => ({
    check: "jd_copy" as const,
    // 原文已有该片段 → 用户自己抄过 JD,润色稿如实保留;仍提示但不拦截
    severity: (origNorm.includes(snippet) ? "warning" : "blocker") as "warning" | "blocker",
    location: "全文",
    evidence: `与 JD 连续相同的片段「${snippet.slice(0, 40)}${snippet.length > 40 ? "…" : ""}」${origNorm.includes(snippet) ? "(原文中已存在)" : ""}`,
    fixHint: "用候选人自己的经历重写该片段,只保留必要的关键词,不得照搬 JD 句式与表述",
  }));
}

// ---------------------------------------------------------------------------
// ⑤ 结构 sanity —— 分区完整、没有删到空洞
// ---------------------------------------------------------------------------

const SECTION_CATEGORIES: { name: string; re: RegExp }[] = [
  { name: "教育背景", re: /教育|学历/i },
  { name: "工作经历", re: /工作经历|职业经历|work experience/i },
  { name: "项目经历", re: /项目/i },
  { name: "技能", re: /技能|专长|skills/i },
  { name: "个人简介", re: /简介|概述|summary|profile|关于我/i },
];

export function checkStructure(original: string, polished: string, templateId?: string): Issue[] {
  const issues: Issue[] = [];
  for (const cat of SECTION_CATEGORIES) {
    if (cat.re.test(original) && !cat.re.test(polished)) {
      issues.push({
        check: "structure",
        severity: "warning",
        location: "分区结构",
        evidence: `原文包含「${cat.name}」分区,润色稿中消失了`,
        fixHint: `恢复「${cat.name}」分区;确属"极简版"删减意图时保持删除并在 changes 中注明`,
      });
    }
  }
  // 极简一页版允许大幅压缩,阈值放宽
  const minRatio = templateId === "concise" ? 0.25 : 0.6;
  if (polished.trim().length < original.trim().length * minRatio) {
    issues.push({
      check: "structure",
      severity: "warning",
      location: "全文",
      evidence: `润色稿长度仅为原文的 ${Math.round((polished.trim().length / Math.max(original.trim().length, 1)) * 100)}%,疑似误删到空洞`,
      fixHint: "恢复被误删的实质内容;确需精简时保留与 JD 最相关的经历",
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// ⑥ 关键词实质使用 —— "匹配不是简单换几句话":关键词要落进经历,不能只堆技能行
// ---------------------------------------------------------------------------

const SKILLS_LINE_RE = /(技能|专长|精通|熟练|掌握|了解|skills?\s*[:：])/i;

export function checkKeywordStuffing(matchedKeywords: string[], polished: string): Issue[] {
  const lines = polished.split("\n");
  const issues: Issue[] = [];
  for (const kw of matchedKeywords) {
    if (!kw.trim()) continue;
    const hitLines = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => line.toLowerCase().includes(kw.toLowerCase()));
    if (hitLines.length === 0) continue; // 完全没出现是检查③的辖区
    const allInSkillsLines = hitLines.every(({ line }) => SKILLS_LINE_RE.test(line));
    if (allInSkillsLines) {
      issues.push({
        check: "keyword_stuffing",
        severity: "warning",
        location: `第${hitLines[0].i + 1}行`,
        evidence: `关键词「${kw}」只出现在技能行,未在任何经历中实质使用`,
        fixHint: `把「${kw}」落入相关经历的描述中(用候选人真实经历支撑),或从 matchedKeywords 挪到 missingKeywords`,
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// ⑦ 年龄/工龄放大 —— "年龄和工龄不要特意放大"
// ---------------------------------------------------------------------------

const AGE_RE = /(年龄\s*[:：]?\s*\d+|\d+\s*岁|出生(?:日期|年月)?\s*[:：]?\s*\d{4})/g;
const TENURE_RE = /(\d+\+?\s*年)(?:以上|\s*\+)?(?:\s*(?:工作|从业|行业|技术|开发|相关))?经验|经验\s*[:：]?\s*\d+\+?\s*年/g;

export function checkAgeTenure(original: string, polished: string): Issue[] {
  const issues: Issue[] = [];

  // 新增年龄表述 → blocker(原文没有的年龄信息一律不得出现)
  for (const m of polished.matchAll(AGE_RE)) {
    if (original.includes(m[1])) continue; // 原文已有同样表述,非新增
    const index = m.index ?? 0;
    issues.push({
      check: "age_tenure",
      severity: "blocker",
      location: loc(polished, index),
      evidence: `新增年龄/出生表述「${m[0]}」,原文中没有`,
      fixHint: "删除该年龄/出生表述,简历不放大年龄信息",
    });
  }

  // 工龄/年限强调次数:润色稿不得超过原文(总结出现一次总年限合法,重复堆叠即报)
  const origTenureCount = (original.match(TENURE_RE) ?? []).length;
  const polishedTenures = [...polished.matchAll(TENURE_RE)];
  if (polishedTenures.length > Math.max(origTenureCount, 1)) {
    issues.push({
      check: "age_tenure",
      severity: "warning",
      location: "全文",
      evidence: `年限/工龄表述出现 ${polishedTenures.length} 次(原文 ${origTenureCount} 次):${polishedTenures.slice(0, 3).map((m) => `「${m[0]}」`).join("、")}`,
      fixHint: "减少年限的重复强调:总结中最多保留一次总年限,项目经历中不重复堆叠",
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// ⑧ 中英夹杂 —— "不要夹英文"(技术名词豁免,english 模板跳过)
// ---------------------------------------------------------------------------

const LATIN_TOKEN_RE = /[A-Za-z][A-Za-z0-9+#./-]*/g;

export { TECH_TERMS } from "../techTerms";
import { TECH_TERMS } from "../techTerms";

function extractLatinTokens(text: string): string[] {
  return [...text.matchAll(LATIN_TOKEN_RE)].map((m) => m[0]);
}

export function checkEnglishMixing(
  original: string,
  jd: string,
  polished: string,
  templateId?: string
): Issue[] {
  if (templateId === "english") return []; // 英文简历模板本身就是英文输出

  const whitelist = new Set<string>(TECH_TERMS);
  for (const t of extractLatinTokens(original)) whitelist.add(t.toLowerCase());
  for (const t of extractLatinTokens(jd)) whitelist.add(t.toLowerCase());

  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const m of polished.matchAll(LATIN_TOKEN_RE)) {
    const token = m[0];
    const lower = token.toLowerCase().replace(/\.$/, "");
    if (lower.length < 2) continue; // 单字母多为序号/单位
    if (whitelist.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    const index = m.index ?? 0;
    issues.push({
      check: "english_mixing",
      severity: "warning",
      location: loc(polished, index),
      evidence: `中文句子里夹英文「${token}」(${lineOf(polished, index).snippet})`,
      fixHint: `将「${token}」换为中文表达;若属通用技术名词可保留并在 changes 中注明`,
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// ⑨ 篇幅估算 —— "不超过 2 页"的机械化(senior 模板规则;纯文本无法精确分页,行数模型近似)
// ---------------------------------------------------------------------------

/** 每模板页数上限:concise 目标一页纸;其余默认 2 页(senior 模板明确"不超过2页") */
const PAGE_LIMITS: Record<string, number> = { concise: 1 };
const DEFAULT_PAGE_LIMIT = 2;

/** 行宽权重:CJK/全角 ≈ 1,拉丁/数字/半角 ≈ 0.5 */
function lineWeight(line: string): number {
  let w = 0;
  for (const ch of line) w += /[⺀-鿿豈-﫿　-〿！-｠]/.test(ch) ? 1 : 0.5;
  return w;
}

/**
 * 页数估算:行数模型(默认每行 40 个 CJK 等效字符、每页 45 行 ≈ 10.5pt 常规页边距)。
 * 纯文本无法精确分页(真实页数取决于字体/边距/视觉主题),结果仅供预警,以打印预览为准。
 */
export function estimatePages(text: string, charsPerLine = 40, linesPerPage = 45): number {
  const lines = text
    .split("\n")
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(lineWeight(line) / charsPerLine)), 0);
  return lines / linesPerPage;
}

export function checkPageEstimate(polished: string, templateId?: string): Issue[] {
  const limit = templateId ? (PAGE_LIMITS[templateId] ?? DEFAULT_PAGE_LIMIT) : DEFAULT_PAGE_LIMIT;
  const pages = estimatePages(polished);
  if (pages <= limit + 0.05) return []; // 5% 容差吸收边界抖动
  return [
    {
      check: "page_estimate",
      severity: "warning",
      location: "全文",
      evidence: `预计篇幅约 ${pages.toFixed(1)} 页,超出${limit === 1 ? "一页纸" : "两页"}上限(估算值,以打印预览为准)`,
      fixHint:
        limit === 1
          ? "压缩到一页:只保留与 JD 最相关的经历,每条 1-2 行,删除次要分区"
          : "压缩到两页内:精简职责流水账行、合并同类项目、删除与 JD 无关内容;修订后用打印预览确认实际页数",
    },
  ];
}

// ---------------------------------------------------------------------------
// ⑩ 日期格式一致性 —— "2023.03 或 2023/03,全文一致"(PDF 排印原则的机械化)
// ---------------------------------------------------------------------------

/** 年-月 token(月必须合法 ≤12,排除 2019-2022 这类年份区间) */
const YM_TOKEN_RE = /((?:19|20)\d{2})\s*([.\/\-年])\s*(\d{1,2})(?!\d)/g;

export function checkDateFormatConsistency(polished: string): Issue[] {
  const counts: Record<string, number> = { ".": 0, "/": 0, "-": 0, "年": 0 };
  for (const m of polished.matchAll(YM_TOKEN_RE)) {
    const month = Number(m[3]);
    if (month >= 1 && month <= 12) counts[m[2]]++;
  }
  const used = (Object.entries(counts) as [string, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (used.length < 2) return [];
  const [major, ...minor] = used;
  return [
    {
      check: "date_format_consistency",
      severity: "warning",
      location: "全文",
      evidence: `日期格式不统一:${used.map(([sep, n]) => `「${sep}」式 ${n} 处`).join("、")}`,
      fixHint: `全文统一为一种格式(推荐「${major[0]}」式,如 2023.03);时间与数据统一用阿拉伯数字`,
    },
  ];
}

// ---------------------------------------------------------------------------
// ⑪ 阿拉伯数字 —— "时间、数据用阿拉伯数字"(PDF 排印原则的机械化)
// ---------------------------------------------------------------------------

const CN_NUM_PATTERNS = [
  /百分之[一二两三四五六七八九十百千零]+/g, // 百分之三十 → 30%
  /(?<!第)[一二两三四五六七八九十百千零]{1,6}(?:[%％]|[个人次万倍年月天])/g, // 三年→3年、二十人→20人;排除"第一"类序数
];

export function checkArabicNumerals(polished: string): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const re of CN_NUM_PATTERNS) {
    for (const m of polished.matchAll(re)) {
      const token = m[0];
      if (seen.has(token)) continue;
      seen.add(token);
      const index = m.index ?? 0;
      issues.push({
        check: "arabic_numerals",
        severity: "warning",
        location: loc(polished, index),
        evidence: `中文数字统计表述「${token}」,建议改用阿拉伯数字`,
        fixHint: token.startsWith("百分之")
          ? `「${token}」改为百分比数字(如 30%)`
          : `「${token}」改为阿拉伯数字(如 三年 → 3 年);全文数据格式保持统一`,
      });
    }
  }
  return issues;
}
