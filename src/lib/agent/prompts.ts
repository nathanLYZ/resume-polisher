/**
 * Agent 侧 prompt 构建
 *
 * 与旧路径(lib/prompt.ts)的差异:
 * 1. 起草阶段只输出简历正文 + changes + 关键词(不再一次性输出面试建议和评分 → 根治截断)
 * 2. 支持"修订模式":带着上一版稿子和审查问题清单重写
 * 3. 追加共享规则块(方法论 7-11,来源:招聘方宣讲的 9 条简历问题,见方案 §2.7)
 * 4. 面试准备 / 评分拆成独立小调用
 */
import type { ChatMessage } from "../deepseek";
import { buildCorePrompt, type TemplateId } from "../templates";
import { FORMATS, type FormatId } from "../resumeFormats";
import type { AgentIssue } from "./schemas";

/** 共享规则块:接续 buildCorePrompt 里的"通用方法论"编号,对所有风格模板生效 */
const SHARED_RULES = `

## 通用方法论（续，所有风格模板生效）

7. **成长弧线**：工作经历分段呈现、按时间倒序，让 HR 能读出职责范围与级别的递进；平级平行的经历合并，或突出相互差异。
8. **项目三问**：每个项目回答——个人价值/里程碑在哪？难度体现在哪（规模/复杂度/0-1/跨团队）？业务与市场背景是什么？三者至少写出一项，全无的项目压缩或删除。
9. **外行可读**：HR 不是你行业内的人。内部项目代号改为能力方向命名，行业缩写首次出现时给一句白话解释。
10. **克制年龄与工龄**：不新增年龄表述；总结中总年限最多出现一次，项目经历中不重复堆叠年限。
11. **中文简历不夹英文**：技术名词（Java、K8s、SQL）保留，其余口语性英文一律换中文表达。

（红线约束依旧生效：规则 8/9 的难度与业务背景只能从原文事实提炼，原文没有的写进 suggestions，绝不虚构。）`;

/** 起草/修订阶段的输出规格(比旧路径小:无 interviewPrep/resumeScore) */
function draftJsonSpec(templateId: TemplateId): string {
  return `

输出格式要求（严格遵守）：
你必须以 JSON 格式返回，不要包含任何额外的文字说明、不要用 markdown 代码块包裹。返回结构如下：

{
  "polishedResume": "润色后的完整简历文本（纯文本，保留原有结构和段落）",
  "changes": [
    {"original": "被修改的原文片段", "modified": "修改后的片段", "reason": "简要说明为什么这样改（1句话）"}
  ],
  "jdKeywords": ["JD中的核心关键词"],
  "matchedKeywords": ["简历中已覆盖的JD关键词"],
  "missingKeywords": ["简历中缺失但JD中重要的关键词"],
  "suggestions": ["针对缺失关键词的具体建议"]
}

注意：
- 本次不输出 interviewPrep 与 resumeScore（由后续独立步骤生成），省下的篇幅用于把简历正文写完整。
- changes 数组只记录实质性修改，不记录标点微调，最多10条。
- **matchedKeywords 是硬约束**：列为 matched 的词必须在 polishedResume 文本中逐字出现，否则会被确定性检查器拦截打回重做。
- 数字只能来自原文，绝不虚构百分比、金额、用户量；原文缺少量化数据时写进 suggestions。
- 严禁照搬 JD 的职责描述句式；只允许在真实经历基础上借用关键词。${
    templateId === "english" ? "\n- changes 中的 original 用原文中文，modified 用英文翻译。" : ""
  }`;
}

function userContent(resume: string, jd: string): string {
  return `请根据以下目标职位描述，润色我的简历。

## 目标职位描述 (JD)
---
${jd}
---

## 我的简历
---
${resume}
---

请按照系统提示中的JSON格式输出润色结果。`;
}

/** 起草额外上下文:关键词库高频词 + 公司调研 */
export interface DraftExtras {
  keywordHints?: string[];
  companyContext?: string;
}

/** 起草(或带 issues 的修订)消息 */
export function buildAgentDraftMessages(
  resume: string,
  jd: string,
  templateId: TemplateId,
  formatId: FormatId,
  revise?: { issues: AgentIssue[]; previousDraft: string },
  extras?: DraftExtras
): ChatMessage[] {
  const format = FORMATS[formatId] || FORMATS.classic;
  const hintsBlock = extras?.keywordHints?.length
    ? `

## 跨岗位高频关键词（来自个人关键词库，多岗位反复要求的词）
若与候选人真实经历相符，优先将这些词自然落入对应经历与技能（红线依旧：无相关经历的词不硬凑）：
${extras.keywordHints.join("、")}`
    : "";
  const companyBlock = extras?.companyContext
    ? `

## 目标公司调研（供背景与术语对齐，仅用于校准表达，不得据此虚构候选人经历）
${extras.companyContext}`
    : "";
  const system = `${buildCorePrompt(templateId)}${SHARED_RULES}${hintsBlock}${companyBlock}\n\n${format.formatPrompt}${draftJsonSpec(templateId)}`;

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: userContent(resume, jd) },
  ];

  if (revise) {
    const issueList = revise.issues
      .slice(0, 12)
      .map((i, n) => {
        const src = i.source === "code" ? "确定性检查" : "AI审查";
        return `${n + 1}. [${i.severity === "blocker" ? "硬伤" : "提示"}][${src}] ${i.evidence}\n   修复要求：${i.fixHint}`;
      })
      .join("\n");
    messages.push({
      role: "user",
      content: `上一轮的润色稿未通过审查，发现以下问题，请修订：

${issueList}

## 上一版润色稿
---
${revise.previousDraft}
---

只针对上述问题修订，其余内容尽量保持不变。仍然只输出修订后的完整 JSON（结构同系统提示）。`,
    });
  }

  return messages;
}

/** 面试准备(独立小调用,输出小、失败可单独重试) */
export function buildInterviewPrepMessages(resume: string, jd: string, polished: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是一位资深的面试教练。基于候选人的真实简历与目标 JD 生成面试准备材料。所有内容必须基于简历原文和润色稿中的真实经历，绝不编造。

以 JSON 格式返回（不要 markdown 包裹）：
{"likelyQuestions":["面试官最可能问的3-5个问题"],"talkingPoints":["应重点展开的经历/能力及怎么讲,2-3条"],"weakPoints":["可能被追问的薄弱点及应对,2-3条"],"starStories":[{"situation":"背景","task":"任务","action":"行动","result":"成果"}]}`,
    },
    {
      role: "user",
      content: `## JD\n---\n${jd}\n---\n\n## 简历原文\n---\n${resume}\n---\n\n## 润色稿\n---\n${polished}\n---`,
    },
  ];
}

/** 简历评分(独立小调用) */
export function buildResumeScoreMessages(resume: string, jd: string, polished: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是一位严格的简历评审。对润色后的简历打分。

以 JSON 格式返回（不要 markdown 包裹）：
{"total":0-100整数,"dimensions":[{"name":"JD匹配度|量化程度|表达专业度|经历深度|完整度","score":0-100,"comment":"一句评语"}],"summary":"整体评价1-2句","improvements":["3条具体改进建议"]}`,
    },
    {
      role: "user",
      content: `## JD\n---\n${jd}\n---\n\n## 简历原文(事实基准)\n---\n${resume}\n---\n\n## 润色稿\n---\n${polished}\n---`,
    },
  ];
}
