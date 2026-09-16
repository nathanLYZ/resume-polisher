import { describe, it, expect } from "vitest";
import { screenResume } from "./ats";

const JD = `高级后端工程师
岗位职责:负责交易系统的设计与开发,主导微服务架构演进。
任职要求:
1. 本科及以上学历,计算机相关专业;
2. 5年以上后端开发经验;
3. 精通 Java,熟悉 MySQL、Redis、Kafka,有 K8s 经验者优先;
4. 英语六级优先。`;

const RESUME = `李四
邮箱:lisi@example.com 电话:13812345678
教育背景:XX大学 计算机科学与技术 本科(2012.09-2016.06)
工作经历
2016.07-2019.06 A公司 后端工程师
基于 Spring Boot 开发订单系统,使用 MySQL 与 Redis 优化核心链路
2019.07-至今 B公司 高级后端工程师
主导交易系统微服务改造,引入 Kafka 削峰,通过 CET-6,英语流利
技能:Java、Spring、MySQL、Redis、Kafka、K8s、Docker`;

describe("screenResume", () => {
  it("匹配简历:关键词命中、条件满足 → 高分 likely_pass", () => {
    const r = screenResume(RESUME, JD, { jdKeywords: ["微服务", "Java", "Kafka", "K8s"] });
    expect(r.verdict).toBe("likely_pass");
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.keywords.hitRate).toBeGreaterThanOrEqual(0.7);
    expect(r.hardRequirements.items.some((i) => i.type === "degree" && i.status === "met")).toBe(true);
    expect(r.hardRequirements.items.some((i) => i.type === "years" && i.status === "met")).toBe(true);
    expect(r.parseability.checks.every((c) => c.ok)).toBe(true);
  });

  it("空关键词列表时自动用内置词库扫 JD", () => {
    const r = screenResume(RESUME, JD);
    expect(r.keywords.total).toBeGreaterThan(3); // java/mysql/redis/kafka/k8s 至少命中
    expect(r.keywords.source).toBe("builtin_lexicon");
    expect(r.keywords.matched).toContain("java");
  });

  it("硬缺口简历:年限不足 + 学历低于要求 → likely_reject", () => {
    const weak = `张三
邮箱:zs@example.com 电话:13812345678
教育背景:XX职业技术学院 大专
2023.07-至今 实习,参与测试工作`;
    const r = screenResume(weak, JD);
    expect(r.hardRequirements.items.some((i) => i.type === "years" && i.status === "missing")).toBe(true);
    expect(r.hardRequirements.items.some((i) => i.type === "degree" && i.status === "missing")).toBe(true);
    expect(r.verdict).toBe("likely_reject");
  });

  it("润色提升可量化:同一份弱简历润色后分数上升", () => {
    const weak = `王五
邮件缺失
大专学历,2020-2022 曾做过后端工作
熟悉 java mysql`;
    const polished = `王五
邮箱:wangwu@example.com 电话:13912345678
教育背景:XX学院 大专
工作经历
2020.03-2022.05 后端工程师
负责订单系统,Java + MySQL 技术栈,服务 5万 用户
技能:Java、MySQL、Redis、Kafka、K8s`;
    const before = screenResume(weak, JD);
    const after = screenResume(polished, JD, { jdKeywords: ["微服务", "Java", "MySQL", "Kafka", "K8s"] });
    expect(after.score).toBeGreaterThan(before.score);
  });

  it("无联系方式/无分区 → 可解析性扣分并在明细可见", () => {
    const bare = "三年经验,做过订单系统,熟悉 Java";
    const r = screenResume(bare, JD);
    expect(r.parseability.score).toBeLessThan(20);
    expect(r.parseability.checks.find((c) => c.name === "联系方式-邮箱")?.ok).toBe(false);
  });

  it("格式分:超长 + 日期混用 → 格式扣分并出现在 notes", () => {
    const long = Array.from({ length: 110 }, (_, i) =>
      i % 2 === 0 ? `${2000 + Math.floor(i / 40)}.0${(i % 9) + 1} 负责订单系统研发,使用 Java 与 MySQL` : "2021/06 参与项目"
    ).join("\n");
    const r = screenResume(long, JD);
    expect(r.format.score).toBeLessThan(10);
    expect(r.format.notes.length).toBeGreaterThan(0);
  });
});