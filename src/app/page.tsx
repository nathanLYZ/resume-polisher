"use client";

import { useState, useEffect, useRef } from "react";
import DiffView from "@/components/DiffView";
import ResumePreview from "@/components/ResumePreview";
import ResumeTemplateForm from "@/components/ResumeTemplateForm";
import { TEMPLATES, type TemplateId } from "@/lib/templates";
import { FORMATS, type FormatId } from "@/lib/resumeFormats";
import { THEME_LIST, type ThemeId } from "@/lib/resumeThemes";
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
type Tab = "preview" | "polished" | "diff" | "changes" | "analysis" | "interview" | "score" | "keywordbank" | "history";

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
    setResume(""); setJd(""); setError(""); setResult(null);
  }

  async function handlePolish() {
    if (!resume.trim() || !jd.trim()) { setError("请填写简历和JD"); return; }
    setLoading(true); setError(""); setResult(null); setActiveTab("preview");
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
        setResult(data);
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
        clearTimeout(stepTimer1); clearTimeout(stepTimer2); setPolishStep(0);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "网络错误"); }
    finally { setLoading(false); clearTimeout(stepTimer1); clearTimeout(stepTimer2); setPolishStep(0); }
  }

  function restoreHistory(item: HistoryItem) {
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
  function clearImported() { setImportedInfo(null); }

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
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-lg font-bold">简</div>
            <div><h1 className="text-lg font-bold text-slate-900">简历润色助手</h1><p className="text-xs text-slate-500">根据JD智能优化，提升面试通过率</p></div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <button onClick={fillExample} className="text-amber-600 hover:text-amber-700 font-medium transition">📝 填入示例</button>
            <span className="hidden sm:inline">·</span>
            <a href="/boss-zhipin-jd-sender.user.js" download className="text-brand-600 hover:text-brand-700 font-medium">⬇ 油猴脚本</a>
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

            {/* 简历输入 */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-brand-500"></span><h2 className="text-sm font-semibold text-slate-700">我的简历</h2></div>
                <span className="text-xs text-slate-400">{resume.length} 字</span>
              </div>
              <textarea value={resume} onChange={(e) => setResume(e.target.value)} placeholder="粘贴简历、用模版填写、或点右上角「填入示例」体验…" className="w-full h-44 p-4 text-sm text-slate-800 resize-y focus:outline-none rounded-xl placeholder:text-slate-400" disabled={loading} />
            </div>

            {/* JD 输入 */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500"></span><h2 className="text-sm font-semibold text-slate-700">目标职位描述 (JD)</h2></div>
                <span className="text-xs text-slate-400">{jd.length} 字</span>
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
              <textarea value={jd} onChange={(e) => setJd(e.target.value)} placeholder="粘贴JD或通过油猴脚本自动导入…" className="w-full h-32 p-4 text-sm text-slate-800 resize-y focus:outline-none rounded-xl placeholder:text-slate-400" disabled={loading} />
            </div>
          </div>

          {/* Right: Results */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={handlePolish} disabled={loading || !resume.trim() || !jd.trim()} className="px-6 py-3 bg-gradient-to-r from-brand-600 to-brand-700 text-white text-sm font-medium rounded-lg hover:from-brand-700 hover:to-brand-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md flex items-center gap-2">
                {loading ? (<><span className="loading-dot w-1.5 h-1.5 rounded-full bg-white inline-block"></span><span className="loading-dot w-1.5 h-1.5 rounded-full bg-white inline-block"></span><span className="loading-dot w-1.5 h-1.5 rounded-full bg-white inline-block"></span><span className="ml-1">{polishStep === 1 ? "分析JD关键词…" : polishStep === 2 ? "润色简历内容…" : polishStep === 3 ? "生成评分和面试建议…" : "润色中…"}</span></>) : (<>✨ 开始润色</>)}
              </button>
              {error && <span className="text-sm text-red-600">{error}</span>}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              {result ? (
                <>
                  <div className="border-b border-slate-100 flex items-center gap-1 px-2 overflow-x-auto">
                    <TabButton active={activeTab === "preview"} onClick={() => setActiveTab("preview")}>🎨 预览</TabButton>
                    <TabButton active={activeTab === "polished"} onClick={() => setActiveTab("polished")}>纯文本</TabButton>
                    <TabButton active={activeTab === "diff"} onClick={() => setActiveTab("diff")}>Diff</TabButton>
                    {result.changes.length > 0 && <TabButton active={activeTab === "changes"} onClick={() => setActiveTab("changes")}>修改({result.changes.length})</TabButton>}
                    <TabButton active={activeTab === "analysis"} onClick={() => setActiveTab("analysis")}>关键词</TabButton>
                    {hasInterviewPrep && <TabButton active={activeTab === "interview"} onClick={() => setActiveTab("interview")}>🎯 面试</TabButton>}
                    {hasScore && <TabButton active={activeTab === "score"} onClick={() => setActiveTab("score")}>📊 评分</TabButton>}
                    <TabButton active={activeTab === "keywordbank"} onClick={() => setActiveTab("keywordbank")}>📚 词库</TabButton>
                    {history.length > 0 && <TabButton active={activeTab === "history"} onClick={() => setActiveTab("history")}>🕐 历史({history.length})</TabButton>}
                    <div className="ml-auto flex items-center gap-2 py-2 pr-2 flex-shrink-0">
                      <button onClick={handleCopy} className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition">{copied ? "✓" : "📋"}</button>
                      <button onClick={handleExportMD} className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition">⬇</button>
                      <button onClick={handlePrint} className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition">🖨</button>
                    </div>
                  </div>

                  <div className="p-4 max-h-[600px] overflow-y-auto print:max-h-none print:overflow-visible print:p-0">
                    {activeTab === "preview" && <div className="print:block"><ResumePreview content={result.polishedResume} themeId={selectedTheme} /></div>}
                    {activeTab === "polished" && <pre className="whitespace-pre-wrap text-sm text-slate-800 leading-relaxed font-sans">{result.polishedResume}</pre>}
                    {activeTab === "diff" && (<div><div className="flex items-center gap-4 mb-3 text-xs text-slate-500"><span className="flex items-center gap-1"><span className="w-3 h-3 inline-block bg-green-200 rounded"></span> 新增</span><span className="flex items-center gap-1"><span className="w-3 h-3 inline-block bg-red-200 rounded"></span> 删除</span></div><DiffView original={resume} modified={result.polishedResume} /></div>)}
                    {activeTab === "changes" && (<div className="space-y-3">{result.changes.map((change, idx) => (<div key={idx} className="border border-slate-200 rounded-lg p-3"><div className="flex items-start gap-2"><span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center mt-0.5">{idx + 1}</span><div className="flex-1 space-y-2"><div><span className="text-xs text-red-500 font-medium">原文：</span><span className="text-sm text-slate-600 line-through">{change.original}</span></div><div><span className="text-xs text-green-600 font-medium">修改：</span><span className="text-sm text-slate-800 font-medium">{change.modified}</span></div><div className="flex items-start gap-1.5"><span className="text-xs text-brand-600 font-medium mt-0.5">💡</span><span className="text-xs text-slate-500">{change.reason}</span></div></div></div></div>))}</div>)}
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
                  : error ? <div><p className="text-red-500 text-sm mb-3">{error}</p>{error.includes("401") && <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 max-w-md text-left"><p className="font-semibold mb-1">🔑 API Key 排查：</p><ol className="space-y-1 list-decimal list-inside"><li>确认 .env.local Key 格式正确</li><li>去 platform.deepseek.com 确认有效</li><li>确认账户有余额</li><li>改完后重启应用</li></ol></div>}</div>
                  : (<><p className="text-slate-400 text-sm">选择风格+格式+主题，粘贴简历和JD后润色</p><p className="text-slate-300 text-xs mt-1">或点右上角「📝 填入示例」快速体验</p><div className="mt-6 max-w-md text-left bg-slate-50 rounded-lg p-4"><p className="text-xs font-semibold text-slate-600 mb-2">🚀 快速开始</p><ol className="text-xs text-slate-500 space-y-1.5"><li>1. 点 <button onClick={fillExample} className="text-amber-600 underline font-medium">📝填入示例</button> 快速体验</li><li>2. 或用模版填空 → 选风格 → 粘贴JD → 润色</li><li>3. 预览美化简历 → 查看评分/面试准备</li><li>4. 装 <a href="/boss-zhipin-jd-sender.user.js" download className="text-brand-600 underline">油猴脚本</a> 从BOSS直聘一键导入JD</li></ol></div></>)}
                </div>
              )}
            </div>
          </div>
        </div>
        {result && <div className="hidden print:block"><ResumePreview content={result.polishedResume} themeId={selectedTheme} /></div>}
      </div>
    </main>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`px-3 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{children}</button>;
}
