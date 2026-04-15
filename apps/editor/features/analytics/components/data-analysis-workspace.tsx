'use client'

import { useMemo } from 'react'
import type {
  MonitoringAnalyticsModel,
  MonitoringBuildingSummary,
  MonitoringMetric,
  MonitoringStatusBucket,
} from '@/features/analytics/lib/monitoring-analytics'
import { buildMonitoringAnalyticsModel } from '@/features/analytics/lib/monitoring-analytics'
import type { HostQueryResult } from '@/features/energy-insights/lib/host-query'
import { cn } from '@/lib/utils'

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

    return { x, y }
  })
}

function buildLinePath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function buildAreaPath(points: Array<{ x: number; y: number }>, height: number, padding: number) {
  if (points.length === 0) return ''

  const linePath = buildLinePath(points)
  const firstPoint = points[0]!
  const lastPoint = points[points.length - 1]!

  return `${linePath} L ${lastPoint.x} ${height - padding} L ${firstPoint.x} ${height - padding} Z`
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

function MetricCard({ metric }: { metric: MonitoringMetric }) {
  return (
    <div
      className={cn(
        'rounded-[28px] border p-5 shadow-[0_18px_36px_rgba(15,23,42,0.06)]',
        toneClassName(metric.tone),
      )}
    >
      <div className="text-[11px] font-semibold tracking-[0.2em] uppercase opacity-70">
        Metric
      </div>
      <div className="mt-3 text-2xl font-semibold">{metric.value}</div>
      <div className="mt-2 text-sm leading-6 opacity-80">{metric.label}</div>
      <div className="mt-2 text-xs leading-5 opacity-65">{metric.detail}</div>
    </div>
  )
}

function DailyTrendPanel({ model }: { model: MonitoringAnalyticsModel }) {
  const chartWidth = 720
  const chartHeight = 260
  const padding = 24
  const electricityPoints = buildChartPoints(
    model.dailySeries.map((point) => point.electricity),
    chartWidth,
    chartHeight,
    padding,
  )
  const hvacPoints = buildChartPoints(
    model.dailySeries.map((point) => point.hvac),
    chartWidth,
    chartHeight,
    padding,
  )

  return (
    <section className="rounded-[32px] border border-white/70 bg-white/88 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Daily Trend
          </div>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">逐日电耗与暖通负荷趋势</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            用逐日汇总图观察全天电耗、暖通负载与节假日波动，方便快速定位峰值区间。
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1">电耗曲线</span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">
            暖通曲线
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            最近 12 天
          </span>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,#f8fbff_0%,#eef6ff_100%)] p-4">
        <svg className="h-auto w-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          <defs>
            <linearGradient id="dailyElectricityFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 1, 2, 3].map((index) => {
            const y = padding + ((chartHeight - padding * 2) / 3) * index
            return (
              <line
                key={y}
                stroke="rgba(148,163,184,0.26)"
                strokeDasharray="5 7"
                x1={padding}
                x2={chartWidth - padding}
                y1={y}
                y2={y}
              />
            )
          })}

          <path
            d={buildAreaPath(electricityPoints, chartHeight, padding)}
            fill="url(#dailyElectricityFill)"
          />
          <path
            d={buildLinePath(electricityPoints)}
            fill="none"
            stroke="#0ea5e9"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          <path
            d={buildLinePath(hvacPoints)}
            fill="none"
            stroke="#10b981"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />

          {electricityPoints.map((point) => (
            <circle
              cx={point.x}
              cy={point.y}
              fill="#ffffff"
              key={`${point.x}-${point.y}`}
              r="4.5"
              stroke="#0ea5e9"
              strokeWidth="2"
            />
          ))}
        </svg>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500 sm:grid-cols-4 xl:grid-cols-6">
          {model.dailySeries.map((point) => (
            <div className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2" key={point.date}>
              <div>{point.date}</div>
              <div className="mt-2 font-semibold text-slate-950">{point.electricity.toFixed(1)} kWh</div>
              <div className="mt-1 text-slate-400">HVAC {point.hvac.toFixed(1)} kWh</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function StatusPanel({ model }: { model: MonitoringAnalyticsModel }) {
  const total = model.statusDistribution.reduce((sum, bucket) => sum + bucket.count, 0)

  return (
    <section className="rounded-[32px] border border-white/70 bg-white/88 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="text-[11px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
        Monitoring Status
      </div>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">设备状态分布与峰值快照</h2>

      <div className="mt-5 rounded-[28px] border border-slate-200/80 bg-slate-50/90 p-5">
        <div className="text-sm text-slate-500">峰值时段</div>
        <div className="mt-2 text-2xl font-semibold text-slate-950">
          {model.peakSnapshot.electricity.toFixed(1)} kWh
        </div>
        <div className="mt-3 text-sm leading-6 text-slate-600">
          {model.peakSnapshot.buildingId} · {model.peakSnapshot.monitorTime}
        </div>
        <div className="mt-2 text-sm leading-6 text-slate-500">
          设备 {model.peakSnapshot.deviceId}，湿度 {model.peakSnapshot.humidity.toFixed(1)}%，
          平均室外温度 {model.peakSnapshot.temperature.toFixed(1)}°C。
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {model.statusDistribution.map((bucket) => {
          const ratio = total === 0 ? 0 : (bucket.count / total) * 100

          return (
            <div key={bucket.label}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 text-slate-700">
                  <span
                    className={cn('h-2.5 w-2.5 rounded-full', statusToneClassName(bucket.tone))}
                  />
                  {bucket.label}
                </div>
                <div className="font-medium text-slate-950">
                  {bucket.count} 条 · {ratio.toFixed(1)}%
                </div>
              </div>
              <div className="mt-2 h-3 rounded-full bg-slate-100">
                <div
                  className={cn('h-3 rounded-full', statusToneClassName(bucket.tone))}
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

function BuildingTable({ buildingSummaries }: { buildingSummaries: MonitoringBuildingSummary[] }) {
  const maxElectricity = Math.max(...buildingSummaries.map((summary) => summary.electricity), 1)

  return (
    <section className="rounded-[32px] border border-white/70 bg-white/88 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="text-[11px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
        Building Ranking
      </div>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">楼栋能耗对比</h2>

      <div className="mt-6 space-y-4">
        {buildingSummaries.map((summary) => (
          <div
            className="rounded-[28px] border border-slate-200/80 bg-slate-50/85 p-4"
            key={summary.buildingId}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-950">{summary.buildingId}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {summary.buildingType} · 平均密度 {summary.averageOccupancy.toFixed(1)} 人/100m²
                </div>
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                {summary.statusLabel}
              </div>
            </div>

            <div className="mt-4 h-3 rounded-full bg-white">
              <div
                className="h-3 rounded-full bg-[linear-gradient(90deg,#0ea5e9_0%,#2563eb_100%)]"
                style={{ width: `${(summary.electricity / maxElectricity) * 100}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-slate-600 sm:grid-cols-3">
              <div className="rounded-2xl border border-white bg-white px-3 py-3">
                <div className="text-xs text-slate-400">电耗</div>
                <div className="mt-2 font-semibold text-slate-950">
                  {summary.electricity.toFixed(1)} kWh
                </div>
              </div>
              <div className="rounded-2xl border border-white bg-white px-3 py-3">
                <div className="text-xs text-slate-400">水耗</div>
                <div className="mt-2 font-semibold text-slate-950">{summary.water.toFixed(1)} m3</div>
              </div>
              <div className="rounded-2xl border border-white bg-white px-3 py-3">
                <div className="text-xs text-slate-400">暖通负荷</div>
                <div className="mt-2 font-semibold text-slate-950">{summary.hvac.toFixed(1)} kWh</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function FieldGlossaryPanel({ model }: { model: MonitoringAnalyticsModel }) {
  return (
    <section className="rounded-[32px] border border-white/70 bg-white/88 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="text-[11px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
        Schema Snapshot
      </div>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">监测字段字典</h2>

      <div className="mt-6 overflow-hidden rounded-[28px] border border-slate-200/80">
        <div className="grid grid-cols-[1.1fr_0.8fr_2fr] bg-slate-100 px-4 py-3 text-xs font-semibold tracking-[0.14em] text-slate-500 uppercase">
          <div>字段名</div>
          <div>数据类型</div>
          <div>描述与业务逻辑</div>
        </div>

        <div className="max-h-[520px] overflow-auto bg-white">
          {model.fieldGlossary.map((item) => (
            <div
              className="grid grid-cols-[1.1fr_0.8fr_2fr] border-t border-slate-100 px-4 py-3 text-sm"
              key={item.field}
            >
              <div className="font-medium text-slate-950">{item.field}</div>
              <div className="text-slate-500">{item.dataType}</div>
              <div className="leading-6 text-slate-600">{item.description}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function DetailTable({ model }: { model: MonitoringAnalyticsModel }) {
  return (
    <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Daily Records
          </div>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">逐时监测明细表</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            这张表完整展示日电、水耗、暖通、环境和设备状态字段，可直接作为真实接口落地后的主承载区。
          </p>
        </div>

        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
          最近 {model.recentRecords.length} 条记录
        </div>
      </div>

      <div className="mt-6 overflow-auto rounded-[28px] border border-slate-200/80 bg-white">
        <table className="min-w-[1440px] text-sm text-slate-700">
          <thead className="bg-slate-100 text-xs uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">楼栋编号</th>
              <th className="px-4 py-3 text-left">建筑类型</th>
              <th className="px-4 py-3 text-left">监测时间</th>
              <th className="px-4 py-3 text-right">总电耗</th>
              <th className="px-4 py-3 text-right">总水耗</th>
              <th className="px-4 py-3 text-right">暖通电耗</th>
              <th className="px-4 py-3 text-right">供水温度</th>
              <th className="px-4 py-3 text-right">回水温度</th>
              <th className="px-4 py-3 text-right">环境温度</th>
              <th className="px-4 py-3 text-right">环境湿度</th>
              <th className="px-4 py-3 text-right">人员密度</th>
              <th className="px-4 py-3 text-left">设备编号</th>
              <th className="px-4 py-3 text-left">设备状态</th>
            </tr>
          </thead>
          <tbody>
            {model.recentRecords.map((record) => (
              <tr className="border-t border-slate-100" key={record.id}>
                <td className="px-4 py-3 font-medium text-slate-950">{record.building_id}</td>
                <td className="px-4 py-3">{record.building_type}</td>
                <td className="px-4 py-3">{record.monitor_time}</td>
                <td className="px-4 py-3 text-right">{record.electricity_kwh.toFixed(1)}</td>
                <td className="px-4 py-3 text-right">{record.water_m3.toFixed(1)}</td>
                <td className="px-4 py-3 text-right">{record.hvac_kwh.toFixed(1)}</td>
                <td className="px-4 py-3 text-right">{record.chilled_water_supply_temp.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">{record.chilled_water_return_temp.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">{record.env_temperature.toFixed(1)}</td>
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
                          ? '维护中'
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

export interface DataAnalysisWorkspaceProps {
  projectId: string
  queryResults: HostQueryResult[]
  selectedComponentName: string
}

export default function DataAnalysisWorkspace({
  projectId,
  queryResults,
  selectedComponentName,
}: DataAnalysisWorkspaceProps) {
  const model = useMemo(() => buildMonitoringAnalyticsModel(projectId), [projectId])

  return (
    <div className="h-full overflow-auto bg-[radial-gradient(circle_at_top_left,#fffdf6_0%,#eef5ff_46%,#dbe6f8_100%)]">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-6 px-6 py-6">
        <section className="rounded-[36px] border border-white/70 bg-white/72 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="text-[11px] font-semibold tracking-[0.28em] text-slate-400 uppercase">
                Data Analysis Workspace
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-slate-950">每日监测数据总览大界面</h1>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                这里单独承载逐日、逐时和楼栋级监测数据，不再依附右侧面板。你可以把真实的日电、水耗、暖通与环境数据直接映射到这里。
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-sm text-slate-600">
              <span className="rounded-full border border-white/80 bg-white/90 px-3 py-1.5">
                项目 {projectId}
              </span>
              <span className="rounded-full border border-white/80 bg-white/90 px-3 py-1.5">
                关联构件 {queryResults.length} 个
              </span>
              <span className="rounded-full border border-white/80 bg-white/90 px-3 py-1.5">
                当前关注 {selectedComponentName}
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-4">
            {model.metrics.map((metric) => (
              <MetricCard key={metric.label} metric={metric} />
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <DailyTrendPanel model={model} />
          <StatusPanel model={model} />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <BuildingTable buildingSummaries={model.buildingSummaries} />
          <FieldGlossaryPanel model={model} />
        </div>

        <DetailTable model={model} />
      </div>
    </div>
  )
}
