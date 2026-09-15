import { describe, it, expect } from "vitest";
import { guardUrl } from "./ssrf";
import { extractFromHtml } from "./jdExtract";
import { buildAgentDraftMessages } from "./agent/prompts";

// ---------------------------------------------------------------------------
// SSRF 守卫
// ---------------------------------------------------------------------------

describe("guardUrl", () => {
  it.each([
    "https://careers.example.com/job/123",
    "http://example.com",
  ])("放行公网链接 %s", (url) => {
    expect(guardUrl(url).hostname.length).toBeGreaterThan(0);
  });

  it.each([
    "http://localhost:3000/api",
    "http://127.0.0.1/x",
    "http://10.1.2.3/x",
    "http://192.168.1.1/x",
    "http://172.16.0.1/x",
    "http://172.31.255.1/x",
    "http://169.254.169.254/meta", // 云厂商 metadata 端点
    "http://0.0.0.0/x",
    "http://[::1]/x",
    "http://myhost.local/x",
    "http://svc.internal/x",
  ])("拦截内网地址 %s", (url) => {
    expect(() => guardUrl(url)).toThrow("内网");
  });

  it("拦截非 http(s) 协议与带凭证的链接", () => {
    expect(() => guardUrl("ftp://example.com")).toThrow("http/https");
    expect(() => guardUrl("https://user:pass@example.com")).toThrow("凭证");
    expect(() => guardUrl("not a url")).toThrow("格式");
  });

  it("172.15 与 172.32 不在私网段,放行", () => {
    expect(guardUrl("https://172.15.0.1").hostname).toBe("172.15.0.1");
    expect(guardUrl("https://172.32.0.1").hostname).toBe("172.32.0.1");
  });
});

// ---------------------------------------------------------------------------
// JD 正文抽取
// ---------------------------------------------------------------------------

describe("extractFromHtml", () => {
  const page = `
    <html><head><title>高级后端工程师 - 示例公司</title>
    <style>.ad { display: none }</style></head>
    <body>
      <nav><a>首页</a><a>登录</a></nav>
      <script>window.tracking = "should-not-appear";</script>
      <article>
        <h1>高级后端工程师</h1>
        <p>岗位职责:负责交易系统的架构设计与演进,要求熟悉高并发、分布式事务,有金融行业经验者优先。薪资范围 40-60k,15 薪。</p>
      </article>
    </body></html>`;

  it("Readability 抽出标题与正文,不含脚本与样式", () => {
    const { title, text } = extractFromHtml(page, "https://careers.example.com/job/1");
    expect(title).toContain("高级后端工程师");
    expect(text).toContain("分布式事务");
    expect(text).not.toContain("should-not-appear");
    expect(text).not.toContain("display: none");
  });

  it("正文过短时走剥壳兜底", () => {
    const thin = `<html><head><title>T</title></head><body><div>职责:负责测试平台的搭建与维护,保障版本质量。</div></body></html>`;
    const { text } = extractFromHtml(thin, "https://x.example.com/1");
    expect(text).toContain("测试平台");
  });

  it("空页面不抛异常,返回空文本由调用方报错", () => {
    const { text } = extractFromHtml("<html><body></body></html>", "https://x.example.com/");
    expect(text).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 起草 prompt 注入(关键词库高频词 + 公司调研)
// ---------------------------------------------------------------------------

describe("buildAgentDraftMessages extras", () => {
  const base = ["2018-2020 A公司 参与交易系统开发", "招聘交易系统工程师", "professional", "classic"] as const;

  it("无 extras 时不出现注入块", () => {
    const msgs = buildAgentDraftMessages(...base);
    expect(msgs[0].content).not.toContain("跨岗位高频关键词");
    expect(msgs[0].content).not.toContain("目标公司调研");
  });

  it("注入高频词与公司调研块,并保留红线提醒", () => {
    const msgs = buildAgentDraftMessages(...base, undefined, {
      keywordHints: ["Kafka", "风控"],
      companyContext: "公司「示例科技」主营证券交易系统",
    });
    const sys = msgs[0].content;
    expect(sys).toContain("跨岗位高频关键词");
    expect(sys).toContain("Kafka、风控");
    expect(sys).toContain("无相关经历的词不硬凑");
    expect(sys).toContain("目标公司调研");
    expect(sys).toContain("不得据此虚构候选人经历");
  });
});
