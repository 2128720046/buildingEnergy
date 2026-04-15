'use client'

import type { CSSProperties } from 'react'
import type { EnergyApiResponse } from '@/features/energy-insights/lib/energy-api'

const MOCK_DONUT_SEGMENTS = [
  { label: '照明用电', value: 26, color: '#38bdf8' },
  { label: '暖通空调', value: 38, color: '#34d399' },
  { label: '给排水', value: 14, color: '#f59e0b' },
  { label: '其他设备', value: 22, color: '#a78bfa' },
] as const

const MOCK_MONITOR_ROWS = [
  {
    building_id: 'BLDG-A-03',
    monitor_time: '2026-04-15 09:00',
    electricity_kwh: '128.6',
    water_m3: '18.2',
    hvac_kwh: '54.8',
    device_status: '正常',
  },
  {
    building_id: 'BLDG-A-03',
    monitor_time: '2026-04-15 10:00',
    electricity_kwh: '136.9',
    water_m3: '19.1',
    hvac_kwh: '60.3',
    device_status: '偏高',
  },
  {
    building_id: 'BLDG-B-01',
    monitor_time: '2026-04-15 09:00',
    electricity_kwh: '112.4',
    water_m3: '15.7',
    hvac_kwh: '43.5',
    device_status: '正常',
  },
  {
    building_id: 'BLDG-C-07',
    monitor_time: '2026-04-15 09:00',
    electricity_kwh: '149.8',
    water_m3: '22.4',
    hvac_kwh: '68.2',
    device_status: '预警',
  },
] as const

function buildChartPoints(values: number[], width: number, height: number, padding: number) {
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

function buildLinePath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function buildAreaPath(points: Array<{ x: number; y: number }>, height: number, padding: number) {
  if (points.length === 0) return ''

  const linePath = buildLinePath(points)
  const lastPoint = points[points.length - 1]!
  const firstPoint = points[0]!

  return `${linePath} L ${lastPoint.x} ${height - padding} L ${firstPoint.x} ${height - padding} Z`
}

function MetricCard({
  label,
  value,
  unit,
  helper,
}: {
  helper: string
  label: string
  unit: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
      <div className="text-xs text-slate-300">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">
        {value}
        <span className="ml-1 text-sm text-slate-300">{unit}</span>
      </div>
      <div className="mt-2 text-xs text-slate-400">{helper}</div>
    </div>
  )
}

function DonutPlaceholder() {
  const total = MOCK_DONUT_SEGMENTS.reduce((sum, item) => sum + item.value, 0)
  let current = 0
  const stops = MOCK_DONUT_SEGMENTS.map((item) => {
    const start = (current / total) * 100
    current += item.value
    const end = (current / total) * 100
    return `${item.color} ${start}% ${end}%`
  }).join(', ')

  const donutStyle = {
    backgroundImage: `conic-gradient(${stops})`,
  } satisfies CSSProperties

  return (
    <section className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Mock Chart
          </div>
          <h3 className="mt-2 font-semibold text-white">圆形图 · 能耗构成占比</h3>
        </div>
        <div className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-slate-200">
          模拟数据占位
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="flex items-center justify-center rounded-2xl border border-white/8 bg-slate-950/45 px-4 py-5">
          <div
            className="relative flex h-44 w-44 items-center justify-center rounded-full shadow-[0_18px_40px_rgba(15,23,42,0.28)]"
            style={donutStyle}
          >
            <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-slate-950 text-center">
              <div className="text-2xl font-semibold text-white">Demo</div>
              <div className="mt-1 text-[11px] text-slate-400">JSON 接入前占位</div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {MOCK_DONUT_SEGMENTS.map((segment) => (
            <div
              className="flex items-center justify-between rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-3"
              key={segment.label}
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: segment.color }}
                />
                <span className="text-sm text-slate-200">{segment.label}</span>
              </div>
              <div className="text-sm font-medium text-white">{segment.value}%</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TablePlaceholder() {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Mock Table
          </div>
          <h3 className="mt-2 font-semibold text-white">表格图 · 监测数据样例</h3>
        </div>
        <div className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-slate-200">
          后续替换为真实 JSON
        </div>
      </div>

      <div className="mt-4 overflow-auto rounded-2xl border border-white/8 bg-slate-950/45">
        <table className="min-w-full text-sm text-slate-200">
          <thead className="bg-white/6 text-xs uppercase tracking-[0.16em] text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left">building_id</th>
              <th className="px-4 py-3 text-left">monitor_time</th>
              <th className="px-4 py-3 text-right">electricity_kwh</th>
              <th className="px-4 py-3 text-right">water_m3</th>
              <th className="px-4 py-3 text-right">hvac_kwh</th>
              <th className="px-4 py-3 text-left">device_status</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_MONITOR_ROWS.map((row) => (
              <tr className="border-t border-white/6" key={`${row.building_id}-${row.monitor_time}`}>
                <td className="px-4 py-3 font-medium text-white">{row.building_id}</td>
                <td className="px-4 py-3 text-slate-300">{row.monitor_time}</td>
                <td className="px-4 py-3 text-right">{row.electricity_kwh}</td>
                <td className="px-4 py-3 text-right">{row.water_m3}</td>
                <td className="px-4 py-3 text-right">{row.hvac_kwh}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      row.device_status === '预警'
                        ? 'rounded-full bg-rose-500/20 px-2.5 py-1 text-xs text-rose-100'
                        : row.device_status === '偏高'
                          ? 'rounded-full bg-amber-500/20 px-2.5 py-1 text-xs text-amber-100'
                          : 'rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs text-emerald-100'
                    }
                  >
                    {row.device_status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-400">
        当前这张表使用的是模拟监测字段和示例数值。后续拿到 JSON 后，可以直接把表头和行数据替换成解析结果。
      </p>
    </section>
  )
}

export interface EnergyVisualsProps {
  energyResult: EnergyApiResponse | null
  selectedComponentName: string
}

export default function EnergyVisuals({
  energyResult,
  selectedComponentName,
}: EnergyVisualsProps) {
  const hasRealSeries = Boolean(energyResult && energyResult.series?.length > 0)

  if (!hasRealSeries) {
    return (
      <section className="space-y-4">
        <section className="rounded-2xl border border-dashed border-white/15 bg-slate-950/25 px-4 py-4 text-sm text-slate-300">
          目前先放两张假的图表占位。等后续接入真实 JSON 后，这里会切换成真实圆形图和真实表格数据。
        </section>
        <div className="grid grid-cols-1 gap-4">
          <DonutPlaceholder />
          <TablePlaceholder />
        </div>
      </section>
    )
  }

  const realEnergyResult = energyResult!

  const chartWidth = 332
  const chartHeight = 180
  const padding = 18
  const values = realEnergyResult.series.map((point) => point.value)
  const points = buildChartPoints(values, chartWidth, chartHeight, padding)
  const maxPoint = realEnergyResult.series.reduce((best, point) =>
    point.value > best.value ? point : best,
  )
  const minPoint = realEnergyResult.series.reduce((best, point) =>
    point.value < best.value ? point : best,
  )
  const averageValue = values.reduce((sum, value) => sum + value, 0) / values.length

  return (
    <section className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
              Visualization
            </div>
            <h3 className="mt-2 font-semibold text-white">图表区域</h3>
          </div>
          <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">
            当前已接入实时序列，假图仍保留作占位参考
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4">
        <DonutPlaceholder />
        <TablePlaceholder />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <MetricCard
          helper="实时功率"
          label="当前负荷"
          unit="kW"
          value={realEnergyResult.currentPower.toFixed(1)}
        />
        <MetricCard
          helper={`峰值 ${maxPoint.time}`}
          label="今日累计"
          unit="kWh"
          value={realEnergyResult.todayUsage.toFixed(1)}
        />
        <MetricCard
          helper={`谷值 ${minPoint.time}`}
          label="曲线均值"
          unit="kWh"
          value={averageValue.toFixed(1)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
                Trend
              </div>
              <h3 className="mt-2 font-semibold text-white">{selectedComponentName} 负荷趋势图</h3>
            </div>
            <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">
              平均 {averageValue.toFixed(2)} kWh
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/8 bg-slate-950/45 p-3">
            <svg className="h-auto w-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
              <defs>
                <linearGradient id="energyTrendFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
                </linearGradient>
              </defs>

              {[0, 1, 2, 3].map((index) => {
                const y = padding + ((chartHeight - padding * 2) / 3) * index
                return (
                  <line
                    key={y}
                    stroke="rgba(255,255,255,0.08)"
                    strokeDasharray="4 6"
                    x1={padding}
                    x2={chartWidth - padding}
                    y1={y}
                    y2={y}
                  />
                )
              })}

              <path d={buildAreaPath(points, chartHeight, padding)} fill="url(#energyTrendFill)" />
              <path
                d={buildLinePath(points)}
                fill="none"
                stroke="#38bdf8"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
              />

              {points.map((point) => (
                <circle
                  cx={point.x}
                  cy={point.y}
                  fill="#0f172a"
                  key={`${point.x}-${point.y}`}
                  r="4.5"
                  stroke="#7dd3fc"
                  strokeWidth="2"
                />
              ))}
            </svg>

            <div className="mt-3 grid grid-cols-4 gap-2 text-[11px] text-slate-400">
              {realEnergyResult.series.map((point) => (
                <div key={point.time}>
                  <div>{point.time}</div>
                  <div className="mt-1 text-slate-200">{point.value.toFixed(1)}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
                Compare
              </div>
              <h3 className="mt-2 font-semibold text-white">分时用量柱状图</h3>
            </div>
            <div className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs text-slate-200">
              峰值 {maxPoint.value.toFixed(2)} kWh
            </div>
          </div>

          <div className="mt-4 flex min-h-[180px] items-end gap-3 rounded-2xl border border-white/8 bg-slate-950/45 px-3 pb-4 pt-6">
            {realEnergyResult.series.map((point) => {
              const height = `${Math.max((point.value / Math.max(maxPoint.value, 1)) * 100, 16)}%`

              return (
                <div className="flex min-w-0 flex-1 flex-col items-center gap-2" key={point.time}>
                  <div className="text-[11px] text-slate-300">{point.value.toFixed(1)}</div>
                  <div className="flex h-28 w-full items-end justify-center rounded-full bg-slate-900/80 px-1">
                    <div
                      className="w-full rounded-full bg-[linear-gradient(180deg,#22d3ee_0%,#2563eb_100%)] shadow-[0_12px_30px_rgba(56,189,248,0.18)]"
                      style={{ height }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-400">{point.time}</div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </section>
  )
}
