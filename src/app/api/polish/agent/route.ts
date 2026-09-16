import { NextRequest, NextResponse } from "next/server";
import { runToolAgentLoop } from "@/lib/agent/toolLoop";
import type { TemplateId } from "@/lib/templates";
import type { FormatId } from "@/lib/resumeFormats";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 深度模式润色端点(SSE 流式,模型驱动 tool-use agent)
 *
 * 事件流契约(见 docs/agent-refactor-plan.md §2.5):
 *   event: stage   data: {stage, iteration, status, detail?}
 *   event: issues  data: {iteration, verdict, blockerCount, warningCount}
 *   event: result  data: {…PolishResult 字段, reviewReport}
 *   event: error   data: {message}
 *
 * 2026-09-16 修复"连接中断,请重试":此前循环未 await,请求上下文销毁/平台
 * 掐流时 catch/finally 来不及写事件,前端流正常结束却无 result/error。
 * 现在:① 完整 await,异常在流内转发;② 55s 看门狗——超时未出结果时由
 * toolLoop 的时间预算机制走降级路径(toolLoop 内部 42/40s 预算先兜住,
 * 看门狗是最后防线);③ 服务端日志记录异常,云端可查。
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
    async start(controller) {
      let closed = false;
      const emit = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true; // 客户端已断开/流已被平台关闭:停止写入,不再让 enqueue 异常向上冒
        }
      };
      // 看门狗:55s(平台 60s 限内)还没出 result 就强制收口。
      // 注意:toolLoop 已内置并行保底(单次小输出起草),正常情况下主结果
      // 最迟 ~50s 必达;触发本看门狗意味着连保底都失败(DeepSeek 全面卡死),
      // 如实告知用户。空 polishedResume 由前端识别并转成错误提示,不会渲染成"成功"。
      let settled = false;
      const watchdog = setTimeout(() => {
        if (settled) return;
        console.error("[agent] watchdog: 55s 未产出结果(含保底链),强制降级收口");
        emit("result", {
          polishedResume: "",
          reviewReport: { iterations: 0, passed: false, issues: [], elapsedMs: 55_000, degraded: true },
          suggestions: ["本次深度润色超时(55s)——AI 服务响应过慢。请稍后重试,或暂时关闭深度模式用快速模式。"],
        });
      }, 55_000);

      try {
        await runToolAgentLoop(
          {
            resume,
            jd,
            templateId: templateId ?? "professional",
            formatId: formatId ?? "classic",
            companyContext: companyContext?.slice(0, 1500),
          },
          (event, data) => {
            if (event === "result" || event === "error") settled = true;
            emit(event, data);
          }
        );
      } catch (e) {
        // 理论上 runToolAgentLoop 内部已 catch;此处兜底,保证 error 事件必达
        console.error("[agent] route-level error:", e);
        emit("error", { message: e instanceof Error ? e.message : "深度润色失败" });
      } finally {
        clearTimeout(watchdog);
        try {
          controller.close();
        } catch {
          /* 已关闭 */
        }
      }
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