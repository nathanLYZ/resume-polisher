"use client";

/**
 * 深度模式进度步进器 —— 生成 → 体检 → 审查 → 修订 → 评分
 * 由 SSE stage 事件驱动(step: 当前激活步骤下标,detail: 工具级进度文案)
 */
import { Check, Loader2, PenLine, ShieldCheck, Swords, RefreshCw, BarChart3 } from "lucide-react";

const STEPS = [
  { label: "生成草稿", icon: PenLine },
  { label: "确定性体检", icon: ShieldCheck },
  { label: "对抗审查", icon: Swords },
  { label: "修订", icon: RefreshCw },
  { label: "评分与面试建议", icon: BarChart3 },
];

export default function AgentProgress({ step, detail }: { step: number; detail: string }) {
  return (
    <div className="w-full max-w-xs mx-auto space-y-3">
      <ol className="space-y-1" aria-label="深度润色进度">
        {STEPS.map(({ label, icon: Icon }, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li
              key={label}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? "bg-brand-50 text-brand-700 font-medium" : done ? "text-slate-500" : "text-slate-300"
              }`}
            >
              <span
                className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border ${
                  active
                    ? "border-brand-500 bg-white text-brand-600"
                    : done
                      ? "border-green-200 bg-green-50 text-green-500"
                      : "border-slate-200 text-slate-300"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              </span>
              <span>{label}</span>
              {active && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />}
            </li>
          );
        })}
      </ol>
      {detail && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-left text-xs text-slate-500">{detail}</p>
      )}
    </div>
  );
}
