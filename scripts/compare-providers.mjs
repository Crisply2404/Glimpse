/* eslint-disable no-console */

// 最小对照脚本：用“同一批样例”分别跑 Tavily/Brave，看看：
// - Top1 / Top5 命中率（按候选名里是否包含 expected 关键词粗略判断）
// - “内容标题命中占比”（Top/Best/盘点/教程/问句 这类）
//
// 用法：
// - 直接跑内置样例：node scripts/compare-providers.mjs
// - 传入自定义样例 JSON：node scripts/compare-providers.mjs --input ./scripts/samples.json
//
// samples.json 格式（数组）：
// [
//   { "name": "puddle+", "expected": ["puddle+"], "query": "tilt gravity liquid physics puzzle" }
// ]

import fs from "node:fs";

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return "";
  return String(process.argv[idx + 1] ?? "");
}

function clampText(input, maxLen) {
  const text = String(input ?? "").trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function cleanupCandidateName(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[™®]/g, "")
    .replace(/\s*-\s*apps\s+on\s+google\s+play\b.*$/i, "")
    .replace(/\s*-\s*google\s+play\b.*$/i, "")
    .replace(/\s*-\s*app\s+store\b.*$/i, "")
    .replace(/\s+on\s+(steam|the app store|app store|google play)\b.*$/i, "")
    .replace(/\s*-\s*(steam|wikipedia|wiki|github|imdb|goodreads|youtube).*$/i, "")
    .replace(/\s*\(.*?\)\s*$/g, "")
    .trim();
}

function looksLikeQuestionOrHelpTitle(text) {
  const t = String(text ?? "").trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if ((t.includes("?") || t.includes("？")) && t.length >= 18) return true;
  if (/\bwhat\s+is\b|\bwhat'?s\b|\banyone\s+know\b|\bhelp\b|\blooking\s+for\b|\bidentify\b|\bdoes\s+anyone\s+remember\b|\bname\s+of\b/i.test(lower)) {
    return true;
  }
  if (/求助|请问|有人知道|这是什么|叫什么|名字是什么|求.*名字|想找.*名字/.test(t)) return true;
  return false;
}

function looksLikeContentTitle(text) {
  const t = String(text ?? "").trim();
  if (!t) return false;
  const lower = t.toLowerCase();

  if (looksLikeQuestionOrHelpTitle(t)) return true;

  if (/^(top|best)\s*\d+\b/i.test(lower)) return true;
  if (/\b(alternatives?|similar\s+to|apps?\s+like|tools?\s+like|sites?\s+like|games?\s+like)\b/i.test(lower)) return true;
  if (/\bhow\s+to\b|\btutorial\b|\bguide\b|\bwalkthrough\b|\btips?\b|\breview\b|\bcomparison\b|\bvs\b|\bversus\b/i.test(lower)) return true;
  if (/\bgameplay\b|\bplaythrough\b|\btrailer\b|\bteaser\b|\bpreview\b|\bfull\s+(game|movie)\b/i.test(lower)) return true;

  if (/\d+\s*(款|个|部|本)\b.*(推荐|盘点|排行|排行榜|合集)/.test(t)) return true;
  if (/盘点|推荐|排行|排行榜|合集|攻略|教程|教学|解说|实况|通关|评测|测评|开箱|对比|替代|类似/.test(t)) return true;
  if (/预告|预告片|宣传片|\bPV\b|全流程|速通|原声|主题曲|OST|音乐|配乐|试玩/.test(t)) return true;

  return false;
}

function extractCandidatesFromHits(hits, max = 5) {
  const out = [];
  const seen = new Set();

  for (const h of hits) {
    const title = String(h?.title ?? "");
    if (!title) continue;
    if (looksLikeContentTitle(title)) continue;

    const raw = title.split("|")[0]?.split("–")[0]?.split("-")[0] ?? "";
    const name = cleanupCandidateName(raw);
    if (!name) continue;
    if (looksLikeContentTitle(name)) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= max) break;
  }

  return out;
}

async function tavilySearch({ apiKey, query, maxResults = 10 }) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: Math.max(1, Math.min(20, maxResults)),
      include_answer: false,
      include_images: false,
      include_raw_content: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const json = await res.json();
  return (json?.results ?? []).map((r) => ({
    title: String(r?.title ?? ""),
    url: String(r?.url ?? ""),
    snippet: String(r?.content ?? ""),
  }));
}

async function braveSearch({ apiKey, query, maxResults = 10 }) {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.max(1, Math.min(20, maxResults))));
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { accept: "application/json", "x-subscription-token": apiKey },
  });
  if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
  const json = await res.json();
  return (json?.web?.results ?? []).map((r) => ({
    title: String(r?.title ?? ""),
    url: String(r?.url ?? ""),
    snippet: String(r?.description ?? ""),
  }));
}

function normalizeExpectedList(sample) {
  const exp = Array.isArray(sample.expected) ? sample.expected : [sample.name];
  return exp
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .map((s) => s.toLowerCase());
}

function hitExpected(candidate, expectedList) {
  const c = String(candidate ?? "").toLowerCase();
  return expectedList.some((e) => e && c.includes(e));
}

async function runOneProvider(providerId, sample) {
  const expected = normalizeExpectedList(sample);
  const query = String(sample.query ?? "").trim();

  const providerKey =
    providerId === "brave"
      ? process.env.BRAVE_API_KEY
      : providerId === "tavily"
        ? process.env.TAVILY_API_KEY
        : "";

  if (!providerKey) {
    return {
      providerId,
      skipped: true,
      error: `缺少 ${providerId.toUpperCase()}_API_KEY`,
    };
  }

  const hits =
    providerId === "brave"
      ? await braveSearch({ apiKey: providerKey, query, maxResults: 12 })
      : await tavilySearch({ apiKey: providerKey, query, maxResults: 12 });

  const contentHitCount = hits.filter((h) => looksLikeContentTitle(h.title)).length;
  const candidates = extractCandidatesFromHits(hits, 5);

  const top1 = candidates[0] ?? "";
  const top5 = candidates;

  return {
    providerId,
    skipped: false,
    hitCount: hits.length,
    contentHitCount,
    contentHitRatio: hits.length ? contentHitCount / hits.length : 0,
    candidates,
    top1Hit: hitExpected(top1, expected),
    top5Hit: top5.some((c) => hitExpected(c, expected)),
  };
}

function defaultSamples() {
  return [
    {
      name: "Puddle+",
      expected: ["puddle+"],
      query: "tilt gravity liquid physics puzzle",
    },
  ];
}

async function main() {
  const inputPath = argValue("--input");
  const samples = inputPath ? JSON.parse(fs.readFileSync(inputPath, "utf-8")) : defaultSamples();

  const providers = ["tavily", "brave"];
  const summary = {};

  for (const providerId of providers) {
    summary[providerId] = {
      total: 0,
      top1: 0,
      top5: 0,
      avgContentHitRatio: 0,
      ran: 0,
    };
  }

  for (const sample of samples) {
    const title = String(sample?.name ?? "sample");
    console.log(`\n=== 样例: ${title} ===`);
    console.log(`query: ${clampText(sample?.query ?? "", 140)}`);

    for (const providerId of providers) {
      try {
        const r = await runOneProvider(providerId, sample);
        if (r.skipped) {
          console.log(`[${providerId}] 跳过：${r.error}`);
          continue;
        }

        console.log(
          `[${providerId}] hits=${r.hitCount} 内容标题命中=${r.contentHitCount} (${Math.round(
            r.contentHitRatio * 100,
          )}%)`,
        );
        console.log(`[${providerId}] candidates: ${r.candidates.join(" | ") || "（无）"}`);
        console.log(`[${providerId}] top1=${r.top1Hit ? "✅" : "❌"} top5=${r.top5Hit ? "✅" : "❌"}`);

        const s = summary[providerId];
        s.total += 1;
        s.ran += 1;
        s.top1 += r.top1Hit ? 1 : 0;
        s.top5 += r.top5Hit ? 1 : 0;
        s.avgContentHitRatio += r.contentHitRatio;
      } catch (e) {
        console.log(`[${providerId}] 失败：${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  console.log("\n=== 汇总 ===");
  for (const providerId of providers) {
    const s = summary[providerId];
    if (!s.ran) {
      console.log(`[${providerId}] 未运行（可能缺 key）`);
      continue;
    }
    console.log(
      `[${providerId}] Top1=${s.top1}/${s.total} Top5=${s.top5}/${s.total} 平均内容标题占比=${Math.round(
        (s.avgContentHitRatio / s.ran) * 100,
      )}%`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

