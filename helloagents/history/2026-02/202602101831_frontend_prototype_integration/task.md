# 任务清单: 接入 AIStudio 前端原型

目录: `helloagents/plan/202602101831_frontend_prototype_integration/`

---

## 1. Tailwind 接入
- [√] 1.1 安装 Tailwind + PostCSS 配置，并替换 `globals.css` 为 Tailwind 入口，验证页面样式生效
- [√] 1.2 补齐原型用到的自定义样式（animate-drop/animate-shake/custom-scrollbar/transition-all-300）

## 2. 组件迁移与适配
- [√] 2.1 迁移 Header/InputArea/Visualizer/Results/GachaMachine 到 Next.js，并保证能正常渲染
- [√] 2.2 适配类型与字段映射：把后端返回的 candidates/events 映射成原型 UI 需要的展示数据

## 3. 对接真实接口
- [√] 3.1 Start 按钮调用 `POST /api/recall`，并处理错误/提示（warnings）
- [√] 3.2 事件流回放：按 events 顺序逐条显示；在 filter 阶段把候选置灰
- [√] 3.3 扭蛋机 reveal：到 gacha 阶段后逐个掉出 Top5，并驱动 Results 显示卡片

## 4. 验证与文档同步
- [√] 4.1 跑 `npm test` / `npm run build` / `npm run lint`
- [√] 4.2 更新知识库（modules/frontend.md、CHANGELOG.md、project.md），并迁移方案包到 history/
