import { z } from "zod";

import type { RecallRequest } from "@/lib/types";

const clueSchema = z.object({
  text: z.string().trim().min(1).max(120),
  polarity: z.enum(["positive", "negative"]).default("positive"),
  weight: z.number().int().min(1).max(5).default(3),
});

const optionsSchema = z
  .object({
    topK: z.number().int().min(1).max(10).optional(),
    stages: z.number().int().min(1).max(6).optional(),
    maxSearchResultsPerQuery: z.number().int().min(3).max(15).optional(),
    maxQueries: z.number().int().min(1).max(8).optional(),
    maxCandidates: z.number().int().min(5).max(40).optional(),
    enrichEvidence: z.boolean().optional(),
  })
  .optional();

const recallRequestSchema = z.object({
  query: z.string().trim().min(1).max(500),
  clues: z.array(clueSchema).max(20).default([]),
  options: optionsSchema,
});

export function parseRecallRequest(input: unknown): RecallRequest {
  return recallRequestSchema.parse(input);
}
