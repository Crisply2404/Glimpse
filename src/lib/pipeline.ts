import type { Candidate, Clue, PipelineEvent, RecallRequest, RecallResponse, SearchHit, TargetKind } from "@/lib/types";
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
    provider: input?.provider,
    enrichEvidence: input?.enrichEvidence ?? false,
  };
}

function clueTextForPrompt(clues: Clue[]) {
  if (!clues.length) return "（无额外线索）";
  return clues
    .map((c, idx) => `${idx + 1}. ${c.polarity === "negative" ? "不是/排除" : "是/符合"}（力度${c.weight}）：${c.text}`)
    .join("\n");
}

function targetKindLabel(kind: TargetKind) {
  switch (kind) {
    case "software":
      return "软件/应用";
    case "website":
      return "网站";
    case "movie":
      return "电影/影片";
    case "book":
      return "书/小说";
    case "game":
      return "游戏";
    case "product":
      return "产品/硬件";
    case "unknown":
    default:
      return "不确定";
  }
}

function normalizeTargetKind(raw: string): TargetKind | "" {
  const v = raw.trim().toLowerCase();
  if (!v) return "";

  if (v === "software" || v === "app" || v === "application") return "software";
  if (v === "website" || v === "site" || v === "web") return "website";
  if (v === "movie" || v === "film") return "movie";
  if (v === "book" || v === "novel") return "book";
  if (v === "game" || v === "videogame" || v === "video_game") return "game";
  if (v === "product" || v === "hardware" || v === "device") return "product";
  if (v === "unknown" || v === "uncertain") return "unknown";

  // 容错：允许中文
  if (/软件|应用|app/.test(v)) return "software";
  if (/网站|网页|站点/.test(v)) return "website";
  if (/电影|影片/.test(v)) return "movie";
  if (/书|小说/.test(v)) return "book";
  if (/游戏/.test(v)) return "game";
  if (/产品|硬件|设备/.test(v)) return "product";
  if (/不确定|未知/.test(v)) return "unknown";

  return "";
}

function heuristicTargetKind(query: string, clues: Clue[]): TargetKind {
  const hay = [query, ...clues.map((c) => c.text)].join("\n").toLowerCase();
  const has = (re: RegExp) => re.test(hay);

  const hasMobileStore = has(/\bapp store\b|\bgoogle play\b|apps\.apple\.com|play\.google\.com|安卓|android|ios|iphone|ipad/i);
  const hasGameSignals = has(
    /steam|steampowered|xbox|playstation|nintendo|itch\.io|gog\.com|epic games|游戏|手游|关卡|boss|像素风|rpg|fps|mmo|解谜|益智|\bpuzzle\b/i,
  );
  if (hasGameSignals) return "game";

  if (has(/\bimdb\b|电影|影片|导演|主演|片长|上映/i)) return "movie";
  if (has(/\bgoodreads\b|\bisbn\b|书|小说|作者|出版/i)) return "book";

  if (has(/\bhttps?:\/\//i) || has(/网站|网页|站点|域名|网址/i)) return "website";

  if (
    has(/软件|应用|客户端|插件|\bextension\b|\bplugin\b|\bsoftware\b/i) ||
    has(/\bgithub\b|\bnpm\b|\bpypi\b|\bcrate(s)?\.io\b/i) ||
    (hasMobileStore && !hasGameSignals)
  ) {
    return "software";
  }

  if (has(/型号|规格|参数|价格|购买|评测|开箱|淘宝|京东|亚马逊|amazon/i)) return "product";

  return "unknown";
}

async function detectTargetKindWithOpenAI(args: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  query: string;
  clues: Clue[];
}): Promise<TargetKind> {
  const json = await openaiJson<{ targetKind?: string }>({
    apiKey: args.apiKey,
    model: args.model,
    baseUrl: args.baseUrl,
    system: "你是分类助手。你只输出严格的 JSON（不要多余文字）。任务：根据用户描述与线索，判断他在找的目标更像哪种类型。",
    user: [
      '请输出 JSON：{ "targetKind": "software" | "website" | "movie" | "book" | "game" | "product" | "unknown" }',
      "",
      "规则：",
      "- 如果信息不足或很模糊，请输出 unknown",
      "- 不要输出解释文字，只要 JSON",
      "",
      `用户描述：${args.query}`,
      "",
      `线索：\n${clueTextForPrompt(args.clues)}`,
    ].join("\n"),
    temperature: 0.1,
    timeoutMs: 20000,
  });

  const kind = normalizeTargetKind(typeof json.targetKind === "string" ? json.targetKind : "");
  if (!kind) throw new Error("OpenAI 类型识别失败：返回的 targetKind 不合法。");
  return kind;
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
  targetKind: TargetKind;
}) {
  const json = await openaiJson<{ queries?: string[] }>({
    apiKey: args.apiKey,
    model: args.model,
    baseUrl: args.baseUrl,
    system:
      "你是搜索专家。你只输出严格的 JSON（不要多余文字）。目标：根据“模糊印象 + 线索”，生成多条适合搜索引擎的查询词，用来命中最可能的候选名字。",
    user: [
      "请输出 JSON：{ \"queries\": string[] }",
      "",
      "规则：",
      `- 生成 ${args.maxQueries} 条查询词（数组长度必须等于该数量）`,
      "- 每条尽量短（像关键词，不要整段句子）",
      "- 中英混合可以，但至少要有 2 条是英文关键词为主（更容易命中名字）",
      "- 可以加“类型信号词”来帮搜索更聚焦，但不要硬加（不确定就别加）",
      `- 目标类型猜测：${args.targetKind}（${targetKindLabel(args.targetKind)}）`,
      "- 类型信号词举例：",
      '  - software: app / software / download / GitHub / npm / PyPI',
      '  - website: website / site / official / domain',
      '  - movie: movie / film / IMDb / trailer',
      '  - book: book / novel / author / ISBN',
      '  - game: game / video game / Steam / iOS / Android / App Store / Google Play',
      '  - product: product / official / specs / model',
      "- 优先把“特点/机制/界面/功能”转成关键词（比如：tilt / gravity / accelerometer / liquid / physics / puzzle 等）",
      "- 不要编造不存在的网页或证据；也不要硬猜名字当成结论（可以通过关键词让搜索自己命中）",
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

function fallbackQueries(args: { query: string; clues: Clue[]; maxQueries: number; targetKind: TargetKind }) {
  const base = args.query.trim();
  const clueWords = args.clues
    .filter((c) => c.polarity === "positive")
    .slice(0, 4)
    .map((c) => c.text.trim())
    .filter(Boolean);

  const boost = heuristicKeywordsFromQuery(base);
  const boostText = boost.length ? boost.join(" ") : "";
  const clueText = clueWords.length ? clueWords.join(" ") : "";

  const kindHints = (() => {
    switch (args.targetKind) {
      case "software":
        return ["app", "software", "GitHub", "download"];
      case "website":
        return ["website", "official", "domain"];
      case "movie":
        return ["movie", "film", "IMDb"];
      case "book":
        return ["book", "novel", "ISBN"];
      case "game":
        return ["game", "Steam", "App Store", "Google Play"];
      case "product":
        return ["product", "official", "model", "specs"];
      case "unknown":
      default:
        return ["official", "wikipedia"];
    }
  })();

  const hintText = kindHints.slice(0, 2).join(" ");

  const list = uniqStrings(
    [
      base,
      hintText ? `${base} ${hintText}` : "",
      boostText ? `${base} ${boostText}` : "",
      clueText ? `${base} ${clueText}` : "",
      boostText && clueText ? `${boostText} ${clueText}` : "",
      boostText && hintText ? `${boostText} ${hintText}` : "",
      `${base} name`,
      `${base} wikipedia`,
    ].filter(Boolean),
  );

  // 不够就用更泛的组合补齐（尽量不带“默认=游戏”的偏见）
  const fallbackPool = uniqStrings(
    [
      "tilt gravity liquid physics puzzle",
      "gravity tilt liquid mobile",
      "tilt liquid physics puzzle",
      hintText ? `${hintText} name` : "",
    ].filter(Boolean),
  );

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
  targetKind: TargetKind;
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
      "你是信息提炼助手。你只输出严格的 JSON（不要多余文字）。你的任务是从搜索摘要里提炼“可能的候选名字”，并且每个候选必须给出证据链接。",
    user: [
      `请输出 JSON：{ "candidates": { "name": string, "altNames"?: string[], "evidence": { "url": string, "title"?: string, "snippet": string }[] }[] }`,
      "",
      "硬性规则：",
      `- 最多输出 ${args.maxCandidates} 个候选`,
      "- 不要编造不存在的网页链接：evidence.url 必须来自下面提供的 hits.url",
      "- 每个候选至少 1 条证据，最多 3 条证据",
      "- 候选必须是“一个具体名字”（可能是软件/网站/电影/书/游戏/产品等），不要输出网页标题/问句/盘点",
      "- ⚠️ 候选不允许是内容标题：Top 10 / Best / alternatives / how to / tutorial / gameplay / 盘点/推荐/合集/攻略/教程/评测 等都不行",
      "- 如果某条命中明显来自视频站（YouTube/B站等），不要把它的标题当候选名",
      "- 如果某条摘要明显是攻略/梗图/无关内容，请不要提为候选",
      "- 如果能找到更像“本体页”的链接，请优先把它放进 evidence（例如：官网/商店页/Wikipedia/GitHub/npm 等）",
      "",
      `目标类型猜测：${args.targetKind}（${targetKindLabel(args.targetKind)}）`,
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

function fallbackExtractCandidates(args: { hits: SearchHit[]; maxCandidates: number; targetKind: TargetKind }): RawCandidate[] {
  const results: RawCandidate[] = [];
  const seen = new Set<string>();

  for (const h of args.hits) {
    if (shouldSkipHitForCandidate(h, args.targetKind)) continue;
    const raw = h.title.split("|")[0]?.split("–")[0]?.split("-")[0] ?? "";
    const name = cleanupCandidateName(raw);
    if (isLikelyBadCandidateName(name)) continue;
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
  targetKind: TargetKind;
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
      "你是评分助手。你只输出严格的 JSON（不要多余文字）。你必须基于证据链接与摘要做判断，不要拍脑袋。",
    user: [
      `请输出 JSON：{ "scored": { "name": string, "score": number, "scoreBreakdown": { "clue": string, "delta": number, "reason": string, "evidenceUrl"?: string, "evidenceQuote"?: string }[] }[] }`,
      "",
      "规则：",
      "- score 是 0~100 的整数，越高越可能",
      "- scoreBreakdown 最多 5 条，用大白话解释“为什么加分/减分/先不下结论”",
      "- ⚠️ 证据约束（很重要）：只要 delta ≠ 0，就必须同时给出 evidenceUrl + evidenceQuote",
      "- evidenceUrl 必须是该候选 evidence 里的 url（禁止编造链接）",
      "- evidenceQuote 必须是该候选 evidence.snippet 里的原文片段（直接复制一小段，20~90字）",
      "- reason 里提到的关键事实（比如平台/年份/特征/是否支持某功能等），必须能在 evidenceQuote 里找到对应文字；找不到就别写",
      "- 如果找不到能直接支持某结论的原文：delta 必须是 0，并在 reason 里写“证据不足，先不下结论”",
      "- 禁止根据“来源网站”做跳步推断：例如看到 Steam/GitHub，只能说明“那里能看到它”，不能推断“只在某个平台/没有其它平台”",
      "- 如果证据偏教程/盘点/无关，请降低分数并说明原因（也要给 quote）",
      "",
      `目标类型猜测：${args.targetKind}（${targetKindLabel(args.targetKind)}）`,
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

function looksLikeQuestionOrHelpTitle(text: string) {
  const t = text.trim();
  if (!t) return false;
  const lower = t.toLowerCase();

  // 仅凭问号太粗暴：加一点长度门槛
  if ((t.includes("?") || t.includes("？")) && t.length >= 18) return true;

  // 英文问句/求助
  if (
    /\bwhat\s+is\b|\bwhat'?s\b|\banyone\s+know\b|\bhelp\b|\blooking\s+for\b|\bidentify\b|\bdoes\s+anyone\s+remember\b|\bname\s+of\b/i.test(
      lower,
    )
  ) {
    return true;
  }

  // 中文问句/求助
  if (/求助|请问|有人知道|这是什么|叫什么|名字是什么|求.*名字|想找.*名字/.test(t)) return true;

  return false;
}

function looksLikeContentTitle(text: string) {
  const t = text.trim();
  if (!t) return false;
  const lower = t.toLowerCase();

  if (looksLikeQuestionOrHelpTitle(t)) return true;

  // 英文榜单/集合/对比/教程（我们要的是“名字”，不是内容标题）
  if (/^(top|best)\s*\d+\b/i.test(lower)) return true;
  if (/^\d{1,3}\s*(\+)?\s*(best|top|insane|fun|great|awesome)?\b/i.test(lower) && /\b(list|apps?|tools?|sites?|games?|movies?|books?|products?)\b/i.test(lower)) {
    return true;
  }
  if (/\b(alternatives?|similar\s+to|apps?\s+like|tools?\s+like|sites?\s+like|games?\s+like)\b/i.test(lower)) return true;
  if (/\bhow\s+to\b|\btutorial\b|\bguide\b|\bwalkthrough\b|\btips?\b|\bcheats?\b|\breview\b|\bcomparison\b|\bvs\b|\bversus\b/i.test(lower)) {
    return true;
  }

  // 英文视频/内容类型
  if (/\bgameplay\b|\blet'?s\s+play\b|\bplaythrough\b|\btrailer\b|\bteaser\b|\bpreview\b/i.test(lower)) return true;
  if (/\bfull\s+(game|movie)\b|\blongplay\b|\bspeedrun\b|\bno\s+commentary\b|\bsoundtrack\b|\bost\b/i.test(lower)) return true;

  // 中文榜单/攻略/内容
  if (/\d+\s*(款|个|部|本)\b.*(推荐|盘点|排行|排行榜|合集)/.test(t)) return true;
  if (/盘点|推荐|排行|排行榜|合集|攻略|教程|教学|解说|实况|通关|评测|测评|开箱|对比|替代|类似/.test(t)) return true;
  if (/预告|预告片|宣传片|\bPV\b|全流程|速通|原声|主题曲|OST|音乐|配乐|试玩/.test(t)) return true;

  return false;
}

function githubRepoFromUrl(url: string) {
  const u = safeParseUrl(url);
  if (!u) return "";
  if (!/(^|\.)github\.com$/i.test(u.hostname)) return "";
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return "";
  const [owner, repo] = parts;
  if (!owner || !repo) return "";
  // 排除明显不是仓库主页的路径
  const blocked = new Set(["issues", "pulls", "discussions", "wiki", "releases", "actions", "security", "topics"]);
  if (blocked.has(owner.toLowerCase())) return "";
  return `${owner}/${repo}`;
}

function npmPackageFromUrl(url: string) {
  const u = safeParseUrl(url);
  if (!u) return "";
  if (!/(^|\.)npmjs\.com$/i.test(u.hostname)) return "";
  const m = u.pathname.match(/^\/package\/([^/]+)(\/|$)/i);
  return m?.[1] ?? "";
}

function pypiProjectFromUrl(url: string) {
  const u = safeParseUrl(url);
  if (!u) return "";
  if (!/(^|\.)pypi\.org$/i.test(u.hostname)) return "";
  const m = u.pathname.match(/^\/project\/([^/]+)(\/|$)/i);
  return m?.[1] ?? "";
}

function cratesNameFromUrl(url: string) {
  const u = safeParseUrl(url);
  if (!u) return "";
  if (!/(^|\.)crates\.io$/i.test(u.hostname)) return "";
  const m = u.pathname.match(/^\/crates\/([^/]+)(\/|$)/i);
  return m?.[1] ?? "";
}

function imdbTitleIdFromUrl(url: string) {
  const u = safeParseUrl(url);
  if (!u) return "";
  if (!/(^|\.)imdb\.com$/i.test(u.hostname)) return "";
  const m = u.pathname.match(/^\/title\/(tt\d+)(\/|$)/i);
  return m?.[1] ?? "";
}

function goodreadsBookIdFromUrl(url: string) {
  const u = safeParseUrl(url);
  if (!u) return "";
  if (!/(^|\.)goodreads\.com$/i.test(u.hostname)) return "";
  const m = u.pathname.match(/^\/book\/show\/(\d+)([.\-/]|$)/i);
  return m?.[1] ?? "";
}

function isDiscussionOrContentPlatformHost(hostname: string) {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  const patterns: RegExp[] = [
    /(^|\.)reddit\.com$/i,
    /(^|\.)stackoverflow\.com$/i,
    /(^|\.)stackexchange\.com$/i,
    /(^|\.)quora\.com$/i,
    /(^|\.)zhihu\.com$/i,
    /(^|\.)medium\.com$/i,
  ];
  return patterns.some((re) => re.test(host));
}

function looksLikeHomepage(u: URL) {
  const path = (u.pathname || "/").replace(/\/+$/, "/");
  if (path === "/") return true;
  if (/^\/(about|pricing|download|home|index\.html?)\/?$/i.test(path)) return true;
  return false;
}

function hitLooksLikeEntityPageUrl(url: string, kind: TargetKind) {
  // 通用“本体页”来源（不限定类型，尽量少误杀）
  if (steamAppIdFromUrl(url)) return true;
  if (appStoreIdFromUrl(url)) return true;
  if (googlePlayPackageFromUrl(url)) return true;
  if (githubRepoFromUrl(url)) return true;
  if (npmPackageFromUrl(url)) return true;
  if (pypiProjectFromUrl(url)) return true;
  if (cratesNameFromUrl(url)) return true;
  if (imdbTitleIdFromUrl(url)) return true;
  if (goodreadsBookIdFromUrl(url)) return true;

  const u = safeParseUrl(url);
  if (!u) return false;
  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();

  if (/wikipedia\.org$/i.test(host) && path.startsWith("/wiki/")) return true;

  // 额外的“更像本体页”的站点（按类型补充，但不会排除其它类型）
  if (kind === "game" || kind === "unknown") {
    if (/itch\.io$/i.test(host) && path.length > 1) return true;
    if (/gog\.com$/i.test(host) && path.includes("/game/")) return true;
    if (/store\.epicgames\.com$/i.test(host) && path.startsWith("/")) return true;
    if (/nintendo\.com$/i.test(host) && path.includes("/store/")) return true;
    if (/playstation\.com$/i.test(host) && path.includes("/games/")) return true;
    if (/xbox\.com$/i.test(host) && path.includes("/games/")) return true;
  }

  // 网站/软件/产品：主页也很可能是本体页（但排除内容平台）
  if ((kind === "website" || kind === "software" || kind === "product" || kind === "unknown") && !isDiscussionOrContentPlatformHost(host)) {
    if (looksLikeHomepage(u)) return true;
  }

  return false;
}

function shouldSkipHitForCandidate(hit: SearchHit, targetKind: TargetKind) {
  if (!hit?.url) return true;
  if (isVideoUrl(hit.url)) return true;

  // 像“商店页/百科/仓库”这种更像本体页的链接，不做标题规则过滤
  if (hitLooksLikeEntityPageUrl(hit.url, targetKind)) return false;

  // 其它网页：用标题/摘要判断“是不是更像内容页（视频/盘点/教程/问句）”
  if (looksLikeContentTitle(hit.title)) return true;
  if (looksLikeContentTitle(hit.snippet)) return true;

  return false;
}

function shouldSkipEvidenceForCandidate(evidence: { url: string; title?: string; snippet: string }, targetKind: TargetKind) {
  if (!evidence?.url) return true;
  if (isVideoUrl(evidence.url)) return true;

  // 像“商店页/百科/仓库”这种更像本体页的链接：允许作为证据
  if (hitLooksLikeEntityPageUrl(evidence.url, targetKind)) return false;

  // 其它网页：如果更像内容页（视频/盘点/教程/问句），就别拿来当候选证据（避免 Top 里混进“内容标题感”）
  if (looksLikeContentTitle(evidence.title ?? "")) return true;
  if (looksLikeContentTitle(evidence.snippet ?? "")) return true;

  return false;
}

function isLikelyBadCandidateName(name: string) {
  // 候选名本身如果像“内容标题/问句”，直接排除（防止误提名）
  return looksLikeContentTitle(name);
}

function candidateKeyFromNameAndEvidence(name: string, evidence: Candidate["evidence"]) {
  const steamId = (evidence ?? []).map((e) => steamAppIdFromUrl(e.url)).find(Boolean);
  if (steamId) return `steam:${steamId}`;

  const iosId = (evidence ?? []).map((e) => appStoreIdFromUrl(e.url)).find(Boolean);
  if (iosId) return `ios:${iosId}`;

  const gp = (evidence ?? []).map((e) => googlePlayPackageFromUrl(e.url)).find(Boolean);
  if (gp) return `gp:${gp.toLowerCase()}`;

  const gh = (evidence ?? []).map((e) => githubRepoFromUrl(e.url)).find(Boolean);
  if (gh) return `gh:${gh.toLowerCase()}`;

  const npm = (evidence ?? []).map((e) => npmPackageFromUrl(e.url)).find(Boolean);
  if (npm) return `npm:${npm.toLowerCase()}`;

  const pypi = (evidence ?? []).map((e) => pypiProjectFromUrl(e.url)).find(Boolean);
  if (pypi) return `pypi:${pypi.toLowerCase()}`;

  const crate = (evidence ?? []).map((e) => cratesNameFromUrl(e.url)).find(Boolean);
  if (crate) return `crate:${crate.toLowerCase()}`;

  const imdb = (evidence ?? []).map((e) => imdbTitleIdFromUrl(e.url)).find(Boolean);
  if (imdb) return `imdb:${imdb.toLowerCase()}`;

  const gr = (evidence ?? []).map((e) => goodreadsBookIdFromUrl(e.url)).find(Boolean);
  if (gr) return `gr:${gr}`;

  const wiki = (evidence ?? []).find((e) => {
    const u = safeParseUrl(e.url);
    return Boolean(u && /wikipedia\.org$/i.test(u.hostname) && u.pathname.toLowerCase().startsWith("/wiki/"));
  });
  if (wiki) {
    const u = safeParseUrl(wiki.url);
    const slug = u ? decodeURIComponent(u.pathname.slice("/wiki/".length)) : "";
    if (slug) return `wiki:${slug.toLowerCase()}`;
  }

  const home = (evidence ?? []).find((e) => {
    const u = safeParseUrl(e.url);
    if (!u) return false;
    if (isDiscussionOrContentPlatformHost(u.hostname)) return false;
    return looksLikeHomepage(u);
  });
  if (home) {
    const u = safeParseUrl(home.url);
    if (u?.hostname) return `site:${u.hostname.toLowerCase()}`;
  }

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

function dedupeCandidates(
  raw: Array<{ name: string; altNames?: string[]; evidence: Candidate["evidence"] }>,
  max: number,
  targetKind: TargetKind,
) {
  const map = new Map<string, Candidate>();

  for (const r of raw) {
    const name = cleanupCandidateName(r.name);
    const evidence = (r.evidence ?? [])
      .map((e) => ({
        url: e.url,
        title: e.title ? clampText(e.title, 120) : undefined,
        snippet: clampText(e.snippet, 320),
      }))
      .filter((e) => e.url && e.snippet && !shouldSkipEvidenceForCandidate(e, targetKind));
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

function candidateHasEntityEvidence(candidate: Candidate, targetKind: TargetKind) {
  return (candidate.evidence ?? []).some((e) => hitLooksLikeEntityPageUrl(e.url, targetKind));
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

  const searchProvider = getSearchProvider(opts.provider);
  const searchKeyEnv = searchProvider.id === "brave" ? "BRAVE_API_KEY" : "TAVILY_API_KEY";
  const searchApiKey = safeEnv(searchKeyEnv);
  if (!searchApiKey) {
    const name = searchProvider.id === "brave" ? "Brave" : "Tavily";
    throw new Error(`缺少 ${name} API key：请在 .env.local 里配置 ${searchKeyEnv}。`);
  }

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

  // 0) 先判断“更像在找哪类东西”（不做 UI 下拉）
  let targetKind: TargetKind = "unknown";
  if (useOpenAI) {
    try {
      targetKind = await detectTargetKindWithOpenAI({
        apiKey: openaiKey,
        model: openaiModel,
        baseUrl: openaiBaseUrl,
        query: input.query,
        clues: input.clues,
      });
    } catch {
      targetKind = heuristicTargetKind(input.query, input.clues);
      const msg = "目标类型判断失败：已回退到简单规则（可能不准）。";
      warnings.push(msg);
      await hooks?.onWarning?.(msg);
    }
  } else {
    targetKind = heuristicTargetKind(input.query, input.clues);
  }

  await emitEvent(makeEvent("search", `目标类型：${targetKindLabel(targetKind)}。`, { targetKind }));

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
        targetKind,
      });
    } catch (e) {
      const msg = "搜索词生成失败：已回退到简单拼接（可能漏掉一些方向）。";
      warnings.push(msg);
      await hooks?.onWarning?.(msg);
      queries = fallbackQueries({ query: input.query, clues: input.clues, maxQueries: opts.maxQueries, targetKind });
    }
  } else {
    queries = fallbackQueries({ query: input.query, clues: input.clues, maxQueries: opts.maxQueries, targetKind });
  }

  // 小保险：把“机制关键词”查询混进去（避免只搜到很泛的结果）
  queries = uniqStrings([...queries, ...fallbackQueries({ query: input.query, clues: input.clues, maxQueries: opts.maxQueries, targetKind })]).slice(
    0,
    opts.maxQueries,
  );

  await emitEvent(makeEvent("search", `搜索词已就绪：${queries.length} 条。`, { queries }));

  // 2) 搜索（多轮）
  const rawHits: Array<{ q: string; rank: number; title: string; url: string; snippet: string; score?: number }> = [];
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    await emitEvent(makeEvent("search", `搜索（${i + 1}/${queries.length}）：${clampText(q, 120)}`));
    const hits = await searchProvider.search({
      apiKey: searchApiKey,
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
      targetKind,
      warnings: [...warnings, "没有搜到有效网页：你可以换个说法，或加更具体的线索（年份/平台/特征）。"],
    };
    setCache(cacheKey, result, 1000 * 60 * 3);
    return result;
  }

  const hitsNoVideo = mergedHits.filter((h) => !isVideoUrl(h.url));
  const hitsForExtraction0 = hitsNoVideo.filter((h) => !shouldSkipHitForCandidate(h, targetKind));
  const extractionHits = hitsForExtraction0.length ? hitsForExtraction0 : hitsNoVideo.length ? hitsNoVideo : mergedHits;

  if (extractionHits.length !== mergedHits.length) {
    await emitEvent(
      makeEvent(
        "filter",
        `已过滤 ${mergedHits.length - extractionHits.length} 条“更像视频/盘点/教程/问句”的网页（避免把内容标题当成候选名）。`,
        { removed: mergedHits.length - extractionHits.length, kept: extractionHits.length },
      ),
    );
  }

  // 3) 提炼候选
  await emitEvent(makeEvent("extract", "提炼候选：从网页摘要里找出可能的候选名…"));
  const minPool = Math.min(opts.maxCandidates, Math.max(opts.topK * 3, 12));

  const fallbackRaw = fallbackExtractCandidates({ hits: extractionHits, maxCandidates: opts.maxCandidates, targetKind });

  let rawCandidateList: RawCandidate[] = useOpenAI
    ? await extractCandidatesWithOpenAI({
        apiKey: openaiKey,
        model: openaiModel,
        baseUrl: openaiBaseUrl,
        query: input.query,
        clues: input.clues,
        hits: extractionHits,
        maxCandidates: opts.maxCandidates,
        targetKind,
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

  rawCandidateList = rawCandidateList.filter((c) => c.name && !isLikelyBadCandidateName(c.name));

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
    targetKind,
  );

  // 兜底：如果候选数连 TopK 都不够，尝试用“更像本体页”的命中补位（不会用视频/盘点/教程标题补位）
  if (candidates.length < opts.topK) {
    const need = opts.topK - candidates.length;
    const extras: Candidate[] = [];
    const seen = new Set(candidates.map((c) => c.id));
    const seenEvidenceUrls = new Set(candidates.flatMap((c) => (c.evidence ?? []).map((e) => e.url)));

    for (const h of mergedHits) {
      if (shouldSkipHitForCandidate(h, targetKind)) continue;
      if (!hitLooksLikeEntityPageUrl(h.url, targetKind)) continue;
      if (seenEvidenceUrls.has(h.url)) continue;
      const raw = h.title.split("|")[0]?.split("–")[0]?.split("-")[0] ?? "";
      const name = cleanupCandidateName(raw) || clampText(h.title, 60) || "网页线索";
      if (!name || isLikelyBadCandidateName(name)) continue;
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
            reason: "候选不足时的低置信补位：来自“更像本体页”的网页标题，尚未深挖。",
          },
        ],
        evidence: [{ url: h.url, title: h.title, snippet: clampText(h.snippet, 240) }],
      });
      if (extras.length >= need) break;
    }

    if (extras.length) {
      candidates = [...candidates, ...extras].slice(0, opts.maxCandidates);
      const msg = `候选不足 ${opts.topK} 个：已用 ${extras.length} 个“低置信补位”填充（不会用视频/盘点/教程标题补位）。`;
      warnings.push(msg);
      await hooks?.onWarning?.(msg);
      await emitEvent(makeEvent("extract", msg));
    } else {
      const msg = `候选不足 ${opts.topK} 个：已过滤掉视频/盘点/教程等内容页，本次不做“内容标题补位”。你可以补充更具体线索（年份/平台/特征），再试一次。`;
      warnings.push(msg);
      await hooks?.onWarning?.(msg);
      await emitEvent(makeEvent("extract", msg));
    }
  }

  // 候选池仍然偏小：为了先保证“别把内容标题当候选名”，这里不做额外追加搜索（省钱/省噪音）。
  if (candidates.length < minPool) {
    const msg = `候选池偏小（${candidates.length}/${minPool}）：为了保证结果干净，本次先不追加搜索。你可以补充更具体线索（年份/平台/特征），再试一次。`;
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
    makeEvent("extract", `提炼候选：得到 ${candidates.length} 个候选。`, {
      candidates: candidates.slice(0, 12).map((c) => ({ name: c.name, evidenceCount: c.evidence.length })),
    }),
  );

  if (!candidates.length) {
    const result: RecallResponse = {
      runId,
      events,
      candidates: [],
      targetKind,
      warnings: [...warnings, "没有提炼出可靠候选：可以尝试加“平台/年份/特征关键词”。"],
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

  const entityKept = preSorted.filter((c) => candidateHasEntityEvidence(c, targetKind));
  const entityDropped = preSorted.filter((c) => !candidateHasEntityEvidence(c, targetKind));

  await emitEvent(
    makeEvent("filter", `第1关（本体校验）：只保留“更像目标本体”的候选（${entityKept.length} 个）。`, {
      kept: entityKept.map((c) => ({ id: c.id, name: c.name, score: c.score })),
      dropped: entityDropped.map((c) => ({ id: c.id, name: c.name, score: c.score })),
    }),
  );

  if (entityKept.length < opts.topK) {
    const msg = `严格模式：只找到 ${entityKept.length} 个带“本体页证据”的候选（不会用内容标题凑数）。建议你补充更具体线索再试一次。`;
    warnings.push(msg);
    await hooks?.onWarning?.(msg);
  }

  const preKeep = entityKept.slice(0, Math.min(20, entityKept.length));
  await emitEvent(
    makeEvent("filter", `第2关（粗筛）：先保留 Top ${preKeep.length} 继续深挖。`, {
      kept: preKeep.map((c) => ({ id: c.id, name: c.name, score: c.score })),
      dropped: entityKept.slice(preKeep.length).map((c) => ({ id: c.id, name: c.name, score: c.score })),
    }),
  );

  let activeCandidates = preKeep;

  // 4.5) 证据补全（可选）：用户在意“手机平台”等信息时，补搜证据再让大模型打分
  if (useOpenAI && opts.enrichEvidence && wantsMobileEvidence(input.query, input.clues)) {
    const targets = activeCandidates.slice(0, 8);
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
        if (!hasIos) queries.push({ q: `${name} iOS App Store`, tag: "iOS" });
        if (!hasGp) queries.push({ q: `${name} Android Google Play`, tag: "Android" });

        for (const { q, tag } of queries.slice(0, 2)) {
          try {
            await emitEvent(makeEvent("search", `补证据搜索（${tag}）：${clampText(q, 120)}`));
            const hits = await searchProvider.search({
              apiKey: searchApiKey,
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
  let finalCandidates = activeCandidates;
  if (useOpenAI) {
    const scored = await scoreWithOpenAI({
      apiKey: openaiKey,
      model: openaiModel,
      baseUrl: openaiBaseUrl,
      query: input.query,
      clues: input.clues,
      candidates: activeCandidates,
      targetKind,
    });

    const map = new Map(scored.map((s) => [normalizeCandidateKey(s.name), s]));
    for (const c of finalCandidates) {
      const s = map.get(normalizeCandidateKey(c.name));
      if (!s) continue;
      c.score = Math.max(0, Math.min(100, Math.round(s.score)));
      c.scoreBreakdown = sanitizeScoreBreakdown(c, s.scoreBreakdown ?? []);
    }

    await emitEvent(makeEvent("score", "第3关（解释型打分）：根据线索 + 证据链接重新排序。"));
  } else {
    await emitEvent(makeEvent("score", "第3关（简单打分）：未启用大模型，本次只用关键词规则排序。"));
  }

  finalCandidates = sortCandidates(finalCandidates);
  await emitCandidates(sortCandidates(candidates));

  const topK = finalCandidates.slice(0, opts.topK);

  await emitEvent(
    makeEvent("filter", `第4关（收敛）：保留 Top ${topK.length} 进入扭蛋。`, {
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
  await emitCandidates(sortCandidates(candidates));

  // 6) 控制返回体大小
  const output = sortCandidates(candidates).map((c) => ({
    ...c,
    evidence: c.evidence.slice(0, 5),
    scoreBreakdown: c.scoreBreakdown.slice(0, 5),
  }));

  const result: RecallResponse = { runId, events, candidates: output, targetKind, warnings: warnings.length ? warnings : undefined };
  setCache(cacheKey, result, 1000 * 60 * 3);
  return result;
}
