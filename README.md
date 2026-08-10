# 简历润色助手

根据 JD（职位描述）智能润色简历的 Web 应用。支持从 BOSS 直聘一键导入 JD，AI 自动优化简历表达、匹配关键词、发现简历不足。

## ✨ 功能特性

- **BOSS直聘一键导入JD**：油猴脚本自动提取JD，无需手动复制
- **智能润色**：根据 JD 要求，优化简历用词、量化成果、强化 STAR 结构
- **对比 Diff**：原版 vs 润色版逐行对比，修改一目了然
- **修改说明**：每处修改附带 AI 的修改理由
- **JD 关键词分析**：提取 JD 核心关键词，标注已匹配/缺失项
- **优化建议**：针对缺失关键词给出具体补充建议
- **一键复制 / 导出**：复制润色结果到剪贴板，或导出为 Markdown 文件

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 16 (App Router) + React 19 + TypeScript |
| 样式 | Tailwind CSS v4 |
| LLM | DeepSeek Chat API |
| JD导入 | Tampermonkey 油猴脚本 |

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 API Key

复制 `.env.example` 为 `.env.local`，填入你的 DeepSeek API Key：

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```
DEEPSEEK_API_KEY=sk-你的实际key
```

> 获取 Key：访问 https://platform.deepseek.com/ → API Keys → 创建

### 3. 启动开发服务器

```bash
npm run dev
```

打开 http://localhost:3000 即可使用。

## 📗 安装油猴脚本（从BOSS直聘导入JD）

### 第一步：安装 Tampermonkey

- **Chrome/Edge**：[Chrome 应用商店](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) 安装
- **Firefox**：[Firefox 附加组件](https://addons.mozilla.org/firefox/addon/tampermonkey/) 安装
- **Safari**：App Store 搜索 Tampermonkey 安装

### 第二步：安装油猴脚本

1. 启动简历润色助手应用（`npm run dev`）
2. 打开 http://localhost:3000
3. 点击页面右上角 **⬇ 下载油猴脚本**
4. 浏览器会自动弹出 Tampermonkey 安装确认页
5. 点击 **安装** 即可

> 或者手动安装：打开 Tampermonkey 管理面板 → 新建脚本 → 粘贴 `public/boss-zhipin-jd-sender.user.js` 的内容 → 保存

### 第三步：使用

1. 打开 [BOSS 直聘](https://www.zhipin.com/)，登录并搜索你感兴趣的职位
2. 进入任意职位详情页
3. 页面右下角会出现 **✨ 发送到简历润色助手** 按钮
4. 点击按钮 → JD 自动发送到应用
5. 回到 http://localhost:3000，JD 已自动填入
6. 粘贴你的简历 → 点击 **✨ 开始润色**

### 工作流程图

```
BOSS直聘职位详情页                简历润色助手 (localhost:3000)
┌─────────────────┐              ┌──────────────────────┐
│  点击 ✨发送按钮  │ ── JD ──→  │  JD自动填入           │
│  (油猴脚本提取)  │              │  粘贴简历            │
└─────────────────┘              │  点击润色 → AI优化    │
                                 └──────────────────────┘
```

## 📖 使用方法

1. **左侧上方**：粘贴你的简历全文
2. **左侧下方**：粘贴目标职位的 JD 描述（或通过油猴脚本自动导入）
3. 点击 **✨ 开始润色**
4. 右侧查看结果，切换不同标签页：
   - **润色结果**：完整的润色后简历
   - **对比 Diff**：逐行对比原版和润色版
   - **修改说明**：每处修改的原因
   - **JD关键词分析**：匹配情况 + 缺失关键词 + 优化建议
5. 点击 **复制** 或 **导出MD** 保存结果

## ☁ 部署到 Vercel

1. 将代码推送到 GitHub
2. 在 Vercel 导入项目
3. 在 Vercel 项目设置 → Environment Variables 中添加 `DEEPSEEK_API_KEY`
4. 部署即可

> **注意**：油猴脚本默认连接 `http://localhost:3000`。如果部署到线上，需修改脚本中的 `APP_BASE_URL` 为你的线上地址。

## 📁 项目结构

```
├── public/
│   └── boss-zhipin-jd-sender.user.js   # Tampermonkey 油猴脚本
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── polish/route.ts          # 润色 API Route
│   │   │   └── import-jd/route.ts       # JD 导入 API Route
│   │   ├── globals.css                  # 全局样式 + Tailwind v4
│   │   ├── layout.tsx                   # 根布局
│   │   └── page.tsx                     # 主页面
│   ├── components/
│   │   └── DiffView.tsx                 # 逐行 diff 组件（LCS算法）
│   └── lib/
│       ├── deepseek.ts                  # DeepSeek API 封装
│       └── prompt.ts                    # Prompt 构建逻辑
```

## ⚠ 注意事项

- 油猴脚本需要应用运行在 `http://localhost:3000`，如需修改端口请编辑脚本中的 `APP_BASE_URL`
- 油猴脚本只是提取你在浏览器中已看到的公开页面内容，不涉及任何爬虫或自动化操作
- API Key 保存在服务端，不会暴露给前端
- AI 不会编造不存在的经历，只在已有内容基础上优化
- 建议润色后人工再检查一遍，确保表达准确
- 项目使用 webpack 模式构建（`--webpack` flag），兼容性更好
