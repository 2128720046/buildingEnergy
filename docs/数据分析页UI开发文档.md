# 数据分析页UI开发文档

## 1. 页面定位

数据分析页是建筑能耗管理系统中的实时监测大屏，目标是同时呈现能耗、人流、设备状态、风险分层和监测明细。页面采用深蓝科技风，强调高信息密度、实时反馈和可悬停查看详情。

页面入口：

- `apps/editor/features/analytics/components/data-analysis-workspace.tsx`
- 宿主导航与右上角状态栏：`apps/editor/features/host-shell/components/host-workbench.tsx`
- 全局视觉样式：`apps/editor/app/globals.css`
- 数据模型生成：`apps/editor/features/analytics/lib/monitoring-analytics.ts`

## 2. UI 架构

页面由三层组成：

| 层级 | 说明 |
|---|---|
| 宿主框架 | 顶部导航、标题、系统状态、时间、天气、通知、设置 |
| 数据分析主体 | KPI、健康评分、趋势图、时段负荷、热力矩阵、风险分层、环形图、散点图、明细表 |
| 全局交互层 | Tooltip、Toast、实时同步小组件、背景氛围动效 |

核心组件：

| 组件 | 作用 |
|---|---|
| `MetricCard` | 顶部 5 个 KPI 卡片 |
| `HealthGaugePanel` | 运行健康评分与状态比例 |
| `DailyLoadPanel` | 每日能耗与人流走势 |
| `HourlyPatternPanel` | 24 小时时段负荷关系 |
| `HeatmapPanel` | 7 天 × 4 时段热力矩阵 |
| `RiskLayerPanel` | 风险分层 Top 3 |
| `CompositionPanel` | 本月能耗构成环形图 |
| `RelationshipScatterPanel` | 能耗与人流/温度关系散点图 |
| `DetailTable` | 近期监测明细实时表格 |
| `RealtimeSyncWidget` | 右上角实时同步状态 |
| `DashboardToastStack` | 事件通知 Toast |

## 3. 视觉规范

主色：

- 背景：深蓝黑 `#020817`
- 高亮：青色 `#00D4FF`
- 次高亮：浅青 `#7AF7FF`
- 正常：绿色 `#22D3A0`
- 警示：玫红 `#FF4D8D`
- 峰值：金色 `#FFB800`

字体：

- 中文：阿里巴巴普惠体
- 数字：Rajdhani / DIN 风格数字字体
- KPI 和图表数值优先使用数字字体，保持大屏感。

卡片形态：

- 切角 HUD 边框
- 深蓝半透明底
- 轻微青色发光
- 悬停时上浮、加亮、显示 Tooltip

## 4. Tooltip 规范

Tooltip 统一由 `dashboard-tooltip.tsx` 提供。

触发方式：

```tsx
{...tooltipAttrs({
  title: '标题',
  rows: [
    { label: '字段', value: '内容' },
  ],
})}
```

样式要求：

- 深蓝半透明背景
- 青色边框
- 轻微阴影
- 左对齐内容
- 200ms 淡入淡出
- 自动避让屏幕边缘

## 5. 数据刷新策略

页面采用“有活感但不造假”的刷新原则。

| 数据类型 | 刷新频率 | 规则 |
|---|---:|---|
| 顶部时间 | 1s | 实时时钟 |
| 当前人流指数 | 2s | 小幅浮动 |
| 主信息卡温度/人流 | 2s | 小幅浮动 |
| 近期监测明细 | 2~3s | 顶部插入新行，最多保留 12 行 |
| 当前时段负荷/HVAC/峰值检查 | 8s | 只刷新当前时段 |
| 今日累计耗电量 | 10s | 只增不减，每次小幅增加 |
| 本月构成能耗 | 10s | 各分类按比例累加 |
| 今日预警 | 30~60s 或事件触发 | 只增不减 |
| 健康评分/风险分层 | 20s | 小幅缓变 |
| 历史趋势/热力/散点 | 不刷新 | 仅保留装饰动效 |

注意：

- 历史日期数据不能跳变。
- 累计值不能减少。
- 散点位置和相关系数保持静态。
- 当前状态分布可微调，但“今日预警”作为累计值只增。

## 6. 实时感设计

页面通过以下方式营造实时监控感：

- KPI 数字滚动与变化箭头
- KPI 下方 mini-trend 走势线每 2 秒更新
- 表格每 2~3 秒插入一条新监测记录
- 新行青色闪烁，预警行红色脉冲
- 右上角实时同步雷达持续旋转
- 8~15 秒随机触发 Toast 事件
- 背景网格流光、粒子与数据雨
- 静态图表增加扫描线、流光点、呼吸光斑

## 7. 关键交互

所有主要数据元素均支持鼠标悬停详情：

- KPI 卡片：显示今日/同比/峰值/处理状态等明细。
- 圆环评分：显示评分构成。
- 比例条：显示楼栋列表、数量、占比。
- 柱状图与折线节点：显示日期、能耗、人流、环比。
- 热力单元格：显示日期时段、同期对比、负荷等级。
- 风险行：显示楼栋风险、设备数、处理建议。
- 环形图分段：显示分类能耗、占比、Top 3 楼栋。
- 散点：显示类型、能耗、人流/温度、楼栋时间。
- 表格行/单元格/状态徽章：显示阈值、异常判断、负责人和建议。

## 8. 右上角状态栏

状态栏位于宿主框架 `DataAnalysisHeaderStatus`：

- 系统在线/健康运行
- 日期与时间
- 天气与室外温度
- 通知按钮
- 设置按钮

天气当前为前端静态展示，可后续接入气象 API 或本地气象站数据。

## 9. 维护建议

新增指标时优先遵守以下约定：

1. 先判断数据属于实时、当前时段、累计、统计快照还是历史数据。
2. 累计类数据必须单调递增。
3. 历史数据只做视觉动效，不做数值刷新。
4. 新数据必须通过统一 Tooltip 与 `AnimatedNumber` 展示。
5. 表格新增行必须保证楼栋和设备 ID 前缀一致。
6. 大屏动效优先用 CSS animation/transition，避免引入重型动画库。

## 10. 验证方式

常用检查命令：

```powershell
bun x biome check apps/editor/features/analytics/components/data-analysis-workspace.tsx apps/editor/app/globals.css apps/editor/features/host-shell/components/host-workbench.tsx
```

浏览器验证：

- 打开 `http://localhost:3002/?workspace=data-analysis`
- 静止观察 30 秒
- 确认表格持续新增行
- 确认 KPI、热力、散点、环形图均有持续动效
- 确认历史图表数值不变
- 确认控制台无运行时 error
