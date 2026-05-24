'use client'

import NumberFlow from '@number-flow/react'
import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BevelCard,
  Pill,
  VideoBackground,
} from '@/features/analytics/components/dashboard-primitives'
import { DASHBOARD_COLORS, DASHBOARD_FONTS } from '@/features/analytics/components/dashboard-theme'
import {
  type DashboardTooltipContent,
  DashboardTooltipLayer,
  tooltipAttrs,
} from '@/features/analytics/components/dashboard-tooltip'
import type {
  MonitoringAnalyticsModel,
  MonitoringBuildingSummary,
  MonitoringCompositionItem,
  MonitoringHeatmapCell,
  MonitoringMetric,
  MonitoringRecord,
  MonitoringScatterPoint,
  MonitoringStatusBucket,
} from '@/features/analytics/lib/monitoring-analytics'
import { buildMonitoringAnalyticsModel } from '@/features/analytics/lib/monitoring-analytics'
import type { HostQueryResult } from '@/features/energy-insights/lib/host-query'
import { cn } from '@/lib/utils'

type PanelIconKind =
  | 'building'
  | 'composition'
  | 'heatmap'
  | 'health'
  | 'load'
  | 'peak'
  | 'records'
  | 'relation'
  | 'risk'
  | 'trend'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function randomInt(min: number, max: number) {
  return Math.floor(randomBetween(min, max + 1))
}

function stableRatio(seed: string, min: number, max: number) {
  let hash = 0

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 9973
  }

  return min + (hash / 9973) * (max - min)
}

function formatNumber(value: number, decimals = 1) {
  return value.toLocaleString('zh-CN', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  })
}

function compactKwh(value: number, decimals = 1) {
  return `${formatNumber(value, decimals)} kWh`
}

function parseMetricValue(value: string) {
  const match = value.match(/^(-?\d+(?:\.\d+)?)(.*)$/)
  if (!match) {
    return { decimals: 0, numeric: 0, suffix: value }
  }

  return {
    decimals: match[1]?.includes('.') ? 1 : 0,
    numeric: Number(match[1]),
    suffix: match[2] ?? '',
  }
}

type GlobalStats = {
  healthScore: number
  maintenance: number
  normal: number
  offline: number
  warning: number
}

type DashboardToast = {
  id: number
  tone: 'cyan' | 'emerald' | 'rose'
  title: string
  body: string
}

type RealtimeModelState = {
  lastSyncSeconds: number
  notificationPulse: number
  sampleCount: number
  sampleRate: number
  toasts: DashboardToast[]
  model: MonitoringAnalyticsModel
}

const INITIAL_GLOBAL_STATS: GlobalStats = {
  healthScore: 74,
  maintenance: 2,
  normal: 103,
  offline: 2,
  warning: 133,
}

const LIVE_BUILDINGS = [
  { id: 'BLDG-A-03', type: 'office' },
  { id: 'BLDG-B-01', type: 'teaching' },
  { id: 'BLDG-C-07', type: 'lab' },
  { id: 'BLDG-D-02', type: 'mixed-use' },
] as const

const COMPOSITION_INCREMENT_RATIOS = [
  { label: '暖通系统', ratio: 0.429 },
  { label: '照明系统', ratio: 0.183 },
  { label: '插座与设备', ratio: 0.145 },
  { label: '公共区域', ratio: 0.1 },
  { label: '实验与专用负荷', ratio: 0.075 },
  { label: '其他损耗', ratio: 0.068 },
] as const

function deriveStatusDistribution(stats: GlobalStats): MonitoringStatusBucket[] {
  return [
    { count: stats.normal, label: '正常', tone: 'emerald' },
    { count: stats.warning, label: '预警', tone: 'rose' },
    { count: stats.maintenance, label: '维护中', tone: 'amber' },
    { count: stats.offline, label: '离线', tone: 'slate' },
  ]
}

function statsFromModel(model: MonitoringAnalyticsModel): GlobalStats {
  return {
    healthScore: model.performanceScore,
    maintenance: model.statusDistribution.find((bucket) => bucket.tone === 'amber')?.count ?? 0,
    normal: model.statusDistribution.find((bucket) => bucket.tone === 'emerald')?.count ?? 0,
    offline: model.statusDistribution.find((bucket) => bucket.tone === 'slate')?.count ?? 0,
    warning: model.statusDistribution.find((bucket) => bucket.tone === 'rose')?.count ?? 0,
  }
}

function withGlobalStats(
  model: MonitoringAnalyticsModel,
  stats: GlobalStats,
): MonitoringAnalyticsModel {
  return {
    ...model,
    performanceScore: stats.healthScore,
    statusDistribution: deriveStatusDistribution(stats),
  }
}

function formatFullTimestamp(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  const second = `${date.getSeconds()}`.padStart(2, '0')

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

function getCurrentSlotIndex(date = new Date()) {
  const hour = date.getHours()
  if (hour >= 18) return 3
  if (hour >= 12) return 2
  if (hour >= 6) return 1
  return 0
}

function updateMetricNumber(
  metrics: MonitoringMetric[],
  label: string,
  value: number,
  options?: { decimals?: number; detail?: string; suffix?: string },
) {
  return metrics.map((metric) => {
    if (metric.label !== label) return metric

    const parsed = parseMetricValue(metric.value)
    const decimals = options?.decimals ?? parsed.decimals
    const suffix = options?.suffix ?? parsed.suffix

    return {
      ...metric,
      detail: options?.detail ?? metric.detail,
      value: `${value.toFixed(decimals)}${suffix}`,
    }
  })
}

function getMetricNumber(metrics: MonitoringMetric[], label: string) {
  const metric = metrics.find((item) => item.label === label)
  return parseMetricValue(metric?.value ?? '0').numeric
}

function deriveHourlyInsights(
  hourlySeries: MonitoringAnalyticsModel['hourlySeries'],
  currentInsights: MonitoringAnalyticsModel['relationshipInsights'],
) {
  const busiestHour = hourlySeries.reduce((best, point) =>
    point.occupancy > best.occupancy ? point : best,
  ).hour
  const peakHour = hourlySeries.reduce((best, point) =>
    point.electricity > best.electricity ? point : best,
  ).hour
  const quietHour = hourlySeries.reduce((best, point) =>
    point.electricity < best.electricity ? point : best,
  ).hour

  return {
    ...currentInsights,
    busiestHour,
    peakHour,
    quietHour,
  }
}

function normalizeTieredModel(baseModel: MonitoringAnalyticsModel) {
  const stats = INITIAL_GLOBAL_STATS
  const peakSnapshot = {
    ...baseModel.peakSnapshot,
    buildingId: 'BLDG-C-07',
    deviceId: 'BLDG-C-07-DEV-15',
    electricity: 236.8,
    humidity: 51.2,
    occupancy: 95.8,
    temperature: 28.6,
  }

  return withGlobalStats(
    {
      ...baseModel,
      metrics: updateMetricNumber(
        updateMetricNumber(
          updateMetricNumber(baseModel.metrics, '今日累计', 27_606, {
            decimals: 0,
            suffix: ' kWh',
          }),
          '今日峰值负荷',
          236.8,
          {
            decimals: 1,
            detail: `${peakSnapshot.buildingId} · ${peakSnapshot.monitorTime}`,
            suffix: ' kWh',
          },
        ),
        '今日预警',
        stats.warning,
        { decimals: 0, suffix: ' 条' },
      ),
      peakSnapshot,
      recentRecords: baseModel.recentRecords.slice(0, 10),
      relationshipInsights: {
        ...baseModel.relationshipInsights,
        occupancyCorrelation: 0.8,
        temperatureCorrelation: 0.64,
      },
    },
    stats,
  )
}

function createLiveMonitoringRecord(id: number): MonitoringRecord {
  const building = LIVE_BUILDINGS[randomInt(0, LIVE_BUILDINGS.length - 1)]!
  const electricity = Number(randomBetween(92, 236).toFixed(1))
  const temperature = Number(randomBetween(22.4, 30.6).toFixed(1))
  const hvac = Number(clamp(electricity * randomBetween(0.34, 0.52), 30, 118).toFixed(1))
  const occupancy = Number(randomBetween(42, 96).toFixed(1))
  const status: MonitoringRecord['device_status'] =
    electricity > 200 || temperature > 28.5 || occupancy > 90
      ? 'warning'
      : Math.random() > 0.96
        ? 'maintenance'
        : 'normal'

  return {
    building_id: building.id,
    building_type: building.type,
    chilled_water_return_temp: Number(randomBetween(11.2, 13.8).toFixed(2)),
    chilled_water_supply_temp: Number(randomBetween(6.2, 7.9).toFixed(2)),
    device_id: `${building.id}-DEV-${`${randomInt(1, 27)}`.padStart(2, '0')}`,
    device_status: status,
    electricity_kwh: electricity,
    env_humidity: Number(randomBetween(43, 66).toFixed(1)),
    env_temperature: temperature,
    hvac_kwh: hvac,
    id,
    monitor_time: formatFullTimestamp(),
    occupancy_density: occupancy,
    water_m3: Number(randomBetween(9, 26).toFixed(1)),
  }
}

function addMonthlyCompositionEnergy(composition: MonitoringCompositionItem[]) {
  const increment = randomBetween(25, 90)

  return composition.map((item) => {
    const target = COMPOSITION_INCREMENT_RATIOS.find((ratio) => ratio.label === item.label)
    const ratio = clamp(
      (target?.ratio ?? 1 / composition.length) + randomBetween(-0.002, 0.002),
      0.01,
      0.9,
    )

    return {
      ...item,
      value: Number((item.value + increment * ratio).toFixed(1)),
    }
  })
}

function pushToast(state: RealtimeModelState, toast: Omit<DashboardToast, 'id'>) {
  const id = Date.now() + randomInt(0, 999)
  return {
    ...state,
    notificationPulse: state.notificationPulse + 1,
    toasts: [{ ...toast, id }, ...state.toasts].slice(0, 3),
  }
}

function makeWarningRecord(id: number) {
  const record = createLiveMonitoringRecord(id)
  const overrun = randomBetween(12, 28)

  return {
    ...record,
    device_status: 'warning' as const,
    electricity_kwh: Number(clamp(record.electricity_kwh + overrun * 2.6, 205, 260).toFixed(1)),
    env_temperature: Number(
      clamp(record.env_temperature + randomBetween(0.8, 1.8), 28.8, 32).toFixed(1),
    ),
    hvac_kwh: Number(clamp(record.hvac_kwh + overrun, 98, 128).toFixed(1)),
  }
}

function updateLiveMetrics(model: MonitoringAnalyticsModel) {
  const currentPeople = getMetricNumber(model.metrics, '当前人流指数')
  const nextPeople = Number(
    clamp(currentPeople * (1 + randomBetween(-0.035, 0.035)), 10, 99).toFixed(1),
  )

  return {
    ...model,
    metrics: updateMetricNumber(model.metrics, '当前人流指数', nextPeople, {
      decimals: 1,
      suffix: '',
    }),
    peakSnapshot: {
      ...model.peakSnapshot,
      occupancy: Number(
        clamp(model.peakSnapshot.occupancy * (1 + randomBetween(-0.025, 0.025)), 70, 99).toFixed(1),
      ),
      temperature: Number(
        clamp(model.peakSnapshot.temperature + randomBetween(-0.3, 0.3), 22, 31.5).toFixed(1),
      ),
    },
  }
}

function statusReadable(status: MonitoringRecord['device_status']) {
  switch (status) {
    case 'maintenance':
      return '维护'
    case 'offline':
      return '离线'
    case 'warning':
      return '预警'
    default:
      return '正常'
  }
}

function useIntervalTick(callback: () => void, delay: number) {
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    const timer = window.setInterval(() => callbackRef.current(), delay)
    return () => window.clearInterval(timer)
  }, [delay])
}

function useLoopProgress(durationMs: number, stepMs = 120) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const startedAt = performance.now()
    const timer = window.setInterval(() => {
      const elapsed = (performance.now() - startedAt) % durationMs
      setProgress(elapsed / durationMs)
    }, stepMs)

    return () => window.clearInterval(timer)
  }, [durationMs, stepMs])

  return progress
}

function buildingTypeReadable(type: string) {
  switch (type) {
    case 'lab':
      return '实验楼'
    case 'mixed-use':
      return '综合楼'
    case 'office':
      return '办公楼'
    case 'teaching':
      return '教学楼'
    default:
      return type
  }
}

function scatterTypeLabel(tone: MonitoringScatterPoint['tone']) {
  switch (tone) {
    case 'amber':
      return '实验'
    case 'emerald':
      return '教学'
    case 'rose':
      return '预警'
    default:
      return '办公'
  }
}

function AnimatedNumber({
  className,
  decimals = 0,
  prefix,
  style,
  suffix,
  value,
}: {
  className?: string
  decimals?: number
  prefix?: string
  style?: CSSProperties
  suffix?: string
  value: number
}) {
  const [flash, setFlash] = useState<'down' | 'up' | null>(null)
  const [deltaLabel, setDeltaLabel] = useState<string | null>(null)
  const [previous, setPrevious] = useState(value)

  useEffect(() => {
    if (value === previous) return

    const delta = value - previous
    setFlash(value > previous ? 'up' : 'down')
    setDeltaLabel(
      `${delta > 0 ? '↑+' : '↓'}${Math.abs(delta).toFixed(Math.max(0, Math.min(decimals, 1)))}`,
    )
    setPrevious(value)
    const flashTimer = window.setTimeout(() => setFlash(null), 560)
    const deltaTimer = window.setTimeout(() => setDeltaLabel(null), 1000)
    return () => {
      window.clearTimeout(flashTimer)
      window.clearTimeout(deltaTimer)
    }
  }, [decimals, previous, value])

  return (
    <span className={cn('live-number', className)} data-flash={flash ?? undefined} style={style}>
      {prefix}
      <NumberFlow
        format={{
          maximumFractionDigits: decimals,
          minimumFractionDigits: decimals,
        }}
        value={value}
      />
      {suffix ? <span className="live-number-unit">{suffix}</span> : null}
      {deltaLabel ? (
        <span className="live-number-delta" data-tone={flash ?? undefined}>
          {deltaLabel}
        </span>
      ) : null}
    </span>
  )
}

function MetricMiniTrend({ seed }: { seed: string }) {
  const [points, setPoints] = useState<number[]>(() =>
    Array.from({ length: 10 }, (_, index) => stableRatio(`${seed}-${index}`, 0.18, 0.86)),
  )

  useIntervalTick(() => {
    setPoints((current) => [
      ...current.slice(1),
      clamp(current[current.length - 1]! + randomBetween(-0.22, 0.22), 0.12, 0.9),
    ])
  }, 2000)

  const path = points
    .map((value, index) => {
      const x = index * 10
      const y = 22 - value * 18
      return `${index === 0 ? 'M' : 'L'}${x},${y}`
    })
    .join(' ')

  return (
    <svg
      aria-hidden="true"
      className="metric-mini-trend mt-2 h-6 w-full overflow-visible"
      preserveAspectRatio="none"
      viewBox="0 0 90 24"
    >
      <path
        d={path}
        fill="none"
        stroke="rgba(122,247,255,0.9)"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path d={`${path} L90,24 L0,24 Z`} fill="rgba(0,212,255,0.12)" stroke="none" />
      <circle cx="90" cy={22 - points[points.length - 1]! * 18} fill="#7AF7FF" r="2.2" />
    </svg>
  )
}

function RealtimeSyncWidget({ seconds }: { seconds: number }) {
  return (
    <div
      className="realtime-sync-widget fixed right-5 top-[96px] z-50 hidden items-center gap-2 border border-cyan-300/36 bg-[#041527]/86 px-3 py-1.5 text-cyan-50 shadow-[0_0_18px_rgba(0,212,255,0.18)] backdrop-blur-md xl:flex"
      {...tooltipAttrs({
        rows: [
          { label: '同步状态', value: '实时同步中' },
          { label: '上次同步', value: `${seconds}s 前` },
          { label: '更新策略', value: '实时 / 当前时段 / 累计分级刷新' },
        ],
        title: '实时同步',
      })}
    >
      <span className="sync-radar" />
      <span className="flex flex-col leading-tight">
        <span className="text-[13px] font-bold tracking-[0.04em] text-cyan-50">实时同步中</span>
        <span className="mt-0.5 text-[11px] font-semibold tracking-[0.03em] text-cyan-100/68">
          上次同步 {seconds}s 前
        </span>
      </span>
    </div>
  )
}

function DashboardToastStack({ toasts }: { toasts: DashboardToast[] }) {
  return (
    <div className="dashboard-toast-stack fixed right-5 top-[138px] z-40 flex w-[330px] flex-col gap-2">
      {toasts.map((toast) => (
        <div className="dashboard-toast" data-tone={toast.tone} key={toast.id}>
          <div className="dashboard-toast-title">{toast.title}</div>
          <div className="dashboard-toast-body">{toast.body}</div>
        </div>
      ))}
    </div>
  )
}

function metricTooltip(metric: MonitoringMetric): DashboardTooltipContent {
  const parsed = parseMetricValue(metric.value)
  const value = parsed.numeric

  if (metric.label.includes('耗电') || metric.label.includes('电量')) {
    return {
      rows: [
        { label: '今日', value: compactKwh(value, 0) },
        { label: '昨日', value: compactKwh(value * 0.96, 0) },
        { label: '本周累计', value: compactKwh(value * 5.8, 0) },
        { label: '同比变化', tone: 'cyan', value: '+6.8%' },
      ],
      title: '今日累计明细',
    }
  }

  if (metric.label.includes('人流')) {
    return {
      rows: [
        { label: '当前', value: value.toFixed(1) },
        { label: '今日峰值', value: (value * 1.23).toFixed(1) },
        { label: '今日均值', value: (value * 0.94).toFixed(1) },
        { label: '峰值时段', value: '12:00-14:00' },
      ],
      title: '人流指数详情',
    }
  }

  if (metric.label.includes('峰值')) {
    return {
      rows: [
        { label: '峰值时刻', value: metric.detail.split(' · ')[1] ?? '今日当前时段' },
        { label: '峰值楼栋', value: 'BLDG-C-07' },
        { label: '峰值设备 ID', value: 'BLDG-C-07-DEV-15' },
      ],
      title: '峰值负荷明细',
    }
  }

  if (metric.label.includes('HVAC')) {
    return {
      rows: [
        { label: 'HVAC 实耗', value: compactKwh(18_627, 0) },
        { label: '总耗电量', value: compactKwh(35_420, 0) },
        { label: '同期对比', tone: 'amber', value: '+3.1%' },
      ],
      title: 'HVAC 占电比',
    }
  }

  return {
    rows: [
      { label: '今日预警数', tone: 'rose', value: `${Math.round(value)} 条` },
      { label: '已处理', tone: 'emerald', value: `${Math.max(0, Math.round(value * 0.72))} 条` },
      { label: '待处理', tone: 'amber', value: `${Math.max(0, Math.round(value * 0.28))} 条` },
      { label: '最近预警', value: '暖通能耗超阈值 15%' },
    ],
    title: '今日预警详情',
  }
}

function healthGaugeTooltip(score: number): DashboardTooltipContent {
  return {
    rows: [
      { label: '运行稳定性', value: `${Math.round(score * 0.32)} 分` },
      { label: '能效表现', value: `${Math.round(score * 0.28)} 分` },
      { label: '故障率', value: `${Math.round(score * 0.2)} 分` },
      { label: '维护及时性', value: `${Math.round(score * 0.2)} 分` },
      {
        label: '评级',
        tone: score >= 85 ? 'emerald' : score >= 72 ? 'cyan' : 'amber',
        value: score >= 85 ? '优秀' : score >= 72 ? '良好' : '一般',
      },
    ],
    title: '运行健康评分构成',
  }
}

function statusBucketTooltip(
  bucket: MonitoringStatusBucket,
  ratio: number,
  buildings: MonitoringBuildingSummary[],
): DashboardTooltipContent {
  const relatedBuildings = buildings
    .filter((building) =>
      bucket.tone === 'emerald'
        ? building.warningCount === 0
        : bucket.tone === 'rose'
          ? building.warningCount > 0
          : true,
    )
    .slice(0, 4)
    .map((building) => building.buildingId)

  return {
    rows: [
      { label: '楼栋列表', value: relatedBuildings.join(' / ') || '暂无' },
      { label: '数量', value: `${bucket.count} 条` },
      { label: '占比', value: `${ratio.toFixed(1)}%` },
      {
        label: '最近变化',
        tone: bucket.tone === 'rose' ? 'amber' : 'cyan',
        value: bucket.tone === 'rose' ? '+2 条' : '-1 条',
      },
    ],
    title: `${bucket.label}状态分布`,
  }
}

function ratioTooltip(label: string, value: string, bucketCount: number, total: number) {
  const numeratorLabel = label === '风险占比' ? '预警 + 离线' : label.replace('占比', '')

  return {
    rows: [
      { label: '计算公式', value: `${label} = ${numeratorLabel} / 监测总量` },
      { label: '涉及记录', value: `${bucketCount} 条` },
      { label: '监测总量', value: `${total} 条` },
      { label, value },
    ],
    title: `${label}计算口径`,
  }
}

function dailyTooltip(
  point: MonitoringAnalyticsModel['dailySeries'][number],
  previous: MonitoringAnalyticsModel['dailySeries'][number] | undefined,
) {
  const change = previous
    ? ((point.electricity - previous.electricity) / Math.max(previous.electricity, 1)) * 100
    : 0
  return {
    rows: [
      { label: '日期', value: point.date },
      { label: '电耗', value: compactKwh(point.electricity) },
      { label: '当日人流指数', value: point.occupancy.toFixed(1) },
      {
        label: '环比前一日',
        tone: change >= 0 ? 'cyan' : 'amber',
        value: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
      },
      { label: '峰值时段', value: point.occupancy > 78 ? '12:00-14:00' : '18:00-20:00' },
    ],
    title: '每日走势详情',
  }
}

function hourlyTooltip(point: MonitoringAnalyticsModel['hourlySeries'][number], index: number) {
  const nextHour = index >= 3 ? '24:00' : `${`${(index + 1) * 6}`.padStart(2, '0')}:00`
  return {
    rows: [
      { label: '时段范围', value: `${point.hour}-${nextHour}` },
      { label: '平均负荷', value: compactKwh(point.electricity) },
      { label: '峰值楼栋', value: point.electricity > 165 ? 'BLDG-C-07' : 'BLDG-A-03' },
      { label: '人流均值', value: point.occupancy.toFixed(1) },
    ],
    title: '时段负荷详情',
  }
}

function heatmapCellTooltip(cell: MonitoringHeatmapCell) {
  const yesterday =
    cell.electricity * stableRatio(`${cell.date}-${cell.hour}-yesterday`, 0.92, 1.08)
  const lastWeek = cell.electricity * stableRatio(`${cell.date}-${cell.hour}-last-week`, 0.88, 1.12)
  return {
    rows: [
      { label: '日期时段', value: `${cell.date} ${cell.hour}` },
      { label: '能耗值', value: compactKwh(cell.electricity) },
      {
        label: '较昨日同时段',
        tone: cell.electricity >= yesterday ? 'amber' : 'emerald',
        value: `${(((cell.electricity - yesterday) / yesterday) * 100).toFixed(1)}%`,
      },
      {
        label: '较上周同时段',
        value: `${(((cell.electricity - lastWeek) / lastWeek) * 100).toFixed(1)}%`,
      },
      {
        label: '负荷等级',
        value: cell.intensity > 0.82 ? '高' : cell.intensity > 0.62 ? '中' : '低',
      },
      { label: '主要贡献楼栋', value: cell.intensity > 0.82 ? 'BLDG-C-07' : 'BLDG-A-03' },
    ],
    title: '热力单元详情',
  }
}

function riskRowTooltip(summary: MonitoringBuildingSummary, rank: number) {
  return {
    rows: [
      {
        label: '楼栋全称',
        value: `${summary.buildingId} ${buildingTypeReadable(summary.buildingType)}`,
      },
      { label: '当前效率值', value: `${summary.efficiencyScore}` },
      {
        label: '风险等级',
        tone: summary.warningCount > 10 ? 'rose' : 'amber',
        value: summary.warningCount > 10 ? '高' : '中',
      },
      { label: '最近预警', value: '最近 24 小时 暖通能耗超阈值' },
      { label: '关联设备数', value: `${22 + rank * 3} 台` },
      { label: '待处理告警', value: `${Math.max(1, Math.round(summary.warningCount / 3))} 条` },
      { label: '建议动作', value: '复核冷站策略与末端阀门' },
    ],
    title: `${summary.buildingId} 风险详情`,
  }
}

function compositionTooltip(item: MonitoringCompositionItem, ratio: number) {
  return {
    rows: [
      { label: '分类名称', value: item.label },
      { label: '数值', value: compactKwh(item.value, 0) },
      { label: '占比', value: `${ratio.toFixed(1)}%` },
      {
        label: '同比变化',
        tone: ratio > 35 ? 'amber' : 'cyan',
        value: ratio > 35 ? '+4.2%' : '+1.6%',
      },
      { label: 'Top 3 楼栋', value: 'BLDG-C-07 / BLDG-A-03 / BLDG-D-02' },
    ],
    title: '能耗构成详情',
  }
}

function scatterTooltip(point: MonitoringScatterPoint, xLabel: string) {
  const useTemperature = xLabel.includes('温度') || xLabel.includes('°C')
  return {
    rows: [
      { label: '类型', value: scatterTypeLabel(point.tone) },
      { label: '能耗', value: compactKwh(point.electricity) },
      {
        label: useTemperature ? '温度' : '人流指数',
        value: useTemperature ? `${point.temperature.toFixed(1)}°C` : point.occupancy.toFixed(1),
      },
      { label: '楼栋与时间', value: `${point.buildingId} ${point.hour}` },
      {
        label: '风险点',
        tone: point.tone === 'rose' || point.tone === 'amber' ? 'rose' : 'emerald',
        value: point.tone === 'rose' || point.tone === 'amber' ? '是' : '否',
      },
    ],
    title: '采样点详情',
  }
}

function tableRowTooltip(record: MonitoringRecord) {
  return {
    rows: [
      {
        label: '楼栋详情',
        value: `${record.building_id} ${buildingTypeReadable(record.building_type)}`,
      },
      { label: '对比基线', value: `电耗 ${compactKwh(record.electricity_kwh * 0.88)}` },
      {
        label: '预警规则',
        value: record.device_status === 'warning' ? '暖通能耗超阈值 15%' : '未触发规则',
      },
      { label: '关联设备', value: record.device_id },
      { label: '24小时趋势', value: '▁▂▃▅▆▅▇' },
    ],
    title: '监测明细',
  }
}

function useRealtimeMonitoringModel(projectId: string) {
  const baseModel = useMemo(
    () => normalizeTieredModel(buildMonitoringAnalyticsModel(projectId)),
    [projectId],
  )
  const [state, setState] = useState<RealtimeModelState>(() => ({
    lastSyncSeconds: 0,
    model: baseModel,
    notificationPulse: 0,
    sampleCount: 1286,
    sampleRate: 28,
    toasts: [],
  }))

  useEffect(() => {
    setState({
      lastSyncSeconds: 0,
      model: baseModel,
      notificationPulse: 0,
      sampleCount: 1286,
      sampleRate: 28,
      toasts: [],
    })
  }, [baseModel])

  useEffect(() => {
    let tableTimer: number | undefined
    let eventTimer: number | undefined

    const scheduleTableInsert = () => {
      tableTimer = window.setTimeout(
        () => {
          setState((current) => {
            const newRecord = createLiveMonitoringRecord(Date.now())
            const nextModel = updateLiveMetrics({
              ...current.model,
              recentRecords: [newRecord, ...current.model.recentRecords].slice(0, 12),
            })
            const nextState = {
              ...current,
              lastSyncSeconds: 0,
              model: nextModel,
              sampleCount: current.sampleCount + 1,
              sampleRate: randomInt(24, 36),
            }

            if (newRecord.device_status !== 'warning') return nextState

            const stats = statsFromModel(nextModel)
            const nextTodayWarnings = getMetricNumber(nextModel.metrics, '今日预警') + 1

            return pushToast(
              {
                ...nextState,
                model: withGlobalStats(
                  {
                    ...nextModel,
                    metrics: updateMetricNumber(nextModel.metrics, '今日预警', nextTodayWarnings, {
                      decimals: 0,
                      suffix: ' 条',
                    }),
                  },
                  { ...stats, warning: stats.warning + 1 },
                ),
                sampleRate: randomInt(30, 42),
              },
              {
                body: `${newRecord.building_id} 触发预警：电耗 ${newRecord.electricity_kwh.toFixed(1)} kWh`,
                title: '新监测预警',
                tone: 'rose',
              },
            )
          })
          scheduleTableInsert()
        },
        randomInt(2000, 3000),
      )
    }

    const triggerRandomEvent = () => {
      setState((current) => {
        const eventType = randomInt(1, 4)
        const stats = statsFromModel(current.model)

        if (eventType === 1) {
          const warningRecord = makeWarningRecord(Date.now())
          const nextCurrentWarning = stats.warning + 1
          const nextTodayWarnings = getMetricNumber(current.model.metrics, '今日预警') + 1
          return pushToast(
            {
              ...current,
              lastSyncSeconds: 0,
              model: withGlobalStats(
                {
                  ...current.model,
                  metrics: updateMetricNumber(
                    current.model.metrics,
                    '今日预警',
                    nextTodayWarnings,
                    {
                      decimals: 0,
                      suffix: ' 条',
                    },
                  ),
                  recentRecords: [warningRecord, ...current.model.recentRecords].slice(0, 12),
                },
                { ...stats, warning: nextCurrentWarning },
              ),
              sampleCount: current.sampleCount + 1,
              sampleRate: randomInt(28, 42),
            },
            {
              body: `${warningRecord.building_id} 电耗超阈值 ${randomInt(12, 28)}%`,
              title: '新预警提示',
              tone: 'rose',
            },
          )
        }

        if (eventType === 2) {
          return pushToast(current, {
            body: `共扫描 ${stats.normal + stats.warning + stats.maintenance + stats.offline} 个监测点`,
            title: '系统扫描完成',
            tone: 'emerald',
          })
        }

        if (eventType === 3) {
          const warningToNormal = stats.warning > 125 && Math.random() > 0.45
          const nextStats = warningToNormal
            ? { ...stats, normal: stats.normal + 1, warning: Math.max(0, stats.warning - 1) }
            : { ...stats, normal: Math.max(0, stats.normal - 1), warning: stats.warning + 1 }
          const currentTodayWarnings = getMetricNumber(current.model.metrics, '今日预警')
          const nextTodayWarnings = warningToNormal
            ? currentTodayWarnings
            : currentTodayWarnings + 1

          return pushToast(
            {
              ...current,
              model: withGlobalStats(
                {
                  ...current.model,
                  metrics: updateMetricNumber(
                    current.model.metrics,
                    '今日预警',
                    nextTodayWarnings,
                    {
                      decimals: 0,
                      suffix: ' 条',
                    },
                  ),
                },
                nextStats,
              ),
            },
            {
              body: `${LIVE_BUILDINGS[randomInt(0, LIVE_BUILDINGS.length - 1)]!.id} 状态变更：${
                warningToNormal ? '预警 → 正常' : '正常 → 预警'
              }`,
              title: '设备状态切换',
              tone: warningToNormal ? 'emerald' : 'rose',
            },
          )
        }

        return pushToast(
          {
            ...current,
            lastSyncSeconds: 0,
          },
          {
            body: '热力矩阵与关系图完成一次采集脉冲',
            title: '采集周期完成',
            tone: 'cyan',
          },
        )
      })

      eventTimer = window.setTimeout(triggerRandomEvent, randomInt(8000, 15_000))
    }

    scheduleTableInsert()
    eventTimer = window.setTimeout(triggerRandomEvent, randomInt(8000, 15_000))

    const timers = [
      window.setInterval(() => {
        setState((current) => ({
          ...current,
          lastSyncSeconds: current.lastSyncSeconds + 1,
        }))
      }, 1000),
      window.setInterval(() => {
        setState((current) => ({
          ...current,
          model: updateLiveMetrics(current.model),
        }))
      }, 2000),
      window.setInterval(() => {
        setState((current) => {
          const model = current.model
          const currentSlotIndex = getCurrentSlotIndex()
          const hourlySeries = model.hourlySeries.map((point, index) => {
            if (index !== currentSlotIndex) return point

            return {
              ...point,
              electricity: Number(
                (point.electricity * (1 + randomBetween(-0.03, 0.03))).toFixed(1),
              ),
              hvac: Number((point.hvac * (1 + randomBetween(-0.025, 0.025))).toFixed(1)),
              occupancy: Number((point.occupancy * (1 + randomBetween(-0.025, 0.025))).toFixed(1)),
            }
          })
          const currentSlot = hourlySeries[currentSlotIndex]!
          const currentLoad = Number(
            (currentSlot.electricity * randomBetween(1.15, 1.32)).toFixed(1),
          )
          const currentPeakLoad = getMetricNumber(model.metrics, '今日峰值负荷')
          const nextPeakLoad = Math.max(currentPeakLoad, currentLoad)
          const currentHvacRatio = getMetricNumber(model.metrics, 'HVAC 当前占比')
          const nextHvacRatio = Number(
            clamp(currentHvacRatio + randomBetween(-1.2, 1.2), 30, 58).toFixed(1),
          )
          const relationshipInsights = deriveHourlyInsights(
            hourlySeries,
            model.relationshipInsights,
          )

          return {
            ...current,
            lastSyncSeconds: 0,
            model: {
              ...model,
              hourlySeries,
              metrics: updateMetricNumber(
                updateMetricNumber(model.metrics, '今日峰值负荷', nextPeakLoad, {
                  decimals: 1,
                  detail: `${currentSlot.hour} 当前时段峰值检查`,
                  suffix: ' kWh',
                }),
                'HVAC 当前占比',
                nextHvacRatio,
                { decimals: 1, suffix: '%' },
              ),
              relationshipInsights,
            },
          }
        })
      }, 8000),
      window.setInterval(() => {
        setState((current) => {
          const energyIncrement = randomBetween(5, 30)
          const todayEnergy = getMetricNumber(current.model.metrics, '今日累计') + energyIncrement
          const crossedThousand =
            Math.floor(todayEnergy / 1000) >
            Math.floor(getMetricNumber(current.model.metrics, '今日累计') / 1000)

          return pushToast(
            {
              ...current,
              lastSyncSeconds: 0,
              model: {
                ...current.model,
                composition: addMonthlyCompositionEnergy(current.model.composition),
                metrics: updateMetricNumber(current.model.metrics, '今日累计', todayEnergy, {
                  decimals: 0,
                  suffix: ' kWh',
                }),
              },
            },
            crossedThousand
              ? {
                  body: `今日累计达到 ${Math.floor(todayEnergy / 1000) * 1000} kWh 节点`,
                  title: '累计节点达成',
                  tone: 'cyan',
                }
              : {
                  body: `今日累计 +${energyIncrement.toFixed(0)} kWh`,
                  title: '累计电耗更新',
                  tone: 'cyan',
                },
          )
        })
      }, 10_000),
      window.setInterval(
        () => {
          setState((current) => {
            if (Math.random() < 0.5) return current

            const stats = statsFromModel(current.model)
            const nextCurrentWarning = stats.warning + 1
            const nextTodayWarnings = getMetricNumber(current.model.metrics, '今日预警') + 1
            return pushToast(
              {
                ...current,
                model: withGlobalStats(
                  {
                    ...current.model,
                    metrics: updateMetricNumber(
                      current.model.metrics,
                      '今日预警',
                      nextTodayWarnings,
                      {
                        decimals: 0,
                        suffix: ' 条',
                      },
                    ),
                  },
                  { ...stats, warning: nextCurrentWarning },
                ),
              },
              {
                body: `${LIVE_BUILDINGS[randomInt(0, LIVE_BUILDINGS.length - 1)]!.id} 新增预警时段`,
                title: '预警计数更新',
                tone: 'rose',
              },
            )
          })
        },
        randomInt(30_000, 60_000),
      ),
      window.setInterval(() => {
        setState((current) => {
          const stats = statsFromModel(current.model)
          const warningDelta = randomInt(-1, 1)
          const normalDelta = -warningDelta

          return {
            ...current,
            model: withGlobalStats(
              {
                ...current.model,
                buildingSummaries: current.model.buildingSummaries.map((summary) => ({
                  ...summary,
                  efficiencyScore: Math.round(
                    clamp(summary.efficiencyScore + randomBetween(-1, 1), 55, 98),
                  ),
                })),
              },
              {
                ...stats,
                healthScore: Math.round(
                  clamp(current.model.performanceScore + randomInt(-1, 1), 72, 97),
                ),
                normal: Math.max(80, stats.normal + normalDelta),
                warning: Math.max(110, stats.warning + warningDelta),
              },
            ),
          }
        })
      }, 20_000),
    ]

    return () => {
      if (tableTimer) window.clearTimeout(tableTimer)
      if (eventTimer) window.clearTimeout(eventTimer)
      timers.forEach((timer) => {
        window.clearInterval(timer)
      })
    }
  }, [])

  return state
}

function buildLinePoints(values: number[], width: number, height: number, padding: number) {
  const maxValue = Math.max(...values, 1)
  const minValue = Math.min(...values, 0)
  const range = Math.max(maxValue - minValue, 1)

  return values.map((value, index) => {
    const x =
      values.length === 1
        ? width / 2
        : padding + (index / (values.length - 1)) * (width - padding * 2)
    const y = height - padding - ((value - minValue) / range) * (height - padding * 2)

    return { x, y, value }
  })
}

function buildBars(values: number[], width: number, height: number, padding: number) {
  const maxValue = Math.max(...values, 1)
  const innerWidth = width - padding * 2
  const gap = values.length > 1 ? innerWidth * 0.025 : 0
  const barWidth =
    values.length === 0 ? 0 : (innerWidth - gap * (values.length - 1)) / values.length

  return values.map((value, index) => {
    const barHeight = (value / maxValue) * (height - padding * 2)
    return {
      height: barHeight,
      value,
      width: barWidth,
      x: padding + index * (barWidth + gap),
      y: height - padding - barHeight,
    }
  })
}

function buildLinePath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function buildAreaPath(points: Array<{ x: number; y: number }>, height: number, padding: number) {
  if (points.length === 0) return ''

  const firstPoint = points[0]!
  const lastPoint = points[points.length - 1]!

  return `${buildLinePath(points)} L ${lastPoint.x} ${height - padding} L ${firstPoint.x} ${height - padding} Z`
}

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  }
}

function svgNumber(value: number) {
  return value.toFixed(3)
}

function describeDonutArc(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle)
  const outerEnd = polarToCartesian(cx, cy, outerRadius, endAngle)
  const innerStart = polarToCartesian(cx, cy, innerRadius, endAngle)
  const innerEnd = polarToCartesian(cx, cy, innerRadius, startAngle)
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0

  return [
    `M ${svgNumber(outerStart.x)} ${svgNumber(outerStart.y)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${svgNumber(outerEnd.x)} ${svgNumber(outerEnd.y)}`,
    `L ${svgNumber(innerStart.x)} ${svgNumber(innerStart.y)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${svgNumber(innerEnd.x)} ${svgNumber(innerEnd.y)}`,
    'Z',
  ].join(' ')
}

function buildScatterPoints<T>(
  items: T[],
  width: number,
  height: number,
  padding: number,
  xAccessor: (item: T) => number,
  yAccessor: (item: T) => number,
) {
  const xValues = items.map(xAccessor)
  const yValues = items.map(yAccessor)
  const minX = Math.min(...xValues)
  const maxX = Math.max(...xValues)
  const minY = Math.min(...yValues)
  const maxY = Math.max(...yValues)
  const xRange = Math.max(maxX - minX, 1)
  const yRange = Math.max(maxY - minY, 1)

  return items.map((item) => {
    const x = padding + ((xAccessor(item) - minX) / xRange) * (width - padding * 2)
    const y = height - padding - ((yAccessor(item) - minY) / yRange) * (height - padding * 2)

    return {
      item,
      x,
      y,
    }
  })
}

function buildTrendLine(
  points: Array<{ x: number; y: number }>,
  padding: number,
  width: number,
  height: number,
) {
  if (points.length < 2) return null

  const count = points.length
  const sumX = points.reduce((sum, point) => sum + point.x, 0)
  const sumY = points.reduce((sum, point) => sum + point.y, 0)
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0)
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0)
  const denominator = count * sumXX - sumX * sumX

  if (Math.abs(denominator) < 0.001) return null

  const slope = (count * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / count
  const x1 = padding
  const x2 = width - padding

  return {
    x1,
    x2,
    y1: clamp(slope * x1 + intercept, padding, height - padding),
    y2: clamp(slope * x2 + intercept, padding, height - padding),
  }
}

function statusToneClassName(tone: MonitoringStatusBucket['tone']) {
  switch (tone) {
    case 'amber':
      return 'bg-[#FFB800]'
    case 'emerald':
      return 'bg-[#22D3A0]'
    case 'rose':
      return 'bg-[#FF4D6D]'
    default:
      return 'bg-[#8DA8C5]'
  }
}

function metricToneColor(tone: MonitoringMetric['tone']) {
  switch (tone) {
    case 'amber':
      return DASHBOARD_COLORS.amber
    case 'emerald':
      return DASHBOARD_COLORS.emerald
    case 'rose':
      return DASHBOARD_COLORS.rose
    default:
      return DASHBOARD_COLORS.primary
  }
}

function scatterToneFill(tone: MonitoringScatterPoint['tone']) {
  switch (tone) {
    case 'amber':
      return DASHBOARD_COLORS.amber
    case 'emerald':
      return DASHBOARD_COLORS.emerald
    case 'rose':
      return DASHBOARD_COLORS.rose
    default:
      return DASHBOARD_COLORS.primary
  }
}

function describeCorrelation(value: number) {
  const absolute = Math.abs(value)

  if (absolute >= 0.75) return value >= 0 ? '强正相关' : '强负相关'
  if (absolute >= 0.45) return value >= 0 ? '中等正相关' : '中等负相关'
  if (absolute >= 0.2) return value >= 0 ? '弱正相关' : '弱负相关'

  return '相关性较弱'
}

function PanelGlyph({
  kind,
  tone = DASHBOARD_COLORS.primary,
}: {
  kind: PanelIconKind
  tone?: string
}) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  return (
    <span
      aria-hidden
      className="hud-glyph"
      style={{ color: tone, '--glyph-accent': tone } as CSSProperties}
    >
      <svg className="h-full w-full" viewBox="0 0 40 40">
        <path
          d="M20 2.8 34.8 11.4v17.2L20 37.2 5.2 28.6V11.4L20 2.8Z"
          fill="currentColor"
          opacity="0.12"
          stroke="currentColor"
          strokeOpacity="0.55"
          strokeWidth="1.5"
        />
        <path
          d="M20 7.2 30.8 13.5v13L20 32.8 9.2 26.5v-13L20 7.2Z"
          strokeOpacity="0.45"
          strokeWidth="1"
          {...common}
        />
        {kind === 'health' ? (
          <>
            <path d="M12 22a8 8 0 1 1 16 0" strokeWidth="2.2" {...common} />
            <path d="M20 22 25 15.5" strokeWidth="2.2" {...common} />
            <path d="M14.5 25.5h11" strokeWidth="2.2" {...common} />
          </>
        ) : null}
        {kind === 'trend' ? (
          <>
            <path d="M11 25 16 20l4 3 8-9" strokeWidth="2.4" {...common} />
            <path d="M27 14h-5M27 14v5" strokeWidth="1.8" {...common} />
          </>
        ) : null}
        {kind === 'load' ? (
          <>
            <path d="M12 25h16" strokeWidth="2" {...common} />
            <path d="M14 25V15M20 25V11M26 25v-7" strokeWidth="3" {...common} />
          </>
        ) : null}
        {kind === 'peak' ? (
          <>
            <path d="M20.5 9 13 22h5l-.5 9L27 17h-5.6l-.9-8Z" fill="currentColor" opacity="0.74" />
          </>
        ) : null}
        {kind === 'heatmap' ? (
          <>
            {[0, 1, 2].map((row) =>
              [0, 1, 2].map((col) => (
                <rect
                  fill="currentColor"
                  height="5.2"
                  key={`${row}-${col}`}
                  opacity={0.2 + (row + col) * 0.12}
                  rx="0.6"
                  width="5.2"
                  x={12 + col * 6.8}
                  y={12 + row * 6.8}
                />
              )),
            )}
          </>
        ) : null}
        {kind === 'composition' ? (
          <>
            <circle cx="20" cy="20" r="8.4" strokeWidth="2.2" {...common} />
            <path d="M20 11.6v8.4l7.2 4.1" strokeWidth="2.4" {...common} />
            <circle cx="20" cy="20" fill="currentColor" opacity="0.75" r="2.2" />
          </>
        ) : null}
        {kind === 'risk' ? (
          <>
            <path d="M20 10.5 29 27H11l9-16.5Z" strokeWidth="2.2" {...common} />
            <path d="M20 16.5v5.5M20 25.8v.2" strokeWidth="2.4" {...common} />
          </>
        ) : null}
        {kind === 'relation' ? (
          <>
            <circle cx="14" cy="15" fill="currentColor" opacity="0.78" r="3" />
            <circle cx="26" cy="24" fill="currentColor" opacity="0.78" r="3" />
            <path d="M16.6 16.8 23.4 22.2" strokeWidth="2.2" {...common} />
          </>
        ) : null}
        {kind === 'records' ? (
          <>
            <path d="M13 11.5h14v17H13z" strokeWidth="2" {...common} />
            <path d="M16 16h8M16 20h8M16 24h5" strokeWidth="1.9" {...common} />
          </>
        ) : null}
        {kind === 'building' ? (
          <>
            <path d="M13 27.5v-13l7-3.5 7 3.5v13" strokeWidth="2" {...common} />
            <path
              d="M16.5 17.5h1.8M21.7 17.5h1.8M16.5 22h1.8M21.7 22h1.8"
              strokeWidth="2"
              {...common}
            />
            <path d="M11 27.5h18" strokeWidth="2" {...common} />
          </>
        ) : null}
      </svg>
    </span>
  )
}

function PanelHeader({
  divider = 1,
  icon,
  title,
}: {
  divider?: 1 | 2 | 3 | 4 | 5 | 6
  icon?: PanelIconKind
  title: string
}) {
  return (
    <div className="hud-panel-titlebar relative mb-5 min-h-14" data-divider={divider}>
      <div className="relative flex items-center gap-3 px-4 pt-3">
        <span className="hud-title-mark" />
        {icon ? <PanelGlyph kind={icon} /> : null}
        <div>
          <h2
            className="font-black not-italic leading-none text-cyan-50 tracking-[0.03em]"
            style={{
              fontFamily: DASHBOARD_FONTS.cn,
              fontStyle: 'normal',
              textShadow: '0 0 14px rgba(0,212,255,0.52)',
            }}
          >
            {title}
          </h2>
        </div>
        <span className="ml-auto flex gap-1 pr-1">
          <i className="h-3 w-1.5 skew-x-[-22deg] bg-cyan-300/70" />
          <i className="h-3 w-1.5 skew-x-[-22deg] bg-cyan-400/45" />
          <i className="h-3 w-1.5 skew-x-[-22deg] bg-cyan-500/25" />
        </span>
      </div>
    </div>
  )
}

function HudPanel({
  children,
  className,
  contentClassName,
  divider,
  icon,
  size = 'medium',
  title,
}: {
  children: ReactNode
  className?: string
  contentClassName?: string
  divider?: 1 | 2 | 3 | 4 | 5 | 6
  icon?: PanelIconKind
  size?: 'small' | 'medium' | 'large' | 'kpi'
  title: string
}) {
  return (
    <BevelCard
      className={cn('data-analysis-card-frame min-h-0 w-full p-4', className)}
      contentClassName={contentClassName}
      size={size}
    >
      <PanelHeader divider={divider} icon={icon} title={title} />
      {children}
    </BevelCard>
  )
}

export interface DataAnalysisWorkspaceProps {
  projectId: string
  queryResults: HostQueryResult[]
  selectedComponentName: string
}

function MetricCard({ metric }: { metric: MonitoringMetric }) {
  const accent = metricToneColor(metric.tone)
  const parsedValue = parseMetricValue(metric.value)
  const metricIcon: Record<MonitoringMetric['tone'], PanelIconKind> = {
    amber: 'load',
    emerald: 'relation',
    rose: 'risk',
    sky: 'building',
  }

  return (
    <BevelCard
      className="data-analysis-card-frame metric-card-interactive min-h-[112px] w-full px-4 py-3"
      size="kpi"
      {...tooltipAttrs(metricTooltip(metric))}
    >
      <div className="flex items-center gap-3">
        <div
          className="metric-card-icon relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          style={{
            background: `radial-gradient(circle, ${accent} 0%, rgba(0,0,0,0) 62%)`,
            boxShadow: `0 0 22px ${accent}55`,
          }}
        >
          <PanelGlyph kind={metricIcon[metric.tone]} tone={accent} />
        </div>
        <div className="min-w-0">
          <AnimatedNumber
            className="mt-1 truncate text-[26px] font-bold leading-none text-cyan-50 drop-shadow-[0_0_12px_rgba(0,212,255,0.35)]"
            decimals={parsedValue.decimals}
            style={{ color: accent, fontFamily: DASHBOARD_FONTS.numHeavy }}
            suffix={parsedValue.suffix}
            value={parsedValue.numeric}
          />
          <div
            className="mt-2 truncate text-[17px] font-semibold text-cyan-50/88"
            style={{ fontFamily: DASHBOARD_FONTS.cn }}
          >
            {metric.label}
          </div>
          <MetricMiniTrend seed={metric.label} />
        </div>
      </div>
    </BevelCard>
  )
}

function HealthGaugePanel({ model }: { model: MonitoringAnalyticsModel }) {
  const angle = (model.performanceScore / 100) * 360
  const maintenanceBucket = model.statusDistribution.find((bucket) => bucket.tone === 'amber')
  const offlineBucket = model.statusDistribution.find((bucket) => bucket.tone === 'slate')
  const warningBucket = model.statusDistribution.find((bucket) => bucket.tone === 'rose')
  const normalBucket = model.statusDistribution.find((bucket) => bucket.tone === 'emerald')
  const statusTotal = model.statusDistribution.reduce((sum, item) => sum + item.count, 0)
  const riskCount = (warningBucket?.count ?? 0) + (offlineBucket?.count ?? 0)
  const gaugeStyle = {
    backgroundImage: `conic-gradient(${DASHBOARD_COLORS.primary} 0deg ${angle}deg, rgba(0,212,255,0.08) ${angle}deg 360deg)`,
  } satisfies CSSProperties

  return (
    <HudPanel divider={1} icon="health" title="运行健康评分">
      <div className="grid grid-cols-[150px_1fr] gap-4 max-sm:grid-cols-1">
        <div className="flex items-center justify-center">
          <div
            className="health-gauge-interactive relative flex h-36 w-36 items-center justify-center rounded-full border border-cyan-300/20 shadow-[0_0_32px_rgba(0,212,255,0.2)]"
            style={gaugeStyle}
            {...tooltipAttrs(healthGaugeTooltip(model.performanceScore))}
          >
            <span className="health-gauge-orbit" />
            <div className="absolute inset-3 rounded-full border border-cyan-200/10 bg-[#061829]/85" />
            <div className="relative text-center">
              <AnimatedNumber
                className="text-5xl font-bold leading-none text-cyan-50"
                style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
                value={model.performanceScore}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {model.statusDistribution.map((bucket) => {
            const ratio = statusTotal === 0 ? 0 : (bucket.count / statusTotal) * 100

            return (
              <div
                className="health-bar-item"
                key={bucket.label}
                {...tooltipAttrs(statusBucketTooltip(bucket, ratio, model.buildingSummaries))}
              >
                <div className="mb-1 flex items-center justify-between text-[15px] text-cyan-50/82">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full shadow-[0_0_10px_currentColor]',
                        statusToneClassName(bucket.tone),
                      )}
                    />
                    {bucket.label}
                  </span>
                  <span style={{ fontFamily: DASHBOARD_FONTS.num }}>
                    <AnimatedNumber value={bucket.count} /> /{' '}
                    <AnimatedNumber decimals={1} value={ratio} suffix="%" />
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-cyan-950/70">
                  <div
                    className={cn(
                      'health-bar-fill h-full rounded-full transition-[width,filter] duration-700 ease-out',
                      statusToneClassName(bucket.tone),
                    )}
                    style={{ width: `${ratio}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="border border-cyan-300/28 bg-cyan-950/25 px-2 py-2.5 shadow-[0_0_12px_rgba(0,212,255,0.08)]">
          <div className="text-[15px] text-cyan-100/72">正常记录</div>
          <AnimatedNumber
            className="mt-1 text-2xl font-bold text-[#22D3A0]"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
            value={normalBucket?.count ?? 0}
          />
        </div>
        <div className="border border-cyan-300/28 bg-cyan-950/25 px-2 py-2.5 shadow-[0_0_12px_rgba(0,212,255,0.08)]">
          <div className="text-[15px] text-cyan-100/72">预警记录</div>
          <AnimatedNumber
            className="mt-1 text-2xl font-bold text-[#FF4D6D]"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
            value={warningBucket?.count ?? 0}
          />
        </div>
        <div className="border border-cyan-300/28 bg-cyan-950/25 px-2 py-2.5 shadow-[0_0_12px_rgba(0,212,255,0.08)]">
          <div className="text-[15px] text-cyan-100/72">监测总量</div>
          <AnimatedNumber
            className="mt-1 text-2xl font-bold text-cyan-50"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
            value={statusTotal}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          {
            count: riskCount,
            label: '风险占比',
            value: `${((riskCount / Math.max(statusTotal, 1)) * 100).toFixed(1)}%`,
            tone: DASHBOARD_COLORS.rose,
          },
          {
            count: normalBucket?.count ?? 0,
            label: '稳定占比',
            value: `${(((normalBucket?.count ?? 0) / Math.max(statusTotal, 1)) * 100).toFixed(1)}%`,
            tone: DASHBOARD_COLORS.emerald,
          },
          {
            count: maintenanceBucket?.count ?? 0,
            label: '维护占比',
            value: `${(((maintenanceBucket?.count ?? 0) / Math.max(statusTotal, 1)) * 100).toFixed(1)}%`,
            tone: DASHBOARD_COLORS.amber,
          },
        ].map((item) => (
          <div
            className="health-ratio-card border border-cyan-300/24 bg-cyan-950/20 px-3 py-2.5"
            key={item.label}
            {...tooltipAttrs(ratioTooltip(item.label, item.value, item.count, statusTotal))}
          >
            <div className="text-[14px] font-semibold text-cyan-100/70">{item.label}</div>
            <div
              className="mt-1 text-xl font-bold leading-none"
              style={{ color: item.tone, fontFamily: DASHBOARD_FONTS.num }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </HudPanel>
  )
}

function DailyLoadPanel({ model }: { model: MonitoringAnalyticsModel }) {
  const [hoveredDailyIndex, setHoveredDailyIndex] = useState<number | null>(null)
  const [scanIndex, setScanIndex] = useState(0)
  const lineProgress = useLoopProgress(6000)
  const chartWidth = 860
  const chartHeight = 320
  const padding = 34
  const electricityBars = buildBars(
    model.dailySeries.map((point) => point.electricity),
    chartWidth,
    chartHeight,
    padding,
  )
  const occupancyPoints = buildLinePoints(
    model.dailySeries.map((point) => point.occupancy),
    chartWidth,
    chartHeight,
    padding,
  )
  const travelIndex = Math.min(
    occupancyPoints.length - 1,
    Math.floor(lineProgress * Math.max(occupancyPoints.length, 1)),
  )
  const travelPoint = occupancyPoints[travelIndex] ?? occupancyPoints[0]

  useIntervalTick(() => {
    setScanIndex(randomInt(0, Math.max(0, model.dailySeries.length - 1)))
  }, 4000)

  return (
    <HudPanel divider={2} icon="trend" size="large" title="每日能耗与人流走势">
      <div className="mb-3 flex flex-wrap gap-2">
        <span
          className="inline-flex"
          {...tooltipAttrs({
            rows: [{ label: '视图含义', value: '按日汇总电耗，柱高越高负荷越大' }],
            title: '电耗柱状',
          })}
        >
          <Pill tone="primary">电耗柱状</Pill>
        </span>
        <span
          className="inline-flex"
          {...tooltipAttrs({
            rows: [{ label: '视图含义', value: '折线表示当日平均人流指数变化' }],
            title: '人流折线',
          })}
        >
          <Pill tone="emerald">人流折线</Pill>
        </span>
        <span
          className="inline-flex"
          {...tooltipAttrs({
            rows: [{ label: '视图含义', value: '近 12 天历史统计快照，悬停查看明细' }],
            title: '12 天窗口',
          })}
        >
          <Pill tone="neutral">12 天窗口</Pill>
        </span>
      </div>

      <div className="tech-chart-frame p-3">
        <svg
          className="block h-auto w-full"
          preserveAspectRatio="xMidYMid meet"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        >
          <defs>
            <linearGradient id="dailyOccupancyFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={DASHBOARD_COLORS.emerald} stopOpacity="0.22" />
              <stop offset="100%" stopColor={DASHBOARD_COLORS.emerald} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="dailyBarFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#7AF7FF" />
              <stop offset="48%" stopColor={DASHBOARD_COLORS.primary} />
              <stop offset="100%" stopColor="#006CA8" />
            </linearGradient>
            <filter id="cyanGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur result="blur" stdDeviation="3" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {[0, 1, 2, 3].map((index) => {
            const y = padding + ((chartHeight - padding * 2) / 3) * index
            return (
              <line
                key={y}
                stroke="rgba(141,168,197,0.22)"
                strokeDasharray="5 8"
                x1={padding}
                x2={chartWidth - padding}
                y1={y}
                y2={y}
              />
            )
          })}

          {electricityBars.map((bar, index) => {
            const point = model.dailySeries[index]!
            const isHovered = hoveredDailyIndex === index
            const isDimmed = hoveredDailyIndex !== null && !isHovered

            return (
              <g key={point.date}>
                <rect
                  className="daily-chart-bar"
                  data-dimmed={isDimmed ? 'true' : undefined}
                  data-hovered={isHovered ? 'true' : undefined}
                  data-scan={scanIndex === index ? 'true' : undefined}
                  fill="url(#dailyBarFill)"
                  filter="url(#cyanGlow)"
                  height={bar.height}
                  onPointerEnter={() => setHoveredDailyIndex(index)}
                  onPointerLeave={() => setHoveredDailyIndex(null)}
                  opacity={isDimmed ? 0.4 : isHovered ? 1 : 0.88}
                  rx="6"
                  ry="6"
                  width={bar.width}
                  x={bar.x}
                  y={bar.y}
                  {...tooltipAttrs(dailyTooltip(point, model.dailySeries[index - 1]))}
                />
                <circle
                  className="daily-bar-top-glow"
                  cx={bar.x + bar.width / 2}
                  cy={bar.y + 2}
                  fill="#7AF7FF"
                  r="3.5"
                />
                <rect
                  className="daily-bar-flow-line"
                  height={Math.max(10, bar.height * 0.42)}
                  width="2.4"
                  x={bar.x + bar.width * 0.62}
                  y={bar.y + bar.height * 0.58}
                />
              </g>
            )
          })}

          <path
            d={buildAreaPath(occupancyPoints, chartHeight, padding)}
            fill="url(#dailyOccupancyFill)"
          />
          <path
            d={buildLinePath(occupancyPoints)}
            fill="none"
            stroke={DASHBOARD_COLORS.emerald}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3.2"
          />
          {travelPoint ? (
            <circle
              className="daily-line-traveler"
              cx={travelPoint.x}
              cy={travelPoint.y}
              fill="#7AF7FF"
              r="5.2"
            />
          ) : null}

          {occupancyPoints.map((point, index) => {
            const sourcePoint = model.dailySeries[index]!
            const isHovered = hoveredDailyIndex === index

            return (
              <circle
                className="daily-line-node"
                cx={point.x}
                cy={point.y}
                data-hovered={isHovered ? 'true' : undefined}
                fill="#061829"
                key={sourcePoint.date}
                onPointerEnter={() => setHoveredDailyIndex(index)}
                onPointerLeave={() => setHoveredDailyIndex(null)}
                r={isHovered ? 6.75 : 4.5}
                stroke={DASHBOARD_COLORS.emerald}
                strokeWidth="2"
                {...tooltipAttrs({
                  rows: [
                    { label: '人流均值', value: sourcePoint.occupancy.toFixed(1) },
                    { label: '人流峰值', value: (sourcePoint.occupancy * 1.18).toFixed(1) },
                    { label: '人流谷值', value: (sourcePoint.occupancy * 0.72).toFixed(1) },
                    { label: '对应能耗', value: compactKwh(sourcePoint.electricity) },
                  ],
                  title: `${sourcePoint.date} 人流节点`,
                })}
              />
            )
          })}
        </svg>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[14px] text-cyan-50/65 md:grid-cols-4 2xl:grid-cols-6">
        {model.dailySeries.map((point, index) => (
          <div
            className="daily-date-card border border-cyan-300/24 bg-cyan-950/24 px-3 py-3.5"
            data-linked={hoveredDailyIndex === index ? 'true' : undefined}
            key={point.date}
            onPointerEnter={() => setHoveredDailyIndex(index)}
            onPointerLeave={() => setHoveredDailyIndex(null)}
            {...tooltipAttrs(dailyTooltip(point, model.dailySeries[index - 1]))}
          >
            <div className="whitespace-nowrap font-semibold tracking-[0.04em]">{point.date}</div>
            <AnimatedNumber
              className="mt-1 text-lg font-semibold text-cyan-50"
              decimals={1}
              style={{ fontFamily: DASHBOARD_FONTS.num }}
              suffix=" kWh"
              value={point.electricity}
            />
          </div>
        ))}
      </div>
    </HudPanel>
  )
}

function HourlyPatternPanel({ model }: { model: MonitoringAnalyticsModel }) {
  const [hoveredHourlyIndex, setHoveredHourlyIndex] = useState<number | null>(null)
  const currentSlotIndex = getCurrentSlotIndex()
  const chartWidth = 460
  const chartHeight = 210
  const padding = 24
  const maxHourlyElectricity = Math.max(...model.hourlySeries.map((point) => point.electricity), 1)
  const maxHourlyOccupancy = Math.max(...model.hourlySeries.map((point) => point.occupancy), 1)
  const minHourlyElectricity = Math.min(...model.hourlySeries.map((point) => point.electricity))
  const swing = maxHourlyElectricity - minHourlyElectricity
  const peakPoint = model.hourlySeries.reduce((best, point) =>
    point.electricity > best.electricity ? point : best,
  )
  const quietPoint = model.hourlySeries.reduce((best, point) =>
    point.electricity < best.electricity ? point : best,
  )
  const electricityBars = buildBars(
    model.hourlySeries.map((point) => point.electricity),
    chartWidth,
    chartHeight,
    padding,
  )
  const occupancyPoints = buildLinePoints(
    model.hourlySeries.map((point) => point.occupancy),
    chartWidth,
    chartHeight,
    padding,
  )

  return (
    <HudPanel divider={3} icon="load" title="时段负荷关系">
      <div className="grid grid-cols-2 gap-2">
        <div
          className="hourly-summary-card bg-cyan-950/25 p-2.5 ring-1 ring-cyan-300/24"
          {...tooltipAttrs({
            rows: [
              { label: '具体时刻', value: model.relationshipInsights.peakHour },
              { label: '数值', value: compactKwh(peakPoint.electricity) },
              { label: '对应楼栋', value: 'BLDG-C-07' },
            ],
            title: '电耗高峰',
          })}
        >
          <div className="text-[14px] text-cyan-100/72">电耗高峰</div>
          <div
            className="mt-0.5 text-lg font-bold text-cyan-50"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
          >
            {model.relationshipInsights.peakHour}
          </div>
        </div>
        <div
          className="hourly-summary-card bg-cyan-950/25 p-2.5 ring-1 ring-cyan-300/24"
          {...tooltipAttrs({
            rows: [
              { label: '具体时刻', value: model.relationshipInsights.quietHour },
              { label: '数值', value: compactKwh(quietPoint.electricity) },
              { label: '对应楼栋', value: 'BLDG-B-01' },
            ],
            title: '低谷时段',
          })}
        >
          <div className="text-[14px] text-cyan-100/72">低谷时段</div>
          <div
            className="mt-0.5 text-lg font-bold text-cyan-50"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
          >
            {model.relationshipInsights.quietHour}
          </div>
        </div>
        <div
          className="hourly-summary-card bg-cyan-950/25 p-2.5 ring-1 ring-cyan-300/24"
          {...tooltipAttrs({
            rows: [
              { label: '计算口径', value: '峰值负荷 - 低谷负荷' },
              { label: '峰值', value: compactKwh(peakPoint.electricity) },
              { label: '低谷', value: compactKwh(quietPoint.electricity) },
            ],
            title: '峰谷差值',
          })}
        >
          <div className="text-[14px] text-cyan-100/72">峰谷差值</div>
          <div
            className="mt-0.5 text-lg font-bold text-[#FFB800]"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
          >
            {swing.toFixed(0)}
          </div>
        </div>
        <div
          className="hourly-summary-card bg-cyan-950/25 p-2.5 ring-1 ring-cyan-300/24"
          {...tooltipAttrs({
            rows: [
              { label: '具体时刻', value: model.relationshipInsights.busiestHour },
              { label: '人流峰值', value: maxHourlyOccupancy.toFixed(1) },
              { label: '对应楼栋', value: 'BLDG-A-03' },
            ],
            title: '人流高峰',
          })}
        >
          <div className="text-[14px] text-cyan-100/72">人流峰值</div>
          <div
            className="mt-0.5 text-lg font-bold text-[#7AF7FF]"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
          >
            {maxHourlyOccupancy.toFixed(0)}
          </div>
        </div>
      </div>

      <div className="tech-chart-frame mt-3 p-2.5">
        <svg
          className="block h-auto w-full"
          preserveAspectRatio="xMidYMid meet"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        >
          <defs>
            <linearGradient id="hourlyBarFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#7AF7FF" />
              <stop offset="100%" stopColor="#0070AE" />
            </linearGradient>
          </defs>

          {[0, 1, 2, 3].map((index) => {
            const y = padding + ((chartHeight - padding * 2) / 3) * index
            return (
              <line
                key={y}
                stroke="rgba(141,168,197,0.2)"
                strokeDasharray="5 8"
                x1={padding}
                x2={chartWidth - padding}
                y1={y}
                y2={y}
              />
            )
          })}

          {electricityBars.map((bar, index) => {
            const point = model.hourlySeries[index]!
            const isHovered = hoveredHourlyIndex === index
            const isDimmed = hoveredHourlyIndex !== null && !isHovered
            const isCurrent = currentSlotIndex === index

            return (
              <rect
                className="hourly-chart-bar"
                data-current={isCurrent ? 'true' : undefined}
                data-dimmed={isDimmed ? 'true' : undefined}
                data-hovered={isHovered ? 'true' : undefined}
                fill="url(#hourlyBarFill)"
                height={bar.height}
                key={point.hour}
                onPointerEnter={() => setHoveredHourlyIndex(index)}
                onPointerLeave={() => setHoveredHourlyIndex(null)}
                opacity={isDimmed ? 0.42 : 0.9}
                rx="10"
                ry="10"
                width={bar.width}
                x={bar.x}
                y={bar.y}
                {...tooltipAttrs(hourlyTooltip(point, index))}
              />
            )
          })}

          <path
            d={buildLinePath(occupancyPoints)}
            fill="none"
            stroke={DASHBOARD_COLORS.amber}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />

          {occupancyPoints.map((point, index) => {
            const sourcePoint = model.hourlySeries[index]!
            const ratio = sourcePoint.occupancy / Math.max(sourcePoint.electricity, 1)

            return (
              <circle
                className="hourly-line-node"
                cx={point.x}
                cy={point.y}
                data-hovered={hoveredHourlyIndex === index ? 'true' : undefined}
                fill="#061829"
                key={sourcePoint.hour}
                onPointerEnter={() => setHoveredHourlyIndex(index)}
                onPointerLeave={() => setHoveredHourlyIndex(null)}
                r={hoveredHourlyIndex === index ? 6.5 : 4.5}
                stroke={DASHBOARD_COLORS.amber}
                strokeWidth="2"
                {...tooltipAttrs({
                  rows: [
                    { label: '人流', value: sourcePoint.occupancy.toFixed(1) },
                    { label: '能耗', value: compactKwh(sourcePoint.electricity) },
                    { label: '人流/能耗比', value: ratio.toFixed(3) },
                  ],
                  title: `${sourcePoint.hour} 折线节点`,
                })}
              />
            )
          })}
        </svg>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {model.hourlySeries.map((point, index) => {
          const isCurrent = currentSlotIndex === index

          return (
            <div
              className="hourly-slot-card relative border border-cyan-300/24 bg-cyan-950/20 px-2 py-1.5"
              data-current={isCurrent ? 'true' : undefined}
              data-linked={hoveredHourlyIndex === index ? 'true' : undefined}
              key={point.hour}
              onPointerEnter={() => setHoveredHourlyIndex(index)}
              onPointerLeave={() => setHoveredHourlyIndex(null)}
              {...tooltipAttrs(hourlyTooltip(point, index))}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[13px] text-cyan-100/74">{point.hour}</span>
                {isCurrent ? (
                  <span className="rounded-sm border border-cyan-300/40 bg-cyan-300/12 px-1 text-[10px] font-bold text-cyan-100">
                    当前
                  </span>
                ) : null}
              </div>
              <AnimatedNumber
                className="mt-0.5 text-base font-bold text-cyan-50"
                style={{ fontFamily: DASHBOARD_FONTS.num }}
                value={point.electricity}
              />
              <div className="text-[11px] text-cyan-100/62">kWh</div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          {
            label: '峰值负荷',
            value: `${peakPoint.electricity.toFixed(0)} kWh`,
            width: (peakPoint.electricity / maxHourlyElectricity) * 100,
            color: '#FFB800',
          },
          {
            label: '低谷负荷',
            value: `${quietPoint.electricity.toFixed(0)} kWh`,
            width: (quietPoint.electricity / maxHourlyElectricity) * 100,
            color: '#22D3A0',
          },
          {
            label: '人流高峰',
            value: model.relationshipInsights.busiestHour,
            width: 100,
            color: '#00D4FF',
          },
        ].map((item) => (
          <div
            className="hourly-summary-card border border-cyan-300/24 bg-cyan-950/20 px-2 py-1.5"
            key={item.label}
            {...tooltipAttrs({
              rows: [
                {
                  label: '具体时刻',
                  value:
                    item.label === '低谷负荷'
                      ? quietPoint.hour
                      : item.label === '人流高峰'
                        ? model.relationshipInsights.busiestHour
                        : peakPoint.hour,
                },
                { label: '数值', value: item.value },
                { label: '对应楼栋', value: item.label === '低谷负荷' ? 'BLDG-B-01' : 'BLDG-C-07' },
              ],
              title: item.label,
            })}
          >
            <div className="text-[14px] font-semibold text-cyan-100/74">{item.label}</div>
            <div
              className="mt-0.5 truncate text-[15px] font-bold text-cyan-50"
              style={{ fontFamily: DASHBOARD_FONTS.num }}
            >
              {item.value}
            </div>
            <div className="mt-1 h-1.5 overflow-hidden bg-cyan-950/80">
              <div
                className="h-full shadow-[0_0_16px_currentColor]"
                style={{ backgroundColor: item.color, color: item.color, width: `${item.width}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </HudPanel>
  )
}

function PeakDevicePanel({ model }: { model: MonitoringAnalyticsModel }) {
  const snapshot = model.peakSnapshot
  const relatedDevices = [
    {
      buildingId: 'BLDG-A-03',
      deviceId: 'BLDG-A-03-DEV-21',
      electricity: 214,
      monitorTime: snapshot.monitorTime,
    },
    {
      buildingId: 'BLDG-B-01',
      deviceId: 'BLDG-B-01-DEV-05',
      electricity: 198,
      monitorTime: snapshot.monitorTime,
    },
  ]

  return (
    <HudPanel
      contentClassName="[&>div:first-child]:mb-3"
      divider={4}
      icon="peak"
      title="今日峰值设备"
    >
      <div className="border border-cyan-300/28 bg-cyan-950/24 px-4 py-3 shadow-[0_0_12px_rgba(0,212,255,0.08)]">
        <div className="text-[15px] font-semibold text-cyan-100/72">{snapshot.buildingId}</div>
        <div
          className="peak-device-id mt-1 truncate text-2xl font-bold leading-tight text-[#FFB800]"
          style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
          {...tooltipAttrs({
            rows: [
              { label: '设备类型', value: '中央空调机组' },
              { label: '楼层 / 区域', value: '7F 实验区西翼' },
              { label: '投入使用', value: '2022-09-18' },
              { label: '累计运行', value: '18,640 h' },
              { label: '最近维护', value: '2026-04-03' },
            ],
            title: snapshot.deviceId,
          })}
        >
          {snapshot.deviceId}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            {
              label: '峰值电耗',
              tooltip: {
                rows: [
                  { label: '发生条件', value: '28.6°C / 人流 95.8 / 12:00' },
                  { label: '历史峰值对比', tone: 'amber', value: '+4.6%' },
                ],
                title: '峰值电耗详情',
              },
              value: `${snapshot.electricity.toFixed(1)} kWh`,
            },
            {
              label: '监测时间',
              tooltip: {
                rows: [
                  { label: '监测周期', value: `${snapshot.monitorTime.slice(5)} 所在小时` },
                  { label: '采集频率', value: '60 秒 / 次' },
                ],
                title: '监测时间详情',
              },
              value: snapshot.monitorTime.slice(5),
            },
            {
              label: '温度',
              tooltip: {
                rows: [
                  { label: '24 小时趋势', value: '▁▂▄▆▇▅▃' },
                  { label: '阈值范围', value: '22-28°C' },
                ],
                title: '温度指标',
              },
              value: `${snapshot.temperature.toFixed(1)}°C`,
            },
            {
              label: '人流',
              tooltip: {
                rows: [
                  { label: '24 小时趋势', value: '▂▃▆▇▅▃▂' },
                  { label: '阈值范围', value: '0-90' },
                ],
                title: '人流指标',
              },
              value: snapshot.occupancy.toFixed(1),
            },
          ].map((item) => (
            <div
              className="peak-device-metric border border-cyan-300/24 bg-cyan-950/24 px-3 py-2"
              key={item.label}
              {...tooltipAttrs(item.tooltip)}
            >
              <div className="text-[14px] font-semibold text-cyan-100/70">{item.label}</div>
              {item.label === '温度' ? (
                <AnimatedNumber
                  className="mt-1 truncate text-[16px] font-bold text-cyan-50"
                  decimals={1}
                  style={{ fontFamily: DASHBOARD_FONTS.num }}
                  suffix="°C"
                  value={snapshot.temperature}
                />
              ) : item.label === '人流' ? (
                <AnimatedNumber
                  className="mt-1 truncate text-[16px] font-bold text-cyan-50"
                  decimals={1}
                  style={{ fontFamily: DASHBOARD_FONTS.num }}
                  value={snapshot.occupancy}
                />
              ) : (
                <div
                  className="mt-1 truncate text-[16px] font-bold text-cyan-50"
                  style={{ fontFamily: DASHBOARD_FONTS.num }}
                >
                  {item.value}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {relatedDevices.map((record) => (
          <div
            className="peak-device-related border border-cyan-300/24 bg-cyan-950/20 px-3 py-2.5"
            key={record.deviceId}
            {...tooltipAttrs({
              rows: [
                { label: '效率偏离', value: '+12.4%' },
                { label: '温度贡献', value: '29 分' },
                { label: '负荷贡献', value: '41 分' },
                { label: '告警贡献', value: '18 分' },
              ],
              title: `${record.deviceId} 风险评分`,
            })}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-bold text-cyan-50">{record.deviceId}</div>
                <div className="mt-0.5 text-[13px] text-cyan-100/62">
                  {record.buildingId} / {record.monitorTime.slice(5)}
                </div>
              </div>
              <div
                className="text-lg font-bold text-[#FF4D6D]"
                style={{ fontFamily: DASHBOARD_FONTS.num }}
              >
                {record.electricity.toFixed(0)}
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden bg-cyan-950/80">
              <div
                className="h-full bg-[linear-gradient(90deg,#FF4D6D_0%,#FFB800_100%)] shadow-[0_0_14px_rgba(255,77,109,0.35)]"
                style={{
                  width: `${clamp((record.electricity / snapshot.electricity) * 100, 12, 100)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </HudPanel>
  )
}

function RiskLayerPanel({ model }: { model: MonitoringAnalyticsModel }) {
  const warningBucket = model.statusDistribution.find((bucket) => bucket.tone === 'rose')
  const maintenanceBucket = model.statusDistribution.find((bucket) => bucket.tone === 'amber')
  const warningTotal = warningBucket?.count ?? 0
  const warningDistribution = [
    { building: 'BLDG-C-07', ratio: 0.31 },
    { building: 'BLDG-D-02', ratio: 0.27 },
    { building: 'BLDG-A-03', ratio: 0.22 },
    { building: 'BLDG-B-01', ratio: 0.2 },
  ]
  const maxWarningCount = Math.max(
    ...model.buildingSummaries.map((summary) => summary.warningCount),
    1,
  )
  const topRiskBuildings = [...model.buildingSummaries]
    .sort((a, b) => b.warningCount - a.warningCount || a.efficiencyScore - b.efficiencyScore)
    .slice(0, 3)

  return (
    <HudPanel contentClassName="[&>div:first-child]:mb-3" divider={5} icon="risk" title="风险分层">
      <div className="grid grid-cols-2 gap-2">
        <div
          className="risk-stat-card border border-cyan-300/24 bg-cyan-950/22 px-3 py-3"
          {...tooltipAttrs({
            rows: warningDistribution.map((item, index) => ({
              label: item.building,
              value:
                index === warningDistribution.length - 1
                  ? `${Math.max(
                      0,
                      warningTotal -
                        warningDistribution
                          .slice(0, -1)
                          .reduce(
                            (sum, current) => sum + Math.round(warningTotal * current.ratio),
                            0,
                          ),
                    )} 条`
                  : `${Math.round(warningTotal * item.ratio)} 条`,
            })),
            title: '预警按楼栋分布',
          })}
        >
          <div className="text-[15px] font-semibold text-cyan-100/72">预警记录</div>
          <AnimatedNumber
            className="mt-1 text-3xl font-bold leading-none text-[#FF4D6D]"
            style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
            value={warningTotal}
          />
        </div>
        <div
          className="risk-stat-card border border-cyan-300/24 bg-cyan-950/22 px-3 py-3"
          {...tooltipAttrs({
            rows: [
              { label: 'BLDG-A-03', value: '1 台冷机巡检' },
              { label: 'BLDG-D-02', value: '1 台采集器校准' },
            ],
            title: '维护中清单',
          })}
        >
          <div className="text-[15px] font-semibold text-cyan-100/72">维护中</div>
          <AnimatedNumber
            className="mt-1 text-3xl font-bold leading-none text-[#FFB800]"
            style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
            value={maintenanceBucket?.count ?? 0}
          />
        </div>
      </div>

      <div className="risk-list mt-3 space-y-2">
        {topRiskBuildings.map((summary, index) => (
          <div
            className="risk-row border border-cyan-300/24 bg-cyan-950/20 px-3 py-2.5"
            data-rank={index + 1}
            key={summary.buildingId}
            {...tooltipAttrs(riskRowTooltip(summary, index + 1))}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="risk-rank flex h-7 w-7 shrink-0 items-center justify-center border border-cyan-300/32 bg-cyan-400/10 text-[14px] font-bold text-cyan-50"
                  style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
                  {...tooltipAttrs({
                    rows: [
                      { label: '排序依据', value: '预警数优先，效率值次序' },
                      { label: '当前排名', value: `第 ${index + 1} 名` },
                      { label: '效率得分', value: `${summary.efficiencyScore}` },
                    ],
                    title: '排名计算依据',
                  })}
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-bold text-cyan-50">
                    {summary.buildingId}
                  </div>
                  <div className="text-[13px] text-cyan-100/62">效率 {summary.efficiencyScore}</div>
                </div>
              </div>
              <div
                className="text-xl font-bold text-[#FF4D6D]"
                style={{ fontFamily: DASHBOARD_FONTS.num }}
              >
                <AnimatedNumber value={summary.warningCount} />
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden bg-cyan-950/80">
              <div
                className="risk-row-progress h-full bg-[linear-gradient(90deg,#FF4D6D_0%,#FFB800_100%)] shadow-[0_0_14px_rgba(255,77,109,0.35)] transition-[width,filter] duration-700 ease-out"
                style={{ width: `${(summary.warningCount / maxWarningCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </HudPanel>
  )
}

function RelationshipScatterPanel({
  correlation,
  points,
  title,
  xAccessor,
  xLabel,
  yAccessor,
  yLabel,
}: {
  correlation: number
  points: MonitoringScatterPoint[]
  title: string
  xAccessor: (point: MonitoringScatterPoint) => number
  xLabel: string
  yAccessor: (point: MonitoringScatterPoint) => number
  yLabel: string
}) {
  const [hoveredTone, setHoveredTone] = useState<MonitoringScatterPoint['tone'] | null>(null)
  const [hiddenTones, setHiddenTones] = useState<Set<MonitoringScatterPoint['tone']>>(
    () => new Set(),
  )
  const [sampledPointId, setSampledPointId] = useState<number | null>(null)
  const [riskAreaHovered, setRiskAreaHovered] = useState(false)
  const [trendHovered, setTrendHovered] = useState(false)
  const trendProgress = useLoopProgress(4000)
  const chartWidth = 720
  const chartHeight = 330
  const padding = 42
  const visiblePoints = points.filter((point) => !hiddenTones.has(point.tone))
  const scatterPoints = buildScatterPoints(
    visiblePoints,
    chartWidth,
    chartHeight,
    padding,
    xAccessor,
    yAccessor,
  )
  const chartId = xLabel.includes('温度') || xLabel.includes('度') ? 'temperature' : 'occupancy'
  const trendId = `scatterTrend-${chartId}`
  const pointGlowId = `scatterPointGlow-${chartId}`
  const trendLine = buildTrendLine(scatterPoints, padding, chartWidth, chartHeight)
  const warningCount = points.filter(
    (point) => point.tone === 'amber' || point.tone === 'rose',
  ).length
  const riskSamples = points.filter(
    (point) => point.electricity > 170 && (xAccessor(point) > 70 || point.tone === 'rose'),
  ).length
  const trendTravelPoint = trendLine
    ? {
        x: trendLine.x1 + (trendLine.x2 - trendLine.x1) * trendProgress,
        y: trendLine.y1 + (trendLine.y2 - trendLine.y1) * trendProgress,
      }
    : null
  const toggleTone = (tone: MonitoringScatterPoint['tone']) => {
    setHiddenTones((current) => {
      const next = new Set(current)
      if (next.has(tone)) {
        next.delete(tone)
      } else {
        next.add(tone)
      }
      return next
    })
  }

  useIntervalTick(() => {
    if (visiblePoints.length === 0) return
    setSampledPointId(visiblePoints[randomInt(0, visiblePoints.length - 1)]!.id)
    window.setTimeout(() => setSampledPointId(null), 500)
  }, 2000)

  return (
    <HudPanel contentClassName="[&>div:first-child]:mb-2" divider={4} icon="relation" title={title}>
      <div className="mb-3 grid grid-cols-[1fr_auto] items-center gap-3">
        <div className="flex flex-wrap gap-2">
          <span
            className="inline-flex"
            {...tooltipAttrs({
              rows: [
                { label: '> 0.7', value: '强正相关' },
                { label: '0.4-0.7', value: '中等正相关' },
                { label: '< 0.4', value: '弱相关' },
              ],
              title: '相关强度解释',
            })}
          >
            <Pill tone="primary">{describeCorrelation(correlation)}</Pill>
          </span>
          <span
            className="inline-flex"
            {...tooltipAttrs({
              rows: [
                { label: '统计口径', value: '最近 48 条监测样本' },
                { label: '当前显示', value: `${visiblePoints.length} 条` },
              ],
              title: '样本数',
            })}
          >
            <Pill tone="neutral">样本 {points.length}</Pill>
          </span>
          <span
            className="inline-flex"
            {...tooltipAttrs({
              rows: [
                { label: '统计口径', value: '预警/实验高负荷采样点' },
                { label: '风险点数', tone: 'rose', value: `${warningCount} 个` },
              ],
              title: '风险点统计',
            })}
          >
            <Pill tone={warningCount > points.length * 0.35 ? 'amber' : 'emerald'}>
              风险点 {warningCount}
            </Pill>
          </span>
        </div>
        <div
          className="correlation-value text-right"
          {...tooltipAttrs({
            rows: [
              { label: '当前系数', value: correlation.toFixed(2) },
              {
                label: '解释',
                value: correlation > 0.7 ? '强正相关' : correlation > 0.4 ? '中等正相关' : '弱相关',
              },
              { label: '样本数', value: `${points.length}` },
            ],
            title: '相关系数说明',
          })}
        >
          <div
            className="text-[30px] font-bold leading-none text-cyan-50"
            style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
          >
            {correlation.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="tech-chart-frame relative p-3 pt-12">
        <div className="absolute right-4 top-3 z-10 flex flex-wrap justify-end gap-2 text-[14px] font-semibold text-cyan-100/82">
          {[
            { label: '办公', color: DASHBOARD_COLORS.primary, tone: 'sky' as const },
            { label: '教学', color: DASHBOARD_COLORS.emerald, tone: 'emerald' as const },
            { label: '实验', color: DASHBOARD_COLORS.amber, tone: 'amber' as const },
            { label: '预警', color: DASHBOARD_COLORS.rose, tone: 'rose' as const },
          ].map((item) => (
            <button
              className="scatter-legend inline-flex items-center gap-1.5 border border-cyan-300/24 bg-[#041527]/84 px-2.5 py-1.5 backdrop-blur-md"
              data-hidden={hiddenTones.has(item.tone) ? 'true' : undefined}
              key={item.label}
              onClick={() => toggleTone(item.tone)}
              onPointerEnter={() => setHoveredTone(item.tone)}
              onPointerLeave={() => setHoveredTone(null)}
              type="button"
              {...tooltipAttrs({
                rows: [
                  { label: '交互', value: '悬停高亮，同类联动' },
                  {
                    label: '点击',
                    value: hiddenTones.has(item.tone) ? '恢复显示该类型' : '临时隐藏该类型',
                  },
                ],
                title: `${item.label}图例`,
              })}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </button>
          ))}
        </div>
        <svg
          className="block h-auto w-full"
          preserveAspectRatio="xMidYMid meet"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        >
          <defs>
            <pattern
              height="18"
              id={`${chartId}-microGrid`}
              patternUnits="userSpaceOnUse"
              width="18"
            >
              <path
                d="M 18 0 L 0 0 0 18"
                fill="none"
                stroke="rgba(122,247,255,0.055)"
                strokeWidth="1"
              />
            </pattern>
            <linearGradient id={trendId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.15" />
              <stop offset="48%" stopColor="#7AF7FF" />
              <stop offset="100%" stopColor="#FFB800" />
            </linearGradient>
            <filter id={pointGlowId} x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur result="blur" stdDeviation="2.2" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect
            fill="rgba(2, 8, 23, 0.32)"
            height={chartHeight - padding * 2}
            rx="14"
            width={chartWidth - padding * 2}
            x={padding}
            y={padding}
          />
          <rect
            fill={`url(#${chartId}-microGrid)`}
            height={chartHeight - padding * 2}
            rx="14"
            width={chartWidth - padding * 2}
            x={padding}
            y={padding}
          />
          <rect
            fill="rgba(0, 212, 255, 0.04)"
            height={(chartHeight - padding * 2) / 2}
            width={(chartWidth - padding * 2) / 2}
            x={padding}
            y={padding}
          />
          <rect
            className="scatter-risk-area"
            data-hovered={riskAreaHovered ? 'true' : undefined}
            fill="rgba(255, 184, 0, 0.055)"
            height={(chartHeight - padding * 2) / 2}
            onPointerEnter={() => setRiskAreaHovered(true)}
            onPointerLeave={() => setRiskAreaHovered(false)}
            width={(chartWidth - padding * 2) / 2}
            x={padding + (chartWidth - padding * 2) / 2}
            y={padding}
            {...tooltipAttrs({
              rows: [
                { label: '定义', value: '高能耗且高人流/高温区' },
                { label: '区内样本数', value: `${riskSamples}` },
                {
                  label: '风险点占比',
                  tone: 'amber',
                  value: `${((riskSamples / Math.max(points.length, 1)) * 100).toFixed(1)}%`,
                },
              ],
              title: '高风险区域',
            })}
          />
          <rect
            fill="rgba(34, 211, 160, 0.045)"
            height={(chartHeight - padding * 2) / 2}
            width={(chartWidth - padding * 2) / 2}
            x={padding}
            y={padding + (chartHeight - padding * 2) / 2}
          />

          {[0, 1, 2, 3, 4, 5].map((index) => {
            const y = padding + ((chartHeight - padding * 2) / 5) * index
            return (
              <line
                key={`y-${y}`}
                stroke="rgba(122,247,255,0.18)"
                strokeDasharray={index === 0 || index === 5 ? '0' : '7 9'}
                x1={padding}
                x2={chartWidth - padding}
                y1={y}
                y2={y}
              />
            )
          })}

          {[0, 1, 2, 3, 4, 5].map((index) => {
            const x = padding + ((chartWidth - padding * 2) / 5) * index
            return (
              <line
                key={`x-${x}`}
                stroke="rgba(122,247,255,0.14)"
                strokeDasharray={index === 0 || index === 5 ? '0' : '7 9'}
                x1={x}
                x2={x}
                y1={padding}
                y2={chartHeight - padding}
              />
            )
          })}

          {trendLine ? (
            <>
              <line
                className="scatter-trend-hit"
                stroke="rgba(0,212,255,0.18)"
                strokeLinecap="round"
                strokeWidth="12"
                onPointerEnter={() => setTrendHovered(true)}
                onPointerLeave={() => setTrendHovered(false)}
                x1={trendLine.x1}
                x2={trendLine.x2}
                y1={trendLine.y1}
                y2={trendLine.y2}
                {...tooltipAttrs({
                  rows: [
                    { label: '相关系数', value: correlation.toFixed(2) },
                    { label: '拟合公式', value: 'y = ax + b' },
                    { label: '样本数', value: `${visiblePoints.length}` },
                  ],
                  title: '趋势线说明',
                })}
              />
              <line
                className="scatter-trend-line"
                data-hovered={trendHovered ? 'true' : undefined}
                stroke={`url(#${trendId})`}
                strokeLinecap="round"
                strokeWidth={trendHovered ? 6 : 4}
                x1={trendLine.x1}
                x2={trendLine.x2}
                y1={trendLine.y1}
                y2={trendLine.y2}
              />
              {trendTravelPoint ? (
                <circle
                  className="scatter-trend-traveler"
                  cx={trendTravelPoint.x}
                  cy={trendTravelPoint.y}
                  fill="#7AF7FF"
                  r="5"
                />
              ) : null}
            </>
          ) : null}

          {scatterPoints.map(({ item, x, y }) => {
            const sameToneHovered = hoveredTone === item.tone
            const otherToneDimmed = hoveredTone !== null && hoveredTone !== item.tone
            const riskPoint =
              item.electricity > 170 && (xAccessor(item) > 70 || item.tone === 'rose')
            const shouldGlowRisk = riskAreaHovered && riskPoint

            return (
              <g
                className="scatter-point-group"
                data-dimmed={
                  otherToneDimmed || (riskAreaHovered && !riskPoint) ? 'true' : undefined
                }
                data-highlighted={sameToneHovered || shouldGlowRisk ? 'true' : undefined}
                data-sampled={sampledPointId === item.id ? 'true' : undefined}
                data-tone={item.tone}
                key={item.id}
                onPointerEnter={() => setHoveredTone(item.tone)}
                onPointerLeave={() => setHoveredTone(null)}
                {...tooltipAttrs(scatterTooltip(item, xLabel))}
              >
                <circle
                  cx={x}
                  cy={y}
                  fill={scatterToneFill(item.tone)}
                  opacity={item.tone === 'rose' ? '0.18' : '0.1'}
                  r={item.tone === 'rose' ? 15 : 11}
                />
                <circle
                  className="scatter-point-core"
                  cx={x}
                  cy={y}
                  fill={scatterToneFill(item.tone)}
                  filter={`url(#${pointGlowId})`}
                  opacity="0.9"
                  r={
                    sameToneHovered || shouldGlowRisk
                      ? (item.tone === 'rose' ? 6.8 : item.tone === 'amber' ? 5.9 : 5.2) * 1.6
                      : item.tone === 'rose'
                        ? 6.8
                        : item.tone === 'amber'
                          ? 5.9
                          : 5.2
                  }
                  stroke="rgba(221,251,255,0.9)"
                  strokeWidth="1.35"
                />
              </g>
            )
          })}

          <text className="fill-cyan-100/74 text-[14px] font-semibold" x={padding} y={padding - 10}>
            {yLabel}
          </text>
          <text
            className="fill-cyan-100/74 text-[14px] font-semibold"
            x={padding}
            y={chartHeight - 9}
          >
            {xLabel}
          </text>
        </svg>
        <div className="absolute right-4 bottom-4 grid grid-cols-2 gap-2 text-right">
          <div
            className="scatter-stat-card border border-cyan-300/24 bg-[#041527]/76 px-3 py-2 backdrop-blur-md"
            {...tooltipAttrs({
              rows: [
                { label: '统计口径', value: '最近 48 条采样记录' },
                { label: '隐藏后显示', value: `${visiblePoints.length} 条` },
              ],
              title: '样本数统计',
            })}
          >
            <div className="text-[13px] font-semibold text-cyan-100/70">样本数</div>
            <AnimatedNumber
              className="text-lg font-bold text-cyan-50"
              style={{ fontFamily: DASHBOARD_FONTS.num }}
              value={points.length}
            />
          </div>
          <div
            className="scatter-stat-card border border-cyan-300/24 bg-[#041527]/76 px-3 py-2 backdrop-blur-md"
            {...tooltipAttrs({
              rows: [
                { label: '统计口径', value: '预警或高负荷风险样本' },
                { label: '风险点', tone: 'rose', value: `${warningCount} 个` },
              ],
              title: '风险点统计',
            })}
          >
            <div className="text-[13px] font-semibold text-cyan-100/70">风险点</div>
            <AnimatedNumber
              className="text-lg font-bold text-[#FF4D6D]"
              style={{ fontFamily: DASHBOARD_FONTS.num }}
              value={warningCount}
            />
          </div>
        </div>
      </div>
    </HudPanel>
  )
}

function HeatmapPanel({ heatmap }: { heatmap: MonitoringHeatmapCell[] }) {
  const [hoveredHeatmap, setHoveredHeatmap] = useState<{
    date?: string
    hour?: string
    mode: 'cell' | 'column' | 'row'
  } | null>(null)
  const [sampledCellKey, setSampledCellKey] = useState<string | null>(null)
  const dates = [...new Set(heatmap.map((item) => item.date))]
  const hours = [...new Set(heatmap.map((item) => item.hour))]
  const peakElectricity = Math.max(...heatmap.map((item) => item.electricity), 1)
  const averageElectricity =
    heatmap.reduce((sum, item) => sum + item.electricity, 0) / Math.max(heatmap.length, 1)
  const peakCell = heatmap.reduce(
    (best, item) => (item.electricity > best.electricity ? item : best),
    heatmap[0] ?? { date: '-', electricity: 0, hour: '--:--', intensity: 0, occupancy: 0 },
  )

  useIntervalTick(() => {
    if (heatmap.length === 0) return
    const cell = heatmap[randomInt(0, heatmap.length - 1)]!
    setSampledCellKey(`${cell.date}-${cell.hour}`)
    window.setTimeout(() => setSampledCellKey(null), 600)
  }, 3000)

  return (
    <HudPanel
      className="data-analysis-heatmap-panel"
      contentClassName="flex h-full flex-col [&>div:first-child]:mb-3"
      divider={5}
      icon="heatmap"
      title="时段热力矩阵"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '峰值时段', value: `${peakCell.date} ${peakCell.hour}`, tone: '#FFB800' },
            { label: '峰值电耗', value: `${peakCell.electricity.toFixed(0)} kWh`, tone: '#00D4FF' },
            { label: '均值电耗', value: `${averageElectricity.toFixed(0)} kWh`, tone: '#22D3A0' },
          ].map((item) => (
            <div
              className="heatmap-metric-card border border-cyan-300/24 bg-cyan-950/20 px-3 py-2"
              key={item.label}
              {...tooltipAttrs({
                rows: [
                  {
                    label: '计算口径',
                    value:
                      item.label === '均值电耗' ? '7 天 × 4 时段算术平均' : '当前矩阵最高单元格',
                  },
                  { label: '详细数值', value: item.value },
                  { label: '刷新周期', value: '历史快照，不自动刷新' },
                ],
                title: item.label,
              })}
            >
              <div className="text-[13px] font-semibold text-cyan-100/62">{item.label}</div>
              <div
                className="mt-1 truncate text-[17px] font-bold leading-none"
                style={{ color: item.tone, fontFamily: DASHBOARD_FONTS.num }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div className="tech-chart-frame relative min-h-0 flex-1 p-3">
          <div className="grid h-full grid-cols-[64px_1fr] grid-rows-[28px_1fr_22px] gap-2">
            <div />
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}
            >
              {hours.map((hour) => {
                const columnCells = heatmap.filter((cell) => cell.hour === hour)
                const maxCell = columnCells.reduce(
                  (best, cell) => (cell.electricity > best.electricity ? cell : best),
                  columnCells[0] ?? { date: '-', electricity: 0, hour, intensity: 0, occupancy: 0 },
                )
                const minCell = columnCells.reduce(
                  (best, cell) => (cell.electricity < best.electricity ? cell : best),
                  columnCells[0] ?? { date: '-', electricity: 0, hour, intensity: 0, occupancy: 0 },
                )
                const avg =
                  columnCells.reduce((sum, cell) => sum + cell.electricity, 0) /
                  Math.max(columnCells.length, 1)

                return (
                  <div
                    className="heatmap-axis-label text-center text-[13px] font-bold tracking-[0.06em] text-cyan-100/70"
                    key={hour}
                    onPointerEnter={() => setHoveredHeatmap({ hour, mode: 'column' })}
                    onPointerLeave={() => setHoveredHeatmap(null)}
                    {...tooltipAttrs({
                      rows: [
                        { label: '7 天均值', value: compactKwh(avg) },
                        {
                          label: '最高日',
                          value: `${maxCell.date} ${compactKwh(maxCell.electricity)}`,
                        },
                        {
                          label: '最低日',
                          value: `${minCell.date} ${compactKwh(minCell.electricity)}`,
                        },
                      ],
                      title: `${hour} 列统计`,
                    })}
                  >
                    {hour}
                  </div>
                )
              })}
            </div>

            <div
              className="grid gap-2"
              style={{ gridTemplateRows: `repeat(${dates.length}, minmax(0, 1fr))` }}
            >
              {dates.map((date) => {
                const rowCells = heatmap.filter((cell) => cell.date === date)
                const total = rowCells.reduce((sum, cell) => sum + cell.electricity, 0)
                const maxCell = rowCells.reduce(
                  (best, cell) => (cell.electricity > best.electricity ? cell : best),
                  rowCells[0] ?? { date, electricity: 0, hour: '-', intensity: 0, occupancy: 0 },
                )

                return (
                  <div
                    className="heatmap-axis-label flex items-center justify-end pr-2 text-[13px] font-semibold text-cyan-100/68"
                    key={date}
                    onPointerEnter={() => setHoveredHeatmap({ date, mode: 'row' })}
                    onPointerLeave={() => setHoveredHeatmap(null)}
                    {...tooltipAttrs({
                      rows: [
                        { label: '当日总能耗', value: compactKwh(total) },
                        {
                          label: '峰值时段',
                          value: `${maxCell.hour} ${compactKwh(maxCell.electricity)}`,
                        },
                      ],
                      title: `${date} 行统计`,
                    })}
                  >
                    {date}
                  </div>
                )
              })}
            </div>

            <div
              className="heatmap-grid-body relative grid gap-2 overflow-hidden"
              style={{
                gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${dates.length}, minmax(0, 1fr))`,
              }}
            >
              {dates.flatMap((date) =>
                hours.map((hour) => {
                  const cell = heatmap.find((item) => item.date === date && item.hour === hour)
                  const intensity = cell?.intensity ?? 0
                  const value = cell?.electricity ?? 0
                  const occupancy = cell?.occupancy ?? 0
                  const isPeak = value === peakElectricity
                  const isHovered =
                    hoveredHeatmap?.mode === 'cell' &&
                    hoveredHeatmap.date === date &&
                    hoveredHeatmap.hour === hour
                  const isRelated =
                    hoveredHeatmap !== null &&
                    ((hoveredHeatmap.date === date && hoveredHeatmap.mode !== 'column') ||
                      (hoveredHeatmap.hour === hour && hoveredHeatmap.mode !== 'row'))
                  const isDimmed = hoveredHeatmap !== null && !isHovered && !isRelated
                  const hue =
                    intensity > 0.82 ? '255,184,0' : intensity > 0.66 ? '34,211,160' : '0,212,255'
                  const alpha = clamp(0.16 + intensity * 0.58, 0.16, 0.74)

                  return (
                    <div
                      className={cn(
                        'heatmap-cell group relative min-h-[26px] overflow-hidden border bg-[#061829]/88 p-1.5 transition-all duration-200 hover:z-10',
                        isPeak
                          ? 'border-[#FFB800]/78 shadow-[0_0_16px_rgba(255,184,0,0.25)]'
                          : 'border-cyan-300/18',
                      )}
                      data-dimmed={isDimmed ? 'true' : undefined}
                      data-hovered={isHovered ? 'true' : undefined}
                      data-peak={isPeak ? 'true' : undefined}
                      data-related={isRelated ? 'true' : undefined}
                      data-sampled={sampledCellKey === `${date}-${hour}` ? 'true' : undefined}
                      key={`${date}-${hour}`}
                      onPointerEnter={() => setHoveredHeatmap({ date, hour, mode: 'cell' })}
                      onPointerLeave={() => setHoveredHeatmap(null)}
                      {...tooltipAttrs(
                        heatmapCellTooltip(
                          cell ?? { date, electricity: value, hour, intensity, occupancy },
                        ),
                      )}
                    >
                      <div
                        className="absolute inset-0 opacity-90"
                        style={{
                          background: `linear-gradient(135deg, rgba(${hue},${alpha}) 0%, rgba(${hue},${alpha * 0.46}) 42%, rgba(3,21,38,0.18) 100%)`,
                        }}
                      />
                      <div
                        className="absolute inset-x-1 bottom-1 h-1 bg-cyan-950/70"
                        style={{
                          boxShadow: `inset ${Math.round(intensity * 100)}px 0 0 rgba(${hue},0.82)`,
                        }}
                      />
                      <div className="relative flex h-full min-h-[44px] flex-col justify-between">
                        <span className="text-[11px] font-semibold text-cyan-50/72">
                          {Math.round(intensity * 100)}
                        </span>
                        <span
                          className="text-right text-[18px] font-bold leading-none text-cyan-50"
                          style={{ fontFamily: DASHBOARD_FONTS.num }}
                        >
                          <AnimatedNumber value={value} />
                        </span>
                      </div>
                    </div>
                  )
                }),
              )}
            </div>

            <div />
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-cyan-100/54">低负荷</span>
              <div className="heatmap-scale relative h-2 w-36 bg-[linear-gradient(90deg,rgba(0,212,255,0.2),rgba(0,212,255,0.72),rgba(34,211,160,0.78),rgba(255,184,0,0.9))] shadow-[0_0_10px_rgba(0,212,255,0.18)]" />
              <span className="text-[12px] font-semibold text-cyan-100/74">高负荷</span>
            </div>
          </div>
        </div>
      </div>
    </HudPanel>
  )
}

function CompositionPanel({
  composition,
  statusDistribution,
}: {
  composition: MonitoringCompositionItem[]
  statusDistribution: MonitoringStatusBucket[]
}) {
  const [hoveredComposition, setHoveredComposition] = useState<string | null>(null)
  const total = composition.reduce((sum, item) => sum + item.value, 0)
  const maxCompositionValue = Math.max(...composition.map((item) => item.value), 1)
  let currentAngle = -88
  const compositionArcs = composition.map((item, index) => {
    const angle = total === 0 ? 0 : (item.value / total) * 360
    const gap = 2.2
    const startAngle = currentAngle + gap / 2
    const endAngle = currentAngle + angle - gap / 2
    currentAngle += angle
    const midAngle = (startAngle + endAngle) / 2
    const lift = polarToCartesian(0, 0, 5, midAngle)
    const ratio = total === 0 ? 0 : (item.value / total) * 100

    return {
      ...item,
      endAngle,
      gradientId: `compositionGradient-${index}`,
      highlightId: `compositionHighlight-${index}`,
      lift,
      midAngle,
      ratio,
      startAngle,
    }
  })

  return (
    <HudPanel
      className="data-analysis-composition-panel min-h-0"
      contentClassName="flex h-full flex-col [&>div:first-child]:mb-3"
      divider={6}
      icon="composition"
      title="本月构成占比"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-center py-1">
          <div className="relative h-52 w-52">
            <svg
              className="h-full w-full overflow-visible drop-shadow-[0_0_22px_rgba(0,212,255,0.24)]"
              viewBox="0 0 220 220"
            >
              <defs>
                <filter id="compositionSegmentGlow" x="-35%" y="-35%" width="170%" height="170%">
                  <feGaussianBlur result="blur" stdDeviation="3" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <radialGradient id="compositionCoreGlow" cx="50%" cy="45%" r="58%">
                  <stop offset="0%" stopColor="#7AF7FF" stopOpacity="0.28" />
                  <stop offset="62%" stopColor="#00D4FF" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#061829" stopOpacity="0.95" />
                </radialGradient>
                {compositionArcs.map((arc) => (
                  <linearGradient
                    id={arc.gradientId}
                    key={arc.gradientId}
                    x1="0"
                    x2="1"
                    y1="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={arc.color} stopOpacity="0.5" />
                    <stop offset="52%" stopColor={arc.color} stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#E8F4FF" stopOpacity="0.82" />
                  </linearGradient>
                ))}
                {compositionArcs.map((arc) => (
                  <linearGradient
                    id={arc.highlightId}
                    key={arc.highlightId}
                    x1="0"
                    x2="1"
                    y1="0"
                    y2="0"
                  >
                    <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
                    <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.56" />
                    <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                  </linearGradient>
                ))}
              </defs>

              <circle
                cx="110"
                cy="110"
                fill="none"
                r="94"
                stroke="rgba(0,212,255,0.1)"
                strokeWidth="16"
              />
              <circle
                className="composition-scan-arc"
                cx="110"
                cy="110"
                fill="none"
                r="103"
                stroke="#7AF7FF"
                strokeDasharray="42 606"
                strokeLinecap="round"
                strokeWidth="3"
              />
              <circle
                cx="110"
                cy="110"
                fill="none"
                r="70"
                stroke="rgba(122,247,255,0.11)"
                strokeDasharray="5 9"
                strokeWidth="4"
              />

              {compositionArcs.map((arc) => {
                const isHovered = hoveredComposition === arc.label
                const isDimmed = hoveredComposition !== null && !isHovered

                return (
                  <g
                    className="composition-segment group transition-transform duration-200 ease-out"
                    data-dimmed={isDimmed ? 'true' : undefined}
                    data-hovered={isHovered ? 'true' : undefined}
                    key={arc.label}
                    onPointerEnter={() => setHoveredComposition(arc.label)}
                    onPointerLeave={() => setHoveredComposition(null)}
                    style={
                      {
                        '--lift-x': `${arc.lift.x}px`,
                        '--lift-y': `${arc.lift.y}px`,
                      } as CSSProperties
                    }
                    {...tooltipAttrs(compositionTooltip(arc, arc.ratio))}
                  >
                    <path
                      d={describeDonutArc(110, 110, 92, 62, arc.startAngle, arc.endAngle)}
                      fill={`url(#${arc.gradientId})`}
                      filter="url(#compositionSegmentGlow)"
                      stroke="rgba(221,251,255,0.42)"
                      strokeWidth="1.2"
                    />
                    <path
                      className="opacity-45 transition-opacity duration-200 group-hover:opacity-95"
                      d={describeDonutArc(110, 110, 94, 88, arc.startAngle + 3, arc.endAngle - 3)}
                      fill={`url(#${arc.highlightId})`}
                    />
                    <path
                      d={describeDonutArc(110, 110, 56, 47, arc.startAngle, arc.endAngle)}
                      fill={arc.color}
                      opacity="0.34"
                      stroke={arc.color}
                      strokeOpacity="0.52"
                    />
                  </g>
                )
              })}

              <circle
                className="origin-center animate-[composition-core-pulse_2.8s_ease-in-out_infinite]"
                cx="110"
                cy="110"
                fill="url(#compositionCoreGlow)"
                r="49"
                stroke="rgba(122,247,255,0.32)"
                strokeWidth="1.4"
              />
              <circle
                cx="110"
                cy="110"
                fill="none"
                r="38"
                stroke="rgba(0,212,255,0.26)"
                strokeDasharray="3 7"
                strokeWidth="1"
              />
            </svg>
            <div
              className="absolute inset-0 flex items-center justify-center text-center"
              {...tooltipAttrs({
                rows: [
                  { label: '统计周期', value: '本月累计' },
                  { label: '同比', tone: 'cyan', value: '+5.2%' },
                  { label: '环比', tone: 'amber', value: '+1.8%' },
                ],
                title: '本月总量基准',
              })}
            >
              <div>
                <AnimatedNumber
                  className="text-3xl font-bold leading-none text-cyan-50 drop-shadow-[0_0_14px_rgba(122,247,255,0.58)]"
                  style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
                  value={
                    hoveredComposition
                      ? (composition.find((item) => item.label === hoveredComposition)?.value ??
                        total)
                      : Math.round(total)
                  }
                />
                <div className="mt-1 text-[13px] font-semibold tracking-[0.06em] text-cyan-100/68">
                  {hoveredComposition ?? '本月累计'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {composition.map((item) => {
            const ratio = total === 0 ? 0 : (item.value / total) * 100
            const width = (item.value / maxCompositionValue) * 100

            return (
              <div
                className="composition-legend-item min-w-0 border border-cyan-300/24 bg-cyan-950/20 px-2.5 py-2"
                data-linked={hoveredComposition === item.label ? 'true' : undefined}
                key={item.label}
                onPointerEnter={() => setHoveredComposition(item.label)}
                onPointerLeave={() => setHoveredComposition(null)}
                {...tooltipAttrs(compositionTooltip(item, ratio))}
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-[14px] text-cyan-50/86">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full shadow-[0_0_10px_currentColor]"
                      style={{ backgroundColor: item.color, color: item.color }}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span
                    className="shrink-0 text-sm font-bold text-cyan-50"
                    style={{ fontFamily: DASHBOARD_FONTS.num }}
                  >
                    {item.value.toFixed(0)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden bg-cyan-950/80">
                    <div
                      className="h-full shadow-[0_0_14px_currentColor]"
                      style={{ backgroundColor: item.color, color: item.color, width: `${width}%` }}
                    />
                  </div>
                  <span
                    className="w-10 text-right text-[12px] font-semibold text-cyan-100/70"
                    style={{ fontFamily: DASHBOARD_FONTS.num }}
                  >
                    {ratio.toFixed(1)}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {statusDistribution.map((bucket) => (
            <div
              className="border border-cyan-300/24 bg-cyan-950/20 px-3 py-1.5"
              key={bucket.label}
            >
              <div className="flex items-center gap-2 text-[14px] text-cyan-100/74">
                <span className={cn('h-2 w-2 rounded-full', statusToneClassName(bucket.tone))} />
                {bucket.label}
              </div>
              <div
                className="mt-0.5 text-lg font-bold leading-none text-cyan-50"
                style={{ fontFamily: DASHBOARD_FONTS.num }}
              >
                {bucket.count}
              </div>
            </div>
          ))}
        </div>
      </div>
    </HudPanel>
  )
}

function DetailTable({
  model,
  sampleCount,
  sampleRate,
}: {
  model: MonitoringAnalyticsModel
  sampleCount: number
  sampleRate: number
}) {
  const headers = [
    { align: 'text-left', label: '楼栋', meaning: '楼栋唯一编号' },
    { align: 'text-left', label: '时间', meaning: '监测采样时间' },
    { align: 'text-right', label: '电耗', meaning: '当前时段电耗，单位 kWh' },
    { align: 'text-right', label: '暖通', meaning: 'HVAC 系统电耗，单位 kWh' },
    { align: 'text-right', label: '用水', meaning: '当前时段用水量，单位 m³' },
    { align: 'text-right', label: '温度', meaning: '环境温度，单位 °C' },
    { align: 'text-right', label: '湿度', meaning: '环境湿度，单位 %' },
    { align: 'text-right', label: '人流', meaning: '人员活跃指数' },
    { align: 'text-left', label: '设备', meaning: '关联采集设备 ID' },
    { align: 'text-center', label: '状态', meaning: '设备运行状态' },
  ]

  return (
    <HudPanel
      divider={2}
      icon="records"
      size="large"
      title="近期监测明细"
      contentClassName="[&>div:first-child]:mb-3"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-[13px] font-bold text-emerald-100">
          <span className="table-live-dot" />
          实时
        </div>
        <div className="detail-live-counter text-right text-[13px] font-semibold text-cyan-100/72">
          今日已采集{' '}
          <AnimatedNumber
            className="text-cyan-50"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
            value={sampleCount}
          />{' '}
          条 · 当前速率{' '}
          <AnimatedNumber
            className="text-cyan-50"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
            value={sampleRate}
          />{' '}
          条/分钟
        </div>
      </div>
      <div className="overflow-hidden border border-cyan-300/36 bg-cyan-950/20 shadow-[0_0_16px_rgba(0,212,255,0.12)]">
        <table
          className="w-full table-fixed text-[17px] text-cyan-50/88"
          style={{ fontFamily: DASHBOARD_FONTS.cn }}
        >
          <colgroup>
            <col className="w-[12%]" />
            <col className="w-[15%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[20%]" />
            <col className="w-[9%]" />
          </colgroup>
          <thead className="bg-cyan-950/80 text-[18px] font-black tracking-[0.06em] text-cyan-50">
            <tr>
              {headers.map((header, index) => (
                <th
                  className={cn(
                    'detail-table-head px-4 py-4',
                    index === 0 || index === 1 || index === 8 ? 'px-5' : undefined,
                    header.align,
                  )}
                  key={header.label}
                  {...tooltipAttrs({
                    rows: [
                      { label: '列含义', value: header.meaning },
                      { label: '交互', value: '支持悬停查看字段详情' },
                    ],
                    title: `${header.label}列`,
                  })}
                >
                  <span>{header.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.recentRecords.slice(0, 12).map((record, index) => (
              <tr
                className="detail-table-row border-t border-cyan-300/18"
                data-new={index === 0 ? 'true' : undefined}
                data-warning={
                  index === 0 && record.device_status === 'warning' ? 'true' : undefined
                }
                key={record.id}
                {...tooltipAttrs(tableRowTooltip(record))}
              >
                <td className="px-5 py-4 font-semibold text-cyan-50">{record.building_id}</td>
                <td className="truncate px-5 py-4">
                  <span className="inline-flex items-center gap-2">
                    {record.monitor_time}
                    {index === 0 ? <span className="new-data-badge" /> : null}
                  </span>
                </td>
                {[
                  {
                    label: '电耗',
                    suffix: '',
                    value: record.electricity_kwh,
                    rows: [
                      { label: '阈值范围', value: '70-180 kWh' },
                      { label: '当前异常', value: record.electricity_kwh > 180 ? '是' : '否' },
                      { label: '历史均值', value: compactKwh(record.electricity_kwh * 0.88) },
                    ],
                  },
                  {
                    label: '暖通',
                    suffix: '',
                    value: record.hvac_kwh,
                    rows: [
                      { label: '阈值范围', value: '25-95 kWh' },
                      { label: '当前异常', value: record.hvac_kwh > 95 ? '是' : '否' },
                      { label: '历史均值', value: compactKwh(record.hvac_kwh * 0.9) },
                    ],
                  },
                  {
                    label: '用水',
                    suffix: '',
                    value: record.water_m3,
                    rows: [
                      { label: '阈值范围', value: '5-28 m³' },
                      { label: '当前异常', value: record.water_m3 > 28 ? '是' : '否' },
                      { label: '历史均值', value: `${formatNumber(record.water_m3 * 0.92)} m³` },
                    ],
                  },
                  {
                    label: '温度',
                    suffix: '°C',
                    value: record.env_temperature,
                    rows: [
                      { label: '阈值范围', value: '22-28°C' },
                      { label: '当前异常', value: record.env_temperature > 28 ? '是' : '否' },
                      {
                        label: '历史均值',
                        value: `${formatNumber(record.env_temperature * 0.96)}°C`,
                      },
                    ],
                  },
                  {
                    label: '湿度',
                    suffix: '%',
                    value: record.env_humidity,
                    rows: [
                      { label: '阈值范围', value: '40-65%' },
                      { label: '当前异常', value: record.env_humidity > 65 ? '是' : '否' },
                      { label: '历史均值', value: `${formatNumber(record.env_humidity * 0.96)}%` },
                    ],
                  },
                  {
                    label: '人流',
                    suffix: '',
                    value: record.occupancy_density,
                    rows: [
                      { label: '阈值范围', value: '0-90' },
                      { label: '当前异常', value: record.occupancy_density > 90 ? '是' : '否' },
                      { label: '历史均值', value: formatNumber(record.occupancy_density * 0.88) },
                    ],
                  },
                ].map((cell) => (
                  <td
                    className="detail-table-value px-4 py-4 text-right"
                    key={cell.label}
                    {...tooltipAttrs({
                      rows: cell.rows,
                      title: `${cell.label}指标`,
                    })}
                  >
                    <AnimatedNumber decimals={1} suffix={cell.suffix} value={cell.value} />
                  </td>
                ))}
                <td className="truncate px-5 py-4">{record.device_id}</td>
                <td className="px-5 py-4 text-center">
                  <span
                    className={cn(
                      'detail-status-badge inline-flex min-w-16 justify-center rounded-full px-3 py-1.5 text-[15px] font-semibold text-[#020817]',
                      record.device_status === 'normal'
                        ? 'bg-[#22D3A0]'
                        : record.device_status === 'warning'
                          ? 'bg-[#FF4D6D]'
                          : record.device_status === 'maintenance'
                            ? 'bg-[#FFB800]'
                            : 'bg-cyan-100/50',
                    )}
                    {...tooltipAttrs({
                      rows: [
                        { label: '状态详情', value: statusReadable(record.device_status) },
                        {
                          label: '持续时长',
                          value: record.device_status === 'normal' ? '18 分钟' : '42 分钟',
                        },
                        {
                          label: '责任人',
                          value: record.device_status === 'warning' ? '运维一组' : '值班人员',
                        },
                        {
                          label: '处理建议',
                          value:
                            record.device_status === 'warning' ? '创建工单并复核阈值' : '持续监测',
                        },
                      ],
                      title: '状态说明',
                    })}
                  >
                    {record.device_status === 'normal'
                      ? '正常'
                      : record.device_status === 'warning'
                        ? '预警'
                        : record.device_status === 'maintenance'
                          ? '维护'
                          : '离线'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </HudPanel>
  )
}

export default function DataAnalysisWorkspace({ projectId }: DataAnalysisWorkspaceProps) {
  const realtime = useRealtimeMonitoringModel(projectId)
  const { model } = realtime

  return (
    <div className="relative h-full overflow-auto bg-[#020817]/35 text-cyan-50">
      <VideoBackground />
      <div className="cockpit-atmosphere" />
      <DashboardTooltipLayer />
      <RealtimeSyncWidget seconds={realtime.lastSyncSeconds} />
      <DashboardToastStack toasts={realtime.toasts} />

      <div className="relative z-10 flex w-full flex-col gap-4 px-5 pb-6 pt-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {model.metrics.map((metric, index) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </div>

        <div className="data-analysis-main-grid">
          <div className="data-analysis-column flex min-w-0 flex-col gap-4">
            <HealthGaugePanel model={model} />
            <PeakDevicePanel model={model} />
            <RiskLayerPanel model={model} />
          </div>

          <div className="data-analysis-column flex min-w-0 flex-col gap-4">
            <DailyLoadPanel model={model} />
            <HeatmapPanel heatmap={model.heatmap} />
          </div>

          <div className="data-analysis-column flex min-h-0 min-w-0 flex-col gap-4">
            <HourlyPatternPanel model={model} />
            <CompositionPanel
              composition={model.composition}
              statusDistribution={model.statusDistribution}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <RelationshipScatterPanel
            correlation={model.relationshipInsights.occupancyCorrelation}
            points={model.occupancyScatter}
            title="能耗与人流关系"
            xAccessor={(point) => point.occupancy}
            xLabel="人流指数"
            yAccessor={(point) => point.electricity}
            yLabel="能耗 kWh"
          />
          <RelationshipScatterPanel
            correlation={model.relationshipInsights.temperatureCorrelation}
            points={model.occupancyScatter}
            title="能耗与温度关系"
            xAccessor={(point) => point.temperature}
            xLabel="温度 °C"
            yAccessor={(point) => point.electricity}
            yLabel="能耗 kWh"
          />
        </div>

        <DetailTable
          model={model}
          sampleCount={realtime.sampleCount}
          sampleRate={realtime.sampleRate}
        />
      </div>
      <div
        className="issue-pill fixed bottom-4 left-4 z-30 flex items-center gap-2 rounded-full border border-[#FF4D8D]/55 bg-[#19091A]/88 px-3 py-2 text-[13px] font-bold text-[#FFD6E5] shadow-[0_0_18px_rgba(255,77,141,0.22)] backdrop-blur-md"
        {...tooltipAttrs({
          actions: ['立即处理', '忽略'],
          rows: [
            { label: '问题类型', value: '暖通能耗异常' },
            { label: '涉及楼栋', value: 'BLDG-C-07' },
            { label: '触发时间', value: '最近 24 小时' },
            { label: '严重等级', tone: 'rose', value: '高' },
            { label: '建议动作', value: '检查冷站策略与阀门开度' },
          ],
          title: '未处理问题详情',
        })}
      >
        <span className="issue-pill-badge flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF4D8D] px-1 text-[#020817]">
          1
        </span>
        <span>Issue</span>
      </div>
    </div>
  )
}
