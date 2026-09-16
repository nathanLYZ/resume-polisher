import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/deepseek";
import {
  buildInterviewPrepMessages,
  buildResumeScoreMessages,
} from "@/lib/agent/prompts";
import {
  parseJSONLoose,
  InterviewPrepSchema,
  ResumeScoreSchema,
} from "@/lib/agent/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 收尾端点:面试准备 + 评分(与主润色解耦,2026-09-16)
 *
 * 此前 finalize 挤在 /api/polish/agent 的 60s 沙漏里,DeepSeek 高峰期
 * 主链(tool-use 循环 3-5 次调用)就吃掉 40s+,收尾把总时长顶过 55s
 * 看门狗 → 用户看到"超时降级"。解耦后:
 *   主请求 → 只做润色+体检(用户最关心的,40s 内必达)
 *   本端点 → 前端拿到主结果后立刻异步调用,慢也不影响主结果展示
 *
 * body: { resume, jd, polished } → { interviewPrep?, resumeScore? }
 * 各自独立失败:parse 失败/超时 → 字段缺省,前端 Tab 守卫自动隐藏
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { resume, jd, polished } = body as {
      resume?: string;
      jd?: string;
      polished?: string;
    };
    if (!resume || !jd || !polished) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    const [prep, score] = await Promise.all([
      callDeepSeek(buildInterviewPrepMessages(resume, jd, polished), {
        temperature: 0.6,
        maxTokens: 2048,
        jsonMode: true,
      })
        .then((raw) => InterviewPrepSchema.safeParse(parseJSONLoose(raw)))
        .then((r) => (r.success ? r.data : undefined))
        .catch(() => undefined),
      callDeepSeek(buildResumeScoreMessages(resume, jd, polished), {
        temperature: 0.3,
        maxTokens: 800,
        jsonMode: true,
      })
        .then((raw) => ResumeScoreSchema.safeParse(parseJSONLoose(raw)))
        .then((r) => (r.success ? r.data : undefined))
        .catch(() => undefined),
    ]);

    return NextResponse.json({ interviewPrep: prep, resumeScore: score });
  } catch (error) {
    console.error("[finalize] error:", error);
    return NextResponse.json({ error: "收尾生成失败" }, { status: 500 });
  }
}