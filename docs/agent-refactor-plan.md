# resume-polisher Agent 化改造方案

> 状态:草案 · 2026-09-15
> 目标:把单次 LLM 调用的润色应用,改造成「生成 → 验证 → 自修复」的可信输出系统,分三期独立交付。

## 0. 现状诊断

| 现状 | 位置 | 问题 |
|------|------|------|
| 单次调用,一次出全部结果 | `src/app/api/polish/route.ts` | 输出结构太大(简历+changes+关键词+面试+评分),8192 token 仍会截断,已有降级重试补丁 |
| 结果无验证 | — | 是否虚构经历、关键词是否真覆盖、是否照搬 JD,全靠用户肉眼 |
| matchedKeywords 由模型自报 | `templates.ts` 输出 schema | 不可信——模型说覆盖了,润色稿里可能根本没有这个词 |
| 前端进度是假的 | `page.tsx:113` setTimeout 模拟 | 改造后正好换成真实事件流,UI 不用重做 |
| 关键词库存内存 Map | `api/keyword-bank/route.ts` | 重新部署即清零 |
| 只能导出 Markdown | `page.tsx` handleExportMD | ATS 解析的是 PDF 文本层,MD 不是投递格式 |

**核心资产(保留不动):** `templates.ts` 的 `buildSystemPrompt` —— 绝对红线(不照搬JD/不编造/关键词借用/缺失不硬凑)+ 六条方法论。这就是改造后 agent 的 policy,现有方法论一字不改地继承,另在 `prompt.ts` 追加一段「共享规则块」(见 2.7,来源:招聘方宣讲的 9 条简历问题)。

**术语澄清(也是面试素材):** Phase 1 是「带验证循环的 workflow」(路径固定),Phase 2/3 才是真正的 agent(模型自主决定调用什么工具、迭代几轮)。什么时候用 workflow、什么时候用 agent,取决于路径是否可预知——润色的主路径是可预知的,所以检查器做成确定性代码、只让"修复什么"交给模型。

## 1. 目标架构

```
用户输入 (简历 + JD)
      │
      ▼
┌─────────────────────────────────────────────────┐
│ Agent Loop (SSE 流式)                            │
│                                                 │
│  ① drafter:润色(现有 prompt 原样继承)            │
│        │                                        │
│  ② 确定性检查器(纯代码,零成本,不可跳过)          │
│   数字守恒 / 时间线 / 关键词覆盖 / JD照搬 / 英文夹杂 │
│        │  ← 有 blocker,直接回 ①,不花 LLM 调用     │
│  ③ LLM reviewer(独立对抗角色)                    │
│     虚构经历 / 流水账 / changes与diff一致性         │
│        │  ← 有 blocker 且未达 maxIterations → 回 ① │
│  ④ 通过(或达上限)→ 输出结果 + 审查报告              │
└─────────────────────────────────────────────────┘
      │
      ▼
前端:真实进度(复用现有 polishStep UI)+ 新增「审查报告」Tab
```

## 2. Phase 1:验证-修订循环(核心,~2 天)

### 2.1 设计原则

1. **能写成代码的检查不交给模型** —— 便宜、稳定、模型无法跳过或狡辩
2. **Reviewer 与 Drafter 角色隔离** —— reviewer 不看 drafter 的指令,只看「原文 + JD + 润色稿」,避免自我合理化
3. **硬上限 + 如实降级** —— `maxIterations = 2`,达上限后残留问题原样展示给用户,不假装通过

### 2.2 确定性检查器 `src/lib/agent/checks.ts`

把 prompt 里的「纪律」机械化成断言,每条返回 `Issue[]`:

```ts
export interface Issue {
  check: "number_conservation" | "timeline" | "keyword_coverage" | "jd_copy" | "structure"
       | "keyword_stuffing" | "age_tenure" | "english_mixing";
  severity: "blocker" | "warning";
  location: string;   // 润色稿中的位置
  evidence: string;   // 命中的具体内容
  fixHint: string;    // 给 drafter 的修改指令
}
```

**① 数字守恒**(「量化纪律」的机械化——"数字只能来自原文")
- 提取:正则 `/(\d+(?:\.\d+)?)([%万亿kKwW]|万人|万元)?/g` 分别扫原文和润色稿
- 归一化:`10万`→100000、`20%`→0.2、`1k`→1000、全角→半角
- 判定:润色稿中出现原文没有的新数字 → 若在百分比/金额/用户量语境 → `blocker`;其余(如序号、年份语境)→ `warning`
- 已知误报源:四舍五入(`30.5%`→`31%`)、单位换算误差 → 归一化后仍不匹配才报

**② 时间线一致性**(「一致性自检」的机械化)
- 提取 `YYYY.MM` / `YYYY年M月` 模式,对比原文集合
- 润色稿出现原文没有的时间点 → `blocker`(新增经历时间段几乎必然是编造)

**③ 关键词真实覆盖**
- `matchedKeywords` 声称覆盖的词,必须在润色稿文本中实际出现(简单 `includes` + 同义词豁免表)
- 声称覆盖但实际没有 → 从 matched 挪到 missing,并生成 `blocker`(这是现在最容易被模型糊弄的地方)

**④ JD 照搬检测**(「绝对红线 #1」的机械化)
- JD 滑窗提取所有 12 字子串入 Set;润色稿滑窗比对
- 命中 ≥12 字连续相同片段 → `blocker`,evidence 附上命中的片段
- 纯代码,~30 行,对中文效果很好

**⑤ 结构 sanity**:润色稿非空、长度 ≥ 原文的 60%(防"极简版"误删到空洞)、分区标题存在

**⑥ 关键词实质使用检查**("求职岗位和简历内容相匹配,不是简单换几句话"的机械化)
- 对每个 matched 关键词定位其出现位置:若**只**出现在技能行/简介,未在任何经历描述中实质使用 → `warning`( stuffing 嫌疑,配合 reviewer 判定是否为"简单换几句话"式对齐)
- 附带位置信息(location: "技能行" / "经历#2"),给修订轮明确指令:把关键词落进真实经历,或从 matched 挪到 missing

**⑦ 年龄/工龄放大检查**("年龄和工龄不要特意放大"的机械化)
- 正则提取 `年龄|岁|工龄|X年经验|X+年` 类表述
- 判定:润色稿**新增**年龄表述 → `blocker`;工龄/年限提及次数 > 原文 → `warning`(总结里出现一次总年限合法,项目里反复堆叠即报)

**⑧ 中英夹杂检查**("不要夹英文"的机械化)
- 提取润色稿中所有拉丁词,过滤两类豁免:技术名词白名单(Java/Python/K8s/SQL… + JD 与原文中出现过的技术词)→ 其余中文句子里夹的英文 → `warning`,交给 reviewer 仲裁是术语还是炫技
- 与 `english` 模板互斥:该模板本身输出英文简历,检查器按 templateId 跳过

**⑨ 篇幅估算**("不超过 2 页"的机械化,senior 模板规则;2026-09-16 加入)
- 行数模型:CJK/全角宽 1、拉丁/数字宽 0.5,每行 40 等效字符、每页 45 行(≈10.5pt 常规页边距)
- `concise` 上限 1 页(极简一页版),其余模板 2 页;warning 级(估算 ±15%,最终以打印预览为准)
- 纯文本无法精确分页,精确版需前端对 ResumePreview 渲染高度做 DOM 测量(待定增强)

### 2.3 LLM Reviewer `src/lib/agent/reviewer.ts`

代码检查全绿后才跑(省调用)。AI SDK `generateObject` + Zod:

```ts
const ReviewVerdict = z.object({
  verdict: z.enum(["pass", "revise"]),
  issues: z.array(z.object({
    type: z.enum(["fabrication", "job_duty_copy", "empty_bullets", "changes_mismatch", "summary_structure",
                  "jargon", "internal_codename", "career_arc", "project_context", "value_anchor"]),
    severity: z.enum(["blocker", "warning"]),
    location: z.string(),
    evidence: z.string(),
    fixHint: z.string(),
  })),
  fabricationScan: z.array(z.object({
    claim: z.string(),          // 润色稿中的可疑陈述
    groundedInOriginal: z.boolean(),
  })),
});
```

检查项(对照原文逐条验证,不靠感觉打分):
- **虚构经历**:润色稿中的每条经历/技能是否能在原文找到锚点
- **职责流水账**:是否有"负责开发、参与测试"式无价值行(方法论 #6)
- **changes 与实际 diff 一致**:声明的修改是否真的发生、是否有未声明的实质性修改
- **简介黄金结构**:摘要是否符合"身份定位+技术栈+代表经历+价值"(方法论 #2)
- **外行可读性**("岗位职责能看懂"):无解释的行业缩写、通信行业黑话、只有内部人懂的表述 → `blocker`(与 ⑧ 的代码初筛联动,代码报 warning 的英文夹杂由这里终审)
- **内部代号**("不要写只有内部能懂的项目"):feature 号、项目代号、内部系统名未被改写为能力方向命名 → `blocker`
- **成长弧线**("分段介绍,看到职业生涯的成长"):工作经历是否读得出职责范围/级别的递进,还是平行流水账
- **项目三问**:每个项目有无 ①价值锚点("能体现个人价值或里程碑意义")②难度显性化("项目难度大,体现专业价值")③业务背景("项目背景有业务有市场")——三者至少占其一,全无 → `warning`

### 2.4 循环编排 `src/lib/agent/loop.ts`

```ts
const MAX_ITERATIONS = 2;
let draft = await draftResume(input);                    // 现有 buildPolishPrompt 原样用
for (let i = 0; i <= MAX_ITERATIONS; i++) {
  emit("stage", { stage: "checks", iteration: i });
  const codeIssues = runAllChecks(input.resume, input.jd, draft);
  let verdict = { issues: codeIssues, verdict: ... };
  if (!hasBlocker(codeIssues)) {
    emit("stage", { stage: "review", iteration: i });
    verdict = { issues: codeIssues, ...await reviewWithLLM(input, draft) };
  }
  if (verdict.verdict === "pass" || i === MAX_ITERATIONS) {
    return { draft, reviewReport: { iterations: i, issues: verdict.issues } };  // 残留 issue 如实带出
  }
  emit("stage", { stage: "revise", iteration: i });
  draft = await draftResume(input, { issues: verdict.issues, previousDraft: draft });  // 带着问题清单修订
}
```

**顺带修掉截断问题:** 现在一次调用要出全部结构(这是 route.ts 里截断重试补丁的根因)。拆开后:
- drafter 只出 `polishedResume + changes`(输出小,不再截断)
- interviewPrep / resumeScore 改为通过后并行两个独立小调用,失败可单独重试

### 2.5 接口与前端

- 新增 `POST /api/polish/agent`,**SSE 流式**,事件契约:
  ```
  event: stage  data: {"stage":"draft|checks|review|revise","iteration":n,"status":"start|done"}
  event: issues data: {"issues":[...],"verdict":"revise|pass"}
  event: result data: { ...PolishResult, "reviewReport": {"iterations":n,"checks":[...],"remainingIssues":[...]} }
  event: error  data: {"message":"..."}
  ```
- 前端:把 `page.tsx` 的 setTimeout 假进度换成真实 stage 事件(现有 `polishStep` 三步 UI 直接映射:draft→润色、checks→体检、review→审查)
- 新增「🛡 审查报告」Tab:每轮检查结果、通过项/未通过项、残留 warning
- 润色按钮旁加「深度模式」开关(默认开,关闭则走旧 `/api/polish` 单次路径,作为降级和 A/B 基线)

### 2.6 依赖与文件清单

新增依赖:`zod`。(实现说明:reviewer 需要的只是「JSON 输出 + zod 校验 + 失败重试」,用现有 `callDeepSeek` 的 jsonMode 即可等价实现;`ai`/`@ai-sdk/deepseek` 的工具调用循环能力留到 Phase 2 引入。)

```
新增
├── src/lib/agent/checks.ts        # 确定性检查器(纯函数,可单测)
├── src/lib/agent/reviewer.ts      # LLM reviewer prompt + generateObject
├── src/lib/agent/loop.ts          # 编排 + SSE 事件
├── src/lib/agent/schemas.ts       # Zod schemas(Issue / ReviewVerdict / ReviewReport)
└── src/app/api/polish/agent/route.ts

修改
├── src/lib/prompt.ts              # buildPolishPrompt 支持 issues+previousDraft 参数(修订模式);追加「共享规则块」(见 2.7)
├── src/app/page.tsx               # 真实进度 + 深度模式开关 + 审查报告 Tab
└── package.json

不动
└── templates.ts / DiffView / storage / 旧 /api/polish(降级基线)
```

### 2.7 生成侧:共享规则块(来源:招聘方宣讲的 9 条简历问题)

9 条逐条落位——能写成断言的进检查器(2.2),需要判断的进 reviewer(2.3),纯生成指导的追加到 `buildPolishPrompt` 的 system prompt 尾部,对所有风格模板生效:

| # | 要点 | 落点 |
|---|------|------|
| 01-1 | 工作经历分段介绍,看到职业生涯成长 | drafter 规则 + reviewer「成长弧线」 |
| 01-2 | 求职岗位和简历内容相匹配,不是简单换几句话 | 检查器③(真实覆盖)+ ⑥(stuffing)+ reviewer 终审 |
| 01-3 | 岗位职责能看懂 | reviewer「外行可读性」 |
| 02-1 | 项目能体现个人价值或里程碑意义 | drafter 规则 + reviewer「项目三问①」 |
| 02-2 | 项目难度大,体现专业价值 | drafter 规则 + reviewer「项目三问②」 |
| 02-3 | 项目背景有业务有市场 | drafter 规则 + reviewer「项目三问③」 |
| 03-1 | 年龄和工龄不要特意放大 | 检查器⑦(代码) |
| 03-2 | 不写只有内部能懂的项目和通信行业专业词 | reviewer「内部代号」+ drafter 规则(与 senior 模板可迁移规则同源) |
| 03-3 | 不要夹英文 | 检查器⑧(代码初筛)+ reviewer 终审 |

共享规则块文案(接续现有方法论编号,追加进 system prompt):

```
## 通用方法论(续)

7. **成长弧线**:工作经历分段呈现、按时间倒序,让 HR 能读出职责范围与级别的递进;平级平行的经历合并,或突出相互差异。
8. **项目三问**:每个项目回答——个人价值/里程碑在哪?难度体现在哪(规模/复杂度/0-1/跨团队)?业务与市场背景是什么?三者至少写出一项,全无的项目压缩或删除。
9. **外行可读**:HR 不是你行业内的人。内部项目代号改为能力方向命名,行业缩写首次出现时给一句白话解释。
10. **克制年龄与工龄**:不新增年龄表述;总结中总年限最多出现一次,项目经历中不重复堆叠年限。
11. **中文简历不夹英文**:技术名词(Java、K8s、SQL)保留,其余口语性英文一律换中文表达。
```

**红线约束:** 规则 8/9 受「绝不编造」约束——难度与业务背景只能从原文事实提炼(规模数字、团队跨度、立项缘由),原文没有 → 进 suggestions 提请候选人补充,绝不虚构业务背景。

**与 senior 模板「年龄策略」的冲突消解:** senior 模板第 8 条建议"行业经验写 10+、技术年限拆开写",与 03-1"不放大工龄"不矛盾——边界定为:总结里出现**一次**总年限合法("10+ 年"),检查器⑦只对「新增年龄表述」「重复堆叠年限」报警;senior 模板原有的年限拆写规则保留不动。

## 3. Phase 2:工具化(~3 天)

> **实施记录(2026-09-16,四项全部落地):**
> ① `POST /api/import-jd/url` + `lib/ssrf.ts`(主机名级 SSRF 基线拦截:私网/环回/链路本地/metadata 端点/内网后缀)+ `lib/jdExtract.ts`(Readability 为主、剥壳兜底);
> ② 词库三档存储 `lib/kwStore.ts`(Upstash REST → 本地文件 `.data/`(已 gitignore)→ 内存),高频词自动注入起草 prompt(带红线约束);PDF 走浏览器打印路径(保留文本层),新增 PDF 按钮附"勿用截图类导出"提示;
> ③ `POST /api/research/company` 双支持 TAVILY_API_KEY / BOCHA_API_KEY,未配置时 `configured:false` 优雅降级;调研上下文经 `companyContext` 注入 agent 起草(仅校准表达,不得虚构经历);
> ④ 测试:`phase2.test.ts` 20 例(守卫/抽取/注入),全量 57/57 通过;四端点本地 smoke 验证通过。

按价值排序:

1. **`fetch_jd(url)`** — 服务端抓 URL + Readability 正文抽取。摆脱"只能靠油猴脚本"的限制,支持任意招聘页(BOSS直聘有登录墙,油猴脚本继续保留作为该站专用通道)。挂在 `import-jd` 旁做 `/api/import-jd/url`
2. **PDF 导出(带文本层)** — 关键决策:用 `@react-pdf/renderer`(或打印 CSS + 服务端转换)生成**保留文本层**的 PDF。不要用 html2canvas 系方案——它产出纯图片 PDF,ATS 完全解析不到,等于白润色。可选:导出后自动抽文本层自检(对齐 ai-job-search 仓库 verify_pdf.py 的做法)
3. **`search_company(name)`** — 接搜索 API(博查/Tavily),生成公司调研卡(业务/产品/技术栈),注入 drafter prompt 让关键词对齐公司实际用语。做成**可选开关**:每次润色多 1 次搜索调用 + 显著延迟,默认关
4. **关键词库持久化 + 注入** — 内存 Map 换 Vercel KV/Upstash(当前重新部署即清零);prompt 注入 TOP 高频词做加权(跨岗位高频词 = 通用加分项)

工具注册(AI SDK `generateText` + `tools` + `stopWhen: stepCountIs(6)`),从 Phase 1 的固定编排升级为:模型自主决定是否需要抓 JD/搜公司/迭代。

## 4. Phase 3:端到端自动化(可选,~1 周+,产品化分水岭)

- Vercel Cron 定时抓职位列表(复用油猴通道或 RSS/搜索源)→ fit 评分(复用 resumeScore 维度)→ 高分岗位自动润色 → 通知(邮件/飞书 webhook)
- 前置条件:用户数据从 localStorage 迁到 DB(Supabase 免费档够用)+ 历史记录服务端化
- 商业化切分:免费 = 单次润色(现路径);付费 = 深度模式(验证循环)+ 端到端

## 5. 成本与延迟预算

| | 调用数 | 延迟 | 单次成本(DeepSeek) |
|---|---|---|---|
| 现状 | 1-2(含截断重试) | 15-30s | ~¥0.01 |
| Phase 1 通过一次过 | 3(draft+checks代码+review) | 30-45s | ~¥0.03 |
| Phase 1 修订两轮 | 7 | ≤60s(受 Vercel maxDuration 约束) | ~¥0.07 |

约束与对策:
- Vercel `maxDuration = 60`(route.ts 已声明):流式响应保持连接;时间预算制——超过 45s 直接带残留 issues 返回,不硬撑
- 早期退出:代码检查全绿 + 首轮 review pass 就结束,大多数简历走最快路径

## 6. 风险与对策

| 风险 | 对策 |
|------|------|
| DeepSeek structured output 偶发不合规 | `generateObject` 自动重试;`extractJSON` 兜底逻辑保留 |
| 循环不收敛(同一问题反复修不好) | 硬上限 2 轮;同一 issue 两轮未修复降级 warning;残留如实展示 |
| 数字守恒误报(舍入/换算) | 归一化 + 白名单;新数字先 warning,仅在百分比/金额/用户量语境升 blocker |
| 检查器本身漏报 | 见下方评测集,投毒样本回归 |
| 改造把现有可用功能改坏 | 旧 `/api/polish` 不动,深度模式开关可一键回退 |

**评测集(Phase 1 验收标准):** 固化 5-8 组(简历, JD)黄金样本,其中投毒样本三类:① JD 里放简历完全没有的技能;② 简历含内部代号与中英夹杂(如"负责 feature 号 XX 的 delivery 流程");③ 简历含年龄/工龄强调。断言:① 数字集合守恒;② 时间线不变;③ 投毒技能出现在 missingKeywords 而非正文;④ matchedKeywords 与润色稿实际文本一致;⑤ 润色稿无内部代号、英文夹杂被清除或 reviewer 给出豁免理由;⑥ 未新增年龄表述。改造前后各跑一遍,这是"如何验证 agent 质量"的现成面试素材。

## 7. 建议落地顺序

1. **Day 1 上午**:`checks.ts` 八个检查器(纯函数 + 单测,零风险)
2. **Day 1 下午**:检查器先作为独立「🛡 体检报告」Tab 上线(只报告不闭环,立刻有价值)
3. **Day 2**:reviewer + loop + SSE + 修订模式,接成闭环
4. **之后**:按 Phase 2 逐个上工具,每个独立可交付

## 8. 实施追加:真 agent 化(2026-09-16,tool-use 循环)

深度模式已从"固定编排的验证循环"(§2,保留为 `lib/agent/loop.ts`)升级为**模型驱动的 tool-use agent**(`lib/agent/toolLoop.ts` + `lib/agent/tools.ts`,Vercel AI SDK v5):

**控制权分配(本项目的 workflow→agent 边界答案):**
- **模型决定工作流**:产出草稿后,何时 `check_draft` 自检、是否 `adversarial_review` 对抗审查、何时 `submit_final` 提交、被拒后修什么——全部模型自主决定
- **代码守住不可协商的不变量**:
  1. 提交门禁:`submit_final` 触发确定性检查器**强制复检**,有 blocker 一律拒回并返回 issue 清单(模型无法绕过)
  2. 预算:步数 ≤10、时间 ≤42s
  3. 降级:模型未提交/agent 异常 → 单次起草保底,用户总拿得到结果;残留问题如实标注 `passed:false`

**事件契约不变**(stage/issues/result/error),前端仅新增 `detail` 字段展示工具进度(如"提交被拒:2 个硬伤未修复")。`reviewReport.mode: "tool-agent"` 标记编排模式。

**话术更新**:现在可以准确地说"这是一个 tool-use agent——模型自主决定工具调用序列与迭代策略,代码以不变量(确定性门禁/预算/降级)框定其自由度"。判断标准不变:控制权分配在哪,以及哪些规则被允许脱离模型意志强制执行。

## 9. 实施追加:PDF 排印规范(2026-09-16)

招聘方排印原则落成两层:

**版式层 —— `ResumePrintView`(打印/导出 PDF 唯一来源):**
- 字体统一:思源黑体系栈(Noto Sans SC → Source Han Sans → PingFang → 雅黑),无艺术字
- 字号三档:姓名 20pt / 分区标题 12pt / 正文与元信息 10.5pt(正文落在 10.5-11pt 区间)
- 行距 1.5,分区/条目间距用 margin;`break-inside: avoid` 防条目跨页截断
- 单栏、无表格、无页眉页脚,关键信息全在正文文本流(ATS 可解析);近单色配色
- `@page: A4; margin: 14mm 15mm`;修复存量 bug:预览 Tab 曾与打印实例同时 `print:block`,从预览页打印会输出两份简历
- 屏幕预览保留主题化双栏(视觉设计),打印版式固定专业排印——主题只影响屏幕

**内容层 —— 检查器 ⑩⑪:**
- ⑩ date_format_consistency:年月 token 分离符统计(./-年 四式),≥2 式混用 → warning,指明多数格式并推荐统一为 2023.03;年份区间(2019-2022)与非法月份(2023.13)不参与统计
- ⑪ arabic_numerals:中文数字统计表述(三年/二十人/百分之三十)→ warning 建议改阿拉伯数字;`(?<!第)` 排除序数误报
- 两者均 warning 级,随 runAllChecks 进入体检矩阵(11 项)与 agent 提交门禁

## 10. 实施追加:ATS 筛选模拟(2026-09-16)

"投递前让 ATS 替 HR 先筛你一遍"——确定性规则打分(`lib/ats.ts` + `POST /api/ats/screen` + AtsScreenView 双栏对比):

**评分模型(100):**
- 关键词 40:JD 技术词(内置词库 `techTerms.ts` ∩ JD)+ LLM 润色产出的 jdKeywords,命中率打分;词库为空给中性偏下分
- 硬性条件 30:年限(JD"X年经验" vs 简历时间跨度,**剔除教育背景行**)、学历(大专/本科/硕士/博士档位对比)、语言(CET/流利度);无法评估 → unknown 不计分
- 可解析性 20:邮箱/手机可提取、标准分区齐全、经历可定位时间、篇幅合理——解析失败在真实 ATS 中常直接进人才库
- 格式 10:复用检查器 ⑨⑩⑪(篇幅/日期一致性/阿拉伯数字)

**输出:润色前 vs 润色后双栏对比 + 分差。** 诚实边界写在 UI 上:模拟规则筛选层,不模拟语义排序与人眼,非商业系统真实评分。

**顺带修复两个真 bug(测试驱动出来的):**
1. `extractDates` 不识别"2023.07-至今"——中国简历最常见的区间写法,"至今"端点现用当前时间补齐;此前 ② 时间线检查与年限估算对在职经历全部失灵
2. 工龄估算把教育背景年份算进去(2012 入学 → "14 年经验")——现剔除教育行日期

测试 81/81(ATS 6 例 + 至今区间 2 例 + 区间外语义修正)。

## 11. 实施追加:Phase 3 端到端自动化(2026-09-16)

**架构决策(偏离原方案,记录理由):** 不引入 DB/Vercel Cron——Hobby 档 Cron 只有 daily 且 serverless 有时长上限(深度润色是 50s 级 LLM 循环),而油猴脚本本就要求本地应用常驻。定时任务放本地 daemon,零基础设施、零新依赖服务。

**交付(`scripts/pipeline.ts` + `scripts/watch.ts`,`npm run watch`):**
- 链路:RSS/JSON 职位源 → 去重(state.json,上限 5000)→ mustKeywords 粗筛(免费)→ fit 打分(零 LLM:内置词库双向命中 + 标题方向加权;泛职位不参与反向拉分)→ 高分岗位 → 落盘(records.json,200 条滚动)→ 飞书 webhook 通知
- `--once` 单轮调试模式;配置模板自动生成并守门(占位简历拒绝运行)
- 单源失败/详情抓取失败不阻断;详情抓取复用主应用 Readability + SSRF 守卫
- **成本纪律:自动化层不烧 LLM 预算**——fit 与粗筛全为本地规则,深度润色留给用户在 UI 确认后手动触发(daemon 只负责把高 fit 岗位准备好并通知)

**实测(Remotive 真实源):** 15 条岗位 → fit 排序落盘 → 二轮全部去重。fit 分布合理(Rails 岗 18 分 vs Java 简历,如实偏低)。

**后续可选(未做):** UI 内嵌 watch 结果 Tab;高分岗位自动调 /api/polish/agent(需先解决"谁付 LLM 成本"的产品决策——建议保留人工确认门)。
