"use client";

import React, { useMemo, useState } from "react";

import { Clue, ClueDirection } from "./types";

interface InputAreaProps {
  onStart: (description: string, clues: Clue[]) => void;
  onClear: () => void;
  isProcessing: boolean;
}

function randomId() {
  return Math.random().toString(36).slice(2, 11);
}

export default function InputArea({ onStart, onClear, isProcessing }: InputAreaProps) {
  const [description, setDescription] = useState("");
  const [mustInclude, setMustInclude] = useState("");
  const [mustExclude, setMustExclude] = useState("");
  const [remember, setRemember] = useState("");

  const canReplay = useMemo(() => {
    const hasAdvanced = Boolean(mustInclude.trim() || mustExclude.trim() || remember.trim());
    return description.trim().length > 0 && hasAdvanced;
  }, [description, mustInclude, mustExclude, remember]);

  function splitClueText(input: string) {
    return input
      .split(/[\n,，;；、]+/g)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function buildClues(): Clue[] {
    const includeTokens = splitClueText(mustInclude);
    const excludeTokens = splitClueText(mustExclude);
    const rememberText = remember.trim();

    const out: Clue[] = [];
    for (const t of includeTokens) {
      out.push({ id: randomId(), text: t, direction: ClueDirection.INCLUDE, strength: 4 });
    }
    for (const t of excludeTokens) {
      out.push({ id: randomId(), text: t, direction: ClueDirection.EXCLUDE, strength: 4 });
    }
    if (rememberText) {
      out.push({ id: randomId(), text: rememberText, direction: ClueDirection.INCLUDE, strength: 3 });
    }

    return out.slice(0, 20);
  }

  function clearLocal() {
    setDescription("");
    setMustInclude("");
    setMustExclude("");
    setRemember("");
    onClear();
  }

  return (
    <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <i className="fa-solid fa-brain text-indigo-500"></i>
        模糊印象
      </h2>

      <textarea
        className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 min-h-[120px] focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-zinc-400"
        placeholder="比如：我记得界面长这样/大概怎么用/在哪见过/什么时候见过…（越具体越好）"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={isProcessing}
      />

      <div className="mt-6">
        <details className="bg-white/60 dark:bg-zinc-950/20 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
          <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-600 dark:text-zinc-300">
            高级条件（可选）
            <span className="ml-2 text-xs font-normal text-zinc-400">
              不填也能跑；填了会筛得更严
            </span>
          </summary>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-zinc-500">一定包含</label>
              <input
                type="text"
                className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="比如：重力/倾斜，液体，像素风（可用逗号分隔）"
                value={mustInclude}
                onChange={(e) => setMustInclude(e.target.value)}
                disabled={isProcessing}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-zinc-500">一定不包含</label>
              <input
                type="text"
                className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="比如：不是跑酷，不是恐怖（可用逗号分隔）"
                value={mustExclude}
                onChange={(e) => setMustExclude(e.target.value)}
                disabled={isProcessing}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-zinc-500">我记得在…</label>
              <input
                type="text"
                className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="比如：2012 年左右 / 手机上 / iOS / 在地铁里玩过"
                value={remember}
                onChange={(e) => setRemember(e.target.value)}
                disabled={isProcessing}
              />
            </div>
          </div>
        </details>
      </div>

      <div className="mt-8 flex gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <button
          onClick={() => onStart(description, buildClues())}
          disabled={isProcessing || !description.trim()}
          className="flex-1 bg-indigo-600 text-white rounded-xl py-3 font-bold hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
          type="button"
        >
          <i className="fa-solid fa-magnifying-glass mr-2"></i>
          开始
        </button>
        <button
          onClick={clearLocal}
          disabled={isProcessing}
          className="px-6 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          type="button"
        >
          清空
        </button>
        <button
          onClick={() => onStart(description, buildClues())}
          disabled={isProcessing || !canReplay}
          className="px-6 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          type="button"
        >
          再跑一次
        </button>
      </div>
    </div>
  );
}
