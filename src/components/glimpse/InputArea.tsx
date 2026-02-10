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
  const [clues, setClues] = useState<Clue[]>([]);
  const [newClueText, setNewClueText] = useState("");
  const [newClueDirection, setNewClueDirection] = useState<ClueDirection>(ClueDirection.INCLUDE);
  const [newClueStrength, setNewClueStrength] = useState(3);

  const canReplay = useMemo(
    () => clues.length > 0 && description.trim().length > 0,
    [clues.length, description],
  );

  function addClue() {
    if (!newClueText.trim()) return;
    const newClue: Clue = {
      id: randomId(),
      text: newClueText.trim(),
      direction: newClueDirection,
      strength: newClueStrength,
    };
    setClues((prev) => [...prev, newClue]);
    setNewClueText("");
  }

  function removeClue(id: string) {
    setClues((prev) => prev.filter((c) => c.id !== id));
  }

  function clearLocal() {
    setDescription("");
    setClues([]);
    setNewClueText("");
    setNewClueDirection(ClueDirection.INCLUDE);
    setNewClueStrength(3);
    onClear();
  }

  return (
    <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <i className="fa-solid fa-brain text-indigo-500"></i>
        Initial Impressions
      </h2>

      <textarea
        className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 min-h-[120px] focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-zinc-400"
        placeholder="比如：像素风、俯视角、打怪升级、可能是PC上的独立游戏…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={isProcessing}
      />

      <div className="mt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          Clue Management
        </h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {clues.map((clue) => (
            <div
              key={clue.id}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${
                clue.direction === ClueDirection.INCLUDE
                  ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
                  : "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
              }`}
            >
              <i
                className={`fa-solid ${
                  clue.direction === ClueDirection.INCLUDE ? "fa-plus" : "fa-minus"
                } text-[10px]`}
              ></i>
              <span>{clue.text}</span>
              <span className="opacity-60 text-[10px]">Lvl.{clue.strength}</span>
              <button
                onClick={() => removeClue(clue.id)}
                className="hover:text-zinc-900 dark:hover:text-white transition-colors"
                type="button"
                disabled={isProcessing}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          ))}
          {clues.length === 0 ? (
            <p className="text-sm text-zinc-400 italic">还没加线索也可以先试一把。</p>
          ) : null}
        </div>

        <div className="flex flex-col md:flex-row gap-3 items-end md:items-center">
          <div className="flex-1 w-full">
            <input
              type="text"
              placeholder="加一条更具体的线索（平台/年份/玩法/画风）…"
              className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              value={newClueText}
              onChange={(e) => setNewClueText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addClue();
                }
              }}
              disabled={isProcessing}
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setNewClueDirection(ClueDirection.INCLUDE)}
                className={`px-3 py-2 text-xs transition-colors ${
                  newClueDirection === ClueDirection.INCLUDE
                    ? "bg-green-500 text-white"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-700"
                }`}
                type="button"
                disabled={isProcessing}
              >
                Include
              </button>
              <button
                onClick={() => setNewClueDirection(ClueDirection.EXCLUDE)}
                className={`px-3 py-2 text-xs transition-colors ${
                  newClueDirection === ClueDirection.EXCLUDE
                    ? "bg-red-500 text-white"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-700"
                }`}
                type="button"
                disabled={isProcessing}
              >
                Exclude
              </button>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-500 uppercase font-bold text-center">
                Power: {newClueStrength}
              </span>
              <input
                type="range"
                min="1"
                max="5"
                value={newClueStrength}
                onChange={(e) => setNewClueStrength(parseInt(e.target.value))}
                className="w-24 accent-indigo-500"
                disabled={isProcessing}
              />
            </div>
            <button
              onClick={addClue}
              className="bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-lg px-4 py-2 text-sm font-bold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
              disabled={isProcessing}
              type="button"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 flex gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <button
          onClick={() => onStart(description, clues)}
          disabled={isProcessing || !description.trim()}
          className="flex-1 bg-indigo-600 text-white rounded-xl py-3 font-bold hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
          type="button"
        >
          <i className="fa-solid fa-magnifying-glass mr-2"></i>
          Start Recovery
        </button>
        <button
          onClick={clearLocal}
          disabled={isProcessing}
          className="px-6 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          type="button"
        >
          Clear
        </button>
        <button
          onClick={() => onStart(description, clues)}
          disabled={isProcessing || !canReplay}
          className="px-6 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          type="button"
        >
          Replay
        </button>
      </div>
    </div>
  );
}

