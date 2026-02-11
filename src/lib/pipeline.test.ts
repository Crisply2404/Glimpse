import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runRecall } from "./pipeline";

function jsonOk(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("pipeline", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.TAVILY_API_KEY = "test-tavily";
    process.env.OPENAI_API_KEY = "test-openai";
    process.env.OPENAI_MODEL = "test-model";
    delete process.env.OPENAI_BASE_URL;
    process.env.SEARCH_PROVIDER = "tavily";

    globalThis.fetch = vi.fn(async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : String(input?.url ?? "");

      if (url.includes("api.tavily.com/search")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const q = String(body?.query ?? "");

        if (q.includes("TEST_VIDEO_LISTICLE") || q.includes("TEST_AUTOEXPAND_OFF")) {
          return jsonOk({
            results: [
              {
                title: "Animal Online: Cat Hunt - Apps on Google Play",
                url: "https://play.google.com/store/apps/details?id=com.example.animalcat",
                content: "A cat role-playing game with online elements. Open world adventure.",
                score: 0.8,
              },
              {
                title: "Cat Quest on Steam",
                url: "https://store.steampowered.com/app/593280/Cat_Quest/",
                content: "Cat Quest is an open world action RPG.",
                score: 0.75,
              },
              {
                title: "Cat Quest (Full Game)",
                url: "https://www.dailymotion.com/video/x123456",
                content: "A full game video upload.",
                score: 0.6,
              },
              {
                title: "60+ Games Like Survival RPG: Open World Pixel",
                url: "https://example.com/games-like-survival-rpg",
                content: "A listicle page with lots of suggestions.",
                score: 0.55,
              },
              {
                title: "10 INSANE Games where YOU PLAY AS ANIMAL (Gameplay)",
                url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
                content: "A gameplay compilation video.",
                score: 0.5,
              },
            ],
          });
        }

        return jsonOk({
          results: [
            {
              title: "Puddle+ on Steam",
              url: "https://store.steampowered.com/app/12345/PuddlePlus/",
              content: "Puddle+ is a physics puzzle game. Tilt controls the liquid in the game.",
              score: 0.92,
            },
            {
              title: "Totally Unrelated Walkthrough",
              url: "https://example.com/walkthrough",
              content: "Walkthrough guide and tips and tricks.",
              score: 0.2,
            },
            {
              title: "Other Physics Puzzle Game",
              url: "https://store.steampowered.com/app/55555/OtherGame/",
              content: "A physics puzzle video game with liquid mechanics.",
              score: 0.5,
            },
            {
              title: "Puddle+ iOS App Store",
              url: "https://apps.apple.com/us/app/puddle/id999999999",
              content: "Puddle+ on the App Store. Requires iOS.",
              score: 0.6,
            },
            {
              title: "Puddle+ Android Google Play",
              url: "https://play.google.com/store/apps/details?id=com.example.puddleplus",
              content: "Puddle+ on Google Play. Requires Android.",
              score: 0.6,
            },
          ],
        });
      }

      if (url.endsWith("/v1/chat/completions")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const system = String(body?.messages?.[0]?.content ?? "");

        if (system.includes("搜索专家")) {
          return jsonOk({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    queries: [
                      "tilt liquid physics puzzle game",
                      "tilt liquid puzzle iOS App Store game",
                      "liquid physics puzzle Android Google Play game",
                      "Puddle+ game",
                      "Puddle+ Steam game",
                    ],
                  }),
                },
              },
            ],
          });
        }

        if (system.includes("信息提炼助手")) {
          return jsonOk({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    candidates: [
                      {
                        name: "Puddle+",
                        altNames: ["Puddle Plus"],
                        evidence: [
                          {
                            url: "https://store.steampowered.com/app/12345/PuddlePlus/",
                            title: "Puddle+ on Steam",
                            snippet: "Puddle+ is a physics puzzle game. Tilt controls the liquid in the game.",
                          },
                        ],
                      },
                      {
                        name: "Other Game",
                        evidence: [
                          {
                            url: "https://store.steampowered.com/app/55555/OtherGame/",
                            title: "Other Physics Puzzle Game",
                            snippet: "A physics puzzle video game with liquid mechanics.",
                          },
                        ],
                      },
                    ],
                  }),
                },
              },
            ],
          });
        }

        if (system.includes("评分助手")) {
          // 刻意不给 evidenceQuote，用来验证“非0分必须有可验证引用”的约束会生效
          return jsonOk({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    scored: [
                      {
                        name: "Puddle+",
                        score: 92,
                        scoreBreakdown: [
                          {
                            clue: "玩法匹配",
                            delta: 18,
                            reason: "你说的“倾斜控制液体”在摘要里能直接看到。",
                            evidenceUrl: "https://store.steampowered.com/app/12345/PuddlePlus/",
                            evidenceQuote: "Tilt controls the liquid",
                          },
                          {
                            clue: "平台判断",
                            delta: -8,
                            reason: "看到 Steam 页面，所以更像 PC 平台。",
                            evidenceUrl: "https://store.steampowered.com/app/12345/PuddlePlus/",
                          },
                        ],
                      },
                    ],
                  }),
                },
              },
            ],
          });
        }

        return jsonOk({ choices: [{ message: { content: JSON.stringify({}) } }] });
      }

      return new Response("not mocked", { status: 404 });
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("非0分的理由必须带可验证引用（否则自动降为 0 分）", async () => {
    const res = await runRecall({
      query: "我只记得是一个靠重力/倾斜控制液体的解谜手游",
      clues: [
        { text: "倾斜/重力控制", polarity: "positive", weight: 4 },
        { text: "液体/水", polarity: "positive", weight: 4 },
        { text: "手机", polarity: "positive", weight: 3 },
      ],
      options: {
        topK: 5,
        maxQueries: 5,
        maxSearchResultsPerQuery: 5,
        maxCandidates: 25,
      },
    });

    expect(res.candidates.length).toBeGreaterThan(0);
    expect(res.candidates[0]?.name.toLowerCase()).toContain("puddle");

    const breakdown = res.candidates[0]?.scoreBreakdown ?? [];
    // 断言：任何 delta != 0 都必须有 evidenceQuote（否则应被降为 0）
    for (const b of breakdown) {
      if (b.delta !== 0) {
        expect(b.evidenceQuote).toBeTruthy();
        expect(b.evidenceUrl).toBeTruthy();
      }
    }

    // 断言：我们故意造的“Steam=PC”那条，因为缺 quote，会被降为 0 并提示证据不足
    const platformLine = breakdown.find((b) => b.clue.includes("平台"));
    expect(platformLine?.delta).toBe(0);
    expect(platformLine?.reason).toContain("证据不足");
  });

  it("不会把视频/榜单标题当成游戏候选", async () => {
    process.env.OPENAI_API_KEY = "";

    const res = await runRecall({
      query: "TEST_VIDEO_LISTICLE 我只记得是个猫的开放世界手游，有点像 MMO",
      clues: [{ text: "猫", polarity: "positive", weight: 3 }],
      options: {
        topK: 5,
        maxQueries: 2,
        maxSearchResultsPerQuery: 5,
        maxCandidates: 25,
        enrichEvidence: false,
      },
    });

    expect(res.candidates.length).toBeGreaterThan(0);

    const badName = /(top\s*\d+|best\s*\d+|games like|gameplay|walkthrough|guide|盘点|推荐|合集|攻略)/i;
    for (const c of res.candidates) {
      expect(badName.test(c.name)).toBe(false);
      for (const ev of c.evidence ?? []) {
        expect(ev.url.includes("youtube.com")).toBe(false);
        expect(ev.url.includes("youtube-nocookie.com")).toBe(false);
        expect(ev.url.includes("bilibili.com")).toBe(false);
        expect(ev.url.includes("dailymotion.com")).toBe(false);
      }
    }
  });

  it("不会触发额外追加搜索（只跑初始 maxQueries 轮）", async () => {
    process.env.OPENAI_API_KEY = "";

    const res = await runRecall({
      query: "TEST_AUTOEXPAND_OFF 我只记得是个猫的开放世界手游，有点像 MMO",
      clues: [],
      options: {
        topK: 5,
        maxQueries: 2,
        maxSearchResultsPerQuery: 5,
        maxCandidates: 25,
        enrichEvidence: false,
      },
    });

    const fetchCalls = (globalThis.fetch as any).mock.calls as Array<[any, any]>;
    const tavilyCalls = fetchCalls.filter(([input]) => String(typeof input === "string" ? input : input?.url ?? "").includes("api.tavily.com/search"));

    const queryEvt = res.events.find((e) => e.message.includes("搜索词已就绪"));
    const queryLen = Array.isArray((queryEvt as any)?.payload?.queries) ? (queryEvt as any).payload.queries.length : undefined;

    if (typeof queryLen === "number") {
      expect(tavilyCalls.length).toBe(queryLen);
    } else {
      expect(tavilyCalls.length).toBeLessThanOrEqual(2);
    }

    expect(res.events.some((e) => e.message.startsWith("补搜（"))).toBe(false);
    expect(res.events.some((e) => e.message.includes("补证据"))).toBe(false);
  });
});
