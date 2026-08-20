import { mockBacktestResult, type BacktestResult } from "./mock-data.ts";
import { detectContractConflicts, getContractFields, type StrategyContract } from "./strategy-domain.ts";

export type AuditStatus = "passed" | "warning" | "failed" | "not_run";

export type AuditCheck = {
  id: string;
  label: string;
  status: AuditStatus;
  message: string;
  evidence: string;
  ruleId: string;
};

export type BacktestAuditReport = {
  status: "passed" | "warning" | "failed";
  contractVersion: number;
  generatedAt: string;
  summary: string;
  checks: AuditCheck[];
};

export type BacktestRequest = {
  contractId: string;
  contractVersion: number;
  templateId: StrategyContract["templateId"];
  parameters: Record<string, string>;
  data: { market: "A 股"; frequency: "日线"; mode: "mock" };
};

export type BacktestToolResult = {
  runId: string;
  status: "completed" | "rejected";
  result: BacktestResult | null;
  audit: BacktestAuditReport;
  request: BacktestRequest;
};

export interface BacktestTool {
  run(request: BacktestRequest, contract: StrategyContract): Promise<BacktestToolResult>;
}

export function buildBacktestRequest(contract: StrategyContract): BacktestRequest {
  return {
    contractId: contract.id,
    contractVersion: contract.version,
    templateId: contract.templateId,
    parameters: Object.fromEntries(
      getContractFields(contract).flatMap((field) => field.value ? [[field.key, field.value]] : []),
    ),
    data: { market: "A 股", frequency: "日线", mode: "mock" },
  };
}

export function auditContract(contract: StrategyContract): BacktestAuditReport {
  const conflicts = detectContractConflicts(contract);
  const execution = contract.fields.executionTiming?.value ?? "未设置";
  const cost = contract.fields.transactionCost?.value ?? "未设置";
  const lookahead = conflicts.find((item) => item.type === "lookahead");
  const invalid = conflicts.filter((item) => item.severity === "blocking" && item.type !== "lookahead");
  const checks: AuditCheck[] = [
    {
      id: "future-data",
      label: "未来函数检查",
      status: lookahead ? "failed" : "passed",
      message: lookahead?.message ?? "信号与成交时点未发现同价成交问题。",
      evidence: execution,
      ruleId: "AUDIT-TIME-001",
    },
    {
      id: "execution-lag",
      label: "信号与执行时点",
      status: execution.includes("下一交易日") ? "passed" : "warning",
      message: execution.includes("下一交易日") ? "成交发生在信号生成后的可执行时点。" : "建议人工复核信号和成交的先后顺序。",
      evidence: execution,
      ruleId: "AUDIT-TIME-002",
    },
    {
      id: "transaction-cost",
      label: "手续费与滑点",
      status: /不计|忽略|为\s*0|0\s*%/.test(cost) ? "warning" : "passed",
      message: /不计|忽略|为\s*0|0\s*%/.test(cost) ? "交易成本为零，收益可能被高估。" : "合同已包含明确交易成本参数。",
      evidence: cost,
      ruleId: "AUDIT-COST-001",
    },
    {
      id: "contract-consistency",
      label: "合同一致性",
      status: invalid.length ? "failed" : "passed",
      message: invalid.length ? invalid.map((item) => item.message).join("；") : "必填规则之间未发现阻塞冲突。",
      evidence: `合同 v${contract.version} · ${contract.templateLabel}`,
      ruleId: "AUDIT-CONTRACT-001",
    },
    {
      id: "price-limit",
      label: "涨跌停与停牌约束",
      status: "not_run",
      message: "当前 Mock 引擎尚未真实回放涨跌停和停牌状态。",
      evidence: "Mock 引擎能力边界",
      ruleId: "AUDIT-MARKET-001",
    },
    {
      id: "out-of-sample",
      label: "样本外测试",
      status: "not_run",
      message: "当前阶段未执行样本外测试。",
      evidence: "仅生成样本内 Mock 结果",
      ruleId: "AUDIT-OOS-001",
    },
  ];
  const status = checks.some((item) => item.status === "failed") ? "failed" : checks.some((item) => item.status === "warning" || item.status === "not_run") ? "warning" : "passed";
  return {
    status,
    contractVersion: contract.version,
    generatedAt: new Date().toISOString(),
    summary: status === "failed" ? "审计存在阻塞错误，不能把结果视为有效回测。" : status === "warning" ? "核心时点检查通过，但仍有未执行项目。" : "全部审计检查通过。",
    checks,
  };
}

export class MockBacktestTool implements BacktestTool {
  async run(request: BacktestRequest, contract: StrategyContract): Promise<BacktestToolResult> {
    const audit = auditContract(contract);
    await new Promise((resolve) => setTimeout(resolve, 180));
    return {
      runId: `mock-${contract.id}-v${contract.version}`,
      status: audit.status === "failed" ? "rejected" : "completed",
      result: audit.status === "failed" ? null : { ...mockBacktestResult },
      audit,
      request,
    };
  }
}

export async function runBacktestTool(contract: StrategyContract, tool: BacktestTool = new MockBacktestTool()): Promise<BacktestToolResult> {
  return tool.run(buildBacktestRequest(contract), contract);
}
