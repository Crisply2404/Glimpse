"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  Candidate as UiCandidate,
  Clue as UiClue,
  SearchEvent as UiEvent,
  SearchState,
  UiPhase,
} from "./types";
import { ClueDirection } from "./types";

import Header from "./Header";
import InputArea from "./InputArea";
import Visualizer from "./Visualizer";
import Results from "./Results";
import GachaMachine from "./GachaMachine";

import type { RecallResponse } from "@/lib/types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toTimestamp(input: string | number) {
  if (typeof input === "number") return input;
  const t = Date.parse(input);
  return Number.isFinite(t) ? t : Date.now();
}

function phaseFromBackend(p: RecallResponse["events"][number]["phase"]): UiPhase {
  switch (p) {
    case "search":
    case "extract":
      return "searching";
    case "filter":
      return "filtering";
    case "score":
      return "reasoning";
    case "gacha":
      return "gacha";
    case "error":
    default:
      return "idle";
  }
}

function iconForCandidate(id: string, name: string) {
  const seed = encodeURIComponent(`${id}:${name}`.slice(0, 60));
  return `https://picsum.photos/seed/${seed}/200/200`;
}

function mapBackendToUiCandidates(res: RecallResponse): UiCandidate[] {
  return (res.candidates ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.imageUrl ?? iconForCandidate(c.id, c.name),
    totalScore: c.score,
    isEliminated: false,
    breakdown: (c.scoreBreakdown ?? []).map((b) => ({
      clueText: b.clue,
      scoreChange: b.delta,
      reason: b.reason,
      link: b.evidenceUrl,
    })),
    evidence: (c.evidence ?? []).map((e) => ({
      title: e.title ?? "来源",
      summary: e.snippet,
      url: e.url,
    })),
  }));
}

function buildEventDescription(evt: RecallResponse["events"][number]) {
  if (evt.phase === "search" && evt.payload && typeof evt.payload === "object") {
    const p = evt.payload as any;
    const q = Array.isArray(p.queries) ? p.queries.length : undefined;
    const hits = Array.isArray(p.hits) ? p.hits.length : undefined;
    if (q && hits) return `搜了 ${q} 轮，先捞回 ${hits} 条网页线索。`;
  }
  if (evt.phase === "extract" && evt.payload && typeof evt.payload === "object") {
    const p = evt.payload as any;
    const n = Array.isArray(p.candidates) ? p.candidates.length : undefined;
    if (n) return `从网页摘要里提炼出 ${n} 个候选。`;
  }
  if (evt.phase === "filter" && evt.payload && typeof evt.payload === "object") {
    const p = evt.payload as any;
    const kept = Array.isArray(p.kept) ? p.kept.length : undefined;
    const dropped = Array.isArray(p.dropped) ? p.dropped.length : undefined;
    if (kept !== undefined && dropped !== undefined) return `保留 ${kept} 个，淘汰 ${dropped} 个。`;
  }
  if (evt.phase === "score") return "结合你的线索 + 证据链接，重新排序。";
  if (evt.phase === "gacha") return "准备掉落结果（Top5）。";
  return "";
}

function applyEliminationFromFilterPayload(candidates: UiCandidate[], payload: unknown): UiCandidate[] {
  if (!payload || typeof payload !== "object") return candidates;
  const p = payload as any;
  const dropped = Array.isArray(p.dropped) ? p.dropped : [];
  const kept = Array.isArray(p.kept) ? p.kept : [];
  const droppedIds = new Set(dropped.map((x: any) => String(x?.id ?? "")));
  const keptIds = new Set(kept.map((x: any) => String(x?.id ?? "")));

  if (droppedIds.size === 0 && keptIds.size === 0) return candidates;

  return candidates.map((c) => {
    if (keptIds.has(c.id)) return { ...c, isEliminated: false };
    if (droppedIds.has(c.id)) return { ...c, isEliminated: true };
    return c;
  });
}

function sortByScore(candidates: UiCandidate[]) {
  return [...candidates].sort(
    (a, b) => b.totalScore - a.totalScore || a.name.localeCompare(b.name),
  );
}

type RecallStreamMessage =
  | { type: "event"; event: RecallResponse["events"][number] }
  | { type: "candidates"; candidates: RecallResponse["candidates"] }
  | { type: "warning"; warning: string }
  | { type: "done"; response: RecallResponse }
  | { type: "error"; error: string };

function mergeCandidatesKeepingElimination(prev: UiCandidate[], next: UiCandidate[]) {
  const prevMap = new Map(prev.map((c) => [c.id, c]));
  return next.map((c) => {
    const old = prevMap.get(c.id);
    return { ...c, isEliminated: old?.isEliminated ?? false };
  });
}

export default function GlimpseApp() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [state, setState] = useState<SearchState>({
    isProcessing: false,
    currentPhase: "idle",
    events: [],
    candidates: [],
    visibleResults: [],
    warnings: [],
  });

  const activeRunRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const clearAll = useCallback(() => {
    activeRunRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setState({
      isProcessing: false,
      currentPhase: "idle",
      events: [],
      candidates: [],
      visibleResults: [],
      warnings: [],
    });
  }, []);

  const runSearchSequence = useCallback(
    async (description: string, clues: UiClue[]) => {
      if (state.isProcessing) return;
      const runToken = activeRunRef.current + 1;
      activeRunRef.current = runToken;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        isProcessing: true,
        currentPhase: "searching",
        events: [
          {
            id: `start-${Date.now()}`,
            title: "已开始",
            description: "正在从全网找线索…（现在是流式更新，不会卡住等很久）",
            phase: "searching",
            timestamp: Date.now(),
          },
        ],
        candidates: [],
        visibleResults: [],
        warnings: [],
      });

      const payloadClues = clues.map((c) => ({
        text: c.text,
        polarity: c.direction === ClueDirection.EXCLUDE ? ("negative" as const) : ("positive" as const),
        weight: c.strength,
      }));

      const payload = {
        query: description,
        clues: payloadClues,
        options: { topK: 5, stages: 3, maxQueries: 5, maxSearchResultsPerQuery: 8, maxCandidates: 25 },
      };

      const replayFromResponse = async (res: RecallResponse) => {
        const uiCandidates = mapBackendToUiCandidates(res);
        setState((prev) => ({
          ...prev,
          candidates: mergeCandidatesKeepingElimination(prev.candidates, uiCandidates),
          warnings: res.warnings ?? [],
        }));

        const uiEvents: UiEvent[] = [];
        const events = res.events ?? [];

        for (let i = 0; i < events.length; i++) {
          if (activeRunRef.current !== runToken) return;
          const evt = events[i];

          await delay(900);

          const uiEvt: UiEvent = {
            id: evt.id,
            title: evt.message,
            description: buildEventDescription(evt),
            phase: phaseFromBackend(evt.phase),
            timestamp: toTimestamp(evt.timestamp),
          };

          uiEvents.push(uiEvt);

          setState((prev) => {
            const nextCandidates =
              evt.phase === "filter"
                ? applyEliminationFromFilterPayload(prev.candidates, evt.payload)
                : prev.candidates;
            return {
              ...prev,
              events: [...uiEvents],
              currentPhase: uiEvt.phase,
              candidates: nextCandidates,
            };
          });

          if (evt.phase === "gacha") break;
        }
      };

      const fail = (message: string) => {
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          currentPhase: "idle",
          events: [
            ...prev.events,
            {
              id: `error-${Date.now()}`,
              title: "请求失败",
              description: message,
              phase: "idle",
              timestamp: Date.now(),
            },
          ],
        }));
      };

      try {
        const httpRes = await fetch("/api/recall/stream", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!httpRes.ok || !httpRes.body) {
          // 流式接口不可用就回退到老接口（保证 Demo 能跑）
          const fallbackRes = await fetch("/api/recall", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          const fallbackJson = (await fallbackRes.json().catch(() => ({}))) as any;
          if (!fallbackRes.ok) {
            throw new Error(fallbackJson?.error ? String(fallbackJson.error) : `请求失败（${fallbackRes.status}）`);
          }
          await replayFromResponse(fallbackJson as RecallResponse);
          return;
        }

        const reader = httpRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let msg: RecallStreamMessage;
            try {
              msg = JSON.parse(trimmed) as RecallStreamMessage;
            } catch {
              continue;
            }

            if (activeRunRef.current !== runToken) return;

            if (msg.type === "candidates") {
              const next = mapBackendToUiCandidates({ runId: "stream", events: [], candidates: msg.candidates });
              setState((prev) => ({
                ...prev,
                candidates: mergeCandidatesKeepingElimination(prev.candidates, next),
              }));
              continue;
            }

            if (msg.type === "warning") {
              setState((prev) => ({ ...prev, warnings: [...prev.warnings, msg.warning] }));
              continue;
            }

            if (msg.type === "event") {
              const evt = msg.event;
              const uiEvt: UiEvent = {
                id: evt.id,
                title: evt.message,
                description: buildEventDescription(evt),
                phase: phaseFromBackend(evt.phase),
                timestamp: toTimestamp(evt.timestamp),
              };

              setState((prev) => {
                const nextCandidates =
                  evt.phase === "filter"
                    ? applyEliminationFromFilterPayload(prev.candidates, evt.payload)
                    : prev.candidates;
                return {
                  ...prev,
                  events: [...prev.events, uiEvt],
                  currentPhase: uiEvt.phase,
                  candidates: nextCandidates,
                };
              });
              continue;
            }

            if (msg.type === "done") {
              setState((prev) => ({
                ...prev,
                warnings: msg.response.warnings ?? prev.warnings,
              }));
              continue;
            }

            if (msg.type === "error") {
              throw new Error(msg.error || "后端返回错误");
            }
          }
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        if (activeRunRef.current !== runToken) return;
        const message = e instanceof Error ? e.message : "未知错误";
        fail(message);
      }
    },
    [state.isProcessing],
  );

  const rankedActiveCandidates = useMemo(() => {
    return sortByScore(state.candidates).filter((c) => !c.isEliminated);
  }, [state.candidates]);

  const handleReveal = useCallback(() => {
    setState((prev) => {
      const active = sortByScore(prev.candidates).filter((c) => !c.isEliminated);
      const top5 = active.slice(0, 5);
      const currentlyRevealed = prev.visibleResults.length;
      if (currentlyRevealed >= top5.length) {
        return { ...prev, isProcessing: false, currentPhase: "complete" };
      }
      return { ...prev, visibleResults: [...prev.visibleResults, top5[currentlyRevealed].id] };
    });
  }, []);

  return (
    <div className="min-h-screen pb-20 selection:bg-indigo-100 selection:text-indigo-900 transition-colors duration-300 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <Header theme={theme} onToggleTheme={toggleTheme} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 space-y-12">
        <section className="text-center space-y-4">
          <h1 className="text-4xl md:text-6xl font-black tracking-tight">
            Find the <span className="text-indigo-600 dark:text-indigo-400">Lost</span> In Your Mind
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto text-lg">
            输入模糊印象，我们会从全网找线索，把筛选过程演出来，最后用“扭蛋”掉出最可能的 Top 结果。
          </p>

          {state.warnings.length ? (
            <div className="max-w-2xl mx-auto text-left text-sm bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
              <div className="font-bold mb-2 text-zinc-600 dark:text-zinc-300">提示</div>
              <ul className="list-disc pl-5 text-zinc-500 dark:text-zinc-400 space-y-1">
                {state.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section>
          <InputArea onStart={runSearchSequence} onClear={clearAll} isProcessing={state.isProcessing} />
        </section>

        <section className="pt-10 border-t border-zinc-100 dark:border-zinc-800">
          <Visualizer events={state.events} candidates={state.candidates} currentPhase={state.currentPhase} />
        </section>

        {state.currentPhase === "gacha" || state.currentPhase === "complete" ? (
          <section className="flex justify-center">
            <GachaMachine
              isRolling={state.currentPhase === "gacha"}
              onReveal={handleReveal}
              revealedCount={state.visibleResults.length}
              totalToReveal={Math.min(5, rankedActiveCandidates.length)}
            />
          </section>
        ) : null}

        <section>
          <Results candidates={state.candidates} revealedIds={state.visibleResults} />
        </section>
      </main>

      <footer className="mt-20 border-t border-zinc-100 dark:border-zinc-800 py-10 text-center text-zinc-400 text-sm">
        <p>© 2026 Glimpse Engine • Powered by Fragmented Memories</p>
      </footer>
    </div>
  );
}
