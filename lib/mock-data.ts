export type AgentStage =
  | "idle"
  | "parsing"
  | "clarifying"
  | "contract_ready"
  | "awaiting_confirmation"
  | "backtest_running"
  | "audit_running"
  | "report_ready";

export type ContractSource = "user" | "agent_default" | "user_override" | "pending";

export type StrategyField = {
  key: keyof StrategyContract;
  label: string;
  value: string;
  source: ContractSource;
  reason?: string;
};

export type StrategyContract = {
  market: string;
  universe: string;
  strategyType: string;
  factorsOrSignals: string;
  entryRule: string;
  exitRule: string;
  rebalanceFrequency: string;
  executionTiming: string;
  positionLimit: string;
  transactionCost: string;
};

export type Assumption = {
  field: string;
  value: string;
  source: Exclude<ContractSource, "pending">;
  reason: string;
  status: "active" | "replaced";
};

export type BacktestResult = {
  cumulativeReturn: string;
  annualizedReturn: string;
  benchmarkReturn: string;
  maxDrawdown: string;
  annualizedVolatility: string;
  sharpe: string;
  winRate: string;
  turnover: string;
  tradeCount: number;
  averageHoldings: number;
  synthetic: boolean;
};

export type Experiment = {
  id: string;
  name: string;
  changes: string[];
  result: BacktestResult;
  auditStatus: "通过" | "警告";
};

export type Message = {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  tone?: "normal" | "warning" | "success";
};

export const initialContract: StrategyContract = {
  market: "A 股",
  universe: "待确认",
  strategyType: "多因子选股",
  factorsOrSignals: "估值、质量、动量",
  entryRule: "综合评分前 10 名",
  exitRule: "跌出前 20 名",
  rebalanceFrequency: "待确认",
  executionTiming: "推荐：次日开盘执行",
  positionLimit: "单只股票不超过 10%",
  transactionCost: "手续费和滑点已计入",
};

export const initialSources: Record<keyof StrategyContract, ContractSource> = {
  market: "user",
  universe: "pending",
  strategyType: "user",
  factorsOrSignals: "user",
  entryRule: "agent_default",
  exitRule: "agent_default",
  rebalanceFrequency: "pending",
  executionTiming: "agent_default",
  positionLimit: "agent_default",
  transactionCost: "agent_default",
};

export const defaultReasons: Record<string, string> = {
  universe: "沪深 300 流动性较好、数据更完整，适合先验证策略逻辑。",
  rebalanceFrequency: "每月调仓能降低换手率，也适合日线级别的中期研究。",
  executionTiming: "收盘产生信号、下一交易日开盘执行，可以避免把尚未发生的收盘信息用于当日成交。",
  entryRule: "综合评分前 10 名可以把多因子想法转成明确、可复现的组合规则。",
  exitRule: "跌出前 20 名提供缓冲区，避免排名轻微波动造成频繁交易。",
  positionLimit: "单只股票 10% 上限可以降低单一标的对组合的影响。",
  transactionCost: "在研究阶段预先加入成本，避免把毛收益误认为可实现收益。",
};

export const defaultAssumptions: Assumption[] = [
  {
    field: "买入规则",
    value: "综合评分前 10 名",
    source: "agent_default",
    reason: defaultReasons.entryRule,
    status: "active",
  },
  {
    field: "卖出规则",
    value: "跌出前 20 名",
    source: "agent_default",
    reason: defaultReasons.exitRule,
    status: "active",
  },
  {
    field: "执行时点",
    value: "次日开盘执行",
    source: "agent_default",
    reason: defaultReasons.executionTiming,
    status: "active",
  },
  {
    field: "仓位限制",
    value: "单只股票不超过 10%",
    source: "agent_default",
    reason: defaultReasons.positionLimit,
    status: "active",
  },
  {
    field: "交易成本",
    value: "手续费和滑点已计入",
    source: "agent_default",
    reason: defaultReasons.transactionCost,
    status: "active",
  },
];

export const defaultMessages: Message[] = [
  {
    id: "user-1",
    role: "user",
    text: "我想做一个低估值、质量好、趋势向上的 A 股策略。",
  },
  {
    id: "agent-1",
    role: "agent",
    text: "我先把你的想法拆成三个维度：估值、质量、动量。为了能开始回测，还需要确定股票池。",
  },
];

export const mockBacktestResult: BacktestResult = {
  cumulativeReturn: "24.7%",
  annualizedReturn: "11.8%",
  benchmarkReturn: "16.2%",
  maxDrawdown: "-21.5%",
  annualizedVolatility: "18.4%",
  sharpe: "1.08",
  winRate: "56.4%",
  turnover: "8.6",
  tradeCount: 184,
  averageHoldings: 10,
  synthetic: true,
};

export const experiments: Experiment[] = [
  {
    id: "exp-001",
    name: "实验 001：估值 + 质量",
    changes: ["移除动量因子", "保留价值与质量筛选"],
    result: {
      ...mockBacktestResult,
      cumulativeReturn: "18.4%",
      annualizedReturn: "9.6%",
      benchmarkReturn: "16.2%",
      maxDrawdown: "-16.2%",
      sharpe: "0.91",
      turnover: "4.8",
      tradeCount: 112,
    },
    auditStatus: "通过",
  },
  {
    id: "exp-002",
    name: "实验 002：估值 + 质量 + 动量",
    changes: ["增加 120 日动量", "综合因子评分"],
    result: mockBacktestResult,
    auditStatus: "警告",
  },
  {
    id: "exp-003",
    name: "实验 003：降低换手率",
    changes: ["调仓改为季度", "扩大卖出缓冲区"],
    result: {
      ...mockBacktestResult,
      cumulativeReturn: "21.9%",
      annualizedReturn: "10.7%",
      benchmarkReturn: "16.2%",
      maxDrawdown: "-13.8%",
      sharpe: "1.02",
      turnover: "3.1",
      tradeCount: 74,
    },
    auditStatus: "通过",
  },
];

export const contractRows: Array<{ key: keyof StrategyContract; label: string }> = [
  { key: "market", label: "市场" },
  { key: "strategyType", label: "策略类型" },
  { key: "factorsOrSignals", label: "因子 / 信号" },
  { key: "universe", label: "股票池" },
  { key: "entryRule", label: "买入规则" },
  { key: "exitRule", label: "卖出规则" },
  { key: "rebalanceFrequency", label: "调仓" },
  { key: "executionTiming", label: "执行" },
  { key: "positionLimit", label: "仓位限制" },
  { key: "transactionCost", label: "交易成本" },
];

export const backtestSteps = [
  { id: "contract", label: "读取策略合同" },
  { id: "fields", label: "检查数据字段" },
  { id: "config", label: "生成回测配置" },
  { id: "replay", label: "回放历史行情" },
  { id: "audit", label: "执行未来函数审计" },
  { id: "report", label: "生成回测报告" },
];
