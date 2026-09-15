/**
 * Agent 侧类型与 Zod schema
 * 见 docs/agent-refactor-plan.md §2.3
 */
import { z } from "zod";

/** 代码检查器的 Issue(与 checks.ts 保持同构,这里只做引用转发) */
export type { Issue as CodeIssue, CheckName } from "./checks";

/** LLM reviewer 的 issue 类型枚举 */
export const REVIEW_ISSUE_TYPES = [
  "fabrication", // 虚构经历/技能/数字
  "job_duty_copy", // 照搬 JD 职责句式
  "internal_codename", // 内部代号/feature号
  "jargon", // 外行看不懂的行业黑话
  "empty_bullets", // 职责流水账
  "changes_mismatch", // changes 与实际 diff 不符
  "summary_structure", // 简介不符合黄金结构
  "career_arc", // 读不出成长递进
  "project_context", // 项目三问缺失
  "value_anchor", // 个人价值模糊
] as const;

export const ReviewIssueSchema = z.object({
  type: z.enum(REVIEW_ISSUE_TYPES),
  severity: z.enum(["blocker", "warning"]),
  location: z.string(),
  evidence: z.string(),
  fixHint: z.string(),
});

export const ReviewVerdictSchema = z.object({
  verdict: z.enum(["pass", "revise"]),
  issues: z.array(ReviewIssueSchema).max(10),
  // 只列 grounding 存疑的陈述;已核实的不用列
  fabricationScan: z
    .array(z.object({ claim: z.string(), groundedInOriginal: z.boolean() }))
    .max(5)
    .default([]),
});

export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;

/** agent 起草阶段的输出(比旧路径少 interviewPrep/resumeScore,根治截断) */
export const DraftResultSchema = z.object({
  polishedResume: z.string().min(1),
  changes: z
    .array(z.object({ original: z.string(), modified: z.string(), reason: z.string() }))
    .default([]),
  jdKeywords: z.array(z.string()).default([]),
  matchedKeywords: z.array(z.string()).default([]),
  missingKeywords: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
});

export type DraftResult = z.infer<typeof DraftResultSchema>;

/** 面试准备(独立小调用) */
export const InterviewPrepSchema = z.object({
  likelyQuestions: z.array(z.string()).default([]),
  talkingPoints: z.array(z.string()).default([]),
  weakPoints: z.array(z.string()).default([]),
  starStories: z.array(z.union([z.string(), z.record(z.string(), z.string())])).default([]),
});

/** 评分(独立小调用) */
export const ResumeScoreSchema = z.object({
  total: z.number().min(0).max(100),
  dimensions: z
    .array(z.object({ name: z.string(), score: z.number(), comment: z.string() }))
    .default([]),
  summary: z.string().default(""),
  improvements: z.array(z.string()).default([]),
});

export type InterviewPrep = z.infer<typeof InterviewPrepSchema>;
export type ResumeScore = z.infer<typeof ResumeScoreSchema>;

/** 统一后的 issue(代码检查 + LLM 审查合并展示) */
export interface AgentIssue {
  check: string; // CheckName 或 ReviewIssue type
  severity: "blocker" | "warning";
  location: string;
  evidence: string;
  fixHint: string;
  source: "code" | "review";
}

export interface ReviewReport {
  iterations: number; // 实际执行的"生成→检查"轮数
  passed: boolean; // 最后一轮是否无 blocker
  issues: AgentIssue[]; // 最后一轮的全部 issue(含未修复的,如实展示)
  elapsedMs: number;
}

/** SSE result 事件负载(旧 PolishResult 的超集) */
export interface AgentResultPayload {
  polishedResume: string;
  changes: { original: string; modified: string; reason: string }[];
  jdKeywords: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
  suggestions: string[];
  interviewPrep?: InterviewPrep;
  resumeScore?: ResumeScore;
  reviewReport: ReviewReport;
}

/** 宽松 JSON 提取(与旧 polish route 的 extractJSON 同逻辑,抽出来共用) */
export function parseJSONLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        /* continue */
      }
    }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        /* continue */
      }
    }
  }
  throw new Error("无法从 AI 返回内容中解析 JSON");
}
