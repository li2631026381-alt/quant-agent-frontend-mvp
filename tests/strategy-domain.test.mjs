import test from "node:test";
import assert from "node:assert/strict";
import {
  applyNaturalLanguage,
  createEmptyStrategyContract,
  createStrategyContract,
  detectStrategyType,
  getContractProgress,
  getNextQuestion,
  updateContractField,
} from "../lib/strategy-domain.ts";

test("新策略会话在用户首次输入前不接受默认值", () => {
  const contract = createEmptyStrategyContract("blank-session");
  const progress = getContractProgress(contract);

  assert.equal(contract.templateLabel, "待识别策略类型");
  assert.equal(progress.resolved, 0);
  assert.equal(progress.total, 10);
  assert.equal(progress.percent, 0);
});

test("识别三种首批策略模板", () => {
  assert.equal(detectStrategyType("做低估值和质量多因子选股"), "multi_factor");
  assert.equal(detectStrategyType("测试 20 日和 60 日均线择时"), "timing");
  assert.equal(detectStrategyType("做行业 ETF 动量轮动"), "rotation");
});

test("自然语言只增量修改相关字段", () => {
  let contract = createStrategyContract("multi_factor", "incremental-test");
  contract = applyNaturalLanguage(contract, "股票池使用沪深 300").contract;
  const universeBefore = contract.fields.universe;

  contract = applyNaturalLanguage(contract, "调仓改成每季度").contract;

  assert.equal(contract.fields.universe?.value, "沪深 300");
  assert.equal(contract.fields.universe?.source, universeBefore?.source);
  assert.equal(contract.fields.rebalanceFrequency?.value, "每季度");
  assert.equal(contract.fields.rebalanceFrequency?.source, "user");
});

test("本地回退可识别小写 a股 市场表达", () => {
  const contract = createEmptyStrategyContract("lowercase-a-share");
  const turn = applyNaturalLanguage(contract, "我要研究a股市场");

  assert.equal(turn.contract.fields.market?.value, "A 股");
  assert.equal(turn.contract.fields.market?.source, "user");
  assert.ok(turn.recognized.includes("市场：A 股"));
});

test("切换策略类型会加载新模板并保留公共字段", () => {
  let contract = createStrategyContract("multi_factor", "template-test");
  contract = applyNaturalLanguage(contract, "下一交易日开盘执行").contract;
  contract = applyNaturalLanguage(contract, "改做 20 日和 60 日均线择时").contract;

  assert.equal(contract.templateId, "timing");
  assert.equal(contract.fields.executionTiming?.value, "收盘生成信号，下一交易日开盘执行");
  assert.equal(contract.fields.signalDefinition?.value, "20 日均线与 60 日均线交叉");
  assert.ok(contract.fields.targetAsset);
  assert.equal(contract.fields.factorsOrSignals, undefined);
});

test("不同策略模板产生不同澄清字段和动态进度", () => {
  const multiFactor = createStrategyContract("multi_factor", "progress-multi");
  const timing = createStrategyContract("timing", "progress-timing");
  const rotation = createStrategyContract("rotation", "progress-rotation");

  assert.equal(getNextQuestion(multiFactor)?.key, "factorsOrSignals");
  assert.equal(getNextQuestion(timing)?.key, "targetAsset");
  assert.equal(getNextQuestion(rotation)?.key, "candidateAssets");
  assert.notDeepEqual(getContractProgress(multiFactor).pendingLabels, getContractProgress(timing).pendingLabels);
});

test("字段来源和合同变更记录会随修改更新", () => {
  let contract = createStrategyContract("multi_factor", "history-test");
  contract = updateContractField(contract, "universe", "沪深 300", "user", "用户明确股票池。");
  contract = updateContractField(contract, "universe", "中证 500", "user_override", "用户修改股票池。");

  assert.equal(contract.fields.universe?.source, "user_override");
  assert.equal(contract.version, 3);
  assert.equal(contract.changes.length, 2);
  assert.deepEqual(
    contract.changes.map((change) => [change.fromValue, change.toValue]),
    [[null, "沪深 300"], ["沪深 300", "中证 500"]],
  );
});
