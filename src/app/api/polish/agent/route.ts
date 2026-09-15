import { NextRequest, NextResponse } from "next/server";
import { runAgentLoop } from "@/lib/agent/loop";
import type { TemplateId } from "@/lib/templates";
import type { FormatId } from "@/lib/resumeFormats";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 深度模式润色端点(SSE 流式)
 *
 * 事件流契约(见 docs/agent-refactor-plan.md §2.5):
 *   event: stage   data: {stage, iteration, status}
 *   event: issues  data: {iteration, verdict, blockerCount, warningCount}
 *   event: result  data: {…PolishResult 字段, reviewReport}
 *   event: error   data: {message}
 *
 * 旧 /api/polish 保持不动,作为降级基线;前端"深度模式"开关切换。
 */
export async function POST(request: NextRequest) {
  let body: {
    resume?: string;
    jd?: string;
    templateId?: TemplateId;
    formatId?: FormatId;
    companyContext?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { resume, jd, templateId, formatId, companyContext } = body;
  if (!resume || !jd) {
    return NextResponse.json({ error: "请提供简历文本和JD文本" }, { status: 400 });
  }
  if (resume.trim().length < 20) {
    return NextResponse.json({ error: "简历内容太短,请粘贴更完整的简历" }, { status: 400 });
  }
  if (jd.trim().length < 10) {
    return NextResponse.json({ error: "JD内容太短,请粘贴完整的职位描述" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      runAgentLoop(
        {
          resume,
          jd,
          templateId: templateId ?? "professional",
          formatId: formatId ?? "classic",
          companyContext: companyContext?.slice(0, 1500),
        },
        emit
      )
        .catch((e) => emit("error", { message: e instanceof Error ? e.message : "未知错误" }))
        .finally(() => {
          try {
            controller.close();
          } catch {
            /* 已关闭 */
          }
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
