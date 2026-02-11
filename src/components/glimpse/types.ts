export enum ClueDirection {
  INCLUDE = "include",
  EXCLUDE = "exclude",
}

export type Clue = {
  id: string;
  text: string;
  direction: ClueDirection;
  strength: number; // 1-5
};

export type UiPhase = "idle" | "searching" | "filtering" | "reasoning" | "gacha" | "complete";

export type SearchEvent = {
  id: string;
  title: string;
  description: string;
  phase: UiPhase;
  timestamp: number;
};

export type ScoreBreakdown = {
  clueText: string;
  scoreChange: number;
  reason: string;
  link?: string;
  quote?: string;
};

export type Evidence = {
  title: string;
  summary: string;
  url: string;
};

export type Candidate = {
  id: string;
  name: string;
  icon: string;
  iconSourceUrl?: string;
  totalScore: number;
  isEliminated: boolean;
  breakdown: ScoreBreakdown[];
  evidence: Evidence[];
};

export type SearchState = {
  isProcessing: boolean;
  currentPhase: UiPhase;
  events: SearchEvent[];
  candidates: Candidate[];
  visibleResults: string[];
  warnings: string[];
};
