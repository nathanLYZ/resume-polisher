import type { ChatMessage } from "./deepseek";
import { buildSystemPrompt, type TemplateId } from "./templates";
import { FORMATS, type FormatId } from "./resumeFormats";

/**
 * 构建简历润色的系统提示词 + 用户提示词
 *
 * 2026-09-16 修复:旧规格一次要求模型输出「简历全文+changes+关键词+面试准备+评分」,
 * 长简历在 8192 token 上限内必然截断 → JSON 解析死循环。改为小输出规格
 * (对齐 agent 路径的 draftJsonSpec:不含 interviewPrep/resumeScore);
 * 面试准备与评分由前端深度模式补齐,简单模式下对应 Tab 自动隐藏。
 * @param resume 简历原文
 * @param jd JD 原文
 * @param templateId 润色风格模板
 * @param formatId 输出格式模板
 */
export function buildPolishPrompt(
  resume: string,
  jd: string,
  templateId: TemplateId = "professional",
  formatId: FormatId = "classic"
): ChatMessage[] {
  const systemPrompt = buildSystemPrompt(templateId);
  const format = FORMATS[formatId] || FORMATS.classic;

  const fullSystemPrompt = `${systemPrompt}

${format.formatPrompt}

## 输出范围调整（重要）

本次只输出以下字段，不输出 interviewPrep 与 resumeScore（由后续独立流程生成）：
{"polishedResume":"润色后的完整简历文本","changes":[{"original":"...","modified":"...","reason":"..."}],"jdKeywords":[...],"matchedKeywords":[...],"missingKeywords":[...],"suggestions":[...]}

- **matchedKeywords 硬约束**：列出的每个词必须在 polishedResume 文本中逐字出现。
- changes 最多 10 条，只记录实质性修改。`;

  const userPrompt = `请根据以下目标职位描述，润色我的简历。

## 目标职位描述 (JD)
---
${jd}
---

## 我的简历
---
${resume}
---

请按照系统提示中的JSON格式输出润色结果。`;

  return [
    { role: "system", content: fullSystemPrompt },
    { role: "user", content: userPrompt },
  ];
}
