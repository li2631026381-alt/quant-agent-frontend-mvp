import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyAgentInterpretation } from "../lib/agent.ts";
import { createStrategyContract } from "../lib/strategy-domain.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(fs.readFileSync(path.join(root, "cases.json"), "utf8"));
const details = [];

for (const item of cases) {
  let contract = createStrategyContract(item.template, `eval-${item.id}`);
  const startVersion = contract.version;
  let turn;
  for (const input of item.inputs) {
    turn = applyAgentInterpretation(contract, input);
    contract = turn.contract;
  }
  const failures = [];
  if (item.expect.template && contract.templateId !== item.expect.template) failures.push(`模板=${contract.templateId}`);
  for (const [key, value] of Object.entries(item.expect.fields ?? {})) {
    if (contract.fields[key]?.value !== value) failures.push(`${key}=${contract.fields[key]?.value ?? "空"}`);
  }
  for (const [key, source] of Object.entries(item.expect.source ?? {})) {
    if (contract.fields[key]?.source !== source) failures.push(`${key}.source=${contract.fields[key]?.source ?? "空"}`);
  }
  if (item.expect.conflict && !contract.conflicts.some((conflict) => conflict.id === item.expect.conflict)) failures.push(`缺少冲突=${item.expect.conflict}`);
  if (item.expect.noConflict && contract.conflicts.some((conflict) => conflict.id === item.expect.noConflict)) failures.push(`冲突未解除=${item.expect.noConflict}`);
  if (item.expect.nextQuestion && turn?.nextQuestion?.key !== item.expect.nextQuestion) failures.push(`下一问题=${turn?.nextQuestion?.key ?? "空"}`);
  if (item.expect.changed !== undefined && contract.version - startVersion !== item.expect.changed) failures.push(`变更数=${contract.version - startVersion}`);
  details.push({ id: item.id, name: item.name, passed: failures.length === 0, failures });
}

const passed = details.filter((item) => item.passed).length;
const metrics = {
  total: details.length,
  passed,
  failed: details.length - passed,
  passRate: Number((passed / details.length).toFixed(4)),
  validContractRate: Number((details.filter((item) => !item.failures.some((failure) => failure.startsWith("模板="))).length / details.length).toFixed(4)),
  fieldAndSourceAccuracy: Number((details.filter((item) => !item.failures.some((failure) => failure.includes("=") && !failure.startsWith("下一问题="))).length / details.length).toFixed(4)),
  questionPlanningAccuracy: Number((details.filter((item) => !item.failures.some((failure) => failure.startsWith("下一问题="))).length / details.length).toFixed(4)),
};

const output = { generatedAt: new Date().toISOString(), mode: "local_fallback", metrics, details };
fs.mkdirSync(path.join(root, "results"), { recursive: true });
fs.writeFileSync(path.join(root, "results", "latest.json"), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(metrics, null, 2));
for (const detail of details.filter((item) => !item.passed)) console.error(`${detail.id} ${detail.name}: ${detail.failures.join("；")}`);
if (passed !== details.length) process.exitCode = 1;
