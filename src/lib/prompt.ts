import type { ChatMessage } from "./deepseek";
import { buildSystemPrompt, type TemplateId } from "./templates";
import { FORMATS, type FormatId } from "./resumeFormats";

/**
 * 构建简历润色的系统提示词 + 用户提示词
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

${format.formatPrompt}`;

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
