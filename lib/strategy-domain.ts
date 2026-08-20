export type StrategyType = "multi_factor" | "timing" | "rotation";

export type ContractSource = "user" | "agent_default" | "pending" | "user_override";

export type ContractFieldKey =
  | "market"
  | "strategyType"
  | "universe"
  | "factorsOrSignals"
  | "targetAsset"
  | "signalDefinition"
  | "candidateAssets"
  | "rankingRule"
  | "holdingCount"
  | "entryRule"
  | "exitRule"
  | "rebalanceFrequency"
  | "executionTiming"
  | "positionLimit"
  | "transactionCost";

export type ContractFieldDefinition = {
  key: ContractFieldKey;
  label: string;
  shortLabel: string;
  required: boolean;
  priority: number;
  prompt: string;
  defaultValue?: string;
  defaultReason?: string;
  alternatives?: string[];
  autoApplyDefault?: boolean;
};

export type ContractField = ContractFieldDefinition & {
  value: string | null;
  source: ContractSource;
  reason?: string;
};

export type ContractChange = {
  id: string;
  version: number;
  fieldKey: ContractFieldKey;
  fieldLabel: string;
  fromValue: string | null;
  toValue: string;
  source: Exclude<ContractSource, "pending">;
  reason: string;
};

export type ContractConflict = {
  id: string;
  type: "lookahead" | "rule_order" | "invalid_value" | "missing_cost";
  severity: "blocking" | "warning";
  fields: ContractFieldKey[];
  message: string;
  suggestion: string;
};

export type StrategyContract = {
  id: string;
  version: number;
  templateId: StrategyType;
  templateLabel: string;
  fields: Partial<Record<ContractFieldKey, ContractField>>;
  changes: ContractChange[];
  conflicts: ContractConflict[];
};

export type StrategyTemplate = {
  id: StrategyType;
  label: string;
  description: string;
  fields: ContractFieldDefinition[];
};

export type ClarificationQuestion = {
  kind: "missing_field" | "conflict";
  key: ContractFieldKey;
  label: string;
  shortLabel: string;
  value: string;
  description: string;
  reason: string;
  alternatives: string[];
  conflictId?: string;
};

export type ContractProgress = {
  resolved: number;
  total: number;
  percent: number;
  pendingLabels: string[];
  blockingConflicts: ContractConflict[];
  sourceCounts: Record<Exclude<ContractSource, "pending">, number>;
};

export type IntentUpdateResult = {
  contract: StrategyContract;
  recognized: string[];
  changedFields: ContractChange[];
  templateChanged: boolean;
};

const commonMarket: ContractFieldDefinition = {
  key: "market",
  label: "市场",
  shortLabel: "市场",
  required: true,
  priority: 1,
  prompt: "当前版本聚焦 A 股日线研究。",
  defaultValue: "A 股",
  defaultReason: "第一阶段只支持 A 股日线策略，便于保证合同和回测语义一致。",
  alternatives: [],
  autoApplyDefault: true,
};

const commonExecution: ContractFieldDefinition = {
  key: "executionTiming",
  label: "执行时点",
  shortLabel: "执行",
  required: true,
  priority: 70,
  prompt: "你还没有指定执行时点。",
  defaultValue: "收盘生成信号，下一交易日开盘执行",
  defaultReason: "信号与成交至少间隔一个可执行时点，可以避免使用尚未发生的信息。",
  alternatives: ["当日收盘成交", "下一交易日收盘执行"],
};

const commonPosition: ContractFieldDefinition = {
  key: "positionLimit",
  label: "仓位限制",
  shortLabel: "仓位",
  required: true,
  priority: 80,
  prompt: "你还没有指定仓位限制。",
  defaultValue: "单只标的不超过 10%",
  defaultReason: "限制单一标的权重可以降低集中度风险，也是回测可执行性的必要约束。",
  alternatives: ["单只标的不超过 5%", "等权配置"],
};

const commonCost: ContractFieldDefinition = {
  key: "transactionCost",
  label: "交易成本",
  shortLabel: "成本",
  required: true,
  priority: 90,
  prompt: "回测需要计入交易成本。",
  defaultValue: "佣金 0.03%，滑点 0.05%",
  defaultReason: "使用明确的佣金和滑点参数，避免把毛收益误认为可实现收益。",
  alternatives: ["佣金 0.02%，滑点 0.03%", "佣金 0.05%，滑点 0.10%"],
  autoApplyDefault: true,
};

export const strategyTemplates: Record<StrategyType, StrategyTemplate> = {
  multi_factor: {
    id: "multi_factor",
    label: "多因子选股",
    description: "按估值、质量、动量等因子对股票评分并定期调仓。",
    fields: [
      commonMarket,
      {
        key: "strategyType", label: "策略类型", shortLabel: "类型", required: true, priority: 2,
        prompt: "当前策略被识别为多因子选股。", defaultValue: "多因子选股",
        defaultReason: "策略描述包含选股因子或横截面排序特征。", alternatives: [], autoApplyDefault: true,
      },
      {
        key: "factorsOrSignals", label: "因子 / 信号", shortLabel: "因子", required: true, priority: 10,
        prompt: "你还没有说明用于选股的因子。", defaultValue: "估值、质量、动量",
        defaultReason: "估值、质量和动量覆盖价格、基本面与趋势三个互补维度。",
        alternatives: ["估值、质量", "低波动、质量"],
      },
      {
        key: "universe", label: "股票池", shortLabel: "股票池", required: true, priority: 20,
        prompt: "你还没有指定股票池。", defaultValue: "沪深 300",
        defaultReason: "沪深 300 流动性较好、数据更完整，适合先验证策略逻辑。",
        alternatives: ["中证 500", "全 A 股"],
      },
      {
        key: "entryRule", label: "买入规则", shortLabel: "买入", required: true, priority: 30,
        prompt: "需要把因子评分转成明确的买入规则。", defaultValue: "综合评分前 10 名",
        defaultReason: "选择前 10 名能把综合评分转成明确、可复现的持仓集合。",
        alternatives: ["综合评分前 20 名", "综合评分前 5%"], autoApplyDefault: true,
      },
      {
        key: "exitRule", label: "卖出规则", shortLabel: "卖出", required: true, priority: 40,
        prompt: "需要确定持仓退出规则。", defaultValue: "跌出前 20 名",
        defaultReason: "设置卖出缓冲区可以减少排名轻微波动造成的频繁交易。",
        alternatives: ["跌出前 15 名", "每次调仓全部重排"], autoApplyDefault: true,
      },
      {
        key: "rebalanceFrequency", label: "调仓周期", shortLabel: "调仓", required: true, priority: 60,
        prompt: "你还没有指定调仓周期。", defaultValue: "每月",
        defaultReason: "每月调仓兼顾信号更新和换手成本，适合日线级别的中期研究。",
        alternatives: ["每周", "每季度"],
      },
      commonExecution,
      commonPosition,
      commonCost,
    ],
  },
  timing: {
    id: "timing",
    label: "技术择时",
    description: "根据均线、突破或技术指标决定持有与空仓。",
    fields: [
      commonMarket,
      {
        key: "strategyType", label: "策略类型", shortLabel: "类型", required: true, priority: 2,
        prompt: "当前策略被识别为技术择时。", defaultValue: "技术择时",
        defaultReason: "策略描述包含均线、突破或技术指标的进出场条件。", alternatives: [], autoApplyDefault: true,
      },
      {
        key: "targetAsset", label: "交易标的", shortLabel: "标的", required: true, priority: 10,
        prompt: "你还没有指定择时交易的标的。", defaultValue: "沪深 300 ETF",
        defaultReason: "宽基 ETF 数据和交易语义清晰，适合作为择时策略的研究起点。",
        alternatives: ["中证 500 ETF", "创业板 ETF"],
      },
      {
        key: "signalDefinition", label: "择时信号", shortLabel: "信号", required: true, priority: 20,
        prompt: "你还没有把择时信号定义成可计算规则。", defaultValue: "20 日均线与 60 日均线交叉",
        defaultReason: "双均线规则参数少、可解释，适合验证择时流程。",
        alternatives: ["20 日价格突破", "RSI 14 日反转"],
      },
      {
        key: "entryRule", label: "入场规则", shortLabel: "入场", required: true, priority: 30,
        prompt: "你还没有指定入场条件。", defaultValue: "20 日均线上穿 60 日均线",
        defaultReason: "上穿信号与双均线模板一致，能够确定持仓开始时点。",
        alternatives: ["收盘价站上 60 日均线", "连续两日满足信号"],
      },
      {
        key: "exitRule", label: "离场规则", shortLabel: "离场", required: true, priority: 40,
        prompt: "你还没有指定离场条件。", defaultValue: "20 日均线下穿 60 日均线",
        defaultReason: "下穿作为对称离场条件，规则简单且可复现。",
        alternatives: ["收盘价跌破 60 日均线", "回撤超过 10%"],
      },
      {
        key: "rebalanceFrequency", label: "信号频率", shortLabel: "频率", required: true, priority: 60,
        prompt: "你还没有指定信号检查频率。", defaultValue: "每日收盘检查",
        defaultReason: "日线策略默认在每日收盘后计算一次信号。",
        alternatives: ["每周检查", "每月检查"], autoApplyDefault: true,
      },
      commonExecution,
      {
        ...commonPosition,
        defaultValue: "有信号时满仓，无信号时空仓",
        alternatives: ["有信号时 80% 仓位", "分两次建仓"],
      },
      commonCost,
    ],
  },
  rotation: {
    id: "rotation",
    label: "行业 / ETF 轮动",
    description: "在候选行业或 ETF 中按规则排名并周期性切换持仓。",
    fields: [
      commonMarket,
      {
        key: "strategyType", label: "策略类型", shortLabel: "类型", required: true, priority: 2,
        prompt: "当前策略被识别为行业 / ETF 轮动。", defaultValue: "行业 / ETF 轮动",
        defaultReason: "策略描述包含候选资产之间的相对排名与定期切换。", alternatives: [], autoApplyDefault: true,
      },
      {
        key: "candidateAssets", label: "候选资产", shortLabel: "候选池", required: true, priority: 10,
        prompt: "你还没有指定参与轮动的候选资产。", defaultValue: "中证行业 ETF",
        defaultReason: "行业 ETF 能减少个股事件影响，适合验证轮动逻辑。",
        alternatives: ["申万一级行业", "宽基指数 ETF"],
      },
      {
        key: "rankingRule", label: "排名规则", shortLabel: "排名", required: true, priority: 20,
        prompt: "你还没有说明候选资产如何排名。", defaultValue: "近 60 日动量排序",
        defaultReason: "中期动量是轮动策略中简单、透明、可复现的排序方法。",
        alternatives: ["近 20 日动量排序", "动量与低波动综合排序"],
      },
      {
        key: "holdingCount", label: "持仓数量", shortLabel: "数量", required: true, priority: 30,
        prompt: "你还没有指定同时持有多少个资产。", defaultValue: "排名前 3 个",
        defaultReason: "持有 3 个资产能在集中度与分散度之间取得平衡。",
        alternatives: ["排名前 1 个", "排名前 5 个"],
      },
      {
        key: "exitRule", label: "退出规则", shortLabel: "退出", required: true, priority: 40,
        prompt: "你还没有指定轮出条件。", defaultValue: "跌出前 5 名",
        defaultReason: "保留排名缓冲区可以减少边界附近的频繁切换。",
        alternatives: ["每次调仓全部重排", "动量转负时退出"], autoApplyDefault: true,
      },
      {
        key: "rebalanceFrequency", label: "轮动周期", shortLabel: "轮动", required: true, priority: 60,
        prompt: "你还没有指定轮动周期。", defaultValue: "每月",
        defaultReason: "每月轮动适合中期排名信号，也能控制换手率。",
        alternatives: ["每周", "每季度"],
      },
      commonExecution,
      {
        ...commonPosition,
        defaultValue: "入选资产等权",
        alternatives: ["按排名加权", "单只资产不超过 40%"],
        autoApplyDefault: true,
      },
      commonCost,
    ],
  },
};

export const contractSourceLabels: Record<ContractSource, string> = {
  user: "用户明确",
  agent_default: "系统默认",
  pending: "待确认",
  user_override: "用户修改",
};

function createField(definition: ContractFieldDefinition): ContractField {
  const hasDefault = Boolean(definition.autoApplyDefault && definition.defaultValue);
  return {
    ...definition,
    value: hasDefault ? definition.defaultValue ?? null : null,
    source: hasDefault ? "agent_default" : "pending",
    reason: hasDefault ? definition.defaultReason : undefined,
  };
}

export function createStrategyContract(templateId: StrategyType, id = `contract-${Date.now()}`): StrategyContract {
  const template = strategyTemplates[templateId];
  return {
    id,
    version: 1,
    templateId,
    templateLabel: template.label,
    fields: Object.fromEntries(template.fields.map((field) => [field.key, createField(field)])),
    changes: [],
    conflicts: [],
  };
}

function firstNumber(value?: string | null): number | undefined {
  const match = value?.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : undefined;
}

export function detectContractConflicts(contract: StrategyContract): ContractConflict[] {
  const conflicts: ContractConflict[] = [];
  const execution = contract.fields.executionTiming?.value;

  if (execution?.includes("当日收盘")) {
    conflicts.push({
      id: "lookahead-same-close",
      type: "lookahead",
      severity: "blocking",
      fields: ["executionTiming"],
      message: "当前规则在当日收盘信号生成后，又假设按同一收盘价成交，存在未来信息风险。",
      suggestion: "改为收盘生成信号，下一交易日开盘执行。",
    });
  }

  if (contract.templateId === "multi_factor") {
    const entryCount = firstNumber(contract.fields.entryRule?.value);
    const exitCount = firstNumber(contract.fields.exitRule?.value);
    if (entryCount && exitCount && exitCount <= entryCount) {
      conflicts.push({
        id: "rank-buffer-order",
        type: "rule_order",
        severity: "blocking",
        fields: ["entryRule", "exitRule"],
        message: `买入前 ${entryCount} 名，但卖出阈值是跌出前 ${exitCount} 名，无法形成有效缓冲区。`,
        suggestion: `将卖出阈值设置为大于 ${entryCount} 的名次，例如跌出前 ${Math.max(entryCount * 2, entryCount + 5)} 名。`,
      });
    }
  }

  const position = firstNumber(contract.fields.positionLimit?.value);
  if (position !== undefined && (position <= 0 || position > 100)) {
    conflicts.push({
      id: "invalid-position-limit",
      type: "invalid_value",
      severity: "blocking",
      fields: ["positionLimit"],
      message: "仓位上限必须大于 0% 且不超过 100%。",
      suggestion: "建议单只标的不超过 10%。",
    });
  }

  const cost = contract.fields.transactionCost;
  if (cost?.value && /不计|忽略|为\s*0|0\s*%/.test(cost.value)) {
    conflicts.push({
      id: "zero-transaction-cost",
      type: "missing_cost",
      severity: "warning",
      fields: ["transactionCost"],
      message: "交易成本被设为零，回测收益可能被高估。",
      suggestion: "建议至少计入佣金 0.03% 和滑点 0.05%。",
    });
  }

  return conflicts;
}

function withConflicts(contract: StrategyContract): StrategyContract {
  return { ...contract, conflicts: detectContractConflicts(contract) };
}

export function getContractFields(contract: StrategyContract): ContractField[] {
  return strategyTemplates[contract.templateId].fields
    .map((definition) => contract.fields[definition.key])
    .filter((field): field is ContractField => Boolean(field));
}

export function updateContractField(
  contract: StrategyContract,
  key: ContractFieldKey,
  value: string,
  source: Exclude<ContractSource, "pending">,
  reason: string,
): StrategyContract {
  const current = contract.fields[key];
  if (!current) return contract;
  if (current.value === value) return contract;

  const version = contract.version + 1;
  const change: ContractChange = {
    id: `change-${version}-${key}`,
    version,
    fieldKey: key,
    fieldLabel: current.label,
    fromValue: current.value,
    toValue: value,
    source,
    reason,
  };

  return withConflicts({
    ...contract,
    version,
    fields: {
      ...contract.fields,
      [key]: { ...current, value, source, reason },
    },
    changes: [...contract.changes, change],
  });
}

export function switchStrategyTemplate(
  contract: StrategyContract,
  templateId: StrategyType,
  source: "user" | "user_override" = "user_override",
): StrategyContract {
  if (contract.templateId === templateId) return contract;

  const next = createStrategyContract(templateId, contract.id);
  const preservedKeys: ContractFieldKey[] = ["market", "executionTiming", "positionLimit", "transactionCost"];
  const preservedFields = { ...next.fields };

  for (const key of preservedKeys) {
    const previous = contract.fields[key];
    if (previous?.value && preservedFields[key]) preservedFields[key] = { ...preservedFields[key]!, ...previous };
  }

  const strategyField = preservedFields.strategyType!;
  preservedFields.strategyType = {
    ...strategyField,
    value: next.templateLabel,
    source,
    reason: "用户的最新描述切换了策略类型。",
  };

  const version = contract.version + 1;
  return withConflicts({
    ...next,
    version,
    fields: preservedFields,
    changes: [
      ...contract.changes,
      {
        id: `change-${version}-strategyType`,
        version,
        fieldKey: "strategyType",
        fieldLabel: "策略类型",
        fromValue: contract.templateLabel,
        toValue: next.templateLabel,
        source,
        reason: "根据用户最新描述切换策略模板。",
      },
    ],
  });
}

export function getContractProgress(contract: StrategyContract): ContractProgress {
  const required = getContractFields(contract).filter((field) => field.required);
  const resolvedFields = required.filter((field) => field.value && field.source !== "pending");
  const sourceCounts = { user: 0, agent_default: 0, user_override: 0 };

  for (const field of resolvedFields) {
    if (field.source !== "pending") sourceCounts[field.source] += 1;
  }

  return {
    resolved: resolvedFields.length,
    total: required.length,
    percent: required.length ? Math.round((resolvedFields.length / required.length) * 100) : 100,
    pendingLabels: required.filter((field) => !field.value || field.source === "pending").map((field) => field.label),
    blockingConflicts: contract.conflicts.filter((conflict) => conflict.severity === "blocking"),
    sourceCounts,
  };
}

export function isContractReady(contract: StrategyContract): boolean {
  const progress = getContractProgress(contract);
  return progress.pendingLabels.length === 0 && progress.blockingConflicts.length === 0;
}

export function getNextQuestion(contract: StrategyContract): ClarificationQuestion | null {
  const conflict = contract.conflicts.find((item) => item.severity === "blocking");
  if (conflict) {
    const key = conflict.fields.at(-1) ?? conflict.fields[0];
    const field = contract.fields[key];
    if (field) {
      const value = conflict.id === "rank-buffer-order"
        ? `跌出前 ${Math.max((firstNumber(contract.fields.entryRule?.value) ?? 10) * 2, 15)} 名`
        : field.defaultValue ?? field.value ?? "待重新定义";
      return {
        kind: "conflict",
        key,
        label: field.label,
        shortLabel: field.shortLabel,
        value,
        description: conflict.message,
        reason: conflict.suggestion,
        alternatives: field.alternatives ?? [],
        conflictId: conflict.id,
      };
    }
  }

  const field = getContractFields(contract)
    .filter((candidate) => candidate.required && (!candidate.value || candidate.source === "pending"))
    .sort((a, b) => a.priority - b.priority)[0];

  if (!field?.defaultValue) return null;
  return {
    kind: "missing_field",
    key: field.key,
    label: field.label,
    shortLabel: field.shortLabel,
    value: field.defaultValue,
    description: `${field.prompt}我建议先采用“${field.defaultValue}”。`,
    reason: field.defaultReason ?? "这是一个可复现、便于继续研究的默认起点。",
    alternatives: field.alternatives ?? [],
  };
}

export function detectStrategyType(input: string): StrategyType | undefined {
  if (/行业.{0,4}轮动|ETF.{0,4}轮动|板块.{0,4}轮动|轮动策略/.test(input)) return "rotation";
  if (/均线|择时|突破|金叉|死叉|RSI|MACD/i.test(input)) return "timing";
  if (/多因子|选股|低估值|估值|质量|低波动|动量因子/.test(input)) return "multi_factor";
  return undefined;
}

function userSource(contract: StrategyContract, field: ContractField | undefined): "user" | "user_override" {
  if (!field?.value || field.source === "pending") return "user";
  const hasEarlierChange = contract.changes.some((change) => change.fieldKey === field.key);
  return field.source === "agent_default" && !hasEarlierChange ? "user" : "user_override";
}

function factorValue(input: string, currentValue?: string | null): string | undefined {
  const known = [
    ["估值", /低估值|便宜|估值/],
    ["质量", /质量好|好公司|盈利稳定|质量/],
    ["动量", /趋势向上|动量|上涨/],
    ["低波动", /低波动|波动小/],
  ] as const;
  const mentioned = known.filter(([, pattern]) => pattern.test(input)).map(([label]) => label);
  if (!mentioned.length) return undefined;

  const current = (currentValue ?? "").split("、").filter(Boolean);
  if (/移除|去掉|不要/.test(input)) return current.filter((factor) => !mentioned.includes(factor as typeof mentioned[number])).join("、") || "待重新定义";
  if (/增加|加入|再加/.test(input)) return Array.from(new Set([...current, ...mentioned])).join("、");
  return mentioned.join("、");
}

function collectInputValues(contract: StrategyContract, input: string): Array<{ key: ContractFieldKey; value: string; label: string }> {
  const values: Array<{ key: ContractFieldKey; value: string; label: string }> = [];
  const add = (key: ContractFieldKey, value: string, label: string) => {
    if (contract.fields[key]) values.push({ key, value, label });
  };

  if (/A\s*股|沪深|股票/.test(input)) add("market", "A 股", "市场：A 股");
  if (!/(不要|不选|排除).{0,5}沪深\s*300/.test(input) && /沪深\s*300/.test(input)) add("universe", "沪深 300", "股票池：沪深 300");
  if (!/(不要|不选|排除).{0,5}中证\s*500/.test(input) && /中证\s*500/.test(input)) add("universe", "中证 500", "股票池：中证 500");
  if (/全\s*A\s*股/.test(input)) add("universe", "全 A 股", "股票池：全 A 股");

  const rebalance = /每周|周度/.test(input) ? "每周" : /每季|季度/.test(input) ? "每季度" : /每月|月度/.test(input) ? "每月" : undefined;
  if (rebalance) add("rebalanceFrequency", rebalance, `周期：${rebalance}`);

  if (/当日收盘|当天收盘/.test(input)) add("executionTiming", "当日收盘成交", "执行：当日收盘成交");
  else if (/次日开盘|第二天买|下一交易日开盘/.test(input)) add("executionTiming", "收盘生成信号，下一交易日开盘执行", "执行：下一交易日开盘");
  else if (/次日收盘|下一交易日收盘/.test(input)) add("executionTiming", "下一交易日收盘执行", "执行：下一交易日收盘");

  const position = input.match(/(?:单只|单个|仓位|上限)[^。；，,]{0,8}?(\d{1,3})\s*%/);
  if (position) add("positionLimit", `单只标的不超过 ${position[1]}%`, `仓位：单只不超过 ${position[1]}%`);

  if (contract.templateId === "multi_factor") {
    const factors = factorValue(input, contract.fields.factorsOrSignals?.value);
    if (factors) add("factorsOrSignals", factors, `因子：${factors}`);
    const top = input.match(/(?:买入|选取|选择|持有|评分)?[^。；，,]{0,6}?前\s*(\d+)\s*名/);
    if (top && !/跌出前/.test(input)) add("entryRule", `综合评分前 ${top[1]} 名`, `买入：评分前 ${top[1]} 名`);
    const exit = input.match(/跌出前\s*(\d+)\s*名/);
    if (exit) add("exitRule", `跌出前 ${exit[1]} 名`, `卖出：跌出前 ${exit[1]} 名`);
  }

  if (contract.templateId === "timing") {
    if (/沪深\s*300\s*ETF/i.test(input)) add("targetAsset", "沪深 300 ETF", "标的：沪深 300 ETF");
    if (/中证\s*500\s*ETF/i.test(input)) add("targetAsset", "中证 500 ETF", "标的：中证 500 ETF");
    const ma = input.match(/(\d+)\s*日(?:均线)?\s*(?:和|与|、|\/|-)\s*(\d+)\s*日(?:均线)?/);
    if (ma) {
      const short = ma[1];
      const long = ma[2];
      add("signalDefinition", `${short} 日均线与 ${long} 日均线交叉`, `信号：${short}/${long} 日均线`);
    }
    if (/金叉|上穿/.test(input)) add("entryRule", "短期均线上穿长期均线", "入场：均线上穿");
    if (/死叉|下穿/.test(input)) add("exitRule", "短期均线下穿长期均线", "离场：均线下穿");
  }

  if (contract.templateId === "rotation") {
    if (/行业\s*ETF|行业ETF/.test(input)) add("candidateAssets", "中证行业 ETF", "候选池：行业 ETF");
    if (/申万.{0,4}行业/.test(input)) add("candidateAssets", "申万一级行业", "候选池：申万一级行业");
    const days = input.match(/近?\s*(\d+)\s*日.{0,5}动量/);
    if (days) add("rankingRule", `近 ${days[1]} 日动量排序`, `排名：${days[1]} 日动量`);
    else if (/动量/.test(input)) add("rankingRule", "近 60 日动量排序", "排名：动量");
    const count = input.match(/(?:持有|排名)?[^。；，,]{0,5}?前\s*(\d+)\s*(?:个|只|名)/);
    if (count) add("holdingCount", `排名前 ${count[1]} 个`, `持仓：前 ${count[1]} 个`);
  }

  return values;
}

export function applyNaturalLanguage(contract: StrategyContract, input: string): IntentUpdateResult {
  const detected = detectStrategyType(input);
  const templateChanged = Boolean(detected && detected !== contract.templateId);
  const beforeChangeCount = contract.changes.length;
  let next = templateChanged ? switchStrategyTemplate(contract, detected!, "user_override") : contract;
  const recognized: string[] = [];

  if (detected) {
    const strategyField = next.fields.strategyType;
    if (!templateChanged && strategyField) {
      next = updateContractField(next, "strategyType", strategyTemplates[detected].label, userSource(next, strategyField), "根据用户描述识别策略类型。");
    }
    recognized.push(`策略类型：${strategyTemplates[detected].label}`);
  }

  for (const update of collectInputValues(next, input)) {
    const field = next.fields[update.key];
    next = updateContractField(next, update.key, update.value, userSource(next, field), `从用户输入“${input}”中识别。`);
    recognized.push(update.label);
  }

  return {
    contract: next,
    recognized: Array.from(new Set(recognized)),
    changedFields: next.changes.slice(beforeChangeCount),
    templateChanged,
  };
}

export function createExampleContract(): StrategyContract {
  let contract = createStrategyContract("multi_factor", "contract-example");
  contract = updateContractField(contract, "market", "A 股", "user", "来自示例用户输入。");
  contract = updateContractField(contract, "strategyType", "多因子选股", "user", "根据示例策略描述识别。");
  contract = updateContractField(contract, "factorsOrSignals", "估值、质量、动量", "user", "从示例用户输入中识别三个因子。");
  return { ...contract, version: 1, changes: [] };
}
