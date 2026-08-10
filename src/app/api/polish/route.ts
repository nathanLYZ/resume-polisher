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
    const rawResponse = await callDeepSeek(messages, { temperature: 0.7, maxTokens: 4096 });

    const parsed = extractJSON(rawResponse) as Partial<PolishResult>;

    const result: PolishResult = {
      polishedResume: parsed.polishedResume || rawResponse,
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
