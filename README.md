# 简历润色助手

根据 JD（职位描述）智能润色简历的 Web 应用。内置**「生成 → 验证 → 自修复」的 Agent 润色引擎**：起草后经确定性检查器与对抗式审查双重把关，不通过自动修订——虚构数字、时间线错误、关键词假覆盖等问题在工程上被拦截，而不是靠用户肉眼。支持从 BOSS 直聘一键导入 JD，AI 自动优化简历表达、匹配关键词、发现简历不足。

> **🚀 在线体验：[https://resume.daybydayai.xyz](https://resume.daybydayai.xyz)** （海外备用：https://resume-polisher-eta.vercel.app）

## ✨ 功能特性

- **BOSS直聘一键导入JD**：油猴脚本自动提取JD，无需手动复制
- **Agent 智能润色**：根据 JD 要求，优化简历用词、量化成果、强化 STAR 结构；Agent 循环实时展示各阶段进度（SSE 流式，真实进度非模拟）
- **体检报告**：十余项确定性检查的清单式报告（数字守恒、时间线一致性、关键词真实覆盖、JD 照搬、关键词堆砌、年龄/工龄暴露、中英夹杂、页数预估等），纯代码执行、零 LLM 成本
- **ATS 筛选模拟**：润色前 vs 润色后双栏对比（确定性规则打分，模拟机器筛选视角）
- **对比 Diff**：原版 vs 润色版逐行对比，修改一目了然
- **修改说明**：每处修改附带 AI 的修改理由
- **JD 关键词分析**：提取 JD 核心关键词，标注已匹配/缺失项（声称覆盖的关键词必须在成稿中实际存在，模型自报不可信）
- **优化建议**：针对缺失关键词给出具体补充建议
- **质量评分 / 面试建议**：生成简历质量评分与针对性面试准备建议
- **打印 / 导出 PDF**：专用排印版式（字体统一、单栏黑白、A4 约束），对 ATS 解析友好
- **一键复制 / 导出**：复制润色结果到剪贴板，或导出为 Markdown 文件
- **模板填空**：内置简历模板，按字段填写快速生成简历
- **关键词库**：维护个人关键词库，润色与匹配时自动参考
- **公司调研（可选）**：配置 Tavily（海外）或博查（国内）API Key 后，润色时自动带入目标公司背景；未配置不阻断
- **历史记录 / 草稿保存**：本地保存润色历史与草稿，随时回看
- **内置简历方法论**：所有模板共享一套硬规则——5 秒首屏原则、个人简介黄金模板（身份定位+技术栈+代表经历+价值）、技能"精通/熟练/了解"分层、量化纪律（数字只能来自原文，缺失写进建议而非虚构）、时间线一致性自检、拒绝职责流水账

## 🤖 Agent 架构（生成 → 验证 → 自修复）

单次 LLM 调用输出大结构容易截断、且结果无验证。本项目把润色改造为可信输出系统：

```
用户输入（简历 + JD）
      │  SSE 流式事件（stage / issues / result / error）
      ▼
┌────────────────────────────────────────────────┐
│ ① Drafter 起草                                  │
│      （简历方法论硬规则全部内置在系统提示词）      │
│ ② 确定性检查器（纯代码，零 LLM 成本，不可跳过）    │
│    数字守恒 / 时间线一致 / 关键词真实覆盖 /        │
│    JD 照搬 / 关键词堆砌 / 年龄工龄 / 中英夹杂 /    │
│    结构 / 页数预估                               │
│      │ 有 blocker → 直接回 ① 修订（不花 LLM 审查） │
│ ③ 对抗式 Reviewer（独立 LLM 角色）               │
│    只看「原文 + JD + 成稿」，不看起草指令          │
│      │ 有 blocker 且未达上限 → 回 ①              │
│ ④ 通过（或达上限）→ 输出结果 + 体检报告           │
└────────────────────────────────────────────────┘
```

### 设计原则

1. **能写成代码的检查不交给模型**——便宜、稳定、模型无法跳过或狡辩。检查器把方法论纪律（量化纪律、时间线自检等）机械化成断言
2. **Reviewer 与 Drafter 角色隔离**——审查者不看起草者的指令，只看原文 + JD + 成稿，避免自我合理化
3. **有界自修复 + 如实降级**——迭代次数、步数、时间三重硬上限；不收敛就带着残留问题如实返回，不假装通过；并行兜底起草保证用户始终拿得到结果
4. **双执行模式，控制权与不变量分离**——
   - 固定编排 workflow（`loop.ts`）：路径可预知，检查-修订走固定管线
   - 模型驱动 tool agent（`toolLoop.ts`）：模型自主决定何时自检、何时请求对抗审查、何时提交；`submit_final` 提交门禁强制确定性复检，有 blocker 一律拒回
   - 什么时候用 workflow、什么时候用 agent，取决于**路径是否可预知**

> 架构演进细节见 [docs/agent-refactor-plan.md](./docs/agent-refactor-plan.md)。

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 16 (App Router) + React 19 + TypeScript |
| 样式 | Tailwind CSS v4 |
| Agent 引擎 | 自研 agent loop（固定编排 + tool-use 双模式，SSE 流式）+ 确定性检查器 + 对抗式 Reviewer |
| LLM | DeepSeek Chat API（@ai-sdk/deepseek） |
| JD导入 | Tampermonkey 油猴脚本 |
| 调研（可选） | Tavily / 博查搜索 API |

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
>
> 可选：`TAVILY_API_KEY`（海外）或 `BOCHA_API_KEY`（国内博查）用于公司调研功能，不配置则该功能自动隐藏。

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
3. 点击 **✨ 开始润色**，Agent 循环启动，右侧实时显示各阶段进度（起草 → 检查 → 审查 → 修订）
4. 切换不同标签页查看结果：
   - **润色结果**：完整的润色后简历
   - **对比 Diff**：逐行对比原版和润色版
   - **修改说明**：每处修改的原因
   - **JD关键词分析**：匹配情况 + 缺失关键词 + 优化建议
   - **体检报告**：确定性检查的清单式报告（哪些通过、哪些有残留问题）
   - **ATS 筛选**：润色前后的机器筛选视角对比
5. 点击 **复制**、**导出MD** 或 **打印 / 导出 PDF** 保存结果

## 🔭 岗位监控(watch daemon,Phase 3)

定时抓取职位源 → 关键词粗筛 → fit 打分 → 高分岗位落盘 + 飞书通知。本地运行,零 LLM 成本(粗筛与打分全为规则):

```bash
npm run watch          # 每 30 分钟一轮(WATCH_INTERVAL_MIN 可调)
npm run watch -- --once  # 单轮调试
```

首次运行自动生成 `.data/watch/watch-config.json` 模板:填入你的简历文本、职位源(RSS/JSON)、fit 阈值、可选的飞书群机器人 webhook。产物在 `.data/watch/records.json`(高分岗位含 fit 理由),去重状态在 `state.json`。

## ☁ 部署到 Vercel

1. 将代码推送到 GitHub
2. 在 Vercel 导入项目
3. 在 Vercel 项目设置 → Environment Variables 中添加 `DEEPSEEK_API_KEY`（可选：`TAVILY_API_KEY` / `BOCHA_API_KEY`）
4. 部署即可

> **注意**：油猴脚本默认连接 `http://localhost:3000`。如果部署到线上，需修改脚本中的 `APP_BASE_URL` 为你的线上地址。

## 📁 项目结构

```
├── docs/
│   └── agent-refactor-plan.md          # Agent 化改造方案(架构演进记录)
├── public/
│   └── boss-zhipin-jd-sender.user.js   # Tampermonkey 油猴脚本
├── scripts/
│   ├── pipeline.ts                     # 端到端 pipeline 测试
│   └── watch.ts                        # 岗位监控守护进程(Phase 3)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── polish/agent/route.ts   # Agent 润色 SSE 端点
│   │   │   ├── polish/finalize/        # 评分/面试建议收尾(与主循环解耦)
│   │   │   ├── polish/route.ts         # 单次润色 API(降级路径)
│   │   │   ├── checks/route.ts         # 简历体检(纯确定性检查,零 LLM)
│   │   │   ├── ats/                    # ATS 筛选模拟(确定性规则打分)
│   │   │   ├── research/company/       # 公司调研(可选,Tavily/博查)
│   │   │   ├── import-jd/route.ts      # JD 导入 API Route
│   │   │   └── keyword-bank/route.ts   # 关键词库 API Route
│   │   ├── globals.css                 # 全局样式 + Tailwind v4
│   │   ├── layout.tsx                  # 根布局
│   │   └── page.tsx                    # 主页面
│   ├── components/
│   │   ├── AgentProgress.tsx           # Agent 循环实时进度(SSE 事件驱动)
│   │   ├── HealthReportView.tsx        # 体检报告视图(确定性检查清单)
│   │   ├── AtsScreenView.tsx           # ATS 筛选模拟视图(前后双栏)
│   │   ├── DiffView.tsx                # 逐行 diff 组件(LCS算法)
│   │   ├── ResumePreview.tsx           # 简历屏幕预览
│   │   ├── ResumePrintView.tsx         # 打印/导出 PDF 版式(排印规则代码化)
│   │   └── ResumeTemplateForm.tsx      # 模板填空表单
│   └── lib/
│       ├── agent/
│       │   ├── loop.ts                 # 固定编排 agent 循环(draft→检查→审查→修订)
│       │   ├── toolLoop.ts             # 模型驱动 tool-use agent(提交门禁+降级)
│       │   ├── checks.ts               # 确定性检查器(方法论机械化断言)
│       │   ├── reviewer.ts             # 对抗式审查(独立角色)
│       │   ├── tools.ts                # agent 工具集(自检/审查/提交)
│       │   ├── prompts.ts              # agent 提示词(方法论硬规则)
│       │   └── schemas.ts              # 结构化输出 schema
│       ├── deepseek.ts                 # DeepSeek API 封装
│       ├── prompt.ts                   # Prompt 构建逻辑
│       ├── resumeTemplatesData.ts      # 内置简历模板数据
│       └── storage.ts                  # 历史记录 / 草稿本地存储
```

## ⚠ 注意事项

- 油猴脚本需要应用运行在 `http://localhost:3000`，如需修改端口请编辑脚本中的 `APP_BASE_URL`
- 油猴脚本只是提取你在浏览器中已看到的公开页面内容，不涉及任何爬虫或自动化操作
- API Key 保存在服务端，不会暴露给前端
- AI 不会编造不存在的经历：确定性检查器会拦截新增数字与时间线；对抗式审查复检虚构与照搬；两者仍不能保证 100%，建议润色后人工再检查一遍
- ATS 筛选为确定性规则模拟，不代表真实商业 ATS 的结果
- 项目使用 webpack 模式构建（`--webpack` flag），兼容性更好

## 📄 License

[MIT](./LICENSE) © 2026 nathanLYZ
