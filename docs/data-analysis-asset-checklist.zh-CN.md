# 数据分析页 · 工业风大屏改造 素材采集清单

> 用途：把 `apps/editor/features/analytics/components/data-analysis-workspace.tsx` 这一页从当前的浅色玻璃风改造成深色工业大屏风（参考截图：科技蓝、切角边框、低多边形 isometric、克制动效）。
>
> 本清单**只**针对"数据分析"这一页。3D 模型部分不动。
>
> 所有素材最终落到：`apps/editor/public/images/dashboard/` 下，按下面的子目录组织。

---

## 0. 你已经有的资源（先用这些，不要重复找）

位置：项目根目录 `可视化大屏大标题小标题带边框PSD源文件B端大数据科技感素材合集/`

| 文件 | 用途 | 处理方式 |
|---|---|---|
| `小标题合集-55个.psd` | 小卡片标题装饰条 | PS 打开，切出 5–8 个不同样式，导出 PNG（透明底） |
| `小标题加框合集-35个.psd` | **重点：切角卡片边框** | PS 打开，切出 3–4 个尺寸的卡片边框，导出 9-slice 切片或整图 PNG |
| `大标题合集-62个.psd` / `64个.psd` | 顶部页面主标题装饰 | 选 1 个最克制的（不带太多发光），导出 PNG |
| `大标题合集-29.ai` / `34.ai` | 矢量大标题 | AI 打开导出 SVG，未来可换色 |

> ⚠ 这个素材包是商用 PSD 合集，使用前请确认你购买的授权范围（个人 / 商用 / 客户项目）。这是你的合规义务，我无法替你判断。

**先用 PS 完成下面这件事**（在写代码之前），把已经有的素材切出来：

```
public/images/dashboard/
├── frames/
│   ├── card-bevel-large.png      ← 从「小标题加框合集」选最大尺寸
│   ├── card-bevel-medium.png     ← 中等尺寸
│   ├── card-bevel-small.png      ← 小卡片
│   └── kpi-hex.png               ← KPI 数字六边形/盾形背景
├── titles/
│   ├── section-title-1.png       ← 区块小标题装饰条 1
│   ├── section-title-2.png       ← 区块小标题装饰条 2
│   └── page-title.png            ← 页面主标题（可选）
```

这一步做完，**至少 60% 的视觉就成型了**。下面是缺什么去外部找。

---

## 1. 字体（必须先到位，否则后面都白搭）

| 用途 | 字体 | 来源 | 协议 |
|---|---|---|---|
| 中文标题/正文 | 阿里巴巴普惠体 3.0 | https://fonts.alibabagroup.com/ | 免费可商用 |
| 数字（KPI、图表轴） | DIN Pro 或 **Oswald** | DIN Pro 商业字体；Oswald 见 Google Fonts | DIN Pro 付费 / **Oswald 免费 SIL OFL** |
| 备选数字 | **Rajdhani**（科技感更强）| Google Fonts | SIL OFL 免费 |

> 推荐组合：**阿里普惠体 + Rajdhani**（都免费可商用）。Rajdhani 字形偏窄、适合做大屏 KPI 数值。

落地路径：

```
public/fonts/
├── AlibabaPuHuiTi-3-55-Regular.woff2
├── AlibabaPuHuiTi-3-65-Medium.woff2
├── AlibabaPuHuiTi-3-85-Bold.woff2
├── Rajdhani-Medium.woff2
├── Rajdhani-Bold.woff2
└── Rajdhani-SemiBold.woff2
```

下载后用 `apps/editor/app/globals.css` 里的 `@font-face` 引入。**只下 woff2**，体积最小。

---

## 2. UI 边框/装饰素材（已有 PSD 不够用时再找这些）

### 2.1 切角卡片边框（已有 PSD 包应该够，这里是兜底来源）

| 来源 | 搜索词 | 协议注意 |
|---|---|---|
| iconfont.cn | `大屏边框` `科技边框` `切角边框` | 必须登录看每个素材的"商用"标记，**默认不可商用** |
| Figma Community | `data dashboard sci-fi`, `hud frame` | 看每个文件作者声明 |
| https://www.figma.com/community/file/1081927692907196549 | "Sci-Fi Dashboard UI Kit" | 通常 free for personal |
| Behance / Dribbble | 找参考，**不要直接下成品**（多数不可商用）| 仅参考 |

需要的具体类型（如已有 PSD 有就跳过）：

- `card-bevel-*.png`：左下/右下切角矩形（带 1px 描边发光）
- `panel-corner-*.svg`：四角直角装饰（仅四个角，中间空，可叠在任何 div 上）
- `divider-h.svg`：水平分割线（带中央菱形点缀）
- `progress-track.png`：进度条容器（带刻度线）

### 2.2 仪表盘 / 圆环背景

替换当前代码里的 `conic-gradient` 仪表盘（`ScorePanel` 第 316 行 `gaugeStyle`）：

| 需求 | 来源 |
|---|---|
| 圆形仪表盘外框 SVG（带刻度环、转角装饰）| Figma Community 搜 `circular gauge` `radial dashboard` |
| 圆环背景纹理 | Iconfont 搜 `仪表盘 圆环 科技` |

落地：
```
public/images/dashboard/gauges/
├── gauge-ring.svg          ← 外圈刻度环
├── gauge-corners.svg       ← 四角装饰（可选）
└── donut-bg.svg            ← 环形图背景纹理
```

### 2.3 表格/列表行背景

当前 `DetailTable` 是浅色表格，要改成深色行间隔条纹：

- 不需要素材，纯 CSS 实现：奇数行 `bg-slate-900/40`，偶数行 `bg-slate-900/20`
- 表头需要一个**背景渐变条**：`linear-gradient(90deg, rgba(0,212,255,0.15) 0%, transparent 100%)`

---

## 3. 图标素材

当前 `public/icons/` 下都是浅色拟物图标（`appliance.png` `bathroom.png` 等），是 3D 编辑器用的，**不要混用**。数据分析页需要单独一套深色发光线性图标。

落地：`public/images/dashboard/icons/`

| 图标名 | 用途 | 推荐尺寸 |
|---|---|---|
| `kpi-energy.png` | 能耗 KPI | 24×24 |
| `kpi-water.png` | 用水 KPI | 24×24 |
| `kpi-hvac.png` | 暖通 KPI | 24×24 |
| `kpi-occupancy.png` | 人流 KPI | 24×24 |
| `kpi-temperature.png` | 温度 KPI | 24×24 |
| `building.png` | 楼栋 | 20×20 |
| `peak.png` | 峰值（闪电） | 20×20 |
| `clock.png` | 时段 | 20×20 |
| `heatmap.png` | 热力图标题 | 20×20 |
| `ranking.png` | 排名 | 20×20 |
| `warning.png` | 预警/告警 | 20×20 |
| `arrow-up.png` `arrow-down.png` | KPI 趋势箭头 | 12×12 |

来源（按推荐顺序）：

1. **Iconify** (https://icon-sets.iconify.design/) — 找 `tabler` 或 `lucide` 系列，**SVG 全部免费可商用**。直接复制 SVG，自己改色为 `#00D4FF`。
2. **Streamline Icons** (free 套装) — Pixel 风格，工业感强
3. iconfont.cn — 注意商用授权

> 反 AI 味建议：**统一用一套图标**（比如全 Tabler，或全 Lucide），不要混搭。

---

## 4. 背景与氛围素材

### 4.1 全局背景

不需要图片，纯 CSS：

```css
background:
  radial-gradient(ellipse at top, #0A2540 0%, transparent 50%),
  radial-gradient(ellipse at bottom, #061829 0%, transparent 50%),
  #020817;
```

### 4.2 网格/点阵纹理（叠加在背景上）

- `public/images/dashboard/bg/grid.svg` — 网格 SVG（自己写，10 行代码）
- `public/images/dashboard/bg/dots.svg` — 点阵纹理

不要去外网找，**自己用 SVG 写**：

```svg
<!-- grid.svg, 平铺 -->
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,212,255,0.06)" stroke-width="1"/>
</svg>
```

### 4.3 顶部装饰条 / 雷达扫描（可选）

**不推荐加**，截图中没有，加上就 AI 味。

---

## 5. 图表配色（不需要素材，但要确定色板）

当前代码里的图表色（`#0ea5e9` `#22c55e` `#f59e0b`）要全部替换成大屏色板：

```ts
// apps/editor/features/analytics/lib/dashboard-theme.ts （新建）
export const DASHBOARD_COLORS = {
  // 背景
  bgDeep: '#020817',
  bgMid: '#061829',
  bgPanel: '#0A2540',

  // 主色（青蓝，仅用于强调）
  primary: '#00D4FF',
  primaryDim: '#0088B3',

  // 辅色
  amber: '#FFB800',     // 告警/关键
  emerald: '#22D3A0',   // 正常/正向
  rose: '#FF4D6D',      // 危险

  // 文本
  textPrimary: '#E8F4FF',
  textSecondary: '#8DA8C5',
  textMuted: '#5A7595',

  // 边框
  borderStrong: '#1E3A5F',
  borderSoft: 'rgba(0, 212, 255, 0.15)',

  // 图表系列色（5 个，按重要度排序）
  series: ['#00D4FF', '#FFB800', '#22D3A0', '#7C5CFF', '#FF6B9B'],
}
```

---

## 6. 不要找的东西（陷阱）

下面这些素材**看起来很大屏**，但加进去就**立刻 AI 味**：

| ❌ 不要 | 原因 |
|---|---|
| 旋转地球 GIF | 90% 的廉价大屏滥用 |
| 流光边框 / 跑马灯边框 | 抢戏 |
| 雷达扫描圈 | 噪声大 |
| 粒子背景 | 干扰阅读 |
| 紫色/粉色渐变 | 跟工业感冲突 |
| Emoji | 永远不要 |
| 过曝发光 (`box-shadow: 0 0 50px ...`) | AI 味标志 |
| 全屏背景视频（除非 3D 模型） | 性能差 |

---

## 7. 落地后的目录结构（验收用）

```
apps/editor/public/
├── fonts/
│   ├── AlibabaPuHuiTi-*.woff2     ← 3 个字重
│   └── Rajdhani-*.woff2           ← 3 个字重
└── images/
    └── dashboard/
        ├── frames/                 ← 4 个 PNG（从已有 PSD 切出）
        ├── titles/                 ← 2-3 个 PNG（从已有 PSD 切出）
        ├── gauges/                 ← 2-3 个 SVG
        ├── icons/                  ← ~12 个 PNG/SVG（24×24 或 20×20）
        └── bg/
            ├── grid.svg
            └── dots.svg
```

---

## 8. 素材到位后的下一步

把上面这些都准备好，告诉我"素材已就绪"，我会：

1. 新建 `apps/editor/features/analytics/components/dashboard-theme.ts` 集中管理配色
2. 新建 `BevelCard`、`SectionHeader`、`KpiTile` 三个壳子组件，**所有卡片都用它们**（避免散落 className）
3. 重构 `data-analysis-workspace.tsx`，按区块替换：
   - 顶部 banner + KPI 行
   - 评分卡 + 峰值 + 字段速览
   - 日趋势 + 时段折线
   - 双散点
   - 热力图 + 占比 + 楼栋排名
   - 明细表
4. 替换图表 SVG 中所有写死的颜色为 `DASHBOARD_COLORS.*`
5. 字体引入 + 全局色变量

---

## 9. 一份"反 AI 味"的硬约束（贴给 Cursor/Claude 当 system prompt 用）

```
你正在改造 buildingEnergy 项目的"数据分析"页面（data-analysis-workspace.tsx），
风格：中国工业级数据可视化大屏。严格遵守：

1. 配色只能从 DASHBOARD_COLORS 取，不要自创色值。
2. 所有卡片容器必须用 <BevelCard>，不要直接写 className="rounded-... border ...".
3. 所有区块小标题必须用 <SectionHeader>，禁止直接 <h2>.
4. 不要用 box-shadow 模拟发光，必须用 PNG 边框素材。
5. 不要添加：扫描线、雷达圈、粒子、流光、emoji、循环呼吸光。
6. 字体：中文用 var(--font-puhuiti)，数字用 var(--font-rajdhani)，禁止 system-ui.
7. 字号必须建立层级：KPI 32-40px / 卡片标题 16px / 数据值 20-24px / 标签 11-12px.
8. 视觉决策不确定时，停下来问我，不要自由发挥。
9. 不引入新的图表库；继续用现有的手绘 SVG，但替换颜色和样式。
10. 不动 3D 模型相关的任何文件。
```

把这段贴在每次让 AI 改这一页的开头。
