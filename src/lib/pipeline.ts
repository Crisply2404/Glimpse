import type { Candidate, Clue, PipelineEvent, RecallRequest, RecallResponse, SearchHit } from "@/lib/types";
import { getCache, setCache } from "@/lib/cache";
import { makeRunId, stableIdFromString } from "@/lib/id";
import { clampText, cleanupCandidateName, normalizeCandidateKey } from "@/lib/normalize";
import { openaiJson } from "@/lib/openai";
import { flattenHitText, flattenEvidenceText, heuristicScoreCandidate } from "@/lib/score";
import { getSearchProvider } from "@/lib/providers";
import { pickCandidateImageFromEvidence } from "@/lib/candidate-image";

function nowIso() {
  return new Date().toISOString();
}

type RawCandidate = {
  name: string;
  altNames?: string[];
  evidence: Array<{ url: string; title?: string; snippet: string }>;
};

function makeEvent(phase: PipelineEvent["phase"], message: string, payload?: unknown): PipelineEvent {
  return {
    id: stableIdFromString("evt", `${phase}:${message}:${Date.now()}:${Math.random()}`),
    phase,
    message,
    timestamp: nowIso(),
    payload,
  };
}

export type RecallHooks = {
  onEvent?: (event: PipelineEvent) => void | Promise<void>;
  onCandidates?: (candidates: Candidate[]) => void | Promise<void>;
  onWarning?: (warning: string) => void | Promise<void>;
};

function safeEnv(name: string) {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

function defaultOptions(input: RecallRequest["options"]) {
  return {
    topK: input?.topK ?? 5,
    stages: input?.stages ?? 3,
    maxSearchResultsPerQuery: input?.maxSearchResultsPerQuery ?? 8,
    maxQueries: input?.maxQueries ?? 5,
    maxCandidates: input?.maxCandidates ?? 25,
    enrichEvidence: input?.enrichEvidence ?? false,
  };
}

function clueTextForPrompt(clues: Clue[]) {
  if (!clues.length) return "（无额外线索）";
  return clues
    .map((c, idx) => `${idx + 1}. ${c.polarity === "negative" ? "不是/排除" : "是/符合"}（力度${c.weight}）：${c.text}`)
    .join("\n");
}

function compactHitPayload(hits: SearchHit[]) {
  return hits.slice(0, 10).map((h) => ({
    title: clampText(h.title, 80),
    url: h.url,
    snippet: clampText(h.snippet, 140),
    sourceQuery: h.sourceQuery,
  }));
}

async function generateQueriesWithOpenAI(args: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  query: string;
  clues: Clue[];
  maxQueries: number;
}) {
  const json = await openaiJson<{ queries?: string[] }>({
    apiKey: args.apiKey,
    model: args.model,
    baseUrl: args.baseUrl,
    system:
      "你是搜索专家。你只输出严格的 JSON（不要多余文字）。目标：为“找回一款记忆中的游戏”生成多条适合搜索引擎的查询词。",
    user: [
      "请输出 JSON：{ \"queries\": string[] }",
      "",
      "规则：",
      `- 生成 ${args.maxQueries} 条查询词（数组长度必须等于该数量）`,
      "- 每条尽量短（像关键词，不要整段句子）",
      "- 中英混合可以，但至少要有 2 条是英文关键词为主（更容易搜到游戏名）",
      "- 每条查询必须包含以下任一“游戏信号词”：game / video game / Steam / iOS / Android / App Store / Google Play",
      "- 优先把“玩法机制”转成关键词（比如：tilt / gravity / accelerometer / liquid / physics / puzzle 等）",
      "- 不要编造不存在的网页或证据；也不要硬猜游戏名当成结论（可以通过关键词让搜索自己命中）",
      "",
      `用户描述：${args.query}`,
      "",
      `线索：\n${clueTextForPrompt(args.clues)}`,
    ].join("\n"),
    temperature: 0.2,
    timeoutMs: 45000,
  });

  const queries = (json.queries ?? [])
    .map((q) => q?.trim())
    .filter((q): q is string => Boolean(q));
  if (queries.length !== args.maxQueries) {
    throw new Error("OpenAI 生成搜索词失败：返回的 queries 数量不符合要求。");
  }
  return queries;
}

function uniqStrings(list: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const t = s.trim().replace(/\s+/g, " ");
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function heuristicKeywordsFromQuery(query: string) {
  const q = query.toLowerCase();
  const has = (re: RegExp) => re.test(query) || re.test(q);
  const words: string[] = [];

  if (has(/重力|gravity/)) words.push("gravity");
  if (has(/倾斜|tilt/)) words.push("tilt");
  if (has(/加速度|accelerometer/)) words.push("accelerometer");
  if (has(/液体|水|fluid|liquid/)) {
    words.push("liquid");
    words.push("puddle");
  }
  if (has(/物理|physics/)) words.push("physics");
  if (has(/解谜|益智|puzzle/)) words.push("puzzle");
  if (has(/手机|移动|ios|iphone|ipad|android|app store|google play/)) words.push("mobile");

  return uniqStrings(words);
}

function fallbackQueries(args: { query: string; clues: Clue[]; maxQueries: number }) {
  const base = args.query.trim();
  const clueWords = args.clues
    .filter((c) => c.polarity === "positive")
    .slice(0, 4)
    .map((c) => c.text.trim())
    .filter(Boolean);

  const boost = heuristicKeywordsFromQuery(base);
  const boostText = boost.length ? boost.join(" ") : "";
  const clueText = clueWords.length ? clueWords.join(" ") : "";

  const list = uniqStrings(
    [
      `${base} game`,
      `${base} mobile game`,
      `${base} iOS game`,
      `${base} Android game`,
      boostText ? `${boostText} game` : "",
      boostText ? `${boostText} mobile game` : "",
      boostText ? `${boostText} iOS App Store game` : "",
      clueText ? `${clueText} game` : "",
      clueText ? `${boostText} ${clueText} game` : "",
      `${base} video game`,
      `${base} Steam game`,
    ].filter(Boolean),
  );

  // 不够就用更泛的组合补齐
  const fallbackPool = uniqStrings([
    "tilt gravity liquid physics puzzle game",
    "gravity tilt liquid mobile game",
    "tilt liquid puzzle iOS App Store game",
    "liquid physics puzzle Android Google Play game",
  ]);

  const out: string[] = [];
  for (const q of list) {
    out.push(q);
    if (out.length >= args.maxQueries) return out;
  }
  for (const q of fallbackPool) {
    out.push(q);
    if (out.length >= args.maxQueries) return out;
  }

  return out.slice(0, args.maxQueries);
}

async function extractCandidatesWithOpenAI(args: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  query: string;
  clues: Clue[];
  hits: SearchHit[];
  maxCandidates: number;
}): Promise<RawCandidate[]> {
  const json = await openaiJson<{
    candidates?: Array<{
      name?: string;
      altNames?: string[];
      evidence?: Array<{ url?: string; snippet?: string; title?: string }>;
    }>;
  }>({
    apiKey: args.apiKey,
    model: args.model,
    baseUrl: args.baseUrl,
    system:
      "你是信息提炼助手。你只输出严格的 JSON（不要多余文字）。你的任务是从搜索摘要里提炼“可能的游戏候选”，并且每个候选必须给出证据链接。",
    user: [
      `请输出 JSON：{ "candidates": { "name": string, "altNames"?: string[], "evidence": { "url": string, "title"?: string, "snippet": string }[] }[] }`,
      "",
      "硬性规则：",
      `- 最多输出 ${args.maxCandidates} 个候选`,
      "- 不要编造不存在的网页链接：evidence.url 必须来自下面提供的 hits.url",
      "- 每个候选至少 1 条证据，最多 3 条证据",
      "- 候选名尽量用游戏的常用英文名；如果只有中文名也可以",
      "- ⚠️ 候选必须是“具体游戏本体的名字”，不要输出视频标题/榜单标题/攻略标题（例如：Top 10 / Games like / Gameplay / 盘点/推荐/攻略/合集）",
      "- 如果某条命中明显来自视频站（YouTube/B站等），不要把它的标题当候选名",
      "- 如果某条摘要明显是攻略/梗图/无关内容，请不要提为候选",
      "",
      `用户描述：${args.query}`,
      "",
      `线索：\n${clueTextForPrompt(args.clues)}`,
      "",
      "搜索命中（hits）：",
      JSON.stringify(
        args.hits.slice(0, 40).map((h) => ({ title: h.title, url: h.url, snippet: clampText(h.snippet, 220) })),
        null,
        2,
      ),
    ].join("\n"),
    temperature: 0.2,
    timeoutMs: 45000,
  });

  const allowedUrls = new Set(args.hits.map((h) => h.url));
  const candidates = (json.candidates ?? [])
    .map((c) => ({
      name: typeof c.name === "string" ? c.name.trim() : "",
      altNames: Array.isArray(c.altNames) ? c.altNames.filter((a): a is string => typeof a === "string").map((a) => a.trim()) : [],
      evidence: Array.isArray(c.evidence)
        ? c.evidence
            .map((e) => ({
              url: typeof e.url === "string" ? e.url.trim() : "",
              title: typeof e.title === "string" ? e.title.trim() : undefined,
              snippet: typeof e.snippet === "string" ? e.snippet.trim() : "",
            }))
            .filter((e) => e.url && e.snippet && allowedUrls.has(e.url))
        : [],
    }))
    .filter((c) => c.name && c.evidence.length);

  return candidates.slice(0, args.maxCandidates);
}

function fallbackExtractCandidates(args: { hits: SearchHit[]; maxCandidates: number }): RawCandidate[] {
  const results: RawCandidate[] = [];
  const seen = new Set<string>();

  for (const h of args.hits) {
    if (shouldSkipHitForCandidate(h)) continue;
    const raw = h.title.split("|")[0]?.split("–")[0]?.split("-")[0] ?? "";
    const name = cleanupCandidateName(raw);
    if (isLikelyNonGameCandidateName(name)) continue;
    const key = normalizeCandidateKey(name);
    if (!name || key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    results.push({
      name,
      altNames: [],
      evidence: [{ url: h.url, title: h.title, snippet: clampText(h.snippet, 240) }],
    });
    if (results.length >= args.maxCandidates) break;
  }

  return results;
}

async function scoreWithOpenAI(args: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  query: string;
  clues: Clue[];
  candidates: Candidate[];
}) {
  const json = await openaiJson<{
    scored?: Array<{
      name?: string;
      score?: number;
      scoreBreakdown?: Array<{
        clue?: string;
        delta?: number;
        reason?: string;
        evidenceUrl?: string;
        evidenceQuote?: string;
      }>;
    }>;
  }>({
    apiKey: args.apiKey,
    model: args.model,
    baseUrl: args.baseUrl,
    system:
      "你是一个“找回记忆中的游戏”的评分助手。你只输出严格的 JSON（不要多余文字）。你必须基于证据链接与摘要做判断，不要拍脑袋。",
    user: [
      `请输出 JSON：{ "scored": { "name": string, "score": number, "scoreBreakdown": { "clue": string, "delta": number, "reason": string, "evidenceUrl"?: string, "evidenceQuote"?: string }[] }[] }`,
      "",
      "规则：",
      "- score 是 0~100 的整数，越高越可能",
      "- scoreBreakdown 最多 5 条，用大白话解释“为什么加分/减分/先不下结论”",
      "- ⚠️ 证据约束（很重要）：只要 delta ≠ 0，就必须同时给出 evidenceUrl + evidenceQuote",
      "- evidenceUrl 必须是该候选 evidence 里的 url（禁止编造链接）",
      "- evidenceQuote 必须是该候选 evidence.snippet 里的原文片段（直接复制一小段，20~90字）",
      "- reason 里提到的关键事实（比如平台/年份/玩法/是否支持某功能等），必须能在 evidenceQuote 里找到对应文字；找不到就别写",
      "- 如果找不到能直接支持某结论的原文：delta 必须是 0，并在 reason 里写“证据不足，先不下结论”",
      "- 禁止根据“来源网站”做跳步推断：例如看到 Steam 页面，只能说明“在 Steam 上能看到它”，不能推断“只在 PC/没有手机版”",
      "- 如果证据偏攻略/梗图/无关，请降低分数并说明原因（也要给 quote）",
      "",
      `用户描述：${args.query}`,
      "",
      `线索：\n${clueTextForPrompt(args.clues)}`,
      "",
      "候选与证据：",
      JSON.stringify(
        args.candidates.map((c) => ({
          name: c.name,
          evidence: c.evidence.slice(0, 4).map((e) => ({ url: e.url, title: e.title, snippet: clampText(e.snippet, 240) })),
        })),
        null,
        2,
      ),
    ].join("\n"),
    temperature: 0.15,
    timeoutMs: 60000,
  });

  const scored = (json.scored ?? [])
    .map((s) => ({
      name: typeof s.name === "string" ? s.name.trim() : "",
      score: typeof s.score === "number" ? Math.round(s.score) : NaN,
      scoreBreakdown: Array.isArray(s.scoreBreakdown)
        ? s.scoreBreakdown
            .map((b) => ({
              clue: typeof b.clue === "string" ? b.clue.trim() : "",
              delta: typeof b.delta === "number" ? Math.round(b.delta) : 0,
              reason: typeof b.reason === "string" ? b.reason.trim() : "",
              evidenceUrl: typeof b.evidenceUrl === "string" ? b.evidenceUrl.trim() : undefined,
              evidenceQuote: typeof b.evidenceQuote === "string" ? b.evidenceQuote.trim() : undefined,
            }))
            .filter((b) => b.clue && b.reason)
            .slice(0, 5)
        : [],
    }))
    .filter((s) => s.name && Number.isFinite(s.score));

  return scored;
}

function mergeHits(hits: Array<{ q: string; rank: number; title: string; url: string; snippet: string; score?: number }>): SearchHit[] {
  const map = new Map<string, SearchHit>();
  for (const h of hits) {
    if (!h.url) continue;
    const existing = map.get(h.url);
    if (!existing) {
      map.set(h.url, {
        title: h.title,
        url: h.url,
        snippet: h.snippet,
        score: h.score,
        sourceQuery: h.q,
        rank: h.rank,
      });
      continue;
    }
    // 保留分数更高的那条（如果有）
    const nextScore = typeof h.score === "number" ? h.score : -Infinity;
    const prevScore = typeof existing.score === "number" ? existing.score : -Infinity;
    if (nextScore > prevScore) {
      existing.title = h.title;
      existing.snippet = h.snippet;
      existing.score = h.score;
      existing.sourceQuery = h.q;
      existing.rank = h.rank;
    }
  }

  const list = Array.from(map.values());
  list.sort((a, b) => {
    const as = typeof a.score === "number" ? a.score : -Infinity;
    const bs = typeof b.score === "number" ? b.score : -Infinity;
    if (bs !== as) return bs - as;
    return a.rank - b.rank;
  });
  return list;
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

function steamAppIdFromUrl(url: string) {
  const u = safeParseUrl(url);
  if (!u) return "";
  if (!/store\.steampowered\.com$/i.test(u.hostname)) return "";
  const m = u.pathname.match(/\/app\/(\d+)(\/|$)/);
  return m?.[1] ?? "";
}

function appStoreIdFromUrl(url: string) {
  const u = safeParseUrl(url);
  if (!u) return "";
  if (!/apps\.apple\.com$/i.test(u.hostname)) return "";
  const m = u.pathname.match(/\/id(\d+)(\/|$)/);
  return m?.[1] ?? "";
}

function googlePlayPackageFromUrl(url: string) {
  const u = safeParseUrl(url);
  if (!u) return "";
  if (!/play\.google\.com$/i.test(u.hostname)) return "";
  if (!u.pathname.toLowerCase().startsWith("/store/apps/details")) return "";
  const id = u.searchParams.get("id") ?? "";
  return id.trim();
}

function isVideoHostname(hostname: string) {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  const patterns: RegExp[] = [
    /(^|\.)youtube\.com$/i,
    /(^|\.)youtu\.be$/i,
    /(^|\.)youtube-nocookie\.com$/i,
    /(^|\.)ytimg\.com$/i,
    /(^|\.)bilibili\.com$/i,
    /(^|\.)bilibili\.tv$/i,
    /(^|\.)b23\.tv$/i,
    /(^|\.)tiktok\.com$/i,
    /(^|\.)douyin\.com$/i,
    /(^|\.)twitch\.tv$/i,
    /(^|\.)vimeo\.com$/i,
    /(^|\.)dailymotion\.com$/i,
    /(^|\.)dai\.ly$/i,
    /(^|\.)kuaishou\.com$/i,
    /(^|\.)ixigua\.com$/i,
    /(^|\.)youku\.com$/i,
    /(^|\.)acfun\.cn$/i,
    /(^|\.)nicovideo\.jp$/i,
    /(^|\.)niconico\.jp$/i,
  ];
  return patterns.some((re) => re.test(host));
}

function isVideoUrl(url: string) {
  const u = safeParseUrl(url);
  if (!u) return false;
  return isVideoHostname(u.hostname);
}

function looksLikeListOrVideoTitle(text: string) {
  const t = text.trim();
  if (!t) return false;
  const lower = t.toLowerCase();

  // 英文榜单/集合
  if (/\bgames\s+like\b/i.test(lower)) return true;
  if (/^(top|best)\s*\d+\b/i.test(lower) && /\bgame/.test(lower)) return true;
  if (/^\d{1,3}\s*(\+)?\s*(best|top|insane|fun|great|awesome)?\s*games?\b/i.test(lower)) return true;

  // 英文视频/内容类型（我们要的是“游戏名”，不是内容标题）
  if (/\bgameplay\b/i.test(lower)) return true;
  if (/\blet'?s\s+play\b|\bplaythrough\b|\btrailer\b|\bteaser\b|\bpreview\b|\bsoundtrack\b|\bost\b/i.test(lower)) return true;
  if (/\bwalkthrough\b|\bguide\b|\btips\b|\bcheats?\b|\breview\b/i.test(lower)) return true;
  if (/\bfull\s+game\b|\blongplay\b|\bspeedrun\b|\bno\s+commentary\b/i.test(lower)) return true;

  // 中文榜单/攻略/内容
  if (/\d+\s*款.*(游戏|手游)/.test(t)) return true;
  if (/盘点|推荐|排行|排行榜|合集|攻略|解说|实况|通关|评测|测评|开箱/.test(t)) return true;
  if (/预告|预告片|宣传片|\bPV\b|全流程|速通|原声|主题曲|OST|音乐|配乐|试玩/.test(t)) return true;
  if (/类似.*游戏|游戏.*类似|像.*游戏/.test(t) && /游戏/.test(t)) return true;

  return false;
}

function hitLooksLikeGamePageUrl(url: string) {
  if (steamAppIdFromUrl(url)) return true;
  if (appStoreIdFromUrl(url)) return true;
  if (googlePlayPackageFromUrl(url)) return true;

  const u = safeParseUrl(url);
  if (!u) return false;
  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();

  if (/wikipedia\.org$/i.test(host) && path.startsWith("/wiki/")) return true;
  if (/itch\.io$/i.test(host) && path.length > 1) return true;
  if (/gog\.com$/i.test(host) && path.includes("/game/")) return true;
  if (/store\.epicgames\.com$/i.test(host) && path.startsWith("/")) return true;
  if (/nintendo\.com$/i.test(host) && path.includes("/store/")) return true;
  if (/playstation\.com$/i.test(host) && path.includes("/games/")) return true;
  if (/xbox\.com$/i.test(host) && path.includes("/games/")) return true;

  return false;
}

function shouldSkipHitForCandidate(hit: SearchHit) {
  if (!hit?.url) return true;
  if (isVideoUrl(hit.url)) return true;

  // 像“Steam/App Store/Google Play/Wikipedia”这种明确游戏页，不做标题规则过滤
  if (hitLooksLikeGamePageUrl(hit.url)) return false;

  // 其它网页：用标题/摘要判断“是不是更像内容页（视频/榜单/攻略）”
  if (looksLikeListOrVideoTitle(hit.title)) return true;
  if (looksLikeListOrVideoTitle(hit.snippet)) return true;

  return false;
}

function shouldSkipEvidenceForCandidate(evidence: { url: string; title?: string; snippet: string }) {
  if (!evidence?.url) return true;
  if (isVideoUrl(evidence.url)) return true;

  // 像“Steam/App Store/Google Play/Wikipedia”这种明确游戏页：允许作为证据
  if (hitLooksLikeGamePageUrl(evidence.url)) return false;

  // 其它网页：如果更像内容页（视频/榜单/攻略），就别拿来当候选证据（避免 Top 里混进“视频感”）
  if (looksLikeListOrVideoTitle(evidence.title ?? "")) return true;
  if (looksLikeListOrVideoTitle(evidence.snippet ?? "")) return true;

  return false;
}

function isLikelyNonGameCandidateName(name: string) {
  // 候选名本身如果像“榜单/视频标题”，直接排除（防止误提名）
  return looksLikeListOrVideoTitle(name);
}

function candidateKeyFromNameAndEvidence(name: string, evidence: Candidate["evidence"]) {
  const steamId = (evidence ?? []).map((e) => steamAppIdFromUrl(e.url)).find(Boolean);
  if (steamId) return `steam:${steamId}`;

  const iosId = (evidence ?? []).map((e) => appStoreIdFromUrl(e.url)).find(Boolean);
  if (iosId) return `ios:${iosId}`;

  const gp = (evidence ?? []).map((e) => googlePlayPackageFromUrl(e.url)).find(Boolean);
  if (gp) return `gp:${gp.toLowerCase()}`;

  return normalizeCandidateKey(name);
}

function betterDisplayName(a: string, b: string) {
  const aa = a.trim();
  const bb = b.trim();
  if (!aa) return bb;
  if (!bb) return aa;

  const scoreName = (s: string) => {
    const t = s.trim();
    const hasPlus = t.includes("+") ? 2 : 0;
    const hasColon = t.includes(":") ? 1 : 0;
    const len = Math.min(40, t.length) / 40;
    return hasPlus + hasColon + len;
  };

  return scoreName(bb) > scoreName(aa) ? bb : aa;
}

function dedupeCandidates(raw: Array<{ name: string; altNames?: string[]; evidence: Candidate["evidence"] }>, max: number) {
  const map = new Map<string, Candidate>();

  for (const r of raw) {
    const name = cleanupCandidateName(r.name);
    const evidence = (r.evidence ?? [])
      .map((e) => ({
        url: e.url,
        title: e.title ? clampText(e.title, 120) : undefined,
        snippet: clampText(e.snippet, 320),
      }))
      .filter((e) => e.url && e.snippet && !shouldSkipEvidenceForCandidate(e));
    if (!evidence.length) continue;

    const key = candidateKeyFromNameAndEvidence(name, evidence);
    if (!key) continue;
    const id = stableIdFromString("cand", key);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        id,
        name,
        altNames: (r.altNames ?? []).filter(Boolean),
        score: 0,
        scoreBreakdown: [],
        evidence,
      });
      continue;
    }

    existing.name = betterDisplayName(existing.name, name);
    existing.evidence = [...existing.evidence, ...evidence]
      .filter((e, idx, arr) => arr.findIndex((x) => x.url === e.url) === idx)
      .slice(0, 6);
    existing.altNames = [...new Set([...(existing.altNames ?? []), ...(r.altNames ?? [])])].slice(0, 6);
  }

  return Array.from(map.values()).slice(0, max);
}

function sortCandidates(candidates: Candidate[]) {
  return [...candidates].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function normalizeForQuoteCheck(text: string) {
  return text
    .trim()
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function quoteMatchesEvidenceSnippet(snippet: string, quote: string) {
  const s = normalizeForQuoteCheck(snippet);
  const q = normalizeForQuoteCheck(quote);
  if (!s || !q) return false;
  if (q.length < 8) return false;
  return s.includes(q);
}

function sanitizeScoreBreakdown(candidate: Candidate, items: Array<{ clue: string; delta: number; reason: string; evidenceUrl?: string; evidenceQuote?: string }>) {
  const evidenceByUrl = new Map((candidate.evidence ?? []).map((e) => [e.url, e]));

  return (items ?? [])
    .map((b) => {
      const clue = clampText(b.clue ?? "", 80);
      const reasonRaw = (b.reason ?? "").trim();
      const evidenceUrl = b.evidenceUrl?.trim() || undefined;
      const evidenceQuote = b.evidenceQuote?.trim() || undefined;

      let delta = Math.max(-30, Math.min(30, Math.round(b.delta ?? 0)));
      let reason = clampText(reasonRaw, 240);

      if (delta !== 0) {
        const ev = evidenceUrl ? evidenceByUrl.get(evidenceUrl) : undefined;
        const ok = Boolean(ev && evidenceQuote && quoteMatchesEvidenceSnippet(ev.snippet, evidenceQuote));
        if (!ok) {
          delta = 0;
          reason = clampText(`${reason || "证据不足"}（证据不足，先不下结论）`, 240);
          return { clue, delta, reason };
        }
      }

      if (evidenceUrl && evidenceQuote) {
        const ev = evidenceByUrl.get(evidenceUrl);
        if (!ev || !quoteMatchesEvidenceSnippet(ev.snippet, evidenceQuote)) {
          return { clue, delta, reason };
        }
      }

      return {
        clue,
        delta,
        reason,
        evidenceUrl,
        evidenceQuote: evidenceQuote ? clampText(evidenceQuote, 120) : undefined,
      };
    })
    .filter((b) => b.clue && b.reason)
    .slice(0, 5);
}

function includesAny(text: string, patterns: RegExp[]) {
  return patterns.some((re) => re.test(text));
}

function wantsMobileEvidence(query: string, clues: Clue[]) {
  const hay = [query, ...clues.map((c) => c.text)].join("\n");
  return includesAny(hay, [
    /手机|移动端|手游|掌机/i,
    /\bios\b|\biphone\b|\bipad\b|\bapp store\b/i,
    /\bandroid\b|\bgoogle play\b/i,
  ]);
}

function candidateHasHost(candidate: Candidate, host: RegExp) {
  return (candidate.evidence ?? []).some((e) => {
    const u = safeParseUrl(e.url);
    return u ? host.test(u.hostname) : false;
  });
}

function prependEvidence(candidate: Candidate, hits: Array<{ url: string; title: string; snippet: string }>) {
  const incoming = hits
    .map((h) => ({
      url: h.url,
      title: h.title ? clampText(h.title, 120) : undefined,
      snippet: clampText(h.snippet, 320),
    }))
    .filter((e) => e.url && e.snippet);

  const merged = [...incoming, ...(candidate.evidence ?? [])].filter((e, idx, arr) => arr.findIndex((x) => x.url === e.url) === idx);
  candidate.evidence = merged.slice(0, 8);
}

function faviconUrlFromEvidenceUrl(url: string) {
  try {
    const u = new URL(url);
    if (!u.hostname) return "";
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=128`;
  } catch {
    return "";
  }
}

async function enrichTopImages(candidates: Candidate[], limit: number) {
  const targets = sortCandidates(candidates).slice(0, Math.max(0, limit));
  const concurrency = 3;
  let index = 0;

  async function worker() {
    while (index < targets.length) {
      const current = targets[index];
      index += 1;
      try {
        const picked = await pickCandidateImageFromEvidence(current.evidence);
        if (picked) {
          current.imageUrl = picked.url;
          current.imageSourceUrl = picked.sourceUrl;
        }
      } catch {
        // ignore
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
}

export async function runRecall(input: RecallRequest, hooks?: RecallHooks): Promise<RecallResponse> {
  const opts = defaultOptions(input.options);

  const tavilyKey = safeEnv("TAVILY_API_KEY");
  if (!tavilyKey) {
    throw new Error("缺少 Tavily API key：请在 .env.local 里配置 TAVILY_API_KEY。");
  }

  const searchProvider = getSearchProvider();

  const openaiKey = safeEnv("OPENAI_API_KEY");
  const openaiModel = safeEnv("OPENAI_MODEL") || "gpt-4o-mini";
  const openaiBaseUrl = safeEnv("OPENAI_BASE_URL") || undefined;

  const warnings: string[] = [];
  const useOpenAI = Boolean(openaiKey);
  if (!useOpenAI) {
    const msg = "未配置 OPENAI_API_KEY：本次会用简单规则提炼/打分，结果可能不准（但仍会给证据链接）。";
    warnings.push(msg);
    await hooks?.onWarning?.(msg);
  }

  const cacheKey = stableIdFromString(
    "recall",
    JSON.stringify({ query: input.query.trim(), clues: input.clues, options: opts, useOpenAI, searchProvider: searchProvider.id }),
  );
  const cached = getCache<RecallResponse>(cacheKey);
  if (cached) {
    const msg = "命中缓存：相同输入短时间重复请求不会重复扣费。";
    const result = { ...cached, warnings: [...(cached.warnings ?? []), msg] };
    await hooks?.onWarning?.(msg);
    for (const evt of result.events ?? []) {
      await hooks?.onEvent?.(evt);
    }
    await hooks?.onCandidates?.(result.candidates ?? []);
    return result;
  }

  const runId = makeRunId();
  const events: PipelineEvent[] = [];

  const emitEvent = async (evt: PipelineEvent) => {
    events.push(evt);
    await hooks?.onEvent?.(evt);
  };

  const emitCandidates = async (list: Candidate[]) => {
    await hooks?.onCandidates?.(list);
  };

  // 1) 生成搜索词
  let queries: string[];
  if (useOpenAI) {
    await emitEvent(makeEvent("search", "开始：准备生成搜索词。"));
    try {
      queries = await generateQueriesWithOpenAI({
        apiKey: openaiKey,
        model: openaiModel,
        baseUrl: openaiBaseUrl,
        query: input.query,
        clues: input.clues,
        maxQueries: opts.maxQueries,
      });
    } catch (e) {
      const msg = "搜索词生成失败：已回退到简单拼接（可能漏掉一些方向）。";
      warnings.push(msg);
      await hooks?.onWarning?.(msg);
      queries = fallbackQueries({ query: input.query, clues: input.clues, maxQueries: opts.maxQueries });
    }
  } else {
    queries = fallbackQueries({ query: input.query, clues: input.clues, maxQueries: opts.maxQueries });
  }

  // 小保险：把“机制关键词”查询混进去（避免只搜到很泛的结果）
  queries = uniqStrings([...queries, ...fallbackQueries({ query: input.query, clues: input.clues, maxQueries: opts.maxQueries })]).slice(
    0,
    opts.maxQueries,
  );

  await emitEvent(makeEvent("search", `搜索词已就绪：${queries.length} 条。`, { queries }));

  // 2) Tavily 搜索（多轮）
  const rawHits: Array<{ q: string; rank: number; title: string; url: string; snippet: string; score?: number }> = [];
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    await emitEvent(makeEvent("search", `搜索（${i + 1}/${queries.length}）：${clampText(q, 120)}`));
    const hits = await searchProvider.search({
      apiKey: tavilyKey,
      query: q,
      maxResults: opts.maxSearchResultsPerQuery,
      searchDepth: "advanced",
    });
    hits.forEach((h, idx) => {
      rawHits.push({
        q,
        rank: idx + 1,
        title: h.title,
        url: h.url,
        snippet: h.content,
        score: h.score,
      });
    });
  }

  let mergedHits = mergeHits(rawHits).slice(0, 60);
  await emitEvent(
    makeEvent(
      "search",
      `完成搜索：${queries.length} 轮查询，合并后 ${mergedHits.length} 条网页命中。`,
      { queries, hits: compactHitPayload(mergedHits) },
    ),
  );

  if (!mergedHits.length) {
    const result: RecallResponse = {
      runId,
      events,
      candidates: [],
      warnings: [...warnings, "没有搜到有效网页：你可以换个说法，或加更具体的线索（年份/平台/玩法）。"],
    };
    setCache(cacheKey, result, 1000 * 60 * 3);
    return result;
  }

  const hitsNoVideo = mergedHits.filter((h) => !isVideoUrl(h.url));
  const hitsForExtraction0 = hitsNoVideo.filter((h) => !shouldSkipHitForCandidate(h));
  const extractionHits = hitsForExtraction0.length ? hitsForExtraction0 : hitsNoVideo.length ? hitsNoVideo : mergedHits;

  if (extractionHits.length !== mergedHits.length) {
    await emitEvent(
      makeEvent(
        "filter",
        `已过滤 ${mergedHits.length - extractionHits.length} 条“更像视频/榜单/攻略”的网页（避免把内容标题当成游戏候选）。`,
        { removed: mergedHits.length - extractionHits.length, kept: extractionHits.length },
      ),
    );
  }

  // 3) 提炼候选
  await emitEvent(makeEvent("extract", "提炼候选：从网页摘要里找出可能的游戏名…"));
  const minPool = Math.min(opts.maxCandidates, Math.max(opts.topK * 3, 12));

  const fallbackRaw = fallbackExtractCandidates({ hits: extractionHits, maxCandidates: opts.maxCandidates });

  let rawCandidateList: RawCandidate[] = useOpenAI
    ? await extractCandidatesWithOpenAI({
        apiKey: openaiKey,
        model: openaiModel,
        baseUrl: openaiBaseUrl,
        query: input.query,
        clues: input.clues,
        hits: extractionHits,
        maxCandidates: opts.maxCandidates,
      })
    : fallbackRaw;

  // 候选太少时，用“标题提名”补一把（至少让筛选过程成立）
  if (useOpenAI && rawCandidateList.length < minPool && fallbackRaw.length > rawCandidateList.length) {
    const before = rawCandidateList.length;
    rawCandidateList = [...rawCandidateList, ...fallbackRaw];
    await emitEvent(
      makeEvent("extract", `候选偏少：已用网页标题补提名（${before}→${rawCandidateList.length}），目标 ≥${minPool}。`, {
        before,
        after: rawCandidateList.length,
        minPool,
      }),
    );
  }

  rawCandidateList = rawCandidateList.filter((c) => c.name && !isLikelyNonGameCandidateName(c.name));

  let candidates = dedupeCandidates(
    rawCandidateList.map((c) => ({
      name: c.name,
      altNames: c.altNames,
      evidence: (c.evidence ?? []).map((e) => ({
        url: e.url,
        title: e.title,
        snippet: e.snippet,
      })),
    })),
    opts.maxCandidates,
  );

  // 兜底：如果候选数连 TopK 都不够，尝试用“像游戏页”的命中补位（不会用视频/榜单标题补位）
  if (candidates.length < opts.topK) {
    const need = opts.topK - candidates.length;
    const extras: Candidate[] = [];
    const seen = new Set(candidates.map((c) => c.id));
    const seenEvidenceUrls = new Set(candidates.flatMap((c) => (c.evidence ?? []).map((e) => e.url)));

    for (const h of mergedHits) {
      if (shouldSkipHitForCandidate(h)) continue;
      if (!hitLooksLikeGamePageUrl(h.url)) continue;
      if (seenEvidenceUrls.has(h.url)) continue;
      const raw = h.title.split("|")[0]?.split("–")[0]?.split("-")[0] ?? "";
      const name = cleanupCandidateName(raw) || clampText(h.title, 60) || "网页线索";
      if (!name || isLikelyNonGameCandidateName(name)) continue;
      const key = `hit:${h.url}`;
      const id = stableIdFromString("cand", key);
      if (seen.has(id)) continue;
      seen.add(id);
      extras.push({
        id,
        name,
        altNames: [],
        score: 15,
        scoreBreakdown: [
          {
            clue: "补位",
            delta: 0,
            reason: "候选不足时的低置信补位：来自“像游戏页”的网页标题，尚未深挖。",
          },
        ],
        evidence: [{ url: h.url, title: h.title, snippet: clampText(h.snippet, 240) }],
      });
      if (extras.length >= need) break;
    }

    if (extras.length) {
      candidates = [...candidates, ...extras].slice(0, opts.maxCandidates);
      const msg = `候选不足 ${opts.topK} 个：已用 ${extras.length} 个“低置信补位”填充（不会用视频/榜单标题补位）。`;
      warnings.push(msg);
      await hooks?.onWarning?.(msg);
      await emitEvent(makeEvent("extract", msg));
    } else {
      const msg = `候选不足 ${opts.topK} 个：已过滤掉视频/榜单/攻略等内容页，本次不做“内容标题补位”。你可以补充更具体线索（年份/平台/玩法），再试一次。`;
      warnings.push(msg);
      await hooks?.onWarning?.(msg);
      await emitEvent(makeEvent("extract", msg));
    }
  }

  // 候选池仍然偏小：为了先保证“别把视频/榜单当游戏”，这里不做额外追加搜索（省钱/省噪音）。
  if (candidates.length < minPool) {
    const msg = `候选池偏小（${candidates.length}/${minPool}）：为了保证结果干净，本次先不追加搜索。你可以补充更具体线索（年份/平台/玩法），再试一次。`;
    warnings.push(msg);
    await hooks?.onWarning?.(msg);
    await emitEvent(makeEvent("search", msg));
  }

  // 先给每个候选一个“别再随机风景图”的默认图（用证据域名的 favicon）
  for (const c of candidates) {
    if (!c.imageUrl) {
      const firstUrl = c.evidence?.[0]?.url ?? "";
      const fav = firstUrl ? faviconUrlFromEvidenceUrl(firstUrl) : "";
      if (fav) {
        c.imageUrl = fav;
        c.imageSourceUrl = firstUrl;
      }
    }
  }

  await emitEvent(
    makeEvent("extract", `提炼候选：得到 ${candidates.length} 个可能的游戏。`, {
      candidates: candidates.slice(0, 12).map((c) => ({ name: c.name, evidenceCount: c.evidence.length })),
    }),
  );

  if (!candidates.length) {
    const result: RecallResponse = {
      runId,
      events,
      candidates: [],
      warnings: [...warnings, "没有提炼出可靠候选：可以尝试加“平台/年份/玩法关键词”。"],
    };
    setCache(cacheKey, result, 1000 * 60 * 3);
    return result;
  }

  // 4) 先做一轮简单打分（预筛）
  for (const c of candidates) {
    const evidenceText = flattenEvidenceText(c);
    const h = heuristicScoreCandidate({
      query: input.query,
      clues: input.clues,
      candidateName: c.name,
      evidenceText,
    });
    c.score = h.score;
    c.scoreBreakdown = h.breakdown;
  }

  const preSorted = sortCandidates(candidates);
  await emitCandidates(preSorted);

  const preKeep = preSorted.slice(0, Math.min(20, preSorted.length));
  await emitEvent(
    makeEvent("filter", `第1关（粗筛）：先保留 Top ${preKeep.length} 继续深挖。`, {
      kept: preKeep.map((c) => ({ id: c.id, name: c.name, score: c.score })),
      dropped: preSorted.slice(preKeep.length).map((c) => ({ id: c.id, name: c.name, score: c.score })),
    }),
  );

  // 4.5) 证据补全（可选）：用户在意“手机平台”等信息时，补搜证据再让大模型打分
  if (useOpenAI && opts.enrichEvidence && wantsMobileEvidence(input.query, input.clues)) {
    const targets = preKeep.slice(0, 8);
    const concurrency = 3;
    let idx = 0;

    await emitEvent(makeEvent("search", "补证据：检测到你在意“手机/移动平台”，尝试为 Top 候选补 App Store / Google Play 证据…"));

    async function worker() {
      while (idx < targets.length) {
        const current = targets[idx];
        idx += 1;

        const hasIos = candidateHasHost(current, /apps\.apple\.com$/i);
        const hasGp = candidateHasHost(current, /play\.google\.com$/i);
        if (hasIos && hasGp) continue;

        const name = clampText(current.name, 80);
        const queries: Array<{ q: string; tag: string }> = [];
        if (!hasIos) queries.push({ q: `${name} iOS App Store game`, tag: "iOS" });
        if (!hasGp) queries.push({ q: `${name} Android Google Play game`, tag: "Android" });

        for (const { q, tag } of queries.slice(0, 2)) {
          try {
            await emitEvent(makeEvent("search", `补证据搜索（${tag}）：${clampText(q, 120)}`));
            const hits = await searchProvider.search({
              apiKey: tavilyKey,
              query: q,
              maxResults: 5,
              searchDepth: "basic",
              timeoutMs: 20000,
            });

            const preferred = hits.filter((h) => {
              const u = safeParseUrl(h.url);
              if (!u) return false;
              if (tag === "iOS") return /apps\.apple\.com$/i.test(u.hostname);
              if (tag === "Android") return /play\.google\.com$/i.test(u.hostname);
              return false;
            });

            const picked = (preferred.length ? preferred : hits)
              .slice(0, 2)
              .map((h) => ({ url: h.url, title: h.title, snippet: h.content }));

            if (picked.length) {
              prependEvidence(current, picked);
            }
          } catch {
            // ignore: 补证据失败不阻断主流程
          }
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
  }

  // 5) 用 OpenAI 做“解释型打分”（可选）
  let finalCandidates = preSorted;
  if (useOpenAI) {
    const scored = await scoreWithOpenAI({
      apiKey: openaiKey,
      model: openaiModel,
      baseUrl: openaiBaseUrl,
      query: input.query,
      clues: input.clues,
      candidates: preKeep,
    });

    const map = new Map(scored.map((s) => [normalizeCandidateKey(s.name), s]));
    for (const c of finalCandidates) {
      const s = map.get(normalizeCandidateKey(c.name));
      if (!s) continue;
      c.score = Math.max(0, Math.min(100, Math.round(s.score)));
      c.scoreBreakdown = sanitizeScoreBreakdown(c, s.scoreBreakdown ?? []);
    }

    await emitEvent(makeEvent("score", "第2关（解释型打分）：根据线索 + 证据链接重新排序。"));
  } else {
    await emitEvent(makeEvent("score", "第2关（简单打分）：未启用大模型，本次只用关键词规则排序。"));
  }

  finalCandidates = sortCandidates(finalCandidates);
  await emitCandidates(finalCandidates);

  const topK = finalCandidates.slice(0, opts.topK);

  await emitEvent(
    makeEvent("filter", `第3关（收敛）：保留 Top ${opts.topK} 进入扭蛋。`, {
      kept: topK.map((c) => ({ id: c.id, name: c.name, score: c.score })),
      dropped: finalCandidates.slice(opts.topK).map((c) => ({ id: c.id, name: c.name, score: c.score })),
    }),
  );

  await emitEvent(
    makeEvent("gacha", `扭蛋掉落：Top ${topK.length} 已生成。`, {
      results: topK.map((c) => ({ id: c.id, name: c.name, score: c.score })),
    }),
  );

  // Top5 图片尽量用“网页自带的封面图”，而不是随机图/域名图标
  await enrichTopImages(topK, 8);
  await emitCandidates(finalCandidates);

  // 6) 控制返回体大小
  const output = finalCandidates.map((c) => ({
    ...c,
    evidence: c.evidence.slice(0, 5),
    scoreBreakdown: c.scoreBreakdown.slice(0, 5),
  }));

  const result: RecallResponse = { runId, events, candidates: output, warnings: warnings.length ? warnings : undefined };
  setCache(cacheKey, result, 1000 * 60 * 3);
  return result;
}
