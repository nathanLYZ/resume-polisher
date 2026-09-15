"use client";

/**
 * 体检报告视图 —— 九项确定性检查的清单式报告
 * 数据来自 /api/checks 或 agent 循环的 reviewReport(结构一致)
 */
import {
  ShieldCheck, CheckCircle2, AlertTriangle, XCircle, Lightbulb, Bot, Code2,
  Hash, Clock, ScanSearch, FileWarning, LayoutTemplate, Target, UserX, Languages, FileText,
} from "lucide-react";

export interface HealthIssue {
  check: string;
  severity: "blocker" | "warning";
  location: string;
  evidence: string;
  fixHint: string;
  source?: "code" | "review";
}

export interface HealthReport {
  issues: HealthIssue[];
  blockerCount: number;
  warningCount: number;
  passed: boolean;
}

/** 九项确定性检查(顺序即报告网格顺序) */
const CODE_CHECKS: { key: string; label: string; icon: typeof Hash }[] = [
  { key: "number_conservation", label: "数字守恒", icon: Hash },
  { key: "timeline", label: "时间线", icon: Clock },
  { key: "keyword_coverage", label: "关键词覆盖", icon: ScanSearch },
  { key: "jd_copy", label: "JD 照搬", icon: FileWarning },
  { key: "structure", label: "结构完整", icon: LayoutTemplate },
  { key: "keyword_stuffing", label: "关键词实词化", icon: Target },
  { key: "age_tenure", label: "年龄/工龄", icon: UserX },
  { key: "english_mixing", label: "中英夹杂", icon: Languages },
  { key: "page_estimate", label: "篇幅估算", icon: FileText },
];

const ISSUE_LABELS: Record<string, string> = {
  ...Object.fromEntries(CODE_CHECKS.map((c) => [c.key, c.label])),
  // LLM 审查类型
  fabrication: "虚构经历", job_duty_copy: "照搬JD", internal_codename: "内部代号",
  jargon: "外行可读性", empty_bullets: "职责流水账", changes_mismatch: "修改说明不符",
  summary_structure: "简介结构", career_arc: "成长弧线", project_context: "项目三问", value_anchor: "价值锚点",
};

type CellStatus = "pass" | "warning" | "blocker";

export default function HealthReportView({
  health,
  loading,
  estPages,
}: {
  health: HealthReport | null;
  loading: boolean;
  estPages: number;
}) {
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse" aria-label="体检进行中">
        <div className="h-16 rounded-lg bg-slate-100" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-slate-100" />
          ))}
        </div>
        <p className="text-center text-xs text-slate-400">九项确定性检查运行中…</p>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="text-center py-10">
        <ShieldCheck className="mx-auto h-8 w-8 text-slate-200" />
        <p className="text-sm text-slate-400 mt-3">暂无体检报告</p>
        <p className="text-xs text-slate-300 mt-1">润色完成后自动生成;体检为本地确定性规则检查,不调用 AI</p>
      </div>
    );
  }

  const issuesByCheck = new Map<string, HealthIssue[]>();
  for (const i of health.issues) {
    const list = issuesByCheck.get(i.check) ?? [];
    list.push(i);
    issuesByCheck.set(i.check, list);
  }
  const statusOf = (key: string): CellStatus => {
    const list = issuesByCheck.get(key);
    if (!list || list.length === 0) return "pass";
    return list.some((i) => i.severity === "blocker") ? "blocker" : "warning";
  };
  const reviewIssues = health.issues.filter((i) => i.source === "review");
  const codeIssues = health.issues.filter((i) => i.source !== "review");

  const verdict = health.passed
    ? { icon: CheckCircle2, cls: "border-green-200 bg-green-50 text-green-800", title: "未发现硬伤,可以投递" }
    : { icon: XCircle, cls: "border-red-200 bg-red-50 text-red-800", title: `发现 ${health.blockerCount} 个硬伤,建议修订后再投递` };
  const VerdictIcon = verdict.icon;

  return (
    <div className="space-y-4">
      {/* 结论横幅 */}
      <div className={`flex items-start gap-3 rounded-xl border p-3.5 ${verdict.cls}`}>
        <VerdictIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{verdict.title}</p>
          <p className="text-xs mt-0.5 opacity-80">
            {health.passed && health.warningCount > 0
              ? `${health.warningCount} 条提示建议人工确认 · `
              : !health.passed
                ? `另有 ${health.warningCount} 条提示 · `
                : ""}
            九项检查均为本地规则校验,结果可复现
          </p>
        </div>
      </div>

      {/* 九项检查网格 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <ShieldCheck className="h-4 w-4 text-brand-600" />确定性检查
          </h3>
          <span className="text-xs text-slate-400">📄 预计篇幅:约 {Math.max(1, Math.round(estPages * 10) / 10)} 页</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {CODE_CHECKS.map(({ key, label, icon: Icon }) => {
            const st = statusOf(key);
            const n = (issuesByCheck.get(key) ?? []).length;
            return (
              <div
                key={key}
                title={n > 0 ? `${n} 条发现` : "通过"}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                  st === "blocker"
                    ? "border-red-200 bg-red-50"
                    : st === "warning"
                      ? "border-amber-200 bg-amber-50"
                      : "border-slate-100 bg-slate-50"
                }`}
              >
                {st === "blocker" ? (
                  <XCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
                ) : st === "warning" ? (
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-500" />
                )}
                <div className="min-w-0">
                  <p className={`text-xs font-medium truncate ${st === "pass" ? "text-slate-500" : "text-slate-800"}`}>{label}</p>
                  <p className="text-[10px] leading-3 text-slate-400">{st === "pass" ? "通过" : `${n} 条`}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 问题明细(硬伤在前) */}
      {(["blocker", "warning"] as const).map((sev) => {
        const list = health.issues.filter((i) => i.severity === sev);
        if (list.length === 0) return null;
        return (
          <div key={sev}>
            <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2">
              {sev === "blocker" ? <XCircle className="h-4 w-4 text-red-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
              {sev === "blocker" ? "硬伤" : "提示"}
              <span className="text-xs font-normal text-slate-400">({list.length})</span>
            </h3>
            <div className="space-y-2">
              {list.map((issue, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg border border-l-4 bg-white p-3 shadow-sm ${
                    sev === "blocker" ? "border-red-200 border-l-red-400" : "border-amber-200 border-l-amber-400"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${
                      sev === "blocker" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {issue.source === "review" ? <Bot className="h-3 w-3" /> : <Code2 className="h-3 w-3" />}
                      {issue.source === "review" ? "AI 审查" : "规则检查"}
                    </span>
                    <span className="text-xs font-semibold text-slate-700">{ISSUE_LABELS[issue.check] || issue.check}</span>
                    <span className="text-xs text-slate-400">{issue.location}</span>
                  </div>
                  <p className="text-sm text-slate-700">{issue.evidence}</p>
                  <p className="inline-flex items-start gap-1 text-xs text-slate-500 mt-1.5">
                    <Lightbulb className="h-3.5 w-3.5 mt-px flex-shrink-0 text-slate-400" />
                    {issue.fixHint}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {health.issues.length === 0 && (
        <p className="inline-flex items-center gap-1.5 text-xs text-green-600">
          <CheckCircle2 className="h-3.5 w-3.5" />九项检查全部通过,未产生任何发现
        </p>
      )}
      {reviewIssues.length > 0 && codeIssues.length === 0 && health.passed && (
        <p className="text-[10px] text-slate-300">审查发现均已低于 blocker 阈值</p>
      )}
    </div>
  );
}
