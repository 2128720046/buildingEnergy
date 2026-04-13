# Pascal 建模模块接入与能耗联动手册

## 1. 架构说明

当前仓库已经按“前端展示层”和“后端数据层”拆开：

- 前端页面宿主：[apps/editor/app/page.tsx](apps/editor/app/page.tsx)
- 独立建模模块：[packages/editor/src/components/modeling-editor-module.tsx](packages/editor/src/components/modeling-editor-module.tsx)
- 建模核心模块：[packages/editor/src/components/modeling-editor-module.tsx](packages/editor/src/components/modeling-editor-module.tsx)
- 外部壳层分包：[packages/editor/src/public/chrome.ts](packages/editor/src/public/chrome.ts)
- 后端接口服务：[apps/api/server.mjs](apps/api/server.mjs)

这里最重要的变化是：建模能力不再等同于整个前端页面。之后你们新增“能耗显示面板”“数据库查询面板”“设备详情页”时，应该把这些能力放在宿主前端中，再把建模模块当成一个独立子模块嵌入进去。

## 2. 如何运行项目

### 2.1 安装依赖

在仓库根目录执行：

```bash
bun install
```

如果本机暂时没有 Bun，也可以先用 Node 运行后端，但前端依旧建议按仓库默认方式使用 Bun/Turbo。

### 2.2 启动后端

后端目录：

- [apps/api/package.json](apps/api/package.json)
- [apps/api/server.mjs](apps/api/server.mjs)

先复制环境变量：

```bash
copy apps\api\.env.example apps\api\.env
```

默认配置：

```env
PORT=3010
EDITOR_API_ALLOW_ORIGIN=http://localhost:3002
EDITOR_API_DATA_DIR=./data/projects
```

启动命令：

```bash
cd apps/api
node server.mjs
```

### 2.3 启动前端

前端目录：

- [apps/editor/package.json](apps/editor/package.json)

先复制环境变量：

```bash
copy apps\editor\.env.example apps\editor\.env
```

默认配置：

```env
NEXT_PUBLIC_EDITOR_API_BASE_URL=http://localhost:3010
```

启动命令：

```bash
cd apps/editor
bun dev --port 3002
```

访问地址：

```text
http://localhost:3002
```

## 3. 建模模块如何使用

### 3.1 推荐使用 ModelingEditorModule

现在推荐优先挂载：

- [packages/editor/src/components/modeling-editor-module.tsx](packages/editor/src/components/modeling-editor-module.tsx)
- 对外分包入口：[packages/editor/src/public/modeling.ts](packages/editor/src/public/modeling.ts)
- 壳层模块入口：[packages/editor/src/public/chrome.ts](packages/editor/src/public/chrome.ts)
- 宿主装配入口：[packages/editor/src/public/host.ts](packages/editor/src/public/host.ts)

默认建模模块已经包含：

- 场景树与设置面板
- 自动建模导入面板
- 区域映射面板
- 2D/3D 建模工具栏
- 选择事件桥接能力

如果宿主想自己组装导航栏、工具栏、侧栏标签，请改用 `ModelingEditorCoreModule`，再从 `@pascal-app/editor/chrome` 引入外部壳层模块进行拼装。

### 3.2 最小接入示例

```tsx
import {
  ModelingEditorModule,
  type ModelingSelectionSnapshot,
  type SceneGraph,
} from '@pascal-app/editor/modeling'

export default function BuildingModelPage() {
  const projectId = 'building-001'

  async function loadScene(): Promise<SceneGraph | null> {
    const response = await fetch(`https://api.example.com/projects/${projectId}/scene`)
    if (!response.ok) {
      return null
    }

    const payload = await response.json()
    return payload.scene ?? null
  }

  async function saveScene(scene: SceneGraph) {
    await fetch(`https://api.example.com/projects/${projectId}/scene`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ scene }),
    })
  }

  function handleSelectionChange(snapshot: ModelingSelectionSnapshot) {
    console.log('当前选中构件', snapshot.selectedIds)
  }

  return (
    <ModelingEditorModule
      projectId={projectId}
      onLoad={loadScene}
      onSave={saveScene}
      onSelectionChange={handleSelectionChange}
    />
  )
}
```

### 3.3 对外可用能力

建模模块已经对宿主前端开放三类稳定接口：

1. 场景读取：onLoad
2. 场景保存：onSave
3. 选择联动：onSelectionChange

这意味着能耗面板和数据查询面板不需要直接读取编辑器内部 store，只需要监听建模模块抛出的选择结果即可。

## 4. 后端接口如何调用

当前后端接口定义在：

- [apps/api/server.mjs](apps/api/server.mjs)

### 4.1 健康检查

```http
GET /health
```

返回示例：

```json
{
  "status": "ok"
}
```

### 4.2 读取场景

```http
GET /projects/:projectId/scene
```

返回示例：

```json
{
  "projectId": "building-001",
  "scene": {
    "nodes": {},
    "rootNodeIds": []
  },
  "updatedAt": "2026-04-11T00:00:00.000Z"
}
```

### 4.3 保存场景

```http
PUT /projects/:projectId/scene
Content-Type: application/json
```

请求体：

```json
{
  "scene": {
    "nodes": {},
    "rootNodeIds": []
  }
}
```

### 4.4 前端查询示例

```ts
export async function queryProjectScene(projectId: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_EDITOR_API_BASE_URL}/projects/${projectId}/scene`)

  if (!response.ok) {
    throw new Error('读取场景失败')
  }

  const payload = await response.json()
  return payload.scene
}
```

## 5. 如何接数据库查询

当前后端使用文件存储只是过渡方案。后续接数据库时，推荐保持前端接口不变，只替换后端读写实现。

建议最少拆成三张表：

### 5.1 场景表

- project_id
- scene_graph_json
- updated_at

### 5.2 区域映射表

- project_id
- zone_id
- zone_name
- component_id
- component_name
- component_type

### 5.3 能耗数据表

- component_id
- metric_type
- metric_value
- timestamp

如果后续还需要把外部设备、电表、传感器和构件做映射，建议单独增加“组件绑定表”，不要把数据库主查询入口绑定死到节点 metadata 上。能耗查询主键仍然应该是 component_id。

推荐新增一张绑定表：

- project_id
- component_id
- external_source_type
- external_source_id
- extra_payload

例如：

```json
{
  "project_id": "building-001",
  "component_id": "item_abc123",
  "external_source_type": "meter",
  "external_source_id": "meter-001"
}
```

## 6. 如何在新前端中接入页面

你们未来的新前端不应该复用当前 apps/editor 的页面结构，而应该只复用建模模块和 API 客户端模式。

推荐结构：

1. 页面左侧放建模模块
2. 页面右侧放能耗面板、查询结果面板、设备详情面板
3. 顶部放项目切换、时间范围筛选、数据维度切换

示意代码：

```tsx
import { ModelingEditorModule } from '@pascal-app/editor/modeling'

export default function DigitalTwinWorkbench() {
  return (
    <div className="grid h-screen grid-cols-[minmax(0,1fr)_360px]">
      <ModelingEditorModule
        projectId="building-001"
        onLoad={loadScene}
        onSave={saveScene}
        onSelectionChange={handleSelectionChange}
      />
      <aside>
        <EnergyPanel />
        <DeviceQueryPanel />
      </aside>
    </div>
  )
}
```

这样做的好处是：

- 建模模块只负责建模、选择、聚焦、区域划分
- 业务面板只负责查询、统计、展示
- 两边通过 projectId、componentId、zoneId 联动

## 7. 点击组件后做能耗查询的实现方式

### 7.1 前端联动流程

推荐流程如下：

1. 用户在建模模块里点击某个构件
2. ModelingEditorModule 通过 onSelectionChange 抛出当前选中结果
3. 宿主前端拿到 selectedIds 或 selectedNodes
4. 直接取第一个 selectedId 作为 componentId
5. 调用后端能耗查询接口
6. 在右侧面板显示实时值、历史曲线、同区域对比结果

### 7.2 示例代码

```tsx
function handleSelectionChange(snapshot: ModelingSelectionSnapshot) {
  const componentId = snapshot.selectedIds[0] ?? null

  if (!componentId) {
    setEnergyResult(null)
    return
  }

  fetch(`/api/energy/components/${componentId}`)
    .then((response) => response.json())
    .then((result) => setEnergyResult(result))
}
```

这里的关键约束是：

- 建模模块只负责告诉宿主“当前选中了哪个 componentId”
- 宿主前端和后端查询模块统一使用 componentId 作为查询键
- 如果存在外部设备编码映射，也在后端完成 componentId -> external_source_id 的转换，不要把映射逻辑塞回建模模块

### 7.3 如果按区域查能耗

按区域查询时，建议使用已实现的区域映射模块：

- [packages/editor/src/lib/zone-component-mapping.ts](packages/editor/src/lib/zone-component-mapping.ts)

流程如下：

1. 选择某个区域
2. 根据 zone_id 找到该区域下所有 component_id
3. 把 component_id 列表传给后端聚合接口
4. 后端按时间粒度返回总能耗、分项能耗、峰值数据

## 8. 模块边界建议

为了避免以后越改越耦合，建议明确边界：

### 8.1 建模模块负责

- SceneGraph 编辑
- 2D/3D 联动建模
- 自动建模导入
- 区域绘制
- 构件选择与聚焦
- scan / guide 参考层显示

### 8.2 宿主前端负责

- 路由
- 权限
- 业务筛选器
- 数据查询
- 能耗图表
- 报表导出
- 告警与工单逻辑

### 8.3 后端负责

- SceneGraph 持久化
- 数据库查询
- 区域映射持久化
- 能耗统计聚合
- 跨系统设备映射

## 9. 当前已清理的残留功能

当前主工作流已经清理掉以下前台入口：

- 第一人称漫游入口
- 预览入口
- 音频设置入口
- 前端自带健康检查路由

保留但不影响建模主线的内部代码可以后续继续按需删除；当前用户界面已经只保留建模所需的可交互能力。