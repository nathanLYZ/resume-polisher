"use client";

import { useMemo } from "react";
import { getTheme, type ThemeId } from "@/lib/resumeThemes";

interface ResumePreviewProps {
  content: string;
  themeId: ThemeId;
}

/**
 * 简历视觉预览组件
 * 将纯文本简历解析为结构化分区，渲染为美观的简历卡片
 */
export default function ResumePreview({ content, themeId }: ResumePreviewProps) {
  const theme = getTheme(themeId);

  // 解析简历文本为结构化数据
  const sections = useMemo(() => parseResume(content), [content]);

  // 提取姓名和联系方式（通常在开头）
  const header = sections[0];
  const name = header?.lines[0] || "";
  const contactLine = header?.lines.slice(1).join(" | ") || "";

  // 剩余分区
  const bodySections = sections.slice(1);

  // 分离侧边栏内容（技能/教育/证书）和主区域内容（经历/项目）
  const sidebarSections = bodySections.filter((s) =>
    /技能|教育|证书|语言|skill|education|cert/i.test(s.title)
  );
  const mainSections = bodySections.filter((s) =>
    !/技能|教育|证书|语言|skill|education|cert/i.test(s.title)
  );

  const hasSidebar = sidebarSections.length > 0;

  const cssVars = theme.vars as Record<string, string>;

  return (
    <div
      className="rv-root"
      style={{
        background: cssVars["--rv-bg"],
        borderRadius: cssVars["--rv-radius"],
        fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.1)",
        ...cssVarsToStyle(cssVars),
      } as React.CSSProperties}
    >
      {/* 头部：姓名 + 联系方式 */}
      <div
        className="rv-header"
        style={{
          background: cssVars["--rv-sidebar-bg"],
          color: cssVars["--rv-sidebar-text"],
          padding: "32px 40px 24px",
        }}
      >
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            margin: 0,
            color: cssVars["--rv-sidebar-accent"],
            letterSpacing: "2px",
          }}
        >
          {name}
        </h1>
        {contactLine && (
          <p
            style={{
              fontSize: "13px",
              marginTop: "8px",
              opacity: 0.85,
              lineHeight: 1.6,
            }}
          >
            {contactLine}
          </p>
        )}
      </div>

      {/* 主体：双栏 or 单栏 */}
      <div
        className="rv-body"
        style={{
          display: hasSidebar ? "flex" : "block",
          minHeight: "400px",
        }}
      >
        {/* 侧边栏 */}
        {hasSidebar && (
          <aside
            className="rv-sidebar"
            style={{
              width: "32%",
              background: cssVars["--rv-sidebar-bg"],
              color: cssVars["--rv-sidebar-text"],
              padding: "24px 28px",
              flexShrink: 0,
            }}
          >
            {sidebarSections.map((section, idx) => (
              <SidebarSection key={idx} section={section} theme={cssVars} />
            ))}
          </aside>
        )}

        {/* 主区域 */}
        <main
          className="rv-main"
          style={{
            flex: 1,
            background: cssVars["--rv-main-bg"],
            color: cssVars["--rv-main-text"],
            padding: "24px 32px",
          }}
        >
          {/* 如果没有侧边栏，所有分区都在主区域 */}
          {(hasSidebar ? mainSections : bodySections).map((section, idx) => (
            <MainSection key={idx} section={section} theme={cssVars} />
          ))}
        </main>
      </div>
    </div>
  );
}

/**
 * 主区域分区
 */
function MainSection({
  section,
  theme,
}: {
  section: ParsedSection;
  theme: Record<string, string>;
}) {
  return (
    <div className="rv-section" style={{ marginBottom: "24px" }}>
      <h2
        style={{
          fontSize: "15px",
          fontWeight: 700,
          color: theme["--rv-heading"],
          borderBottom: `2px solid ${theme["--rv-border"]}`,
          paddingBottom: "6px",
          marginBottom: "12px",
          letterSpacing: "1px",
        }}
      >
        {section.title}
      </h2>
      <div>
        {section.lines.map((line, idx) => {
          // 检测是否是"公司 | 职位 | 时间"格式的标题行
          const isTitleLine = /\|/.test(line) && line.split("|").length >= 2;
          // 检测是否是 bullet point
          const isBullet = /^[•▸\-·]/.test(line.trim()) || line.trim().startsWith("- ");

          if (isTitleLine) {
            const parts = line.split("|").map((p) => p.trim());
            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: "4px",
                  marginTop: idx > 0 ? "12px" : "0",
                }}
              >
                <span style={{ fontSize: "14px", fontWeight: 600, color: theme["--rv-main-text"] }}>
                  {parts[0]}
                  {parts[1] && <span style={{ color: theme["--rv-accent"], marginLeft: "8px" }}>{parts[1]}</span>}
                </span>
                {parts[2] && (
                  <span style={{ fontSize: "12px", color: theme["--rv-accent"], opacity: 0.8 }}>
                    {parts.slice(2).join(" | ")}
                  </span>
                )}
              </div>
            );
          }

          if (isBullet) {
            const text = line.replace(/^[•▸\-·]\s*/, "").replace(/^-\s*/, "");
            return (
              <div
                key={idx}
                style={{
                  fontSize: "13px",
                  lineHeight: 1.7,
                  color: theme["--rv-main-text"],
                  paddingLeft: "16px",
                  position: "relative",
                  marginBottom: "4px",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    color: theme["--rv-accent"],
                    fontWeight: 700,
                  }}
                >
                  ▸
                </span>
                {renderTextWithKeywords(line, theme)}
              </div>
            );
          }

          // 普通文本行
          return (
            <p
              key={idx}
              style={{
                fontSize: "13px",
                lineHeight: 1.7,
                color: theme["--rv-main-text"],
                margin: "0 0 6px",
              }}
            >
              {renderTextWithKeywords(line, theme)}
            </p>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 侧边栏分区
 */
function SidebarSection({
  section,
  theme,
}: {
  section: ParsedSection;
  theme: Record<string, string>;
}) {
  return (
    <div className="rv-sidebar-section" style={{ marginBottom: "20px" }}>
      <h3
        style={{
          fontSize: "13px",
          fontWeight: 700,
          color: theme["--rv-sidebar-accent"],
          textTransform: "uppercase",
          letterSpacing: "1.5px",
          marginBottom: "10px",
          paddingBottom: "6px",
          borderBottom: `1px solid ${theme["--rv-sidebar-accent"]}33`,
        }}
      >
        {section.title}
      </h3>
      <div>
        {section.lines.map((line, idx) => {
          // 检测 "分类：技能1、技能2" 格式
          if (/[:：]/.test(line)) {
            const [category, items] = line.split(/[:：]/).map((s) => s.trim());
            const skills = items.split(/[、,，]/).map((s) => s.trim()).filter(Boolean);
            return (
              <div key={idx} style={{ marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: theme["--rv-sidebar-accent"], display: "block", marginBottom: "4px" }}>
                  {category}
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {skills.map((skill, si) => (
                    <span
                      key={si}
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        background: `${theme["--rv-sidebar-accent"]}22`,
                        color: theme["--rv-sidebar-accent"],
                        borderRadius: "4px",
                      }}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            );
          }

          // 检测 "学校 | 专业 | 时间" 格式
          if (/\|/.test(line)) {
            const parts = line.split("|").map((p) => p.trim());
            return (
              <div key={idx} style={{ marginBottom: "8px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: theme["--rv-sidebar-text"] }}>{parts[0]}</div>
                {parts.slice(1).map((p, pi) => (
                  <div key={pi} style={{ fontSize: "12px", color: theme["--rv-sidebar-text"], opacity: 0.8 }}>{p}</div>
                ))}
              </div>
            );
          }

          // 普通行
          return (
            <p key={idx} style={{ fontSize: "12px", lineHeight: 1.6, color: theme["--rv-sidebar-text"], margin: "0 0 4px", opacity: 0.9 }}>
              {line}
            </p>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 在文本中高亮关键词（数字、百分比等）
 */
function renderTextWithKeywords(text: string, theme: Record<string, string>): React.ReactNode {
  // 高亮数字和百分比
  const parts = text.split(/(\d+[%％]|\d+\/\d+|\d+个|\d+人|\d+次|\d+万|\d+亿)/g);
  return parts.map((part, idx) => {
    if (/^\d+[%％]$/.test(part) || /^\d+\/\d+$/.test(part) || /^\d+[个人次万亿]/.test(part)) {
      return (
        <span key={idx} style={{ color: theme["--rv-accent"], fontWeight: 600 }}>
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

/**
 * 将 CSS 变量对象转为 style 属性
 */
function cssVarsToStyle(vars: Record<string, string>): React.CSSProperties {
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    style[key] = value;
  }
  return style as React.CSSProperties;
}

// ============ 简历文本解析 ============

interface ParsedSection {
  title: string;
  lines: string[];
}

/**
 * 将纯文本简历解析为分区结构
 * 识别标题行（如【工作经历】、═══ 分隔线、全大写英文等）
 */
function parseResume(text: string): ParsedSection[] {
  const lines = text.split("\n");
  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection | null = null;
  let headerLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 检测装饰线
    if (/^[═━─\-=]{3,}/.test(line)) continue;

    // 检测分区标题
    const titleMatch = line.match(/^[【\[](.+?)[】\]]$/);
    const isDecoratedTitle = titleMatch;
    const isAllCapsTitle = /^[A-Z\s]{3,}$/.test(line) && line.length < 30;
    const isChineseTitle = /^(专业摘要|核心技能|工作经历|项目经验|教育背景|证书|语言能力|技能|经历|项目|教育|其他|EXPERIENCE|PROJECTS|EDUCATION|SKILLS|SUMMARY|CERT)/i.test(line);

    if (isDecoratedTitle || isAllCapsTitle || isChineseTitle) {
      // 保存之前的分区
      if (currentSection) {
        sections.push(currentSection);
      }
      const title = titleMatch ? titleMatch[1] : line;
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
