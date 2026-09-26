import { NextRequest, NextResponse } from "next/server";
import { tidyExtractedText } from "@/lib/extractText";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 简历文件解析：把拖进来的 PDF / Word / 文本文件转成纯文本
 * - .pdf        → pdf-parse（pdfjs）
 * - .docx       → mammoth
 * - .txt/.md    → 直接读
 * 不支持：老 .doc、图片/扫描件（需 OCR，提示用户手动粘贴）
 */

const MAX_BYTES = 10 * 1024 * 1024;

function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export async function POST(request: NextRequest) {
  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "上传格式不对，请重新选择文件" }, { status: 400 });
  }

  if (!file) return NextResponse.json({ error: "没有收到文件" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `文件 ${(file.size / 1024 / 1024).toFixed(1)}MB 超过 10MB 上限，请压缩或直接粘贴文本` }, { status: 400 });
  }

  const ext = extOf(file.name);
  const buf = Buffer.from(await file.arrayBuffer());
  let text = "";
  let pages: number | undefined;

  try {
    if (ext === "pdf" || file.type === "application/pdf") {
      // 先引入 worker：把 @napi-rs/canvas 的 DOMMatrix 等 polyfill 到 globalThis，
      // 否则含图案/特殊字体的 PDF 解析时会抛 "DOMMatrix is not defined"
      const worker = (await import("pdf-parse/worker")) as unknown as {
        CanvasFactory: new () => unknown;
      };
      const pdfParse = (await import("pdf-parse")) as unknown as {
        PDFParse: new (o: { data: Uint8Array; CanvasFactory?: unknown }) => { getText(): Promise<{ text?: string; total?: number }>; destroy?: () => Promise<void> };
      };
      const parser = new pdfParse.PDFParse({ data: new Uint8Array(buf), CanvasFactory: worker.CanvasFactory });
      const r = await parser.getText();
      text = r.text || "";
      pages = r.total;
      await parser.destroy?.();
    } else if (ext === "docx" || file.type.includes("wordprocessingml")) {
      const mammoth = (await import("mammoth")) as unknown as {
        extractRawText(o: { buffer: Buffer }): Promise<{ value: string }>;
      };
      const r = await mammoth.extractRawText({ buffer: buf });
      text = r.value || "";
    } else if (["txt", "md", "markdown", "text"].includes(ext) || file.type.startsWith("text/")) {
      text = buf.toString("utf-8");
    } else if (ext === "doc") {
      return NextResponse.json({ error: "老版 .doc 格式读不了，请用 Word 另存为 .docx 或 PDF 再上传" }, { status: 400 });
    } else if (file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "heic"].includes(ext)) {
      return NextResponse.json({ error: "图片/扫描件需要 OCR，暂不支持——请直接把文字粘贴到输入框" }, { status: 400 });
    } else {
      return NextResponse.json({ error: `不支持的文件类型 .${ext || "?"}（支持 pdf / docx / txt / md）` }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    console.error("[extract-resume] 解析失败:", msg);
    return NextResponse.json({ error: `解析失败：${msg.slice(0, 120)}（可以先另存为 .txt 或直接粘贴文本）` }, { status: 400 });
  }

  const cleaned = tidyExtractedText(text);
  const isPlainText = ext === "txt" || ext === "md" || ext === "markdown" || file.type.startsWith("text/");
  if (cleaned.length < 150) {
    const shortHint = cleaned.length < 20
      ? (isPlainText ? "文件内容几乎是空的，确认选对文件了" : "几乎没提取到文字（可能是扫描件/图片型 PDF），请手动粘贴简历内容")
      : "提取到的文字较少，请核对是否完整，缺的部分手动补上";
    return NextResponse.json({
      text: cleaned,
      chars: cleaned.length,
      pages,
      source: file.name,
      warning: shortHint,
    });
  }

  return NextResponse.json({ text: cleaned, chars: cleaned.length, pages, source: file.name });
}
