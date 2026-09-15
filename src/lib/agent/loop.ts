/**
 * Agent 循环编排 —— draft → 确定性检查 → LLM 审查 → (修订) → 收尾
 *
 * 硬约束(方案 §2.4/§5):
 * - MAX_ITERATIONS = 2,循环不收敛就带着残留 issue 如实返回,不假装通过
 * - 时间预算制:超 LOOP_DEADLINE 后不再修订,超 FINALIZE_DEADLINE 后跳过评分/面试建议
 * - reviewer 失败不阻断(代码检查已过则视为通过),draft 失败才终止
 */
import { callDeepSeek } from "../deepseek";
import { runAllChecks, hasBlocker } from "./checks";
import { reviewPolishedDraft } from "./reviewer";
import {
  buildAgentDraftMessages,
  buildInterviewPrepMessages,
  buildResumeScoreMessages,
} from "./prompts";
import {
  parseJSONLoose,
  DraftResultSchema,
  InterviewPrepSchema,
  ResumeScoreSchema,
  type AgentIssue,
  type AgentResultPayload,
  type DraftResult,
  type ReviewIssue,
} from "./schemas";
import type { TemplateId } from "../templates";
import type { FormatId } from "../resumeFormats";
import { topKeywordHints } from "../kwStore";

export interface AgentRunInput {
  resume: string;
  jd: string;
  templateId: TemplateId;
  formatId: FormatId;
  /** 公司调研上下文(前端可选传入,来自 /api/research/company) */
  companyContext?: string;
}

export type AgentStage = "draft" | "checks" | "review" | "revise" | "finalize";
export type Emit = (event: string, data: unknown) => void;

const MAX_ITERATIONS = 2; // 最多 3 轮(0,1,2)
const LOOP_DEADLINE_MS = 40_000; // 超时后不再修订
const FINALIZE_DEADLINE_MS = 38_000; // 超时后跳过评分/面试建议

/** 起草一次(或修订一次),带 JSON 解析失败重试(与旧 route 相同的两段式策略) */
async function draftOnce(
  input: AgentRunInput,
  extras: { keywordHints: string[] },
  revise?: { issues: AgentIssue[]; previousDraft: string }
): Promise<DraftResult> {
  const messages = buildAgentDraftMessages(input.resume, input.jd, input.templateId, input.formatId, revise, {
    keywordHints: extras.keywordHints,
    companyContext: input.companyContext,
  });
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const attemptMessages =
      attempt === 0
        ? messages
        : [
            ...messages,
            {
              role: "user" as const,
              content:
                "上一次输出未能通过 JSON 校验。请重新输出完整结果：只输出一个 JSON 对象；changes 最多 8 条、suggestions 最多 5 条，其余字段保持精简，确保在长度限制内完整输出。",
            },
          ];
    try {
      const raw = await callDeepSeek(attemptMessages, {
        temperature: attempt === 0 ? 0.7 : 0.4,
        maxTokens: 8192,
        jsonMode: true,
      });
      const result = DraftResultSchema.safeParse(parseJSONLoose(raw));
      if (result.success) return result.data;
      lastError = result.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`润色结果解析失败: ${String(lastError).slice(0, 200)}`);
}

function reviewIssuesToAgent(review: ReviewIssue[]): AgentIssue[] {
  return review.map((i) => ({
    check: i.type,
    severity: i.severity,
    location: i.location,
    evidence: i.evidence,
    fixHint: i.fixHint,
    source: "review" as const,
  }));
}

/**
 * 运行完整 agent 循环,通过 emit 推送 SSE 事件:
 *   stage  {stage, iteration, status}
 *   issues {iteration, verdict, blockerCount, warningCount}
 *   result {AgentResultPayload}
 *   error  {message}
 */
export async function runAgentLoop(input: AgentRunInput, emit: Emit): Promise<void> {
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;

  try {
    // 词库高频词注入(存储故障时静默降级为空,不阻断主流程)
    const extras = { keywordHints: await topKeywordHints() };

    emit("stage", { stage: "draft", iteration: 0, status: "start" });
    let draft = await draftOnce(input, extras);
    emit("stage", { stage: "draft", iteration: 0, status: "done" });

    let iteration = 0;
    let finalIssues: AgentIssue[] = [];
    let passed = false;

    for (; iteration <= MAX_ITERATIONS; iteration++) {
      // ① 确定性检查(纯代码,零成本,先跑——有 blocker 就不用花 LLM 调用)
      emit("stage", { stage: "checks", iteration, status: "start" });
      const codeIssues = runAllChecks({
        original: input.resume,
        jd: input.jd,
        polished: draft.polishedResume,
        matchedKeywords: draft.matchedKeywords,
        templateId: input.templateId,
      });
      let allIssues: AgentIssue[] = codeIssues.map((i) => ({ ...i, source: "code" as const }));
      emit("stage", { stage: "checks", iteration, status: "done" });

      // ② LLM 对抗审查(仅在代码检查全绿、且时间预算内时执行)
      if (!hasBlocker(codeIssues) && elapsed() < LOOP_DEADLINE_MS) {
        emit("stage", { stage: "review", iteration, status: "start" });
        try {
          const verdict = await reviewPolishedDraft(input.resume, input.jd, draft.polishedResume, draft.changes);
          allIssues = allIssues.concat(reviewIssuesToAgent(verdict.issues));
        } catch {
          // reviewer 失败不阻断:代码检查已通过,按通过处理
        }
        emit("stage", { stage: "review", iteration, status: "done" });
      }

      const blockers = allIssues.filter((i) => i.severity === "blocker");
      passed = blockers.length === 0;
      finalIssues = allIssues;
      emit("issues", {
        iteration,
        verdict: passed ? "pass" : "revise",
        blockerCount: blockers.length,
        warningCount: allIssues.length - blockers.length,
      });

      // ③ 通过 / 达上限 / 超时 → 结束循环;否则带着问题清单修订
      if (passed || iteration === MAX_ITERATIONS || elapsed() > LOOP_DEADLINE_MS) break;

      emit("stage", { stage: "revise", iteration, status: "start" });
      draft = await draftOnce(input, extras, { issues: allIssues, previousDraft: draft.polishedResume });
      emit("stage", { stage: "revise", iteration, status: "done" });
    }

    // ④ 收尾:面试准备 + 评分拆成独立小调用并行(小输出不再截断;时间不够则跳过)
    let interviewPrep: AgentResultPayload["interviewPrep"];
    let resumeScore: AgentResultPayload["resumeScore"];
    if (elapsed() < FINALIZE_DEADLINE_MS) {
      emit("stage", { stage: "finalize", iteration, status: "start" });
      const [prep, score] = await Promise.all([
        callDeepSeek(buildInterviewPrepMessages(input.resume, input.jd, draft.polishedResume), {
          temperature: 0.6,
          maxTokens: 2048,
          jsonMode: true,
        })
          .then((raw) => InterviewPrepSchema.safeParse(parseJSONLoose(raw)))
          .then((r) => (r.success ? r.data : undefined))
          .catch(() => undefined),
        callDeepSeek(buildResumeScoreMessages(input.resume, input.jd, draft.polishedResume), {
          temperature: 0.3,
          maxTokens: 800,
          jsonMode: true,
        })
          .then((raw) => ResumeScoreSchema.safeParse(parseJSONLoose(raw)))
          .then((r) => (r.success ? r.data : undefined))
          .catch(() => undefined),
      ]);
      interviewPrep = prep;
      resumeScore = score;
      emit("stage", { stage: "finalize", iteration, status: "done" });
    }

    emit("result", {
      polishedResume: draft.polishedResume,
      changes: draft.changes,
      jdKeywords: draft.jdKeywords,
      matchedKeywords: draft.matchedKeywords,
      missingKeywords: draft.missingKeywords,
      suggestions: draft.suggestions,
      interviewPrep,
      resumeScore,
      reviewReport: {
        iterations: iteration + 1,
        passed,
        issues: finalIssues,
        elapsedMs: elapsed(),
      },
    } satisfies AgentResultPayload);
  } catch (e) {
    emit("error", { message: e instanceof Error ? e.message : "未知错误" });
  }
}
