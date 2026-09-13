import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/deepseek";
import { buildPolishPrompt } from "@/lib/prompt";
import type { TemplateId } from "@/lib/templates";
import type { FormatId } from "@/lib/resumeFormats";

export const runtime = "nodejs";
export const maxDuration = 60;

export interface StarStory {
  situation?: string;
  task?: string;
  action?: string;
  result?: string;
}

export interface InterviewPrep {
  likelyQuestions: string[];
  talkingPoints: string[];
  weakPoints: string[];
  starStories: (string | StarStory)[];
}

export interface ScoreDimension {
  name: string;
  score: number;
  comment: string;
}

export interface ResumeScore {
  total: number;
  dimensions: ScoreDimension[];
  summary: string;
  improvements: string[];
}

export interface PolishResult {
  polishedResume: string;
  changes: { original: string; modified: string; reason: string }[];
  jdKeywords: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
  suggestions: string[];
  interviewPrep?: InterviewPrep;
  resumeScore?: ResumeScore;
}

function extractJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try { return JSON.parse(match[1]); } catch { /* continue */ }
    }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch { /* continue */ }
    }
  }
  throw new Error("无法从 AI 返回内容中解析 JSON");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { resume, jd, templateId, formatId } = body as {
      resume?: string; jd?: string; templateId?: TemplateId; formatId?: FormatId;
    };

    if (!resume || !jd) {
      return NextResponse.json({ error: "请提供简历文本和JD文本" }, { status: 400 });
    }
    if (resume.trim().length < 20) {
      return NextResponse.json({ error: "简历内容太短，请粘贴更完整的简历" }, { status: 400 });
    }
    if (jd.trim().length < 10) {
      return NextResponse.json({ error: "JD内容太短，请粘贴完整的职位描述" }, { status: 400 });
    }

    const messages = buildPolishPrompt(resume, jd, templateId || "professional", formatId || "classic");

    // 输出结构大（润色全文+修改清单+评分+面试准备），4096 容易截断导致 JSON 解析失败；
    // 开 JSON 模式 + 8192 上限 + 失败自动降级重试一次（更低温、要求压缩输出）
    let parsed: Partial<PolishResult> | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      const attemptMessages = attempt === 0
        ? messages
        : [...messages, {
            role: "user" as const,
            content: "上一次输出未能解析为 JSON。请重新输出完整结果：只输出一个 JSON 对象；changes 最多 8 条、suggestions 最多 5 条、starStories 最多 3 条，其余字段保持精简，确保在长度限制内完整输出。",
          }];
      try {
        const rawResponse = await callDeepSeek(attemptMessages, {
          temperature: attempt === 0 ? 0.7 : 0.3,
          maxTokens: 8192,
          jsonMode: true,
        });
        parsed = extractJSON(rawResponse) as Partial<PolishResult>;
      } catch (e) {
        lastError = e;
      }
    }
    if (!parsed) {
      throw lastError instanceof Error ? lastError : new Error("无法从 AI 返回内容中解析 JSON");
    }

    const result: PolishResult = {
      polishedResume: parsed.polishedResume || "（AI 未返回润色正文，请重试）",
      changes: Array.isArray(parsed.changes) ? parsed.changes : [],
      jdKeywords: Array.isArray(parsed.jdKeywords) ? parsed.jdKeywords : [],
      matchedKeywords: Array.isArray(parsed.matchedKeywords) ? parsed.matchedKeywords : [],
      missingKeywords: Array.isArray(parsed.missingKeywords) ? parsed.missingKeywords : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      interviewPrep: parsed.interviewPrep || {
        likelyQuestions: [],
        talkingPoints: [],
        weakPoints: [],
        starStories: [],
      },
      resumeScore: parsed.resumeScore || undefined,
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error("[polish] error:", error);
    return NextResponse.json({ error: `润色失败: ${message}` }, { status: 500 });
  }
}
