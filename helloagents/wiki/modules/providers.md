# 外部服务（Tavily / OpenAI）

## 目的
让“全网搜索 + 大模型提炼”稳定可控：不乱花钱、不超时、失败可降级。

## 模块概述
- **职责:** 统一封装 Tavily/OpenAI 调用；做超时、重试、缓存、成本控制；并给“可替换搜索源”留好入口
- **状态:** 🚧开发中
- **最后更新:** 2026-02-10

## 规范

### 需求: 成本与速度可控
**模块:** 外部服务
同一个输入短时间重复请求，应该尽量走缓存；失败时要给“可读的错误信息”。

#### 场景: Tavily 暂时不可用
- 预期结果: 系统提示“搜索服务暂不可用”，并建议用户稍后重试（而不是白屏/报一堆看不懂的错）

## 依赖
- 本地环境变量（`.env.local`）

## 配置（最常用的几项）
- `TAVILY_API_KEY`：全网搜索用
- `OPENAI_API_KEY` / `OPENAI_MODEL`：提炼候选 + 解释型打分用
- `OPENAI_BASE_URL`：可选，OpenAI compatible 的中转/代理（支持填根地址或 `/v1` 结尾）
- `SEARCH_PROVIDER`：可选，搜索提供方选择（目前只有 `tavily`，先把“可插拔口子”留好）

## 代码位置（大白话）
- 搜索 Provider 入口：`src/lib/providers.ts`
- Tavily 调用封装：`src/lib/tavily.ts`
- OpenAI 调用封装：`src/lib/openai.ts`

## 变更历史
- [202602100240_glimpse_game_demo](../../history/2026-02/202602100240_glimpse_game_demo/) - Tavily/OpenAI 接入与降级策略
- [202602110229_recall_quality_upgrade](../../history/2026-02/202602110229_recall_quality_upgrade/) - SearchProvider 可插拔入口 + 证据引用约束（evidenceQuote）
