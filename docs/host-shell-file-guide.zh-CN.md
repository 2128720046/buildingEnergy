# 宿主前端文件说明

本文档说明当前宿主前端相关文件的实际职责，便于后续继续改动 UI、联调接口或拆分组件时快速定位代码。

## 1. [apps/editor/components/host-workbench.tsx](apps/editor/components/host-workbench.tsx)

这个文件是整个宿主前端的总装入口，负责把编辑器核心模块、编辑区内工具箱、左侧快捷箭头按钮和右侧业务栏组装到同一页面里。

它主要承担四件事：

1. 管理宿主层状态。
   包括当前选中构件、保存状态、右侧业务栏宽度、工具箱展开状态、筛选条件以及能耗查询结果。

2. 连接场景读写接口。
   通过 `createEditorApiClient` 把编辑器的 `onLoad` 和 `onSave` 对接到后端场景接口。

3. 监听构件选择并触发能耗查询。
   当用户在编辑器中点选构件时，这里会根据 `selectedComponentId` 调用 `loadComponentEnergy`。

4. 为右侧业务栏准备筛选数据。
   通过 `buildHostQueryModel` 根据当前场景节点生成楼层选项、房间选项和查询结果。

## 2. [apps/editor/components/host-in-canvas-toolbox.tsx](apps/editor/components/host-in-canvas-toolbox.tsx)

这个文件负责“编辑区内部工具箱”的全部呈现与交互。

它的设计目标是：

1. 工具箱必须悬浮在编辑画布内部，而不是成为右侧的外壳面板。
2. 工具必须严格沿一列纵向排布，每一个按钮占据单独一行。
3. 顶部只保留一个箭头按钮控制展开/收起，不显示“工具”等文案。

当前文件中的按钮大致分为几类：

1. 选择类按钮：选择、框选。
2. 工作模式按钮：结构建模、布置模式、区域模式、删除模式。
3. 结构工具按钮：墙体、楼板、吊顶、坡屋顶、楼梯、门、窗户。
4. 目录按钮：家具、家电、厨房、卫浴、室外。
5. 视图按钮：三维、二维、分屏、楼层模式、墙体模式、单位、主题、相机模式。
6. 相机动作按钮：向左旋转、向右旋转、顶视图。

## 3. [apps/editor/components/host-left-quick-actions.tsx](apps/editor/components/host-left-quick-actions.tsx)

这个文件只做一件事：渲染左上角的独立箭头按钮，用来控制左侧导航栏的展开和收起。

它存在的原因是：

1. 用户要求左侧导航栏的收起按钮不能再混进工具箱里。
2. 按钮必须只显示箭头，不能带文字。

## 4. [apps/editor/components/host-right-rail.tsx](apps/editor/components/host-right-rail.tsx)

这个文件负责右侧业务栏的全部行为和 UI。

它的职责包括：

1. 模拟左侧导航栏的交互方式。
   展开状态下可以拖拽左边界调宽度，收起后保留可见抓手。

2. 承载筛选区。
   顶部第一块内容就是查询筛选表单，不再放在编辑器顶部。

3. 显示当前选中构件的能耗结果。
   包括当前功率、今日耗电、本月累计和时间序列。

4. 显示查询结果列表。
   当前仍然是基于前端场景节点推导出的结果，等后端批量筛选接口准备好后可以在这里替换。

## 5. [apps/editor/components/host-filter-bar.tsx](apps/editor/components/host-filter-bar.tsx)

这个文件是一个纯表单组件，负责渲染筛选输入框、楼层下拉、房间下拉、时间下拉、能耗等级下拉和重置按钮。

它支持两种外观模式：

1. `floating`：适合放在画布顶部的悬浮卡片样式。
2. `sidebar`：适合放进右侧业务栏的深色侧栏样式。

当前宿主前端只在右侧业务栏中使用 `sidebar` 模式。

## 6. [apps/editor/lib/energy-api.ts](apps/editor/lib/energy-api.ts)

这个文件负责宿主前端的单构件能耗查询接口封装。

它的核心职责是：

1. 拼接能耗查询接口地址。
2. 发起请求并解析返回结果。
3. 对调用方暴露统一的 `EnergyApiResponse` 类型。

## 7. [apps/editor/lib/host-query.ts](apps/editor/lib/host-query.ts)

这个文件负责根据当前场景节点生成宿主查询模型。

当前它主要做三类工作：

1. 生成筛选项。
   例如楼层下拉选项、房间下拉选项。

2. 生成右侧查询结果列表。
   当后端尚未提供真实批量查询接口时，这里承担前端演示数据整理职责。

3. 为结果补充展示字段。
   例如楼层名称、房间名称、时间标签、能耗等级、估算耗电量等。

## 8. [packages/editor/src/components/modeling-chrome-modules.tsx](packages/editor/src/components/modeling-chrome-modules.tsx)

这个文件属于编辑器包层，作用是把宿主常用的“可组装模块”统一导出。

当前仍然保留 `ModelingHostToolbox`，原因是它对其他宿主前端仍然有复用价值；只是本次这个宿主壳不再直接拿它作为编辑区工具箱。

## 9. [resource/map.json](resource/map.json)

这个文件不是前端组件代码，而是区域映射数据样例。

它的作用是：

1. 描述项目下每个 `zone` 对应的房间名称。
2. 给出每个房间内包含的构件 `id`、名称和类型。
3. 为后续“按区域查能耗”或“构件到房间归属映射”提供数据依据。

例如当前你选中的 `item_9nep4tx0q6vb1e42`，在这个文件里属于 `zone_ijeu8ymtxhxc6xy8`，房间名是“客卧”，名称是“办公椅”。