"use client";

import { useState, useEffect, useRef } from "react";
import {
  Sparkles, Download, Clipboard, Check, FileDown, FileType2, Printer, Eye, FileText,
  GitCompare, ListChecks, ShieldCheck, Tags, MessagesSquare, BarChart3, BookOpen, History, ScanSearch,
} from "lucide-react";
import DiffView from "@/components/DiffView";
import ResumePreview from "@/components/ResumePreview";
import ResumeTemplateForm from "@/components/ResumeTemplateForm";
import HealthReportView from "@/components/HealthReportView";
import AgentProgress from "@/components/AgentProgress";
import ResumePrintView from "@/components/ResumePrintView";
import AtsScreenView, { type AtsScreenResult } from "@/components/AtsScreenView";
import { TEMPLATES, type TemplateId } from "@/lib/templates";
import { FORMATS, type FormatId } from "@/lib/resumeFormats";
import { THEME_LIST, type ThemeId } from "@/lib/resumeThemes";
import { estimatePages } from "@/lib/agent/checks";
import { EXAMPLE_RESUME, EXAMPLE_JD } from "@/lib/exampleResume";
import { getHistory, addHistory, deleteHistory, clearHistory, formatTime, saveDraft, loadDraft, type HistoryItem } from "@/lib/storage";

interface Change { original: string; modified: string; reason: string; }
interface StarStory { situation?: string; task?: string; action?: string; result?: string; }
interface InterviewPrep {
  likelyQuestions: string[]; talkingPoints: string[];
  weakPoints: string[]; starStories: (string | StarStory)[];
}
interface ScoreDimension { name: string; score: number; comment: string; }
interface ResumeScore { total: number; dimensions: ScoreDimension[]; summary: string; improvements: string[]; }
interface PolishResult {
  polishedResume: string; changes: Change[];
  jdKeywords: string[]; matchedKeywords: string[];
  missingKeywords: string[]; suggestions: string[];
  interviewPrep?: InterviewPrep;
  resumeScore?: ResumeScore;
}
interface ImportedJD { hasNew: boolean; jobTitle?: string; company?: string; salary?: string; city?: string; jdText?: string; jobUrl?: string; }
interface KeywordEntry { keyword: string; count: number; firstSeen: number; lastSeen: number; jobTitles: string[]; }
type Tab = "preview" | "polished" | "diff" | "changes" | "health" | "ats" | "analysis" | "interview" | "score" | "keywordbank" | "history";
interface HealthIssue { check: string; severity: "blocker" | "warning"; location: string; evidence: string; fixHint: string; }
interface HealthReport { issues: HealthIssue[]; blockerCount: number; warningCount: number; passed: boolean; }
const STAGE_LABELS: Record<string, string> = {
  draft: "AI 润色简历", checks: "确定性体检", review: "AI 对抗审查",
  revise: "修订润色稿", finalize: "生成评分与面试建议",
};
interface ReviewReportInfo { iterations: number; passed: boolean; issues: HealthIssue[]; elapsedMs: number; }
type DeepPolishResult = PolishResult & { reviewReport?: ReviewReportInfo };

export default function Home() {
  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PolishResult | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("preview");
  const [copied, setCopied] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>("professional");
  const [selectedFormat, setSelectedFormat] = useState<FormatId>("classic");
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>("modern-blue");
  const [importedInfo, setImportedInfo] = useState<{ jobTitle: string; company: string; jobUrl: string } | null>(null);
  const [keywordBank, setKeywordBank] = useState<KeywordEntry[]>([]);
  const [keywordBankTotal, setKeywordBankTotal] = useState(0);
  const [kwSort, setKwSort] = useState<"count" | "recent">("count");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [polishStep, setPolishStep] = useState(0); // 0=空闲 1=分析JD 2=润色简历 3=生成评分/面试建议
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [ats, setAts] = useState<{ original: AtsScreenResult | null; polished: AtsScreenResult | null } | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [atsError, setAtsError] = useState("");
  const [deepMode, setDeepMode] = useState(true);
  const [agentStage, setAgentStage] = useState("");
  const [dragging, setDragging] = useState(false);      // 简历文件拖拽悬停中
  const [extracting, setExtracting] = useState(false);  // 文件解析中
  const [extractMsg, setExtractMsg] = useState("");     // 解析成功提示
  const [extractError, setExtractError] = useState(""); // 解析失败提示
  const [agentStep, setAgentStep] = useState(0);
  const [jdUrl, setJdUrl] = useState("");
  const [jdUrlLoading, setJdUrlLoading] = useState(false);
  const [jdUrlError, setJdUrlError] = useState("");
  const [research, setResearch] = useState<{
    loading: boolean; context?: string; summary?: string;
    sources?: { title: string; url: string; snippet: string }[]; error?: string;
  } | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  useEffect(() => {
    pollTimerRef.current = setInterval(async () => {
      pollCountRef.current++;
      if (pollCountRef.current > 150) { if (pollTimerRef.current) clearInterval(pollTimerRef.current); return; }
      try {
        const res = await fetch("/api/import-jd");
        const data: ImportedJD = await res.json();
        if (data.hasNew && data.jdText) {
          setJd(data.jdText);
          setImportedInfo({ jobTitle: data.jobTitle || "", company: data.company || "", jobUrl: data.jobUrl || "" });
          pollCountRef.current = 0;
        }
      } catch { /* ignore */ }
    }, 2000);
    // 加载历史记录
    setHistory(getHistory());
    // 加载草稿
    const draft = loadDraft();
    if (draft) {
      if (draft.resume) setResume(draft.resume);
      if (draft.jd) setJd(draft.jd);
      if (draft.templateId) setSelectedTemplate(draft.templateId as TemplateId);
      if (draft.formatId) setSelectedFormat(draft.formatId as FormatId);
      if (draft.themeId) setSelectedTheme(draft.themeId as ThemeId);
    }
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, []);

  async function loadKeywordBank(sort: "count" | "recent") {
    try {
      const res = await fetch(`/api/keyword-bank?sort=${sort}&limit=100`);
      const data = await res.json();
      setKeywordBank(data.keywords || []); setKeywordBankTotal(data.total || 0);
    } catch { /* ignore */ }
  }

  async function submitKeywords(keywords: string[], jobTitle: string) {
    if (!keywords || keywords.length === 0) return;
    try { await fetch("/api/keyword-bank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywords, jobTitle }) }); } catch { /* ignore */ }
  }

  async function clearKeywordBank() {
    if (!confirm("确定清空关键词库？")) return;
    try { await fetch("/api/keyword-bank", { method: "DELETE" }); setKeywordBank([]); setKeywordBankTotal(0); } catch { /* ignore */ }
  }

  function fillExample() {
    setResume(EXAMPLE_RESUME);
    setJd(EXAMPLE_JD);
  }

  function handleClearAll() {
    if (!confirm("清空当前输入的简历和JD？")) return;
    setResume(""); setJd(""); setError(""); setResult(null); setHealth(null); setAts(null);
  }

  /** 体检:对润色稿跑确定性检查(纯规则,零 LLM 调用),只报告不闭环 */
  async function runHealthCheck(original: string, jdText: string, polished: string, matched: string[], template: TemplateId) {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/checks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ original, jd: jdText, polished, matchedKeywords: matched, templateId: template }),
      });
      const data = await res.json() as HealthReport & { error?: string };
      if (res.ok) setHealth(data); // 体检是辅助功能,失败静默
    } catch { /* ignore */ }
    finally { setHealthLoading(false); }
  }

  /** 收尾补齐:主结果拿到后,异步补面试建议+评分(不占主请求时长;失败静默) */
  async function runFinalize(original: string, jdText: string, polished: string) {
    try {
      const res = await fetch("/api/polish/finalize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: original, jd: jdText, polished }),
      });
      if (!res.ok) return;
      const data = await res.json() as { interviewPrep?: PolishResult["interviewPrep"]; resumeScore?: PolishResult["resumeScore"] };
      // 合并进当前结果(用户可能已切换/重新润色,仅当结果还是这份时生效)
      setResult((prev) => {
        if (!prev || prev.polishedResume !== polished) return prev;
        const merged = { ...prev };
        if (data.interviewPrep?.likelyQuestions?.length) merged.interviewPrep = data.interviewPrep;
        if (data.resumeScore?.total) merged.resumeScore = data.resumeScore;
        return merged;
      });
    } catch { /* 收尾失败静默:主结果已交付,Tab 守卫隐藏 */ }
  }

  /** ATS 筛选模拟:原文 vs 润色稿双份(确定性规则,零 LLM 调用) */
  async function runAtsScreen(original: string, jdText: string, polished: string, keywords: string[]) {
    setAtsLoading(true); setAtsError("");
    try {
      const res = await fetch("/api/ats/screen", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ original, jd: jdText, polished, jdKeywords: keywords }),
      });
      const data = await res.json() as { original?: AtsScreenResult; polished?: AtsScreenResult; error?: string };
      if (!res.ok || !data.original) { setAtsError(data.error || "筛选失败"); setAts(null); }
      else { setAts({ original: data.original, polished: data.polished ?? null }); }
    } catch { setAtsError("网络错误"); }
    finally { setAtsLoading(false); }
  }

  /** 统一收尾:展示结果、水合体检报告(深度模式直接用循环产出,简单模式补一次 /api/checks)、词库与历史 */
  function applyResult(data: DeepPolishResult) {
    setResult(data);
    runAtsScreen(resume, jd, data.polishedResume, data.jdKeywords || []);
    if (!data.interviewPrep?.likelyQuestions?.length && !data.resumeScore?.total) {
      runFinalize(resume, jd, data.polishedResume); // 主结果缺收尾时异步补(深度模式已解耦)
    }
    const report = data.reviewReport;
    if (report) {
      const blockerCount = report.issues.filter((i) => i.severity === "blocker").length;
      setHealth({ issues: report.issues, blockerCount, warningCount: report.issues.length - blockerCount, passed: report.passed });
    } else {
      runHealthCheck(resume, jd, data.polishedResume, data.matchedKeywords || [], selectedTemplate);
    }
    if (data.jdKeywords && data.jdKeywords.length > 0) submitKeywords(data.jdKeywords, importedInfo?.jobTitle || "");
    // 保存到历史记录
    addHistory({
      templateName: TEMPLATES[selectedTemplate].name,
      formatName: FORMATS[selectedFormat].name,
      jobTitle: importedInfo?.jobTitle || "",
      company: importedInfo?.company || "",
      originalResume: resume,
      polishedResume: data.polishedResume,
      jdKeywords: data.jdKeywords || [],
      matchedKeywords: data.matchedKeywords || [],
      missingKeywords: data.missingKeywords || [],
      suggestions: data.suggestions || [],
      score: data.resumeScore?.total,
    });
    setHistory(getHistory());
  }

  function beginRun(): boolean {
    if (!resume.trim() || !jd.trim()) { setError("请填写简历和JD"); return false; }
    setLoading(true); setError(""); setResult(null); setActiveTab("preview"); setHealth(null); setAts(null); setAgentStage("");
    return true;
  }

  /** 简单模式:旧单次调用(/api/polish,降级基线) */
  async function runSimple() {
    setPolishStep(1);
    // 模拟分步进度（实际 API 一次调用，这里用计时器给用户反馈）
    const stepTimer1 = setTimeout(() => setPolishStep(2), 3000);
    const stepTimer2 = setTimeout(() => setPolishStep(3), 8000);
    try {
      const res = await fetch("/api/polish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, jd, templateId: selectedTemplate, formatId: selectedFormat }),
      });
      const data = await res.json() as PolishResult & { error?: string };
      if (!res.ok) { setError(data.error || "请求失败"); }
      else {
        applyResult(data);
        clearTimeout(stepTimer1); clearTimeout(stepTimer2); setPolishStep(0);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "网络错误"); }
    finally { setLoading(false); clearTimeout(stepTimer1); clearTimeout(stepTimer2); setPolishStep(0); }
  }

  /** 深度模式:agent 循环,SSE 流式(/api/polish/agent) */
  async function runDeep() {
    setPolishStep(1);
    try {
      const res = await fetch("/api/polish/agent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, jd, templateId: selectedTemplate, formatId: selectedFormat, companyContext: research?.context }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(err?.error || `请求失败(${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finished = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const lines = part.split("\n");
          const type = (lines.find((l) => l.startsWith("event: ")) ?? "").slice(7).trim();
          const dataLine = lines.find((l) => l.startsWith("data: "));
          if (!type || !dataLine) continue;
          const payload = JSON.parse(dataLine.slice(6)) as {
            stage?: string; status?: string; iteration?: number; detail?: string;
            verdict?: string; blockerCount?: number; message?: string;
          };
          if (type === "stage") {
            const label = payload.detail || STAGE_LABELS[payload.stage ?? ""] || payload.stage || "";
            const round = (payload.iteration ?? 0) > 0 ? `(第${(payload.iteration ?? 0) + 1}轮)` : "";
            const stepMap: Record<string, number> = { draft: 0, checks: 1, review: 2, revise: 3, finalize: 4 };
            const st = payload.stage ?? "";
            if (st in stepMap) setAgentStep(stepMap[st]);
            setPolishStep(payload.stage === "finalize" ? 3 : 2);
            setAgentStage(payload.status === "start" ? `${label}${round}…` : "");
          } else if (type === "issues") {
            if (payload.verdict === "revise") { setAgentStep(3); setAgentStage(`提交被拒:发现 ${payload.blockerCount} 个硬伤,自动修订中…`); }
            else { setAgentStage("审查通过,生成评分与面试建议…"); }
          } else if (type === "result") {
            finished = true;
            const r = payload as unknown as DeepPolishResult;
            if (!r.polishedResume) {
              // 看门狗降级/空产出:不渲染"成功",把降级提示作为错误展示
              throw new Error(r.suggestions?.[0] || "深度润色超时,请重试或切换快速模式");
            }
            applyResult(r);
          } else if (type === "error") {
            throw new Error(payload.message || "深度润色失败");
          }
        }
      }
      if (!finished) throw new Error("连接中断,请重试");
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setLoading(false); setPolishStep(0); setAgentStage("");
    }
  }

  /** 拖入 / 选择 / 粘贴的文件 → 解析成文本填进简历框 */
  async function extractFile(file: File) {
    setExtractMsg(""); setExtractError("");
    if (file.size > 10 * 1024 * 1024) {
      setExtractError(`文件 ${(file.size / 1024 / 1024).toFixed(1)}MB 超过 10MB，请压缩后再传`);
      return;
    }
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract-resume", { method: "POST", body: fd });
      const data = await res.json() as { text?: string; chars?: number; pages?: number; source?: string; warning?: string; error?: string };
      if (!res.ok || data.error) { setExtractError(data.error || "解析失败，请直接把简历文字粘贴进来"); return; }
      setResume(data.text || "");
      setExtractMsg(
        `✅ 已从「${data.source}」提取 ${data.chars} 字${data.pages ? `（${data.pages} 页）` : ""}` +
        `${data.warning ? ` · ⚠ ${data.warning}` : " · 建议通读一遍，PDF 提取偶尔会掉行"}`
      );
    } catch (e) {
      setExtractError(`上传失败：${e instanceof Error ? e.message : "网络错误"}`);
    } finally {
      setExtracting(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (loading || extracting) return;
    const f = e.dataTransfer.files?.[0];
    if (f) extractFile(f);
    else setExtractError("没识别到文件，请拖入 PDF / Word / txt 文件");
  }

  async function handlePolish() {
    if (!beginRun()) return;
    if (deepMode) await runDeep(); else await runSimple();
  }

  function restoreHistory(item: HistoryItem) {
    setHealth(null);
    setAts(null);
    setResume(item.originalResume);
    setResult({
      polishedResume: item.polishedResume,
      changes: [],
      jdKeywords: item.jdKeywords,
      matchedKeywords: item.matchedKeywords,
      missingKeywords: item.missingKeywords,
      suggestions: item.suggestions,
    });
    setActiveTab("preview");
  }

  function handleDeleteHistory(id: string) {
    deleteHistory(id);
    setHistory(getHistory());
  }

  function handleClearHistory() {
    if (!confirm("确定清空所有历史记录？")) return;
    clearHistory();
    setHistory([]);
  }

  function handleCopy() { if (!result?.polishedResume) return; navigator.clipboard.writeText(result.polishedResume); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  function handleExportMD() { if (!result?.polishedResume) return; const blob = new Blob([result.polishedResume], { type: "text/markdown;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "resume-polished.md"; a.click(); URL.revokeObjectURL(url); }
  function handlePrint() { window.print(); }
  function handleExportPDF() {
    // 文本层守则:浏览器"另存为 PDF"保留文本层,ATS 可解析;截图类导出(html2canvas 等)会变成纯图片
    if (confirm("将打开打印对话框——请选择「另存为 PDF」。此路径保留文本层,ATS 系统可解析;请勿用截图类工具导出(会变成纯图片)。")) handlePrint();
  }
  function clearImported() { setImportedInfo(null); setResearch(null); }

  /** URL 抓取 JD(BOSS直聘有登录墙,该站走油猴脚本) */
  async function importJdFromUrl() {
    if (!jdUrl.trim()) return;
    setJdUrlLoading(true); setJdUrlError("");
    try {
      const res = await fetch("/api/import-jd/url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: jdUrl.trim() }),
      });
      const data = await res.json() as { title?: string; text?: string; error?: string };
      if (!res.ok || !data.text) { setJdUrlError(data.error || "抓取失败"); }
      else {
        setJd(data.text);
        setImportedInfo({ jobTitle: data.title || "", company: "", jobUrl: jdUrl.trim() });
        setJdUrl("");
      }
    } catch { setJdUrlError("网络错误"); }
    finally { setJdUrlLoading(false); }
  }

  /** 公司调研(可选,需配置 TAVILY_API_KEY 或 BOCHA_API_KEY);结果注入深度模式上下文 */
  async function researchCompany() {
    const company = importedInfo?.company?.trim() || window.prompt("输入要调研的公司名:") || "";
    if (!company) return;
    setResearch({ loading: true });
    try {
      const res = await fetch("/api/research/company", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company }),
      });
      const data = await res.json() as { configured?: boolean; summary?: string; context?: string; sources?: { title: string; url: string; snippet: string }[]; error?: string };
      if (!res.ok || data.error) { setResearch({ loading: false, error: data.error || "调研失败" }); }
      else { setResearch({ loading: false, context: data.context, summary: data.summary, sources: data.sources }); }
    } catch { setResearch({ loading: false, error: "网络错误" }); }
  }

  // 草稿自动保存（防抖 2 秒）
  useEffect(() => {
    const timer = setTimeout(() => {
      if (resume || jd) {
        saveDraft({ resume, jd, templateId: selectedTemplate, formatId: selectedFormat, themeId: selectedTheme });
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [resume, jd, selectedTemplate, selectedFormat, selectedTheme]);

  useEffect(() => { if (activeTab === "keywordbank") loadKeywordBank(kwSort); }, [activeTab, kwSort]);
  useEffect(() => { if (activeTab === "history") setHistory(getHistory()); }, [activeTab]);

  const hasInterviewPrep = result?.interviewPrep && (result.interviewPrep.likelyQuestions.length > 0 || result.interviewPrep.talkingPoints.length > 0 || result.interviewPrep.weakPoints.length > 0 || result.interviewPrep.starStories.length > 0);
  const hasScore = result?.resumeScore && result.resumeScore.total > 0;

  // 评分颜色
  function scoreColor(score: number) {
    if (score >= 80) return "text-green-600 bg-green-100";
    if (score >= 60) return "text-amber-600 bg-amber-100";
    return "text-red-600 bg-red-100";
  }
  function scoreBar(score: number) {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-amber-500";
    return "bg-red-500";
  }

  return (
    <main className="min-h-screen">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-lg font-bold shadow-sm">简</div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">简历润色助手</h1>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-brand-100 bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">Agent 深度模式</span>
              </div>
              <p className="text-xs text-slate-500">根据JD智能优化，体检 + 对抗审查,不虚构经历</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fillExample} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />填入示例
            </button>
            <a href="/boss-zhipin-jd-sender.user.js" download className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
              <Download className="h-3.5 w-3.5 text-brand-500" />油猴脚本
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 print:max-w-none print:px-0 print:py-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:hidden">
          {/* Left: Input */}
          <div className="space-y-4">
            {/* 简历模版选择器 */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <ResumeTemplateForm onFillResume={(text) => setResume(text)} />
            </div>

            {/* 风格/格式/主题 */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-3"><span className="w-2 h-2 rounded-full bg-brand-500"></span><h2 className="text-sm font-semibold text-slate-700">润色风格</h2></div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.values(TEMPLATES).map((tpl) => (
                    <button key={tpl.id} onClick={() => setSelectedTemplate(tpl.id)} className={`text-left p-2.5 rounded-lg border-2 transition ${selectedTemplate === tpl.id ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <div className="flex items-center gap-1.5"><span className="text-base">{tpl.icon}</span><span className={`text-xs font-semibold ${selectedTemplate === tpl.id ? "text-brand-700" : "text-slate-700"}`}>{tpl.name}</span></div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-3"><span className="w-2 h-2 rounded-full bg-emerald-500"></span><h2 className="text-sm font-semibold text-slate-700">输出格式</h2></div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {Object.values(FORMATS).map((fmt) => (
                    <button key={fmt.id} onClick={() => setSelectedFormat(fmt.id)} className={`text-left p-2.5 rounded-lg border-2 transition ${selectedFormat === fmt.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <div className="flex items-center gap-1"><span className="text-base">{fmt.icon}</span><span className={`text-xs font-semibold ${selectedFormat === fmt.id ? "text-emerald-700" : "text-slate-700"}`}>{fmt.name}</span></div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-3"><span className="w-2 h-2 rounded-full bg-purple-500"></span><h2 className="text-sm font-semibold text-slate-700">视觉主题</h2></div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {THEME_LIST.map((th) => (
                    <button key={th.id} onClick={() => setSelectedTheme(th.id)} className={`p-2 rounded-lg border-2 transition text-center ${selectedTheme === th.id ? "border-purple-500 bg-purple-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <div className="text-lg mb-0.5">{th.icon}</div><div className={`text-[10px] font-medium ${selectedTheme === th.id ? "text-purple-700" : "text-slate-600"}`}>{th.name}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 简历输入（可拖入文件） */}
            <div
              className={`relative bg-white rounded-xl border shadow-sm transition ${dragging ? "border-brand-400 ring-2 ring-brand-100 bg-brand-50/40" : "border-slate-200"}`}
              onDragOver={(e) => { e.preventDefault(); if (!loading && !extracting) setDragging(true); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
              onDrop={handleDrop}
            >
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-brand-500"></span><h2 className="text-sm font-semibold text-slate-700">我的简历</h2></div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{resume.length} 字</span>
                  <label className={`px-2 py-1 text-xs font-medium rounded-md border transition cursor-pointer ${extracting ? "text-slate-400 border-slate-200 cursor-wait" : "text-brand-600 border-brand-200 hover:bg-brand-50"}`}>
                    {extracting ? "⏳ 解析中…" : "📎 上传文件"}
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt,.md"
                      className="hidden"
                      disabled={loading || extracting}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) extractFile(f); e.target.value = ""; }}
                    />
                  </label>
                </div>
              </div>
              <textarea
                value={resume}
                onChange={(e) => setResume(e.target.value)}
                onPaste={(e) => { const f = e.clipboardData?.files?.[0]; if (f) { e.preventDefault(); extractFile(f); } }}
                placeholder="把简历文件拖进来（PDF / Word / txt / md），或直接粘贴文字、用模版填写…"
                className="w-full h-44 p-4 text-sm text-slate-800 resize-y focus:outline-none rounded-xl placeholder:text-slate-400"
                disabled={loading}
              />
              {(extractMsg || extractError) && (
                <div className={`px-4 pb-3 -mt-2 text-[11px] leading-relaxed ${extractError ? "text-red-600" : "text-emerald-700"}`}>
                  {extractError || extractMsg}
                </div>
              )}
              {dragging && (
                <div className="absolute inset-0 rounded-xl bg-white/70 border-2 border-dashed border-brand-400 flex items-center justify-center pointer-events-none">
                  <span className="text-sm font-medium text-brand-700">松手即导入简历文件（PDF / Word / txt）</span>
                </div>
              )}
            </div>

            {/* JD 输入 */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500"></span><h2 className="text-sm font-semibold text-slate-700">目标职位描述 (JD)</h2></div>
                <div className="flex items-center gap-2">
                  {research?.loading ? <span className="text-xs text-indigo-500">调研中…</span> : <button onClick={researchCompany} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium" title="调研公司业务,注入润色上下文(需配置搜索 API)">🔍 调研</button>}
                  <span className="text-xs text-slate-400">{jd.length} 字</span>
                </div>
              </div>
              {importedInfo && (
                <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-emerald-700"><span>📥</span><span>已从BOSS直聘导入：{importedInfo.jobTitle}{importedInfo.company && ` @ ${importedInfo.company}`}</span>{importedInfo.jobUrl && <a href={importedInfo.jobUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline">查看</a>}</div>
                  <button onClick={clearImported} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
                </div>
              )}
              {!importedInfo && (
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-500"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span><span>监听油猴脚本…</span></div>
                  <a href="/boss-zhipin-jd-sender.user.js" download className="text-xs text-brand-600 hover:text-brand-700 font-medium">装脚本</a>
                </div>
              )}
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <span className="text-xs text-slate-400 flex-shrink-0">🔗</span>
                <input value={jdUrl} onChange={(e) => setJdUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && importJdFromUrl()} placeholder="粘贴职位链接,服务端抓取正文(BOSS直聘有登录墙,请用油猴脚本)…" className="flex-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:border-brand-400" disabled={jdUrlLoading || loading} />
                <button onClick={importJdFromUrl} disabled={jdUrlLoading || !jdUrl.trim() || loading} className="px-2.5 py-1.5 text-xs font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-md hover:bg-brand-100 disabled:opacity-40 transition flex-shrink-0">{jdUrlLoading ? "抓取中…" : "抓取"}</button>
              </div>
              {jdUrlError && <div className="px-4 py-1.5 bg-red-50 border-b border-red-100 text-xs text-red-600">{jdUrlError}</div>}
              {research?.summary && (
                <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-indigo-700">🔍 公司调研(已注入深度润色上下文)</span>
                    <button onClick={() => setResearch(null)} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
                  </div>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap">{research.summary.slice(0, 400)}</p>
                  {research.sources && research.sources.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {research.sources.slice(0, 3).map((s, i) => <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-500 underline truncate max-w-[200px] inline-block">{s.title}</a>)}
                    </div>
                  )}
                </div>
              )}
              {research?.error && <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">{research.error}</div>}
              <textarea value={jd} onChange={(e) => setJd(e.target.value)} placeholder="粘贴JD或通过油猴脚本自动导入…" className="w-full h-32 p-4 text-sm text-slate-800 resize-y focus:outline-none rounded-xl placeholder:text-slate-400" disabled={loading} />
            </div>
          </div>

          {/* Right: Results */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={handlePolish} disabled={loading || !resume.trim() || !jd.trim()} className="px-6 py-3 bg-gradient-to-r from-brand-600 to-brand-700 text-white text-sm font-medium rounded-lg hover:from-brand-700 hover:to-brand-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md flex items-center gap-2">
                {loading ? (<><span className="loading-dot w-1.5 h-1.5 rounded-full bg-white inline-block"></span><span className="loading-dot w-1.5 h-1.5 rounded-full bg-white inline-block"></span><span className="loading-dot w-1.5 h-1.5 rounded-full bg-white inline-block"></span><span className="ml-1">{agentStage || (polishStep === 1 ? "分析JD关键词…" : polishStep === 2 ? "润色简历内容…" : polishStep === 3 ? "生成评分和面试建议…" : "润色中…")}</span></>) : (<>✨ 开始润色</>)}
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 select-none" title="生成 → 体检 → 对抗审查 → 修订,模型自主驱动">
                <input type="checkbox" className="peer sr-only" checked={deepMode} onChange={(e) => setDeepMode(e.target.checked)} disabled={loading} />
                <span className="relative h-5 w-9 rounded-full bg-slate-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-brand-600 peer-checked:after:translate-x-4 peer-disabled:opacity-50" />
                <span className="text-xs font-medium text-slate-600">深度模式</span>
              </label>
              {error && <span className="text-sm text-red-600">{error}</span>}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              {result ? (
                <>
                  <div className="border-b border-slate-100 flex items-center gap-1 px-2 overflow-x-auto">
                    <TabButton active={activeTab === "preview"} onClick={() => setActiveTab("preview")}><Eye className="h-3.5 w-3.5" />预览</TabButton>
                    <TabButton active={activeTab === "polished"} onClick={() => setActiveTab("polished")}><FileText className="h-3.5 w-3.5" />纯文本</TabButton>
                    <TabButton active={activeTab === "diff"} onClick={() => setActiveTab("diff")}><GitCompare className="h-3.5 w-3.5" />Diff</TabButton>
                    {result.changes.length > 0 && <TabButton active={activeTab === "changes"} onClick={() => setActiveTab("changes")}><ListChecks className="h-3.5 w-3.5" />修改({result.changes.length})</TabButton>}
                    <TabButton active={activeTab === "health"} onClick={() => setActiveTab("health")}><ShieldCheck className="h-3.5 w-3.5" />体检{health && !healthLoading && (health.blockerCount > 0 ? `(${health.blockerCount})` : <Check className="h-3 w-3 text-green-500" />)}</TabButton>
                    <TabButton active={activeTab === "ats"} onClick={() => setActiveTab("ats")}><ScanSearch className="h-3.5 w-3.5" />ATS</TabButton>
                    <TabButton active={activeTab === "analysis"} onClick={() => setActiveTab("analysis")}><Tags className="h-3.5 w-3.5" />关键词</TabButton>
                    {hasInterviewPrep && <TabButton active={activeTab === "interview"} onClick={() => setActiveTab("interview")}><MessagesSquare className="h-3.5 w-3.5" />面试</TabButton>}
                    {hasScore && <TabButton active={activeTab === "score"} onClick={() => setActiveTab("score")}><BarChart3 className="h-3.5 w-3.5" />评分</TabButton>}
                    <TabButton active={activeTab === "keywordbank"} onClick={() => setActiveTab("keywordbank")}><BookOpen className="h-3.5 w-3.5" />词库</TabButton>
                    {history.length > 0 && <TabButton active={activeTab === "history"} onClick={() => setActiveTab("history")}><History className="h-3.5 w-3.5" />历史({history.length})</TabButton>}
                    <div className="ml-auto flex items-center gap-2 py-2 pr-2 flex-shrink-0">
                      <button onClick={handleCopy} title="复制润色结果" className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition">{copied ? <Check className="h-4 w-4 text-green-500" /> : <Clipboard className="h-4 w-4" />}</button>
                      <button onClick={handleExportMD} title="导出 Markdown" className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition"><FileDown className="h-4 w-4" /></button>
                      <button onClick={handleExportPDF} title="另存为 PDF(保留文本层,ATS 可解析)" className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition"><FileType2 className="h-4 w-4" /></button>
                      <button onClick={handlePrint} title="打印" className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition"><Printer className="h-4 w-4" /></button>
                    </div>
                  </div>

                  <div className="p-4 max-h-[600px] overflow-y-auto print:max-h-none print:overflow-visible print:p-0">
                    {activeTab === "preview" && <div className="print:hidden"><ResumePreview content={result.polishedResume} themeId={selectedTheme} /></div>}
                    {activeTab === "polished" && <pre className="whitespace-pre-wrap text-sm text-slate-800 leading-relaxed font-sans">{result.polishedResume}</pre>}
                    {activeTab === "diff" && (<div><div className="flex items-center gap-4 mb-3 text-xs text-slate-500"><span className="flex items-center gap-1"><span className="w-3 h-3 inline-block bg-green-200 rounded"></span> 新增</span><span className="flex items-center gap-1"><span className="w-3 h-3 inline-block bg-red-200 rounded"></span> 删除</span></div><DiffView original={resume} modified={result.polishedResume} /></div>)}
                    {activeTab === "changes" && (<div className="space-y-3">{result.changes.map((change, idx) => (<div key={idx} className="border border-slate-200 rounded-lg p-3"><div className="flex items-start gap-2"><span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center mt-0.5">{idx + 1}</span><div className="flex-1 space-y-2"><div><span className="text-xs text-red-500 font-medium">原文：</span><span className="text-sm text-slate-600 line-through">{change.original}</span></div><div><span className="text-xs text-green-600 font-medium">修改：</span><span className="text-sm text-slate-800 font-medium">{change.modified}</span></div><div className="flex items-start gap-1.5"><span className="text-xs text-brand-600 font-medium mt-0.5">💡</span><span className="text-xs text-slate-500">{change.reason}</span></div></div></div></div>))}</div>)}
                    <HealthReportView health={health} loading={healthLoading} estPages={estimatePages(result.polishedResume)} />
                    {activeTab === "ats" && (
                      <AtsScreenView loading={atsLoading} error={atsError} original={ats?.original ?? null} polished={ats?.polished ?? null} />
                    )}
                    {activeTab === "analysis" && (<div className="space-y-5"><div><h3 className="text-sm font-semibold text-slate-700 mb-2">✅ 已匹配<span className="ml-2 text-xs font-normal text-slate-400">({result.matchedKeywords.length})</span></h3><div className="flex flex-wrap gap-2">{result.matchedKeywords.length > 0 ? result.matchedKeywords.map((kw, idx) => <span key={idx} className="px-3 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">{kw}</span>) : <span className="text-xs text-slate-400">暂无</span>}</div></div><div><h3 className="text-sm font-semibold text-slate-700 mb-2">❌ 缺失<span className="ml-2 text-xs font-normal text-slate-400">({result.missingKeywords.length})</span></h3><div className="flex flex-wrap gap-2">{result.missingKeywords.length > 0 ? result.missingKeywords.map((kw, idx) => <span key={idx} className="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">{kw}</span>) : <span className="text-xs text-green-600">全覆盖 🎉</span>}</div></div><div><h3 className="text-sm font-semibold text-slate-700 mb-2">📋 全览<span className="ml-2 text-xs font-normal text-slate-400">({result.jdKeywords.length})</span></h3><div className="flex flex-wrap gap-2">{result.jdKeywords.map((kw, idx) => <span key={idx} className="px-3 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded-full">{kw}</span>)}</div></div>{result.suggestions.length > 0 && (<div><h3 className="text-sm font-semibold text-slate-700 mb-2">💡 建议</h3><ul className="space-y-2">{result.suggestions.map((sug, idx) => <li key={idx} className="flex items-start gap-2 text-sm text-slate-600 bg-amber-50 rounded-lg p-2.5"><span className="text-amber-500 mt-0.5">▸</span><span>{sug}</span></li>)}</ul></div>)}</div>)}
                    {activeTab === "interview" && hasInterviewPrep && result.interviewPrep && (
                      <div className="space-y-5">
                        {result.interviewPrep.likelyQuestions.length > 0 && (<div><h3 className="text-sm font-semibold text-slate-700 mb-2">🎤 可能问到的问题</h3><div className="space-y-2">{result.interviewPrep.likelyQuestions.map((q, idx) => (<div key={idx} className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-300 text-slate-700 text-xs font-bold flex items-center justify-center mt-0.5">Q{idx + 1}</span><span className="text-sm text-slate-700">{q}</span></div>))}</div></div>)}
                        {result.interviewPrep.talkingPoints.length > 0 && (<div><h3 className="text-sm font-semibold text-slate-700 mb-2">💬 重点展开讲述</h3><div className="space-y-2">{result.interviewPrep.talkingPoints.map((tp, idx) => (<div key={idx} className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg"><span className="text-blue-500 mt-0.5">▸</span><span className="text-sm text-slate-700">{tp}</span></div>))}</div></div>)}
                        {result.interviewPrep.weakPoints.length > 0 && (<div><h3 className="text-sm font-semibold text-slate-700 mb-2">⚠️ 可能被追问的薄弱点</h3><div className="space-y-2">{result.interviewPrep.weakPoints.map((wp, idx) => (<div key={idx} className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg"><span className="text-amber-500 mt-0.5">⚠</span><span className="text-sm text-slate-700">{wp}</span></div>))}</div></div>)}
                        {result.interviewPrep.starStories.length > 0 && (<div><h3 className="text-sm font-semibold text-slate-700 mb-2">⭐ 建议准备的STAR故事</h3><div className="space-y-2">{result.interviewPrep.starStories.map((ss, idx) => { const storyText = typeof ss === "string" ? ss : [ss.situation && ("【背景】" + ss.situation), ss.task && ("【任务】" + ss.task), ss.action && ("【行动】" + ss.action), ss.result && ("【成果】" + ss.result)].filter(Boolean).join("\n"); return (<div key={idx} className="flex items-start gap-2 p-3 bg-green-50 rounded-lg"><span className="text-green-500 mt-0.5">⭐</span><span className="text-sm text-slate-700 whitespace-pre-wrap">{storyText}</span></div>); })}</div></div>)}
                      </div>
                    )}
                    {activeTab === "score" && hasScore && result.resumeScore && (
                      <div className="space-y-5">
                        {/* 总分 */}
                        <div className="text-center py-4">
                          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full text-3xl font-bold ${scoreColor(result.resumeScore.total)}`}>
                            {result.resumeScore.total}
                          </div>
                          <p className="text-sm text-slate-500 mt-2">简历质量总分</p>
                        </div>
                        {/* 整体评价 */}
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-sm text-slate-700">{result.resumeScore.summary}</p>
                        </div>
                        {/* 维度评分 */}
                        <div className="space-y-3">
                          {result.resumeScore.dimensions.map((dim, idx) => (
                            <div key={idx}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-slate-700">{dim.name}</span>
                                <span className={`text-sm font-bold ${scoreColor(dim.score).split(" ")[0]}`}>{dim.score}</span>
                              </div>
                              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-1">
                                <div className={`h-full ${scoreBar(dim.score)} rounded-full transition-all`} style={{ width: `${dim.score}%` }} />
                              </div>
                              <p className="text-xs text-slate-500">{dim.comment}</p>
                            </div>
                          ))}
                        </div>
                        {/* 改进建议 */}
                        {result.resumeScore.improvements.length > 0 && (
                          <div>
                            <h3 className="text-sm font-semibold text-slate-700 mb-2">📈 改进建议</h3>
                            <ul className="space-y-2">
                              {result.resumeScore.improvements.map((imp, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm text-slate-600 bg-blue-50 rounded-lg p-2.5"><span className="text-blue-500 mt-0.5">▸</span><span>{imp}</span></li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                    {activeTab === "keywordbank" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div><h3 className="text-sm font-semibold text-slate-700">📚 关键词库</h3><p className="text-xs text-slate-400 mt-1">每次润色自动积累，跨岗位统计高频词</p></div>
                          <div className="flex items-center gap-2"><button onClick={() => setKwSort(kwSort === "count" ? "recent" : "count")} className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition">{kwSort === "count" ? "📊 频次" : "🕐 最近"}</button>{keywordBank.length > 0 && <button onClick={clearKeywordBank} className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition">🗑 清空</button>}</div>
                        </div>
                        {keywordBank.length > 0 ? (<div className="space-y-2"><p className="text-xs text-slate-400">共 {keywordBankTotal} 个关键词</p><div className="flex flex-wrap gap-2">{keywordBank.map((kw, idx) => (<div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200"><span className="text-sm text-slate-700 font-medium">{kw.keyword}</span><span className="text-xs px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-700 font-bold">{kw.count}</span></div>))}</div><div className="mt-4 p-3 bg-blue-50 rounded-lg"><p className="text-xs text-blue-700">💡 频次高的关键词说明多个岗位都在要求，建议在简历中重点体现这些能力。</p></div></div>) : (<div className="text-center py-12"><div className="text-4xl mb-3">📚</div><p className="text-sm text-slate-400">还没有关键词</p><p className="text-xs text-slate-300 mt-1">每次润色后自动积累</p></div>)}
                      </div>
                    )}
                    {activeTab === "history" && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-700">🕐 润色历史</h3>
                          {history.length > 0 && <button onClick={handleClearHistory} className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition">🗑 清空</button>}
                        </div>
                        {history.length > 0 ? (
                          <div className="space-y-2">
                            {history.map((item) => (
                              <div key={item.id} className="border border-slate-200 rounded-lg p-3 hover:border-slate-300 transition">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-medium text-slate-700">{item.jobTitle || "未知职位"}</span>
                                      {item.company && <span className="text-xs text-slate-400">@ {item.company}</span>}
                                      {item.score !== undefined && <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${scoreColor(item.score)}`}>{item.score}分</span>}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                                      <span>{item.templateName}</span><span>·</span><span>{item.formatName}</span><span>·</span><span>{formatTime(item.timestamp)}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button onClick={() => restoreHistory(item)} className="px-2 py-1 text-xs text-brand-600 hover:bg-brand-50 rounded transition">恢复</button>
                                    <button onClick={() => handleDeleteHistory(item.id)} className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition">删除</button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-12"><div className="text-4xl mb-3">🕐</div><p className="text-sm text-slate-400">还没有历史记录</p><p className="text-xs text-slate-300 mt-1">每次润色后自动保存到本地</p></div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="text-5xl mb-4">📄</div>
                  {loading ? (
                    deepMode ? (
                      <div className="space-y-4 py-2">
                        <p className="text-slate-400 text-sm">深度润色处理中…</p>
                        <AgentProgress step={agentStep} detail={agentStage || "正在启动 agent…"} />
                      </div>
                    ) : (
                    <div className="space-y-4">
                      <p className="text-slate-400 text-sm">AI 正在处理…</p>
                      <div className="space-y-2 text-left max-w-xs mx-auto">
                        {[
                          { step: 1, label: "分析JD关键词", icon: "🔍" },
                          { step: 2, label: "润色简历内容", icon: "✨" },
                          { step: 3, label: "生成评分和面试建议", icon: "📊" },
                        ].map((s) => (
                          <div key={s.step} className={`flex items-center gap-2 text-sm transition-all ${polishStep >= s.step ? "text-brand-600" : "text-slate-300"}`}>
                            <span>{polishStep > s.step ? "✅" : polishStep === s.step ? s.icon : "⏳"}</span>
                            <span>{s.label}</span>
                            {polishStep === s.step && <span className="loading-dot w-1 h-1 rounded-full bg-brand-400 inline-block"></span>}
                          </div>
                        ))}
                      </div>
                    </div>
                    )
                  )
                  : error ? <div><p className="text-red-500 text-sm mb-3">{error}</p>{error.includes("401") && <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 max-w-md text-left"><p className="font-semibold mb-1">🔑 API Key 排查：</p><ol className="space-y-1 list-decimal list-inside"><li>确认 .env.local Key 格式正确</li><li>去 platform.deepseek.com 确认有效</li><li>确认账户有余额</li><li>改完后重启应用</li></ol></div>}</div>
                  : (<><p className="text-slate-400 text-sm">选择风格+格式+主题，粘贴简历和JD后润色</p><p className="text-slate-300 text-xs mt-1">或点右上角「📝 填入示例」快速体验</p><div className="mt-6 max-w-md text-left bg-slate-50 rounded-lg p-4"><p className="text-xs font-semibold text-slate-600 mb-2">🚀 快速开始</p><ol className="text-xs text-slate-500 space-y-1.5"><li>1. 点 <button onClick={fillExample} className="text-amber-600 underline font-medium">📝填入示例</button> 快速体验</li><li>2. 或用模版填空 → 选风格 → 粘贴JD → 润色</li><li>3. 预览美化简历 → 查看评分/面试准备</li><li>4. 装 <a href="/boss-zhipin-jd-sender.user.js" download className="text-brand-600 underline">油猴脚本</a> 从BOSS直聘一键导入JD</li></ol></div></>)}
                </div>
              )}
            </div>
          </div>
        </div>
        {/* 打印/导出 PDF 唯一来源:专业排印版式(与屏幕主题无关) */}
        {result && <div className="hidden print:block"><ResumePrintView content={result.polishedResume} /></div>}
      </div>
    </main>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`inline-flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{children}</button>;
}
