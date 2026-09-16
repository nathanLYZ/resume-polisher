"use client";

/**
 * ATS 筛选模拟视图 —— 润色前 vs 润色后 双栏对比
 * 数据来自 POST /api/ats/screen(确定性规则打分,非真实商业 ATS)
 */
import { useMemo } from "react";
import {
  ScanSearch, CheckCircle2, XCircle, AlertTriangle, Info,
  GraduationCap, CalendarClock, Languages, Tags, FileText, Mail,
} from "lucide-react";

export interface AtsScreenResult {
  score: number;
  verdict: "likely_pass" | "borderline" | "likely_reject";
  keywords: {
    total: number; matched: string[]; missing: string[];
    hitRate: number; score: number; source: string;
  };
  hardRequirements: {
    items: { requirement: string; type: string; status: string; evidence?: string }[];
    metRatio: number; score: number; estimatedYears?: number;
  };
  parseability: { score: number; checks: { name: string; ok: boolean; detail: string }[] };
  format: { score: number; notes: string[] };
  summary: string;
}

function verdictStyle(v: AtsScreenResult["verdict"]) {
  if (v === "likely_pass") return { label: "大概率通过初筛", cls: "text-green-600 bg-green-50 border-green-200", bar: "bg-green-500" };
  if (v === "borderline") return { label: "边缘,建议修订", cls: "text-amber-600 bg-amber-50 border-amber-200", bar: "bg-amber-500" };
  return { label: "大概率被筛掉", cls: "text-red-600 bg-red-50 border-red-200", bar: "bg-red-500" };
}

const HARD_ICON: Record<string, typeof GraduationCap> = {
  years: CalendarClock, degree: GraduationCap, language: Languages,
};

function ScoreColumn({ title, result, baseline }: { title: string; result: AtsScreenResult; baseline?: AtsScreenResult }) {
  const v = verdictStyle(result.verdict);
  const delta = baseline ? result.score - baseline.score : null;

  return (
    <div className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</span>
        {delta !== null && delta !== 0 && (
          <span className={`text-xs font-bold ${delta > 0 ? "text-green-600" : "text-red-500"}`}>
            {delta > 0 ? `+${delta}` : delta} 分
          </span>
        )}
      </div>

      {/* 总分 */}
      <div className={`flex items-center gap-3 rounded-lg border p-3 mb-3 ${v.cls}`}>
        <span className="text-3xl font-bold tabular-nums">{result.score}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{v.label}</p>
          <div className="h-1.5 rounded-full bg-white/70 mt-1.5 overflow-hidden">
            <div className={`h-full ${v.bar} rounded-full`} style={{ width: `${result.score}%` }} />
          </div>
        </div>
      </div>

      {/* 四维分项 */}
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {[
          { name: "关键词", score: result.keywords.score, full: 40 },
          { name: "硬性条件", score: result.hardRequirements.score, full: 30 },
          { name: "可解析", score: result.parseability.score, full: 20 },
          { name: "格式", score: result.format.score, full: 10 },
        ].map((d) => (
          <div key={d.name} className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1.5 text-center">
            <p className="text-sm font-bold text-slate-800 tabular-nums leading-5">{d.score}<span className="text-[10px] font-normal text-slate-400">/{d.full}</span></p>
            <p className="text-[10px] text-slate-500">{d.name}</p>
          </div>
        ))}
      </div>

      {/* 硬性条件明细 */}
      {result.hardRequirements.items.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {result.hardRequirements.items.map((item) => {
            const Icon = HARD_ICON[item.type] ?? Info;
            const st = item.status === "met" ? "green" : item.status === "missing" ? "red" : "slate";
            return (
              <div key={item.requirement} className="flex items-start gap-2 text-xs">
                <Icon className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${st === "green" ? "text-green-500" : st === "red" ? "text-red-500" : "text-slate-300"}`} />
                <span className={st === "red" ? "text-red-600 font-medium" : "text-slate-600"}>
                  {item.requirement}
                  {item.evidence && <span className="ml-1 text-slate-400 font-normal">{item.evidence}</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* 缺失关键词 */}
      {result.keywords.missing.length > 0 && (
        <div className="mb-3">
          <p className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 mb-1.5">
            <Tags className="h-3.5 w-3.5 text-red-400" />缺失关键词({result.keywords.missing.length}/{result.keywords.total})
          </p>
          <div className="flex flex-wrap gap-1">
            {result.keywords.missing.slice(0, 8).map((kw) => (
              <span key={kw} className="px-2 py-0.5 text-[10px] font-medium bg-red-50 text-red-600 border border-red-100 rounded-full truncate max-w-[140px]">{kw}</span>
            ))}
          </div>
        </div>
      )}

      {/* 可解析性明细 */}
      <div className="space-y-1">
        {result.parseability.checks.map((c) => (
          <div key={c.name} className="flex items-start gap-2 text-xs">
            {c.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-500" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-400" />}
            <span className={c.ok ? "text-slate-500" : "text-slate-600"}>
              {c.name}<span className="text-slate-400 ml-1">{c.detail}</span>
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 border-t border-slate-100 pt-2.5 text-xs text-slate-500">{result.summary}</p>
    </div>
  );
}

export default function AtsScreenView({
  loading,
  error,
  original,
  polished,
}: {
  loading: boolean;
  error: string;
  original: AtsScreenResult | null;
  polished: AtsScreenResult | null;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-pulse" aria-label="筛选进行中">
        <div className="h-80 rounded-xl bg-slate-100" />
        <div className="h-80 rounded-xl bg-slate-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
    );
  }

  if (!original) {
    return (
      <div className="text-center py-10">
        <ScanSearch className="mx-auto h-8 w-8 text-slate-200" />
        <p className="text-sm text-slate-400 mt-3">暂无筛选报告</p>
        <p className="text-xs text-slate-300 mt-1">润色完成后自动模拟 ATS 初筛;本地确定性规则,不调用 AI</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="inline-flex items-start gap-1.5 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
        模拟主流 ATS 的规则筛选层(关键词命中/硬性条件/可解析性/格式),不模拟语义排序与人眼判断;分数仅供投递前自检,非任何商业系统的真实评分。
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ScoreColumn title="润色前(原文)" result={original} />
        {polished && <ScoreColumn title="润色后" result={polished} baseline={original} />}
      </div>
      {polished && (
        <p className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <Mail className="h-3 w-3" />可解析性依据:邮箱/手机可提取、分区齐全、时间线可定位——解析失败在真实 ATS 中常直接进人才库
        </p>
      )}
    </div>
  );
}