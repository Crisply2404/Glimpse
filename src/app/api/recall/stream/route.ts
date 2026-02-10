import { NextResponse } from "next/server";

import { runRecall } from "@/lib/pipeline";
import { parseRecallRequest } from "@/lib/schema";
import type { Candidate, PipelineEvent, RecallResponse } from "@/lib/types";

export const runtime = "nodejs";

type StreamMessage =
  | { type: "event"; event: PipelineEvent }
  | { type: "candidates"; candidates: Candidate[] }
  | { type: "warning"; warning: string }
  | { type: "done"; response: RecallResponse }
  | { type: "error"; error: string };

function errorToMessage(e: unknown) {
  return e instanceof Error ? e.message : "未知错误";
}

export async function POST(req: Request) {
  let input;
  try {
    const json = await req.json();
    input = parseRecallRequest(json);
  } catch (e) {
    return NextResponse.json({ error: errorToMessage(e) }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (msg: StreamMessage) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(msg)}\n`));
      };

      (async () => {
        try {
          const response = await runRecall(input, {
            onEvent: async (event) => send({ type: "event", event }),
            onCandidates: async (candidates) => send({ type: "candidates", candidates }),
            onWarning: async (warning) => send({ type: "warning", warning }),
          });
          send({ type: "done", response });
        } catch (e) {
          send({ type: "error", error: errorToMessage(e) });
        } finally {
          controller.close();
        }
      })().catch((e) => {
        send({ type: "error", error: errorToMessage(e) });
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

