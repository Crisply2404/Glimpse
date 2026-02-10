export type CluePolarity = "positive" | "negative";

export type Clue = {
  text: string;
  polarity: CluePolarity;
  weight: number;
};

export type RecallOptions = {
  topK?: number;
  stages?: number;
  maxSearchResultsPerQuery?: number;
  maxQueries?: number;
  maxCandidates?: number;
};

export type RecallRequest = {
  query: string;
  clues: Clue[];
  options?: RecallOptions;
};

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
  score?: number;
  sourceQuery: string;
  rank: number;
};

export type Evidence = {
  url: string;
  snippet: string;
  title?: string;
};

export type ScoreBreakdownItem = {
  clue: string;
  delta: number;
  reason: string;
  evidenceUrl?: string;
};

export type Candidate = {
  id: string;
  name: string;
  altNames?: string[];
  imageUrl?: string;
  imageSourceUrl?: string;
  score: number;
  scoreBreakdown: ScoreBreakdownItem[];
  evidence: Evidence[];
};

export type PipelinePhase = "search" | "extract" | "filter" | "score" | "gacha" | "error";

export type PipelineEvent = {
  id: string;
  phase: PipelinePhase;
  message: string;
  timestamp: string;
  payload?: unknown;
};

export type RecallResponse = {
  runId: string;
  events: PipelineEvent[];
  candidates: Candidate[];
  warnings?: string[];
};
