/** @mozilla/readability 无官方类型,手写最小声明 */
declare module "@mozilla/readability" {
  export interface ReadabilityArticle {
    title: string;
    textContent: string;
    content: string;
    length: number;
    excerpt: string;
    byline: string | null;
    siteName: string | null;
  }

  export class Readability {
    constructor(doc: Document, options?: Record<string, unknown>);
    parse(): ReadabilityArticle | null;
  }
}
