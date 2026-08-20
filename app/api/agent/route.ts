import { NextResponse } from "next/server";
import { applyAgentInterpretation } from "@/lib/agent";
import { parseWithDeepSeek } from "@/lib/deepseek-provider";
import type { StrategyContract } from "@/lib/strategy-domain";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { input?: unknown; contract?: unknown } | null;
  if (!body || typeof body.input !== "string" || !body.input.trim() || !body.contract || typeof body.contract !== "object") {
    return NextResponse.json({ error: "请求缺少有效的 input 或 contract" }, { status: 400 });
  }
  const input = body.input.trim().slice(0, 2000);
  const contract = body.contract as StrategyContract;

  try {
    const interpretation = await parseWithDeepSeek(contract, input);
    return NextResponse.json(applyAgentInterpretation(contract, input, interpretation, "deepseek"));
  } catch (error) {
    const fallback = applyAgentInterpretation(contract, input, undefined, "local_fallback");
    return NextResponse.json({
      ...fallback,
      fallbackReason: error instanceof Error ? error.message : "模型解析失败",
    });
  }
}
