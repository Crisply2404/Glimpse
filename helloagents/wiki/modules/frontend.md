# 前端（可视化）

## 目的
把“找游戏的过程”做成好看的动画：候选图标一关关被筛掉，最后像扭蛋机掉出 Top 结果。

## 模块概述
- **职责:** 输入线索、展示事件流、允许用户反复调整线索并立刻刷新结果
- **状态:** ✅Demo 可用（可视化 + 扭蛋）
- **最后更新:** 2026-02-10

## 规范

### 需求: 可视化筛选过程
**模块:** 前端（可视化）
前端必须能按后端返回的 `events` 顺序播放动画；每个候选的变化都能被用户看懂（为什么被淘汰/为什么加分）。

#### 场景: 用户边看边改线索
用户调整线索后，重新请求后端，前端用新的 `events` 重播一遍筛选过程。
- 预期结果: 用户能明显看到“加了这条线索后，谁上去了/谁掉下来了”

## 依赖
- 后端 API：`POST /api/recall`
- 后端流式 API：`POST /api/recall/stream`（边算边吐，体验更像“正在推理”）
- 样式：Tailwind CSS（为了“原型一致性”）
- 图标：Font Awesome（当前用 CDN，后续可替换为本地依赖）

## 代码位置（大白话）
- 页面入口：`src/app/page.tsx`
- 主组件：`src/components/glimpse/GlimpseApp.tsx`
- 子组件：`src/components/glimpse/*`
- 全局样式：`src/app/globals.css`
- Tailwind 配置：`tailwind.config.ts`、`postcss.config.cjs`
- Font Awesome 引入位置：`src/app/layout.tsx`

## 一次完整的“播放流程”
1. 用户点 Start → 前端请求 `/api/recall`
2. 后端返回 `events` + `candidates`
3. 前端按 `events` 顺序逐条“回放”（带延迟），让用户看见搜索/提炼/筛选/扭蛋每一步
4. 遇到 `filter` 阶段 → 把被淘汰的候选置灰（像过关淘汰）
5. 到 `gacha` 阶段 → 扭蛋机按排名逐个掉出 Top5，同时结果卡片展示证据链接

## 变更历史
- [202602100240_glimpse_game_demo](../../history/2026-02/202602100240_glimpse_game_demo/) - Demo 页面与对接数据结构落地
- [202602101831_frontend_prototype_integration](../../history/2026-02/202602101831_frontend_prototype_integration/) - 接入 AIStudio 原型 UI（筛选动画 + 扭蛋掉落 + 证据卡片）
