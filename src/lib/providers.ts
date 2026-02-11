import type { TavilyHit, TavilySearchParams } from "@/lib/tavily";
import { tavilySearch } from "@/lib/tavily";

export type SearchProviderId = "tavily";

export type SearchProvider = {
  id: SearchProviderId;
  search: (params: TavilySearchParams) => Promise<TavilyHit[]>;
};

export function getSearchProvider(): SearchProvider {
  const raw = (process.env.SEARCH_PROVIDER ?? "").trim().toLowerCase();
  const id: SearchProviderId = raw === "tavily" || raw === "" ? "tavily" : "tavily";

  if (id === "tavily") {
    return { id, search: tavilySearch };
  }

  return { id: "tavily", search: tavilySearch };
}

