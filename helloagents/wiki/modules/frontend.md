# 前端（可视化）

## 目的
把“从全网找线索→逐步筛选→掉落 Top 结果”的过程做成好看的动画：候选图标一关关被筛掉，最后像扭蛋机掉出最可能的 Top。

## 模块概述
- **职责:** 输入模糊印象 + 高级条件（可选）、展示事件流、允许用户反复调整输入并立刻刷新结果
- **状态:** ✅Demo 可用（可视化 + 扭蛋）
- **最后更新:** 2026-02-12

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
- 实验页入口：`src/app/lab/tavily/page.tsx`、`src/app/lab/brave/page.tsx`（用于对照测试搜索源）
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
5. 到 `gacha` 阶段 → 扭蛋机按排名逐个掉出 Top5，同时结果卡片展示证据（可点开看“原文片段”）

## 输入区（更直观）
- **模糊印象**：一段话描述（你记得的样子/用途/在哪里见过）
- **高级条件（可选）**：字段式（像高级搜索）：
  - 一定包含
  - 一定不包含
  - 我记得在…（时间/平台随便写）

## 证据展示（用户能看懂的那种）
- **打分理由**：每条理由都支持点开“看证据”，里面会展示：
  - 原文片段（从网页摘要里截出来的那一小段）
  - 来源链接（点一下就能打开原网页）
- **配图**：候选卡片左上角有“图源”，点开能看到图片来自哪个网页（防止“图片瞎配”）

## UI 注意事项
- Reasoning Stream 的卡片动画做了收敛，并给滚动容器留了内边距，避免“卡片跳出来被裁剪”

## 变更历史
- [202602100240_glimpse_game_demo](../../history/2026-02/202602100240_glimpse_game_demo/) - Demo 页面与对接数据结构落地
- [202602101831_frontend_prototype_integration](../../history/2026-02/202602101831_frontend_prototype_integration/) - 接入 AIStudio 原型 UI（筛选动画 + 扭蛋掉落 + 证据卡片）
- [202602110229_recall_quality_upgrade](../../history/2026-02/202602110229_recall_quality_upgrade/) - 证据可点开看原文 + 图源展示 + Reasoning Stream 防裁剪
- [202602111625_non_game_filter_no_autosearch](../../history/2026-02/202602111625_non_game_filter_no_autosearch/) - Reasoning Stream 动画/布局收敛（减少“跳出来被裁剪”）
- [202602120104_entity_generalization_v1](../../history/2026-02/202602120104_entity_generalization_v1/) - 输入区改为字段式高级条件 + 去“找游戏”痕迹 + 增加 Tavily/Brave 实验页
