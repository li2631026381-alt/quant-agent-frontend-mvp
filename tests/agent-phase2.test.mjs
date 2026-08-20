import test from "node:test";
import assert from "node:assert/strict";
import { applyAgentInterpretation, normalizeAgentInterpretation } from "../lib/agent.ts";
import { auditContract, buildBacktestRequest, MockBacktestTool } from "../lib/backtest.ts";
import { createStrategyContract, getNextQuestion, isContractReady, updateContractField } from "../lib/strategy-domain.ts";

test("模型输出只允许写入当前模板字段并忽略低置信度补丁", () => {
  const contract = createStrategyContract("multi_factor", "model-guard");
  const interpretation = normalizeAgentInterpretation({
    strategyType: "multi_factor",
    patches: [
      { fieldKey: "universe", value: "中证 500", evidence: "用中证500", confidence: 0.95 },
      { fieldKey: "targetAsset", value: "比特币", confidence: 0.99 },
      { fieldKey: "positionLimit", value: "单只标的不超过 90%", confidence: 0.2 },
    ],
  });
  const turn = applyAgentInterpretation(contract, "用中证500", interpretation, "deepseek");
  assert.equal(turn.contract.fields.universe?.value, "中证 500");
  assert.equal(turn.contract.fields.targetAsset, undefined);
  assert.equal(turn.contract.fields.positionLimit?.value, null);
});

test("本地解析和模型重复识别同一值时合同变更保持幂等", () => {
  const contract = createStrategyContract("multi_factor", "idempotent-patch");
  const turn = applyAgentInterpretation(contract, "每季度调仓", {
    patches: normalizeAgentInterpretation({ patches: [{ fieldKey: "rebalanceFrequency", value: "每季度调仓", confidence: 0.99 }] }).patches,
  }, "deepseek");
  assert.equal(turn.contract.fields.rebalanceFrequency?.value, "每季度");
  assert.equal(turn.changedFields.filter((change) => change.fieldKey === "rebalanceFrequency").length, 1);
});

test("阻塞冲突会替代缺失字段成为下一澄清问题", () => {
  let contract = createStrategyContract("multi_factor", "conflict-priority");
  contract = updateContractField(contract, "executionTiming", "当日收盘成交", "user", "用户明确。" );
  assert.equal(getNextQuestion(contract)?.kind, "conflict");
  assert.equal(getNextQuestion(contract)?.key, "executionTiming");
  assert.equal(isContractReady(contract), false);
});

test("回测工具请求包含合同版本且审计不会虚报未实现能力", async () => {
  let contract = createStrategyContract("multi_factor", "backtest-tool");
  for (const [key, value] of [["factorsOrSignals", "估值、质量"], ["universe", "沪深 300"], ["rebalanceFrequency", "每月"], ["executionTiming", "收盘生成信号，下一交易日开盘执行"], ["positionLimit", "单只标的不超过 10%"]]) {
    contract = updateContractField(contract, key, value, "user", "测试补全。" );
  }
  const request = buildBacktestRequest(contract);
  const run = await new MockBacktestTool().run(request, contract);
  assert.equal(run.request.contractVersion, contract.version);
  assert.equal(run.status, "completed");
  assert.equal(run.audit.checks.find((item) => item.id === "price-limit")?.status, "not_run");
  assert.equal(run.audit.status, "warning");
});

test("未来信息冲突会让回测工具拒绝生成结果", async () => {
  let contract = createStrategyContract("timing", "audit-reject");
  contract = updateContractField(contract, "executionTiming", "当日收盘成交", "user", "用户明确。" );
  const audit = auditContract(contract);
  const run = await new MockBacktestTool().run(buildBacktestRequest(contract), contract);
  assert.equal(audit.status, "failed");
  assert.equal(run.status, "rejected");
  assert.equal(run.result, null);
});
