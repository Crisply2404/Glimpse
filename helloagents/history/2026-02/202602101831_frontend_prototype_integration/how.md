# 技术设计: 接入 AIStudio 前端原型（Next.js + Tailwind）

## 技术方案

### 核心技术
- Next.js App Router（现有）
- Tailwind CSS（为了“原样接入”原型）
- Font Awesome（原型里用到的图标，先用 CDN 引入，后续可替换为本地依赖）

### 实现要点（按大白话流程）
1. **装 Tailwind**：让原型的 `className="..."` 样式能生效
2. **迁移组件**：把 `ref/glimpse0/components/*` 迁移到 `src/components/glimpse/*`
3. **对接真实接口**：
   - InputArea 收集：描述 + 线索（include/exclude + strength）
   - 发送到 `/api/recall`：把 include/exclude 映射成 `positive/negative`，把 strength 映射成 `weight`
4. **事件流播放**：接口返回一串 `events`，前端用延迟逐条加入时间线，营造“正在推理”的感觉
5. **候选池淘汰**：遇到筛选事件时，把非 Top 的候选置灰（isEliminated=true）
6. **扭蛋掉落**：到 gacha 阶段后，按排名逐个 reveal Top5，驱动 Results 显示卡片

---

## 架构决策 ADR

### ADR-003: 为了原型一致性引入 Tailwind
**上下文:** AIStudio 原型大量使用 Tailwind class。若不引入 Tailwind，需要手工改写大量样式，成本高且容易跑偏。
**决策:** 在 Next.js 项目中引入 Tailwind（darkMode=class），并补齐原型需要的自定义动画类。
**理由:** 速度快、视觉一致性高，利于后续迭代可视化效果。
**替代方案:** 手动改写为纯 CSS → 拒绝原因: 工期更长、效果不稳定。
**影响:** 项目会增加 Tailwind 配置文件；但不影响后端接口与整体架构。

---

## API 设计（保持不变）
- `POST /api/recall`：请求/响应结构沿用现有 `wiki/api.md`
- 前端会把结果映射成 UI 需要的字段（比如 `score` → `totalScore`）

---

## 安全与性能
- `TAVILY_API_KEY` / `OPENAI_API_KEY` 仍只放 `.env.local`
- 前端不保存 key，不打印 key
- 事件播放用“回放”方式实现：先请求一次拿到全部结果，再逐条展示（避免多次扣费）

---

## 测试与验证
- `npm run build` 确保 Next.js 构建通过
- `npm run lint` 做类型检查
- `npm test` 保障已有单测不被破坏

