import { describe, it, expect, vi, beforeEach } from "vitest";
import { callDeepSeek } from "../deepseek";
import { runAgentLoop, type AgentRunInput } from "./loop";
import type { AgentResultPayload } from "./schemas";

vi.mock("../deepseek", () => ({ callDeepSeek: vi.fn() }));

const mockedCall = vi.mocked(callDeepSeek);

// ---- 测试素材 -------------------------------------------------------------

const INPUT: AgentRunInput = {
  resume: "2018-2020 A公司 参与交易系统开发,服务用户 100万\n教育背景:XX大学\n技能:Java",
  jd: "招聘交易系统研发工程师",
  templateId: "professional",
  formatId: "classic",
};

/** 全部检查可通过的起草结果(matched 关键词落在经历行、无新数字/时间/年龄) */
const GOOD_DRAFT = JSON.stringify({
  polishedResume: "2018-2020 A公司 主导交易系统研发,负责订单链路,服务用户 100万\n教育背景:XX大学\n技能:Java",
  changes: [{ original: "参与交易系统开发", modified: "主导交易系统研发", reason: "强化主导性" }],
  jdKeywords: ["交易系统"],
  matchedKeywords: ["交易系统"],
  missingKeywords: ["风控"],
  suggestions: ["建议补充风控相关经历"],
});

/** matched 声称 Kafka 但正文没有 → 触发 keyword_coverage blocker */
const BAD_DRAFT = JSON.stringify({
  polishedResume: "2018-2020 A公司 主导交易系统研发,负责订单链路,服务用户 100万\n教育背景:XX大学\n技能:Java",
  changes: [],
  jdKeywords: ["交易系统"],
  matchedKeywords: ["Kafka"],
  missingKeywords: [],
  suggestions: [],
});

const REVIEW_PASS = JSON.stringify({ verdict: "pass", issues: [], fabricationScan: [] });
const REVIEW_BLOCK = JSON.stringify({
  verdict: "revise",
  issues: [
    { type: "fabrication", severity: "blocker", location: "第1行", evidence: "「主导」原文为「参与」,无升级依据", fixHint: "降回参与,或补充主导的原文依据" },
  ],
  fabricationScan: [{ claim: "主导交易系统研发", groundedInOriginal: false }],
});
const PREP = JSON.stringify({ likelyQuestions: ["介绍一下订单链路"], talkingPoints: [], weakPoints: [], starStories: [] });
const SCORE = JSON.stringify({ total: 80, dimensions: [{ name: "JD匹配度", score: 80, comment: "尚可" }], summary: "整体合格", improvements: ["补风控", "补量化", "精简职责行"] });

/** 按 system prompt 角色词分发到对应桩响应 */
function stubByRole(opts: {
  draft: string | ((messages: { role: string; content: string }[]) => string);
  review?: string | Error;
  prep?: string;
  score?: string;
}) {
  mockedCall.mockImplementation(async (messages: { role: string; content: string }[]) => {
    const sys = messages.find((m) => m.role === "system")?.content ?? "";
    const joined = messages.map((m) => m.content).join("\n");
    if (sys.includes("对抗式简历审查员")) {
      if (opts.review instanceof Error) throw opts.review;
      return opts.review ?? REVIEW_PASS;
    }
    if (sys.includes("面试教练")) return opts.prep ?? PREP;
    if (sys.includes("简历评审")) return opts.score ?? SCORE;
    // 起草调用:修订轮的消息里带有"未通过审查"标记
    if (typeof opts.draft === "function") return opts.draft(messages);
    return joined.includes("未通过审查") ? GOOD_DRAFT : opts.draft;
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
  mockedCall.mockReset();
});

// ---------------------------------------------------------------------------

describe("runAgentLoop", () => {
  it("首轮通过:draft → 体检 → 审查 → 并行收尾,共 4 次 LLM 调用", async () => {
    stubByRole({ draft: GOOD_DRAFT });
    const { events, emit, result } = collect();

    await runAgentLoop(INPUT, emit);

    const r = result();
    expect(r.reviewReport.passed).toBe(true);
    expect(r.reviewReport.iterations).toBe(1);
    expect(r.reviewReport.passed).toBe(true);
    expect(r.polishedResume).toContain("主导交易系统研发");
    expect(r.interviewPrep?.likelyQuestions).toEqual(["介绍一下订单链路"]);
    expect(r.resumeScore?.total).toBe(80);

    const stages = events.filter((e) => e.event === "stage").map((e) => `${e.data.stage}:${e.data.status}`);
    expect(stages).toEqual([
      "draft:start", "draft:done",
      "checks:start", "checks:done",
      "review:start", "review:done",
      "finalize:start", "finalize:done",
    ]);
    expect(mockedCall).toHaveBeenCalledTimes(4); // draft + review + prep + score
  });

  it("首轮代码检查不过 → 带问题清单修订 → 第二轮通过", async () => {
    stubByRole({ draft: BAD_DRAFT }); // 修订轮(消息含"未通过审查")自动换 GOOD_DRAFT
    const { events, emit, result } = collect();

    await runAgentLoop(INPUT, emit);

    const r = result();
    expect(r.reviewReport.iterations).toBe(2);
    expect(r.reviewReport.passed).toBe(true);

    const issueEvents = events.filter((e) => e.event === "issues");
    expect(issueEvents[0].data.verdict).toBe("revise");
    expect(issueEvents[0].data.blockerCount).toBe(1);
    expect(issueEvents[1].data.verdict).toBe("pass");

    // 修订轮是新一轮起草调用(system 含"简历顾问";排除 reviewer/prep/score)
    const draftCalls = mockedCall.mock.calls.filter((m) => (m[0][0]?.content ?? "").includes("简历顾问"));
    expect(draftCalls.length).toBe(2);
  });

  it("审查持续报 blocker → 达上限 3 轮后带残留问题如实返回,passed=false", async () => {
    stubByRole({ draft: GOOD_DRAFT, review: REVIEW_BLOCK });
    const { emit, result } = collect();

    await runAgentLoop(INPUT, emit);

    const r = result();
    expect(r.reviewReport.passed).toBe(false);
    expect(r.reviewReport.iterations).toBe(3);
    const blockers = r.reviewReport.issues.filter((i) => i.severity === "blocker");
    expect(blockers.length).toBeGreaterThan(0);
    expect(blockers[0].source).toBe("review");
    expect(mockedCall).toHaveBeenCalledTimes(3 + 3 + 2); // 3轮draft+3轮review + 收尾2
  });

  it("reviewer 挂掉不阻断:代码检查已绿则按通过处理", async () => {
    stubByRole({ draft: GOOD_DRAFT, review: new Error("reviewer boom") });
    const { events, emit, result } = collect();

    await runAgentLoop(INPUT, emit);

    const r = result();
    expect(r.reviewReport.passed).toBe(true);
    expect(events.some((e) => e.event === "error")).toBe(false);
  });

  it("起草彻底失败 → 发 error 事件,不发 result", async () => {
    mockedCall.mockImplementation(async () => {
      throw new Error("缺少 DEEPSEEK_API_KEY");
    });
    const { events, emit } = collect();

    await runAgentLoop(INPUT, emit);

    expect(events.some((e) => e.event === "error")).toBe(true);
    expect(events.some((e) => e.event === "result")).toBe(false);
    expect((events.find((e) => e.event === "error")?.data.message as string)).toContain("DEEPSEEK_API_KEY");
  });
});
