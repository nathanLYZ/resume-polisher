"use client";

import { useMemo } from "react";

interface ResumePreviewProps {
  content: string;
}

/**
 * 简历视觉预览组件 —— 极简黑白单栏版式，与打印版(ResumePrintView)同构
 * 参考：姓名 + 联系方式一行、分区细线、条目标题左标题右时间、全文黑色
 * 不做彩色高亮/技能胶囊/侧边栏，保证屏幕预览与导出 PDF 所见即所得
 */
export default function ResumePreview({ content }: ResumePreviewProps) {
  // 解析简历文本为结构化数据
  const sections = useMemo(() => parseResume(content), [content]);

  // 提取姓名和联系方式（通常在开头），分隔符统一为「·」
  const header = sections[0];
  const name = header?.lines[0] || "";
  const contactLine = toContactLine(header?.lines.slice(1) || []);

  // 正文分区
  const bodySections = sections.slice(1);

  return (
    <div
      className="rv-root"
      style={{
        background: "#ffffff",
        border: "1px solid #e5e5e5",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
        color: "#1a1a1a",
        padding: "44px 48px",
      }}
    >
      {/* 头部：姓名 + 联系方式 */}
      <header style={{ marginBottom: "18px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#000000", margin: 0, letterSpacing: "1px", lineHeight: 1.3 }}>
          {name}
        </h1>
        {contactLine && (
          <p style={{ fontSize: "13px", color: "#1a1a1a", margin: "8px 0 14px", lineHeight: 1.6 }}>
            {contactLine}
          </p>
        )}
        <div style={{ borderBottom: "1px solid #d9d9d9" }} />
      </header>

      {/* 正文：单栏，按分区顺序渲染 */}
      {bodySections.map((section, idx) => (
        <Section key={idx} section={section} />
      ))}
    </div>
  );
}

/**
 * 分区：小标题 + 细线，条目按行渲染
 */
function Section({ section }: { section: ParsedSection }) {
  return (
    <section style={{ marginBottom: "20px" }}>
      <h2
        style={{
          fontSize: "14px",
          fontWeight: 700,
          color: "#000000",
          borderBottom: "1px solid #d9d9d9",
          paddingBottom: "5px",
          margin: "0 0 10px",
          letterSpacing: "1px",
        }}
      >
        {section.title}
      </h2>
      <div>
        {section.lines.map((line, idx) => {
          // 「▍ 核心技术攻坚」这类小节子标题
          const sub = parseSubHeader(line);
          if (sub) {
            return (
              <p key={idx} style={{ fontSize: "13px", fontWeight: 700, color: "#1a1a1a", margin: "10px 0 4px" }}>
                {sub}
              </p>
            );
          }

          // 条目标题行（公司/职位 + 时间）
          const entry = parseEntryLine(line);
          if (entry) {
            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  margin: idx > 0 ? "10px 0 4px" : "0 0 4px",
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>
                  {entry.main}
                  {entry.role && <span style={{ fontWeight: 400, marginLeft: "8px" }}>{entry.role}</span>}
                </span>
                {entry.date && (
                  <span style={{ fontSize: "12px", color: "#1a1a1a", whiteSpace: "nowrap" }}>{entry.date}</span>
                )}
              </div>
            );
          }

          // bullet point
          const isBullet = /^[•▸\-·]/.test(line.trim()) || line.trim().startsWith("- ");
          if (isBullet) {
            const text = line.replace(/^[•▸\-·]\s*/, "").replace(/^-\s*/, "");
            return (
              <div
                key={idx}
                style={{
                  fontSize: "13px",
                  lineHeight: 1.7,
                  color: "#1a1a1a",
                  paddingLeft: "14px",
                  position: "relative",
                  marginBottom: "3px",
                }}
              >
                <span style={{ position: "absolute", left: 0, top: 0, color: "#1a1a1a" }}>·</span>
                {text}
              </div>
            );
          }

          // 普通文本行
          return (
            <p key={idx} style={{ fontSize: "13px", lineHeight: 1.7, color: "#1a1a1a", margin: "0 0 5px" }}>
              {line}
            </p>
          );
        })}
      </div>
    </section>
  );
}

// ============ 简历文本解析（预览与打印共用） ============

export interface ParsedSection {
  title: string;
  lines: string[];
}

/** pdf-parse 的页码残留（"-- 1 of 2 --"） */
const PAGE_MARKER = /^--\s*\d+\s*of\s*\d+\s*--$/;

/**
 * 已知中文标题 + 可选英文大写尾缀（如「个人简介 SUMMARY」「AI 项目亮点 AI PROJECTS」）。
 * 整行必须恰好匹配，避免「项目角色独立架构师…」「其他语言 Java | Node.js」等内容行被误判为标题。
 * 注意 PDF 提取可能把 AI 拆成「A I」，前缀做了容错。
 */
const SECTION_TITLE_RE =
  /^(?:(?:A\s?I)\s*)?(个人简介|专业摘要|专业技能|核心技能|自我评价|工作经历|实习经历|项目经历|项目经验|项目亮点|教育经历|教育背景|教育与证书|荣誉奖项|获奖经历|证书|语言能力|技能|经历|项目|教育|其他)(?:\s*[A-Z][A-Z\s/&]{0,24})?$/;

/**
 * 将纯文本简历解析为分区结构
 * 识别标题行（如【工作经历】、═══ 分隔线、全大写英文等）
 */
export function parseResume(text: string): ParsedSection[] {
  const lines = text.split("\n");
  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection | null = null;
  let headerLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 跳过装饰线与页码残留
    if (/^[═━─\-=]{3,}/.test(line) || PAGE_MARKER.test(line)) continue;

    // 检测分区标题
    const titleMatch = line.match(/^[【\[](.+?)[】\]]$/);
    const isDecoratedTitle = titleMatch;
    const isAllCapsTitle = /^[A-Z\s]{3,}$/.test(line) && line.length < 30;
    const isChineseTitle = SECTION_TITLE_RE.test(line) ||
      /^(EXPERIENCE|PROJECTS|EDUCATION|SKILLS|SUMMARY|CERT|PROFILE|AWARDS)$/i.test(line);

    if (isDecoratedTitle || isAllCapsTitle || isChineseTitle) {
      // 保存之前的分区
      if (currentSection) {
        sections.push(currentSection);
      }
      // PDF 提取可能把 AI 拆成「A I」，标题展示时归一
      const title = (titleMatch ? titleMatch[1] : line).replace(/^A\s?I\s/, "AI ");
      currentSection = { title, lines: [] };
      continue;
    }

    // 如果还没有分区，放入 header
    if (!currentSection) {
      headerLines.push(line);
    } else {
      currentSection.lines.push(line);
    }
  }

  // 保存最后一个分区
  if (currentSection) {
    sections.push(currentSection);
  }

  // 将 header lines 作为第一个分区
  if (headerLines.length > 0) {
    sections.unshift({ title: "", lines: headerLines });
  }

  return sections;
}

export interface EntryLine {
  /** 主体：公司/项目名/职位 */
  main: string;
  /** 次要信息：职位/角色 */
  role?: string;
  /** 右侧时间：2022.08 – 至今 */
  date?: string;
}

/** 行尾的日期区间（「2020.06 – 2022.08」「2013.03 – 至今」） */
const DATE_TAIL_RE = /\s(\d{4}(?:\.\d{1,2})?(?:\s*[–—~-]\s*(?:至今|\d{4}(?:\.\d{1,2})?))?)$/;

/**
 * 识别条目标题行：
 * - 管道符风格「公司 | 职位 | 时间」
 * - 行尾日期风格「射频软件技术负责人(Technical Leader) 2022.08 – 至今」
 * 都不是则返回 null（按普通内容行渲染）
 */
export function parseEntryLine(line: string): EntryLine | null {
  const trimmed = line.trim();
  if (!trimmed || /[:：]/.test(trimmed)) return null; // 「技术架构 xxx」冒号行不当条目
  if (/^[•▸\-·]/.test(trimmed) || /^\d+[.、]/.test(trimmed)) return null; // bullet / 编号列表

  if (trimmed.includes("|")) {
    const parts = trimmed.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { main: parts[0], role: parts[1] || undefined, date: parts.slice(2).join(" · ") || undefined };
    }
  }

  const m = trimmed.match(DATE_TAIL_RE);
  if (m && m.index !== undefined && m.index > 2) {
    return { main: trimmed.slice(0, m.index).trim(), date: m[1] };
  }
  return null;
}

/** 识别「▍ 核心技术攻坚」这类小节子标题，返回去掉标记的文本 */
export function parseSubHeader(line: string): string | null {
  const m = line.trim().match(/^[▍▎◆■★]\s*(.+)$/);
  return m ? m[1] : null;
}

/** 头部联系方式行：多行合并、「|」统一为「·」 */
export function toContactLine(lines: string[]): string {
  return lines.join(" · ").replace(/\s*\|\s*/g, " · ").trim();
}
