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

### 修复
- 类型检查不再扫描 `ref/`（避免把原型目录当成主项目源码）
- 处理开发环境控制台噪音：内置 favicon（不再请求 `/favicon.ico` 404），并在根布局加 `suppressHydrationWarning`（避免部分浏览器扩展导致的 hydration 警告）
- OpenAI Base URL 更兼容：`OPENAI_BASE_URL` 既支持填根地址，也支持填到 `/v1`（不会重复拼接）
- 搜索更稳：默认用 Tavily `advanced` 深度，并扩大提炼候选时可见的网页命中数（更不容易漏掉真目标）

## [0.1.0] - 2026-02-10

### 新增
- Next.js 网页 Demo：输入模糊描述 + 线索，展示候选与“过程事件流”
- 后端接口：`/api/health` 与 `/api/recall`（Tavily 搜索 + OpenAI 提炼/解释型打分，可降级）
- 最小单元测试：候选名清洗/归一化、稳定ID
