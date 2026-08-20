import { defaultReasons, initialContract, type StrategyContract } from "./mock-data";

export type ParsedIntent = {
  factors: string[];
  market?: string;
  universe?: string;
  rebalance?: string;
  execution?: string;
};

export function parseIntent(input: string): ParsedIntent {
  const text = input.trim();
  const factors: string[] = [];
  if (/低估值|便宜|估值/.test(text)) factors.push("估值");
  if (/质量好|好公司|盈利稳定|质量/.test(text)) factors.push("质量");
  if (/趋势向上|动量|上涨/.test(text)) factors.push("动量");
  if (/低波动|波动小/.test(text)) factors.push("低波动");

  return {
    factors,
    market: /A\s*股|股票|沪深/.test(text) ? "A 股" : undefined,
    universe: /沪深\s*300/.test(text) ? "沪深 300" : /中证\s*500/.test(text) ? "中证 500" : undefined,
    rebalance: /每周/.test(text) ? "每周" : /季度/.test(text) ? "每季度" : /每月|月度/.test(text) ? "每月" : undefined,
    execution: /次日开盘|第二天买/.test(text) ? "收盘生成信号，下一交易日开盘执行" : undefined,
  };
}

export function contractFromIntent(input: string): StrategyContract {
  const intent = parseIntent(input);
  return {
    ...initialContract,
    market: intent.market ?? initialContract.market,
    universe: intent.universe ?? initialContract.universe,
    factorsOrSignals: intent.factors.length > 0 ? intent.factors.join("、") : initialContract.factorsOrSignals,
    rebalanceFrequency: intent.rebalance ?? initialContract.rebalanceFrequency,
    executionTiming: intent.execution ?? initialContract.executionTiming,
  };
}

export function defaultReason(field: string): string {
  return defaultReasons[field] ?? "这是一个适合先验证策略逻辑的可复现默认值。";
}
