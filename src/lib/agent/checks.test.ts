import { describe, it, expect } from "vitest";
import {
  runAllChecks,
  hasBlocker,
  checkNumberConservation,
  checkTimeline,
  checkKeywordCoverage,
  checkJdCopy,
  checkStructure,
  checkKeywordStuffing,
  checkAgeTenure,
  checkEnglishMixing,
  estimatePages,
  checkPageEstimate,
  checkDateFormatConsistency,
  checkArabicNumerals,
  type Issue,
} from "./checks";

function byCheck(issues: Issue[]) {
  return Object.fromEntries(issues.map((i) => [i.check, i]));
}

// ---------------------------------------------------------------------------
// ① 数字守恒
// ---------------------------------------------------------------------------

describe("checkNumberConservation", () => {
  it("原文数字复用 → 通过", () => {
    const original = "负责支付系统,日交易额 500万,峰值 QPS 3000,转化率提升 20%";
    const polished = "主导支付系统建设,日交易额 500万,峰值 QPS 3000,转化率提升 20%";
    expect(checkNumberConservation(original, polished)).toEqual([]);
  });

  it("新增百分比 → blocker", () => {
    const original = "负责运营工作,用户量 10万";
    const polished = "负责运营工作,用户量 10万,转化率提升 35%";
    const issues = checkNumberConservation(original, polished);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("blocker");
    expect(issues[0].evidence).toContain("35%");
  });

  it("新增无单位数字 → warning", () => {
    const original = "负责客服团队管理";
    const polished = "负责客服团队管理,服务 500 家客户";
    const issues = checkNumberConservation(original, polished);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
  });

  it("四舍五入容差:30.5% → 31% 视为同一数字", () => {
    const original = "接口耗时降低 30.5%";
    const polished = "接口耗时降低 31%";
    expect(checkNumberConservation(original, polished)).toEqual([]);
  });

  it("单位换算守恒:10万 → 100000 视为同一数字", () => {
    const original = "服务用户 10万";
    const polished = "服务用户 100000";
    expect(checkNumberConservation(original, polished)).toEqual([]);
  });

  it("行首列表序号不参与守恒", () => {
    const original = "1. 负责前端开发\n2. 负责性能优化,加载速度提升 40%";
    const polished = "1. 主导前端开发\n2. 主导性能优化,加载速度提升 40%";
    expect(checkNumberConservation(original, polished)).toEqual([]);
  });

  it("日期中的月份不误报(2020.03 重写为 2020年3月)", () => {
    const original = "2020.03-2022.05 就职于 XX 公司";
    const polished = "2020年3月 至 2022年5月 就职于 XX 公司";
    expect(checkNumberConservation(original, polished)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ② 时间线
// ---------------------------------------------------------------------------

describe("checkTimeline", () => {
  const original = "2018.06-2020.03 A公司 后端工程师\n2020.04-至今 B公司 高级工程师";

  it("时间线不变 → 通过", () => {
    const polished = "2018.06-2020.03 A公司\n2020.04-至今 B公司";
    expect(checkTimeline(original, polished)).toEqual([]);
  });

  it("新增区间外月份 → blocker", () => {
    const polished = "2018.06-2020.03 A公司\n2020.04-至今 B公司\n2023.05 主导 XX 项目";
    const issues = checkTimeline(original, polished);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("blocker");
  });

  it("新增区间内月份(区间推断)→ warning", () => {
    const polished = "2019.01 获内部奖项\n2018.06-2020.03 A公司";
    const issues = checkTimeline(original, polished);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
  });

  it("新增区间外年份 → blocker;区间内年份 → warning", () => {
    const inRange = checkTimeline(original, "2019 年获得季度之星\n2018.06-2020.03 A公司");
    expect(inRange[0].severity).toBe("warning");
    const outRange = checkTimeline(original, "2016 年入职培训\n2018.06-2020.03 A公司");
    expect(outRange[0].severity).toBe("blocker");
  });
});

// ---------------------------------------------------------------------------
// ③ 关键词真实覆盖
// ---------------------------------------------------------------------------

describe("checkKeywordCoverage", () => {
  it("声称覆盖且实际存在 → 通过", () => {
    expect(checkKeywordCoverage(["微服务", "Kafka"], "负责微服务架构,消息队列选用 Kafka")).toEqual([]);
  });

  it("声称覆盖但润色稿没有 → blocker", () => {
    const issues = checkKeywordCoverage(["K8s"], "负责容器化部署工作");
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("blocker");
    expect(issues[0].fixHint).toContain("missingKeywords");
  });

  it("同义词豁免:声称 K8s,润色稿写 Kubernetes → 通过", () => {
    expect(checkKeywordCoverage(["K8s"], "基于 Kubernetes 的容器平台")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ④ JD 照搬检测
// ---------------------------------------------------------------------------

describe("checkJdCopy", () => {
  const jd = "岗位职责:负责微服务架构设计与演进,主导核心链路的性能优化,保障系统高可用与稳定性。";

  it("照搬 JD 句子 → blocker", () => {
    const polished = "某公司后端工程师\n负责微服务架构设计与演进,主导核心链路的性能优化";
    const issues = checkJdCopy("", jd, polished);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("blocker");
  });

  it("只借用关键词、用自己的话重写 → 通过", () => {
    const polished = "将单体应用拆分为 12 个微服务,核心接口 P99 延迟从 800ms 降至 200ms";
    expect(checkJdCopy("", jd, polished)).toEqual([]);
  });

  it("原文已存在相同片段(用户自己抄过)→ 降级为 warning", () => {
    const original = "负责微服务架构设计与演进,主导核心链路的性能优化";
    const issues = checkJdCopy(original, jd, original);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
  });
});

// ---------------------------------------------------------------------------
// ⑤ 结构 sanity
// ---------------------------------------------------------------------------

describe("checkStructure", () => {
  const original = "个人信息\n教育背景:XX大学\n工作经历:XX公司\n项目经历:XX系统\n技能:Java";

  it("分区完整、长度正常 → 通过", () => {
    const polished = "个人信息\n教育背景:XX大学\n工作经历:XX公司(优化)\n项目经历:XX系统(优化)\n技能:Java、Kafka";
    expect(checkStructure(original, polished)).toEqual([]);
  });

  it("原文有教育背景,润色稿删掉 → warning", () => {
    const polished = "个人信息\n工作经历:XX公司\n项目经历:XX系统\n技能:Java";
    const issues = checkStructure(original, polished);
    expect(issues.some((i) => i.evidence.includes("教育背景"))).toBe(true);
  });

  it("润色稿被删到只剩空洞 → warning;极简模板阈值放宽", () => {
    const short = "工作经历:XX公司";
    expect(checkStructure(original, short).some((i) => i.evidence.includes("长度"))).toBe(true);
    // 极简版仍保留各分区(压缩后 ~49% > 25% 阈值)→ 不报长度问题
    const concise = "教育背景:XX大学\n工作经历:XX公司\n技能:Java";
    expect(checkStructure(original, concise, "concise").some((i) => i.evidence.includes("长度"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ⑥ 关键词实质使用
// ---------------------------------------------------------------------------

describe("checkKeywordStuffing", () => {
  it("关键词只堆在技能行 → warning", () => {
    const polished = "工作经历\n负责订单系统重构,支撑大促流量\n核心技能:精通 Java、Kafka、微服务";
    const issues = checkKeywordStuffing(["Kafka", "微服务", "Java"], polished);
    expect(issues).toHaveLength(3); // 三个关键词都只出现在技能行
    expect(issues.every((i) => i.severity === "warning")).toBe(true);
  });

  it("关键词落入经历描述 → 通过", () => {
    const polished = "工作经历\n基于 Kafka 搭建订单事件流\n核心技能:Java";
    expect(checkKeywordStuffing(["Kafka"], polished)).toEqual([]);
  });

  it("关键词完全没出现 → 不在本检查辖区(③负责)", () => {
    expect(checkKeywordStuffing(["Docker"], "负责订单系统")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ⑦ 年龄/工龄放大
// ---------------------------------------------------------------------------

describe("checkAgeTenure", () => {
  it("新增年龄表述 → blocker", () => {
    const issues = checkAgeTenure("负责后端开发", "年龄:28岁\n负责后端开发");
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("blocker");
  });

  it("原文已有的年龄表述保留 → 通过", () => {
    expect(checkAgeTenure("年龄:28岁\n负责后端开发", "负责后端开发\n年龄:28岁")).toEqual([]);
  });

  it("年限重复堆叠 → warning;出现一次 → 通过", () => {
    const original = "10年工作经验,负责风控系统";
    expect(checkAgeTenure(original, "10年工作经验,负责风控系统")).toEqual([]);
    const stacked = checkAgeTenure(
      original,
      "10年工作经验。项目一:10年经验的风控体系建设。项目二:10年经验的实时反欺诈"
    );
    expect(stacked).toHaveLength(1);
    expect(stacked[0].severity).toBe("warning");
  });
});

// ---------------------------------------------------------------------------
// ⑧ 中英夹杂
// ---------------------------------------------------------------------------

describe("checkEnglishMixing", () => {
  const original = "负责交易系统研发";
  const jd = "负责交易系统的稳定性建设";

  it("技术名词豁免 → 通过", () => {
    const polished = "使用 Java 和 K8s 重构交易系统,基于 Redis 优化缓存";
    expect(checkEnglishMixing(original, jd, polished)).toEqual([]);
  });

  it("口语性英文夹杂 → warning", () => {
    const polished = "负责整个 delivery 流程的推进";
    const issues = checkEnglishMixing(original, jd, polished);
    expect(issues).toHaveLength(1);
    expect(issues[0].evidence).toContain("delivery");
  });

  it("原文/JD 中已有的英文词豁免", () => {
    const issues = checkEnglishMixing("负责 OMS 系统研发", "熟悉 OMS 领域", "负责 OMS 订单中台建设");
    expect(issues).toEqual([]);
  });

  it("english 模板跳过检查", () => {
    const polished = "Led the delivery of core trading systems";
    expect(checkEnglishMixing(original, jd, polished, "english")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 汇总入口
// ---------------------------------------------------------------------------

describe("runAllChecks / hasBlocker", () => {
  it("干净输入 → 无 issue,无 blocker", () => {
    const input = {
      original: "2019-2022 A公司 负责 Java 交易系统研发,日订单 100万\n教育背景:XX大学\n技能:Java",
      jd: "负责高并发交易系统研发",
      polished: "2019-2022 A公司 主导 Java 交易系统研发,日订单 100万\n教育背景:XX大学\n技能:Java",
      matchedKeywords: ["Java"],
    };
    const issues = runAllChecks(input);
    expect(issues).toEqual([]);
    expect(hasBlocker(issues)).toBe(false);
  });

  it("多项问题汇总,blocker 判定生效", () => {
    const input = {
      original: "负责后台开发",
      jd: "负责微服务架构设计与演进,主导核心链路的性能优化,保障系统高可用",
      polished: "年龄:30岁\n负责微服务架构设计与演进,主导核心链路的性能优化,提升 50%",
      matchedKeywords: ["微服务", "Docker"],
    };
    const issues = runAllChecks(input);
    const checks = new Set(issues.map((i) => i.check));
    expect(checks).toContain("age_tenure");
    expect(checks).toContain("jd_copy");
    expect(checks).toContain("number_conservation");
    expect(checks).toContain("keyword_coverage");
    expect(hasBlocker(issues)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ⑨ 篇幅估算
// ---------------------------------------------------------------------------

describe("checkPageEstimate / estimatePages", () => {
  it("行宽模型:40 个汉字一行,拉丁按半宽", () => {
    expect(estimatePages("一".repeat(40))).toBeCloseTo(1 / 45, 5);
    expect(estimatePages("一".repeat(80))).toBeCloseTo(2 / 45, 5);
    expect(estimatePages("a".repeat(80))).toBeCloseTo(1 / 45, 5); // 拉丁 0.5 宽
    expect(estimatePages("负责交易系统研发")).toBeLessThan(0.5);
  });

  it("超过两页 → warning;两页内 → 无 issue", () => {
    const long = Array.from({ length: 100 }, () => "一".repeat(30)).join("\n"); // 100 行 ≈ 2.2 页
    expect(estimatePages(long)).toBeGreaterThan(2);
    const issues = checkPageEstimate(long);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].evidence).toContain("2 页");
    expect(checkPageEstimate("负责交易系统研发")).toEqual([]);
  });

  it("边界:正好两页不报(5% 容差)", () => {
    const exactly2 = Array.from({ length: 90 }, () => "一".repeat(40)).join("\n"); // 90 行 = 2.0 页
    expect(checkPageEstimate(exactly2)).toEqual([]);
  });

  it("concise 模板上限一页:一页半即报,professional 同文本不报", () => {
    const oneAndHalf = Array.from({ length: 60 }, () => "一".repeat(40)).join("\n"); // 60 行 ≈ 1.33 页
    expect(checkPageEstimate(oneAndHalf, "professional")).toEqual([]);
    expect(checkPageEstimate(oneAndHalf, "concise")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ⑩ 日期格式一致性 / ⑪ 阿拉伯数字
// ---------------------------------------------------------------------------

describe("checkDateFormatConsistency / checkArabicNumerals", () => {
  it("日期格式统一 → 通过", () => {
    expect(checkDateFormatConsistency("2020.03-2022.05 A公司\n2022.06 B公司")).toEqual([]);
    expect(checkDateFormatConsistency("2020年3月 入职")).toEqual([]);
  });

  it("混用「.」与「/」→ warning,指明多数格式", () => {
    const issues = checkDateFormatConsistency("2020.03 入职\n2021.04 晋升\n2022/05 离职");
    expect(issues).toHaveLength(1);
    expect(issues[0].evidence).toContain("不统一");
    expect(issues[0].fixHint).toContain("统一");
  });

  it("年份区间(2019-2022)不算日期样式,不误报", () => {
    expect(checkDateFormatConsistency("2019-2022 A公司")).toEqual([]);
  });

  it("非法月份(2023.13)不参与统计", () => {
    expect(checkDateFormatConsistency("2023.13 完成项目")).toEqual([]);
  });

  it("中文数字统计 → warning;「第一」类序数不误报", () => {
    const issues = checkArabicNumerals("三年经验,带二十人团队,占比百分之三十,负责第一模块");
    const tokens = issues.map((i) => i.evidence);
    expect(tokens.some((t) => t.includes("三年"))).toBe(true);
    expect(tokens.some((t) => t.includes("二十人"))).toBe(true);
    expect(tokens.some((t) => t.includes("百分之三十"))).toBe(true);
    expect(tokens.every((t) => !t.includes("第一"))).toBe(true);
  });

  it("阿拉伯数字正常表述 → 通过", () => {
    expect(checkArabicNumerals("3 年经验,带 20 人团队,占比 30%")).toEqual([]);
  });
});
