/**
 * 模型驱动的 tool-use agent 循环
 *
 * 控制权分配(与固定编排 loop.ts 的本质区别,也是"workflow vs agent"的边界):
 *   - 模型决定工作流:产出草稿、何时自检、何时请对抗审查、何时提交、被拒后如何修
 *   - 代码守住不可协商的不变量:
 *       ① submit_final 提交门禁——确定性检查器强制复检,有 blocker 一律拒回
 *       ② 步数上限与时间预算
 *       ③ 降级路径——模型未提交/调用失败时,退回单次起草(保证用户总拿得到结果)
 *
 * SSE 事件契约与固定编排完全一致(stage/issues/result/error),前端无感。
 */
import { generateText } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { runAllChecks, hasBlocker } from "./checks";
import { buildTools, type SubmitOutcome } from "./tools";
import { draftOnce, type AgentRunInput } from "./loop";
import { buildToolAgentSystemPrompt, buildInterviewPrepMessages, buildResumeScoreMessages } from "./prompts";
import { topKeywordHints } from "../kwStore";
import { callDeepSeek } from "../deepseek";
import {
  parseJSONLoose,
  InterviewPrepSchema,
  ResumeScoreSchema,
  type AgentIssue,
  type AgentResultPayload,
  type DraftResult,
} from "./schemas";

export type Emit = (event: string, data: unknown) => void;

const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY ?? "" });

const MAX_STEPS = 10; // 模型步数硬上限(含工具调用轮)
const TOOL_LOOP_DEADLINE_MS = 42_000; // 超时后不再进新步骤
const FINALIZE_DEADLINE_MS = 40_000; // 超时后跳过评分/面试建议

export async function runToolAgentLoop(input: AgentRunInput, emit: Emit): Promise<void> {
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;

  try {
    // 词库高频词注入(存储故障静默降级)
    const extras = { keywordHints: await topKeywordHints() };
    const messages = buildToolAgentSystemPrompt(input.resume, input.jd, input.templateId, extras);

    // 模型自主工作流的状态(由工具回调写入;用对象包装避免 TS 闭包收窄)
    const state = { submissions: 0, last: null as SubmitOutcome | null };
    const tools = buildTools({
      resume: input.resume,
      jd: input.jd,
      templateId: input.templateId,
      onSubmit: (outcome) => {
        state.submissions++;
        state.last = outcome;
        emit("issues", {
          iteration: state.submissions - 1,
          verdict: outcome.accepted ? "pass" : "revise",
          blockerCount: outcome.issues.filter((i) => i.severity === "blocker").length,
          warningCount: outcome.issues.filter((i) => i.severity === "warning").length,
        });
      },
      onProgress: (msg) => emit("stage", { stage: "agent", detail: msg, iteration: state.submissions, status: "start" }),
    });

    emit("stage", { stage: "draft", iteration: 0, status: "start" });

    // agent 调用失败(如 provider 异常)不终止:记下原因,走降级起草
    let agentError: string | null = null;
    try {
      const result = await generateText({
        model: deepseek("deepseek-chat"),
        temperature: 0.7,
        maxOutputTokens: 8192,
        system: messages[0].content,
        prompt: messages[1].content,
        tools,
        // 停止条件:已受理提交 / 步数耗尽 / 时间预算耗尽
        stopWhen: ({ steps }) => state.last?.accepted === true || steps.length >= MAX_STEPS || elapsed() > TOOL_LOOP_DEADLINE_MS,
      });
      void result.text; // 模型的说明文字(不展示,预留调试)
    } catch (e) {
      agentError = e instanceof Error ? e.message : String(e);
      emit("stage", { stage: "agent", detail: `agent 异常(${agentError.slice(0, 80)}),降级单次起草`, iteration: 0, status: "start" });
    }

    emit("stage", { stage: "draft", iteration: 0, status: "done" });

    // ── 结果归一:受理提交 / 带残留问题接受最后一次提交 / 降级单次起草 ──
    let draft: DraftResult;
    let passed: boolean;
    let finalIssues: AgentIssue[];
    let iterations: number;

    if (state.last) {
      // 有提交(受理或最后一次被拒):被拒时如实带出残留 blocker,不假装通过
      draft = state.last.draft;
      finalIssues = state.last.issues;
      passed = state.last.accepted;
      iterations = state.submissions;
    } else {
      // 模型始终未提交(或 agent 异常)→ 降级:单次起草 + 体检(保底产出)
      emit("stage", { stage: "revise", iteration: 0, status: "start", detail: agentError ? "agent 异常,降级单次起草" : "模型未提交终稿,降级单次起草" });
      draft = await draftOnce(input, extras);
      finalIssues = runAllChecks({
        original: input.resume,
        jd: input.jd,
        polished: draft.polishedResume,
        matchedKeywords: draft.matchedKeywords,
        templateId: input.templateId,
      }).map((i) => ({ ...i, source: "code" as const }));
      passed = !hasBlocker(finalIssues);
      iterations = 1;
      emit("stage", { stage: "revise", iteration: 0, status: "done" });
    }

    // ── 收尾:面试准备 + 评分(固定编排,不交给模型决定——成本/延迟门禁) ──
    let interviewPrep: AgentResultPayload["interviewPrep"];
    let resumeScore: AgentResultPayload["resumeScore"];
    if (elapsed() < FINALIZE_DEADLINE_MS) {
      emit("stage", { stage: "finalize", iteration: 0, status: "start" });
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
      emit("stage", { stage: "finalize", iteration: 0, status: "done" });
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
        iterations,
        passed,
        issues: finalIssues,
        elapsedMs: elapsed(),
        mode: "tool-agent" as const,
      },
    } satisfies AgentResultPayload);
  } catch (e) {
    emit("error", { message: e instanceof Error ? e.message : "未知错误" });
  }
}
