# 后端（API）

## 目的
保护 `API key`，把“搜索→提炼→打分→解释→事件流”打包成前端可用的数据。

## 模块概述
- **职责:** 提供 API；处理缓存/限流；把外部服务的结果整理成统一格式
- **状态:** ✅Demo 可用（含流式接口）
- **最后更新:** 2026-02-10

## 规范

### 需求: 提供可回放的事件流
**模块:** 后端（API）
后端返回的数据必须包含 `events`，让前端能按步骤播放。

#### 场景: API key 不泄露
任何 Tavily/OpenAI 调用必须在服务器端执行，前端拿不到 key。
- 预期结果: 前端代码里找不到 key；浏览器网络请求里也看不到 key

## API接口
### [POST] /api/recall
**描述:** 找回游戏（见 `wiki/api.md`）

### [POST] /api/recall/stream
**描述:** 流式找回（边算边吐事件/候选，见 `wiki/api.md`）

## 依赖
- Tavily Search API
- OpenAI API

## 变更历史
- [202602100240_glimpse_game_demo](../../history/2026-02/202602100240_glimpse_game_demo/) - `/api/recall` 与 `/api/health` 落地
