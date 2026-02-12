import { clampText } from "@/lib/normalize";

export type BraveSearchParams = {
  apiKey: string;
  query: string;
  maxResults: number;
  timeoutMs?: number;
};

export type BraveHit = {
  title: string;
  url: string;
  content: string;
};

type BraveWebSearchResponse = {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
    }>;
  };
};

export async function braveSearch(params: BraveSearchParams): Promise<BraveHit[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? 25000);

  try {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", params.query);
    url.searchParams.set("count", String(Math.max(1, Math.min(20, params.maxResults))));

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-subscription-token": params.apiKey,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const hint = text ? `（${clampText(text, 200)}）` : "";
      throw new Error(`Brave 搜索失败：HTTP ${res.status}${hint}`);
    }

    const json = (await res.json()) as BraveWebSearchResponse;
    const hits = (json.web?.results ?? [])
      .map((r) => ({
        title: (r.title ?? "").trim(),
        url: (r.url ?? "").trim(),
        content: (r.description ?? "").trim(),
      }))
      .filter((r) => r.title && r.url && r.content);

    return hits;
  } finally {
    clearTimeout(timeout);
  }
}

