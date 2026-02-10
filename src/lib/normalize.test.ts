import { describe, expect, it } from "vitest";

import { cleanupCandidateName, normalizeCandidateKey } from "./normalize";

describe("normalize", () => {
  it("cleanupCandidateName removes common suffixes", () => {
    expect(cleanupCandidateName("Hades - Steam")).toBe("Hades");
    expect(cleanupCandidateName("Celeste (video game) - Wikipedia")).toBe("Celeste");
  });

  it("normalizeCandidateKey normalizes casing and symbols", () => {
    expect(normalizeCandidateKey("  Hades™  ")).toBe("hades");
    expect(normalizeCandidateKey("The Legend of Zelda:  Breath   of  the Wild")).toBe(
      "the legend of zelda: breath of the wild",
    );
  });
});
