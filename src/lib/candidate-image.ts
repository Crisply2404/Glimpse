import { getCache, setCache } from "@/lib/cache";
import type { Evidence } from "@/lib/types";

export type CandidateImage = {
  url: string;
  sourceUrl: string;
};

type CachedImage = CandidateImage | { none: true };

function clampUrl(url: string, maxLen = 1200) {
  const u = url.trim();
  if (!u) return "";
  return u.length <= maxLen ? u : u.slice(0, maxLen);
}

function safeParseUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

function faviconFromUrl(url: string): CandidateImage | null {
  const u = safeParseUrl(url);
  if (!u) return null;
  const host = u.hostname;
  if (!host) return null;
  return {
    url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`,
    sourceUrl: url,
  };
}

function steamHeaderFromUrl(url: string): CandidateImage | null {
  const u = safeParseUrl(url);
  if (!u) return null;
  if (!/store\.steampowered\.com$/i.test(u.hostname)) return null;
  const m = u.pathname.match(/\/app\/(\d+)(\/|$)/);
  const appId = m?.[1];
  if (!appId) return null;
  return {
    url: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
    sourceUrl: url,
  };
}

async function itunesArtworkFromAppStoreUrl(url: string): Promise<CandidateImage | null> {
  const u = safeParseUrl(url);
  if (!u) return null;
  if (!/apps\.apple\.com$/i.test(u.hostname)) return null;
  const m = u.pathname.match(/\/id(\d+)(\/|$)/);
  const appId = m?.[1];
  if (!appId) return null;

  const cacheKey = `itunes:${appId}`;
  const cached = getCache<CachedImage>(cacheKey);
  if (cached) return "none" in cached ? null : cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(appId)}`, {
      method: "GET",
      headers: { "user-agent": "glimpse-demo/0.1" },
      signal: controller.signal,
    });
    if (!res.ok) {
      setCache(cacheKey, { none: true }, 1000 * 60 * 60);
      return null;
    }
    const json = (await res.json().catch(() => ({}))) as any;
    const first = Array.isArray(json?.results) ? json.results[0] : null;
    const artwork = typeof first?.artworkUrl512 === "string" ? first.artworkUrl512 : typeof first?.artworkUrl100 === "string" ? first.artworkUrl100 : "";
    const artworkUrl = clampUrl(artwork);
    if (!artworkUrl) {
      setCache(cacheKey, { none: true }, 1000 * 60 * 60);
      return null;
    }
    const result: CandidateImage = { url: artworkUrl, sourceUrl: url };
    setCache(cacheKey, result, 1000 * 60 * 60 * 24);
    return result;
  } catch {
    setCache(cacheKey, { none: true }, 1000 * 60 * 10);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function findMetaImage(html: string) {
  const patterns = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    const v = clampUrl(m?.[1] ?? "");
    if (v) return v;
  }
  return "";
}

async function ogImageFromUrl(url: string): Promise<CandidateImage | null> {
  const cacheKey = `ogimg:${url}`;
  const cached = getCache<CachedImage>(cacheKey);
  if (cached) return "none" in cached ? null : cached;

  const u = safeParseUrl(url);
  if (!u) {
    setCache(cacheKey, { none: true }, 1000 * 60 * 60);
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": "glimpse-demo/0.1",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      setCache(cacheKey, { none: true }, 1000 * 60 * 60);
      return null;
    }

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().includes("text/html")) {
      setCache(cacheKey, { none: true }, 1000 * 60 * 60);
      return null;
    }

    // 只读前 200KB，够解析 meta 了，避免大页面拖死
    const reader = res.body?.getReader();
    if (!reader) {
      setCache(cacheKey, { none: true }, 1000 * 60 * 60);
      return null;
    }

    const decoder = new TextDecoder("utf-8");
    let html = "";
    let total = 0;
    const maxBytes = 200_000;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (total >= maxBytes) break;
        // 提前命中就停（更快）
        if (html.toLowerCase().includes("og:image") || html.toLowerCase().includes("twitter:image")) break;
      }
    }
    try {
      await reader.cancel();
    } catch {
      // ignore
    }

    const img = findMetaImage(html);
    if (!img) {
      setCache(cacheKey, { none: true }, 1000 * 60 * 60);
      return null;
    }

    let absolute = img;
    if (img.startsWith("//")) {
      absolute = `${u.protocol}${img}`;
    } else if (img.startsWith("/")) {
      absolute = new URL(img, u.origin).toString();
    } else if (!/^https?:\/\//i.test(img)) {
      // 其它相对路径
      absolute = new URL(img, url).toString();
    }

    const result: CandidateImage = { url: clampUrl(absolute), sourceUrl: url };
    if (!result.url) {
      setCache(cacheKey, { none: true }, 1000 * 60 * 60);
      return null;
    }

    setCache(cacheKey, result, 1000 * 60 * 60 * 24);
    return result;
  } catch {
    setCache(cacheKey, { none: true }, 1000 * 60 * 10);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function pickCandidateImageFromEvidence(evidence: Evidence[]): Promise<CandidateImage | null> {
  const urls = (evidence ?? [])
    .map((e) => (typeof e?.url === "string" ? e.url.trim() : ""))
    .filter(Boolean)
    .slice(0, 6);

  if (!urls.length) return null;

  // 1) 直接可推导（最快、最稳定）
  for (const url of urls) {
    const steam = steamHeaderFromUrl(url);
    if (steam) return steam;
  }

  // 2) iOS App Store（用 iTunes lookup 拿高清图）
  for (const url of urls) {
    const itunes = await itunesArtworkFromAppStoreUrl(url);
    if (itunes) return itunes;
  }

  // 3) 通用：抓 og:image / twitter:image
  for (const url of urls.slice(0, 3)) {
    const og = await ogImageFromUrl(url);
    if (og) return og;
  }

  // 4) 最后兜底：favicon（至少别再是随机风景图）
  return faviconFromUrl(urls[0]);
}
