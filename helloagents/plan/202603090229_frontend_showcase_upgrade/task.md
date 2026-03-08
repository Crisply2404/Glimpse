# 任务清单: 把 Glimpse 升级成更像前端项目的展示型 Demo

目录: `helloagents/plan/202603090229_frontend_showcase_upgrade/`

---

## 1. 前端状态底座：把“接收数据”和“播放展示”拆开
- [ ] 1.1 在 `src/components/glimpse/types.ts` 中补充播放状态、运行快照、性能指标等前端类型，验证 why.md#需求-可回放推理播放器-场景-用户想暂停回看某一步
- [ ] 1.2 在 `src/lib/replay-state.ts` 中实现播放 reducer、游标控制和快照派生工具，让播放器逻辑不再堆在页面组件里，验证 why.md#需求-可回放推理播放器-场景-用户想暂停回看某一步
- [ ] 1.3 在 `src/lib/replay-state.test.ts` 中补充暂停、跳步、倍速、快照对比等核心逻辑测试，验证 why.md#需求-检索结果前后对比-场景-用户加了一条不是像素风的排除线索

## 2. 推理播放器：让用户能暂停、拖动、倍速回看
- [ ] 2.1 新增 `src/components/glimpse/ReplayControls.tsx`，实现暂停/继续、单步切换、倍速和进度拖动 UI，验证 why.md#需求-可回放推理播放器-场景-用户想暂停回看某一步
- [ ] 2.2 在 `src/components/glimpse/GlimpseApp.tsx` 中接入播放状态与控制事件，打通自动播放和手动播放模式，验证 why.md#需求-可回放推理播放器-场景-用户想暂停回看某一步
- [ ] 2.3 在 `src/components/glimpse/Visualizer.tsx` 中按当前播放游标渲染时间线和候选池状态，而不是只按“最后一次 setState”展示，验证 why.md#需求-可回放推理播放器-场景-用户想暂停回看某一步

## 3. 对比视图：把“前后两次检索差异”直接展示出来
- [ ] 3.1 新增 `src/components/glimpse/RunComparePanel.tsx`，展示最近两次运行的名次升降、新增候选和淘汰候选，验证 why.md#需求-检索结果前后对比-场景-用户加了一条不是像素风的排除线索
- [ ] 3.2 在 `src/components/glimpse/GlimpseApp.tsx` 中保存最近运行快照（可本地持久化），为对比视图提供数据来源，验证 why.md#需求-检索结果前后对比-场景-用户加了一条不是像素风的排除线索
- [ ] 3.3 在 `src/components/glimpse/Results.tsx` 中补充名次变化和理由变化提示，让结果卡片能看出“这次为什么上去了/掉下来了”，验证 why.md#需求-检索结果前后对比-场景-用户加了一条不是像素风的排除线索

## 4. 性能与体验：做出真正能写进简历的数据
- [ ] 4.1 新增 `src/components/glimpse/PerformancePanel.tsx`，展示首条流式反馈时间、回放总时长、事件数、候选数等开发态指标，验证 why.md#需求-长时间线也要保持顺滑-场景-一次请求产生-200300-条事件
- [ ] 4.2 在 `src/components/glimpse/GlimpseApp.tsx` + `src/components/glimpse/Visualizer.tsx` 中减少流式阶段的无意义重渲染（例如派生缓存、分层更新、必要的 memo 化），验证 why.md#需求-长时间线也要保持顺滑-场景-一次请求产生-200300-条事件
- [ ] 4.3 在 `src/components/glimpse/Header.tsx` + `src/app/globals.css` 中补充主题持久化、焦点态和减少动效支持，验证 why.md#需求-核心交互对键盘和减弱动效友好-场景-用户开启减少动态效果或主要用键盘操作

## 5. 文档更新
- [ ] 5.1 更新 `helloagents/wiki/modules/frontend.md`，说明播放器、对比视图、性能面板和可访问性改造，验证 why.md 全部核心场景
- [ ] 5.2 更新 `helloagents/wiki/overview.md`，把项目定位从“展示 Agent 结果”升级为“可回放、可比较的前端交互系统”，验证 why.md 全部核心场景
- [ ] 5.3 更新 `helloagents/CHANGELOG.md`，记录本次前端展示力升级，验证 why.md 全部核心场景

## 6. 安全检查
- [ ] 6.1 执行安全检查（按G9: 确认本地快照不保存敏感信息、主题和播放偏好仅存浏览器本地、不把任何 key 暴露到前端）

## 7. 测试
- [ ] 7.1 运行 `npm test`，确认播放状态与现有流水线测试不被破坏
- [ ] 7.2 运行 `npm run lint`，确认类型和前端接入改造通过检查
