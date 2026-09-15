import { NextRequest, NextResponse } from "next/server";
import { addKeywords, listKeywords, clearKeywords } from "@/lib/kwStore";

export const runtime = "nodejs";

/**
 * 关键词库 API(存储委托给 lib/kwStore:Upstash → 本地文件 → 内存 自适应)
 * 每次润色时前端自动提交 JD 关键词,这里积累统计;agent 起草时取高频词注入 prompt。
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * POST — 提交一批 JD 关键词(润色后自动调用)
 * body: { keywords: string[], jobTitle?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keywords, jobTitle } = body as { keywords?: string[]; jobTitle?: string };

    if (!Array.isArray(keywords)) {
      return NextResponse.json({ error: "keywords 必须是数组" }, { status: 400, headers: corsHeaders });
    }

    const totalKeywords = await addKeywords(keywords, jobTitle);
    console.log(`[keyword-bank] 新增/更新 ${keywords.length} 个关键词，总计 ${totalKeywords} 个`);

    return NextResponse.json({ success: true, totalKeywords }, { headers: corsHeaders });
  } catch (error) {
    console.error("[keyword-bank] POST error:", error);
    return NextResponse.json({ error: "操作失败" }, { status: 500, headers: corsHeaders });
  }
}

/**
 * GET — 获取关键词库
 * query: ?sort=count|recent  &limit=50
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sort = (searchParams.get("sort") || "count") as "count" | "recent";
  const limit = parseInt(searchParams.get("limit") || "100", 10);

  const { entries, total } = await listKeywords(sort, limit);

  return NextResponse.json({ keywords: entries, total, sort }, { headers: corsHeaders });
}

/**
 * DELETE — 清空关键词库
 */
export async function DELETE() {
  await clearKeywords();
  console.log("[keyword-bank] 已清空");
  return NextResponse.json({ success: true }, { headers: corsHeaders });
}
