import { clampText } from "@/lib/normalize";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: { message?: string };
};

export type OpenAIJsonParams = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  system: string;
  user: string;
  temperature?: number;
  timeoutMs?: number;
};

export async function openaiJson<T>(params: OpenAIJsonParams): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? 20000);

  try {
    const baseUrl = (params.baseUrl ?? "https://api.openai.com").replace(/\/+$/, "");
    const url = baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${params.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: params.model,
        temperature: params.temperature ?? 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
      }),
    });

    const json = (await res.json().catch(() => ({}))) as ChatCompletionResponse;
    if (!res.ok) {
      const msg = json?.error?.message ? clampText(json.error.message, 240) : `HTTP ${res.status}`;
      throw new Error(`OpenAI 调用失败：${msg}`);
    }

    const content = json.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("OpenAI 返回为空，无法解析 JSON。");

    try {
      return JSON.parse(content) as T;
    } catch {
      throw new Error(`OpenAI 返回的不是合法 JSON：${clampText(content, 260)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
