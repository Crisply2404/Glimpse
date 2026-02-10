# API 手册

## 概述

本项目是“网页 Demo”，但为了保护 `API key`，所有对 Tavily/OpenAI 的调用都必须走后端 API。

---

## 认证方式

Demo 阶段默认不做登录。

> 如果未来要公开给别人用，需要加：限流、简单的访问口令、或账号体系（后续升级项）。

---

## 接口列表

### Recall（找回游戏）

#### [POST] /api/recall

**描述:** 输入“模糊印象 + 线索”，返回候选游戏的排名，以及可视化需要的“事件流”（每一步怎么筛的）。

**请求参数（Demo 实现）:**
| 参数名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | 是 | 用户的一句话描述 |
| clues | array | 否 | 线索列表（用户反复增删改） |
| options | object | 否 | 一些开关，比如取 Top 几、每关保留多少 |

`options` 常用字段（都可省略，有默认值）：
- `topK`: 最终返回前几名（默认 5）
- `stages`: 前端用来表现“过几关”（默认 3，Demo 当前会固定产出 3 关事件）
- `maxQueries`: 搜索轮数上限（默认 5）
- `maxSearchResultsPerQuery`: 每轮搜索取多少条（默认 8）
- `maxCandidates`: 最多提炼多少候选（默认 25）

**响应（Demo 实现）:**
```json
{
  "runId": "20260210_0240_xxx",
  "events": [],
  "candidates": [],
  "warnings": []
}
```

其中：
- `events` 是“过程回放”（用于动画）
- `candidates` 是最终结果（Top 排名 + 证据 + 打分理由）
- `warnings` 是提示信息（比如：没配 OpenAI key 就会提示“本次用简单规则打分”）

---

#### [POST] /api/recall/stream

**描述:** 和 `/api/recall` 一样，但会“边算边吐结果”，前端不需要干等到最后一口气返回（更像“正在推理”的体验）。

**请求参数:** 同 `/api/recall`

**响应:** `NDJSON`（一行一个 JSON），常见消息：
- `{ "type": "event", "event": PipelineEvent }`：过程事件（会很多条）
- `{ "type": "candidates", "candidates": Candidate[] }`：候选池更新（会出现多次）
- `{ "type": "done", "response": RecallResponse }`：最终结果
- `{ "type": "error", "error": "..." }`：错误信息

前端要做的事（大白话）：
1. 先把 `event` 按顺序加到时间线
2. 看到 `candidates` 就刷新候选池图标/分数
3. 看到 `done` 就收尾（显示 warnings 等）

---

## Candidate 字段补充（前端配图用）

`candidates[]` 里会多两个可选字段（不保证每次都有）：
- `imageUrl`：候选的配图（优先取网页/商店页的封面图）
- `imageSourceUrl`：这张图来自哪个网页（用于溯源）

---

### Health（健康检查）

#### [GET] /api/health

**描述:** 返回服务是否启动成功（Demo 用）。
