# 任务清单: 找回质量升级（候选池更满 + 证据约束推理）

目录: `helloagents/plan/202602110229_recall_quality_upgrade/`

---

## 1. 候选池下限（让筛选真的发生）
- [√] 1.1 在 `src/lib/pipeline.ts` 中加“候选池下限”策略：不足 N 个候选时自动补搜（换关键词/加平台词/加同义词），验证 why.md#需求-候选池要够大才像筛选-场景-搜索结果很集中
- [√] 1.2 在 `src/lib/tavily.ts` 中支持“多轮/多 query”搜索并合并去重（同名/同链接/同 Steam AppID 等），验证 why.md#需求-候选池要够大才像筛选-场景-搜索结果很集中，依赖任务 1.1
- [√] 1.3 在 `src/lib/normalize.ts` + `src/lib/id.ts` 中补齐“更稳的去重 key”（同一个游戏不同写法也能并到一起），验证 why.md#需求-候选池要够大才像筛选-场景-搜索结果很集中，依赖任务 1.2
- [√] 1.4 在 `src/lib/pipeline.ts` 中保证“最终输出永远给够 5 个”（不够就继续补搜/或用低置信候选补位并标明原因），验证 why.md#需求-候选池要够大才像筛选-场景-搜索结果很集中，依赖任务 1.1

## 2. 证据约束推理（别靠猜；证据不足就说不知道）
- [√] 2.1 在 `src/lib/schema.ts` + `src/lib/types.ts` 中把“证据引用”结构定死：每条扣分/加分都必须带 `evidenceQuote`（原文片段 + URL + 行为解释），验证 why.md#需求-不轻易下结论必须有证据-场景-证据不足时仍要诚实
- [√] 2.2 在 `src/lib/score.ts` 中改成“默认未知，不默认否定”：证据没写就保持 Unknown，不再因为来源（如 Steam）就推断“只在 PC”，验证 why.md#需求-不轻易下结论必须有证据-场景-证据不足时仍要诚实，依赖任务 2.1
- [√] 2.3 在 `src/lib/pipeline.ts` 中加“证据补全小循环”：当用户很在意的平台/玩法/年份等信息缺证据时，自动对该候选做一次定向补搜（例如追加 `iOS`/`Android`/`Switch`/`PS` 等），验证 why.md#需求-不轻易下结论必须有证据-场景-证据不足时仍要诚实，依赖任务 1.1
- [√] 2.4 在 `src/components/glimpse/Results.tsx` 中把“打分理由”改成可点开的证据列表（每条理由都能看到引用原文），验证 why.md#需求-不轻易下结论必须有证据-场景-证据不足时仍要诚实，依赖任务 2.1

## 3. 流式体验与可视化（别让用户感觉卡住）
- [√] 3.1 在 `src/app/api/recall/stream/route.ts` 中把 NDJSON 事件类型补齐（比如：开始→搜索→候选池→证据→打分→结束），保证前端能边走边画，验证 why.md#需求-候选池要够大才像筛选-场景-搜索结果很集中
- [√] 3.2 在 `src/components/glimpse/GlimpseApp.tsx` 中默认走 `/api/recall/stream`，非 stream 只做降级兜底，验证 why.md#需求-候选池要够大才像筛选-场景-搜索结果很集中，依赖任务 3.1
- [√] 3.3 在 `src/components/glimpse/Visualizer.tsx` 中把“Reasoning Stream 卡片弹出动画”再收敛一点，并保证任何容器滚动/裁剪时都不会把卡片切掉，验证 why.md#需求-reasoning-stream-卡片不要被裁剪

## 4. 配图可信度（图片也要“有出处”）
- [√] 4.1 在 `src/lib/candidate-image.ts` 中优先从候选的证据页面解析 `og:image`（超时+缓存），并返回图片来源 URL，验证 why.md#需求-不轻易下结论必须有证据-场景-证据不足时仍要诚实
- [√] 4.2 在 `src/components/glimpse/Results.tsx` 中展示图片时同时展示“图片来源”（鼠标悬停或点击可见），没有来源就用占位图，验证 why.md#需求-不轻易下结论必须有证据-场景-证据不足时仍要诚实，依赖任务 4.1

## 5. （可选）搜索源可替换：先做可对比，不拍脑袋换
- [√] 5.1 在 `src/lib/providers.ts`（或同等位置）抽象 `SearchProvider` 接口，并把现有 Tavily 接入成默认实现，验证 why.md#需求-候选池要够大才像筛选-场景-搜索结果很集中
- [√] 5.2 增加 `SEARCH_PROVIDER=` 配置，支持在不改代码的情况下切换 provider（先留一个占位实现即可），验证 why.md#需求-候选池要够大才像筛选-场景-搜索结果很集中，依赖任务 5.1
- [-] 5.3 做一个“对比模式”（同一输入跑两套 provider，把差异列出来），用来判断到底是不是 Tavily 造成的漏搜/不准，验证 why.md#需求-候选池要够大才像筛选-场景-搜索结果很集中，依赖任务 5.1
  > 备注: 目前先把 provider 可插拔入口留好；对比模式需要补 API/前端展示设计，放到下一轮迭代更合适。

## 6. 安全检查
- [√] 6.1 执行安全检查（按 G9：输入验证、敏感信息处理、外部请求超时/重试/缓存、避免把密钥写进前端）

## 7. 文档更新
- [√] 7.1 更新 `helloagents/wiki/modules/pipeline.md`（候选池下限 + 补搜策略）
- [√] 7.2 更新 `helloagents/wiki/modules/frontend.md`（Reasoning Stream 可视化与防裁剪说明）
- [√] 7.3 更新 `helloagents/wiki/modules/providers.md`（provider 可插拔与对比模式）
- [√] 7.4 更新 `helloagents/CHANGELOG.md`

## 8. 测试与回归（把 “Puddle+” 这种例子钉住）
- [√] 8.1 在 `src/lib/pipeline.test.ts`（或同等位置）加回归用例：输入“模糊印象”时 Top5 至少包含目标候选（例如 Puddle+），并且候选数永远≥5
- [√] 8.2 加一个“证据约束”用例：当证据不足时，输出必须出现 Unknown/不确定，而不是肯定句，验证 why.md#需求-不轻易下结论必须有证据-场景-证据不足时仍要诚实
