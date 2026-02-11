# 任务清单: 过滤非游戏候选 + 暂停自动补搜（先省钱/省噪音）

目录: `helloagents/plan/202602111625_non_game_filter_no_autosearch/`

---

## 1. 过滤“明显不是游戏”的东西（视频/榜单/攻略）
- [√] 1.1 在 `src/lib/pipeline.ts` 增强 hit 过滤：排除常见视频域名 + “Top10/盘点/推荐/攻略/Games like”等标题
- [√] 1.2 在 `src/lib/pipeline.ts` 的“补位逻辑”只允许用“像游戏页面”的命中来补位（Steam/App Store/Google Play/Wikipedia 等）
- [√] 1.3 在 `src/lib/pipeline.ts` 的 OpenAI 提炼提示词加硬规则：候选必须是具体游戏名，不得输出视频/榜单/攻略标题
- [√] 1.4 额外保险：对候选的 evidence 做二次清洗（把视频/榜单/攻略类证据剔除）

## 2. 暂停“自动补搜扩池”（避免噪音 + 省钱）
- [√] 2.1 移除 `autoExpand` 选项（`src/lib/types.ts` + `src/lib/schema.ts`）
- [√] 2.2 移除 `src/lib/pipeline.ts` 里的自动补搜逻辑（只跑初始 maxQueries 轮）
- [√] 2.3 回归测试：确保不会出现 “补搜（x/y）” 事件，也不会多打 Tavily 请求

## 3. 配图别有“视频味”
- [√] 3.1 `src/lib/candidate-image.ts`：如果网页的 og:image 指向视频站缩略图（如 ytimg），直接跳过

## 4. UI：Reasoning Stream 防裁剪
- [√] 4.1 `src/components/glimpse/Visualizer.tsx`：加内边距 + 去掉过大的缩放，避免卡片出现时被裁剪
- [√] 4.2 `tailwind.config.ts`：收敛 drop 动画幅度（减少“跳出来”）

## 5. 文档更新
- [√] 5.1 更新 `helloagents/wiki/modules/pipeline.md`
- [√] 5.2 更新 `helloagents/CHANGELOG.md`

## 6. 测试与回归
- [√] 6.1 `src/lib/pipeline.test.ts`：新增/更新用例覆盖更多视频域名（dailymotion / youtube-nocookie）
- [√] 6.2 通过 `npm test` + `npm run lint`

## 7. 安全检查
- [√] 7.1 确认外部请求有超时、缓存；不把 key 输出到前端
