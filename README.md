# Pascal Editor

Pascal Editor 是一个面向建筑空间编辑、场景建模与业务扩展的 Turborepo 单仓项目。当前仓库已经拆分为“建模核心能力”和“宿主业务前端/后端”两条主线，目标是让三维编辑器保持稳定，同时让能耗、资产、巡检、设备运维等新增业务能够以模块方式接入，而不是继续堆在单一组件目录中。

## 项目介绍

项目由三层能力构成：

1. 建模核心层：负责场景图、节点 schema、几何系统、渲染与交互。
2. 宿主前端层：负责业务外壳、业务侧栏、查询筛选、接口编排与页面路由。
3. 宿主后端层：负责场景存储、健康检查以及业务演示接口。

当前默认业务示例为“右侧能耗查询面板”，但架构已经预留为多业务并行扩展：新增业务应优先落在 apps/editor/features/新业务名 下，通过页面壳进行装配，而不要直接改 packages/editor 内核。

## 技术路线

### Monorepo 分层

```text
editor/
├── apps/
│   ├── editor/                  # Next.js 宿主前端
│   └── api/                     # Node.js 宿主后端
├── packages/
│   ├── core/                    # 场景 schema、状态、系统
│   ├── editor/                  # 编辑器 UI、工具、宿主接口
│   ├── viewer/                  # Three.js / R3F 渲染能力
│   └── ui/                      # 通用 UI 组件
└── tooling/                     # 发布与脚本工具
```

### 前端技术选型

1. Next.js 16：承载宿主页面、路由与运行时环境。
2. React 19：组织编辑器壳层与业务模块。
3. Tailwind CSS 4：界面样式与布局实现。
4. TypeScript 5：统一前后端接口类型约束。
5. Zustand：分别在 core、viewer、editor 中维护场景、视图和编辑状态。

### 建模核心技术选型

1. @pascal-app/core：维护节点模型、几何系统、事件总线和场景状态。
2. @pascal-app/viewer：负责三维渲染、相机、楼层显示与可视化交互。
3. @pascal-app/editor：负责建模工具条、动作菜单、侧栏、宿主接入接口。

### 后端技术选型

1. 原生 Node.js HTTP Server：保持依赖最小，便于本地演示和快速扩展。
2. JSON 文件存储：以项目文件形式保存 scene graph，降低接入门槛。
3. 轻量 Mock 业务接口：当前以能耗接口演示前后端联动方式。

## 当前架构约束

为保证未来新业务易于接入，当前仓库遵循以下原则：

1. 业务代码按 feature 目录组织，例如 apps/editor/features/host-shell 和 apps/editor/features/energy-insights。
2. 页面只负责装配，不承担具体业务实现。
3. packages/editor 只保留编辑器公共能力，不承载宿主业务逻辑。
4. 后续新增业务时，应新增独立 feature 目录，最多由宿主壳在页面层组合，而不是把新逻辑继续堆入 components。

## 关键目录说明

### 前端 apps/editor

1. app/：Next.js 页面入口。
2. features/host-shell/：宿主工作台装配层。
3. features/energy-insights/：能耗查询业务模块，包括筛选栏、右侧面板、查询模型与接口访问。
4. lib/：全局公共工具，仅保留跨 feature 共用能力。

### 后端 apps/api

1. server.mjs：后端服务入口。
2. data/projects/：项目场景数据存储目录。
3. 后续新增业务接口时，建议优先抽出 routes、services、validators 三层，再逐步摆脱单文件 server.mjs。

## 运行方式

### 环境要求

1. Node.js 20+
2. Bun 1.1+

### 安装依赖

```bash
bun install
```

### 启动前端

```bash
cd apps/editor
bun run dev
```

默认前端地址：

```text
http://localhost:3002
```

### 启动后端

```bash
cd apps/api
bun run dev
```

默认后端地址：

```text
http://localhost:3010
```

### 推荐联调环境变量

在 apps/editor/.env.local 中配置：

```env
NEXT_PUBLIC_EDITOR_API_BASE_URL=http://localhost:3010
```

### 类型检查

前端：

```bash
cd apps/editor
bun run check-types
```

## 接入新业务的建议方式

如果后续需要新增设备台账、工单、巡检、告警等前端业务，建议按以下步骤执行：

1. 在 apps/editor/features 下创建独立业务目录。
2. 在该目录内拆分 components、lib、types 或 services。
3. 由 host-shell 在页面级装配新业务面板，而不要修改编辑器核心包。
4. 如果需要新接口，优先在 apps/api 中增加新路由，再由前端 feature 自己封装调用方法。

## 开发文档

1. 前端应用说明见 [apps/editor/README.md](apps/editor/README.md)
2. 前端接口说明见 [apps/editor/前端接口说明.md](apps/editor/%E5%89%8D%E7%AB%AF%E6%8E%A5%E5%8F%A3%E8%AF%B4%E6%98%8E.md)
3. 后端开发文档见 [apps/api/后端开发文档.md](apps/api/%E5%90%8E%E7%AB%AF%E5%BC%80%E5%8F%91%E6%96%87%E6%A1%A3.md)
  