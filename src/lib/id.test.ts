import { describe, expect, it } from "vitest";

import { stableIdFromString } from "./id";

describe("id", () => {
  it("stableIdFromString is deterministic", () => {
    expect(stableIdFromString("x", "hello")).toBe(stableIdFromString("x", "hello"));
    expect(stableIdFromString("x", "hello")).not.toBe(stableIdFromString("x", "hello2"));
  });
});
