import { createAgentPrompt, normalizeAgentInterpretation, type AgentInterpretation } from "./agent.ts";
import type { StrategyContract } from "./strategy-domain.ts";

type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
}

export async function parseWithDeepSeek(contract: StrategyContract, input: string): Promise<AgentInterpretation> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL;
  const model = process.env.DEEPSEEK_MODEL;
  if (!apiKey || !baseUrl || !model) throw new Error("DeepSeek 环境变量不完整");

  const response = await fetch(endpoint(baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "你是中文量化策略合同解析器。必须输出合法 JSON，并严格区分用户明确表达与系统默认值。" },
        { role: "user", content: createAgentPrompt(contract, input) },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`DeepSeek 请求失败：HTTP ${response.status}`);
  const payload = await response.json() as DeepSeekResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 返回内容为空");
  return normalizeAgentInterpretation(JSON.parse(content));
}
