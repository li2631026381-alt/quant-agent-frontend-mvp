import {
  applyNaturalLanguage,
  detectContractConflicts,
  getNextQuestion,
  strategyTemplates,
  switchStrategyTemplate,
  updateContractField,
  type ContractChange,
  type ContractFieldKey,
  type StrategyContract,
  type StrategyType,
} from "./strategy-domain.ts";

export type AgentPatch = {
  fieldKey: ContractFieldKey;
  value: string;
  evidence?: string;
  confidence?: number;
};

export type AgentInterpretation = {
  strategyType?: StrategyType;
  patches: AgentPatch[];
  summary?: string;
  nextQuestion?: {
    fieldKey: ContractFieldKey;
    prompt: string;
    recommendedValue: string;
    explanation: string;
  };
};

export type AgentTurnResult = {
  contract: StrategyContract;
  recognized: string[];
  changedFields: ContractChange[];
  templateChanged: boolean;
  provider: "deepseek" | "local_fallback";
  summary: string;
  nextQuestion: ReturnType<typeof getNextQuestion>;
};

const validStrategyTypes = new Set<StrategyType>(["multi_factor", "timing", "rotation"]);

function canonicalPatchValue(key: ContractFieldKey, value: string): string {
  const compact = value.trim().replace(/\s+/g, " ");
  if (key === "rebalanceFrequency") {
    if (/每?周|周度/.test(compact)) return "每周";
    if (/每?月|月度/.test(compact)) return "每月";
    if (/每?季|季度/.test(compact)) return "每季度";
  }
  if (key === "market" && /A\s*股|中国股票/.test(compact)) return "A 股";
  if (key === "universe") {
    if (/沪深\s*300/.test(compact)) return "沪深 300";
    if (/中证\s*500/.test(compact)) return "中证 500";
    if (/全\s*A\s*股/.test(compact)) return "全 A 股";
  }
  if (key === "executionTiming") {
    if (/当日|当天/.test(compact) && /收盘/.test(compact)) return "当日收盘成交";
    if (/下一交易日|次日|第二天/.test(compact) && /开盘/.test(compact)) return "收盘生成信号，下一交易日开盘执行";
    if (/下一交易日|次日/.test(compact) && /收盘/.test(compact)) return "下一交易日收盘执行";
  }
  return compact;
}

function patchSource(contract: StrategyContract, key: ContractFieldKey): "user" | "user_override" {
  const current = contract.fields[key];
  return !current?.value || current.source === "pending" ? "user" : "user_override";
}

export function normalizeAgentInterpretation(value: unknown): AgentInterpretation {
  if (!value || typeof value !== "object") return { patches: [] };
  const raw = value as Record<string, unknown>;
  const strategyType = typeof raw.strategyType === "string" && validStrategyTypes.has(raw.strategyType as StrategyType)
    ? raw.strategyType as StrategyType
    : undefined;
  const patches = Array.isArray(raw.patches)
    ? raw.patches.flatMap((item): AgentPatch[] => {
        if (!item || typeof item !== "object") return [];
        const patch = item as Record<string, unknown>;
        if (typeof patch.fieldKey !== "string" || typeof patch.value !== "string" || !patch.value.trim()) return [];
        return [{
          fieldKey: patch.fieldKey as ContractFieldKey,
          value: canonicalPatchValue(patch.fieldKey as ContractFieldKey, patch.value).slice(0, 160),
          evidence: typeof patch.evidence === "string" ? patch.evidence.slice(0, 160) : undefined,
          confidence: typeof patch.confidence === "number" ? Math.max(0, Math.min(1, patch.confidence)) : undefined,
        }];
      })
    : [];
  const rawQuestion = raw.nextQuestion && typeof raw.nextQuestion === "object" ? raw.nextQuestion as Record<string, unknown> : undefined;
  const nextQuestion = rawQuestion
    && typeof rawQuestion.fieldKey === "string"
    && typeof rawQuestion.prompt === "string"
    && typeof rawQuestion.recommendedValue === "string"
    && typeof rawQuestion.explanation === "string"
    ? {
        fieldKey: rawQuestion.fieldKey as ContractFieldKey,
        prompt: rawQuestion.prompt.slice(0, 240),
        recommendedValue: rawQuestion.recommendedValue.slice(0, 160),
        explanation: rawQuestion.explanation.slice(0, 320),
      }
    : undefined;
  return { strategyType, patches, nextQuestion, summary: typeof raw.summary === "string" ? raw.summary.slice(0, 240) : undefined };
}

export function applyAgentInterpretation(
  contract: StrategyContract,
  input: string,
  interpretation?: AgentInterpretation,
  provider: AgentTurnResult["provider"] = "local_fallback",
): AgentTurnResult {
  const beforeChangeCount = contract.changes.length;
  const local = applyNaturalLanguage(contract, input);
  let next = local.contract;
  let templateChanged = local.templateChanged;
  const recognized = [...local.recognized];

  if (interpretation?.strategyType && interpretation.strategyType !== next.templateId) {
    next = switchStrategyTemplate(next, interpretation.strategyType, "user_override");
    templateChanged = true;
    recognized.push(`策略类型：${strategyTemplates[interpretation.strategyType].label}`);
  }

  for (const patch of interpretation?.patches ?? []) {
    const field = next.fields[patch.fieldKey];
    if (!field || (patch.confidence !== undefined && patch.confidence < 0.55)) continue;
    const previousVersion = next.version;
    next = updateContractField(
      next,
      patch.fieldKey,
      patch.value,
      patchSource(next, patch.fieldKey),
      patch.evidence ? `模型从用户原话“${patch.evidence}”中识别。` : "模型从本轮用户输入中识别。",
    );
    if (next.version !== previousVersion) recognized.push(`${field.label}：${patch.value}`);
  }

  next = { ...next, conflicts: detectContractConflicts(next) };
  const uniqueRecognized = Array.from(new Set(recognized));
  const plannedQuestion = getNextQuestion(next);
  const modelQuestion = interpretation?.nextQuestion;
  const nextQuestion = plannedQuestion && modelQuestion?.fieldKey === plannedQuestion.key
    ? {
        ...plannedQuestion,
        value: modelQuestion.recommendedValue || plannedQuestion.value,
        description: modelQuestion.prompt || plannedQuestion.description,
        reason: modelQuestion.explanation || plannedQuestion.reason,
      }
    : plannedQuestion;
  return {
    contract: next,
    recognized: uniqueRecognized,
    changedFields: next.changes.slice(beforeChangeCount),
    templateChanged,
    provider,
    summary: interpretation?.summary?.trim() || (uniqueRecognized.length
      ? `已识别并更新：${uniqueRecognized.join("、")}。`
      : "没有识别到可安全写入策略合同的新规则。"),
    nextQuestion,
  };
}

export function createAgentPrompt(contract: StrategyContract, input: string): string {
  const allowedFields = strategyTemplates[contract.templateId].fields.map(({ key, label }) => ({ key, label }));
  const currentFields = Object.fromEntries(
    Object.entries(contract.fields).map(([key, field]) => [key, field ? { value: field.value, source: field.source } : null]),
  );
  return JSON.stringify({
    task: "把用户本轮自然语言转换为策略合同的增量补丁。只输出 JSON，不要补写用户未表达的字段，不要把推荐默认值伪装成用户要求。",
    strategyTypes: ["multi_factor", "timing", "rotation"],
    currentTemplate: contract.templateId,
    allowedFields,
    currentFields,
    currentConflicts: contract.conflicts,
    userInput: input,
    outputFormat: {
      strategyType: "multi_factor | timing | rotation | 省略",
      patches: [{ fieldKey: "allowedFields 中的 key", value: "可执行的中文规则", evidence: "用户原话片段", confidence: 0.0 }],
      nextQuestion: { fieldKey: "本轮更新后的首个待确认或冲突字段", prompt: "一句简洁追问", recommendedValue: "推荐默认值", explanation: "为什么适合当前策略及其影响" },
      summary: "一句话说明识别结果；只描述合同理解，不主动补充回测状态",
    },
  });
}

export type {
  ClarificationQuestion,
  ContractChange,
  ContractConflict,
  ContractField,
  ContractFieldKey,
  ContractProgress,
  ContractSource,
  IntentUpdateResult,
  StrategyContract,
  StrategyTemplate,
  StrategyType,
} from "./strategy-domain.ts";
