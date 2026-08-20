"use client";

import { useEffect, useMemo, useState } from "react";
import {
  backtestSteps,
  defaultMessages,
  experiments,
  initialContract,
  type AgentStage,
  type BacktestResult,
  type Message,
} from "@/lib/mock-data";
import { auditContract, runBacktestTool, type BacktestAuditReport } from "@/lib/backtest";
import type { AgentTurnResult } from "@/lib/agent";
import {
  contractSourceLabels,
  createStrategyContract,
  getContractFields,
  getContractProgress,
  getNextQuestion,
  isContractReady,
  updateContractField,
  type ClarificationQuestion,
  type ContractProgress,
  type StrategyContract,
} from "@/lib/strategy-domain";

type View = "research" | "experiments" | "report" | "data";
type InspectorTab = "contract" | "audit";

const stageLabel: Record<AgentStage, string> = {
  idle: "待开始",
  parsing: "分析中",
  clarifying: "澄清中",
  contract_ready: "合同完成",
  awaiting_confirmation: "等待确认",
  backtest_running: "准备回测",
  audit_running: "回测审计",
  report_ready: "回测完成",
};

const metricCards: Array<{ label: string; key: keyof BacktestResult; tone?: string }> = [
  { label: "累计收益", key: "cumulativeReturn", tone: "positive" },
  { label: "年化收益", key: "annualizedReturn", tone: "positive" },
  { label: "基准收益", key: "benchmarkReturn" },
  { label: "最大回撤", key: "maxDrawdown", tone: "risk" },
  { label: "夏普比率", key: "sharpe", tone: "positive" },
  { label: "年化波动率", key: "annualizedVolatility" },
  { label: "胜率", key: "winRate" },
  { label: "换手率", key: "turnover" },
];

const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: "research", label: "当前研究", icon: "⌂" },
  { id: "experiments", label: "实验历史", icon: "◫" },
  { id: "data", label: "数据源", icon: "◌" },
  { id: "report", label: "回测报告", icon: "▥" },
];

export default function Home() {
  const [view, setView] = useState<View>("research");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("contract");
  const [stage, setStage] = useState<AgentStage>("clarifying");
  const [contract, setContract] = useState<StrategyContract>(initialContract);
  const [messages, setMessages] = useState<Message[]>(defaultMessages);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [backtestStep, setBacktestStep] = useState(0);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [auditReport, setAuditReport] = useState<BacktestAuditReport | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [activeExperiment, setActiveExperiment] = useState("exp-002");

  const activeConfig = getNextQuestion(contract);
  const contractProgress = getContractProgress(contract);
  const isBacktest = stage === "backtest_running" || stage === "audit_running";

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (stage !== "backtest_running") return;
    if (backtestStep < backtestSteps.length - 1) {
      const timer = window.setTimeout(() => setBacktestStep((step) => step + 1), 580);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      setStage("audit_running");
      setBacktestStep(0);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [stage, backtestStep]);

  useEffect(() => {
    if (stage !== "audit_running") return;
    let cancelled = false;
    void runBacktestTool(contract).then((run) => {
      if (cancelled) return;
      setResult(run.result);
      setAuditReport(run.audit);
      setInspectorTab("audit");
      if (run.status === "rejected" || !run.result) {
        setStage("clarifying");
        setView("research");
        setToast("审计发现阻塞错误，请先修改策略合同");
        return;
      }
      setStage("report_ready");
      setView("report");
      setToast("回测与审计完成，报告已生成");
    });
    return () => { cancelled = true; };
  }, [stage, contract]);

  function addMessage(message: Omit<Message, "id">) {
    setMessages((current) => [...current, { ...message, id: `${message.role}-${Date.now()}-${current.length}` }]);
  }

  function syncContractStage(next: StrategyContract) {
    setStage(isContractReady(next) ? "awaiting_confirmation" : "clarifying");
  }

  function nextStepText(next: StrategyContract): string {
    const nextQuestion = getNextQuestion(next);
    return nextQuestion
      ? `接下来确认${nextQuestion.label}。`
      : "策略合同已经具备可执行定义，请在右侧检查字段来源和变更记录。";
  }

  function acceptDefault() {
    if (!activeConfig) return;
    const next = updateContractField(contract, activeConfig.key, activeConfig.value, "agent_default", activeConfig.reason);
    setContract(next);
    syncContractStage(next);
    setExplanationOpen(false);
    setCustomOpen(false);
    setToast(`已采用默认值：${activeConfig.value}`);
    addMessage({ role: "agent", text: `已将${activeConfig.label}记录为“${activeConfig.value}”。${nextStepText(next)}`, tone: "success" });
  }

  function applyCustom(value: string) {
    if (!activeConfig) return;
    const next = updateContractField(contract, activeConfig.key, value, "user_override", `用户将${activeConfig.label}修改为“${value}”。`);
    setContract(next);
    syncContractStage(next);
    setCustomOpen(false);
    setExplanationOpen(false);
    setToast(`已更新${activeConfig.label}：${value}`);
    addMessage({ role: "agent", text: `已采用你的${activeConfig.label}设置“${value}”。${nextStepText(next)}`, tone: "success" });
  }

  function applyCustomText() {
    if (!activeConfig) return;
    const value = customInput.trim();
    if (!value) {
      setToast(`请先描述你的${activeConfig.label}方案`);
      return;
    }
    addMessage({ role: "user", text: `我建议${activeConfig.label}：${value}` });
    const next = updateContractField(contract, activeConfig.key, value, "user_override", `用户自定义${activeConfig.label}：“${value}”。`);
    setContract(next);
    syncContractStage(next);
    addMessage({ role: "agent", text: `我会将${activeConfig.label}记录为“${value}”。${nextStepText(next)}`, tone: "success" });
    setCustomInput("");
    setCustomOpen(false);
    setExplanationOpen(false);
    setToast(`已记录你的${activeConfig.label}方案`);
  }

  function explainDefault() {
    setExplanationOpen((current) => !current);
  }

  async function handleInputSubmit() {
    const text = input.trim();
    if (!text) {
      setToast("先写一句你的策略想法，助手会从这里开始");
      return;
    }
    addMessage({ role: "user", text });
    setInput("");
    setAgentBusy(true);
    setStage("parsing");
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text, contract }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const update = await response.json() as AgentTurnResult;
      setContract(update.contract);
      syncContractStage(update.contract);
      if (update.recognized.length === 0) {
        addMessage({ role: "agent", text: `${update.summary}${update.nextQuestion ? ` 建议先继续确认${update.nextQuestion.label}。` : " 当前合同没有待确认项。"}`, tone: "warning" });
        setToast("未识别到明确规则，已保留当前策略并继续");
      } else {
        const templateNote = update.templateChanged ? ` 已切换为“${update.contract.templateLabel}”模板。` : "";
        const conflictNote = update.contract.conflicts.some((item) => item.severity === "blocking") ? " 检测到阻塞冲突，需要先解决。" : "";
        addMessage({ role: "agent", text: `${update.summary}${templateNote}${conflictNote} ${nextStepText(update.contract)}`, tone: conflictNote ? "warning" : "success" });
        setToast(`${update.provider === "deepseek" ? "在线模型" : "本地回退"}已更新合同 ${update.changedFields.length} 项`);
      }
    } catch {
      setStage("clarifying");
      addMessage({ role: "agent", text: "这次解析请求没有完成，合同未发生变化。你可以直接重试。", tone: "warning" });
      setToast("解析失败，策略合同未修改");
    } finally {
      setAgentBusy(false);
    }
  }

  function confirmAndBacktest() {
    if (!isContractReady(contract)) {
      setStage("clarifying");
      setToast("还有待确认字段或阻塞冲突，暂时不能回测");
      return;
    }
    setView("research");
    setStage("backtest_running");
    setBacktestStep(0);
    setResult(null);
    setAuditReport(null);
    addMessage({ role: "system", text: "已确认策略合同，开始执行模拟回测流程。" });
  }

  function skipBacktest() {
    if (!isBacktest) return;
    setBacktestStep(backtestSteps.length - 1);
    const report = auditContract(contract);
    setAuditReport(report);
    setResult(report.status === "failed" ? null : currentResult);
    if (report.status === "failed") {
      setStage("clarifying");
      setInspectorTab("audit");
      setToast("审计发现阻塞错误，请先修改策略合同");
      return;
    }
    setStage("report_ready");
    setInspectorTab("audit");
    setView("report");
    setToast("已跳过等待，模拟回测报告已生成");
  }

  function newResearch() {
    setView("research");
    setStage("clarifying");
    setContract(createStrategyContract("multi_factor"));
    setMessages([{ id: "agent-new", role: "agent", text: "告诉我你想研究什么样的 A 股策略。我会逐步把它澄清成可回测规则。" }]);
    setResult(null);
    setAuditReport(null);
    setInspectorTab("contract");
    setToast("已新建策略研究");
  }

  const activeExperimentData = useMemo(() => experiments.find((item) => item.id === activeExperiment) ?? experiments[1], [activeExperiment]);
  const currentResult = result ?? activeExperimentData.result;

  return (
    <div className="app-shell">
      <header className="window-bar">
        <div className="traffic-lights"><span /><span /><span /></div>
        <div className="window-title">量化助手 · 策略实验室</div>
        <div className="window-spacer" />
        <button className="top-action" type="button" onClick={() => setToast("命令面板是下一阶段能力，当前为模拟占位")}>⌘ K</button>
        <button className="top-action" type="button" onClick={() => setToast("帮助：先描述策略，再逐步确认助手推荐的默认值")}>?</button>
        <div className="user-avatar">LX</div>
      </header>

      <div className={`app-body ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <aside className="sidebar">
          <div className="brand-row"><span className="brand-mark">Q</span><span>量化助手</span><button className="sidebar-toggle sidebar-toggle-in-sidebar" type="button" aria-label="收起侧边栏" title="收起侧边栏" onClick={() => setSidebarCollapsed(true)}><span className="sidebar-icon" /></button></div>
          <button className="new-research" type="button" onClick={newResearch}><span className="plus">＋</span><span>新建策略研究</span></button>

          <div className="nav-label">工作区</div>
          {navItems.map((item) => (
            <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} type="button" onClick={() => setView(item.id)}>
              <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
            </button>
          ))}

          <div className="nav-label">策略项目</div>
          <button className="project-item selected" type="button" onClick={() => setView("research")}>
            <span className="project-title"><span className="project-dot" /><span>A股低波动多因子</span></span>
            <span className="project-meta">{stageLabel[stage]} · 刚刚</span>
          </button>
          <button className="project-item muted-project" type="button" onClick={() => setToast("历史项目是模拟占位") }>
            <span className="project-title"><span className="project-dot gray" /><span>行业轮动实验</span></span>
            <span className="project-meta">上次回测 · 8 月 12 日</span>
          </button>

        </aside>

        <main className="main-pane">
          <div className="main-head">
            <div className="main-head-left">
              {sidebarCollapsed && <button className="sidebar-toggle sidebar-toggle-in-main" type="button" aria-label="展开侧边栏" title="展开侧边栏" onClick={() => setSidebarCollapsed(false)}><span className="sidebar-icon" /></button>}
              <div className="breadcrumb"><span>策略项目</span><span>›</span><strong>{view === "experiments" ? "实验历史" : view === "report" ? "回测报告" : view === "data" ? "数据源" : "A股低波动多因子"}</strong></div>
            </div>
            <div className="run-status"><span className={`status-dot ${isBacktest ? "running" : stage === "report_ready" ? "done" : ""}`} /><span>{stageLabel[stage]}</span></div>
          </div>

          {view === "research" && (
            <ResearchView
              messages={messages}
              stage={stage}
              activeConfig={activeConfig}
              contractProgress={contractProgress}
              explanationOpen={explanationOpen}
              customOpen={customOpen}
              customInput={customInput}
              input={input}
              agentBusy={agentBusy}
              onInputChange={setInput}
              onSubmit={handleInputSubmit}
              onAccept={acceptDefault}
              onCustom={() => setCustomOpen((current) => !current)}
              onExplain={explainDefault}
              onApplyCustom={applyCustom}
              onCustomInputChange={setCustomInput}
              onApplyCustomText={applyCustomText}
              onConfirm={confirmAndBacktest}
              onReturnToEdit={() => { setStage("clarifying"); setToast("请在下方输入要修改的规则"); }}
              onSkip={skipBacktest}
              backtestStep={backtestStep}
            />
          )}
          {view === "report" && <ReportView result={currentResult} onBack={() => setView("research")} />}
          {view === "experiments" && <ExperimentsView activeId={activeExperiment} onSelect={setActiveExperiment} />}
          {view === "data" && <DataView />}
        </main>

        <aside className="inspector">
          <div className="inspector-tabs">
            <button className={inspectorTab === "contract" ? "selected" : ""} type="button" onClick={() => setInspectorTab("contract")}>策略合同</button>
            <button className={inspectorTab === "audit" ? "selected" : ""} type="button" onClick={() => setInspectorTab("audit")}>审计</button>
          </div>
          {inspectorTab === "contract" ? (
            <ContractPanel contract={contract} onEdit={() => { setView("research"); setStage("clarifying"); setToast("请在中央对话中描述要修改的规则"); }}/>
          ) : (
            <AuditPanel result={result} report={auditReport} />
          )}
        </aside>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function ResearchView({
  messages,
  stage,
  activeConfig,
  contractProgress,
  explanationOpen,
  customOpen,
  customInput,
  input,
  agentBusy,
  onInputChange,
  onSubmit,
  onAccept,
  onCustom,
  onExplain,
  onApplyCustom,
  onCustomInputChange,
  onApplyCustomText,
  onConfirm,
  onReturnToEdit,
  onSkip,
  backtestStep,
}: {
  messages: Message[];
  stage: AgentStage;
  activeConfig: ClarificationQuestion | null;
  contractProgress: ContractProgress;
  explanationOpen: boolean;
  customOpen: boolean;
  customInput: string;
  input: string;
  agentBusy: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onAccept: () => void;
  onCustom: () => void;
  onExplain: () => void;
  onApplyCustom: (value: string) => void;
  onCustomInputChange: (value: string) => void;
  onApplyCustomText: () => void;
  onConfirm: () => void;
  onReturnToEdit: () => void;
  onSkip: () => void;
  backtestStep: number;
}) {
  const isRunning = stage === "backtest_running" || stage === "audit_running";
  const isReady = stage === "awaiting_confirmation";

  return (
    <section className="conversation-shell">
      <div className="conversation-scroll">
        {messages.map((message) => (
          <div key={message.id} className={`message-row ${message.role}`}>
            <div className={`message-avatar ${message.role}`}>{message.role === "user" ? "你" : message.role === "system" ? "✓" : "Q"}</div>
            <div className="message-content">
              <div className="message-author">{message.role === "user" ? "你" : message.role === "system" ? "研究流程" : "量化助手"}</div>
              <div className={`message-text ${message.tone ?? ""}`}>{message.text}</div>
            </div>
          </div>
        ))}

        {activeConfig && !isRunning && !isReady && !agentBusy && (
          <div className="recommendation-card">
            <p>{activeConfig.description}我先按这个设置继续。</p>
            <div className="recommendation-actions">
              <button className="primary-button" type="button" onClick={onAccept}>采用并继续</button>
              <button className="secondary-button" type="button" onClick={onCustom}>修改</button>
              <button className="secondary-button" type="button" onClick={onExplain}>解释</button>
            </div>
            {customOpen && (
              <div className="custom-options">
                <div className="custom-title">选择预设，或直接描述你的方案</div>
                {activeConfig.alternatives.map((option) => <button key={option} type="button" onClick={() => onApplyCustom(option)}>{option}</button>)}
                <div className="custom-entry">
                  <div className="custom-textarea-wrap">
                    <textarea value={customInput} onChange={(event) => onCustomInputChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onApplyCustomText(); } }} placeholder={`例如：自定义${activeConfig.shortLabel}规则……`} rows={2} />
                    <span className="custom-enter-hint" aria-hidden="true">↵</span>
                  </div>
                </div>
              </div>
            )}
            {explanationOpen && (
              <div className="explanation-box"><strong>为什么推荐这个默认值？</strong><span>{activeConfig.reason}</span><small>这只是研究起点，接受后仍可在策略合同中修改。</small></div>
            )}
          </div>
        )}

        {isRunning && <BacktestProgress step={backtestStep} onSkip={onSkip} stage={stage} />}

        {isReady && (
          <div className="confirmation-card">
            <div className="confirmation-icon">✓</div>
            <div>
              <h2>策略合同已完成</h2>
              <p>所有核心字段都具备可执行定义。请检查右侧默认假设后决定是否开始模拟回测。</p>
              <div className="confirmation-counts"><span>用户明确：{contractProgress.sourceCounts.user} 项</span><span>系统默认：{contractProgress.sourceCounts.agent_default} 项</span><span>用户修改：{contractProgress.sourceCounts.user_override} 项</span></div>
              <div className="recommendation-actions"><button className="secondary-button" type="button" onClick={onReturnToEdit}>返回修改</button><button className="primary-button" type="button" onClick={onConfirm}>确认策略并开始回测</button></div>
            </div>
          </div>
        )}

        {stage === "report_ready" && <div className="report-ready-note"><span>✓</span><span>回测与审计完成。你可以从左侧打开回测报告，或继续创建下一组实验。</span></div>}

        <div className="progress-block">
          <div className="progress-header"><span>可回测准备度</span><span>{contractProgress.resolved} / {contractProgress.total} 项 · {contractProgress.percent}%</span></div>
          <div className="progress-bar"><span style={{ width: `${contractProgress.percent}%` }} /></div>
          <div className="progress-items">
            <span className="complete">✓ 已完成 {contractProgress.resolved} 项</span>
            <span className={contractProgress.pendingLabels.length ? "current" : "complete"}>{contractProgress.pendingLabels.length ? `○ 待确认：${contractProgress.pendingLabels.slice(0, 4).join("、")}` : "✓ 没有阻塞项"}</span>
            {contractProgress.blockingConflicts.length > 0 && <span className="current">! 冲突：{contractProgress.blockingConflicts.map((item) => item.message).join("；")}</span>}
          </div>
        </div>
      </div>

      <form className="composer" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <textarea disabled={agentBusy} value={input} onChange={(event) => onInputChange(event.target.value)} placeholder={agentBusy ? "正在分析并校验合同……" : "告诉助手你的想法，或者修改当前策略合同……"} rows={1} />
        <div className="composer-row"><span className="composer-tools"><button type="button">＋</button><button type="button">⌁</button><button type="button">◉</button></span><span className="composer-mode">{agentBusy ? "正在分析" : "策略澄清⌄"}</span><button className="send-button" disabled={agentBusy} type="submit">↑</button></div>
      </form>
    </section>
  );
}

function BacktestProgress({ step, onSkip, stage }: { step: number; onSkip: () => void; stage: AgentStage }) {
  const activeStep = stage === "audit_running" ? 4 : step;
  return (
    <div className="backtest-progress">
      <div className="backtest-head"><div><span className="eyebrow">执行进度</span><h2>{stage === "audit_running" ? "正在执行回测审计" : "正在运行模拟回测"}</h2></div><button className="secondary-button compact" type="button" onClick={onSkip}>跳过等待</button></div>
      <div className="execution-list">{backtestSteps.map((item, index) => <div key={item.id} className={`execution-row ${index < activeStep ? "done" : index === activeStep ? "running" : ""}`}><span className="execution-icon">{index < activeStep ? "✓" : index === activeStep ? "○" : "·"}</span><span>{item.label}</span><span className="execution-status">{index < activeStep ? "完成" : index === activeStep ? "进行中" : "等待"}</span></div>)}</div>
    </div>
  );
}

function ContractPanel({ contract, onEdit }: { contract: StrategyContract; onEdit: () => void }) {
  const fields = getContractFields(contract);
  const assumptions = fields.filter((field) => field.source === "agent_default");
  const changes = contract.changes.slice(-5).reverse();
  return (
    <div className="inspector-content"><div className="panel-eyebrow">{contract.templateLabel} · 版本 {contract.version}</div><div className="contract-heading"><span>策略合同</span><button type="button" onClick={onEdit}>编辑</button></div>
      <div className="contract-rows">{fields.map((field) => <div className="contract-row" key={field.key}><div><span>{field.label}</span><small>{contractSourceLabels[field.source]}</small></div><strong className={field.source === "pending" ? "pending" : field.source === "agent_default" ? "default" : ""}>{field.value ?? "待确认"}</strong></div>)}</div>
      <div className="inspector-section"><div className="panel-eyebrow">默认假设</div>{assumptions.slice(-4).map((field) => <div className="assumption-row" key={`${field.key}-${field.value}`}><span className="assumption-dot">●</span><span>{field.label}<small>{field.value}</small></span><em>{contractSourceLabels[field.source]}</em></div>)}</div>
      <div className="inspector-section"><div className="panel-eyebrow">合同变更</div>{changes.length ? changes.map((change) => <div className="change-row" key={change.id}><span>v{change.version}</span><span>{change.fieldLabel}<small>{change.fromValue ?? "待确认"} → {change.toValue}</small></span><em>{contractSourceLabels[change.source]}</em></div>) : <div className="empty-history">暂无变更</div>}</div>
      {contract.conflicts.length > 0 && <div className="inspector-section"><div className="panel-eyebrow">规则冲突</div>{contract.conflicts.map((conflict) => <div className={`audit-row ${conflict.severity === "blocking" ? "fail" : "warning"}`} key={conflict.id}><span className="audit-icon">!</span><span>{conflict.message}</span><em>{conflict.severity === "blocking" ? "阻塞" : "警告"}</em></div>)}</div>}
      <div className="inspector-notice"><strong>助手的工作原则</strong><span>可以推荐默认值继续，但所有默认假设都会记录，并在回测前集中确认。</span></div>
    </div>
  );
}

function AuditPanel({ result, report }: { result: BacktestResult | null; report: BacktestAuditReport | null }) {
  const items = report?.checks ?? [];
  return (
    <div className="inspector-content"><div className="panel-eyebrow">审计检查</div><div className="contract-heading"><span>回测审计</span><button type="button">查看规则</button></div>
      {items.length ? items.map((item) => <div className={`audit-row ${item.status === "passed" ? "pass" : item.status === "failed" ? "fail" : "warning"}`} key={item.id} title={`${item.message}；依据：${item.evidence}`}><span className="audit-icon">{item.status === "passed" ? "✓" : "!"}</span><span>{item.label}</span><em>{item.status === "passed" ? "通过" : item.status === "failed" ? "失败" : item.status === "not_run" ? "未执行" : "警告"}</em></div>) : <div className="empty-history">完成一次回测后生成结构化审计结果</div>}
      <div className="inspector-section"><div className="panel-eyebrow">净值预览</div><div className="mini-chart"><svg viewBox="0 0 280 90" preserveAspectRatio="none" role="img" aria-label="模拟净值曲线"><defs><linearGradient id="equity-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#79c99a" stopOpacity=".35"/><stop offset="1" stopColor="#79c99a" stopOpacity="0"/></linearGradient></defs><path className="chart-area" fill="url(#equity-area)" d="M0 82 L20 73 L40 76 L60 57 L80 61 L100 47 L120 51 L140 34 L160 42 L180 25 L200 33 L220 20 L240 25 L260 11 L280 18 L280 90 L0 90 Z"/><path className="chart-line" d="M0 82 L20 73 L40 76 L60 57 L80 61 L100 47 L120 51 L140 34 L160 42 L180 25 L200 33 L220 20 L240 25 L260 11 L280 18"/></svg></div><div className="chart-caption"><span>{result ? "模拟报告已完成" : "开始回测后显示"}</span><span>{result?.cumulativeReturn ?? "—"}</span></div></div>
      <div className="inspector-notice"><strong>研究边界</strong><span>模拟结果仅用于体验流程，不代表真实历史收益或投资建议。</span></div>
    </div>
  );
}

function ReportView({ result, onBack }: { result: BacktestResult; onBack: () => void }) {
  return (
    <section className="report-view"><div className="report-top"><div><h1 className="page-title">A股低波动多因子</h1></div><button className="secondary-button" type="button" onClick={onBack}>返回研究</button></div>
      <div className="synthetic-banner">当前为模拟回测结果，仅用于体验产品流程，不代表真实历史收益或投资建议。</div>
      <div className="metric-grid">{metricCards.map((item) => <div className={`metric-card ${item.tone ?? ""}`} key={item.key}><span>{item.label}</span><strong>{String(result[item.key])}</strong></div>)}</div>
      <div className="chart-grid"><div className="report-panel"><div className="report-panel-head"><span>净值曲线</span><small>2020—2025 · 模拟</small></div><div className="large-chart"><svg viewBox="0 0 620 210" preserveAspectRatio="none" role="img" aria-label="模拟净值曲线"><defs><linearGradient id="report-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#79c99a" stopOpacity=".24"/><stop offset="1" stopColor="#79c99a" stopOpacity="0"/></linearGradient></defs><g className="grid-lines"><path d="M0 42 H620 M0 84 H620 M0 126 H620 M0 168 H620" /></g><path className="chart-area" fill="url(#report-area)" d="M0 181 L38 169 L76 174 L114 146 L152 153 L190 125 L228 133 L266 100 L304 113 L342 72 L380 86 L418 55 L456 68 L494 43 L532 52 L570 19 L620 33 L620 210 L0 210 Z"/><path className="chart-line" d="M0 181 L38 169 L76 174 L114 146 L152 153 L190 125 L228 133 L266 100 L304 113 L342 72 L380 86 L418 55 L456 68 L494 43 L532 52 L570 19 L620 33"/></svg><div className="chart-axis"><span>2020</span><span>2021</span><span>2022</span><span>2023</span><span>2024</span><span>2025</span></div></div></div><div className="report-panel"><div className="report-panel-head"><span>回撤曲线</span><small>风险观察</small></div><div className="drawdown-chart"><svg viewBox="0 0 320 210" preserveAspectRatio="none" role="img" aria-label="模拟回撤曲线"><path className="draw-grid" d="M0 42 H320 M0 84 H320 M0 126 H320 M0 168 H320"/><path className="draw-area" d="M0 37 L20 42 L40 30 L60 58 L80 45 L100 112 L120 89 L140 139 L160 120 L180 84 L200 101 L220 67 L240 157 L260 105 L280 126 L300 91 L320 104 L320 0 L0 0 Z"/></svg><div className="chart-axis"><span>低风险</span><span>—</span><span>-21.5% 最大回撤</span></div></div></div></div>
      <div className="report-lower"><div className="report-panel trade-panel"><div className="report-panel-head"><span>最近交易明细</span></div><div className="trade-table"><div className="trade-head"><span>日期</span><span>标的</span><span>动作</span><span>价格</span><span>结果</span></div>{[["2025-06-30", "贵州茅台", "买入", "¥1,487", "—"], ["2025-07-31", "宁德时代", "卖出", "¥182", "+8.4%"], ["2025-08-29", "招商银行", "买入", "¥38.2", "—"], ["2025-09-30", "中国平安", "卖出", "¥49.6", "-1.2%"]].map((row) => <div className="trade-row" key={`${row[0]}-${row[1]}`}>{row.map((value, index) => <span className={index === 2 ? (value === "买入" ? "buy" : "sell") : index === 4 && value.startsWith("+") ? "positive-text" : index === 4 && value.startsWith("-") ? "risk-text" : ""} key={`${value}-${index}`}>{value}</span>)}</div>)}</div></div><div className="agent-conclusion"><div className="panel-eyebrow">结论</div><h2>结果值得继续研究，但还没有通过实盘闸门。</h2><p>该策略在模拟样本内收益优于基准，但最大回撤较高；建议先进行样本外测试，不建议直接进入实盘。</p><div className="conclusion-tags"><span>样本外测试未完成</span><span>未来函数未发现</span></div></div></div>
    </section>
  );
}

function ExperimentsView({ activeId, onSelect }: { activeId: string; onSelect: (id: string) => void }) {
  return <section className="experiments-view"><div className="experiments-head"><div><h1 className="page-title">实验历史</h1></div><span className="experiment-count">3 个实验</span></div><div className="experiment-layout"><div className="experiment-list">{experiments.map((item) => <button type="button" key={item.id} className={`experiment-item ${activeId === item.id ? "selected" : ""}`} onClick={() => onSelect(item.id)}><span className="experiment-id">{item.id.replace("exp-", "实验 ")}</span><strong>{item.name}</strong><small>{item.changes.join(" · ")}</small><em className={item.auditStatus === "警告" ? "warning" : "pass"}>{item.auditStatus}</em></button>)}</div><div className="experiment-detail"><div className="report-panel-head"><span>实验对比</span><small>指标对比</small></div><div className="comparison-table"><div className="comparison-row header"><span>指标</span><span>实验 001</span><span>实验 002</span><span>实验 003</span></div>{[["累计收益", "18.4%", "24.7%", "21.9%"], ["最大回撤", "-16.2%", "-21.5%", "-13.8%"], ["夏普比率", "0.91", "1.08", "1.02"], ["换手率", "4.8", "8.6", "3.1"], ["审计状态", "通过", "警告", "通过"]].map((row) => <div className="comparison-row" key={row[0]}>{row.map((value, index) => <span className={row[0] === "审计状态" ? (value === "警告" ? "risk-text" : "positive-text") : index > 0 && value.startsWith("-") ? "risk-text" : ""} key={`${value}-${index}`}>{value}</span>)}</div>)}</div><div className="experiment-insight"><span>✦</span><p><strong>{experiments.find((item) => item.id === activeId)?.name}</strong> 当前被选中。助手建议优先关注样本外表现和最大回撤，不要只按累计收益排序。</p></div></div></div></section>;
}

function DataView() {
  return <section className="data-view"><h1 className="page-title">数据源</h1><div className="data-source-card"><div className="source-icon">◌</div><div><h2>模拟 A 股日线数据</h2><p>用于演示策略合同、回测阶段和审计报告的固定数据源。</p><div className="source-meta"><span>状态：可用</span><span>来源：本地模拟</span><span>时间范围：2020—2025</span></div></div></div><div className="data-notice"><strong>为什么现在不接真实数据？</strong><span>这个第一版的目标是先验证助手澄清策略的交互闭环。真实数据接入会在策略合同、回测审计和数据时间边界稳定后再进行。</span></div></section>;
}
