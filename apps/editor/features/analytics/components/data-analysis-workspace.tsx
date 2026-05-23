'use client'

import Image from 'next/image'
import type { CSSProperties, ReactNode } from 'react'
import { useMemo } from 'react'
import {
  BevelCard,
  Pill,
  VideoBackground,
} from '@/features/analytics/components/dashboard-primitives'
import {
  DASHBOARD_ASSETS,
  DASHBOARD_COLORS,
  DASHBOARD_FONTS,
} from '@/features/analytics/components/dashboard-theme'
import type {
  MonitoringAnalyticsModel,
  MonitoringBuildingSummary,
  MonitoringCompositionItem,
  MonitoringHeatmapCell,
  MonitoringMetric,
  MonitoringScatterPoint,
  MonitoringStatusBucket,
} from '@/features/analytics/lib/monitoring-analytics'
import { buildMonitoringAnalyticsModel } from '@/features/analytics/lib/monitoring-analytics'
import type { HostQueryResult } from '@/features/energy-insights/lib/host-query'
import { cn } from '@/lib/utils'

const PANEL_DIVIDERS = [
  DASHBOARD_ASSETS.divider1,
  DASHBOARD_ASSETS.divider2,
  DASHBOARD_ASSETS.divider3,
  DASHBOARD_ASSETS.divider4,
  DASHBOARD_ASSETS.divider5,
  DASHBOARD_ASSETS.divider6,
] as const

const METRIC_ICONS: Record<MonitoringMetric['tone'], string> = {
  amber: '/icons/environment.png',
  emerald: '/icons/room.png',
  rose: '/icons/settings.png',
  sky: '/icons/building.png',
}

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

function PanelHeader({
  divider = 1,
  eyebrow,
  icon,
  title,
}: {
  divider?: 1 | 2 | 3 | 4 | 5 | 6
  eyebrow?: string
  icon?: string
  title: string
}) {
  return (
    <div className="relative mb-4 min-h-9">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-9 opacity-70"
        style={{
          backgroundImage: `url(${PANEL_DIVIDERS[divider - 1]})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: '100% 100%',
        }}
      />
      <div className="relative flex items-center gap-2 px-3 pt-1.5">
        <span className="h-5 w-1 bg-[linear-gradient(180deg,#7AF7FF_0%,#00D4FF_50%,#034D7A_100%)] shadow-[0_0_14px_rgba(0,212,255,0.75)]" />
        {icon ? (
          <Image
            alt=""
            aria-hidden
            className="h-5 w-5 object-contain opacity-90 drop-shadow-[0_0_10px_rgba(0,212,255,0.65)]"
            height={20}
            src={icon}
            width={20}
          />
        ) : null}
        <div>
          {eyebrow ? (
            <div
              className="text-[9px] font-semibold uppercase tracking-[0.24em] text-cyan-100/45"
              style={{ fontFamily: DASHBOARD_FONTS.num }}
            >
              {eyebrow}
            </div>
          ) : null}
          <h2
            className="text-[15px] font-bold leading-none text-cyan-50"
            style={{ fontFamily: DASHBOARD_FONTS.cn }}
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
  eyebrow,
  icon,
  size = 'medium',
  title,
}: {
  children: ReactNode
  className?: string
  contentClassName?: string
  divider?: 1 | 2 | 3 | 4 | 5 | 6
  eyebrow?: string
  icon?: string
  size?: 'small' | 'medium' | 'large' | 'kpi'
  title: string
}) {
  return (
    <BevelCard
      className={cn('h-full min-h-0 p-4', className)}
      contentClassName={contentClassName}
      size={size}
    >
      <PanelHeader divider={divider} eyebrow={eyebrow} icon={icon} title={title} />
      {children}
    </BevelCard>
  )
}

export interface DataAnalysisWorkspaceProps {
  projectId: string
  queryResults: HostQueryResult[]
  selectedComponentName: string
}

function MetricCard({ index, metric }: { index: number; metric: MonitoringMetric }) {
  const accent = metricToneColor(metric.tone)

  return (
    <BevelCard className="min-h-[112px] px-4 py-3" size="kpi">
      <div className="flex items-center gap-3">
        <div
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          style={{
            background: `radial-gradient(circle, ${accent} 0%, rgba(0,0,0,0) 62%)`,
            boxShadow: `0 0 22px ${accent}55`,
          }}
        >
          <Image
            alt=""
            aria-hidden
            className="h-7 w-7 object-contain brightness-125"
            height={28}
            src={METRIC_ICONS[metric.tone]}
            width={28}
          />
        </div>
        <div className="min-w-0">
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100/45"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
          >
            DATA 0{index + 1}
          </div>
          <div
            className="mt-1 truncate text-[26px] font-bold leading-none text-cyan-50 drop-shadow-[0_0_12px_rgba(0,212,255,0.35)]"
            style={{ color: accent, fontFamily: DASHBOARD_FONTS.numHeavy }}
          >
            {metric.value}
          </div>
          <div
            className="mt-1 truncate text-[12px] text-cyan-50/70"
            style={{ fontFamily: DASHBOARD_FONTS.cn }}
          >
            {metric.label}
          </div>
        </div>
      </div>
    </BevelCard>
  )
}

function HealthGaugePanel({ model }: { model: MonitoringAnalyticsModel }) {
  const angle = (model.performanceScore / 100) * 360
  const gaugeStyle = {
    backgroundImage: `conic-gradient(${DASHBOARD_COLORS.primary} 0deg ${angle}deg, rgba(0,212,255,0.08) ${angle}deg 360deg)`,
  } satisfies CSSProperties

  return (
    <HudPanel divider={1} eyebrow="HEALTH" icon="/icons/settings.png" title="运行健康评分">
      <div className="grid grid-cols-[150px_1fr] gap-4 max-sm:grid-cols-1">
        <div className="flex items-center justify-center">
          <div
            className="relative flex h-36 w-36 items-center justify-center rounded-full border border-cyan-300/20 shadow-[0_0_32px_rgba(0,212,255,0.2)]"
            style={gaugeStyle}
          >
            <div className="absolute inset-3 rounded-full border border-cyan-200/10 bg-[#061829]/85" />
            <div className="relative text-center">
              <div
                className="text-5xl font-bold leading-none text-cyan-50"
                style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
              >
                {model.performanceScore}
              </div>
              <div className="mt-1 text-[11px] tracking-[0.2em] text-cyan-100/45">SCORE</div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {model.statusDistribution.map((bucket) => {
            const total = model.statusDistribution.reduce((sum, item) => sum + item.count, 0)
            const ratio = total === 0 ? 0 : (bucket.count / total) * 100

            return (
              <div key={bucket.label}>
                <div className="mb-1 flex items-center justify-between text-[12px] text-cyan-50/70">
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
                    {bucket.count} / {ratio.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-cyan-950/70">
                  <div
                    className={cn('h-full rounded-full', statusToneClassName(bucket.tone))}
                    style={{ width: `${ratio}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </HudPanel>
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
    <HudPanel
      className="min-h-[430px]"
      divider={2}
      eyebrow="TREND"
      icon="/icons/environment.png"
      size="large"
      title="每日能耗与人流走势"
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Pill tone="primary">电耗柱状</Pill>
        <Pill tone="emerald">人流折线</Pill>
        <Pill tone="neutral">12 天窗口</Pill>
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

          {electricityBars.map((bar) => (
            <rect
              fill="url(#dailyBarFill)"
              filter="url(#cyanGlow)"
              height={bar.height}
              key={`${bar.x}-${bar.height}`}
              opacity="0.88"
              rx="6"
              ry="6"
              width={bar.width}
              x={bar.x}
              y={bar.y}
            />
          ))}

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

          {occupancyPoints.map((point) => (
            <circle
              cx={point.x}
              cy={point.y}
              fill="#061829"
              key={`${point.x}-${point.y}`}
              r="4.5"
              stroke={DASHBOARD_COLORS.emerald}
              strokeWidth="2"
            />
          ))}
        </svg>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-cyan-50/55 md:grid-cols-4 xl:grid-cols-6">
        {model.dailySeries.map((point) => (
          <div className="border border-cyan-300/10 bg-cyan-950/20 px-3 py-2" key={point.date}>
            <div>{point.date}</div>
            <div
              className="mt-1 font-semibold text-cyan-50"
              style={{ fontFamily: DASHBOARD_FONTS.num }}
            >
              {point.electricity.toFixed(1)} kWh
            </div>
          </div>
        ))}
      </div>
    </HudPanel>
  )
}

function HourlyPatternPanel({ model }: { model: MonitoringAnalyticsModel }) {
  const chartWidth = 460
  const chartHeight = 270
  const padding = 28
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
    <HudPanel divider={3} eyebrow="HOURLY" icon="/icons/settings.png" title="时段负荷关系">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-cyan-950/25 p-3 ring-1 ring-cyan-300/10">
          <div className="text-[11px] text-cyan-100/45">电耗高峰</div>
          <div
            className="mt-1 text-xl font-bold text-cyan-50"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
          >
            {model.relationshipInsights.peakHour}
          </div>
        </div>
        <div className="bg-cyan-950/25 p-3 ring-1 ring-cyan-300/10">
          <div className="text-[11px] text-cyan-100/45">低谷时段</div>
          <div
            className="mt-1 text-xl font-bold text-cyan-50"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
          >
            {model.relationshipInsights.quietHour}
          </div>
        </div>
      </div>

      <div className="tech-chart-frame mt-4 p-3">
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

          {electricityBars.map((bar) => (
            <rect
              fill="url(#hourlyBarFill)"
              height={bar.height}
              key={`${bar.x}-${bar.height}`}
              opacity="0.9"
              rx="10"
              ry="10"
              width={bar.width}
              x={bar.x}
              y={bar.y}
            />
          ))}

          <path
            d={buildLinePath(occupancyPoints)}
            fill="none"
            stroke={DASHBOARD_COLORS.amber}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />

          {occupancyPoints.map((point) => (
            <circle
              cx={point.x}
              cy={point.y}
              fill="#061829"
              key={`${point.x}-${point.y}`}
              r="4.5"
              stroke={DASHBOARD_COLORS.amber}
              strokeWidth="2"
            />
          ))}
        </svg>
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
  const chartWidth = 520
  const chartHeight = 290
  const padding = 36
  const scatterPoints = buildScatterPoints(
    points,
    chartWidth,
    chartHeight,
    padding,
    xAccessor,
    yAccessor,
  )

  return (
    <HudPanel divider={4} eyebrow="RELATION" icon="/icons/zone.png" title={title}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Pill tone="primary">{describeCorrelation(correlation)}</Pill>
        <span
          className="text-lg font-bold text-cyan-50"
          style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
        >
          {correlation.toFixed(2)}
        </span>
      </div>

      <div className="tech-chart-frame p-3">
        <svg
          className="block h-auto w-full"
          preserveAspectRatio="xMidYMid meet"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        >
          {[0, 1, 2, 3].map((index) => {
            const y = padding + ((chartHeight - padding * 2) / 3) * index
            return (
              <line
                key={`y-${y}`}
                stroke="rgba(141,168,197,0.2)"
                strokeDasharray="5 8"
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
                stroke="rgba(141,168,197,0.14)"
                strokeDasharray="5 8"
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
              opacity="0.92"
              r="6.5"
              stroke="#DDFBFF"
              strokeOpacity="0.7"
              strokeWidth="1.5"
            />
          ))}

          <text className="fill-cyan-100/45 text-[11px]" x={padding} y={chartHeight - 8}>
            {xLabel}
          </text>
          <text
            className="fill-cyan-100/45 text-[11px]"
            transform={`translate(14 ${padding}) rotate(-90)`}
          >
            {yLabel}
          </text>
        </svg>
      </div>
    </HudPanel>
  )
}

function HeatmapPanel({ heatmap }: { heatmap: MonitoringHeatmapCell[] }) {
  const dates = [...new Set(heatmap.map((item) => item.date))]
  const hours = [...new Set(heatmap.map((item) => item.hour))]

  return (
    <HudPanel
      className="min-h-[360px]"
      divider={5}
      eyebrow="HEATMAP"
      icon="/icons/floor.png"
      title="时段热力矩阵"
    >
      <div className="overflow-hidden border border-cyan-300/15 bg-cyan-950/20">
        <div className="grid grid-cols-[76px_repeat(4,minmax(0,1fr))] gap-px bg-cyan-300/10">
          <div className="bg-[#061829]/90 px-3 py-2 text-[11px] font-semibold tracking-[0.16em] text-cyan-100/45">
            日期
          </div>
          {hours.map((hour) => (
            <div
              className="bg-[#061829]/90 px-3 py-2 text-center text-[11px] font-semibold tracking-[0.16em] text-cyan-100/45"
              key={hour}
            >
              {hour}
            </div>
          ))}

          {dates.flatMap((date) => {
            const cells = heatmap.filter((item) => item.date === date)

            return [
              <div
                className="bg-[#061829]/90 px-3 py-3 text-[12px] text-cyan-50/70"
                key={`${date}-label`}
              >
                {date}
              </div>,
              ...cells.map((cell) => {
                const background = `rgba(0,212,255,${clamp(0.16 + cell.intensity * 0.72, 0.16, 0.88)})`
                return (
                  <div
                    className="min-h-[58px] bg-[#061829]/90 p-1.5 text-cyan-50"
                    key={`${cell.date}-${cell.hour}`}
                    title={`${cell.date} ${cell.hour} 电耗 ${cell.electricity.toFixed(1)} kWh`}
                  >
                    <div
                      className="flex h-full flex-col justify-between px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_18px_rgba(0,212,255,0.12)]"
                      style={{ backgroundColor: background }}
                    >
                      <span className="text-[10px] opacity-75">kWh</span>
                      <span
                        className="text-base font-bold leading-none"
                        style={{ fontFamily: DASHBOARD_FONTS.num }}
                      >
                        {cell.electricity.toFixed(0)}
                      </span>
                    </div>
                  </div>
                )
              }),
            ]
          })}
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
  const total = composition.reduce((sum, item) => sum + item.value, 0)
  let current = 0
  const stops = composition
    .map((item) => {
      const start = (current / total) * 100
      current += item.value
      const end = (current / total) * 100
      return `${item.color} ${start}% ${end}%`
    })
    .join(', ')

  const donutStyle = {
    backgroundImage: `conic-gradient(${stops})`,
  } satisfies CSSProperties

  return (
    <HudPanel divider={6} eyebrow="RATIO" icon="/icons/appliance.png" title="能耗构成占比">
      <div className="flex items-center justify-center py-2">
        <div
          className="relative flex h-44 w-44 items-center justify-center rounded-full shadow-[0_0_42px_rgba(0,212,255,0.18)]"
          style={donutStyle}
        >
          <div className="absolute inset-5 rounded-full bg-[#061829]/95 ring-1 ring-cyan-300/15" />
          <div className="relative text-center">
            <div
              className="text-3xl font-bold text-cyan-50"
              style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
            >
              {Math.round(total)}
            </div>
            <div className="text-[11px] text-cyan-100/45">总量基准</div>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {composition.map((item) => (
          <div
            className="flex items-center justify-between border border-cyan-300/10 bg-cyan-950/20 px-3 py-2 text-[12px]"
            key={item.label}
          >
            <span className="flex items-center gap-2 text-cyan-50/70">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
            <span className="font-bold text-cyan-50" style={{ fontFamily: DASHBOARD_FONTS.num }}>
              {item.value.toFixed(0)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {statusDistribution.map((bucket) => (
          <div className="border border-cyan-300/10 bg-cyan-950/20 px-3 py-2" key={bucket.label}>
            <div className="flex items-center gap-2 text-[11px] text-cyan-100/45">
              <span className={cn('h-2 w-2 rounded-full', statusToneClassName(bucket.tone))} />
              {bucket.label}
            </div>
            <div
              className="mt-1 text-lg font-bold text-cyan-50"
              style={{ fontFamily: DASHBOARD_FONTS.num }}
            >
              {bucket.count}
            </div>
          </div>
        ))}
      </div>
    </HudPanel>
  )
}

function BuildingRankingPanel({
  buildingSummaries,
}: {
  buildingSummaries: MonitoringBuildingSummary[]
}) {
  const maxElectricity = Math.max(...buildingSummaries.map((summary) => summary.electricity), 1)

  return (
    <HudPanel divider={1} eyebrow="RANKING" icon="/icons/building.png" title="楼栋能耗排行">
      <div className="space-y-3">
        {buildingSummaries.map((summary, index) => (
          <div className="border border-cyan-300/10 bg-cyan-950/20 p-3" key={summary.buildingId}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-400/10 text-sm font-bold text-cyan-50 shadow-[0_0_16px_rgba(0,212,255,0.25)]"
                  style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
                >
                  {index + 1}
                </div>
                <div>
                  <div className="font-semibold text-cyan-50">{summary.buildingId}</div>
                  <div className="mt-0.5 text-[11px] text-cyan-100/45">{summary.buildingType}</div>
                </div>
              </div>
              <div className="text-right">
                <div
                  className="text-lg font-bold text-cyan-50"
                  style={{ fontFamily: DASHBOARD_FONTS.num }}
                >
                  {summary.electricity.toFixed(0)}
                </div>
                <div className="text-[10px] text-cyan-100/45">kWh</div>
              </div>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-cyan-950/80">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#00D4FF_0%,#FFB800_100%)] shadow-[0_0_14px_rgba(0,212,255,0.4)]"
                style={{ width: `${(summary.electricity / maxElectricity) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </HudPanel>
  )
}

function DetailTable({ model }: { model: MonitoringAnalyticsModel }) {
  return (
    <HudPanel
      className="min-h-[300px]"
      divider={2}
      eyebrow="RECORDS"
      icon="/icons/floorplan.png"
      size="large"
      title="近期监测明细"
    >
      <div className="overflow-auto border border-cyan-300/15 bg-cyan-950/20">
        <table className="min-w-[1180px] text-sm text-cyan-50/70">
          <thead className="bg-cyan-950/70 text-[11px] uppercase tracking-[0.16em] text-cyan-100/45">
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
            {model.recentRecords.slice(0, 10).map((record) => (
              <tr className="border-t border-cyan-300/10 hover:bg-cyan-300/5" key={record.id}>
                <td className="px-4 py-3 font-medium text-cyan-50">{record.building_id}</td>
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
                      'inline-flex min-w-14 justify-center rounded-full px-2.5 py-1 text-xs font-medium text-[#020817]',
                      record.device_status === 'normal'
                        ? 'bg-[#22D3A0]'
                        : record.device_status === 'warning'
                          ? 'bg-[#FF4D6D]'
                          : record.device_status === 'maintenance'
                            ? 'bg-[#FFB800]'
                            : 'bg-cyan-100/50',
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
    </HudPanel>
  )
}

export default function DataAnalysisWorkspace({ projectId }: DataAnalysisWorkspaceProps) {
  const model = useMemo(() => buildMonitoringAnalyticsModel(projectId), [projectId])

  return (
    <div className="relative h-full overflow-auto bg-[#020817] text-cyan-50">
      <VideoBackground />
      <div className="cockpit-atmosphere" />

      <div className="relative z-10 mx-auto flex max-w-[1820px] flex-col gap-4 px-5 pb-6 pt-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {model.metrics.map((metric, index) => (
            <MetricCard index={index} key={metric.label} metric={metric} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)_380px]">
          <div className="flex min-h-0 flex-col gap-4">
            <HealthGaugePanel model={model} />
            <HourlyPatternPanel model={model} />
          </div>

          <div className="flex min-h-0 flex-col gap-4">
            <DailyLoadPanel model={model} />
            <HeatmapPanel heatmap={model.heatmap} />
          </div>

          <div className="flex min-h-0 flex-col gap-4">
            <BuildingRankingPanel buildingSummaries={model.buildingSummaries} />
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

        <DetailTable model={model} />
      </div>
    </div>
  )
}
