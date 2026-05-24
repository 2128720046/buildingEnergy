'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useMemo } from 'react'
import {
  BevelCard,
  Pill,
  VideoBackground,
} from '@/features/analytics/components/dashboard-primitives'
import { DASHBOARD_COLORS, DASHBOARD_FONTS } from '@/features/analytics/components/dashboard-theme'
import type {
  MonitoringAnalyticsModel,
  MonitoringCompositionItem,
  MonitoringHeatmapCell,
  MonitoringMetric,
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
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerEnd.x} ${innerEnd.y}`,
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
  const metricIcon: Record<MonitoringMetric['tone'], PanelIconKind> = {
    amber: 'load',
    emerald: 'relation',
    rose: 'risk',
    sky: 'building',
  }

  return (
    <BevelCard className="data-analysis-card-frame min-h-[112px] w-full px-4 py-3" size="kpi">
      <div className="flex items-center gap-3">
        <div
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          style={{
            background: `radial-gradient(circle, ${accent} 0%, rgba(0,0,0,0) 62%)`,
            boxShadow: `0 0 22px ${accent}55`,
          }}
        >
          <PanelGlyph kind={metricIcon[metric.tone]} tone={accent} />
        </div>
        <div className="min-w-0">
          <div
            className="mt-1 truncate text-[26px] font-bold leading-none text-cyan-50 drop-shadow-[0_0_12px_rgba(0,212,255,0.35)]"
            style={{ color: accent, fontFamily: DASHBOARD_FONTS.numHeavy }}
          >
            {metric.value}
          </div>
          <div
            className="mt-2 truncate text-[17px] font-semibold text-cyan-50/88"
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
  const warningBucket = model.statusDistribution.find((bucket) => bucket.tone === 'rose')
  const normalBucket = model.statusDistribution.find((bucket) => bucket.tone === 'emerald')
  const statusTotal = model.statusDistribution.reduce((sum, item) => sum + item.count, 0)
  const gaugeStyle = {
    backgroundImage: `conic-gradient(${DASHBOARD_COLORS.primary} 0deg ${angle}deg, rgba(0,212,255,0.08) ${angle}deg 360deg)`,
  } satisfies CSSProperties

  return (
    <HudPanel divider={1} icon="health" title="运行健康评分">
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
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {model.statusDistribution.map((bucket) => {
            const ratio = statusTotal === 0 ? 0 : (bucket.count / statusTotal) * 100

            return (
              <div key={bucket.label}>
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

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="border border-cyan-300/28 bg-cyan-950/25 px-2 py-2.5 shadow-[0_0_12px_rgba(0,212,255,0.08)]">
          <div className="text-[15px] text-cyan-100/72">正常记录</div>
          <div
            className="mt-1 text-2xl font-bold text-[#22D3A0]"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
          >
            {normalBucket?.count ?? 0}
          </div>
        </div>
        <div className="border border-cyan-300/28 bg-cyan-950/25 px-2 py-2.5 shadow-[0_0_12px_rgba(0,212,255,0.08)]">
          <div className="text-[15px] text-cyan-100/72">预警记录</div>
          <div
            className="mt-1 text-2xl font-bold text-[#FF4D6D]"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
          >
            {warningBucket?.count ?? 0}
          </div>
        </div>
        <div className="border border-cyan-300/28 bg-cyan-950/25 px-2 py-2.5 shadow-[0_0_12px_rgba(0,212,255,0.08)]">
          <div className="text-[15px] text-cyan-100/72">监测总量</div>
          <div
            className="mt-1 text-2xl font-bold text-cyan-50"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
          >
            {model.recentRecords.length}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          {
            label: '风险占比',
            value: `${(((warningBucket?.count ?? 0) / Math.max(statusTotal, 1)) * 100).toFixed(1)}%`,
            tone: DASHBOARD_COLORS.rose,
          },
          {
            label: '稳定占比',
            value: `${(((normalBucket?.count ?? 0) / Math.max(statusTotal, 1)) * 100).toFixed(1)}%`,
            tone: DASHBOARD_COLORS.emerald,
          },
        ].map((item) => (
          <div className="border border-cyan-300/24 bg-cyan-950/20 px-3 py-2.5" key={item.label}>
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
    <HudPanel divider={2} icon="trend" size="large" title="每日能耗与人流走势">
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

      <div className="mt-3 grid grid-cols-2 gap-2 text-[14px] text-cyan-50/65 md:grid-cols-4 2xl:grid-cols-6">
        {model.dailySeries.map((point) => (
          <div className="border border-cyan-300/24 bg-cyan-950/24 px-3 py-3.5" key={point.date}>
            <div className="whitespace-nowrap font-semibold tracking-[0.04em]">{point.date}</div>
            <div
              className="mt-1 text-lg font-semibold text-cyan-50"
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
        <div className="bg-cyan-950/25 p-2.5 ring-1 ring-cyan-300/24">
          <div className="text-[14px] text-cyan-100/72">电耗高峰</div>
          <div
            className="mt-0.5 text-lg font-bold text-cyan-50"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
          >
            {model.relationshipInsights.peakHour}
          </div>
        </div>
        <div className="bg-cyan-950/25 p-2.5 ring-1 ring-cyan-300/24">
          <div className="text-[14px] text-cyan-100/72">低谷时段</div>
          <div
            className="mt-0.5 text-lg font-bold text-cyan-50"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
          >
            {model.relationshipInsights.quietHour}
          </div>
        </div>
        <div className="bg-cyan-950/25 p-2.5 ring-1 ring-cyan-300/24">
          <div className="text-[14px] text-cyan-100/72">峰谷差值</div>
          <div
            className="mt-0.5 text-lg font-bold text-[#FFB800]"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
          >
            {swing.toFixed(0)}
          </div>
        </div>
        <div className="bg-cyan-950/25 p-2.5 ring-1 ring-cyan-300/24">
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

      <div className="mt-3 grid grid-cols-4 gap-2">
        {model.hourlySeries.map((point) => (
          <div className="border border-cyan-300/24 bg-cyan-950/20 px-2 py-1.5" key={point.hour}>
            <div className="text-[13px] text-cyan-100/74">{point.hour}</div>
            <div
              className="mt-0.5 text-base font-bold text-cyan-50"
              style={{ fontFamily: DASHBOARD_FONTS.num }}
            >
              {point.electricity.toFixed(0)}
            </div>
            <div className="text-[11px] text-cyan-100/62">kWh</div>
          </div>
        ))}
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
          <div className="border border-cyan-300/24 bg-cyan-950/20 px-2 py-1.5" key={item.label}>
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
  const warningRecords = model.recentRecords
    .filter((record) => record.device_status === 'warning')
    .slice(0, 2)

  return (
    <HudPanel contentClassName="[&>div:first-child]:mb-3" divider={4} icon="peak" title="峰值设备">
      <div className="border border-cyan-300/28 bg-cyan-950/24 px-4 py-3 shadow-[0_0_12px_rgba(0,212,255,0.08)]">
        <div className="text-[15px] font-semibold text-cyan-100/72">{snapshot.buildingId}</div>
        <div
          className="mt-1 truncate text-2xl font-bold leading-tight text-[#FFB800]"
          style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
        >
          {snapshot.deviceId}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            { label: '峰值电耗', value: `${snapshot.electricity.toFixed(1)} kWh` },
            { label: '监测时间', value: snapshot.monitorTime.slice(5) },
            { label: '温度', value: `${snapshot.temperature.toFixed(1)}°C` },
            { label: '人流', value: snapshot.occupancy.toFixed(1) },
          ].map((item) => (
            <div className="border border-cyan-300/24 bg-cyan-950/24 px-3 py-2" key={item.label}>
              <div className="text-[14px] font-semibold text-cyan-100/70">{item.label}</div>
              <div
                className="mt-1 truncate text-[16px] font-bold text-cyan-50"
                style={{ fontFamily: DASHBOARD_FONTS.num }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {warningRecords.map((record) => (
          <div className="border border-cyan-300/24 bg-cyan-950/20 px-3 py-2.5" key={record.id}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-bold text-cyan-50">
                  {record.device_id}
                </div>
                <div className="mt-0.5 text-[13px] text-cyan-100/62">
                  {record.building_id} / {record.monitor_time.slice(5)}
                </div>
              </div>
              <div
                className="text-lg font-bold text-[#FF4D6D]"
                style={{ fontFamily: DASHBOARD_FONTS.num }}
              >
                {record.electricity_kwh.toFixed(0)}
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden bg-cyan-950/80">
              <div
                className="h-full bg-[linear-gradient(90deg,#FF4D6D_0%,#FFB800_100%)] shadow-[0_0_14px_rgba(255,77,109,0.35)]"
                style={{
                  width: `${clamp((record.electricity_kwh / snapshot.electricity) * 100, 12, 100)}%`,
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
        <div className="border border-cyan-300/24 bg-cyan-950/22 px-3 py-3">
          <div className="text-[15px] font-semibold text-cyan-100/72">预警记录</div>
          <div
            className="mt-1 text-3xl font-bold leading-none text-[#FF4D6D]"
            style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
          >
            {warningBucket?.count ?? 0}
          </div>
        </div>
        <div className="border border-cyan-300/24 bg-cyan-950/22 px-3 py-3">
          <div className="text-[15px] font-semibold text-cyan-100/72">维护中</div>
          <div
            className="mt-1 text-3xl font-bold leading-none text-[#FFB800]"
            style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
          >
            {maintenanceBucket?.count ?? 0}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {topRiskBuildings.map((summary, index) => (
          <div
            className="border border-cyan-300/24 bg-cyan-950/20 px-3 py-2.5"
            key={summary.buildingId}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center border border-cyan-300/32 bg-cyan-400/10 text-[14px] font-bold text-cyan-50"
                  style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
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
                {summary.warningCount}
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden bg-cyan-950/80">
              <div
                className="h-full bg-[linear-gradient(90deg,#FF4D6D_0%,#FFB800_100%)] shadow-[0_0_14px_rgba(255,77,109,0.35)]"
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
  const chartWidth = 720
  const chartHeight = 330
  const padding = 42
  const scatterPoints = buildScatterPoints(
    points,
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

  return (
    <HudPanel contentClassName="[&>div:first-child]:mb-2" divider={4} icon="relation" title={title}>
      <div className="mb-3 grid grid-cols-[1fr_auto] items-center gap-3">
        <div className="flex flex-wrap gap-2">
          <Pill tone="primary">{describeCorrelation(correlation)}</Pill>
          <Pill tone="neutral">样本 {points.length}</Pill>
          <Pill tone={warningCount > points.length * 0.35 ? 'amber' : 'emerald'}>
            风险点 {warningCount}
          </Pill>
        </div>
        <div className="text-right">
          <div
            className="text-[30px] font-bold leading-none text-cyan-50"
            style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
          >
            {correlation.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="tech-chart-frame relative p-3 pt-12">
        <div className="pointer-events-none absolute right-4 top-3 z-10 flex flex-wrap justify-end gap-2 text-[14px] font-semibold text-cyan-100/82">
          {[
            { label: '办公', color: DASHBOARD_COLORS.primary },
            { label: '教学', color: DASHBOARD_COLORS.emerald },
            { label: '实验', color: DASHBOARD_COLORS.amber },
            { label: '预警', color: DASHBOARD_COLORS.rose },
          ].map((item) => (
            <span
              className="inline-flex items-center gap-1.5 border border-cyan-300/24 bg-[#041527]/84 px-2.5 py-1.5 backdrop-blur-md"
              key={item.label}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
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
            fill="rgba(255, 184, 0, 0.055)"
            height={(chartHeight - padding * 2) / 2}
            width={(chartWidth - padding * 2) / 2}
            x={padding + (chartWidth - padding * 2) / 2}
            y={padding}
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
                stroke="rgba(0,212,255,0.18)"
                strokeLinecap="round"
                strokeWidth="12"
                x1={trendLine.x1}
                x2={trendLine.x2}
                y1={trendLine.y1}
                y2={trendLine.y2}
              />
              <line
                stroke={`url(#${trendId})`}
                strokeLinecap="round"
                strokeWidth="4"
                x1={trendLine.x1}
                x2={trendLine.x2}
                y1={trendLine.y1}
                y2={trendLine.y2}
              />
            </>
          ) : null}

          {scatterPoints.map(({ item, x, y }) => (
            <g key={item.id}>
              <circle
                cx={x}
                cy={y}
                fill={scatterToneFill(item.tone)}
                opacity={item.tone === 'rose' ? '0.18' : '0.1'}
                r={item.tone === 'rose' ? 15 : 11}
              />
              <circle
                cx={x}
                cy={y}
                fill={scatterToneFill(item.tone)}
                filter={`url(#${pointGlowId})`}
                opacity="0.9"
                r={item.tone === 'rose' ? 6.8 : item.tone === 'amber' ? 5.9 : 5.2}
                stroke="rgba(221,251,255,0.9)"
                strokeWidth="1.35"
              />
            </g>
          ))}

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
        <div className="pointer-events-none absolute right-4 bottom-4 grid grid-cols-2 gap-2 text-right">
          <div className="border border-cyan-300/24 bg-[#041527]/76 px-3 py-2 backdrop-blur-md">
            <div className="text-[13px] font-semibold text-cyan-100/70">样本数</div>
            <div
              className="text-lg font-bold text-cyan-50"
              style={{ fontFamily: DASHBOARD_FONTS.num }}
            >
              {points.length}
            </div>
          </div>
          <div className="border border-cyan-300/24 bg-[#041527]/76 px-3 py-2 backdrop-blur-md">
            <div className="text-[13px] font-semibold text-cyan-100/70">风险点</div>
            <div
              className="text-lg font-bold text-[#FF4D6D]"
              style={{ fontFamily: DASHBOARD_FONTS.num }}
            >
              {warningCount}
            </div>
          </div>
        </div>
      </div>
    </HudPanel>
  )
}

function HeatmapPanel({ heatmap }: { heatmap: MonitoringHeatmapCell[] }) {
  const dates = [...new Set(heatmap.map((item) => item.date))]
  const hours = [...new Set(heatmap.map((item) => item.hour))]
  const peakElectricity = Math.max(...heatmap.map((item) => item.electricity), 1)
  const averageElectricity =
    heatmap.reduce((sum, item) => sum + item.electricity, 0) / Math.max(heatmap.length, 1)
  const peakCell = heatmap.reduce(
    (best, item) => (item.electricity > best.electricity ? item : best),
    heatmap[0] ?? { date: '-', electricity: 0, hour: '--:--', intensity: 0, occupancy: 0 },
  )

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
            <div className="border border-cyan-300/24 bg-cyan-950/20 px-3 py-2" key={item.label}>
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
              {hours.map((hour) => (
                <div
                  className="text-center text-[13px] font-bold tracking-[0.06em] text-cyan-100/70"
                  key={hour}
                >
                  {hour}
                </div>
              ))}
            </div>

            <div
              className="grid gap-2"
              style={{ gridTemplateRows: `repeat(${dates.length}, minmax(0, 1fr))` }}
            >
              {dates.map((date) => (
                <div
                  className="flex items-center justify-end pr-2 text-[13px] font-semibold text-cyan-100/68"
                  key={date}
                >
                  {date}
                </div>
              ))}
            </div>

            <div
              className="grid gap-2"
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
                  const hue =
                    intensity > 0.82 ? '255,184,0' : intensity > 0.66 ? '34,211,160' : '0,212,255'
                  const alpha = clamp(0.16 + intensity * 0.58, 0.16, 0.74)

                  return (
                    <div
                      className={cn(
                        'group relative min-h-[26px] overflow-hidden border bg-[#061829]/88 p-1.5 transition-transform duration-200 hover:z-10 hover:-translate-y-0.5',
                        isPeak
                          ? 'border-[#FFB800]/78 shadow-[0_0_16px_rgba(255,184,0,0.25)]'
                          : 'border-cyan-300/18',
                      )}
                      key={`${date}-${hour}`}
                      title={`${date} ${hour} 电耗 ${value.toFixed(1)} kWh，人流 ${occupancy.toFixed(1)}`}
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
                          {value.toFixed(0)}
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
              <div className="h-2 w-36 bg-[linear-gradient(90deg,rgba(0,212,255,0.2),rgba(0,212,255,0.72),rgba(34,211,160,0.78),rgba(255,184,0,0.9))] shadow-[0_0_10px_rgba(0,212,255,0.18)]" />
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
      title="能耗构成占比"
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
                cx="110"
                cy="110"
                fill="none"
                r="70"
                stroke="rgba(122,247,255,0.11)"
                strokeDasharray="5 9"
                strokeWidth="4"
              />

              {compositionArcs.map((arc) => (
                <g
                  className="group transition-transform duration-200 ease-out hover:translate-x-[var(--lift-x)] hover:translate-y-[var(--lift-y)]"
                  key={arc.label}
                  style={
                    {
                      '--lift-x': `${arc.lift.x}px`,
                      '--lift-y': `${arc.lift.y}px`,
                    } as CSSProperties
                  }
                >
                  <title>{`${arc.label}：${arc.value.toFixed(0)} / ${arc.ratio.toFixed(1)}%`}</title>
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
              ))}

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
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
              <div>
                <div
                  className="text-3xl font-bold leading-none text-cyan-50 drop-shadow-[0_0_14px_rgba(122,247,255,0.58)]"
                  style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
                >
                  {Math.round(total)}
                </div>
                <div className="mt-1 text-[13px] font-semibold tracking-[0.06em] text-cyan-100/68">
                  总量基准
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
                className="min-w-0 border border-cyan-300/24 bg-cyan-950/20 px-2.5 py-2"
                key={item.label}
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

function DetailTable({ model }: { model: MonitoringAnalyticsModel }) {
  return (
    <HudPanel divider={2} icon="records" size="large" title="近期监测明细">
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
              <th className="px-5 py-4 text-left">楼栋</th>
              <th className="px-5 py-4 text-left">时间</th>
              <th className="px-4 py-4 text-right">电耗</th>
              <th className="px-4 py-4 text-right">暖通</th>
              <th className="px-4 py-4 text-right">用水</th>
              <th className="px-4 py-4 text-right">温度</th>
              <th className="px-4 py-4 text-right">湿度</th>
              <th className="px-4 py-4 text-right">人流</th>
              <th className="px-5 py-4 text-left">设备</th>
              <th className="px-5 py-4 text-center">状态</th>
            </tr>
          </thead>
          <tbody>
            {model.recentRecords.slice(0, 10).map((record) => (
              <tr className="border-t border-cyan-300/18 hover:bg-cyan-300/6" key={record.id}>
                <td className="px-5 py-4 font-semibold text-cyan-50">{record.building_id}</td>
                <td className="truncate px-5 py-4">{record.monitor_time}</td>
                <td className="px-4 py-4 text-right">{record.electricity_kwh.toFixed(1)}</td>
                <td className="px-4 py-4 text-right">{record.hvac_kwh.toFixed(1)}</td>
                <td className="px-4 py-4 text-right">{record.water_m3.toFixed(1)}</td>
                <td className="px-4 py-4 text-right">{record.env_temperature.toFixed(1)}°C</td>
                <td className="px-4 py-4 text-right">{record.env_humidity.toFixed(1)}%</td>
                <td className="px-4 py-4 text-right">{record.occupancy_density.toFixed(1)}</td>
                <td className="truncate px-5 py-4">{record.device_id}</td>
                <td className="px-5 py-4 text-center">
                  <span
                    className={cn(
                      'inline-flex min-w-16 justify-center rounded-full px-3 py-1.5 text-[15px] font-semibold text-[#020817]',
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
    <div className="relative h-full overflow-auto bg-[#020817]/35 text-cyan-50">
      <VideoBackground />
      <div className="cockpit-atmosphere" />

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

        <DetailTable model={model} />
      </div>
    </div>
  )
}
