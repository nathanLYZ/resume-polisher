/**
 * LLM Reviewer —— 对抗式审查角色
 *
 * 设计原则(方案 §2.1):
 * - 角色隔离:reviewer 不看 drafter 的指令,只看「原文 + JD + 润色稿 + changes」,
 *   避免自我合理化
 * - 只在代码检查全绿后调用(省调用)
 * - 输出走 zod 校验,失败带错误信息重试一次
 */
import { callDeepSeek, type ChatMessage } from "../deepseek";
import { parseJSONLoose, ReviewVerdictSchema, type ReviewVerdict } from "./schemas";

const REVIEW_SYSTEM = `你是一名对抗式简历审查员。你面前有三份材料：简历原文（事实基准）、目标 JD、以及一份"AI 润色后的简历"。你的任务是找出润色稿的问题，只报告、不修改。假设润色者会为了好看而夸大，逐条对照原文验证。

## 审查清单（逐条对照原文验证，不要凭感觉打分）

- fabrication：润色稿中新增的经历/技能/项目/学历/数字，在原文中找不到锚点
- job_duty_copy：把 JD 的职责描述句式照搬进简历（换了词但结构/表述明显来自 JD 也算）
- internal_codename：内部项目代号、feature 号、只有公司内部人懂的命名
- jargon：外行 HR 看不懂的行业黑话/缩写，且无一句白话解释
- empty_bullets："负责开发""参与测试"式纯职责流水账，说不出带来什么改变
- changes_mismatch：润色稿声称的修改清单与实际文本改动不符
- summary_structure：个人简介不符合"身份定位+技术栈+代表经历(带数字)+价值"结构
- career_arc：工作经历读不出职责范围/级别的成长递进
- project_context：项目缺少业务背景、难度显性化、个人价值锚点（项目三问至少占其一）
- value_anchor：项目描述与个人贡献模糊，读不出候选人本人的价值

## severity 规则

- fabrication / job_duty_copy / internal_codename / jargon → blocker
- 其余 → warning
- 没有问题就返回空 issues 数组与 verdict=pass，不要为了凑数而报告，也不要重复报告同一问题。

## 输出格式

以 JSON 返回（不要 markdown 包裹，不要额外文字）：
{"verdict":"pass或revise","issues":[{"type":"清单中的类型","severity":"blocker或warning","location":"问题位置","evidence":"命中的具体内容","fixHint":"给润色者的修改指令"}],"fabricationScan":[{"claim":"可疑陈述","groundedInOriginal":false}]}

- issues 最多 10 条，按严重程度排序。
- fabricationScan 只列 grounding 存疑的陈述（最多 5 条），已核实的不用列。`;

export async function reviewPolishedDraft(
  resume: string,
  jd: string,
  polishedResume: string,
  changes: { original: string; modified: string; reason: string }[]
): Promise<ReviewVerdict> {
  const messages: ChatMessage[] = [
    { role: "system", content: REVIEW_SYSTEM },
    {
      role: "user",
      content: `## 简历原文（事实基准）
---
${resume}
---

## 目标 JD
---
${jd}
---

## 润色稿（待审查）
---
${polishedResume}
---

## 润色稿声称的修改清单
${JSON.stringify(changes)}`,
    },
  ];

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const attemptMessages: ChatMessage[] =
      attempt === 0
        ? messages
        : [
            ...messages,
            {
              role: "user" as const,
              content: `上一次输出未能通过 JSON 校验（${String(lastError)}）。请重新只输出一个 JSON 对象，结构为 {"verdict":"pass|revise","issues":[...],"fabricationScan":[...]}，type 必须取自审查清单中的十个类型。`,
            },
          ];
    try {
      const raw = await callDeepSeek(attemptMessages, {
        temperature: 0.2,
        maxTokens: 2048,
        jsonMode: true,
      });
      const result = ReviewVerdictSchema.safeParse(parseJSONLoose(raw));
      if (result.success) return result.data;
      lastError = result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`审查结果解析失败: ${String(lastError).slice(0, 200)}`);
}
