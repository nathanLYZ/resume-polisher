/**
 * ATS 筛选模拟 —— 确定性规则打分,模拟主流 ATS + HR 初筛管线
 *
 * 诚实边界(展示给用户的原则):
 * - 模拟的是"规则筛选"这一层(关键词命中/硬性条件/可解析性),不模拟语义排序与人眼判断
 * - 非任何真实商业 ATS(Greenhouse/Moka/北森…)的实现,分数仅供投递前自检
 *
 * 评分:关键词 40 + 硬性条件 30 + 可解析性 20 + 格式 10;无法评估的子项按中性分处理并在明细中说明。
 */
import {
  checkDateFormatConsistency,
  checkArabicNumerals,
  estimatePages,
  extractDates,
  keywordPresent,
} from "./agent/checks";
import { TECH_TERMS } from "./techTerms";

export type HardRequirementType = "years" | "degree" | "language";
export type RequirementStatus = "met" | "missing" | "unknown";

export interface HardRequirement {
  requirement: string;
  type: HardRequirementType;
  status: RequirementStatus;
  evidence?: string; // 简历中的匹配证据
}

export interface AtsScreenResult {
  score: number; // 0-100
  verdict: "likely_pass" | "borderline" | "likely_reject";
  keywords: {
    total: number;
    matched: string[];
    missing: string[];
    hitRate: number; // 0-1
    score: number; // /40
    source: "llm_keywords" | "builtin_lexicon"; // 关键词来源(LLM 润色产出 or 内置词库)
  };
  hardRequirements: {
    items: HardRequirement[];
    metRatio: number; // 可评估项中的满足率;无可评估项时为 -1
    score: number; // /30
    estimatedYears?: number;
  };
  parseability: {
    score: number; // /20
    checks: { name: string; ok: boolean; detail: string }[];
  };
  format: {
    score: number; // /10
    notes: string[];
  };
  summary: string;
}

const DEGREE_RANK: Record<string, number> = { "大专": 1, "专科": 1, "本科": 2, "研究生": 3, "硕士": 3, "博士": 4 };

// ---------------------------------------------------------------- 关键词

function collectJdKeywords(jd: string, extra?: string[]): string[] {
  const set = new Set<string>();
  // 内置技术词库 ∩ JD(大小写不敏感)
  const jdLower = jd.toLowerCase();
  for (const term of TECH_TERMS) {
    if (term.length >= 2 && jdLower.includes(term)) set.add(term);
  }
  // LLM 润色产出的 JD 关键词(若有)
  for (const kw of extra ?? []) {
    const k = kw?.trim();
    if (k && k.length >= 2) set.add(k);
  }
  return [...set];
}

// ---------------------------------------------------------------- 硬性条件

function jdRequireYears(jd: string): number | null {
  const m =
    jd.match(/(\d+)\s*年(?:以上|及以上)?[^。;；\n]{0,8}(?:经验|经历|工作)/) ??
    jd.match(/(?:经验|经历|工作)[^。;；\n]{0,8}?(\d+)\s*年/);
  return m ? Number(m[1]) : null;
}

function jdRequireDegree(jd: string): string | null {
  const m = jd.match(/(博士|硕士|研究生|本科|大专|专科)/);
  return m ? m[1] : null;
}

function jdRequireLanguage(jd: string): string | null {
  const m = jd.match(/(英语专业八级|英语六级|CET-?6|英语四级|CET-?4|英语听说读写|流利英语|良好的英语)/);
  return m ? m[1] : null;
}

function resumeHighestDegree(resume: string): string | null {
  const ranks = Object.entries(DEGREE_RANK)
    .filter(([deg]) => resume.includes(deg))
    .sort((a, b) => b[1] - a[1]);
  return ranks[0]?.[0] ?? null;
}

/** 经历年限:按时间跨度估算;教育背景行的年份不计入工龄(学历时间≠工作时间) */
function estimateYearsResume(resume: string): number | null {
  // 剔除教育背景所在行的日期(按行扫,含"教育/学历/大学/学院/学校"的行跳过)
  const workLines = resume
    .split("\n")
    .filter((l) => !/教育|学历|大学|学院|学校|硕士|本科|大专/.test(l));
  const { points } = extractDates(workLines.join("\n"));
  if (points.length === 0) return null;
  const toNum = (p: { year: number; month?: number }) => p.year + ((p.month ?? 1) - 1) / 12;
  const span = Math.max(...points.map(toNum)) - Math.min(...points.map(toNum));
  return span > 0.3 ? Math.round(span * 10) / 10 : null;
}

// ---------------------------------------------------------------- 主入口

export function screenResume(
  resume: string,
  jd: string,
  opts?: { jdKeywords?: string[]; keywordHints?: string[] }
): AtsScreenResult {
  // ① 关键词(40)
  const keywords = collectJdKeywords(jd, opts?.jdKeywords);
  const source: "llm_keywords" | "builtin_lexicon" = (opts?.jdKeywords?.length ?? 0) > 0 ? "llm_keywords" : "builtin_lexicon";
  const matched = keywords.filter((kw) => keywordPresent(kw, resume));
  const missing = keywords.filter((kw) => !keywordPresent(kw, resume));
  const hitRate = keywords.length ? matched.length / keywords.length : -1;
  const keywordScore = keywords.length === 0 ? 24 : Math.round(40 * (0.15 + 0.85 * hitRate)); // 无可提取关键词给中性偏下分

  // ② 硬性条件(30)
  const items: HardRequirement[] = [];
  const estYears = estimateYearsResume(resume);
  const reqYears = jdRequireYears(jd);
  if (reqYears !== null) {
    items.push(
      estYears === null
        ? { requirement: `${reqYears} 年以上相关经验`, type: "years", status: "unknown", evidence: "简历中未解析出可计算的时间线" }
        : estYears >= reqYears
          ? { requirement: `${reqYears} 年以上相关经验`, type: "years", status: "met", evidence: `检测到约 ${estYears} 年经历跨度` }
          : { requirement: `${reqYears} 年以上相关经验`, type: "years", status: "missing", evidence: `检测到约 ${estYears} 年,低于要求` }
    );
  }
  const reqDegree = jdRequireDegree(jd);
  if (reqDegree !== null) {
    const have = resumeHighestDegree(resume);
    items.push(
      have === null
        ? { requirement: `学历要求:${reqDegree}`, type: "degree", status: "unknown", evidence: "简历中未识别学历信息" }
        : DEGREE_RANK[have] >= DEGREE_RANK[reqDegree]
          ? { requirement: `学历要求:${reqDegree}`, type: "degree", status: "met", evidence: `简历学历:${have}` }
          : { requirement: `学历要求:${reqDegree}`, type: "degree", status: "missing", evidence: `简历学历:${have},低于要求` }
    );
  }
  const reqLang = jdRequireLanguage(jd);
  if (reqLang !== null) {
    const langOk = /CET-?6|英语六级/.test(reqLang)
      ? /CET-?6|英语六级|专业八级|英语流利|流利英语|英文流利/.test(resume)
      : /CET-?4|四级|英语六级|CET-?6|专业八级|英语流利|流利英语|良好的英语|英文流利/.test(resume);
    items.push({
      requirement: `语言要求:${reqLang}`,
      type: "language",
      status: langOk ? "met" : /四级|六级|CET|英语/.test(resume) ? "met" : "unknown",
      evidence: langOk ? "简历中包含英语能力表述" : "简历中未识别英语能力表述",
    });
  }
  const evaluable = items.filter((i) => i.status !== "unknown");
  const metRatio = evaluable.length ? evaluable.filter((i) => i.status === "met").length / evaluable.length : -1;
  const hardScore = evaluable.length === 0 ? 21 : Math.round(30 * (0.1 + 0.9 * metRatio));

  // ③ 可解析性(20)
  const hasEmail = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(resume);
  const hasPhone = /1[3-9]\d{9}/.test(resume.replace(/[\s-]/g, ""));
  const sectionCount = ["教育", "工作经历", "项目", "技能"].filter((k) => new RegExp(k).test(resume)).length;
  const { points } = extractDates(resume);
  const len = resume.trim().length;
  const parseChecks = [
    { name: "联系方式-邮箱", ok: hasEmail, detail: hasEmail ? "可提取" : "未找到邮箱(ATS 无法回联)" },
    { name: "联系方式-手机", ok: hasPhone, detail: hasPhone ? "可提取" : "未找到 11 位手机号" },
    { name: "标准分区", ok: sectionCount >= 3, detail: `识别出 ${sectionCount}/4 个标准分区(教育/工作经历/项目/技能)` },
    { name: "经历可定位时间", ok: points.length >= 2, detail: `解析出 ${points.length} 个时间点` },
    { name: "篇幅合理", ok: len >= 150 && len <= 4000, detail: `${len} 字(过短信息不足,过长难以入库)` },
  ];
  const parseScore = Math.round((20 * parseChecks.filter((c) => c.ok).length) / parseChecks.length);

  // ④ 格式(10):篇幅估算 + 日期一致性 + 阿拉伯数字
  const notes: string[] = [];
  let formatScore = 10;
  const pages = estimatePages(resume);
  if (pages > 2.05) {
    formatScore -= 4;
    notes.push(`预计 ${pages.toFixed(1)} 页,超出 2 页`);
  }
  const dateIssues = checkDateFormatConsistency(resume);
  if (dateIssues.length > 0) {
    formatScore -= 3;
    notes.push(dateIssues[0].evidence);
  }
  const cnIssues = checkArabicNumerals(resume);
  if (cnIssues.length > 0) {
    formatScore -= 3;
    notes.push(`存在中文数字统计表述(${cnIssues.length} 处)`);
  }
  if (formatScore < 0) formatScore = 0;

  const score = Math.max(0, Math.min(100, keywordScore + hardScore + parseScore + formatScore));
  const verdict = score >= 75 ? "likely_pass" : score >= 55 ? "borderline" : "likely_reject";
  const summary =
    verdict === "likely_pass"
      ? `关键词命中 ${Math.round(hitRate * 100)}%,硬性条件${evaluable.length ? `满足率 ${Math.round(metRatio * 100)}%` : "无明显缺口"},通过初筛概率较高`
      : verdict === "borderline"
        ? `部分条件待补:${missing.length > 0 ? `缺 ${missing.slice(0, 3).join("、")} 等关键词` : "细节可优化"},建议针对性修订`
        : `初筛通过概率低:${missing.length > 0 ? `缺 ${missing.slice(0, 3).join("、")} 等关键词` : "信息不足"}${evaluable.some((i) => i.status === "missing") ? ",存在未满足的硬性条件" : ""},重点补齐后再投递`;

  return {
    score,
    verdict,
    keywords: { total: keywords.length, matched, missing, hitRate: Math.max(hitRate, 0), score: keywordScore, source },
    hardRequirements: { items, metRatio, score: hardScore, estimatedYears: estYears ?? undefined },
    parseability: { score: parseScore, checks: parseChecks },
    format: { score: formatScore, notes },
    summary,
  };
}
