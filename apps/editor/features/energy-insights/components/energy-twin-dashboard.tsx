'use client'

import NumberFlow from '@number-flow/react'
import { type AnyNode, useScene } from '@pascal-app/core'
import { useEditor, type ViewMode } from '@pascal-app/editor'
import type { EChartsCoreOption as EChartsOption } from 'echarts/core'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import {
  AlertTriangle,
  Building2,
  Clock3,
  Gauge,
  Leaf,
  MessageCircle,
  Siren,
  Thermometer,
  X,
  Zap,
} from 'lucide-react'
import { memo, type ComponentProps, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { DASHBOARD_FONTS } from '@/features/analytics/components/dashboard-theme'
import EnergyAssistantChat from '@/features/energy-insights/components/energy-assistant-chat'
import EnergyTimelineStrip, { type TimelineState } from '@/features/energy-insights/components/energy-timeline-strip'
import FloorHeatmapOverlay from '@/features/energy-insights/components/floor-heatmap-overlay'
import type { EnergyApiResponse, ZoneEnergyResponse } from '@/features/energy-insights/lib/energy-api'
import type { CompositionData, RankingItem, WeeklyTrendData } from '@/features/energy-insights/lib/energy-dashboard-data'
import { buildDashboardData } from '@/features/energy-insights/lib/energy-dashboard-data'
import { buildPrediction, type EditImpact, type PredictionPoint } from '@/features/energy-insights/lib/energy-prediction'
import {
  applyEnergyHighlights,
  resetAllEnergyHighlights,
} from '@/features/energy-insights/lib/energy-zone-highlight'
import {
  buildFloorHeatmapData,
  buildFloorHourlyAggregate,
} from '@/features/energy-insights/lib/floor-heatmap'
import type {
  HostFilterOption,
  HostQueryFilters,
  HostQueryResult,
} from '@/features/energy-insights/lib/host-query'
import { echarts } from '@/lib/echarts-bundle'
import { cn } from '@/lib/utils'

const RIGHT_CHART_RAIL_WIDTH = 360
const ASSISTANT_PANEL_WIDTH = 400
const EDITOR_PANEL_AVOID_GAP = 20
const EDITOR_PANEL_AVOID_VAR = '--host-editor-panel-avoid-right'

const ReactECharts = memo(function ReactECharts(props: ComponentProps<typeof ReactEChartsCore>) {
  return <ReactEChartsCore echarts={echarts} {...props} />
})

interface EnergyTwinDashboardProps {
  energyError: string | null
  energyLoading: boolean
  energyResult: EnergyApiResponse | null
  energyResultZone: ZoneEnergyResponse | null
  filters: HostQueryFilters
  hasQueried: boolean
  levelOptions: HostFilterOption[]
  onJumpToLevel3HighlightZones?: () => void
  onFiltersChange: (nextFilters: HostQueryFilters) => void
  onQuery: () => void
  projectId: string
  queryResults: HostQueryResult[]
  selectedComponentId: string | null
  selectedComponentName: string
  zoneOptions: HostFilterOption[]
  editSnapshot?: Record<string, AnyNode> | null
}

// ---- Cybernetic Chart Palette ----
const CYAN = '#00F5FF'
const AMBER = '#FFB300'
const RED = '#FF3333'
const BLUE = '#1D8BFF'
const PINK = '#FF5CA8'
const LABEL = 'rgba(206,244,255,0.72)'
const MUTED_LABEL = 'rgba(164,211,226,0.48)'
const GRID = 'rgba(122,247,255,0.14)'
const AXIS_LINE = 'rgba(122,247,255,0.22)'

function hudTooltip(trigger: 'axis' | 'item' = 'axis') {
  return {
    trigger,
    appendToBody: true,
    confine: true,
    backgroundColor: 'rgba(2, 8, 23, 0.92)',
    borderColor: 'rgba(122, 247, 255, 0.34)',
    borderWidth: 1,
    padding: [8, 10],
    textStyle: {
      color: '#E8FEFF',
      fontFamily: DASHBOARD_FONTS.cn,
      fontSize: 11,
      lineHeight: 18,
    },
    extraCssText: 'box-shadow:0 0 18px rgba(0,212,255,0.24);backdrop-filter:blur(10px);border-radius:3px;',
  }
}

function axisPointer(): Record<string, unknown> {
  return {
    type: 'line',
    lineStyle: {
      color: 'rgba(122,247,255,0.42)',
      type: 'dashed',
      width: 1,
    },
  }
}

function chartAxisLabel(fontFamily: string = DASHBOARD_FONTS.num) {
  return {
    color: LABEL,
    fontFamily,
    fontSize: 10,
  }
}

function splitLine(): Record<string, unknown> {
  return {
    lineStyle: {
      color: GRID,
      type: 'dashed',
      width: 1,
    },
  }
}

function buildDualLineOption(
  today: number[], yesterday: number[],
  peak: { hour: number; value: number },
  _valley: { hour: number; value: number },
): EChartsOption {
  const labels = today.map((_, i) => `${String(i).padStart(2, '0')}:00`)
  return {
    backgroundColor: 'transparent',
    grid: { top: 28, right: 14, bottom: 24, left: 42 },
    tooltip: { ...hudTooltip('axis'), axisPointer: axisPointer() },
    legend: {
      right: 2,
      top: 0,
      itemWidth: 18,
      itemHeight: 8,
      textStyle: { color: LABEL, fontFamily: DASHBOARD_FONTS.cn, fontSize: 11 },
    },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLabel: { ...chartAxisLabel(), interval: 3 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: AXIS_LINE } },
    },
    yAxis: {
      type: 'value',
      splitLine: splitLine(),
      axisLabel: chartAxisLabel(),
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        name: '今日',
        type: 'line',
        data: today,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        showSymbol: false,
        emphasis: { focus: 'series' },
        itemStyle: { color: CYAN, borderColor: '#E8FEFF', borderWidth: 1 },
        lineStyle: {
          color: CYAN,
          shadowBlur: 14,
          shadowColor: 'rgba(0,245,255,0.56)',
          width: 3,
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0,245,255,0.28)' },
              { offset: 0.55, color: 'rgba(0,130,255,0.08)' },
              { offset: 1, color: 'rgba(0,245,255,0)' },
            ],
          },
        },
        markPoint: {
          data: [{ coord: [peak.hour, peak.value], value: peak.value.toFixed(1), symbol: 'pin', symbolSize: 28 }],
          itemStyle: { color: RED as any, shadowBlur: 12, shadowColor: 'rgba(255,51,51,0.5)' },
          label: { color: '#fff', fontFamily: DASHBOARD_FONTS.num, fontSize: 11, fontWeight: 700 },
        },
      },
      {
        name: '昨日',
        type: 'line',
        data: yesterday,
        smooth: true,
        symbol: 'none',
        emphasis: { focus: 'series' },
        lineStyle: { color: AMBER, opacity: 0.78, shadowBlur: 8, shadowColor: 'rgba(255,179,0,0.32)', type: 'dashed', width: 2 },
      },
    ],
  } as unknown as EChartsOption
}

function buildCompositionDonut(c: CompositionData): EChartsOption {
  const data = [
    { name: 'HVAC', value: c.hvac }, { name: '照明', value: c.lighting },
    { name: '插座', value: c.socket }, { name: '其他', value: c.other },
  ].filter((d) => d.value > 0)
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const compositionCenter = ['50%', '43%']
  return {
    backgroundColor: 'transparent',
    tooltip: hudTooltip('item'),
    legend: {
      bottom: 0,
      icon: 'roundRect',
      itemGap: 10,
      itemHeight: 7,
      itemWidth: 14,
      textStyle: { color: LABEL, fontFamily: DASHBOARD_FONTS.cn, fontSize: 11 },
    },
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '34%',
        style: {
          text: total.toFixed(0),
          align: 'center',
          fill: '#E8FEFF',
          fontFamily: DASHBOARD_FONTS.num,
          fontSize: 26,
          fontWeight: 700,
        },
      },
      {
        type: 'text',
        left: 'center',
        top: '49%',
        style: {
          text: 'kWh',
          align: 'center',
          fill: MUTED_LABEL,
          fontFamily: DASHBOARD_FONTS.cn,
          fontSize: 10,
        },
      },
    ],
    series: [
      {
        type: 'pie',
        silent: true,
        animation: false,
        radius: ['0%', '48%'],
        center: compositionCenter,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: {
          color: 'rgba(0,212,255,0.06)',
          borderColor: 'rgba(122,247,255,0.18)',
          borderWidth: 1,
          shadowBlur: 18,
          shadowColor: 'rgba(0,212,255,0.18)',
        },
        data: [{ value: 1 }],
        z: 0,
      },
      {
        type: 'pie',
        radius: ['62%', '82%'],
        center: compositionCenter,
        padAngle: 2,
        minAngle: 8,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: {
          borderColor: 'rgba(2,8,23,0.9)',
          borderRadius: 4,
          borderWidth: 2,
          shadowBlur: 10,
          shadowColor: 'rgba(0,212,255,0.14)',
        },
        emphasis: {
          scale: true,
          scaleSize: 4,
          itemStyle: { shadowBlur: 20, shadowColor: 'rgba(122,247,255,0.36)' },
        },
        data,
        z: 2,
      },
    ],
    color: [
      {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 1,
        y2: 1,
        colorStops: [{ offset: 0, color: '#7AF7FF' }, { offset: 1, color: CYAN }],
      },
      {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 1,
        y2: 1,
        colorStops: [{ offset: 0, color: BLUE }, { offset: 1, color: '#00D4FF' }],
      },
      {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 1,
        y2: 1,
        colorStops: [{ offset: 0, color: '#FFE08A' }, { offset: 1, color: AMBER }],
      },
      'rgba(226,244,255,0.3)',
    ],
  }
}

function buildRankingBar(items: RankingItem[]): EChartsOption {
  if (items.length === 0) return {}
  return {
    backgroundColor: 'transparent',
    grid: { top: 8, right: 18, bottom: 8, left: 78 },
    xAxis: {
      type: 'value',
      splitLine: splitLine(),
      axisLabel: chartAxisLabel(),
      axisTick: { show: false },
      axisLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: items.map((r) => r.name),
      axisLabel: { ...chartAxisLabel(DASHBOARD_FONTS.cn), color: LABEL, width: 68, overflow: 'truncate' },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    tooltip: { ...hudTooltip('axis'), axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,212,255,0.08)' } } },
    series: [
      {
        type: 'bar',
        data: items.map((r) => r.value),
        barWidth: 12,
        showBackground: true,
        backgroundStyle: {
          color: 'rgba(122,247,255,0.05)',
          borderRadius: [0, 8, 8, 0],
        },
        itemStyle: {
          borderRadius: [0, 8, 8, 0],
          shadowBlur: 10,
          shadowColor: 'rgba(0,245,255,0.28)',
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: 'rgba(0,116,255,0.26)' },
              { offset: 0.55, color: CYAN },
              { offset: 1, color: '#A7FFFF' },
            ],
          },
        },
      },
    ],
  }
}

function buildWeeklyTrend(w: WeeklyTrendData): EChartsOption {
  return {
    backgroundColor: 'transparent',
    grid: { top: 30, right: 14, bottom: 22, left: 42 },
    tooltip: { ...hudTooltip('axis'), axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(122,247,255,0.08)' } } },
    legend: {
      right: 2,
      top: 0,
      itemHeight: 8,
      itemWidth: 16,
      textStyle: { color: LABEL, fontFamily: DASHBOARD_FONTS.cn, fontSize: 11 },
    },
    xAxis: {
      type: 'category',
      data: w.labels,
      axisLabel: chartAxisLabel(DASHBOARD_FONTS.cn),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: AXIS_LINE } },
    },
    yAxis: {
      type: 'value',
      splitLine: splitLine(),
      axisLabel: chartAxisLabel(),
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        name: '本周',
        type: 'bar',
        data: w.values,
        barGap: '28%',
        barWidth: 10,
        itemStyle: {
          borderRadius: [8, 8, 2, 2],
          shadowBlur: 10,
          shadowColor: 'rgba(0,245,255,0.25)',
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [{ offset: 0, color: '#A7FFFF' }, { offset: 0.45, color: CYAN }, { offset: 1, color: 'rgba(0,116,255,0.24)' }],
          },
        },
      },
      {
        name: '上周',
        type: 'bar',
        data: w.prevWeekValues,
        barWidth: 10,
        itemStyle: {
          borderRadius: [8, 8, 2, 2],
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(255,255,255,0.28)' }, { offset: 1, color: 'rgba(255,255,255,0.05)' }],
          },
        },
      },
    ],
  }
}

const PRED_COLORS = { actual: AMBER, base: CYAN, adjusted: PINK }

function buildPredictionOption(
  labels: string[],
  actual: number[],
  predicted: PredictionPoint[],
  editImpact: EditImpact,
): EChartsOption {
  const series: any[] = [
    {
      name: '实际',
      type: 'line',
      data: actual,
      smooth: true,
      symbol: 'diamond',
      symbolSize: 6,
      showSymbol: false,
      itemStyle: { color: PRED_COLORS.actual },
      lineStyle: {
        color: PRED_COLORS.actual,
        opacity: 0.88,
        shadowBlur: 10,
        shadowColor: 'rgba(255,179,0,0.34)',
        type: 'dashed',
        width: 2,
      },
      z: 1,
    },
    {
      name: '预测',
      type: 'line',
      data: predicted.map((p) => p.predicted),
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      showSymbol: false,
      itemStyle: { color: PRED_COLORS.base, borderColor: '#E8FEFF', borderWidth: 1 },
      lineStyle: {
        color: PRED_COLORS.base,
        shadowBlur: 16,
        shadowColor: 'rgba(0,245,255,0.5)',
        width: 3,
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(0,245,255,0.24)' },
            { offset: 0.58, color: 'rgba(29,139,255,0.08)' },
            { offset: 1, color: 'rgba(0,245,255,0)' },
          ],
        },
      },
      z: 2,
    },
  ]

  if (editImpact.hasEdits) {
    series.push({
      name: '编辑后预测',
      type: 'line',
      data: editImpact.adjusted.map((p: PredictionPoint) => p.predicted),
      smooth: true,
      symbol: 'rect',
      symbolSize: 6,
      showSymbol: false,
      itemStyle: { color: PRED_COLORS.adjusted },
      lineStyle: {
        color: PRED_COLORS.adjusted,
        shadowBlur: 14,
        shadowColor: 'rgba(255,92,168,0.42)',
        type: 'dotted',
        width: 3,
      },
      z: 3,
    })
  }

  return {
    backgroundColor: 'transparent',
    grid: { top: 30, right: 16, bottom: 24, left: 44 },
    tooltip: { ...hudTooltip('axis'), axisPointer: axisPointer() },
    legend: {
      right: 2,
      top: 0,
      itemHeight: 8,
      itemWidth: 18,
      textStyle: { color: LABEL, fontFamily: DASHBOARD_FONTS.cn, fontSize: 11 },
    },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLabel: { ...chartAxisLabel(), interval: 3 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: AXIS_LINE } },
    },
    yAxis: {
      type: 'value',
      splitLine: splitLine(),
      axisLabel: chartAxisLabel(),
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series,
  } as unknown as EChartsOption
}

/** 数字过渡动画包装 */
const AnimatedValue = memo(function AnimatedValue({ value, suffix = '', className = '' }: { value: number; suffix?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-0.5', className)}>
      <NumberFlow
        value={value}
        format={{ notation: 'compact', maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2 }}
        locales="zh-CN"
        willChange
      />
      {suffix ? <span className="text-[0.55em] opacity-60">{suffix}</span> : null}
    </span>
  )
})

const CardHeader = memo(function CardHeader({
  action,
  icon,
  title,
}: {
  action?: ReactNode
  icon: ReactNode
  title: string
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-start gap-2">
        <span className="operations-panel-icon shrink-0 text-cyan-300">{icon}</span>
        <div className="min-w-0">
          <h3
            className="text-[17px] font-black leading-tight text-cyan-50"
            style={{ fontFamily: DASHBOARD_FONTS.cn }}
          >
            <span
              aria-hidden
              className="operations-title-bar mr-2 inline-block h-3.5 w-1 align-middle"
            />
            {title}
          </h3>
          <div aria-hidden className="hud-title-rail mt-1.5 h-[8px] w-full max-w-[200px]" />
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
})

const GlassCard = memo(function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('contain-layout-paint glass-panel pointer-events-auto relative overflow-hidden p-3', className)}>
      <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
      {children}
    </section>
  )
})

const ChartFrame = memo(function ChartFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('contain-layout-paint tech-chart-frame h-full', className)}>{children}</div>
})

const DockedViewModeSwitch = memo(function DockedViewModeSwitch() {
  const viewMode = useEditor((state) => state.viewMode)
  const setViewMode = useEditor((state) => state.setViewMode)

  const modes: Array<{ id: ViewMode; label: string }> = [
    { id: '3d', label: '三维' },
    { id: '2d', label: '平面图' },
    { id: 'split', label: '分屏' },
  ]

  return (
    <div className="pointer-events-auto inline-flex h-9 items-center overflow-hidden rounded border border-white/8 bg-[#0C0E14]/60 backdrop-blur-md">
      {modes.map((mode) => {
        const isActive = viewMode === mode.id
        return (
          <button
            className={cn(
              'h-full px-3 font-medium text-xs transition-colors',
              isActive
                ? 'bg-[#00F5FF]/20 text-white/95 kpi-glow'
                : 'text-white/40 hover:bg-white/5 hover:text-white/70',
            )}
            key={mode.id}
            onClick={() => setViewMode(mode.id)}
            style={{ fontFamily: DASHBOARD_FONTS.cn }}
            type="button"
          >
            {mode.label}
          </button>
        )
      })}
    </div>
  )
})

export default function EnergyTwinDashboard({
  energyError,
  energyLoading,
  energyResult,
  energyResultZone,
  filters,
  hasQueried,
  levelOptions,
  onJumpToLevel3HighlightZones,
  onFiltersChange,
  onQuery,
  projectId,
  queryResults,
  selectedComponentId,
  selectedComponentName,
  zoneOptions,
  editSnapshot,
}: EnergyTwinDashboardProps) {
  const [assistantOpen, setAssistantOpen] = useState(false)
  const sceneNodes = useScene((state) => state.nodes) as Record<string, AnyNode>
  const readOnly = useScene((state) => state.readOnly)

  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const [timelineDate, setTimelineDate] = useState(todayStr)
  const [timelineHour, setTimelineHour] = useState(() => new Date().getHours())

  const handleTimelineChange = useCallback(
    (state: TimelineState) => {
      if (state.date !== timelineDate) setTimelineDate(state.date)
      if (state.hour !== timelineHour) setTimelineHour(state.hour)
    },
    [timelineDate, timelineHour],
  )

  const floorHeatmapData = useMemo(() => {
    if (!filters.levelId) return null
    return buildFloorHeatmapData(sceneNodes, filters.levelId, queryResults, {
      targetDate: timelineDate,
      targetHour: timelineHour,
    })
  }, [sceneNodes, filters.levelId, queryResults, timelineDate, timelineHour])

  // 联动 3D 场景 zone 颜色：高能耗区变红
  useEffect(() => {
    if (!floorHeatmapData) {
      resetAllEnergyHighlights()
      return
    }
    applyEnergyHighlights(
      floorHeatmapData.zones.map((z) => ({
        zoneId: z.zoneId,
        normalizedEnergy: z.normalizedEnergy,
      })),
    )
  }, [floorHeatmapData])

  const hourlySamples = useMemo(() => {
    if (!filters.levelId) return null
    return buildFloorHourlyAggregate(sceneNodes, filters.levelId, timelineDate)
  }, [sceneNodes, filters.levelId, timelineDate])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const chartRailOffset = RIGHT_CHART_RAIL_WIDTH + EDITOR_PANEL_AVOID_GAP
    const assistantOffset = assistantOpen ? ASSISTANT_PANEL_WIDTH + EDITOR_PANEL_AVOID_GAP : 0
    const nextOffset = Math.max(chartRailOffset, assistantOffset)
    document.documentElement.style.setProperty(EDITOR_PANEL_AVOID_VAR, `${nextOffset}px`)

    return () => {
      document.documentElement.style.setProperty(EDITOR_PANEL_AVOID_VAR, '0px')
    }
  }, [assistantOpen])

  const dashboardData = useMemo(
    () =>
      buildDashboardData({
        nodes: sceneNodes,
        levelId: filters.levelId,
        zoneId: filters.zoneId,
        date: timelineDate,
        hour: timelineHour,
        queryResults,
      }),
    [sceneNodes, filters.levelId, filters.zoneId, timelineDate, timelineHour, queryResults],
  )

  const predictionData = useMemo(
    () => buildPrediction(sceneNodes, filters.levelId || '', filters.zoneId || '', timelineDate, editSnapshot),
    [sceneNodes, filters.levelId, filters.zoneId, timelineDate, editSnapshot],
  )

  const dualLineOption = useMemo(
    () =>
      buildDualLineOption(
        dashboardData.left.hourlyCurve.today,
        dashboardData.left.hourlyCurve.yesterday,
        dashboardData.left.hourlyCurve.peak,
        dashboardData.left.hourlyCurve.valley,
      ),
    [
      dashboardData.left.hourlyCurve.today,
      dashboardData.left.hourlyCurve.yesterday,
      dashboardData.left.hourlyCurve.peak,
      dashboardData.left.hourlyCurve.valley,
    ],
  )

  const compositionDonutOption = useMemo(
    () => buildCompositionDonut(dashboardData.left.composition),
    [dashboardData.left.composition],
  )

  const rankingBarOption = useMemo(
    () => buildRankingBar(dashboardData.right.ranking),
    [dashboardData.right.ranking],
  )

  const weeklyTrendOption = useMemo(
    () => buildWeeklyTrend(dashboardData.right.weeklyTrend),
    [dashboardData.right.weeklyTrend],
  )

  const predictionOption = useMemo(
    () =>
      buildPredictionOption(
        predictionData.labels,
        predictionData.actual,
        predictionData.predicted,
        predictionData.editImpact,
      ),
    [predictionData.labels, predictionData.actual, predictionData.predicted, predictionData.editImpact],
  )

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden text-slate-100">
      <div className="cockpit-atmosphere" />
      <div
        className="absolute z-30"
        style={{
          top: '8px',
          left: 'calc(clamp(280px, 22vw, 360px) + 12px)',
        }}
      >
        <DockedViewModeSwitch />
      </div>

      <section
        className="pointer-events-none absolute inset-0 z-20 grid gap-4 px-4 pt-3 pb-4"
        style={{
          gridTemplateColumns: 'clamp(280px, 22vw, 360px) minmax(0, 1fr) clamp(280px, 22vw, 360px)',
        }}
      >
        <div className="pointer-events-auto min-h-0 w-full max-w-[360px]">
          <div className="h-full">
            <div className="no-scrollbar h-full space-y-3 overflow-y-auto pr-1">

              {/* 1. 告警状态 — 脉冲动画 + 占比条 */}
              <GlassCard>
                <CardHeader
                  icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.8} />}
                  title="告警状态"
                />
                {dashboardData.left.alert.total > 0 ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div className={cn(
                        'rounded-lg p-2 text-center border',
                        dashboardData.left.alert.high > 0
                          ? 'animate-pulse border-red-400/40 bg-red-500/20'
                          : 'border-red-400/15 bg-red-500/8',
                      )}>
                        <div className="text-[12px] uppercase tracking-[0.1em] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>高</div>
                        <div className="mt-0.5 text-3xl font-bold tabular-nums text-[#FF3333]" style={{ fontFamily: DASHBOARD_FONTS.num }}><NumberFlow value={dashboardData.left.alert.high} /></div>
                      </div>
                      <div className={cn(
                        'rounded-lg p-2 text-center border',
                        dashboardData.left.alert.medium > 0
                          ? 'border-amber-400/30 bg-amber-500/12'
                          : 'border-amber-300/10 bg-amber-500/5',
                      )}>
                        <div className="text-[12px] uppercase tracking-[0.1em] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>中</div>
                        <div className="mt-0.5 text-3xl font-bold tabular-nums text-white/80" style={{ fontFamily: DASHBOARD_FONTS.num }}><NumberFlow value={dashboardData.left.alert.medium} /></div>
                      </div>
                      <div className="rounded-lg border border-slate-300/10 bg-slate-500/8 p-2 text-center">
                        <div className="text-[12px] uppercase tracking-[0.1em] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>总计</div>
                        <div className="mt-0.5 text-3xl font-bold tabular-nums text-slate-300" style={{ fontFamily: DASHBOARD_FONTS.num }}><NumberFlow value={dashboardData.left.alert.total} /></div>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-[#FF3333]/70 transition-all duration-500"
                        style={{ width: `${Math.min(100, (dashboardData.left.alert.high / Math.max(1, dashboardData.left.alert.total)) * 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-right text-[12px] text-slate-500" style={{ fontFamily: DASHBOARD_FONTS.cn }}>
                      高优先级占比 {Math.round((dashboardData.left.alert.high / Math.max(1, dashboardData.left.alert.total)) * 100)}%
                    </div>
                  </>
                ) : (
                  <div className="py-3 text-center text-[14px] text-[rgba(0,245,255,0.7)]" style={{ fontFamily: DASHBOARD_FONTS.cn }}>
                    ✓ 当前无告警，系统运行正常
                  </div>
                )}
              </GlassCard>

              {/* 2. 实时功率 — 大字号 + 迷你条形图 */}
              <GlassCard>
                <CardHeader icon={<Zap className="h-4 w-4" strokeWidth={1.8} />} title="实时功率" />
                <div className="flex items-end justify-between">
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold tabular-nums text-white/95 kpi-glow" style={{ fontFamily: DASHBOARD_FONTS.num }}>
                        <NumberFlow value={dashboardData.left.realtimePower.currentKw} format={{ maximumFractionDigits: 1 }} />
                      </span>
                      <span className="text-[12px] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>kW</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* 迷你趋势条 */}
                      <div className="mt-1 flex h-5 items-end gap-px">
                        {(dashboardData.left.hourlyCurve.today).slice(0, 12).map((v, i) => (
                          <span
                            key={i}
                            className="w-1.5 rounded-sm"
                            style={{
                              height: `${Math.max(4, (v / Math.max(...dashboardData.left.hourlyCurve.today, 1)) * 20)}px`,
                              backgroundColor: i === dashboardData.left.hourlyCurve.peak.hour ? 'rgba(255,159,26,0.9)' : 'rgba(0,229,255,0.6)',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn(
                      'text-lg font-semibold tabular-nums',
                      dashboardData.left.realtimePower.trend === 'up' ? 'text-[#FF3333]' :
                        dashboardData.left.realtimePower.trend === 'down' ? 'text-[rgba(0,245,255,0.7)]' : 'text-white/50',
                    )}
                    style={{ fontFamily: DASHBOARD_FONTS.num }}
                    >
                      {dashboardData.left.realtimePower.trend === 'up' ? '↑' : dashboardData.left.realtimePower.trend === 'down' ? '↓' : '→'}
                      {dashboardData.left.realtimePower.changePct > 0 ? '+' : ''}{dashboardData.left.realtimePower.changePct}%
                    </div>
                    <div className="text-[12px] text-slate-500" style={{ fontFamily: DASHBOARD_FONTS.cn }}>vs 昨日同时刻</div>
                  </div>
                </div>
              </GlassCard>

              {/* 3. 能耗强度 */}
              <GlassCard>
                <CardHeader icon={<Gauge className="h-4 w-4" strokeWidth={1.8} />} title="能耗强度" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-cyan-300/15 bg-black/25 p-2">
                    <div className="text-[14px] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>总电耗</div>
                    <div className="mt-1 text-3xl font-bold text-white/95 kpi-glow" style={{ fontFamily: DASHBOARD_FONTS.num }}>{dashboardData.left.energyIntensity.todayKwh.toFixed(0)}</div>
                    <div className="text-[12px] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>kWh</div>
                  </div>
                  <div className="rounded-lg border border-cyan-300/15 bg-black/25 p-2">
                    <div className="text-[14px] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>能耗强度</div>
                    <div className="mt-1 text-3xl font-bold text-white/95 kpi-glow" style={{ fontFamily: DASHBOARD_FONTS.num }}>{dashboardData.left.energyIntensity.todayKwhPerM2.toFixed(2)}</div>
                    <div className="text-[12px] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>kWh/m²</div>
                  </div>
                </div>
                <div className="mt-2 text-right">
                  <span className={cn(
                    'text-[14px]',
                    dashboardData.left.energyIntensity.vsYesterdayPct > 0 ? 'text-[#FF3333]' : 'text-[rgba(0,245,255,0.7)]',
                  )}
                  style={{ fontFamily: DASHBOARD_FONTS.cn }}
                  >
                    {dashboardData.left.energyIntensity.vsYesterdayPct > 0 ? '+' : ''}{dashboardData.left.energyIntensity.vsYesterdayPct}% vs 昨日
                  </span>
                </div>
              </GlassCard>

              {/* 4. 24h 负荷曲线 */}
              <GlassCard>
                <CardHeader icon={<Clock3 className="h-4 w-4" strokeWidth={1.8} />} title="24h 负荷曲线" />
                <div className="h-36">
                  <ChartFrame>
                  <ReactECharts
                    key={`dual-${timelineDate}`}
                    option={dualLineOption}
                    style={{ height: '144px', width: '100%' }}
                  />
                  </ChartFrame>
                </div>
              </GlassCard>

              {/* 5. 分项占比 */}
              <GlassCard>
                <CardHeader icon={<Building2 className="h-4 w-4" strokeWidth={1.8} />} title="分项占比" />
                <div className="h-36">
                  <ChartFrame>
                  <ReactECharts
                    key={`comp-${timelineDate}`}
                    option={compositionDonutOption}
                    style={{ height: '144px', width: '100%' }}
                  />
                  </ChartFrame>
                </div>
              </GlassCard>

            </div>
          </div>
        </div>

        <div className="pointer-events-none relative min-h-0 min-w-0">
          {floorHeatmapData ? (
            <div className="pointer-events-auto absolute top-3 right-3 z-30">
              <FloorHeatmapOverlay data={floorHeatmapData} />
            </div>
          ) : null}
        </div>

        <div className="pointer-events-auto min-h-0 w-full max-w-[360px] justify-self-end">
          <div className="h-full">
            <div className="no-scrollbar h-full space-y-3 overflow-y-auto pr-1">

              {/* 6. 能耗排行 */}
              <GlassCard>
                <CardHeader icon={<Building2 className="h-4 w-4" strokeWidth={1.8} />} title={filters.levelId ? '房间能耗排行' : '楼层能耗排行'} />
                <div className="h-36">
                  <ChartFrame>
                  <ReactECharts
                    key={`rank-${timelineDate}`}
                    option={rankingBarOption}
                    style={{ height: '144px', width: '100%' }}
                  />
                  </ChartFrame>
                </div>
              </GlassCard>

              {/* 7. 峰值功率 — 仪表盘样式 */}
              <GlassCard>
                <CardHeader icon={<Siren className="h-4 w-4" strokeWidth={1.8} />} title="今日峰值" />
                <div className="space-y-2">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-white/95 kpi-glow" style={{ fontFamily: DASHBOARD_FONTS.num }}>
                          <NumberFlow value={dashboardData.right.peakPower.value} format={{ maximumFractionDigits: 1 }} />
                        </span>
                        <span className="text-[12px] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>kW</span>
                      </div>
                    </div>
                    <div className="rounded border border-white/8 bg-white/5 px-2 py-1">
                      <span className="text-[12px] text-white/80" style={{ fontFamily: DASHBOARD_FONTS.num }}>
                        {String(dashboardData.right.peakPower.hour).padStart(2, '0')}:00
                      </span>
                    </div>
                  </div>
                  {/* 峰值占比进度条 */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#00F5FF]/60 via-[#00F5FF]/80 to-[#FF3333]/70 transition-all"
                      style={{ width: `${Math.min(100, (dashboardData.right.peakPower.value / Math.max(1, dashboardData.left.realtimePower.currentKw + dashboardData.right.peakPower.value)) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[12px] text-slate-500" style={{ fontFamily: DASHBOARD_FONTS.cn }}>
                    <span>当前 {dashboardData.left.realtimePower.currentKw.toFixed(1)} kW</span>
                    <span>峰值 {dashboardData.right.peakPower.value.toFixed(1)} kW</span>
                  </div>
                </div>
              </GlassCard>

              {/* 8. 室内外环境 — 与时间轴联动 */}
              <GlassCard>
                <CardHeader icon={<Thermometer className="h-4 w-4" strokeWidth={1.8} />} title="室内外环境" />
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-cyan-300/15 bg-black/25 p-2">
                    <div className="mb-1 flex justify-center">
                      <span className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        dashboardData.right.indoorEnv.indoorTemp > 29 ? 'bg-red-400' :
                          dashboardData.right.indoorEnv.indoorTemp > 27 ? 'bg-amber-400' : 'bg-emerald-400',
                      )} />
                    </div>
                    <div className="text-3xl font-bold text-white/95 kpi-glow" style={{ fontFamily: DASHBOARD_FONTS.num }}>{dashboardData.right.indoorEnv.indoorTemp}°</div>
                    <div className="text-[12px] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>室内温度</div>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-black/25 p-2">
                    <div className="mb-1 flex justify-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                    </div>
                    <div className="text-3xl font-bold text-white/80" style={{ fontFamily: DASHBOARD_FONTS.num }}>{dashboardData.right.indoorEnv.indoorHumidity}%</div>
                    <div className="text-[12px] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>室内湿度</div>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-black/25 p-2">
                    <div className="mb-1 flex justify-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
                    </div>
                    <div className="text-3xl font-bold text-white/80" style={{ fontFamily: DASHBOARD_FONTS.num }}>{dashboardData.right.indoorEnv.co2}</div>
                    <div className="text-[12px] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>CO₂</div>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-black/25 p-2">
                    <div className="mb-1 flex justify-center">
                      <span className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        dashboardData.right.indoorEnv.outdoorTemp > 35 ? 'bg-[#FF3333]' : 'bg-white/30',
                      )} />
                    </div>
                    <div className="text-3xl font-bold text-white/95 kpi-glow" style={{ fontFamily: DASHBOARD_FONTS.num }}>{dashboardData.right.indoorEnv.outdoorTemp}°</div>
                    <div className="text-[12px] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>室外温度</div>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-black/25 p-2">
                    <div className="mb-1 flex justify-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
                    </div>
                    <div className="text-3xl font-bold text-white/80" style={{ fontFamily: DASHBOARD_FONTS.num }}>{dashboardData.right.indoorEnv.outdoorHumidity}%</div>
                    <div className="text-[12px] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>室外湿度</div>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-black/25 p-2">
                    <div className="mb-1 flex justify-center">
                      <span className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        dashboardData.right.indoorEnv.pm25 > 50 ? 'bg-[#FF3333]' : 'bg-white/25',
                      )} />
                    </div>
                    <div className="text-3xl font-bold text-white/80" style={{ fontFamily: DASHBOARD_FONTS.num }}>{dashboardData.right.indoorEnv.pm25}</div>
                    <div className="text-[12px] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>PM2.5</div>
                  </div>
                </div>
              </GlassCard>

              {/* 9. 电费估算 — 带对比 */}
              <GlassCard>
                <CardHeader icon={<Gauge className="h-4 w-4" strokeWidth={1.8} />} title="电费估算" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-cyan-300/15 bg-black/25 p-2.5">
                    <div className="text-[12px] uppercase tracking-[0.08em] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>今日</div>
                    <div className="mt-1">
                      <span className="text-3xl font-bold text-white/95 kpi-glow" style={{ fontFamily: DASHBOARD_FONTS.num }}>¥<NumberFlow value={dashboardData.right.cost.today} /></span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-black/25 p-2.5">
                    <div className="text-[12px] uppercase tracking-[0.08em] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>本月</div>
                    <div className="mt-1">
                      <span className="text-3xl font-bold text-white/80" style={{ fontFamily: DASHBOARD_FONTS.num }}>¥<NumberFlow value={dashboardData.right.cost.month} /></span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 rounded-lg bg-slate-800/50 px-2 py-1.5 text-center text-[12px] text-slate-400" style={{ fontFamily: DASHBOARD_FONTS.cn }}>
                  按 0.82 元/kWh 综合电价估算
                </div>
              </GlassCard>

              {/* 10. 本周趋势 */}
              <GlassCard>
                <CardHeader icon={<Leaf className="h-4 w-4" strokeWidth={1.8} />} title="本周趋势" />
                <div className="h-36">
                  <ChartFrame>
                  <ReactECharts
                    key={`week-${timelineDate}`}
                    option={weeklyTrendOption}
                    style={{ height: '144px', width: '100%' }}
                  />
                  </ChartFrame>
                </div>
              </GlassCard>

            </div>
          </div>
        </div>
      </section>

      {/* 能耗预测图（始终可见） */}
      <div className="pointer-events-auto absolute bottom-2 left-1/2 z-40 w-[min(44vw,680px)] min-w-[420px] -translate-x-1/2">
          <div className="rounded border border-cyan-300/15 bg-[#061522]/72 p-2 shadow-[0_0_28px_rgba(0,212,255,0.12)] backdrop-blur-sm">
            <div className="mb-1 flex items-center gap-2">
              <Clock3 className="h-3 w-3 text-[#00F5FF]" />
              <span
                className="font-semibold text-[14px] uppercase tracking-[0.12em] text-white/55"
                style={{ fontFamily: DASHBOARD_FONTS.cn }}
              >
                未来 24h 能耗预测
              </span>
              <span className="ml-auto text-[12px] text-white/30" style={{ fontFamily: DASHBOARD_FONTS.cn }}>
                {filters.zoneId ? '房间级' : filters.levelId ? '楼层级' : '整栋级'}
              </span>
            </div>
          <div className="h-[150px]">
            <ReactECharts
              key={`pred-${timelineDate}-${filters.levelId}-${filters.zoneId}`}
              option={predictionOption}
              opts={{ notMerge: true } as any}
              style={{ height: '150px', width: '100%' }}
            />
          </div>
        </div>
      </div>

      {/* 时间轴（只读模式下显示，编辑模式下隐藏） */}
      {readOnly ? (
        <div className="pointer-events-auto absolute bottom-[200px] left-1/2 z-40 w-[calc(100%-150px)] max-w-[1100px] -translate-x-1/2">
          <EnergyTimelineStrip
            date={timelineDate}
            hour={timelineHour}
            hourlySamples={hourlySamples}
            onChange={handleTimelineChange}
          />
        </div>
      ) : null}

      <div className="absolute left-1/2 top-[104px] z-30 w-72 -translate-x-1/2 space-y-2">
        {energyLoading ? (
          <div
            className="glass-panel pointer-events-auto rounded-lg px-3 py-2 text-[12px] text-cyan-100"
            style={{ fontFamily: DASHBOARD_FONTS.cn }}
          >
            实时数据同步中...
          </div>
        ) : null}
        {energyError ? (
          <div
            className="glass-panel pointer-events-auto rounded-lg border-red-400/35 px-3 py-2 text-[12px] text-red-200"
            style={{ fontFamily: DASHBOARD_FONTS.cn }}
          >
            数据异常: {energyError}
          </div>
        ) : null}
      </div>

      <div className="pointer-events-auto absolute right-5 bottom-5 z-50">
        <button
          className="glass-panel flex h-12 w-12 items-center justify-center rounded-full text-cyan-100 transition-colors hover:bg-cyan-500/18"
          onClick={() => setAssistantOpen((current) => !current)}
          type="button"
        >
          {assistantOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        </button>
      </div>

      {assistantOpen ? (
        <div
          className="pointer-events-auto absolute top-[10vh] right-4 bottom-4 z-40 overflow-hidden rounded-sm border border-cyan-400/20 bg-[#050505] p-1 shadow-[0_24px_52px_rgba(0,0,0,0.62)]"
          style={{
            width: `${ASSISTANT_PANEL_WIDTH}px`,
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          <EnergyAssistantChat
            energyResult={energyResult}
            onJumpToLevel3HighlightZones={onJumpToLevel3HighlightZones}
            projectId={projectId}
            queryResults={queryResults}
            selectedComponentId={selectedComponentId}
            selectedComponentName={selectedComponentName}
            tone="dark"
            variant="workspace"
          />
        </div>
      ) : null}
    </div>
  )
}
