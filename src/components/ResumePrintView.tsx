"use client";

/**
 * 打印/导出 PDF 专用版式 —— 排版原则的代码化(docs/agent-refactor-plan.md §9)
 *
 * 与屏幕预览(ResumePreview,主题化、双栏、彩色)不同,本组件只用于打印,
 * 固定执行专业排印规则:
 *   - 字体统一:思源黑体系(Noto Sans SC → Source Han Sans → PingFang → 雅黑),无艺术字
 *   - 字号三档:姓名 20pt / 分区标题 12pt / 正文与元信息 10.5pt(正文落在 10.5-11pt 区间)
 *   - 行间距 1.5,分区/条目间距用 margin 表达,段落清晰
 *   - 单栏、无表格、无页眉页脚 —— 关键信息全部在正文文本流中,ATS 可解析
 *   - 近单色(#1a1a1a 正文 / #444 元信息 / #d4d4d4 分隔线),不加底色胶囊
 *   - break-inside: avoid 防止条目跨页截断
 *
 * 日期/数字格式一致性由检查器(⑩⑪)负责提示,版式不强制改写内容。
 */
import { parseResume, type ParsedSection } from "./ResumePreview";

const FONT_STACK =
  '"Noto Sans SC", "Source Han Sans SC", "Source Han Sans CN", "PingFang SC", "Microsoft YaHei", sans-serif';

const C = {
  text: "#1a1a1a",
  meta: "#444444",
  border: "#d4d4d4",
};

export default function ResumePrintView({ content }: { content: string }) {
  const sections = parseResume(content);
  const header = sections[0];
  const name = header?.lines[0] || "";
  const contactLine = header?.lines.slice(1).join("　|　") || "";
  const bodySections = sections.slice(1);

  return (
    <div
      style={{
        fontFamily: FONT_STACK,
        color: C.text,
        background: "#ffffff",
        fontSize: "10.5pt",
        lineHeight: 1.5,
      }}
    >
      {/* 头部:姓名 + 联系方式(正文文本流,不用页眉) */}
      <header style={{ marginBottom: "10pt" }}>
        <h1 style={{ fontSize: "20pt", fontWeight: 700, color: C.text, margin: 0, letterSpacing: "1pt" }}>{name}</h1>
        {contactLine && (
          <p style={{ fontSize: "10.5pt", color: C.meta, margin: "4pt 0 0" }}>{contactLine}</p>
        )}
      </header>

      {bodySections.map((section, idx) => (
        <PrintSection key={idx} section={section} />
      ))}
    </div>
  );
}

function PrintSection({ section }: { section: ParsedSection }) {
  return (
    <section style={{ breakInside: "avoid", marginBottom: "12pt" }}>
      <h2
        style={{
          fontSize: "12pt",
          fontWeight: 700,
          color: C.text,
          borderBottom: `1px solid ${C.border}`,
          paddingBottom: "3pt",
          margin: "0 0 8pt",
        }}
      >
        {section.title}
      </h2>
      <div>
        {section.lines.map((line, idx) => {
          const isTitleLine = /\|/.test(line) && line.split("|").length >= 2;
          const isBullet = /^[•▸\-·]/.test(line.trim()) || line.trim().startsWith("- ");

          // 条目标题行:"公司 | 职位 | 时间" → 左标题右时间(同行 flex,非表格,文本流顺序不变)
          if (isTitleLine) {
            const parts = line.split("|").map((p) => p.trim());
            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  breakInside: "avoid",
                  margin: idx > 0 ? "8pt 0 2pt" : "0 0 2pt",
                }}
              >
                <span style={{ fontSize: "10.5pt", fontWeight: 700, color: C.text }}>
                  {parts[0]}
                  {parts[1] && <span style={{ fontWeight: 400, color: C.meta, marginLeft: "6pt" }}>{parts[1]}</span>}
                </span>
                {parts[2] && (
                  <span style={{ fontSize: "10.5pt", color: C.meta }}>{parts.slice(2).join(" | ")}</span>
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
                  fontSize: "10.5pt",
                  lineHeight: 1.5,
                  color: C.text,
                  paddingLeft: "12pt",
                  position: "relative",
                  marginBottom: "3pt",
                  breakInside: "avoid",
                }}
              >
                <span style={{ position: "absolute", left: 0, top: 0, color: C.meta }}>·</span>
                {text}
              </div>
            );
          }

          return (
            <p key={idx} style={{ fontSize: "10.5pt", lineHeight: 1.5, color: C.text, margin: "0 0 4pt", breakInside: "avoid" }}>
              {line}
            </p>
          );
        })}
      </div>
    </section>
  );
}
