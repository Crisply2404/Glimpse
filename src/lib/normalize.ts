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
    .replace(/\s*-\s*(steam|wikipedia|wiki|ign|fandom|gamefaqs|metacritic|youtube).*$/i, "")
    .replace(/\s*\(.*?\)\s*$/g, "")
    .trim();
}

export function normalizeCandidateKey(name: string) {
  return normalizeTitle(cleanupCandidateName(name))
    .replace(/[^a-z0-9\u4e00-\u9fff: ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function clampText(input: string, maxLen: number) {
  const text = input.trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}
