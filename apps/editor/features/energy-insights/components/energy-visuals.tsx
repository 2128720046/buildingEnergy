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
  helper,
  label,
  unit,
  value,
}: {
  helper: string
  label: string
  unit: string
  value: string
}) {
  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">
        {value}
        <span className="ml-1 text-sm text-slate-500">{unit}</span>
      </div>
      <div className="mt-2 text-xs text-slate-500">{helper}</div>
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
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Mock Chart
          </div>
          <h3 className="mt-2 font-semibold text-slate-950">圆环图 · 能耗构成占比</h3>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
          模拟数据占位
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="flex items-center justify-center rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-5">
          <div
            className="relative flex h-44 w-44 items-center justify-center rounded-full shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
            style={donutStyle}
          >
            <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white text-center shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
              <div className="text-2xl font-semibold text-slate-950">Demo</div>
              <div className="mt-1 text-[11px] text-slate-400">数据接入前占位</div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {MOCK_DONUT_SEGMENTS.map((segment) => (
            <div
              className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3"
              key={segment.label}
            >
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
                <span className="text-sm text-slate-700">{segment.label}</span>
              </div>
              <div className="text-sm font-medium text-slate-950">{segment.value}%</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TablePlaceholder() {
  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Mock Table
          </div>
          <h3 className="mt-2 font-semibold text-slate-950">表格图 · 监测数据样例</h3>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
          后续可替换成真实监测数据
        </div>
      </div>

      <div className="mt-4 overflow-auto rounded-[24px] border border-slate-200 bg-white">
        <table className="min-w-full text-sm text-slate-700">
          <thead className="bg-slate-100 text-xs uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">楼栋编号</th>
              <th className="px-4 py-3 text-left">监测时间</th>
              <th className="px-4 py-3 text-right">总电耗</th>
              <th className="px-4 py-3 text-right">总水耗</th>
              <th className="px-4 py-3 text-right">暖通电耗</th>
              <th className="px-4 py-3 text-left">设备状态</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_MONITOR_ROWS.map((row) => (
              <tr className="border-t border-slate-100" key={`${row.building_id}-${row.monitor_time}`}>
                <td className="px-4 py-3 font-medium text-slate-950">{row.building_id}</td>
                <td className="px-4 py-3 text-slate-600">{row.monitor_time}</td>
                <td className="px-4 py-3 text-right">{row.electricity_kwh}</td>
                <td className="px-4 py-3 text-right">{row.water_m3}</td>
                <td className="px-4 py-3 text-right">{row.hvac_kwh}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      row.device_status === '预警'
                        ? 'rounded-full bg-rose-50 px-2.5 py-1 text-xs text-rose-700'
                        : row.device_status === '偏高'
                          ? 'rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700'
                          : 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700'
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

      <p className="mt-3 text-xs leading-5 text-slate-500">
        当前这张表用的是模拟监测字段和示例数值。后续拿到真实数据后，可以直接把表头和表格内容替换成解析结果。
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
        <div className="grid grid-cols-1 gap-4">
          <DonutPlaceholder />
          <TablePlaceholder />
        </div>
      </section>
    )
  }

  const realEnergyResult = energyResult!
  const chartWidth = 640
  const chartHeight = 260
  const padding = 28
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
      <section className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
              Visualization
            </div>
            <h3 className="mt-2 font-semibold text-slate-950">图表区域</h3>
          </div>
          <div className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs text-cyan-700">
            当前已接入实时序列
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
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

      <div className="grid grid-cols-1 gap-4">
        <section className="min-w-0 rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
                Trend
              </div>
              <h3 className="mt-2 break-words font-semibold text-slate-950">
                {selectedComponentName} 负荷趋势图
              </h3>
            </div>
            <div className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs text-cyan-700">
              平均 {averageValue.toFixed(2)} kWh
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#f2f7ff_100%)] p-4">
            <svg
              className="block h-auto w-full"
              preserveAspectRatio="xMidYMid meet"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            >
              <defs>
                <linearGradient id="energyTrendFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                </linearGradient>
              </defs>

              {[0, 1, 2, 3].map((index) => {
                const y = padding + ((chartHeight - padding * 2) / 3) * index
                return (
                  <line
                    key={y}
                    stroke="rgba(148,163,184,0.28)"
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
                strokeWidth="4"
              />

              {points.map((point) => (
                <circle
                  cx={point.x}
                  cy={point.y}
                  fill="#ffffff"
                  key={`${point.x}-${point.y}`}
                  r="6"
                  stroke="#38bdf8"
                  strokeWidth="3"
                />
              ))}
            </svg>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500 sm:grid-cols-4">
              {realEnergyResult.series.map((point) => (
                <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2" key={point.time}>
                  <div>{point.time}</div>
                  <div className="mt-1 font-medium text-slate-700">{point.value.toFixed(1)} kWh</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="min-w-0 rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
                Compare
              </div>
              <h3 className="mt-2 font-semibold text-slate-950">分时用量柱状图</h3>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
              峰值 {maxPoint.value.toFixed(2)} kWh
            </div>
          </div>

          <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="flex min-h-[240px] items-end gap-4 overflow-x-auto pb-1">
              {realEnergyResult.series.map((point) => {
                const height = `${Math.max((point.value / Math.max(maxPoint.value, 1)) * 100, 16)}%`

                return (
                  <div
                    className="flex min-w-[78px] flex-1 flex-col items-center gap-3"
                    key={point.time}
                  >
                    <div className="text-xs text-slate-500">{point.value.toFixed(1)}</div>
                    <div className="flex h-36 w-full items-end justify-center rounded-[22px] bg-white px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                      <div
                        className="w-full rounded-full bg-[linear-gradient(180deg,#22d3ee_0%,#2563eb_100%)] shadow-[0_12px_30px_rgba(56,189,248,0.18)]"
                        style={{ height }}
                      />
                    </div>
                    <div className="text-xs text-slate-500">{point.time}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      </div>
    </section>
  )
}
