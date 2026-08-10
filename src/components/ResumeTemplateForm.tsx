"use client";

import { useState } from "react";
import { RESUME_TEMPLATES, generateResumeText, type ResumeTemplateId, type ResumeField } from "@/lib/resumeTemplatesData";

interface ResumeTemplateFormProps {
  onFillResume: (text: string) => void;
}

export default function ResumeTemplateForm({ onFillResume }: ResumeTemplateFormProps) {
  const [selectedTpl, setSelectedTpl] = useState<ResumeTemplateId | null>(null);
  const [formData, setFormData] = useState<Record<string, string | string[]>>({});
  const [showForm, setShowForm] = useState(false);

  function selectTemplate(id: ResumeTemplateId) {
    setSelectedTpl(id);
    setShowForm(true);
    // 初始化表单数据
    const tpl = RESUME_TEMPLATES[id];
    const initial: Record<string, string | string[]> = {};
    for (const field of tpl.fields) {
      if (field.type === "list") {
        initial[field.key] = new Array(field.itemCount || 3).fill("");
      } else {
        initial[field.key] = "";
      }
    }
    setFormData(initial);
  }

  function updateField(key: string, value: string | string[]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function updateListItem(key: string, index: number, value: string) {
    setFormData((prev) => {
      const arr = [...((prev[key] as string[]) || [])];
      arr[index] = value;
      return { ...prev, [key]: arr };
    });
  }

  function handleFillResume() {
    if (!selectedTpl) return;
    const text = generateResumeText(selectedTpl, formData);
    onFillResume(text);
  }

  function backToSelection() {
    setShowForm(false);
    setSelectedTpl(null);
    setFormData({});
  }

  // 模版选择界面
  if (!showForm) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          <h2 className="text-sm font-semibold text-slate-700">简历模版填空</h2>
        </div>
        <p className="text-xs text-slate-400 mb-3">选择模版 → 填入信息 → 一键生成简历 → 配合JD润色</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.values(RESUME_TEMPLATES).map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => selectTemplate(tpl.id)}
              className="text-left p-3 rounded-lg border-2 border-slate-200 hover:border-amber-400 hover:bg-amber-50 transition"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{tpl.icon}</span>
                <span className="text-sm font-semibold text-slate-700">{tpl.name}</span>
              </div>
              <p className="text-xs text-slate-500">{tpl.description}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 表单填写界面
  const tpl = selectedTpl ? RESUME_TEMPLATES[selectedTpl] : null;
  if (!tpl) return null;

  return (
    <div className="space-y-3">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={backToSelection}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
          >
            ← 返回模版选择
          </button>
          <span className="text-slate-300">|</span>
          <span className="text-sm font-semibold text-slate-700">{tpl.icon} {tpl.name}</span>
        </div>
        <button
          onClick={handleFillResume}
          className="px-4 py-2 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition shadow-sm flex items-center gap-1"
        >
          ✨ 生成简历 → 填入润色框
        </button>
      </div>

      {/* 表单字段 */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
        {tpl.fields.map((field) => (
          <div key={field.key} className="space-y-1">
            <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
              {field.label}
              {field.required && <span className="text-red-400">*</span>}
            </label>

            {field.type === "text" && (
              <input
                type="text"
                value={(formData[field.key] as string) || ""}
                onChange={(e) => updateField(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-amber-400 placeholder:text-slate-300"
              />
            )}

            {field.type === "textarea" && (
              <textarea
                value={(formData[field.key] as string) || ""}
                onChange={(e) => updateField(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={field.rows || 3}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-amber-400 placeholder:text-slate-300 resize-y"
              />
            )}

            {field.type === "list" && (
              <div className="space-y-1.5">
                {field.itemHint && (
                  <p className="text-[11px] text-amber-600 italic">{field.itemHint}</p>
                )}
                {Array.from({ length: field.itemCount || 3 }).map((_, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-4 flex-shrink-0">•</span>
                    <input
                      type="text"
                      value={((formData[field.key] as string[]) || [])[idx] || ""}
                      onChange={(e) => updateListItem(field.key, idx, e.target.value)}
                      placeholder={field.placeholder}
                      className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-amber-400 placeholder:text-slate-300"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 底部生成按钮 */}
      <button
        onClick={handleFillResume}
        className="w-full px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-medium rounded-lg hover:from-amber-600 hover:to-amber-700 transition shadow-md flex items-center justify-center gap-2"
      >
        ✨ 生成简历 → 填入润色框
      </button>
    </div>
  );
}
