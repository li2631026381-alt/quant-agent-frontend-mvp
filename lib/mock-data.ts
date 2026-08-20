import { createExampleContract } from "./strategy-domain.ts";

export type AgentStage =
  | "idle"
  | "parsing"
  | "clarifying"
  | "contract_ready"
  | "awaiting_confirmation"
  | "backtest_running"
  | "audit_running"
  | "report_ready";

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

export const initialContract = createExampleContract();

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

export const backtestSteps = [
  { id: "contract", label: "读取策略合同" },
  { id: "fields", label: "检查数据字段" },
  { id: "config", label: "生成回测配置" },
  { id: "replay", label: "回放历史行情" },
  { id: "audit", label: "执行未来函数审计" },
  { id: "report", label: "生成回测报告" },
];
