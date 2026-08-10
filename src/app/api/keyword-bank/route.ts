import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * 关键词库 API
 * 存储在内存中（开发环境单用户足够）
 * 每次润色时前端自动提交 JD 关键词，这里积累统计
 */

interface KeywordEntry {
  keyword: string;
  count: number;          // 出现次数（跨JD）
  firstSeen: number;      // 首次出现时间
  lastSeen: number;       // 最近出现时间
  jobTitles: string[];    // 出现在哪些职位中
}

// 内存存储
let keywordBank: Map<string, KeywordEntry> = new Map();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * POST — 提交一批 JD 关键词（润色后自动调用）
 * body: { keywords: string[], jobTitle?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keywords, jobTitle } = body as { keywords?: string[]; jobTitle?: string };

    if (!Array.isArray(keywords)) {
      return NextResponse.json({ error: "keywords 必须是数组" }, { status: 400, headers: corsHeaders });
    }

    const now = Date.now();

    for (const kw of keywords) {
      if (!kw || typeof kw !== "string") continue;
      const key = kw.trim();
      if (!key) continue;

      const existing = keywordBank.get(key);
      if (existing) {
        existing.count++;
        existing.lastSeen = now;
        if (jobTitle && !existing.jobTitles.includes(jobTitle)) {
          existing.jobTitles.push(jobTitle);
        }
      } else {
        keywordBank.set(key, {
          keyword: key,
          count: 1,
          firstSeen: now,
          lastSeen: now,
          jobTitles: jobTitle ? [jobTitle] : [],
        });
      }
    }

    console.log(`[keyword-bank] 新增/更新 ${keywords.length} 个关键词，总计 ${keywordBank.size} 个`);

    return NextResponse.json({
      success: true,
      totalKeywords: keywordBank.size,
    }, { headers: corsHeaders });
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
  const sort = searchParams.get("sort") || "count";
  const limit = parseInt(searchParams.get("limit") || "100", 10);

  let entries = Array.from(keywordBank.values());

  if (sort === "count") {
    // 按出现次数降序
    entries.sort((a, b) => b.count - a.count);
  } else {
    // 按最近出现时间降序
    entries.sort((a, b) => b.lastSeen - a.lastSeen);
  }

  entries = entries.slice(0, limit);

  return NextResponse.json({
    keywords: entries,
    total: keywordBank.size,
    sort,
  }, { headers: corsHeaders });
}

/**
 * DELETE — 清空关键词库
 */
export async function DELETE() {
  keywordBank.clear();
  console.log("[keyword-bank] 已清空");
  return NextResponse.json({ success: true }, { headers: corsHeaders });
}
