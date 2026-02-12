import { tavilySearch } from "@/lib/tavily";
import { braveSearch } from "@/lib/brave";

export type SearchProviderId = "tavily" | "brave";

export type SearchProviderSearchParams = {
  apiKey: string;
  query: string;
  maxResults: number;
  searchDepth?: "basic" | "advanced";
  timeoutMs?: number;
};

export type SearchProviderHit = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

export type SearchProvider = {
  id: SearchProviderId;
  search: (params: SearchProviderSearchParams) => Promise<SearchProviderHit[]>;
};

function parseProviderId(raw: string): SearchProviderId | "" {
  const v = raw.trim().toLowerCase();
  if (v === "tavily") return "tavily";
  if (v === "brave") return "brave";
  return "";
}

export function getSearchProvider(override?: SearchProviderId): SearchProvider {
  const envId = parseProviderId(process.env.SEARCH_PROVIDER ?? "");
  const id: SearchProviderId = override ?? (envId || "tavily");

  if (id === "brave") {
    return { id, search: braveSearch };
  }

  return { id: "tavily", search: tavilySearch };
}
