import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * 接收来自 Tampermonkey 油猴脚本的 JD 导入请求
 * 油猴脚本在 BOSS 直聘 JD 页面提取内容后 POST 到这里
 * 前端通过轮询 GET /api/import-jd 获取最新导入的 JD
 */

// 内存暂存（开发环境下单用户足够，重启后清空）
let latestJD: {
  jobTitle: string;
  company: string;
  salary: string;
  city: string;
  jdText: string;
  jobUrl: string;
  importedAt: number;
} | null = null;

// CORS 头 — 允许油猴脚本从 zhipin.com 跨域调用
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * POST — 油猴脚本提交 JD
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobTitle, company, salary, city, jdText, jobUrl } = body as {
      jobTitle?: string;
      company?: string;
      salary?: string;
      city?: string;
      jdText?: string;
      jobUrl?: string;
    };

    if (!jdText || jdText.trim().length < 10) {
      return NextResponse.json(
        { error: "JD 内容太短" },
        { status: 400, headers: corsHeaders }
      );
    }

    latestJD = {
      jobTitle: jobTitle || "",
      company: company || "",
      salary: salary || "",
      city: city || "",
      jdText: jdText.trim(),
      jobUrl: jobUrl || "",
      importedAt: Date.now(),
    };

    console.log(`[import-jd] 收到JD: ${latestJD.jobTitle} @ ${latestJD.company}`);

    return NextResponse.json(
      { success: true, message: "JD 已导入，请回到简历润色助手页面" },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[import-jd] error:", error);
    return NextResponse.json(
      { error: "导入失败" },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * GET — 前端轮询获取最新导入的 JD
 */
export async function GET() {
  if (!latestJD) {
    return NextResponse.json(
      { hasNew: false },
      { headers: corsHeaders }
    );
  }

  // 超过 5 分钟的记录视为过期
  const isExpired = Date.now() - latestJD.importedAt > 5 * 60 * 1000;

  if (isExpired) {
    latestJD = null;
    return NextResponse.json(
      { hasNew: false },
      { headers: corsHeaders }
    );
  }

  // 返回后清除（一次性消费）
  const data = { hasNew: true, ...latestJD };
  latestJD = null;

  return NextResponse.json(data, { headers: corsHeaders });
}
