import { NextRequest, NextResponse } from "next/server";
import { guardUrl } from "@/lib/ssrf";
import { extractFromHtml } from "@/lib/jdExtract";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_HTML_BYTES = 2_000_000;
const MIN_TEXT_LENGTH = 50;

/**
 * URL 抓取 JD —— 摆脱"只能靠油猴脚本"的限制,支持任意招聘页。
 * BOSS直聘有登录墙,该站继续走油猴脚本通道(见 README)。
 *
 * body: { url: string } → { title, text }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body as { url?: string };
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "请提供职位链接" }, { status: 400 });
    }

    let target: URL;
    try {
      target = guardUrl(url);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "链接不合法" }, { status: 400 });
    }

    const res = await fetch(target, {
      headers: {
        // 多数招聘站对无 UA 的请求直接 403
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `页面返回 ${res.status}${res.status === 403 || res.status === 401 ? "(可能需要登录,BOSS直聘请改用油猴脚本)" : ""}` },
        { status: 502 }
      );
    }

    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    const { title, text } = extractFromHtml(html, target.href);

    if (text.trim().length < MIN_TEXT_LENGTH) {
      return NextResponse.json(
        { error: "无法从该页面提取出职位正文(可能需要登录或为纯图片页),请手动粘贴" },
        { status: 422 }
      );
    }

    return NextResponse.json({ title, text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    const friendly = message.includes("TimeoutError") || message.includes("aborted") ? "抓取超时(10s),请稍后重试" : message;
    console.error("[import-jd/url] error:", error);
    return NextResponse.json({ error: `抓取失败: ${friendly}` }, { status: 500 });
  }
}
