/**
 * JD 正文抽取 —— Readability 为主,剥壳兜底为辅
 *
 * 抽取失败(如登录墙)时 text 会很短,由调用方决定报错提示。
 * 拆成独立函数以便单测(jsdom 在 node 环境可直接运行)。
 */
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export interface ExtractedJD {
  title: string;
  text: string;
}

const MAX_TEXT_LENGTH = 20_000; // JD 远用不到这么长,防极端页面

export function extractFromHtml(html: string, url: string): ExtractedJD {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  // Readability 会原地改写 DOM,喂给它一个克隆
  let title = "";
  let text = "";
  try {
    const article = new Readability(doc.cloneNode(true) as Document).parse();
    if (article) {
      title = (article.title || "").trim();
      text = (article.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
    }
  } catch {
    /* 走兜底 */
  }

  // 兜底:剥掉脚本/样式后直接取 body 文本
  if (text.length < 120) {
    doc.querySelectorAll("script, style, noscript, svg").forEach((el) => el.remove());
    title = title || doc.title || "";
    text = (doc.body?.textContent || "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  return { title, text: text.slice(0, MAX_TEXT_LENGTH) };
}
