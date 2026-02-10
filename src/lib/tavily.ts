import { clampText } from "@/lib/normalize";

export type TavilySearchParams = {
  apiKey: string;
  query: string;
  maxResults: number;
  searchDepth?: "basic" | "advanced";
  timeoutMs?: number;
};

export type TavilyHit = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

type TavilyResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
  }>;
};

export async function tavilySearch(params: TavilySearchParams): Promise<TavilyHit[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? 25000);

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: params.apiKey,
        query: params.query,
        search_depth: params.searchDepth ?? "basic",
        max_results: params.maxResults,
        include_answer: false,
        include_images: false,
        include_raw_content: false,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const hint = text ? `（${clampText(text, 200)}）` : "";
      throw new Error(`Tavily 搜索失败：HTTP ${res.status}${hint}`);
    }

    const json = (await res.json()) as TavilyResponse;
    const hits = (json.results ?? [])
      .map((r) => ({
        title: (r.title ?? "").trim(),
        url: (r.url ?? "").trim(),
        content: (r.content ?? "").trim(),
        score: typeof r.score === "number" ? r.score : undefined,
      }))
      .filter((r) => r.title && r.url && r.content);

    return hits;
  } finally {
    clearTimeout(timeout);
  }
}
