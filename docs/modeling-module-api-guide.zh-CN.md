# 建模模块接口与低耦合扩展开发指南

## 1. 文档目的

本文档面向下一位开发人员，目标是说明三件事：

1. 如何正确使用建模模块暴露出来的接口
2. 如何在宿主前端实现选中组件、高亮显示、聚焦组件、修改组件
3. 如何独立开发数据库连接模块与能耗查询模块，并保持与建模模块低耦合

当前建模模块主入口在：[packages/editor/src/components/modeling-editor-module.tsx](packages/editor/src/components/modeling-editor-module.tsx)。

对外推荐不要直接依赖源码路径，而是走公开分包：

- `@pascal-app/editor/modeling`：建模模块本体
- `@pascal-app/editor/host`：宿主壳与 API 客户端
- `@pascal-app/editor/auto-modeling`：自动建模导入能力
- `@pascal-app/editor/zone-mapping`：区域映射能力

## 2. 模块边界

先明确边界，否则后面一定会越写越乱。

### 2.1 建模模块负责

- SceneGraph 加载与保存
- 建筑、楼层、墙体、区域、构件的编辑
- 当前选中项的抛出
- 当前场景中的高亮、聚焦、局部显示控制

### 2.2 宿主前端负责

- 页面布局
- 业务筛选条件
- 组件详情面板
- 能耗曲线面板
- 调用数据库查询接口
- 将 componentId 与业务查询结果做联动展示

### 2.3 后端负责

- 场景持久化
- componentId 绑定关系维护
- 能耗原始数据查询
- 聚合统计
- 外部设备系统适配

结论很简单：

- 建模模块不应该知道数据库怎么连
- 建模模块不应该知道能耗表怎么查
- 能耗查询模块也不应该直接依赖编辑器内部 store

## 3. ModelingEditorModule 的公开接口

当前最稳定、最推荐使用的对外接口有三类：

1. onLoad
2. onSave
3. onSelectionChange

最小示例：

```tsx
import {
  ModelingEditorModule,
  type ModelingSelectionSnapshot,
  type SceneGraph,
} from '@pascal-app/editor/modeling'

export function BuildingWorkbench() {
  const projectId = 'building-001'

  async function handleLoad(): Promise<SceneGraph | null> {
    const response = await fetch(`/api/projects/${projectId}/scene`)
    if (!response.ok) {
      return null
    }

    const payload = await response.json()
    return payload.scene ?? null
  }

  async function handleSave(scene: SceneGraph) {
    await fetch(`/api/projects/${projectId}/scene`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene }),
    })
  }

  function handleSelectionChange(snapshot: ModelingSelectionSnapshot) {
    console.log(snapshot.selectedIds)
  }

  return (
    <ModelingEditorModule
      projectId={projectId}
      onLoad={handleLoad}
      onSave={handleSave}
      onSelectionChange={handleSelectionChange}
    />
  )
}
```

## 4. 选中组件接口

### 4.1 推荐读取字段

建模模块通过 onSelectionChange 返回的核心数据是：

- buildingId
- levelId
- zoneId
- selectedIds
- selectedNodes

其中对业务最重要的是：

- selectedIds

因为后续能耗查询、设备详情、告警信息等，都应该围绕 componentId 展开。

### 4.2 推荐判断逻辑

以后不要再用 metadata.deviceId 作为默认入口判断。默认判断逻辑应改成：

```tsx
function handleSelectionChange(snapshot: ModelingSelectionSnapshot) {
  const componentId = snapshot.selectedIds[0] ?? null

  if (!componentId) {
    setCurrentComponentId(null)
    setEnergyResult(null)
    return
  }

  setCurrentComponentId(componentId)
}
```

原因有三个：

1. selectedIds 是建模模块天然具备的稳定输出
2. componentId 本身已经是场景内主键，不依赖额外业务字段
3. 外部设备映射关系可以后置到后端处理，不污染建模层

## 5. 如何高亮显示组件

高亮分两种：

1. 业务侧悬停高亮
2. 业务侧点击选中高亮

### 5.1 悬停高亮

当前 viewer store 提供 hoveredId：

- [packages/viewer/src/store/use-viewer.ts](packages/viewer/src/store/use-viewer.ts)

可直接这样用：

```tsx
import { useViewer } from '@pascal-app/viewer'

function highlightComponent(componentId: string | null) {
  useViewer.getState().setHoveredId(componentId)
}
```

适用场景：

- 鼠标移入右侧列表项时，高亮三维里的对应构件
- 鼠标移出列表项时，取消高亮

### 5.2 点击后选中高亮

如果要把某个构件切换成真正选中态，应更新 selection：

```tsx
import { useViewer } from '@pascal-app/viewer'

function selectComponent(input: {
  buildingId: string | null
  levelId: string | null
  zoneId: string | null
  componentId: string
}) {
  useViewer.getState().setSelection({
    buildingId: input.buildingId,
    levelId: input.levelId,
    zoneId: input.zoneId,
    selectedIds: [input.componentId],
  })
}
```

这会触发编辑器已有的选中高亮逻辑，并同步更新 onSelectionChange。

## 6. 如何聚焦到组件

聚焦不要自己重复写相机逻辑，直接复用事件总线：

- [packages/core/src/events/bus.ts](packages/core/src/events/bus.ts)

可用事件：

- camera-controls:focus

示例：

```tsx
import { emitter } from '@pascal-app/core'

function focusComponent(componentId: string) {
  emitter.emit('camera-controls:focus', { nodeId: componentId })
}
```

推荐组合：

1. 列表 hover 时只 setHoveredId
2. 列表 click 时 setSelection + emitter.emit('camera-controls:focus')

这样职责更清晰。

## 7. 如何修改组件

### 7.1 单节点修改

Scene store 提供 updateNode：

- [packages/core/src/store/use-scene.ts](packages/core/src/store/use-scene.ts)

示例：

```tsx
import { useScene } from '@pascal-app/core'

function renameComponent(componentId: string, name: string) {
  useScene.getState().updateNode(componentId, { name })
}
```

### 7.2 批量修改

```tsx
import { useScene } from '@pascal-app/core'

function hideComponents(componentIds: string[]) {
  useScene.getState().updateNodes(
    componentIds.map((id) => ({
      id,
      data: { visible: false },
    })),
  )
}
```

### 7.3 删除组件

```tsx
import { useScene } from '@pascal-app/core'

function removeComponent(componentId: string) {
  useScene.getState().deleteNode(componentId)
}
```

### 7.4 什么时候允许直接改 Scene store

只有在下面这种场景里，才建议直接调用 updateNode 或 deleteNode：

1. 你写的是嵌入在建模页内部的自定义面板
2. 你本身就希望操作立刻反映到模型中
3. 这个面板属于“编辑功能”，不是“业务查询功能”

如果你写的是纯业务面板，例如能耗分析、设备台账、报表中心，则不要直接依赖 Scene store，只通过 componentId 和后端接口通信。

## 8. 低耦合实现建议

### 8.1 推荐模块拆分

宿主前端建议拆成：

1. modeling-host：挂载建模模块
2. selection-controller：接收 onSelectionChange，维护当前 componentId
3. energy-query-module：根据 componentId 请求能耗数据
4. data-access-module：只负责 HTTP 或 RPC 调用

后端建议拆成：

1. scene-repository：场景存储
2. component-binding-repository：组件绑定关系
3. energy-repository：能耗原始数据查询
4. energy-service：业务聚合
5. energy-controller：HTTP 输出

### 8.2 推荐依赖方向

正确方向：

- 建模模块 -> 无业务依赖
- 宿主前端 -> 依赖公开分包 `@pascal-app/editor/modeling` 或 `@pascal-app/editor/host`
- 查询模块 -> 依赖 data-access 接口
- 后端 service -> 依赖 repository 接口

错误方向：

- 建模模块直接访问数据库
- 建模模块直接 import 能耗 service
- 能耗模块直接读取 useScene / useViewer 作为主数据源

## 9. 数据库设计建议

如果目标是“点击组件直接显示能耗”，那数据库主查询键必须统一成 component_id。

### 9.1 必备表一：场景表

- project_id
- scene_graph_json
- updated_at

### 9.2 必备表二：组件绑定表

- project_id
- component_id
- binding_type
- binding_target_id
- created_at
- updated_at

说明：

- component_id 是来自 SceneGraph 的节点 id
- binding_target_id 可以是外部测点 id、设备 id、电表 id
- 这张表只做适配，不改变前端查询主键

### 9.3 必备表三：能耗明细表

- project_id
- component_id
- metric_type
- metric_value
- collected_at

如果你们的真实数据源不是按 component_id 存，而是按 meter_id 或 point_id 存，也没关系：

1. 先用 component_binding 找到外部 id
2. 再去真实能耗表查询
3. 最终仍按 component_id 返回给前端

这就是低耦合的关键。

## 10. 查询模块的接口设计建议

前端不要直接拼接很多杂乱请求，先定义统一的查询接口。

### 10.1 前端查询接口

```ts
export interface EnergyQueryClient {
  queryByComponentId(input: {
    projectId: string
    componentId: string
    from: string
    to: string
    granularity: '15m' | 'hour' | 'day'
  }): Promise<EnergySeriesResult>
}
```

### 10.2 后端 service 接口

```ts
export interface EnergyQueryService {
  queryByComponentId(input: {
    projectId: string
    componentId: string
    from: Date
    to: Date
    granularity: '15m' | 'hour' | 'day'
  }): Promise<EnergySeriesResult>
}
```

### 10.3 repository 接口

```ts
export interface ComponentBindingRepository {
  findBinding(projectId: string, componentId: string): Promise<{
    bindingType: string
    bindingTargetId: string
  } | null>
}

export interface EnergyRepository {
  querySeriesByBinding(input: {
    projectId: string
    bindingType: string
    bindingTargetId: string
    from: Date
    to: Date
    granularity: '15m' | 'hour' | 'day'
  }): Promise<EnergySeriesPoint[]>
}
```

这样后端 service 只依赖接口，不依赖某个具体数据库。

## 11. 点击组件后显示能耗的标准流程

以后统一按下面的链路实现：

1. 建模模块触发 onSelectionChange
2. 宿主前端取 snapshot.selectedIds[0]
3. 宿主前端把这个值当成 componentId
4. 调用 GET /projects/:projectId/energy/components/:componentId
5. 后端收到 componentId
6. 后端用 component_binding 做可选映射
7. 后端查询真实能耗数据源
8. 后端把结果按 componentId 返回
9. 宿主前端渲染曲线、指标卡、告警信息

标准前端示例：

```tsx
function handleSelectionChange(snapshot: ModelingSelectionSnapshot) {
  const componentId = snapshot.selectedIds[0] ?? null

  if (!componentId) {
    setEnergyResult(null)
    return
  }

  fetch(`/api/projects/building-001/energy/components/${componentId}`)
    .then((response) => response.json())
    .then((result) => setEnergyResult(result))
}
```

这条规则要固定下来：

- 前端永远按 componentId 发起查询
- 后端永远负责做外部系统映射

## 12. 不推荐的做法

下面这些写法以后都尽量不要再出现：

1. 在前端 onSelectionChange 里先读 metadata.deviceId 再查接口
2. 在建模模块里直接写数据库连接代码
3. 在能耗查询模块里直接 import useScene 读取 selectedNodes 作为唯一输入
4. 在后端 controller 里直接拼 SQL，不抽 repository 层
5. 让前端知道 meter_id、point_id、sensor_id 的具体映射细节

这些做法都会导致后续改数据源时需要同时修改前端、建模层和查询层，维护成本很高。

## 13. 推荐开发顺序

如果下一位开发者要独立开发数据库连接模块与能耗查询模块，建议按下面顺序推进：

1. 先固定 HTTP 接口入参为 projectId + componentId
2. 再定义 repository interface 和 service interface
3. 先写一个 mock repository 跑通接口
4. 再接 MySQL、PostgreSQL 或时序库的真实实现
5. 最后在宿主前端把 onSelectionChange 接到查询面板

这样即使数据库还没接好，前端联调也能先推进。

## 14. 严格分包建议

如果后续要把建模模块挂载到新的宿主前端，必须遵守下面这条规则：

1. 不要 import `apps/editor/**`
2. 不要 import `packages/editor/src/**`
3. 不要 import `@pascal-app/editor` 根入口作为默认习惯
4. 优先 import 明确子入口，例如 `@pascal-app/editor/modeling` 和 `@pascal-app/editor/host`

原因是根入口会不断累积导出，子入口才是真正稳定的对外契约。
