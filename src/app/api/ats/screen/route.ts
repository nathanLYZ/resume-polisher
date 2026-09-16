import { NextRequest, NextResponse } from "next/server";
import { screenResume } from "@/lib/ats";

export const runtime = "nodejs";

/**
 * ATS 筛选模拟 —— 确定性规则打分,一次返回原文与润色稿两份筛選结果
 *
 * body: { original: string, polished?: string, jd: string, jdKeywords?: string[] }
 * → { original: AtsScreenResult, polished?: AtsScreenResult }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { original, polished, jd, jdKeywords } = body as {
      original?: string;
      polished?: string;
      jd?: string;
      jdKeywords?: string[];
    };

    if (!original || !jd) {
      return NextResponse.json({ error: "请提供简历文本和JD文本" }, { status: 400 });
    }

    const keywordHintsSource = polished ?? original;
    const result = {
      original: screenResume(original, jd, { jdKeywords }),
      ...(polished ? { polished: screenResume(polished, jd, { jdKeywords }) } : {}),
    };
    void keywordHintsSource;

    return NextResponse.json(result);
  } catch (error) {
    console.error("[ats/screen] error:", error);
    return NextResponse.json({ error: "筛选模拟失败" }, { status: 500 });
  }
}
