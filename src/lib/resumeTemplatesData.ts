/**
 * 简历填写模版
 * 用户选择模版后，填入自己的信息，生成结构化简历文本
 * 然后可以一键填入润色输入框，配合JD润色
 */

export type ResumeTemplateId =
  | "senior-engineer"   // 资深工程师（结合思路说明文档）
  | "tech-management"   // 技术管理
  | "general-professional" // 通用专业
  | "blank";             // 空白模版

export interface ResumeField {
  key: string;
  label: string;
  type: "text" | "textarea" | "list";
  placeholder: string;
  required?: boolean;
  /** 列表项的前缀提示 */
  itemHint?: string;
  /** 默认行数 */
  rows?: number;
  /** 默认列表项数量 */
  itemCount?: number;
}

export interface ResumeTemplateData {
  id: ResumeTemplateId;
  name: string;
  description: string;
  icon: string;
  fields: ResumeField[];
}

export const RESUME_TEMPLATES: Record<ResumeTemplateId, ResumeTemplateData> = {
  "senior-engineer": {
    id: "senior-engineer",
    name: "资深工程师",
    description: "结合思路说明，社招资深定位，量化成就，可迁移能力",
    icon: "💼",
    fields: [
      { key: "name", label: "姓名", type: "text", placeholder: "张三", required: true },
      { key: "contact", label: "联系方式", type: "text", placeholder: "手机 | 邮箱 | 城市", required: true },
      { key: "summary", label: "专业摘要", type: "textarea", rows: 4, placeholder: "具备10+年XX行业经验，专注于XX领域的项目交付与团队领导。擅长驱动复杂技术项目从规划到高质量交付的全生命周期管理，成功带领团队XX人完成XX项目，效率提升XX%。拥有XX技术背景，具备出色的跨部门沟通与协调能力。" },
      { key: "skills_pm", label: "核心技能 - 项目管理", type: "textarea", rows: 2, placeholder: "敏捷/Scrum实践、端到端项目交付、风险管理、干系人沟通、团队效能提升" },
      { key: "skills_tech", label: "核心技能 - 技术专长", type: "textarea", rows: 2, placeholder: "按领域分类，如：5G核心网、自动化测试框架、系统集成测试" },
      { key: "skills_soft", label: "核心技能 - 软技能", type: "textarea", rows: 2, placeholder: "沟通协调（跨X部门/X国家）、团队管理（X人）、数据驱动决策" },
      { key: "skills_lang", label: "核心技能 - 语言能力", type: "textarea", rows: 1, placeholder: "英语（流利，工作语言）、中文（母语）" },
      { key: "exp1", label: "工作经历1（最近）", type: "text", placeholder: "公司名称 | 职位 | 时间段（如 2021.10 - 至今）", required: true },
      { key: "exp1_bullets", label: "经历1 - 核心贡献", type: "list", itemCount: 4, itemHint: "每条：强动词开头 + 量化结果（如：主导XX项目，交付效率提升30%）", placeholder: "主导XX系统从0到1搭建，服务XX万用户，性能提升XX%" },
      { key: "exp2", label: "工作经历2", type: "text", placeholder: "公司名称 | 职位 | 时间段" },
      { key: "exp2_bullets", label: "经历2 - 核心贡献", type: "list", itemCount: 3, itemHint: "量化你的成就", placeholder: "负责XX模块，覆盖率达到XX%，缺陷率降低XX%" },
      { key: "exp3", label: "工作经历3", type: "text", placeholder: "公司名称 | 职位 | 时间段（更早的经历）" },
      { key: "exp3_bullets", label: "经历3 - 核心贡献", type: "list", itemCount: 2, itemHint: "可迁移的技能和成果", placeholder: "参与XX项目，学习并应用XX技术" },
      { key: "project1", label: "项目经验1（最近/最重要）", type: "text", placeholder: "项目名称（体现能力方向，非内部代号） | 角色 | 时间段", required: true },
      { key: "project1_bullets", label: "项目1 - 核心贡献", type: "list", itemCount: 3, itemHint: "承担的责任 + 获得的结果 + 项目独有的数字", placeholder: "设计XX方案，将XX效率从X提升到Y" },
      { key: "project2", label: "项目经验2", type: "text", placeholder: "项目名称 | 角色 | 时间段" },
      { key: "project2_bullets", label: "项目2 - 核心贡献", type: "list", itemCount: 2, itemHint: "体现不同能力维度", placeholder: "搭建XX框架，减少XX时间XX%" },
      { key: "education", label: "教育背景", type: "text", placeholder: "学校 | 专业 | 学位 | 时间（一行即可）", required: true },
      { key: "certs", label: "证书/其他", type: "textarea", rows: 2, placeholder: "PMP认证 | Scrum Master认证 | 其他证书" },
    ],
  },

  "tech-management": {
    id: "tech-management",
    name: "技术管理",
    description: "技术转管理，+1思维，系统全盘观，项目全生命周期",
    icon: "🔧",
    fields: [
      { key: "name", label: "姓名", type: "text", placeholder: "张三", required: true },
      { key: "contact", label: "联系方式", type: "text", placeholder: "手机 | 邮箱 | 城市", required: true },
      { key: "summary", label: "专业摘要", type: "textarea", rows: 4, placeholder: "具备10+年XX技术领域经验，近X年转向技术管理。擅长项目全生命周期管理（需求分析→技术方案→框架搭建→交付），主导XX人团队完成XX项目。具备系统思维和0-1架构能力，擅长跨X部门协调推动技术决策落地。" },
      { key: "skills_hard_pm", label: "硬技能 - 项目管理", type: "textarea", rows: 2, placeholder: "敏捷/Scrum实践、端到端交付、技术方案决策、风险管理、干系人管理" },
      { key: "skills_hard_tech", label: "硬技能 - 技术专长", type: "textarea", rows: 2, placeholder: "0-1架构搭建、自动化测试策略、单元测试覆盖、技术选型、框架重构" },
      { key: "skills_soft", label: "软技能", type: "textarea", rows: 2, placeholder: "沟通协调（跨X部门/X国家/X人）、团队管理（X人，培养X名新人）、数据驱动决策、问题分析方法论" },
      { key: "skills_lang", label: "语言能力", type: "textarea", rows: 1, placeholder: "英语（流利）、中文（母语）" },
      { key: "exp1", label: "工作经历1（最近）", type: "text", placeholder: "公司 | 职位 | 时间（如 2021 - 至今）", required: true },
      { key: "exp1_bullets", label: "经历1 - 管理贡献", type: "list", itemCount: 4, itemHint: "管理视角：主导/驱动/搭建 + 量化", placeholder: "主导XX技术方案决策，带领X人团队，交付效率提升XX%" },
      { key: "exp2", label: "工作经历2", type: "text", placeholder: "公司 | 职位 | 时间" },
      { key: "exp2_bullets", label: "经历2 - 核心贡献", type: "list", itemCount: 3, itemHint: "技术+管理双重维度", placeholder: "从0搭建XX框架，覆盖率达到XX%，团队效率提升XX%" },
      { key: "exp3", label: "工作经历3", type: "text", placeholder: "公司 | 职位 | 时间（更早）" },
      { key: "exp3_bullets", label: "经历3 - 核心贡献", type: "list", itemCount: 2, itemHint: "可迁移技能", placeholder: "参与XX流程优化，减少XX时间" },
      { key: "project1", label: "项目经验1（体现系统思维）", type: "text", placeholder: "项目名称（体现能力） | 角色 | 时间", required: true },
      { key: "project1_bullets", label: "项目1 - 全流程贡献", type: "list", itemCount: 3, itemHint: "需求分析→方案决策→框架搭建→交付，每环节量化", placeholder: "主导需求分析和技术方案，0-1搭建XX框架，交付质量XX%" },
      { key: "project2", label: "项目经验2（体现不同能力）", type: "text", placeholder: "项目名称 | 角色 | 时间" },
      { key: "project2_bullets", label: "项目2 - 核心贡献", type: "list", itemCount: 2, itemHint: "体现递进发展", placeholder: "推动XX流程优化，迭代周期缩短XX%" },
      { key: "education", label: "教育背景", type: "text", placeholder: "学校 | 专业 | 学位 | 时间", required: true },
      { key: "certs", label: "证书/其他", type: "textarea", rows: 2, placeholder: "PMP | Scrum Master | 相关技术认证" },
    ],
  },

  "general-professional": {
    id: "general-professional",
    name: "通用专业",
    description: "标准专业简历结构，适合大多数岗位",
    icon: "📋",
    fields: [
      { key: "name", label: "姓名", type: "text", placeholder: "张三", required: true },
      { key: "contact", label: "联系方式", type: "text", placeholder: "手机 | 邮箱 | 城市", required: true },
      { key: "summary", label: "专业摘要", type: "textarea", rows: 3, placeholder: "X年XX领域经验，擅长XX，曾在XX公司负责XX，取得XX成果。" },
      { key: "skills", label: "核心技能", type: "textarea", rows: 3, placeholder: "技能1、技能2、技能3\n或分类：技术：xxx | 管理：xxx | 语言：xxx" },
      { key: "exp1", label: "工作经历1（最近）", type: "text", placeholder: "公司 | 职位 | 时间", required: true },
      { key: "exp1_bullets", label: "经历1 - 核心贡献", type: "list", itemCount: 4, itemHint: "强动词开头 + 量化结果", placeholder: "负责XX，实现XX，提升XX%" },
      { key: "exp2", label: "工作经历2", type: "text", placeholder: "公司 | 职位 | 时间" },
      { key: "exp2_bullets", label: "经历2 - 核心贡献", type: "list", itemCount: 3, itemHint: "量化你的成就", placeholder: "主导XX，效率提升XX%" },
      { key: "exp3", label: "工作经历3", type: "text", placeholder: "公司 | 职位 | 时间" },
      { key: "exp3_bullets", label: "经历3 - 核心贡献", type: "list", itemCount: 2, itemHint: "可迁移技能", placeholder: "参与XX，学习XX" },
      { key: "project1", label: "项目经验1", type: "text", placeholder: "项目名称 | 角色 | 时间" },
      { key: "project1_bullets", label: "项目1 - 核心贡献", type: "list", itemCount: 3, itemHint: "背景 + 行动 + 结果", placeholder: "在XX背景下，采取XX方案，实现XX效果" },
      { key: "project2", label: "项目经验2", type: "text", placeholder: "项目名称 | 角色 | 时间" },
      { key: "project2_bullets", label: "项目2 - 核心贡献", type: "list", itemCount: 2, itemHint: "体现不同能力", placeholder: "负责XX，达到XX" },
      { key: "education", label: "教育背景", type: "text", placeholder: "学校 | 专业 | 学位 | 时间", required: true },
      { key: "certs", label: "证书/其他", type: "textarea", rows: 2, placeholder: "证书、奖项、其他" },
    ],
  },

  "blank": {
    id: "blank",
    name: "空白模版",
    description: "自由填写，无预设结构",
    icon: "📄",
    fields: [
      { key: "name", label: "姓名", type: "text", placeholder: "张三", required: true },
      { key: "contact", label: "联系方式", type: "text", placeholder: "手机 | 邮箱 | 城市", required: true },
      { key: "summary", label: "专业摘要", type: "textarea", rows: 3, placeholder: "简要介绍你的背景和核心竞争力" },
      { key: "skills", label: "核心技能", type: "textarea", rows: 3, placeholder: "你的技能列表" },
      { key: "custom", label: "简历正文", type: "textarea", rows: 12, placeholder: "自由填写你的工作经历、项目经验、教育背景等…" },
    ],
  },
};

/**
 * 根据模版ID和表单数据，生成结构化简历文本
 */
export function generateResumeText(
  templateId: ResumeTemplateId,
  data: Record<string, string | string[]>
): string {
  const tpl = RESUME_TEMPLATES[templateId];
  if (!tpl) return "";

  if (templateId === "blank") {
    const lines: string[] = [];
    const name = data["name"] as string;
    const contact = data["contact"] as string;
    const summary = data["summary"] as string;
    const skills = data["skills"] as string;
    const custom = data["custom"] as string;

    if (name) lines.push(name);
    if (contact) lines.push(contact);
    lines.push("");
    if (summary) {
      lines.push("【专业摘要】");
      lines.push(summary);
      lines.push("");
    }
    if (skills) {
      lines.push("【核心技能】");
      lines.push(skills);
      lines.push("");
    }
    if (custom) {
      lines.push(custom);
    }
    return lines.join("\n");
  }

  const lines: string[] = [];

  // 姓名 + 联系方式
  const name = data["name"] as string;
  const contact = data["contact"] as string;
  if (name) lines.push(name);
  if (contact) lines.push(contact);
  lines.push("");

  // 专业摘要
  const summary = data["summary"] as string;
  if (summary) {
    lines.push("【专业摘要】");
    lines.push(summary);
    lines.push("");
  }

  // 核心技能（根据模版类型不同）
  if (templateId === "senior-engineer") {
    const skillsPm = data["skills_pm"] as string;
    const skillsTech = data["skills_tech"] as string;
    const skillsSoft = data["skills_soft"] as string;
    const skillsLang = data["skills_lang"] as string;
    if (skillsPm || skillsTech || skillsSoft || skillsLang) {
      lines.push("【核心技能】");
      if (skillsPm) lines.push(`项目管理：${skillsPm}`);
      if (skillsTech) lines.push(`技术专长：${skillsTech}`);
      if (skillsSoft) lines.push(`软技能：${skillsSoft}`);
      if (skillsLang) lines.push(`语言能力：${skillsLang}`);
      lines.push("");
    }
  } else if (templateId === "tech-management") {
    const skillsHardPm = data["skills_hard_pm"] as string;
    const skillsHardTech = data["skills_hard_tech"] as string;
    const skillsSoft = data["skills_soft"] as string;
    const skillsLang = data["skills_lang"] as string;
    if (skillsHardPm || skillsHardTech || skillsSoft || skillsLang) {
      lines.push("【核心技能】");
      lines.push("硬技能：");
      if (skillsHardPm) lines.push(`  项目管理：${skillsHardPm}`);
      if (skillsHardTech) lines.push(`  技术专长：${skillsHardTech}`);
      lines.push("软技能：");
      if (skillsSoft) lines.push(`  ${skillsSoft}`);
      if (skillsLang) lines.push(`语言能力：${skillsLang}`);
      lines.push("");
    }
  } else if (templateId === "general-professional") {
    const skills = data["skills"] as string;
    if (skills) {
      lines.push("【核心技能】");
      lines.push(skills);
      lines.push("");
    }
  }

  // 工作经历
  const exps = [
    { title: data["exp1"] as string, bullets: data["exp1_bullets"] as string[] },
    { title: data["exp2"] as string, bullets: data["exp2_bullets"] as string[] },
    { title: data["exp3"] as string, bullets: data["exp3_bullets"] as string[] },
  ];

  const hasExp = exps.some((e) => e.title);
  if (hasExp) {
    lines.push("【工作经历】");
    for (const exp of exps) {
      if (exp.title) {
        lines.push(exp.title);
        if (Array.isArray(exp.bullets)) {
          for (const b of exp.bullets) {
            if (b && b.trim()) lines.push(`• ${b}`);
          }
        }
        lines.push("");
      }
    }
  }

  // 项目经验
  const projects = [
    { title: data["project1"] as string, bullets: data["project1_bullets"] as string[] },
    { title: data["project2"] as string, bullets: data["project2_bullets"] as string[] },
  ];

  const hasProject = projects.some((p) => p.title);
  if (hasProject) {
    lines.push("【项目经验】");
    for (const proj of projects) {
      if (proj.title) {
        lines.push(proj.title);
        if (Array.isArray(proj.bullets)) {
          for (const b of proj.bullets) {
            if (b && b.trim()) lines.push(`• ${b}`);
          }
        }
        lines.push("");
      }
    }
  }

  // 教育背景
  const education = data["education"] as string;
  if (education) {
    lines.push("【教育背景】");
    lines.push(education);
    lines.push("");
  }

  // 证书/其他
  const certs = data["certs"] as string;
  if (certs) {
    lines.push("【证书/其他】");
    lines.push(certs);
  }

  return lines.join("\n").trim();
}
