# Changelog

本文件记录项目所有重要变更。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增
- 接入 AIStudio 前端原型：候选池筛选动画 + 扭蛋掉落 + 结果证据卡片
- 引入 Tailwind CSS 与自定义动画（用于保持原型视觉一致）
- 流式接口：`POST /api/recall/stream`（边算边返回事件/候选，前端不再“卡住等很久”）
- 候选配图：优先使用证据网页的封面图（og:image / Steam / App Store），兜底用域名 favicon（不再随机风景图）
- 候选过滤：默认过滤视频/榜单/攻略等内容页，避免把“内容标题”当成“游戏名候选”
- 补证据开关：新增 `enrichEvidence`（默认关闭，避免额外搜索次数太多）
- 补位策略更保守：候选不足时不会用视频/榜单标题凑满 Top5（宁可少给，也不要给错类型）
- 证据约束推理：解释型打分新增 `evidenceQuote`（非0分必须能点开看到原文片段，否则自动降为“证据不足”）
- 搜索 Provider 可插拔入口：新增 `SEARCH_PROVIDER`（目前默认/仅支持 tavily，方便后续对比替换）
- 回归测试：新增/扩展 `pipeline.test.ts`（mock Tavily/OpenAI，锁定“过滤视频榜单”和“不会额外追加搜索”）
- 去“找游戏”痕迹：后端提示词与搜索词生成更通用，并自动识别目标类型（software/website/movie/book/game/product/unknown）
- 严格候选=目标本体：Top 候选必须具备“本体页证据”（官网/商店页/Wikipedia/GitHub/npm 等），不再让网页标题混进 Top
- 线索输入更直观：输入区改为字段式“高级条件（可选）”（一定包含/一定不包含/我记得在…）
- 搜索源对照：新增 Brave Search provider、实验页 `/lab/tavily` 与 `/lab/brave`
- 对照脚本：新增 `scripts/compare-providers.mjs`（Top1/Top5 命中率 + 内容标题占比）

### 修复
- 类型检查不再扫描 `ref/`（避免把原型目录当成主项目源码）
- 处理开发环境控制台噪音：内置 favicon（不再请求 `/favicon.ico` 404），并在根布局加 `suppressHydrationWarning`（避免部分浏览器扩展导致的 hydration 警告）
- OpenAI Base URL 更兼容：`OPENAI_BASE_URL` 既支持填根地址，也支持填到 `/v1`（不会重复拼接）
- Reasoning Stream 动画幅度减小：卡片出现时不再被滚动容器裁剪
- 搜索更稳：默认用 Tavily `advanced` 深度，并扩大提炼候选时可见的网页命中数（更不容易漏掉真目标）
- 候选名更干净：像 “xxx on Steam / App Store / Google Play / Apps on Google Play” 这类尾巴会被清理掉，避免影响去重与打分对齐
- 配图更少“视频味”：挑图时优先跳过视频站证据，避免出现带播放按钮的大缩略图
- 暂时移除“自动补搜扩池”：先把结果类型做干净（避免把视频/榜单混进 Top），后续再考虑重新引入

## [0.1.0] - 2026-02-10

### 新增
- Next.js 网页 Demo：输入模糊描述 + 线索，展示候选与“过程事件流”
- 后端接口：`/api/health` 与 `/api/recall`（Tavily 搜索 + OpenAI 提炼/解释型打分，可降级）
- 最小单元测试：候选名清洗/归一化、稳定ID
