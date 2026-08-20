# Quant Agent Frontend MVP

Codex 风格的 A 股量化策略研究 Agent 桌面端 MVP。当前版本使用 DeepSeek 进行真实自然语言解析，并保留确定性本地回退；回测和行情仍为 Mock，仅用于体验与评测研究流程。

## 运行

```bash
npm install
npm run dev
```

然后打开终端提示的本地地址，建议使用 1440×900 左右的桌面窗口查看。

在 `.env.local` 中配置服务端模型变量：

```bash
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

`.env.local` 已被 Git 忽略，密钥不会发送到浏览器。

## 当前能力

- 中文优先的三栏研究工作区
- 示例策略首次进入体验
- DeepSeek 在线自然语言解析与本地确定性回退
- 多因子选股、技术择时、行业 / ETF 轮动三种动态策略模板
- Agent 根据当前模板和缺失字段动态选择下一问题
- “接受 / 修改 / 解释”默认值交互
- 结构化策略合同、字段来源、假设账本和合同变更记录
- 自然语言以字段级补丁增量修改合同，不覆盖无关设置
- 时点、排名缓冲和仓位数值冲突检测
- 回测前最终确认闸门
- 可替换的回测工具接口与结构化审计报告
- Mock 回测报告、净值/回撤图和交易明细
- 3 个预置实验的结果对比
- 输入无法识别、字段缺失、审计警告等异常状态

## 验证

```bash
npm test
npm run eval
npm run build
```

## 明确边界

当前已连接真实语言模型，但不连接真实行情、数据库、券商或自动交易。所有回测数值都是固定 Mock 数据；涨跌停、停牌和样本外测试会明确标记为“未执行”，结果不代表真实历史收益或投资建议。

`npm run eval` 会运行 30 条本地确定性 Agent 评测案例并把最新结果写入未纳入 Git 的 `evals/results/latest.json`。该成绩用于防回归，不代表开放自然语言场景的模型泛化准确率。

## 需求基线

完整需求见工作区中的《量化Agent前端MVP需求规格.md》。
