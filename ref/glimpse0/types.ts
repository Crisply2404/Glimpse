
export enum ClueDirection {
  INCLUDE = 'include',
  EXCLUDE = 'exclude'
}

export interface Clue {
  id: string;
  text: string;
  direction: ClueDirection;
  strength: number; // 1-5
}

export enum Phase {
  IDLE = 'idle',
  SEARCHING = 'searching',
  FILTERING = 'filtering',
  REASONING = 'reasoning',
  GACHA = 'gacha',
  COMPLETE = 'complete'
}

export interface SearchEvent {
  id: string;
  title: string;
  description: string;
  phase: Phase;
  timestamp: number;
}

export interface ScoreBreakdown {
  clueText: string;
  scoreChange: number;
  reason: string;
  link?: string;
}

export interface Evidence {
  title: string;
  summary: string;
  url: string;
}

export interface Candidate {
  id: string;
  name: string;
  icon: string;
  totalScore: number;
  isEliminated: boolean;
  breakdown: ScoreBreakdown[];
  evidence: Evidence[];
}

export interface SearchState {
  isProcessing: boolean;
  currentPhase: Phase;
  events: SearchEvent[];
  candidates: Candidate[];
  visibleResults: string[]; // IDs of candidates revealed by Gacha
}
