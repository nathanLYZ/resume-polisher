/**
 * DeepSeek API 封装
 * 文档: https://platform.deepseek.com/
 */

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface DeepSeekOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * 调用 DeepSeek Chat Completions API
 */
export async function callDeepSeek(
  messages: ChatMessage[],
  options: DeepSeekOptions = {}
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("缺少 DEEPSEEK_API_KEY，请在 .env.local 中配置");
  }

  const {
    model = "deepseek-chat",
    temperature = 0.7,
    maxTokens = 4096,
  } = options;

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `DeepSeek API 错误 (${response.status}): ${errorText.slice(0, 500)}`
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("DeepSeek API 返回内容为空");
  }

  return content as string;
}
