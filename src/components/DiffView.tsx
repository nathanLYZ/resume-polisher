"use client";

import { useMemo } from "react";

interface DiffViewProps {
  original: string;
  modified: string;
}

/**
 * 简单的逐行 diff 组件
 * 按 \n 分割后逐行对比，新增行标绿，删除行标红
 */
export default function DiffView({ original, modified }: DiffViewProps) {
  const { originalLines, modifiedLines, diffLines } = useMemo(() => {
    const originalLines = original.split("\n");
    const modifiedLines = modified.split("\n");

    // 简单 LCS diff
    const diffLines = computeLineDiff(originalLines, modifiedLines);
    return { originalLines, modifiedLines, diffLines };
  }, [original, modified]);

  return (
    <div className="space-y-0.5 text-sm leading-relaxed font-mono">
      {diffLines.map((line, idx) => {
        if (line.type === "same") {
          return (
            <div key={idx} className="px-2 py-0.5 text-slate-600 whitespace-pre-wrap">
              {line.content || "\u00A0"}
            </div>
          );
        }
        if (line.type === "add") {
          return (
            <div key={idx} className="px-2 py-0.5 diff-add whitespace-pre-wrap">
              + {line.content || "\u00A0"}
            </div>
          );
        }
        if (line.type === "del") {
          return (
            <div key={idx} className="px-2 py-0.5 diff-del whitespace-pre-wrap">
              - {line.content || "\u00A0"}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

type DiffType = "same" | "add" | "del";
interface DiffLine {
  type: DiffType;
  content: string;
}

/**
 * 基于 LCS 的行级 diff
 */
function computeLineDiff(
  a: string[],
  b: string[]
): DiffLine[] {
  const n = a.length;
  const m = b.length;
  // LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0)
  );

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const result: DiffLine[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: "same", content: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "add", content: b[j - 1] });
      j--;
    } else {
      result.unshift({ type: "del", content: a[i - 1] });
      i--;
    }
  }

  return result;
}
