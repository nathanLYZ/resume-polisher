/**
 * 本地存储工具 — localStorage 封装
 * 用于存储润色历史记录、草稿和用户偏好
 */

const HISTORY_KEY = "resume-polisher-history";
const DRAFT_KEY = "resume-polisher-draft";
const MAX_HISTORY = 20;

export interface HistoryItem {
  id: string;
  timestamp: number;
  templateName: string;
  formatName: string;
  jobTitle: string;
  company: string;
  originalResume: string;
  polishedResume: string;
  jdKeywords: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
  suggestions: string[];
  score?: number;
}

// ============ 历史记录 ============

export function getHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryItem[];
  } catch { return []; }
}

export function addHistory(item: Omit<HistoryItem, "id" | "timestamp">): void {
  try {
    const history = getHistory();
    const newItem: HistoryItem = {
      ...item,
      id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    history.unshift(newItem);
    if (history.length > MAX_HISTORY) history.splice(MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) { console.error("[storage] addHistory error:", e); }
}

export function deleteHistory(id: string): void {
  try {
    const history = getHistory();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.filter((h) => h.id !== id)));
  } catch (e) { console.error("[storage] deleteHistory error:", e); }
}

export function clearHistory(): void {
  try { localStorage.removeItem(HISTORY_KEY); } catch (e) { console.error("[storage] clearHistory error:", e); }
}

// ============ 草稿自动保存 ============

export interface DraftData {
  resume: string;
  jd: string;
  templateId: string;
  formatId: string;
  themeId: string;
  savedAt: number;
}

export function saveDraft(data: Omit<DraftData, "savedAt">): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch (e) { console.error("[storage] saveDraft error:", e); }
}

export function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DraftData;
  } catch { return null; }
}

export function clearDraft(): void {
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
}

// ============ 工具 ============

export function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
