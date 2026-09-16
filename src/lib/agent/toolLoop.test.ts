/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateText } from "ai";
import { callDeepSeek } from "../deepseek";
import { runToolAgentLoop } from "./toolLoop";
import type { AgentResultPayload } from "./schemas";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  // tool(cfg) => cfg:保留配置对象,测试直接驱动 execute
  tool: (cfg: any) => cfg,
  stepCountIs: (n: number) => n,
}));
vi.mock("@ai-sdk/deepseek", () => ({
  createDeepSeek: () => (id: string) => ({ modelId: id }),
}));
vi.mock("../deepseek", () => ({ callDeepSeek: vi.fn() }));

const mockedGenerate = vi.mocked(generateText);
const mockedCall = vi.mocked(callDeepSeek);

// ---- 测试素材 -------------------------------------------------------------

const INPUT = {
  resume: "2018-2020 A公司 参与交易系统开发,服务用户 100万\n教育背景:XX大学\n技能:Java",
  jd: "招聘交易系统研发工程师",
  templateId: "professional" as const,
  formatId: "classic" as const,
};

/** 提交门禁可通过的终稿(matched 关键词真实落在正文) */
const GOOD_SUBMIT = {
  polishedResume: "2018-2020 A公司 主导交易系统研发,负责订单链路,服务用户 100万\n教育背景:XX大学\n技能:Java",
  changes: [{ original: "参与交易系统开发", modified: "主导交易系统研发", reason: "强化主导性" }],
  jdKeywords: ["交易系统"],
  matchedKeywords: ["交易系统"],
  missingKeywords: ["风控"],
  suggestions: ["建议补充风控相关经历"],
};

/** matched 声称 Kafka 但正文没有 → keyword_coverage blocker → 门禁拒回 */
const BAD_SUBMIT = {
  polishedResume: "2018-2020 A公司 主导交易系统研发,负责订单链路,服务用户 100万\n教育背景:XX大学\n技能:Java",
  changes: [],
  jdKeywords: ["交易系统"],
  matchedKeywords: ["Kafka"],
  missingKeywords: [],
  suggestions: [],
};

const PREP = JSON.stringify({ likelyQuestions: ["q1"], talkingPoints: [], weakPoints: [], starStories: [] });
const SCORE = JSON.stringify({ total: 80, dimensions: [], summary: "s", improvements: [] });

/** 驱动 generateText:在单次调用内按队列依次提交(模拟模型的"被拒→修复→再提交"循环) */
function scriptSubmissions(queue: any[]) {
  mockedGenerate.mockImplementation(async (params: any) => {
    const submit = (params as any).tools?.submit_final;
    for (const payload of queue) {
      if (submit) await submit.execute(payload, { toolCallId: "t1", messages: [] } as any);
    }
    return { text: "", steps: queue.map(() => ({})) } as any;
  });
}

function collect() {
  const events: { event: string; data: Record<string, unknown> }[] = [];
  return {
    events,
    emit: (event: string, data: unknown) => events.push({ event, data: data as Record<string, unknown> }),
    result: () => events.find((e) => e.event === "result")?.data as unknown as AgentResultPayload,
  };
}

beforeEach(() => {
  mockedGenerate.mockReset();
  mockedCall.mockReset();
  // 收尾的面试准备/评分调用
  mockedCall.mockImplementation(async (messages: { role: string; content: string }[]) => {
    const sys = messages.find((m) => m.role === "system")?.content ?? "";
    return sys.includes("面试教练") ? PREP : sys.includes("简历评审") ? SCORE : "{}";
  });
});

// ---------------------------------------------------------------------------

describe("runToolAgentLoop(模型驱动 tool-use agent)", () => {
  it("模型一次提交即通过门禁 → result.passed=true, iterations=1", async () => {
    scriptSubmissions([GOOD_SUBMIT]);
    const { events, emit, result } = collect();

    await runToolAgentLoop(INPUT, emit);

    const r = result();
    expect(r.reviewReport.passed).toBe(true);
    expect(r.reviewReport.iterations).toBe(1);
    expect(r.reviewReport.mode).toBe("tool-agent");
    expect(r.polishedResume).toContain("主导交易系统研发");
    // 收尾已解耦(2026-09-16):面试建议/评分由前端二次请求 /api/polish/finalize,主结果不带
    expect(r.interviewPrep).toBeUndefined();
    expect(r.resumeScore).toBeUndefined();
    // 也不应再有 finalize stage(不再挤占主请求沙漏)
    expect(events.some((e) => e.event === "stage" && e.data.stage === "finalize")).toBe(false);
    expect(events.some((e) => e.event === "error")).toBe(false);
  });

  it("首次提交被门禁拒回(issues.verdict=revise)→ 修复后二次提交通过", async () => {
    scriptSubmissions([BAD_SUBMIT, GOOD_SUBMIT]);
    const { events, emit, result } = collect();

    await runToolAgentLoop(INPUT, emit);

    const r = result();
    expect(r.reviewReport.passed).toBe(true);
    expect(r.reviewReport.iterations).toBe(2);
    const issueEvents = events.filter((e) => e.event === "issues");
    expect(issueEvents[0].data.verdict).toBe("revise");
    expect(issueEvents[0].data.blockerCount).toBe(1);
    expect(issueEvents[1].data.verdict).toBe("pass");
  });

  it("预算内始终未通过:接受最后一次提交,残留 blocker 如实带出,passed=false", async () => {
    scriptSubmissions([BAD_SUBMIT, BAD_SUBMIT]);
    const { events, emit, result } = collect();

    await runToolAgentLoop(INPUT, emit);

    const r = result();
    expect(r.reviewReport.passed).toBe(false);
    expect(r.reviewReport.iterations).toBe(2);
    expect(r.reviewReport.issues.filter((i) => i.severity === "blocker").length).toBeGreaterThan(0);
    expect(r.polishedResume).toContain("主导交易系统研发"); // 仍有产出,不空手
  });

  it("模型从未调用 submit_final → 降级单次起草,用户仍拿得到结果", async () => {
    scriptSubmissions([]); // generateText 直接返回,不触发任何工具
    mockedCall.mockImplementation(async (messages: { role: string; content: string }[]) => {
      const sys = messages.find((m) => m.role === "system")?.content ?? "";
      if (sys.includes("面试教练")) return PREP;
      if (sys.includes("简历评审")) return SCORE;
      if (sys.includes("简历顾问")) return JSON.stringify(GOOD_SUBMIT); // 降级起草
      return "{}";
    });
    const { events, emit, result } = collect();

    await runToolAgentLoop(INPUT, emit);

    const r = result();
    expect(r.reviewReport.passed).toBe(true);
    expect(r.reviewReport.iterations).toBe(1);
    expect(r.polishedResume).toContain("主导交易系统研发");
    expect(events.some((e) => e.event === "stage" && (e.data.detail as string)?.includes("降级"))).toBe(true);
  });

  it("generateText 整体失败(如 API 不可用)→ 同样走降级起草", async () => {
    mockedGenerate.mockRejectedValue(new Error("provider down"));
    mockedCall.mockImplementation(async (messages: { role: string; content: string }[]) => {
      const sys = messages.find((m) => m.role === "system")?.content ?? "";
      if (sys.includes("面试教练")) return PREP;
      if (sys.includes("简历评审")) return SCORE;
      if (sys.includes("简历顾问")) return JSON.stringify(GOOD_SUBMIT);
      return "{}";
    });
    const { events, emit, result } = collect();

    await runToolAgentLoop(INPUT, emit);

    expect(result().reviewReport.passed).toBe(true);
    expect(events.some((e) => e.event === "error")).toBe(false);
  });

  it("降级起草也失败(如缺少 API Key)→ error 事件,不发 result", async () => {
    scriptSubmissions([]);
    mockedCall.mockRejectedValue(new Error("缺少 DEEPSEEK_API_KEY"));
    const { events, emit } = collect();

    await runToolAgentLoop(INPUT, emit);

    expect(events.some((e) => e.event === "error")).toBe(true);
    expect(events.some((e) => e.event === "result")).toBe(false);
  });
});
