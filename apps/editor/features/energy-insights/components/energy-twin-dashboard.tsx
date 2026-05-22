'use client'

import { type AnyNode, useScene } from '@pascal-app/core'
import { useEditor, type ViewMode } from '@pascal-app/editor'
import NumberFlow from '@number-flow/react'
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
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { CompositionData, RankingItem, WeeklyTrendData } from '@/features/energy-insights/lib/energy-dashboard-data'
import EnergyAssistantChat from '@/features/energy-insights/components/energy-assistant-chat'
import EnergyTimelineStrip, { type TimelineState } from '@/features/energy-insights/components/energy-timeline-strip'
import FloorHeatmapOverlay from '@/features/energy-insights/components/floor-heatmap-overlay'
import HostFilterBar from '@/features/energy-insights/components/host-filter-bar'
import {
  buildFloorHeatmapData,
  buildFloorHourlyAggregate,
} from '@/features/energy-insights/lib/floor-heatmap'
import {
  applyEnergyHighlights,
  resetAllEnergyHighlights,
} from '@/features/energy-insights/lib/energy-zone-highlight'
import type { EnergyApiResponse, ZoneEnergyResponse } from '@/features/energy-insights/lib/energy-api'
import { buildDashboardData } from '@/features/energy-insights/lib/energy-dashboard-data'
import type {
  HostFilterOption,
  HostQueryFilters,
  HostQueryResult,
} from '@/features/energy-insights/lib/host-query'
import { cn } from '@/lib/utils'

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
  onJumpToLevel3HighlightZones?: () => void
  onFiltersChange: (nextFilters: HostQueryFilters) => void
  onQuery: () => void
  projectId: string
  queryResults: HostQueryResult[]
  selectedComponentId: string | null
  selectedComponentName: string
  topToolbar?: ReactNode
  zoneOptions: HostFilterOption[]
}

// ---- Cybernetic Chart Palette ----
const CYAN = '#00F5FF'
const AMBER = '#FFB300'
const RED = '#FF3333'
const LABEL = 'rgba(255,255,255,0.55)'
const GRID = 'rgba(0,245,255,0.08)'

function buildDualLineOption(
  today: number[], yesterday: number[],
  peak: { hour: number; value: number },
  _valley: { hour: number; value: number },
): EChartsOption {
  const labels = today.map((_, i) => `${String(i).padStart(2, '0')}:00`)
  return {
    backgroundColor: 'transparent',
    grid: { top: 16, right: 8, bottom: 20, left: 40 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: labels, axisLabel: { color: LABEL, fontSize: 9, interval: 3 }, axisTick: { show: false }, axisLine: { lineStyle: { color: GRID } } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: GRID } }, axisLabel: { color: LABEL, fontSize: 9 } },
    series: [
      {
        name: '今日', type: 'line', data: today, smooth: true, symbol: 'none',
        lineStyle: { color: CYAN, width: 1.5 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(0,245,255,0.08)' }, { offset: 1, color: 'rgba(0,245,255,0.0)' }] } },
        markPoint: { data: [{ coord: [peak.hour, peak.value], value: peak.value.toFixed(1), symbol: 'pin', symbolSize: 18, itemStyle: { color: RED as any }, label: { show: true, fontSize: 9, color: '#fff' } }] },
      },
      { name: '昨日', type: 'line', data: yesterday, smooth: true, symbol: 'none', lineStyle: { color: 'rgba(255,255,255,0.12)', width: 1, type: 'dashed' } },
    ],
    legend: { right: 0, top: 0, textStyle: { color: LABEL, fontSize: 9 } },
  } as unknown as EChartsOption
}

function buildCompositionDonut(c: CompositionData): EChartsOption {
  const data = [
    { name: 'HVAC', value: c.hvac }, { name: '照明', value: c.lighting },
    { name: '插座', value: c.socket }, { name: '其他', value: c.other },
  ].filter((d) => d.value > 0)
  return {
    backgroundColor: 'transparent', tooltip: { trigger: 'item' },
    legend: { bottom: 0, itemWidth: 8, itemHeight: 6, textStyle: { color: LABEL, fontSize: 9 } },
    series: [{
      type: 'pie', radius: ['65%', '82%'], center: ['50%', '44%'], label: { show: false }, labelLine: { show: false },
      itemStyle: { borderColor: 'rgba(3,7,18,0.8)', borderWidth: 2 },
      data,
    }],
    color: [CYAN, 'rgba(0,245,255,0.55)', 'rgba(255,179,0,0.5)', 'rgba(255,255,255,0.12)'],
  }
}

function buildRankingBar(items: RankingItem[]): EChartsOption {
  if (items.length === 0) return {}
  return {
    backgroundColor: 'transparent',
    grid: { top: 4, right: 12, bottom: 4, left: 72 },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: GRID } }, axisLabel: { color: LABEL, fontSize: 8 } },
    yAxis: { type: 'category', data: items.map((r) => r.name), axisLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 9 }, axisTick: { show: false }, axisLine: { show: false } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    series: [{ type: 'bar', data: items.map((r) => r.value), barWidth: 10, itemStyle: { borderRadius: 2, color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: CYAN }, { offset: 1, color: 'rgba(0,245,255,0.35)' }] } } }],
  }
}

function buildWeeklyTrend(w: WeeklyTrendData): EChartsOption {
  return {
    backgroundColor: 'transparent',
    grid: { top: 14, right: 12, bottom: 18, left: 40 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: w.labels, axisLabel: { color: LABEL, fontSize: 9 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: GRID } }, axisLabel: { color: LABEL, fontSize: 9 } },
    series: [
      { name: '本周', type: 'bar', data: w.values, barWidth: 10, itemStyle: { borderRadius: 2, color: 'rgba(0,245,255,0.6)' } },
      { name: '上周', type: 'bar', data: w.prevWeekValues, barWidth: 10, itemStyle: { borderRadius: 2, color: 'rgba(255,255,255,0.08)' } },
    ],
    legend: { right: 0, top: 0, textStyle: { color: LABEL, fontSize: 9 } },
  }
}

/** 数字过渡动画包装 */
function AnimatedValue({ value, suffix = '', className = '' }: { value: number; suffix?: string; className?: string }) {
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
        <span className="text-white/50">{icon}</span>
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
  onJumpToLevel3HighlightZones,
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
  const sceneNodes = useScene((state) => state.nodes) as Record<string, AnyNode>

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
              <div className="text-[10px] tracking-[0.22em] text-white/40 uppercase">项目</div>
              <div className="text-white/70 text-sm">{projectId}</div>
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
                        <div className="text-[9px] uppercase tracking-[0.1em] text-slate-400">高</div>
                        <div className="mt-0.5 text-2xl font-bold tabular-nums text-[#FF3333]"><NumberFlow value={dashboardData.left.alert.high} /></div>
                      </div>
                      <div className={cn(
                        'rounded-lg p-2 text-center border',
                        dashboardData.left.alert.medium > 0
                          ? 'border-amber-400/30 bg-amber-500/12'
                          : 'border-amber-300/10 bg-amber-500/5',
                      )}>
                        <div className="text-[9px] uppercase tracking-[0.1em] text-slate-400">中</div>
                        <div className="mt-0.5 text-2xl font-bold tabular-nums text-white/80"><NumberFlow value={dashboardData.left.alert.medium} /></div>
                      </div>
                      <div className="rounded-lg border border-slate-300/10 bg-slate-500/8 p-2 text-center">
                        <div className="text-[9px] uppercase tracking-[0.1em] text-slate-400">总计</div>
                        <div className="mt-0.5 text-2xl font-bold tabular-nums text-slate-300"><NumberFlow value={dashboardData.left.alert.total} /></div>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-[#FF3333]/70 transition-all duration-500"
                        style={{ width: `${Math.min(100, (dashboardData.left.alert.high / Math.max(1, dashboardData.left.alert.total)) * 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-right text-[9px] text-slate-500">
                      高优先级占比 {Math.round((dashboardData.left.alert.high / Math.max(1, dashboardData.left.alert.total)) * 100)}%
                    </div>
                  </>
                ) : (
                  <div className="py-3 text-center text-xs text-[rgba(0,245,255,0.7)]">
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
                      <span className="text-3xl font-bold font-mono tabular-nums text-white/95 kpi-glow">
                        <NumberFlow value={dashboardData.left.realtimePower.currentKw} format={{ maximumFractionDigits: 1 }} />
                      </span>
                      <span className="text-xs text-slate-400">kW</span>
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
                    )}>
                      {dashboardData.left.realtimePower.trend === 'up' ? '↑' : dashboardData.left.realtimePower.trend === 'down' ? '↓' : '→'}
                      {dashboardData.left.realtimePower.changePct > 0 ? '+' : ''}{dashboardData.left.realtimePower.changePct}%
                    </div>
                    <div className="text-[10px] text-slate-500">vs 昨日同时刻</div>
                  </div>
                </div>
              </GlassCard>

              {/* 3. 能耗强度 */}
              <GlassCard>
                <CardHeader icon={<Gauge className="h-4 w-4" strokeWidth={1.8} />} title="能耗强度" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-cyan-300/15 bg-black/25 p-2">
                    <div className="text-[10px] text-slate-400">总电耗</div>
                    <div className="mt-1 font-semibold font-mono text-white/95 kpi-glow text-lg">{dashboardData.left.energyIntensity.todayKwh.toFixed(0)}</div>
                    <div className="text-[10px] text-slate-400">kWh</div>
                  </div>
                  <div className="rounded-lg border border-cyan-300/15 bg-black/25 p-2">
                    <div className="text-[10px] text-slate-400">能耗强度</div>
                    <div className="mt-1 font-semibold font-mono text-white/95 kpi-glow text-lg">{dashboardData.left.energyIntensity.todayKwhPerM2.toFixed(2)}</div>
                    <div className="text-[10px] text-slate-400">kWh/m²</div>
                  </div>
                </div>
                <div className="mt-2 text-right">
                  <span className={cn(
                    'text-xs',
                    dashboardData.left.energyIntensity.vsYesterdayPct > 0 ? 'text-[#FF3333]' : 'text-[rgba(0,245,255,0.7)]',
                  )}>
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
                    option={buildDualLineOption(
                      dashboardData.left.hourlyCurve.today,
                      dashboardData.left.hourlyCurve.yesterday,
                      dashboardData.left.hourlyCurve.peak,
                      dashboardData.left.hourlyCurve.valley,
                    )}
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
                    option={buildCompositionDonut(dashboardData.left.composition)}
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
                    option={buildRankingBar(dashboardData.right.ranking)}
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
                        <span className="font-mono text-2xl font-bold text-white/95 kpi-glow">
                          <NumberFlow value={dashboardData.right.peakPower.value} format={{ maximumFractionDigits: 1 }} />
                        </span>
                        <span className="text-xs text-slate-400">kW</span>
                      </div>
                    </div>
                    <div className="rounded border border-white/8 bg-white/5 px-2 py-1">
                      <span className="font-mono text-xs text-white/80">
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
                  <div className="flex justify-between text-[9px] text-slate-500">
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
                    <div className="font-semibold font-mono text-sm text-white/95 kpi-glow">{dashboardData.right.indoorEnv.indoorTemp}°</div>
                    <div className="text-[8px] text-slate-400">室内温度</div>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-black/25 p-2">
                    <div className="mb-1 flex justify-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                    </div>
                    <div className="font-semibold font-mono text-sm text-white/80">{dashboardData.right.indoorEnv.indoorHumidity}%</div>
                    <div className="text-[8px] text-slate-400">室内湿度</div>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-black/25 p-2">
                    <div className="mb-1 flex justify-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
                    </div>
                    <div className="font-semibold font-mono text-sm text-white/80">{dashboardData.right.indoorEnv.co2}</div>
                    <div className="text-[8px] text-slate-400">CO₂</div>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-black/25 p-2">
                    <div className="mb-1 flex justify-center">
                      <span className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        dashboardData.right.indoorEnv.outdoorTemp > 35 ? 'bg-[#FF3333]' : 'bg-white/30',
                      )} />
                    </div>
                    <div className="font-semibold font-mono text-sm text-white/95 kpi-glow">{dashboardData.right.indoorEnv.outdoorTemp}°</div>
                    <div className="text-[8px] text-slate-400">室外温度</div>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-black/25 p-2">
                    <div className="mb-1 flex justify-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
                    </div>
                    <div className="font-semibold font-mono text-sm text-white/80">{dashboardData.right.indoorEnv.outdoorHumidity}%</div>
                    <div className="text-[8px] text-slate-400">室外湿度</div>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-black/25 p-2">
                    <div className="mb-1 flex justify-center">
                      <span className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        dashboardData.right.indoorEnv.pm25 > 50 ? 'bg-[#FF3333]' : 'bg-white/25',
                      )} />
                    </div>
                    <div className="font-semibold font-mono text-sm text-white/80">{dashboardData.right.indoorEnv.pm25}</div>
                    <div className="text-[8px] text-slate-400">PM2.5</div>
                  </div>
                </div>
              </GlassCard>

              {/* 9. 电费估算 — 带对比 */}
              <GlassCard>
                <CardHeader icon={<Gauge className="h-4 w-4" strokeWidth={1.8} />} title="电费估算" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-cyan-300/15 bg-black/25 p-2.5">
                    <div className="text-[9px] uppercase tracking-[0.08em] text-slate-400">今日</div>
                    <div className="mt-1">
                      <span className="text-xl font-bold font-mono text-white/95 kpi-glow">¥<NumberFlow value={dashboardData.right.cost.today} /></span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-black/25 p-2.5">
                    <div className="text-[9px] uppercase tracking-[0.08em] text-slate-400">本月</div>
                    <div className="mt-1">
                      <span className="text-xl font-bold font-mono text-white/80">¥<NumberFlow value={dashboardData.right.cost.month} /></span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 rounded-lg bg-slate-800/50 px-2 py-1.5 text-center text-[9px] text-slate-400">
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
                    option={buildWeeklyTrend(dashboardData.right.weeklyTrend)}
                    style={{ height: '144px', width: '100%' }}
                  />
                  </ChartFrame>
                </div>
              </GlassCard>

            </div>
          </div>
        </div>
      </section>

      {/* 时间轴 —— 工具栏正下方，紧贴底部 */}
      <div className="pointer-events-auto absolute bottom-2 left-1/2 z-40 w-[calc(100%-32px)] max-w-[1200px] -translate-x-1/2">
        <EnergyTimelineStrip
          date={timelineDate}
          hour={timelineHour}
          hourlySamples={hourlySamples}
          onChange={handleTimelineChange}
        />
      </div>

      <div className="absolute left-1/2 top-[104px] z-30 w-72 -translate-x-1/2 space-y-2">
        {energyLoading ? (
          <div className="glass-panel pointer-events-auto rounded-lg px-3 py-2 text-xs text-cyan-100">实时数据同步中...</div>
        ) : null}
        {energyError ? (
          <div className="glass-panel pointer-events-auto rounded-lg border-red-400/35 px-3 py-2 text-xs text-red-200">
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
