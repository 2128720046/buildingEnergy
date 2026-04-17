'use client'

import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import type {
  MonitoringAnalyticsModel,
  MonitoringBuildingSummary,
  MonitoringCompositionItem,
  MonitoringFieldGlossaryItem,
  MonitoringHeatmapCell,
  MonitoringMetric,
  MonitoringPeakSnapshot,
  MonitoringScatterPoint,
  MonitoringStatusBucket,
} from '@/features/analytics/lib/monitoring-analytics'
import { buildMonitoringAnalyticsModel } from '@/features/analytics/lib/monitoring-analytics'
import type { HostQueryResult } from '@/features/energy-insights/lib/host-query'
import { cn } from '@/lib/utils'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
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

function toneClassName(tone: MonitoringMetric['tone']) {
  switch (tone) {
    case 'amber':
      return 'border-amber-200/80 bg-amber-50 text-amber-950'
    case 'emerald':
      return 'border-emerald-200/80 bg-emerald-50 text-emerald-950'
    case 'rose':
      return 'border-rose-200/80 bg-rose-50 text-rose-950'
    default:
      return 'border-sky-200/80 bg-sky-50 text-sky-950'
  }
}

function statusToneClassName(tone: MonitoringStatusBucket['tone']) {
  switch (tone) {
    case 'amber':
      return 'bg-amber-500'
    case 'emerald':
      return 'bg-emerald-500'
    case 'rose':
      return 'bg-rose-500'
    default:
      return 'bg-slate-500'
  }
}

function scatterToneFill(tone: MonitoringScatterPoint['tone']) {
  switch (tone) {
    case 'amber':
      return '#f59e0b'
    case 'emerald':
      return '#10b981'
    case 'rose':
      return '#f43f5e'
    default:
      return '#0ea5e9'
  }
}

function describeCorrelation(value: number) {
  const absolute = Math.abs(value)

  if (absolute >= 0.75) {
    return value >= 0 ? '强正相关' : '强负相关'
  }

  if (absolute >= 0.45) {
    return value >= 0 ? '中等正相关' : '中等负相关'
  }

  if (absolute >= 0.2) {
    return value >= 0 ? '弱正相关' : '弱负相关'
  }

  return '相关性较弱'
}

export interface DataAnalysisWorkspaceProps {
  projectId: string
  queryResults: HostQueryResult[]
  selectedComponentName: string
}

function MetricCard({ metric }: { metric: MonitoringMetric }) {
  return (
    <div
      className={cn(
        'rounded-[28px] border p-5 shadow-[0_18px_36px_rgba(15,23,42,0.06)]',
        toneClassName(metric.tone),
      )}
    >
      <div className="text-[11px] font-semibold tracking-[0.22em] uppercase opacity-70">
        Overview
      </div>
      <div className="mt-3 text-3xl font-semibold">{metric.value}</div>
      <div className="mt-2 text-sm font-medium opacity-85">{metric.label}</div>
      <div className="mt-2 text-xs leading-5 opacity-70">{metric.detail}</div>
    </div>
  )
}

function PeakSnapshotPanel({ peakSnapshot }: { peakSnapshot: MonitoringPeakSnapshot }) {
  const snapshotMetrics = [
    {
      label: '峰值能耗',
      value: `${peakSnapshot.electricity.toFixed(1)} kWh`,
    },
    {
      label: '环境温度',
      value: `${peakSnapshot.temperature.toFixed(1)}°C`,
    },
    {
      label: '环境湿度',
      value: `${peakSnapshot.humidity.toFixed(1)}%RH`,
    },
    {
      label: '人流指数',
      value: peakSnapshot.occupancy.toFixed(1),
    },
  ]

  return (
    <section className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,#fdfefe_0%,#f4f8ff_100%)] p-5 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Peak Snapshot
          </div>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">峰值时段快照</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            把最高能耗记录单独拎出来，快速看到楼栋、设备和环境条件。
          </p>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
          {peakSnapshot.monitorTime}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1">
          楼栋 {peakSnapshot.buildingId}
        </span>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1">
          设备 {peakSnapshot.deviceId}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {snapshotMetrics.map((metric) => (
          <div
            className="rounded-[22px] border border-white/80 bg-white/92 px-4 py-3 shadow-[0_12px_24px_rgba(15,23,42,0.04)]"
            key={metric.label}
          >
            <div className="text-xs text-slate-400">{metric.label}</div>
            <div className="mt-2 text-xl font-semibold text-slate-950">{metric.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-[22px] border border-slate-200 bg-white/80 px-4 py-3 text-sm leading-6 text-slate-600">
        这个时段建议优先核查 <span className="font-semibold text-slate-950">{peakSnapshot.buildingId}</span>{' '}
        的空调主机、新风联动和现场采集设备状态。
      </div>
    </section>
  )
}

function FieldGlossaryPreviewPanel({
  fieldGlossary,
}: {
  fieldGlossary: MonitoringFieldGlossaryItem[]
}) {
  const previewFields = [
    'electricity_kwh',
    'occupancy_density',
    'env_temperature',
    'chilled_water_return_temp',
  ]
    .map((field) => fieldGlossary.find((item) => item.field === field))
    .filter((item): item is MonitoringFieldGlossaryItem => item !== undefined)

  return (
    <section className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,#fffcf7_0%,#f8fbff_100%)] p-5 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Field Preview
          </div>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">关键字段速览</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            先展示几列最常用的监测字段，后面做接口联调时可以直接对照这组含义。
          </p>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
          共 {fieldGlossary.length} 个字段
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {previewFields.map((item) => (
          <div
            className="rounded-[22px] border border-slate-200/80 bg-white/92 px-4 py-3"
            key={item.field}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-950">{item.field}</div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                {item.dataType}
              </span>
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-500">{item.description}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1">water_m3</span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1">hvac_kwh</span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1">device_status</span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1">device_id</span>
      </div>
    </section>
  )
}

function ScorePanel({
  model,
  queryResults,
  selectedComponentName,
}: {
  model: MonitoringAnalyticsModel
  queryResults: HostQueryResult[]
  selectedComponentName: string
}) {
  const gaugeStyle = {
    backgroundImage: `conic-gradient(#2563eb 0deg ${(model.performanceScore / 100) * 360}deg, rgba(226,232,240,0.9) ${(model.performanceScore / 100) * 360}deg 360deg)`,
  } satisfies CSSProperties

  return (
    <section className="rounded-[36px] border border-white/80 bg-white/88 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.24em] text-slate-400 uppercase">
            Operation Health
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-slate-950">运行健康评分</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            结合人流-电耗相关性、暖通占比和预警时段，给出这一版分析看板的综合评分。
          </p>
        </div>

        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
          最近 12 天
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <div className="flex items-center justify-center">
          <div className="relative flex h-48 w-48 items-center justify-center rounded-full" style={gaugeStyle}>
            <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
              <div className="text-4xl font-semibold text-slate-950">{model.performanceScore}</div>
              <div className="mt-1 text-xs tracking-[0.16em] text-slate-400 uppercase">Score</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-400">高峰时段</div>
            <div className="mt-2 text-xl font-semibold text-slate-950">
              {model.relationshipInsights.peakHour}
            </div>
            <div className="mt-2 text-sm text-slate-500">能耗最集中的时间窗口</div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-400">人流高峰</div>
            <div className="mt-2 text-xl font-semibold text-slate-950">
              {model.relationshipInsights.busiestHour}
            </div>
            <div className="mt-2 text-sm text-slate-500">人员活动最密集的时间段</div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-400">电耗-人流关系</div>
            <div className="mt-2 text-xl font-semibold text-slate-950">
              {describeCorrelation(model.relationshipInsights.occupancyCorrelation)}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              系数 {model.relationshipInsights.occupancyCorrelation.toFixed(2)}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-400">当前关注</div>
            <div className="mt-2 truncate text-xl font-semibold text-slate-950">
              {selectedComponentName}
            </div>
            <div className="mt-2 text-sm text-slate-500">关联高耗能构件 {queryResults.length} 个</div>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {model.statusDistribution.map((bucket) => {
          const total = model.statusDistribution.reduce((sum, item) => sum + item.count, 0)
          const ratio = total === 0 ? 0 : (bucket.count / total) * 100

          return (
            <div key={bucket.label}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 text-slate-700">
                  <span className={cn('h-2.5 w-2.5 rounded-full', statusToneClassName(bucket.tone))} />
                  {bucket.label}
                </div>
                <div className="font-medium text-slate-950">
                  {bucket.count} 条 · {ratio.toFixed(1)}%
                </div>
              </div>
              <div className="mt-2 h-2.5 rounded-full bg-slate-100">
                <div
                  className={cn('h-2.5 rounded-full', statusToneClassName(bucket.tone))}
                  style={{ width: `${ratio}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function DailyLoadPanel({ model }: { model: MonitoringAnalyticsModel }) {
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

  return (
    <section className="rounded-[34px] border border-white/80 bg-white/90 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Daily Analysis
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">每日能耗与人流走势</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            用柱状图看每天的总能耗，再叠加人流趋势线，直接判断人流上升是否同步推高整体负荷。
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1">电耗柱状</span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">人流折线</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">12 天窗口</span>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,#f8fbff_0%,#eef6ff_100%)] p-4">
        <svg className="block h-auto w-full" preserveAspectRatio="xMidYMid meet" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          <defs>
            <linearGradient id="dailyOccupancyFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="dailyBarFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
          </defs>

          {[0, 1, 2, 3].map((index) => {
            const y = padding + ((chartHeight - padding * 2) / 3) * index
            return (
              <line
                key={y}
                stroke="rgba(148,163,184,0.22)"
                strokeDasharray="5 7"
                x1={padding}
                x2={chartWidth - padding}
                y1={y}
                y2={y}
              />
            )
          })}

          {electricityBars.map((bar) => (
            <rect
              fill="url(#dailyBarFill)"
              height={bar.height}
              key={`${bar.x}-${bar.height}`}
              rx="12"
              ry="12"
              width={bar.width}
              x={bar.x}
              y={bar.y}
            />
          ))}

          <path d={buildAreaPath(occupancyPoints, chartHeight, padding)} fill="url(#dailyOccupancyFill)" />
          <path
            d={buildLinePath(occupancyPoints)}
            fill="none"
            stroke="#22c55e"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3.5"
          />

          {occupancyPoints.map((point) => (
            <circle
              cx={point.x}
              cy={point.y}
              fill="#ffffff"
              key={`${point.x}-${point.y}`}
              r="5"
              stroke="#22c55e"
              strokeWidth="2.5"
            />
          ))}
        </svg>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500 md:grid-cols-4 xl:grid-cols-6">
          {model.dailySeries.map((point) => (
            <div className="rounded-2xl border border-white/80 bg-white/88 px-3 py-2" key={point.date}>
              <div>{point.date}</div>
              <div className="mt-2 font-semibold text-slate-950">{point.electricity.toFixed(1)} kWh</div>
              <div className="mt-1 text-slate-400">人流 {point.occupancy.toFixed(1)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HourlyPatternPanel({ model }: { model: MonitoringAnalyticsModel }) {
  const chartWidth = 460
  const chartHeight = 280
  const padding = 30
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
    <section className="rounded-[34px] border border-white/80 bg-white/90 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Time Relationship
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">能耗与时间关系</h2>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
          典型时段
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-400">电耗高峰</div>
          <div className="mt-2 text-xl font-semibold text-slate-950">
            {model.relationshipInsights.peakHour}
          </div>
        </div>
        <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-400">低谷时段</div>
          <div className="mt-2 text-xl font-semibold text-slate-950">
            {model.relationshipInsights.quietHour}
          </div>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,#fbfdff_0%,#f4f8ff_100%)] p-4">
        <svg className="block h-auto w-full" preserveAspectRatio="xMidYMid meet" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          <defs>
            <linearGradient id="hourlyBarFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
          </defs>

          {[0, 1, 2, 3].map((index) => {
            const y = padding + ((chartHeight - padding * 2) / 3) * index
            return (
              <line
                key={y}
                stroke="rgba(148,163,184,0.24)"
                strokeDasharray="5 7"
                x1={padding}
                x2={chartWidth - padding}
                y1={y}
                y2={y}
              />
            )
          })}

          {electricityBars.map((bar) => (
            <rect
              fill="url(#hourlyBarFill)"
              height={bar.height}
              key={`${bar.x}-${bar.height}`}
              rx="14"
              ry="14"
              width={bar.width}
              x={bar.x}
              y={bar.y}
            />
          ))}

          <path
            d={buildLinePath(occupancyPoints)}
            fill="none"
            stroke="#f59e0b"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />

          {occupancyPoints.map((point) => (
            <circle
              cx={point.x}
              cy={point.y}
              fill="#fff7ed"
              key={`${point.x}-${point.y}`}
              r="4.5"
              stroke="#f59e0b"
              strokeWidth="2.5"
            />
          ))}
        </svg>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500 sm:grid-cols-4">
          {model.hourlySeries.map((point) => (
            <div className="rounded-2xl border border-white/90 bg-white/88 px-3 py-2" key={point.hour}>
              <div>{point.hour}</div>
              <div className="mt-2 font-semibold text-slate-950">{point.electricity.toFixed(1)} kWh</div>
              <div className="mt-1 text-slate-400">人流 {point.occupancy.toFixed(1)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function RelationshipScatterPanel({
  correlation,
  description,
  points,
  title,
  xAccessor,
  xLabel,
  yAccessor,
  yLabel,
}: {
  correlation: number
  description: string
  points: MonitoringScatterPoint[]
  title: string
  xAccessor: (point: MonitoringScatterPoint) => number
  xLabel: string
  yAccessor: (point: MonitoringScatterPoint) => number
  yLabel: string
}) {
  const chartWidth = 520
  const chartHeight = 290
  const padding = 36
  const scatterPoints = buildScatterPoints(points, chartWidth, chartHeight, padding, xAccessor, yAccessor)
  const buildingLabels = [...new Set(points.map((point) => point.buildingId))]

  return (
    <section className="rounded-[34px] border border-white/80 bg-white/90 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Relationship
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
          {describeCorrelation(correlation)} · {correlation.toFixed(2)}
        </div>
      </div>

      <div className="mt-5 rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,#fbfdff_0%,#f4f8ff_100%)] p-4">
        <svg className="block h-auto w-full" preserveAspectRatio="xMidYMid meet" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          {[0, 1, 2, 3].map((index) => {
            const y = padding + ((chartHeight - padding * 2) / 3) * index
            return (
              <line
                key={`y-${y}`}
                stroke="rgba(148,163,184,0.2)"
                strokeDasharray="5 7"
                x1={padding}
                x2={chartWidth - padding}
                y1={y}
                y2={y}
              />
            )
          })}

          {[0, 1, 2, 3].map((index) => {
            const x = padding + ((chartWidth - padding * 2) / 3) * index
            return (
              <line
                key={`x-${x}`}
                stroke="rgba(148,163,184,0.16)"
                strokeDasharray="5 7"
                x1={x}
                x2={x}
                y1={padding}
                y2={chartHeight - padding}
              />
            )
          })}

          {scatterPoints.map(({ item, x, y }) => (
            <circle
              cx={x}
              cy={y}
              fill={scatterToneFill(item.tone)}
              key={item.id}
              opacity="0.82"
              r="6"
              stroke="#ffffff"
              strokeWidth="2"
            />
          ))}

          <text className="fill-slate-400 text-[11px]" x={padding} y={chartHeight - 8}>
            {xLabel}
          </text>
          <text className="fill-slate-400 text-[11px]" transform={`translate(14 ${padding}) rotate(-90)`}>
            {yLabel}
          </text>
        </svg>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
        {buildingLabels.map((label) => {
          const tone = points.find((point) => point.buildingId === label)?.tone ?? 'sky'
          return (
            <span
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1"
              key={label}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: scatterToneFill(tone) }}
              />
              {label}
            </span>
          )
        })}
      </div>
    </section>
  )
}

function HeatmapPanel({ heatmap }: { heatmap: MonitoringHeatmapCell[] }) {
  const dates = [...new Set(heatmap.map((item) => item.date))]
  const hours = [...new Set(heatmap.map((item) => item.hour))]

  return (
    <section className="rounded-[34px] border border-white/80 bg-white/90 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Heatmap
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">时段热力图</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            把最近 7 天按日期和小时展开，一眼看清哪个时段最耗电、哪个时段人流最高。
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-[28px] border border-slate-200/80 bg-slate-50/85">
        <div className="grid grid-cols-[84px_repeat(4,minmax(0,1fr))] gap-px bg-slate-200/70">
          <div className="bg-white px-3 py-3 text-xs font-semibold tracking-[0.16em] text-slate-400 uppercase">
            日期
          </div>
          {hours.map((hour) => (
            <div
              className="bg-white px-3 py-3 text-center text-xs font-semibold tracking-[0.16em] text-slate-400 uppercase"
              key={hour}
            >
              {hour}
            </div>
          ))}

          {dates.flatMap((date) => {
            const cells = heatmap.filter((item) => item.date === date)

            return [
              <div className="bg-white px-3 py-4 text-sm font-medium text-slate-700" key={`${date}-label`}>
                {date}
              </div>,
              ...cells.map((cell) => {
                const background = `rgba(37,99,235,${clamp(0.14 + cell.intensity * 0.66, 0.14, 0.8)})`
                return (
                  <div
                    className="min-h-[84px] bg-white px-3 py-3 text-slate-950"
                    key={`${cell.date}-${cell.hour}`}
                  >
                    <div
                      className="flex h-full flex-col justify-between rounded-[20px] p-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                      style={{ backgroundColor: background }}
                      title={`${cell.date} ${cell.hour} · 电耗 ${cell.electricity.toFixed(1)} kWh · 人流 ${cell.occupancy.toFixed(1)}`}
                    >
                      <div className="text-[11px] opacity-80">电耗</div>
                      <div className="text-lg font-semibold leading-none">{cell.electricity.toFixed(0)}</div>
                      <div className="text-[11px] opacity-80">人流 {cell.occupancy.toFixed(0)}</div>
                    </div>
                  </div>
                )
              }),
            ]
          })}
        </div>
      </div>
    </section>
  )
}

function CompositionPanel({
  composition,
  statusDistribution,
}: {
  composition: MonitoringCompositionItem[]
  statusDistribution: MonitoringStatusBucket[]
}) {
  const total = composition.reduce((sum, item) => sum + item.value, 0)
  let current = 0
  const stops = composition.map((item) => {
    const start = (current / total) * 100
    current += item.value
    const end = (current / total) * 100
    return `${item.color} ${start}% ${end}%`
  }).join(', ')

  const donutStyle = {
    backgroundImage: `conic-gradient(${stops})`,
  } satisfies CSSProperties

  return (
    <section className="rounded-[34px] border border-white/80 bg-white/90 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="text-[11px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
        Composition
      </div>
      <h2 className="mt-2 text-2xl font-semibold text-slate-950">能耗构成占比</h2>

      <div className="mt-6 flex items-center justify-center">
        <div className="relative flex h-52 w-52 items-center justify-center rounded-full" style={donutStyle}>
          <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
            <div className="text-3xl font-semibold text-slate-950">{Math.round(total)}</div>
            <div className="mt-1 text-xs text-slate-400">总量基准</div>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {composition.map((item) => (
          <div
            className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3"
            key={item.label}
          >
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-sm text-slate-700">{item.label}</span>
            </div>
            <div className="text-sm font-medium text-slate-950">{item.value.toFixed(0)}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50/85 p-4">
        <div className="text-xs font-semibold tracking-[0.18em] text-slate-400 uppercase">状态概览</div>
        <div className="mt-4 space-y-3">
          {statusDistribution.map((bucket) => (
            <div className="flex items-center justify-between text-sm" key={bucket.label}>
              <div className="flex items-center gap-2 text-slate-700">
                <span className={cn('h-2.5 w-2.5 rounded-full', statusToneClassName(bucket.tone))} />
                {bucket.label}
              </div>
              <div className="font-medium text-slate-950">{bucket.count}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function BuildingRankingPanel({ buildingSummaries }: { buildingSummaries: MonitoringBuildingSummary[] }) {
  const maxElectricity = Math.max(...buildingSummaries.map((summary) => summary.electricity), 1)

  return (
    <section className="rounded-[34px] border border-white/80 bg-white/90 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="text-[11px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
        Ranking
      </div>
      <h2 className="mt-2 text-2xl font-semibold text-slate-950">楼栋能耗排名</h2>

      <div className="mt-6 space-y-4">
        {buildingSummaries.map((summary, index) => (
          <div
            className="rounded-[26px] border border-slate-200/80 bg-slate-50/85 p-4"
            key={summary.buildingId}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                  {index + 1}
                </div>
                <div>
                  <div className="font-semibold text-slate-950">{summary.buildingId}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {summary.buildingType} · 人流 {summary.averageOccupancy.toFixed(1)}
                  </div>
                </div>
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                效率 {summary.efficiencyScore}
              </div>
            </div>

            <div className="mt-4 h-3 rounded-full bg-white">
              <div
                className="h-3 rounded-full bg-[linear-gradient(90deg,#0ea5e9_0%,#2563eb_100%)]"
                style={{ width: `${(summary.electricity / maxElectricity) * 100}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 text-sm text-slate-600">
              <div className="rounded-2xl border border-white bg-white px-3 py-3">
                <div className="text-xs text-slate-400">电耗</div>
                <div className="mt-2 font-semibold text-slate-950">{summary.electricity.toFixed(0)}</div>
              </div>
              <div className="rounded-2xl border border-white bg-white px-3 py-3">
                <div className="text-xs text-slate-400">暖通</div>
                <div className="mt-2 font-semibold text-slate-950">{summary.hvac.toFixed(0)}</div>
              </div>
              <div className="rounded-2xl border border-white bg-white px-3 py-3">
                <div className="text-xs text-slate-400">预警</div>
                <div className="mt-2 font-semibold text-slate-950">{summary.warningCount}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function DetailTable({ model }: { model: MonitoringAnalyticsModel }) {
  return (
    <section className="rounded-[34px] border border-white/80 bg-white/92 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Detail Records
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">近期监测明细</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            前面的图表都基于这些监测记录聚合而来，下面保留一张表，方便继续核对数据来源和接口结构。
          </p>
        </div>

        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
          最近 {model.recentRecords.length} 条
        </div>
      </div>

      <div className="mt-6 overflow-auto rounded-[28px] border border-slate-200/80 bg-white">
        <table className="min-w-[1280px] text-sm text-slate-700">
          <thead className="bg-slate-100 text-xs uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">楼栋</th>
              <th className="px-4 py-3 text-left">时间</th>
              <th className="px-4 py-3 text-right">电耗</th>
              <th className="px-4 py-3 text-right">暖通</th>
              <th className="px-4 py-3 text-right">用水</th>
              <th className="px-4 py-3 text-right">温度</th>
              <th className="px-4 py-3 text-right">湿度</th>
              <th className="px-4 py-3 text-right">人流</th>
              <th className="px-4 py-3 text-left">设备</th>
              <th className="px-4 py-3 text-left">状态</th>
            </tr>
          </thead>
          <tbody>
            {model.recentRecords.map((record) => (
              <tr className="border-t border-slate-100" key={record.id}>
                <td className="px-4 py-3 font-medium text-slate-950">{record.building_id}</td>
                <td className="px-4 py-3">{record.monitor_time}</td>
                <td className="px-4 py-3 text-right">{record.electricity_kwh.toFixed(1)}</td>
                <td className="px-4 py-3 text-right">{record.hvac_kwh.toFixed(1)}</td>
                <td className="px-4 py-3 text-right">{record.water_m3.toFixed(1)}</td>
                <td className="px-4 py-3 text-right">{record.env_temperature.toFixed(1)}°C</td>
                <td className="px-4 py-3 text-right">{record.env_humidity.toFixed(1)}%</td>
                <td className="px-4 py-3 text-right">{record.occupancy_density.toFixed(1)}</td>
                <td className="px-4 py-3">{record.device_id}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium text-white',
                      record.device_status === 'normal'
                        ? 'bg-emerald-500'
                        : record.device_status === 'warning'
                          ? 'bg-rose-500'
                          : record.device_status === 'maintenance'
                            ? 'bg-amber-500'
                            : 'bg-slate-500',
                    )}
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
    </section>
  )
}

export default function DataAnalysisWorkspace({
  projectId,
  queryResults,
  selectedComponentName,
}: DataAnalysisWorkspaceProps) {
  const model = useMemo(() => buildMonitoringAnalyticsModel(projectId), [projectId])

  return (
    <div className="h-full overflow-auto bg-[radial-gradient(circle_at_top_left,#fffdf4_0%,#eef4ff_38%,#dde8f8_100%)]">
      <div className="mx-auto flex max-w-[1760px] flex-col gap-6 px-6 py-6">
        <section className="rounded-[40px] border border-white/80 bg-white/76 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_0.9fr]">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.28em] text-slate-400 uppercase">
                Smart Energy Data Board
              </div>
              <h1 className="mt-3 text-4xl font-semibold text-slate-950">智慧园区能耗数据分析看板</h1>
              <div className="mt-5 flex flex-wrap gap-2 text-sm text-slate-600">
                <span className="rounded-full border border-white/80 bg-white/90 px-3 py-1.5">
                  项目 {projectId}
                </span>
                <span className="rounded-full border border-white/80 bg-white/90 px-3 py-1.5">
                  关联高耗能构件 {queryResults.length} 个
                </span>
                <span className="rounded-full border border-white/80 bg-white/90 px-3 py-1.5">
                  当前关注 {selectedComponentName}
                </span>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                {model.metrics.map((metric) => (
                  <MetricCard key={metric.label} metric={metric} />
                ))}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 2xl:grid-cols-2">
                <PeakSnapshotPanel peakSnapshot={model.peakSnapshot} />
                <FieldGlossaryPreviewPanel fieldGlossary={model.fieldGlossary} />
              </div>
            </div>

            <ScorePanel
              model={model}
              queryResults={queryResults}
              selectedComponentName={selectedComponentName}
            />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_0.8fr]">
          <DailyLoadPanel model={model} />
          <HourlyPatternPanel model={model} />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <RelationshipScatterPanel
            correlation={model.relationshipInsights.occupancyCorrelation}
            description="每个点代表一个楼栋在某个时段的监测记录，横轴是人流指数，纵轴是能耗。点越往右上，说明该时段人流和负荷都在抬升。"
            points={model.occupancyScatter}
            title="能耗与人流量关系图"
            xAccessor={(point) => point.occupancy}
            xLabel="人流指数"
            yAccessor={(point) => point.electricity}
            yLabel="能耗 kWh"
          />

          <RelationshipScatterPanel
            correlation={model.relationshipInsights.temperatureCorrelation}
            description="用环境温度和能耗做第二组关系分析，方便对外解释高温时段为什么会带来更高的电耗和暖通压力。"
            points={model.occupancyScatter}
            title="能耗与温度关系图"
            xAccessor={(point) => point.temperature}
            xLabel="温度 °C"
            yAccessor={(point) => point.electricity}
            yLabel="能耗 kWh"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr_0.9fr]">
          <HeatmapPanel heatmap={model.heatmap} />
          <CompositionPanel
            composition={model.composition}
            statusDistribution={model.statusDistribution}
          />
          <BuildingRankingPanel buildingSummaries={model.buildingSummaries} />
        </div>

        <DetailTable model={model} />
      </div>
    </div>
  )
}
