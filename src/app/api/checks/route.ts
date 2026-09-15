import { NextRequest, NextResponse } from "next/server";
import { runAllChecks, hasBlocker } from "@/lib/agent/checks";

export const runtime = "nodejs";

/**
 * 简历体检 API(纯确定性检查,零 LLM 调用)
 *
 * Day 1 下午:先作为独立报告上线(只报告、不闭环);
 * Day 2 接入 agent loop 后,此逻辑被 loop 内部复用。
 *
 * body: { original: string, jd?: string, polished: string, matchedKeywords?: string[], templateId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { original, jd, polished, matchedKeywords, templateId } = body as {
      original?: string;
      jd?: string;
      polished?: string;
      matchedKeywords?: string[];
      templateId?: string;
    };

    if (!original || !polished) {
      return NextResponse.json({ error: "请提供简历原文和润色稿" }, { status: 400 });
    }

    const issues = runAllChecks({
      original,
      jd: jd ?? "",
      polished,
      matchedKeywords: Array.isArray(matchedKeywords) ? matchedKeywords : [],
      templateId,
    });

    const blockerCount = issues.filter((i) => i.severity === "blocker").length;
    const warningCount = issues.length - blockerCount;

    return NextResponse.json({
      issues,
      blockerCount,
      warningCount,
      passed: !hasBlocker(issues),
    });
  } catch (error) {
    console.error("[checks] error:", error);
    return NextResponse.json({ error: "体检失败" }, { status: 500 });
  }
}
