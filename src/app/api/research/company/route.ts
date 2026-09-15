import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * 公司调研 —— 可选工具(方案 Phase 2 #3)
 * 搜索 API 双支持:TAVILY_API_KEY(海外)或 BOCHA_API_KEY(博查,国内)。
 * 未配置时返回 configured:false,前端提示但不阻断——这是个可选增强,不是主路径。
 *
 * body: { company: string } → { configured, summary, sources, context }
 */

export interface CompanyResearch {
  configured: boolean;
  summary?: string;
  sources?: { title: string; url: string; snippet: string }[];
  /** 注入 agent 起草 prompt 的压缩上下文 */
  context?: string;
}

interface TavilyResponse {
  answer?: string;
  results?: { title: string; url: string; content: string }[];
}
interface BochaResponse {
  data?: { webPages?: { value?: { name: string; url: string; summary?: string; snippet?: string }[] } };
}

export async function POST(request: NextRequest) {
  let company = "";
  try {
    const body = await request.json();
    company = (body as { company?: string }).company?.trim() ?? "";
  } catch {
    /* fallthrough */
  }
  if (!company) {
    return NextResponse.json({ error: "请提供公司名" }, { status: 400 });
  }

  const tavilyKey = process.env.TAVILY_API_KEY;
  const bochaKey = process.env.BOCHA_API_KEY;
  if (!tavilyKey && !bochaKey) {
    return NextResponse.json({
      configured: false,
      error: "未配置搜索 API。在 .env.local 添加 TAVILY_API_KEY(tavily.com)或 BOCHA_API_KEY(bochaai.com)后可用",
    } satisfies CompanyResearch & { error: string });
  }

  const query = `${company} 公司 主营业务 核心产品 技术栈`;
  try {
    let summary = "";
    let sources: CompanyResearch["sources"] = [];

    if (tavilyKey) {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tavilyKey}` },
        body: JSON.stringify({ query, max_results: 5, include_answer: true }),
        signal: AbortSignal.timeout(12_000),
      });
      const data = (await res.json()) as TavilyResponse;
      summary = data.answer ?? "";
      sources = (data.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.content.slice(0, 200) }));
    } else {
      const res = await fetch("https://api.bochaai.com/v1/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${bochaKey}` },
        body: JSON.stringify({ query, summary: true, count: 5 }),
        signal: AbortSignal.timeout(12_000),
      });
      const data = (await res.json()) as BochaResponse;
      const pages = data.data?.webPages?.value ?? [];
      sources = pages.map((p) => ({ title: p.name, url: p.url, snippet: (p.summary || p.snippet || "").slice(0, 200) }));
      summary = sources.map((s) => `${s.title}:${s.snippet}`).join("\n");
    }

    // 压缩上下文:给 agent 起草 prompt 用,控制篇幅
    const context = `公司「${company}」公开信息:\n${(summary || sources.map((s) => s.snippet).join(" ")).slice(0, 1200)}`;

    return NextResponse.json({ configured: true, summary, sources, context } satisfies CompanyResearch);
  } catch (error) {
    console.error("[research/company] error:", error);
    return NextResponse.json({ error: "调研请求失败,请稍后重试" }, { status: 502 });
  }
}
