# 任务清单: 去“找游戏”痕迹 + 候选只掉落“本体”

目录: `helloagents/plan/202602120104_entity_generalization_v1/`

---

## 1. 后端：把“找游戏”通用化（用户侧不提“事物”）
- [√] 1.1 在 `src/lib/pipeline.ts` 中把模型提示词从“游戏”改成更通用的说法（例如“根据模糊印象找候选”），并确保用户侧文案不刻意说“帮你找回什么”，验证 why.md#需求-去游戏特化-场景-用户找的是软件网站电影
- [√] 1.2 在 `src/lib/pipeline.ts` 中调整“生成搜索词”的规则：不再强制 game/Steam 信号词，改为“根据识别到的类型动态给信号词”，验证 why.md#需求-去游戏特化-场景-用户找的是软件网站电影

## 2. 后端：AI 自动识别“目标类型”（无下拉）
- [√] 2.1 在 `src/lib/types.ts` 增加 `targetKind`（软件/网站/电影/书/游戏/产品/不确定），并在响应事件里带上（让前端可展示或埋点），验证 why.md#需求-去游戏特化-场景-用户找的是软件网站电影
- [√] 2.2 在 `src/lib/pipeline.ts` 增加“类型识别”步骤：有 OpenAI key 时用模型识别；没有 key 时走简单规则（不确定），验证 why.md#需求-去游戏特化-场景-用户找的是软件网站电影

## 3. 后端：严格候选=目标本体（不让网页标题混进 Top）
- [√] 3.1 在 `src/lib/pipeline.ts` 增加“本体页证据”判定（按类型决定哪些域名/路径更像本体页），并在候选进入 Top 前做强过滤，验证 why.md#需求-候选必须是目标本体-场景-搜到很多求助帖问句
- [√] 3.2 在 `src/lib/pipeline.ts` 增强“问句/求助帖标题”过滤（通用规则，不靠某个词），验证 why.md#需求-候选必须是目标本体-场景-搜到很多求助帖问句
- [√] 3.3 在 `src/lib/pipeline.test.ts` 增加用例：命中里大量是“问句/求助帖/盘点”，Top5 仍应都是“像目标名且带本体页证据”的候选，验证 why.md#需求-候选必须是目标本体-场景-搜到很多求助帖问句

## 4. 前端：去“游戏味” + 线索输入更直观
- [√] 4.1 在 `src/components/glimpse/GlimpseApp.tsx` + `src/components/glimpse/InputArea.tsx` 去掉“找游戏”相关文案，主文案直接沿用你认可的那句（全网找线索→演示筛选→扭蛋掉出 Top），不刻意说“帮你找回什么”，验证 why.md#需求-去游戏特化-场景-用户找的是软件网站电影
- [√] 4.2 在 `src/components/glimpse/InputArea.tsx` 去掉 “Clue Management” 区块，改成“高级条件（可选）”字段式输入（像高级搜索）：一定包含 / 一定不包含 / 我记得在…（时间/平台随便写），验证 why.md#需求-线索输入更直观-场景-用户想补充不是x大概年份平台

## 5. 搜索源对比：Brave vs Tavily（先做“实验页可切换”，再做评估）
- [√] 5.1 在 `src/lib/providers.ts` 新增 Brave provider（保留 Tavily 默认），并补齐 `.env.example` 的 Brave key，验证 why.md#需求-搜索源对照测试不打扰普通用户-场景-需要对比-tavily-vs-brave
- [√] 5.2 在 `src/lib/schema.ts` + `src/lib/pipeline.ts` 支持实验页传 `options.provider=tavily|brave`（只做白名单，不允许随便传），验证 why.md#需求-搜索源对照测试不打扰普通用户-场景-需要对比-tavily-vs-brave
- [√] 5.3 新增两个实验页：`/lab/tavily` 和 `/lab/brave`（可以开两个标签页并行跑），验证 why.md#需求-搜索源对照测试不打扰普通用户-场景-需要对比-tavily-vs-brave
- [√] 5.4 新增最小评估脚本（例如 `scripts/compare-providers.ts`）：同一批样例分别跑 Tavily/Brave，输出 Top1/Top5 命中率与“网页标题候选占比”，验证 why.md#需求-搜索源对照测试不打扰普通用户-场景-需要对比-tavily-vs-brave
- [-] 5.5 （可选）把 Exa / Serper / Google CSE 作为“后备搜索源”写进对比脚本的结构里（先留扩展点，不要求本次接入）

## 6. 文档与回归
- [√] 6.1 更新 `helloagents/wiki/modules/pipeline.md`（把“游戏”相关表述改成更通用/更自然的说法，并说明严格候选规则），验证 why.md 全部核心场景
- [√] 6.2 更新 `helloagents/wiki/modules/frontend.md`（说明线索输入 UI 改动），验证 why.md#需求-线索输入更直观
- [√] 6.3 更新 `helloagents/CHANGELOG.md`，记录本次变更
- [√] 6.4 运行 `npm test` 与 `npm run lint`，确保通过
- [√] 6.5 迁移方案包到 `helloagents/history/YYYY-MM/` 并更新 `helloagents/history/index.md`
