/**
 * Agent 工具定义 —— 模型驱动的 tool-use 循环
 *
 * 与 Day 2 固定编排 loop.ts 的本质区别:流程控制权交给模型——何时自检、
 * 何时请对抗审查、何时提交、被拒后如何修,由模型按草稿质量自主决定;
 * 代码只守不可协商的不变量:submit_final 提交时确定性检查器强制复检,
 * 有 blocker 一律拒回(见 docs/agent-refactor-plan.md §8)。
 *
 * 工具保持无状态;提交结果与进度经回调交给编排层(toolLoop.ts)。
 */
import { tool } from "ai";
import { z } from "zod";
import { runAllChecks, hasBlocker } from "./checks";
import { reviewPolishedDraft } from "./reviewer";
import type { AgentIssue, DraftResult } from "./schemas";

export interface SubmitOutcome {
  accepted: boolean;
  draft: DraftResult;
  issues: AgentIssue[];
}

export interface ToolContext {
  resume: string;
  jd: string;
  templateId: string;
  onSubmit: (outcome: SubmitOutcome) => void;
  onProgress?: (msg: string) => void;
}

function codeIssues(resume: string, jd: string, templateId: string, polished: string, matched: string[]): AgentIssue[] {
  return runAllChecks({ original: resume, jd, polished, matchedKeywords: matched, templateId }).map((i) => ({
    ...i,
    source: "code" as const,
  }));
}

export function buildTools(ctx: ToolContext) {
  return {
    /** 自检:确定性检查器(免费,鼓励多用) */
    check_draft: tool({
      description:
        "对当前草稿跑 8 项确定性体检(数字守恒/时间线/JD照搬/关键词覆盖/结构/关键词实词化/年龄工龄/中英夹杂)。零成本,每次修改后建议自检。返回 blocker/warning 明细与修复指令。",
      inputSchema: z.object({
        polishedResume: z.string().min(1).describe("当前草稿的润色后简历全文"),
        matchedKeywords: z.array(z.string()).describe("声称已覆盖的JD关键词"),
      }),
      execute: async ({ polishedResume, matchedKeywords }) => {
        const issues = codeIssues(ctx.resume, ctx.jd, ctx.templateId, polishedResume, matchedKeywords);
        const blockerCount = issues.filter((i) => i.severity === "blocker").length;
        ctx.onProgress?.(`自检:${blockerCount} 硬伤 / ${issues.length - blockerCount} 提示`);
        return {
          passed: !hasBlocker(issues),
          blockerCount,
          warningCount: issues.length - blockerCount,
          issues,
        };
      },
    }),

    /** 对抗审查(LLM,一次调用;建议 check_draft 通过后再用) */
    adversarial_review: tool({
      description:
        "请独立的对抗式审查员审查当前草稿(虚构经历/照搬JD/内部代号/外行可读性/职责流水账等)。建议 check_draft 通过后再调用。返回 issues 与修复指令。",
      inputSchema: z.object({
        polishedResume: z.string().min(1),
        changes: z.array(z.object({ original: z.string(), modified: z.string(), reason: z.string() })),
      }),
      execute: async ({ polishedResume, changes }) => {
        try {
          const verdict = await reviewPolishedDraft(ctx.resume, ctx.jd, polishedResume, changes);
          const issues: AgentIssue[] = verdict.issues.map((i) => ({
            check: i.type,
            severity: i.severity,
            location: i.location,
            evidence: i.evidence,
            fixHint: i.fixHint,
            source: "review" as const,
          }));
          ctx.onProgress?.(`对抗审查:${verdict.verdict === "pass" ? "通过" : `${issues.filter((i) => i.severity === "blocker").length} 个 blocker`}`);
          return { verdict: verdict.verdict, issues };
        } catch (e) {
          // 审查器故障不阻断:如实告知模型,由它决定继续修订还是直接提交
          return {
            verdict: "pass",
            issues: [] as AgentIssue[],
            note: `审查器暂不可用(${e instanceof Error ? e.message.slice(0, 100) : "未知错误"}),本轮跳过`,
          };
        }
      },
    }),

    /** 提交终稿(代码强制复检 —— 不可协商的不变量) */
    submit_final: tool({
      description:
        "提交终稿。服务端会强制复检 8 项确定性检查:仍有 blocker 则拒回并返回问题清单,需修复后重新提交。请确保已通过 check_draft 或已修复全部 blocker。",
      inputSchema: z.object({
        polishedResume: z.string().min(1),
        changes: z.array(z.object({ original: z.string(), modified: z.string(), reason: z.string() })),
        jdKeywords: z.array(z.string()),
        matchedKeywords: z.array(z.string()),
        missingKeywords: z.array(z.string()),
        suggestions: z.array(z.string()),
      }),
      execute: async (full) => {
        const issues = codeIssues(ctx.resume, ctx.jd, ctx.templateId, full.polishedResume, full.matchedKeywords);
        const blockers = issues.filter((i) => i.severity === "blocker");
        const outcome: SubmitOutcome = {
          accepted: blockers.length === 0,
          draft: full,
          issues,
        };
        ctx.onSubmit(outcome);
        if (!outcome.accepted) {
          ctx.onProgress?.(`提交被拒:${blockers.length} 个硬伤未修复`);
          return {
            accepted: false,
            rejection: `终稿仍有 ${blockers.length} 个 blocker,不能通过。请按以下 issue 的 fixHint 修订后重新提交:`,
            issues,
          };
        }
        ctx.onProgress?.("终稿提交通过");
        return { accepted: true, issues, note: "终稿已通过全部确定性检查" };
      },
    }),
  };
}

export type AgentTools = ReturnType<typeof buildTools>;
