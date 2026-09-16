import { describe, it, expect } from "vitest";
import { scoreFit, dedupe, markSeen, type JobPosting, type WatchState } from "./pipeline";

const RESUME = `工作经历
负责交易系统研发,Java + MySQL 技术栈,基于 Redis 优化缓存,服务 5万 用户
主导微服务改造,引入 Kafka 削峰
技能:Java、MySQL、Redis、Kafka、K8s、Spring`;

function job(title: string, description: string, id = `t:${title}`): JobPosting {
  return { id, title, url: `https://example.com/${id}`, description };
}

// ---------------------------------------------------------------- fit 打分

describe("scoreFit", () => {
  it("高度匹配:JD 技术词与简历技能大面积重合 → 高分", () => {
    const j = job("高级后端工程师", "精通 Java,熟悉 MySQL、Redis、Kafka,有 K8s 经验,负责微服务架构");
    const r = scoreFit(j, RESUME);
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.reasons.some((x) => x.includes("java"))).toBe(true);
  });

  it("完全不相关:前端/设计岗 → 低分", () => {
    const j = job("资深视觉设计师", "负责品牌视觉设计,熟练使用 Photoshop、Illustrator,有动效设计经验");
    const r = scoreFit(j, RESUME);
    expect(r.score).toBeLessThan(50);
  });

  it("JD 无技术词(泛职位)→ 给中性偏下分,不误杀也不高分", () => {
    const j = job("储备干部", "责任心强,沟通能力好,能接受出差");
    const r = scoreFit(j, RESUME);
    expect(r.score).toBe(40);
    expect(r.reasons).toHaveLength(0);
  });

  it("标题方向命中加权", () => {
    const backend = scoreFit(job("后端工程师", "负责服务端开发"), RESUME);
    const generic = scoreFit(job("专员", "负责服务端开发"), RESUME);
    expect(backend.score).toBeGreaterThan(generic.score);
  });
});

// ---------------------------------------------------------------- 去重与状态

describe("dedupe / markSeen", () => {
  const s: WatchState = { seenIds: ["a", "b"] };

  it("已见岗位被过滤", () => {
    const jobs = [job("X", "d", "a"), job("Y", "d", "b"), job("Z", "d", "c")];
    expect(dedupe(jobs, s).map((j) => j.id)).toEqual(["c"]);
  });

  it("markSeen 合并且保留 lastRunAt", () => {
    const next = markSeen(s, [job("Z", "d", "c"), job("W", "d", "d")]);
    expect(next.seenIds.sort()).toEqual(["a", "b", "c", "d"]);
    expect(next.lastRunAt).toBeTruthy();
  });

  it("seenIds 超 5000 截断(防无限增长)", () => {
    let st: WatchState = { seenIds: [] };
    const batch = Array.from({ length: 1200 }, (_, i) => job(`j${i}`, "d", `j${i}`));
    for (let i = 0; i < 5; i++) st = markSeen(st, batch.map((j) => ({ ...j, id: `${j.id}-${i}` })));
    expect(st.seenIds.length).toBeLessThanOrEqual(5000);
  });
});