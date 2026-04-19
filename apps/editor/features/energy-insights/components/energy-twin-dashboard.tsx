'use client'

import { emitter, type AnyNode } from '@pascal-app/core'
import { useEditor, type ViewMode } from '@pascal-app/editor'
import {
  AlertTriangle,
  Building2,
  Clock3,
  Gauge,
  Leaf,
  MessageCircle,
  Siren,
  Thermometer,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import EnergyAssistantChat from '@/features/energy-insights/components/energy-assistant-chat'
import HostFilterBar from '@/features/energy-insights/components/host-filter-bar'
import type { EnergyApiResponse, ZoneEnergyResponse } from '@/features/energy-insights/lib/energy-api'
import type {
  HostFilterOption,
  HostQueryFilters,
  HostQueryResult,
} from '@/features/energy-insights/lib/host-query'
import { cn } from '@/lib/utils'

const CYAN = '#00E5FF'
const GREEN = '#39FF14'
const ORANGE = '#FF9F1A'
const RED = '#FF4D4F'
const RIGHT_CHART_RAIL_WIDTH = 360
const ASSISTANT_PANEL_WIDTH = 400
const EDITOR_PANEL_AVOID_GAP = 20
const EDITOR_PANEL_AVOID_VAR = '--host-editor-panel-avoid-right'

interface EnergyTwinDashboardProps {
  energyError: string | null
  energyLoading: boolean
  energyResult: EnergyApiResponse | null
  energyResultZone: ZoneEnergyResponse | null
  filters: HostQueryFilters
  hasQueried: boolean
  levelOptions: HostFilterOption[]
  onFiltersChange: (nextFilters: HostQueryFilters) => void
  onQuery: () => void
  projectId: string
  queryResults: HostQueryResult[]
  selectedComponentId: string | null
  selectedComponentName: string
  topToolbar?: ReactNode
  zoneOptions: HostFilterOption[]
}

function hashNumber(input: string): number {
  let value = 0
  for (let index = 0; index < input.length; index += 1) {
    value = (value * 33 + input.charCodeAt(index)) % 100003
  }
  return value
}

function buildTrendValues(base: number, count: number, seedKey: string) {
  const seed = hashNumber(seedKey)
  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin((index / Math.max(1, count - 1)) * Math.PI * 2)
    const drift = (seed % 17) * 0.8
    const jitter = ((seed >> (index % 7)) % 11) - 5
    return Number((base + drift + wave * 14 + jitter * 1.2).toFixed(1))
  })
}

function buildTrendOption(labels: string[], values: number[]): EChartsOption {
  return {
    backgroundColor: 'transparent',
    grid: { top: 18, right: 8, bottom: 24, left: 36 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.45)' } },
      axisLabel: { color: 'rgba(148, 163, 184, 0.85)', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.25)' } },
      axisLabel: { color: 'rgba(148, 163, 184, 0.85)', fontSize: 10 },
    },
    series: [
      {
        data: values,
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: CYAN, width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0, 229, 255, 0.35)' },
              { offset: 1, color: 'rgba(0, 229, 255, 0.02)' },
            ],
          },
        },
      },
    ],
  }
}

function buildDonutOption(values: Array<{ name: string; value: number }>): EChartsOption {
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      confine: true,
      textStyle: {
        fontSize: 11,
        lineHeight: 16,
      },
      extraCssText: 'max-width:180px;white-space:normal;word-break:break-word;',
      formatter: (params: any) => {
        const name = typeof params?.name === 'string' ? params.name : '未知'
        const percent = typeof params?.percent === 'number' ? params.percent : 0
        return `${name}<br/>占比 ${percent.toFixed(1)}% · 优先级改造建议已就绪`
      },
    },
    legend: {
      bottom: 0,
      itemHeight: 6,
      itemWidth: 8,
      textStyle: { color: 'rgba(203, 213, 225, 0.85)', fontSize: 10 },
    },
    series: [
      {
        type: 'pie',
        radius: ['50%', '74%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: values,
      },
    ],
    color: [CYAN, GREEN, ORANGE, RED],
  }
}

function buildBarOption(labels: string[], values: number[]): EChartsOption {
  return {
    backgroundColor: 'transparent',
    grid: { top: 12, right: 8, bottom: 12, left: 64 },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.25)' } },
      axisLabel: { color: 'rgba(148, 163, 184, 0.8)', fontSize: 10 },
    },
    yAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: 'rgba(203, 213, 225, 0.9)', fontSize: 10 },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    series: [
      {
        type: 'bar',
        data: values,
        barWidth: 12,
        itemStyle: {
          borderRadius: 6,
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: 'rgba(0, 229, 255, 0.55)' },
              { offset: 1, color: 'rgba(57, 255, 20, 0.78)' },
            ],
          },
        },
      },
    ],
  }
}

function buildFunnelOption(values: Array<{ name: string; value: number }>): EChartsOption {
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'funnel',
        left: '4%',
        top: '8%',
        bottom: '8%',
        width: '92%',
        min: 0,
        max: Math.max(1, ...values.map((item) => item.value)),
        sort: 'descending',
        gap: 2,
        label: {
          color: 'rgba(226, 232, 240, 0.95)',
          fontSize: 10,
        },
        itemStyle: {
          borderColor: 'rgba(2, 6, 23, 0.9)',
          borderWidth: 1,
        },
        data: values,
      },
    ],
    color: ['rgba(255,77,79,0.95)', 'rgba(255,159,26,0.9)', 'rgba(0,229,255,0.85)', 'rgba(57,255,20,0.85)'],
  }
}

function buildScatterOption(points: Array<{ x: number; y: number; label: string }>): EChartsOption {
  return {
    backgroundColor: 'transparent',
    grid: { top: 18, right: 10, bottom: 24, left: 34 },
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const data = Array.isArray(params?.data) ? params.data : [0, 0, '未知']
        return `${data[2]}<br/>温度 ${data[0]}℃ · 负荷 ${data[1]} kWh`
      },
    },
    xAxis: {
      type: 'value',
      name: '温度',
      nameTextStyle: { color: 'rgba(148, 163, 184, 0.8)', fontSize: 10 },
      axisLabel: { color: 'rgba(148, 163, 184, 0.8)', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.25)' } },
    },
    yAxis: {
      type: 'value',
      name: '负荷',
      nameTextStyle: { color: 'rgba(148, 163, 184, 0.8)', fontSize: 10 },
      axisLabel: { color: 'rgba(148, 163, 184, 0.8)', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.25)' } },
    },
    series: [
      {
        type: 'scatter',
        symbolSize: (value: unknown) => {
          if (!Array.isArray(value)) return 10
          const y = Number(value[1] ?? 0)
          return Math.max(8, Math.min(16, y / 22))
        },
        itemStyle: { color: 'rgba(0,229,255,0.86)' },
        data: points.map((point) => [point.x, point.y, point.label]),
      },
    ],
  }
}

function buildSankeyOption(values: Array<{ name: string; value: number }>): EChartsOption {
  const total = values.reduce((sum, item) => sum + item.value, 0)
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'sankey',
        data: [
          { name: '总负荷' },
          { name: 'HVAC' },
          { name: '照明' },
          { name: '动力' },
          { name: '其他' },
        ],
        links: values.map((item) => ({
          source: '总负荷',
          target: item.name,
          value: Number(((item.value / Math.max(1, total)) * 100).toFixed(1)),
        })),
        emphasis: { focus: 'adjacency' },
        lineStyle: { color: 'gradient', curveness: 0.42 },
        label: { color: 'rgba(226, 232, 240, 0.9)', fontSize: 10 },
      },
    ],
    color: [CYAN, GREEN, ORANGE, RED],
  }
}

function buildCompareOption(before: number[], after: number[]): EChartsOption {
  const labels = ['异常前', '异常后']
  return {
    backgroundColor: 'transparent',
    grid: { top: 20, right: 8, bottom: 18, left: 28 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: 'rgba(148, 163, 184, 0.8)', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: 'rgba(148, 163, 184, 0.8)', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.25)' } },
    },
    legend: {
      right: 0,
      top: 0,
      textStyle: { color: 'rgba(203, 213, 225, 0.85)', fontSize: 10 },
    },
    series: [
      {
        name: '负荷',
        type: 'bar',
        barWidth: 12,
        data: [before[0], after[0]],
        itemStyle: { borderRadius: 4, color: 'rgba(0,229,255,0.78)' },
      },
      {
        name: 'SLA',
        type: 'bar',
        barWidth: 12,
        data: [before[1], after[1]],
        itemStyle: { borderRadius: 4, color: 'rgba(57,255,20,0.72)' },
      },
    ],
  }
}

function buildSlaOption(values: number[]): EChartsOption {
  return {
    backgroundColor: 'transparent',
    grid: { top: 20, right: 12, bottom: 20, left: 28 },
    xAxis: {
      type: 'category',
      data: ['待派单', '处理中', '已闭环'],
      axisLabel: { color: 'rgba(148, 163, 184, 0.8)', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: 'rgba(148, 163, 184, 0.8)', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(71, 85, 105, 0.25)' } },
    },
    tooltip: { trigger: 'axis' },
    series: [
      {
        type: 'bar',
        data: values,
        barWidth: 14,
        itemStyle: {
          borderRadius: 6,
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0,229,255,0.9)' },
              { offset: 1, color: 'rgba(2,132,199,0.35)' },
            ],
          },
        },
      },
    ],
  }
}

function buildHealthHeatmapOption(matrix: number[][]): EChartsOption {
  return {
    backgroundColor: 'transparent',
    tooltip: {
      position: 'top',
      formatter: (params: any) => {
        const data = Array.isArray(params?.data) ? params.data : [0, 0, 0]
        return `健康指数 ${data[2]}`
      },
    },
    grid: { top: 14, right: 14, bottom: 18, left: 48 },
    xAxis: {
      type: 'category',
      data: ['供电', '暖通', '照明', '给排水'],
      axisLabel: { color: 'rgba(148, 163, 184, 0.85)', fontSize: 10 },
      splitArea: { show: false },
    },
    yAxis: {
      type: 'category',
      data: ['L4', 'L3', 'L2', 'L1'],
      axisLabel: { color: 'rgba(148, 163, 184, 0.85)', fontSize: 10 },
      splitArea: { show: false },
    },
    visualMap: {
      min: 60,
      max: 100,
      show: false,
      inRange: {
        color: ['rgba(255,77,79,0.75)', 'rgba(255,159,26,0.75)', 'rgba(57,255,20,0.75)'],
      },
    },
    series: [
      {
        type: 'heatmap',
        data: matrix.flatMap((row, rowIndex) => row.map((value, colIndex) => [colIndex, rowIndex, value])),
        label: { show: false },
        emphasis: {
          itemStyle: {
            shadowBlur: 8,
            shadowColor: 'rgba(0,0,0,0.35)',
          },
        },
      },
    ],
  }
}

function CardHeader({
  action,
  icon,
  title,
}: {
  action?: ReactNode
  icon: ReactNode
  title: string
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="text-cyan-100 drop-shadow-[0_0_8px_rgba(34,211,238,0.45)]">{icon}</span>
        <h3 className="font-semibold text-[13px] tracking-[0.16em] text-cyan-50 uppercase">{title}</h3>
      </div>
      {action}
    </div>
  )
}

function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('glass-panel pointer-events-auto relative overflow-hidden p-3', className)}>
      <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
      {children}
    </section>
  )
}

function ChartFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('tech-chart-frame h-full', className)}>{children}</div>
}

function DockedViewModeSwitch() {
  const viewMode = useEditor((state) => state.viewMode)
  const setViewMode = useEditor((state) => state.setViewMode)

  const modes: Array<{ id: ViewMode; label: string }> = [
    { id: '3d', label: '三维' },
    { id: '2d', label: '平面图' },
    { id: 'split', label: '分屏' },
  ]

  return (
    <div className="pointer-events-auto inline-flex h-9 items-center overflow-hidden rounded-xl border border-cyan-300/35 bg-[#0a1324cc] shadow-[0_8px_24px_rgba(2,6,23,0.45)] backdrop-blur-md">
      {modes.map((mode) => {
        const isActive = viewMode === mode.id
        return (
          <button
            className={cn(
              'h-full px-3 font-medium text-xs transition-colors',
              isActive
                ? 'bg-cyan-400/20 text-cyan-100'
                : 'text-slate-300 hover:bg-cyan-500/10 hover:text-slate-100',
            )}
            key={mode.id}
            onClick={() => setViewMode(mode.id)}
            type="button"
          >
            {mode.label}
          </button>
        )
      })}
    </div>
  )
}

export default function EnergyTwinDashboard({
  energyError,
  energyLoading,
  energyResult,
  energyResultZone,
  filters,
  hasQueried,
  levelOptions,
  onFiltersChange,
  onQuery,
  projectId,
  queryResults,
  selectedComponentId,
  selectedComponentName,
  topToolbar,
  zoneOptions,
}: EnergyTwinDashboardProps) {
  const [assistantOpen, setAssistantOpen] = useState(false)

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

  const trendLabels = useMemo(
    () =>
      filters.timeRange === '7d'
        ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
        : filters.timeRange === '30d'
          ? ['第1周', '第2周', '第3周', '第4周', '第5周', '第6周', '第7周']
          : ['00', '04', '08', '12', '16', '20', '24'],
    [filters.timeRange],
  )

  const trendValues = useMemo(() => {
    if (energyResult?.series && energyResult.series.length > 0) {
      const normalized = energyResult.series.slice(-trendLabels.length).map((point) => point.value)
      if (normalized.length === trendLabels.length) {
        return normalized
      }
    }
    return buildTrendValues(95, trendLabels.length, `${projectId}-${filters.levelId}-${filters.timeRange}`)
  }, [energyResult?.series, filters.levelId, filters.timeRange, projectId, trendLabels.length])

  const totalLoad = trendValues.reduce((sum, value) => sum + value, 0)
  const peakLoad = Math.max(...trendValues)
  const hvacElectricity = Number(
    (
      energyResult?.hvacUsage ??
      (energyResultZone ? energyResultZone.total_electricity_kwh * 0.36 : totalLoad * 0.34)
    ).toFixed(1),
  )
  const totalWaterUsage = Number(
    (
      energyResult?.waterUsage ??
      (energyResultZone
        ? Math.max(0.6, energyResultZone.occupancy_density * 1.8)
        : (hashNumber(`${projectId}:${filters.levelId}:${filters.zoneId}:${filters.timeRange}`) % 90) / 10 + 1.2)
    ).toFixed(2),
  )

  const highCount = queryResults.filter((item) => item.energyLevel === '高').length
  const warningCount = Math.max(1, highCount)
  const normalRatio = queryResults.length === 0 ? 100 : ((queryResults.length - highCount) / queryResults.length) * 100
  const slaScore = Math.max(72, Math.round(95 - warningCount * 1.8))

  const compositionValues = [
    { name: 'HVAC', value: Math.max(18, Math.round(totalLoad * 0.34)) },
    { name: '照明', value: Math.max(12, Math.round(totalLoad * 0.26)) },
    { name: '动力', value: Math.max(8, Math.round(totalLoad * 0.22)) },
    { name: '其他', value: Math.max(5, Math.round(totalLoad * 0.18)) },
  ]

  const floorMap = new Map<string, number>()
  for (const item of queryResults) {
    floorMap.set(item.levelName, (floorMap.get(item.levelName) ?? 0) + item.predictedUsage)
  }

  const floorRows = [...floorMap.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value: Number(value.toFixed(1)) }))

  const fallbackFloorRows = levelOptions.slice(0, 6).map((option, index) => ({
    label: option.label,
    value: Number((88 - index * 6).toFixed(1)),
  }))

  const resolvedFloorRows = floorRows.length > 0 ? floorRows : fallbackFloorRows

  const alertEvents = queryResults.slice(0, 4).map((item, index) => ({
    id: item.componentId,
    title:
      item.energyLevel === '高'
        ? `${item.componentName} 出现异常尖峰`
        : item.energyLevel === '中'
          ? `${item.componentName} 建议巡检`
          : `${item.componentName} 进入例行巡检`,
    zone: `${item.levelName} / ${item.zoneName}`,
    eta: `${6 + index * 4} 分钟`,
  }))

  const scatterPoints = queryResults.slice(0, 18).map((item) => {
    const seed = hashNumber(item.componentId)
    return {
      x: Number((21 + (seed % 90) / 10).toFixed(1)),
      y: Number((item.predictedUsage + (seed % 24) - 12).toFixed(1)),
      label: item.componentName,
    }
  })

  const resolvedScatterPoints =
    scatterPoints.length > 0
      ? scatterPoints
      : [
          { x: 23.2, y: 84.6, label: '默认样本 A' },
          { x: 24.9, y: 90.2, label: '默认样本 B' },
          { x: 26.4, y: 96.5, label: '默认样本 C' },
          { x: 27.1, y: 101.8, label: '默认样本 D' },
        ]

  const healthMatrix = [
    [96, 88, 90, 84],
    [92, 86, 85, 80],
    [89, 82, 83, 78],
    [87, 80, 79, 76],
  ]

  const funnelData = [
    { name: '新告警', value: Math.max(4, warningCount + 4) },
    { name: '待派单', value: Math.max(3, warningCount + 2) },
    { name: '处理中', value: Math.max(2, warningCount + 1) },
    { name: '已闭环', value: Math.max(1, Math.round(normalRatio / 28)) },
  ]

  const slaData = [Math.max(2, warningCount + 2), Math.max(3, warningCount + 1), Math.max(4, Math.round(normalRatio / 15))]

  const compareBefore: [number, number] = [Number((peakLoad * 1.08).toFixed(1)), Number((slaScore - 5).toFixed(1))]
  const compareAfter: [number, number] = [Number((peakLoad * 0.88).toFixed(1)), Number(slaScore.toFixed(1))]

  const floorFocusTargets = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of queryResults) {
      if (item.zoneId && !map.has(item.levelName)) {
        map.set(item.levelName, item.zoneId)
      }
    }
    return map
  }, [queryResults])

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden text-slate-100">
      <div className="cockpit-atmosphere" />
      <header className="absolute inset-x-0 top-0 z-30 h-[10vh] min-h-[84px] px-4 py-2">
        <div className="glass-panel pointer-events-auto flex h-full items-center gap-3 px-4 py-2">
          <div className="min-w-0 flex-1 overflow-hidden">
            <HostFilterBar
              filters={filters}
              hasQueried={hasQueried}
              levelOptions={levelOptions}
              onFiltersChange={onFiltersChange}
              onQuery={onQuery}
              resultCount={queryResults.length}
              variant="cockpit"
              zoneOptions={zoneOptions}
            />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
            {topToolbar ? <div className="glass-panel rounded-xl px-2 py-0.5 whitespace-nowrap">{topToolbar}</div> : null}
            <div className="text-right whitespace-nowrap">
              <div className="text-[10px] tracking-[0.22em] text-slate-400 uppercase">项目</div>
              <div className="text-cyan-100 text-sm">{projectId}</div>
            </div>
          </div>
        </div>
      </header>

      <div
        className="absolute z-30"
        style={{
          top: 'calc(10vh + 8px)',
          left: 'calc(clamp(280px, 22vw, 360px) + 12px)',
        }}
      >
        <DockedViewModeSwitch />
      </div>

      <section
        className="pointer-events-none absolute inset-x-0 top-[10vh] bottom-0 z-20 grid gap-4 px-4 py-4"
        style={{
          gridTemplateColumns: 'clamp(280px, 22vw, 360px) minmax(0, 1fr) clamp(280px, 22vw, 360px)',
        }}
      >
        <div className="pointer-events-auto min-h-0 w-full max-w-[360px]">
          <div className="h-full">
            <div className="no-scrollbar h-full space-y-3 overflow-y-auto pr-1">
              <GlassCard>
            <CardHeader icon={<Gauge className="h-4 w-4" strokeWidth={1.8} />} title="全局 KPI" />
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-cyan-300/15 bg-black/25 p-2">
                <div className="text-[10px] text-slate-400">总耗电</div>
                <div className="mt-1 font-semibold text-cyan-100 text-lg">{totalLoad.toFixed(0)}</div>
                <div className="text-[10px] text-slate-400">kWh</div>
              </div>
              <div className="rounded-lg border border-cyan-300/15 bg-black/25 p-2">
                <div className="text-[10px] text-slate-400">峰值负荷</div>
                <div className="mt-1 font-semibold text-orange-300 text-lg">{peakLoad.toFixed(1)}</div>
                <div className="text-[10px] text-slate-400">kWh</div>
              </div>
              <div className="rounded-lg border border-cyan-300/15 bg-black/25 p-2">
                <div className="text-[10px] text-slate-400">设备健康</div>
                <div className="mt-1 font-semibold text-green-300 text-lg">{normalRatio.toFixed(1)}%</div>
                <div className="text-[10px] text-slate-400">正常率</div>
              </div>
              <div className="rounded-lg border border-cyan-300/15 bg-black/25 p-2">
                <div className="text-[10px] text-slate-400">SLA</div>
                <div className="mt-1 font-semibold text-cyan-200 text-lg">{slaScore}</div>
                <div className="text-[10px] text-slate-400">评分</div>
              </div>
              <div className="rounded-lg border border-cyan-300/15 bg-black/25 p-2">
                <div className="text-[10px] text-slate-400">总水耗</div>
                <div className="mt-1 font-semibold text-cyan-100 text-lg">{totalWaterUsage.toFixed(2)}</div>
                <div className="text-[10px] text-slate-400">m³</div>
              </div>
              <div className="rounded-lg border border-cyan-300/15 bg-black/25 p-2">
                <div className="text-[10px] text-slate-400">暖通电耗</div>
                <div className="mt-1 font-semibold text-orange-300 text-lg">{hvacElectricity.toFixed(1)}</div>
                <div className="text-[10px] text-slate-400">kWh</div>
              </div>
            </div>
              </GlassCard>

              <GlassCard>
            <CardHeader icon={<Zap className="h-4 w-4" strokeWidth={1.8} />} title="负荷结构" />
            <div className="h-44">
              <ChartFrame>
              <ReactECharts option={buildDonutOption(compositionValues)} style={{ height: '176px', width: '100%' }} />
              </ChartFrame>
            </div>
              </GlassCard>

              <GlassCard>
            <CardHeader icon={<Building2 className="h-4 w-4" strokeWidth={1.8} />} title="楼层热力排行" />
            <div className="h-44">
              <ChartFrame>
              <ReactECharts
                onEvents={{
                  click: (params: { name?: string }) => {
                    if (!params.name) return
                    const targetId = floorFocusTargets.get(params.name)
                    if (targetId) {
                      emitter.emit('camera-controls:focus', { nodeId: targetId as AnyNode['id'] })
                    }
                  },
                }}
                option={buildBarOption(
                  resolvedFloorRows.map((item) => item.label),
                  resolvedFloorRows.map((item) => item.value),
                )}
                style={{ height: '176px', width: '100%' }}
              />
              </ChartFrame>
            </div>
              </GlassCard>

              <GlassCard>
            <CardHeader icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.8} />} title="异常事件" />
            <div className="space-y-2">
              {alertEvents.map((event) => (
                <div className="rounded-lg border border-red-400/25 bg-red-500/10 px-2.5 py-2" key={event.id}>
                  <div className="text-xs text-slate-100">{event.title}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{event.zone}</div>
                  <div className="text-[11px] text-orange-300">预计处理 {event.eta}</div>
                </div>
              ))}
            </div>
              </GlassCard>

              <GlassCard>
                <CardHeader
                  action={
                    <button
                      className="rounded-md border border-cyan-300/35 bg-cyan-500/16 px-2 py-1 text-[10px] text-cyan-100"
                      type="button"
                    >
                      调峰建议
                    </button>
                  }
                  icon={<Zap className="h-4 w-4" strokeWidth={1.8} />}
                  title="时序趋势"
                />
                <div className="h-40">
                  <ChartFrame>
                  <ReactECharts
                    option={buildTrendOption(trendLabels, trendValues)}
                    style={{ height: '160px', width: '100%' }}
                  />
                  </ChartFrame>
                </div>
              </GlassCard>

              <GlassCard>
                <CardHeader icon={<Thermometer className="h-4 w-4" strokeWidth={1.8} />} title="负荷-温度散点" />
                <div className="h-40">
                  <ChartFrame>
                  <ReactECharts
                    option={buildScatterOption(resolvedScatterPoints)}
                    style={{ height: '160px', width: '100%' }}
                  />
                  </ChartFrame>
                </div>
              </GlassCard>
            </div>
          </div>
        </div>

        <div className="pointer-events-none relative min-h-0 min-w-0" />

        <div className="pointer-events-auto min-h-0 w-full max-w-[360px] justify-self-end">
          <div className="h-full">
            <div className="no-scrollbar h-full space-y-3 overflow-y-auto pr-1">
              <GlassCard>
            <CardHeader
              action={
                <button
                  className="rounded-md border border-orange-300/35 bg-orange-500/20 px-2 py-1 text-[10px] text-orange-100"
                  type="button"
                >
                  一键催办
                </button>
              }
              icon={<Siren className="h-4 w-4" strokeWidth={1.8} />}
              title="实时告警漏斗"
            />
            <div className="h-40">
              <ChartFrame>
              <ReactECharts option={buildFunnelOption(funnelData)} style={{ height: '160px', width: '100%' }} />
              </ChartFrame>
            </div>
              </GlassCard>

              <GlassCard>
            <CardHeader
              action={
                <button
                  className="rounded-md border border-cyan-300/35 bg-cyan-500/18 px-2 py-1 text-[10px] text-cyan-100"
                  type="button"
                >
                  重排
                </button>
              }
              icon={<Clock3 className="h-4 w-4" strokeWidth={1.8} />}
              title="SLA 工单看板"
            />
            <div className="h-40">
              <ChartFrame>
              <ReactECharts option={buildSlaOption(slaData)} style={{ height: '160px', width: '100%' }} />
              </ChartFrame>
            </div>
              </GlassCard>

              <GlassCard>
            <CardHeader icon={<Leaf className="h-4 w-4" strokeWidth={1.8} />} title="设备健康矩阵" />
            <div className="h-44">
              <ChartFrame>
              <ReactECharts
                option={buildHealthHeatmapOption(healthMatrix)}
                style={{ height: '176px', width: '100%' }}
              />
              </ChartFrame>
            </div>
              </GlassCard>

              <GlassCard>
                <CardHeader icon={<Wrench className="h-4 w-4" strokeWidth={1.8} />} title="能耗流向 Sankey" />
                <div className="h-40">
                  <ChartFrame>
                  <ReactECharts
                    option={buildSankeyOption(compositionValues)}
                    style={{ height: '160px', width: '100%' }}
                  />
                  </ChartFrame>
                </div>
              </GlassCard>

              <GlassCard>
                <CardHeader icon={<Gauge className="h-4 w-4" strokeWidth={1.8} />} title="异常前后对比" />
                <div className="h-40">
                  <ChartFrame>
                  <ReactECharts
                    option={buildCompareOption(compareBefore, compareAfter)}
                    style={{ height: '160px', width: '100%' }}
                  />
                  </ChartFrame>
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      </section>

      <div className="absolute left-1/2 top-[104px] z-30 w-72 -translate-x-1/2 space-y-2">
        {energyLoading ? (
          <div className="glass-panel pointer-events-auto rounded-lg px-3 py-2 text-xs text-cyan-100">实时数据同步中...</div>
        ) : null}
        {energyError ? (
          <div className="glass-panel pointer-events-auto rounded-lg border-red-400/35 px-3 py-2 text-xs text-red-200">
            数据异常: {energyError}
          </div>
        ) : null}
        {energyResultZone ? (
          <div className="glass-panel pointer-events-auto rounded-lg px-3 py-2 text-xs text-slate-200">
            区域温度 {energyResultZone.indoor_temp}℃ · 湿度 {energyResultZone.indoor_humidity}%
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
