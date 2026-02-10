# Glimpse（游戏找回 Demo）

一句话：你只记得“模糊印象”，它帮你从全网找出可能的游戏，并把“怎么筛出来的”用过程回放展示出来。

## 本地运行

1. 安装依赖
   - `npm install`
2. 准备环境变量
   - 复制 `.env.example` 为 `.env.local`
   - 填上 `TAVILY_API_KEY` 和 `OPENAI_API_KEY`
3. 启动
   - `npm run dev`
4. 打开网页
   - Next.js 默认是 `http://localhost:3000`

## 主要接口

- `GET /api/health`：健康检查
- `POST /api/recall`：找回游戏（返回候选 + 证据 + 事件流，用于前端动画）

