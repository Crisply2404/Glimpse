import { NextResponse } from "next/server";

import { parseRecallRequest } from "@/lib/schema";
import { runRecall } from "@/lib/pipeline";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = parseRecallRequest(json);
    const result = await runRecall(input);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    const status = message.includes("API key") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

