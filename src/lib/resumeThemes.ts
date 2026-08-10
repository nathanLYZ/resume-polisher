/**
 * 简历视觉主题
 */

export type ThemeId =
  | "modern-blue"
  | "elegant-dark"
  | "warm-paper"
  | "clean-gray"
  | "tech-green"
  | "minimal-white";

export interface ResumeTheme {
  id: ThemeId;
  name: string;
  description: string;
  icon: string;
  vars: Record<string, string>;
}

export const THEMES: Record<ThemeId, ResumeTheme> = {
  "modern-blue": {
    id: "modern-blue",
    name: "现代蓝",
    description: "蓝色侧边栏 + 白色主区域",
    icon: "🔵",
    vars: {
      "--rv-bg": "#f0f4f8",
      "--rv-sidebar-bg": "#1e3a5f",
      "--rv-sidebar-text": "#e2e8f0",
      "--rv-sidebar-accent": "#60a5fa",
      "--rv-main-bg": "#ffffff",
      "--rv-main-text": "#1e293b",
      "--rv-heading": "#1e3a5f",
      "--rv-accent": "#2563eb",
      "--rv-border": "#cbd5e1",
      "--rv-tag-bg": "#dbeafe",
      "--rv-tag-text": "#1e40af",
      "--rv-radius": "12px",
    },
  },
  "elegant-dark": {
    id: "elegant-dark",
    name: "优雅深色",
    description: "深色底 + 金色点缀",
    icon: "⚫",
    vars: {
      "--rv-bg": "#1a1a2e",
      "--rv-sidebar-bg": "#16213e",
      "--rv-sidebar-text": "#e2e8f0",
      "--rv-sidebar-accent": "#d4af37",
      "--rv-main-bg": "#1a1a2e",
      "--rv-main-text": "#e2e8f0",
      "--rv-heading": "#d4af37",
      "--rv-accent": "#d4af37",
      "--rv-border": "#334155",
      "--rv-tag-bg": "#1e293b",
      "--rv-tag-text": "#d4af37",
      "--rv-radius": "8px",
    },
  },
  "warm-paper": {
    id: "warm-paper",
    name: "暖纸风",
    description: "米色纸张 + 棕色标题",
    icon: "🟡",
    vars: {
      "--rv-bg": "#faf6f0",
      "--rv-sidebar-bg": "#f5e6d3",
      "--rv-sidebar-text": "#5b4636",
      "--rv-sidebar-accent": "#a0522d",
      "--rv-main-bg": "#fffdf8",
      "--rv-main-text": "#3d2b1f",
      "--rv-heading": "#8b4513",
      "--rv-accent": "#a0522d",
      "--rv-border": "#d4c4b0",
      "--rv-tag-bg": "#f5e6d3",
      "--rv-tag-text": "#8b4513",
      "--rv-radius": "6px",
    },
  },
  "clean-gray": {
    id: "clean-gray",
    name: "极简灰",
    description: "纯灰白配色，干净利落",
    icon: "⚪",
    vars: {
      "--rv-bg": "#f8fafc",
      "--rv-sidebar-bg": "#f1f5f9",
      "--rv-sidebar-text": "#334155",
      "--rv-sidebar-accent": "#475569",
      "--rv-main-bg": "#ffffff",
      "--rv-main-text": "#1e293b",
      "--rv-heading": "#0f172a",
      "--rv-accent": "#64748b",
      "--rv-border": "#e2e8f0",
      "--rv-tag-bg": "#f1f5f9",
      "--rv-tag-text": "#334155",
      "--rv-radius": "4px",
    },
  },
  "tech-green": {
    id: "tech-green",
    name: "科技绿",
    description: "深绿侧边栏 + 亮色主区域",
    icon: "🟢",
    vars: {
      "--rv-bg": "#f0fdf4",
      "--rv-sidebar-bg": "#064e3b",
      "--rv-sidebar-text": "#d1fae5",
      "--rv-sidebar-accent": "#34d399",
      "--rv-main-bg": "#ffffff",
      "--rv-main-text": "#1e293b",
      "--rv-heading": "#065f46",
      "--rv-accent": "#10b981",
      "--rv-border": "#a7f3d0",
      "--rv-tag-bg": "#d1fae5",
      "--rv-tag-text": "#065f46",
      "--rv-radius": "10px",
    },
  },
  "minimal-white": {
    id: "minimal-white",
    name: "纯白极简",
    description: "全白底 + 细线分隔",
    icon: "📄",
    vars: {
      "--rv-bg": "#ffffff",
      "--rv-sidebar-bg": "#ffffff",
      "--rv-sidebar-text": "#475569",
      "--rv-sidebar-accent": "#0f172a",
      "--rv-main-bg": "#ffffff",
      "--rv-main-text": "#1e293b",
      "--rv-heading": "#0f172a",
      "--rv-accent": "#334155",
      "--rv-border": "#e2e8f0",
      "--rv-tag-bg": "#f8fafc",
      "--rv-tag-text": "#334155",
      "--rv-radius": "0px",
    },
  },
};

export const THEME_LIST: ResumeTheme[] = Object.values(THEMES);

export function getTheme(id: ThemeId): ResumeTheme {
  return THEMES[id] || THEMES["modern-blue"];
}
