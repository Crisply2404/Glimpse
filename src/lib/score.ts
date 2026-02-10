import type { Candidate, Clue, ScoreBreakdownItem, SearchHit } from "@/lib/types";
import { clampText } from "@/lib/normalize";

function clueDelta(weight: number) {
  return Math.max(2, Math.min(12, weight * 3));
}

export function heuristicScoreCandidate(args: {
  query: string;
  clues: Clue[];
  candidateName: string;
  evidenceText: string;
}) {
  const breakdown: ScoreBreakdownItem[] = [];
  let score = 45;

  const base = `${args.candidateName}\n${args.evidenceText}\n${args.query}`.toLowerCase();

  for (const c of args.clues) {
    const t = c.text.toLowerCase();
    if (!t) continue;
    const hit = base.includes(t);
    const delta = clueDelta(c.weight) * (c.polarity === "negative" ? -1 : 1);
    if (hit) {
      score += delta;
      breakdown.push({
        clue: `${c.polarity === "negative" ? "不是" : "是"}：${c.text}`,
        delta,
        reason: `在证据摘要里能看到“${clampText(c.text, 30)}”相关内容。`,
      });
    } else if (c.polarity === "negative") {
      // 负向线索没命中，略微加分（说明没撞到“排除项”）
      score += 2;
      breakdown.push({
        clue: `不是：${c.text}`,
        delta: 2,
        reason: `证据里没有明显出现你要排除的“${clampText(c.text, 30)}”。`,
      });
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, breakdown };
}

export function flattenHitText(hits: SearchHit[], maxLen = 2200) {
  const text = hits
    .map((h) => `${h.title}\n${h.snippet}\n${h.url}`)
    .join("\n\n")
    .trim();
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1)}…`;
}

export function flattenEvidenceText(candidate: Candidate, maxLen = 1600) {
  const text = candidate.evidence
    .slice(0, 6)
    .map((e) => `${e.title ?? ""}\n${e.snippet}\n${e.url}`.trim())
    .join("\n\n")
    .trim();
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1)}…`;
}

