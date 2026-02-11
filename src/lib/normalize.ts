export function normalizeTitle(input: string) {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[™®]/g, "")
    .replace(/["“”]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s*:\s*/g, ": ")
    .toLowerCase();
}

export function cleanupCandidateName(raw: string) {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[™®]/g, "")
    .replace(/\s*-\s*apps\s+on\s+google\s+play\b.*$/i, "")
    .replace(/\s*-\s*google\s+play\b.*$/i, "")
    .replace(/\s*-\s*app\s+store\b.*$/i, "")
    .replace(/\s+on\s+(steam|the app store|app store|google play)\b.*$/i, "")
    .replace(/\s*-\s*(steam|wikipedia|wiki|ign|fandom|gamefaqs|metacritic|youtube).*$/i, "")
    .replace(/\s*\(.*?\)\s*$/g, "")
    .trim();
}

export function normalizeCandidateKey(name: string) {
  return normalizeTitle(cleanupCandidateName(name))
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9\u4e00-\u9fff: ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function clampText(input: string, maxLen: number) {
  const text = input.trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}
