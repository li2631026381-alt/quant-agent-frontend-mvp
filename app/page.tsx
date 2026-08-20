"use client";

import { useEffect, useMemo, useState } from "react";
import {
  backtestSteps,
  contractRows,
  defaultAssumptions,
  defaultReasons,
  defaultMessages,
  experiments,
  initialContract,
  initialSources,
  mockBacktestResult,
  type AgentStage,
  type Assumption,
  type BacktestResult,
  type ContractSource,
  type Message,
  type StrategyContract,
} from "@/lib/mock-data";
import { contractFromIntent, parseIntent } from "@/lib/agent";

type View = "research" | "experiments" | "report" | "data";
type InspectorTab = "contract" | "audit";
type QuestionKey = "universe" | "rebalanceFrequency" | "executionTiming" | "positionLimit";

type QuestionConfig = {
  key: QuestionKey;
  label: string;
  shortLabel: string;
  value: string;
  description: string;
  reason: string;
  alternatives: string[];
};

const questionConfigs: QuestionConfig[] = [
  {
    key: "universe",
    label: "股票池",
    shortLabel: "股票池",
    value: "沪深 300",
    description: "你没有指定股票池。我建议先使用沪深 300 成分股，流动性较好，也能减少小盘股数据缺失对实验的影响。",
    reason: defaultReasons.universe,
    alternatives: ["中证 500", "全 A 股"],
  },
  {
    key: "rebalanceFrequency",
    label: "调仓周期",
    shortLabel: "调仓",
    value: "每月",
    description: "你还没有指定调仓周期。我建议先采用每月调仓，降低换手率，也适合日线级别的中期研究。",
    reason: defaultReasons.rebalanceFrequency,
    alternatives: ["每周", "每季度"],
  },
  {
    key: "executionTiming",
    label: "执行时点",
    shortLabel: "执行",
    value: "收盘生成信号，下一交易日开盘执行",
    description: "你还没有指定执行时点。我建议收盘生成信号，下一交易日开盘执行，避免使用尚未发生的信息。",
    reason: defaultReasons.executionTiming,
    alternatives: ["当日收盘成交", "下一交易日收盘执行"],
  },
  {
    key: "positionLimit",
    label: "仓位限制",
    shortLabel: "仓位",
    value: "单只股票不超过 10%",
    description: "你还没有指定单股仓位上限。我建议先限制在 10%，降低单一标的对组合的影响。",
    reason: defaultReasons.positionLimit,
    alternatives: ["单只股票不超过 5%", "等权，不设额外上限"],
  },
];

const sourceLabel: Record<ContractSource, string> = {
  user: "用户明确",
  agent_default: "系统默认",
  user_override: "用户修改",
  pending: "待确认",
};

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

function nextQuestion(current: QuestionKey | null): QuestionConfig | null {
  const index = questionConfigs.findIndex((item) => item.key === current);
  return questionConfigs[index + 1] ?? null;
}

function fieldDisplayValue(value: string): string {
  return value === "待确认" ? "待确认" : value.replace("推荐：", "");
}

export default function Home() {
  const [view, setView] = useState<View>("research");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("contract");
  const [stage, setStage] = useState<AgentStage>("clarifying");
  const [contract, setContract] = useState<StrategyContract>(initialContract);
  const [sources, setSources] = useState<Record<keyof StrategyContract, ContractSource>>(initialSources);
  const [assumptions, setAssumptions] = useState<Assumption[]>(defaultAssumptions);
  const [messages, setMessages] = useState<Message[]>(defaultMessages);
  const [activeQuestion, setActiveQuestion] = useState<QuestionKey | null>("universe");
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [backtestStep, setBacktestStep] = useState(0);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [activeExperiment, setActiveExperiment] = useState("exp-002");

  const activeConfig = questionConfigs.find((item) => item.key === activeQuestion) ?? null;
  const completedFields = Object.values(contract).filter((value) => value !== "待确认").length;
  const totalFields = Object.keys(contract).length;
  const progress = Math.round((completedFields / totalFields) * 100);
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
    const timer = window.setTimeout(() => {
      setResult(mockBacktestResult);
      setStage("report_ready");
      setInspectorTab("audit");
      setView("report");
      setToast("回测与审计完成，报告已生成");
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [stage]);

  function addMessage(message: Omit<Message, "id">) {
    setMessages((current) => [...current, { ...message, id: `${message.role}-${Date.now()}-${current.length}` }]);
  }

  function updateField(key: keyof StrategyContract, value: string, source: ContractSource, reason?: string) {
    setContract((current) => ({ ...current, [key]: value }));
    setSources((current) => ({ ...current, [key]: source }));
    setAssumptions((current) => {
      const fieldLabel = contractRows.find((row) => row.key === key)?.label ?? key;
      const next = current.filter((item) => !(item.field === fieldLabel && item.status === "active"));
      return [
        ...next,
        {
          field: fieldLabel,
          value,
          source: source === "pending" ? "agent_default" : source === "user" ? "user" : source,
          reason: reason ?? "该规则来自当前策略输入。",
          status: "active",
        },
      ];
    });
  }

  function pushNextQuestion(config: QuestionConfig | null) {
    if (!config) {
      setActiveQuestion(null);
      setStage("awaiting_confirmation");
      addMessage({ role: "agent", text: "策略合同已经具备可执行定义。请在右侧检查默认假设，然后确认是否开始模拟回测。", tone: "success" });
      return;
    }
    setActiveQuestion(config.key);
    addMessage({ role: "agent", text: `接下来我建议确认${config.label}。${config.description}` });
  }

  function acceptDefault() {
    if (!activeConfig) return;
    updateField(activeConfig.key, activeConfig.value, "agent_default", activeConfig.reason);
    setExplanationOpen(false);
    setCustomOpen(false);
    setToast(`已采用默认值：${activeConfig.value}`);
    pushNextQuestion(nextQuestion(activeConfig.key));
  }

  function applyCustom(value: string) {
    if (!activeConfig) return;
    updateField(activeConfig.key, value, "user_override", `用户将 ${activeConfig.label} 修改为“${value}”。`);
    setCustomOpen(false);
    setExplanationOpen(false);
    setToast(`已更新${activeConfig.label}：${value}`);
    pushNextQuestion(nextQuestion(activeConfig.key));
  }

  function applyCustomText() {
    if (!activeConfig) return;
    const value = customInput.trim();
    if (!value) {
      setToast(`请先描述你的${activeConfig.label}方案`);
      return;
    }
    addMessage({ role: "user", text: `我建议${activeConfig.label}：${value}` });
    updateField(activeConfig.key, value, "user_override", `用户自定义${activeConfig.label}：“${value}”。`);
    addMessage({ role: "agent", text: `我会将${activeConfig.label}记录为“${value}”，并继续确认下一项。`, tone: "success" });
    setCustomInput("");
    setCustomOpen(false);
    setExplanationOpen(false);
    setToast(`已记录你的${activeConfig.label}方案`);
    pushNextQuestion(nextQuestion(activeConfig.key));
  }

  function explainDefault() {
    setExplanationOpen((current) => !current);
  }

  function handleInputSubmit() {
    const text = input.trim();
    if (!text) {
      setToast("先写一句你的策略想法，助手会从这里开始");
      return;
    }
    addMessage({ role: "user", text });
    const parsed = parseIntent(text);
    const nextContract = contractFromIntent(text);
    setContract((current) => ({ ...current, ...nextContract }));
    setSources((current) => ({
      ...current,
      ...(parsed.market ? { market: "user" as ContractSource } : {}),
      ...(parsed.universe ? { universe: "user" as ContractSource } : {}),
      ...(parsed.rebalance ? { rebalanceFrequency: "user" as ContractSource } : {}),
      ...(parsed.execution ? { executionTiming: "user" as ContractSource } : {}),
      ...(parsed.factors.length ? { factorsOrSignals: "user" as ContractSource } : {}),
    }));
    const recognized = [
      parsed.market,
      parsed.universe,
      parsed.rebalance,
      parsed.execution,
      parsed.factors.length ? parsed.factors.join("、") : undefined,
    ].filter(Boolean);
    if (recognized.length === 0) {
      addMessage({ role: "agent", text: "我还无法从这句话确定具体规则。我建议先按“估值 + 质量 + 动量”的默认策略继续。", tone: "warning" });
      setToast("未识别到明确规则，已保留当前策略并继续");
    } else {
      addMessage({ role: "agent", text: `我识别到：${recognized.join("、")}。已有明确内容会写入策略合同，未明确的部分继续采用默认值。`, tone: "success" });
      setToast("策略合同已根据你的描述更新");
    }
    setInput("");
  }

  function confirmAndBacktest() {
    setView("research");
    setStage("backtest_running");
    setBacktestStep(0);
    setResult(null);
    addMessage({ role: "system", text: "已确认策略合同，开始执行模拟回测流程。" });
  }

  function skipBacktest() {
    if (!isBacktest) return;
    setBacktestStep(backtestSteps.length - 1);
    setResult(mockBacktestResult);
    setStage("report_ready");
    setInspectorTab("audit");
    setView("report");
    setToast("已跳过等待，模拟回测报告已生成");
  }

  function newResearch() {
    setView("research");
    setStage("clarifying");
    setContract(initialContract);
    setSources(initialSources);
    setAssumptions(defaultAssumptions);
    setMessages([{ id: "agent-new", role: "agent", text: "告诉我你想研究什么样的 A 股策略。我会逐步把它澄清成可回测规则。" }]);
    setActiveQuestion("universe");
    setResult(null);
    setInspectorTab("contract");
    setToast("已新建策略研究");
  }

  const auditItems = [
    ["未来函数检查", "未发现", "pass"],
    ["T 日信号 / T+1 执行", "已启用", "pass"],
    ["手续费与滑点", "已计入", "pass"],
    ["涨跌停模拟", "已模拟", "pass"],
    ["停牌约束", "已模拟", "pass"],
    ["样本外测试", "未完成", "warning"],
  ] as const;

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
              activeQuestion={activeQuestion}
              progress={progress}
              completedFields={completedFields}
              totalFields={totalFields}
              explanationOpen={explanationOpen}
              customOpen={customOpen}
              customInput={customInput}
              input={input}
              onInputChange={setInput}
              onSubmit={handleInputSubmit}
              onAccept={acceptDefault}
              onCustom={() => setCustomOpen((current) => !current)}
              onExplain={explainDefault}
              onApplyCustom={applyCustom}
              onCustomInputChange={setCustomInput}
              onApplyCustomText={applyCustomText}
              onConfirm={confirmAndBacktest}
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
            <ContractPanel contract={contract} sources={sources} assumptions={assumptions} onEdit={() => setToast("编辑策略合同：请使用中央对话中的“修改”入口")}/>
          ) : (
            <AuditPanel result={result} items={auditItems} />
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
  activeQuestion,
  progress,
  completedFields,
  totalFields,
  explanationOpen,
  customOpen,
  customInput,
  input,
  onInputChange,
  onSubmit,
  onAccept,
  onCustom,
  onExplain,
  onApplyCustom,
  onCustomInputChange,
  onApplyCustomText,
  onConfirm,
  onSkip,
  backtestStep,
}: {
  messages: Message[];
  stage: AgentStage;
  activeConfig: QuestionConfig | null;
  activeQuestion: QuestionKey | null;
  progress: number;
  completedFields: number;
  totalFields: number;
  explanationOpen: boolean;
  customOpen: boolean;
  customInput: string;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onAccept: () => void;
  onCustom: () => void;
  onExplain: () => void;
  onApplyCustom: (value: string) => void;
  onCustomInputChange: (value: string) => void;
  onApplyCustomText: () => void;
  onConfirm: () => void;
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

        {activeConfig && !isRunning && !isReady && (
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
              <div className="confirmation-counts"><span>用户明确要求：6 项</span><span>系统默认值：4 项</span><span>待确认问题：0 项</span></div>
              <div className="recommendation-actions"><button className="secondary-button" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>返回修改</button><button className="primary-button" type="button" onClick={onConfirm}>确认策略并开始回测</button></div>
            </div>
          </div>
        )}

        {stage === "report_ready" && <div className="report-ready-note"><span>✓</span><span>回测与审计完成。你可以从左侧打开回测报告，或继续创建下一组实验。</span></div>}

        <div className="progress-block">
          <div className="progress-header"><span>策略澄清进度</span><span>{completedFields} / {totalFields} 项 · {progress}%</span></div>
          <div className="progress-bar"><span style={{ width: `${progress}%` }} /></div>
          <div className="progress-items">
            <span className="complete">✓ 市场</span><span className="complete">✓ 策略方向</span><span className={activeQuestion === "universe" ? "current" : completedFields > 2 ? "complete" : ""}>{activeQuestion === "universe" ? "○ 股票池" : "✓ 股票池"}</span><span className={activeQuestion ? "" : "current"}>{activeQuestion ? "○ 执行与调仓" : "✓ 执行与调仓"}</span>
          </div>
        </div>
      </div>

      <form className="composer" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <textarea value={input} onChange={(event) => onInputChange(event.target.value)} placeholder="告诉助手你的想法，或者修改当前策略合同……" rows={1} />
        <div className="composer-row"><span className="composer-tools"><button type="button">＋</button><button type="button">⌁</button><button type="button">◉</button></span><span className="composer-mode">策略澄清⌄</span><button className="send-button" type="submit">↑</button></div>
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

function ContractPanel({ contract, sources, assumptions, onEdit }: { contract: StrategyContract; sources: Record<keyof StrategyContract, ContractSource>; assumptions: Assumption[]; onEdit: () => void }) {
  return (
    <div className="inspector-content"><div className="panel-eyebrow">当前策略</div><div className="contract-heading"><span>策略合同</span><button type="button" onClick={onEdit}>编辑</button></div>
      <div className="contract-rows">{contractRows.map((row) => <div className="contract-row" key={row.key}><div><span>{row.label}</span><small>{sourceLabel[sources[row.key]]}</small></div><strong className={sources[row.key] === "pending" ? "pending" : sources[row.key] === "agent_default" ? "default" : ""}>{fieldDisplayValue(contract[row.key])}</strong></div>)}</div>
      <div className="inspector-section"><div className="panel-eyebrow">默认假设</div>{assumptions.filter((item) => item.status === "active").slice(-4).map((item) => <div className="assumption-row" key={`${item.field}-${item.value}`}><span className="assumption-dot">●</span><span>{item.field}<small>{item.value}</small></span><em>{sourceLabel[item.source]}</em></div>)}</div>
      <div className="inspector-notice"><strong>助手的工作原则</strong><span>可以推荐默认值继续，但所有默认假设都会记录，并在回测前集中确认。</span></div>
    </div>
  );
}

function AuditPanel({ result, items }: { result: BacktestResult | null; items: readonly (readonly [string, string, string])[] }) {
  return (
    <div className="inspector-content"><div className="panel-eyebrow">审计检查</div><div className="contract-heading"><span>回测审计</span><button type="button">查看规则</button></div>
      {items.map(([label, value, tone]) => <div className={`audit-row ${tone}`} key={label}><span className="audit-icon">{tone === "warning" ? "!" : "✓"}</span><span>{label}</span><em>{value}</em></div>)}
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
