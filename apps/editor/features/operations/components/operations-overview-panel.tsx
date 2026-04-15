'use client'

import type { EnergyApiResponse } from '@/features/energy-insights/lib/energy-api'
import type { HostQueryResult } from '@/features/energy-insights/lib/host-query'
import {
  buildOperationsDashboardData,
  type OperationsAlert,
} from '@/features/operations/lib/operations-dashboard'
import { cn } from '@/lib/utils'

function severityClassName(alert: OperationsAlert) {
  return cn(
    'rounded-full px-2.5 py-1 text-[11px] font-semibold',
    alert.severity === 'high'
      ? 'bg-rose-500/20 text-rose-100'
      : alert.severity === 'medium'
        ? 'bg-amber-500/20 text-amber-100'
        : 'bg-emerald-500/20 text-emerald-100',
  )
}

export interface OperationsOverviewPanelProps {
  energyResult: EnergyApiResponse | null
  projectId: string
  queryResults: HostQueryResult[]
  saveStatus: string
  selectedComponentId: string | null
  selectedComponentName: string
}

export default function OperationsOverviewPanel({
  energyResult,
  projectId,
  queryResults,
  saveStatus,
  selectedComponentId,
  selectedComponentName,
}: OperationsOverviewPanelProps) {
  const dashboard = buildOperationsDashboardData({
    energyResult,
    projectId,
    queryResults,
    saveStatus,
    selectedComponentId,
    selectedComponentName,
  })

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
              Operations
            </div>
            <h3 className="mt-2 font-semibold text-white">智慧运维模块</h3>
          </div>
          <div className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-slate-200">
            第一版概览
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-cyan-400/15 bg-cyan-400/8 px-4 py-4 text-sm text-slate-100">
          {dashboard.summary}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {dashboard.metrics.map((metric) => (
          <div
            className="rounded-2xl border border-white/10 bg-slate-950/35 p-4"
            key={metric.label}
          >
            <div className="text-xs text-slate-400">{metric.label}</div>
            <div className="mt-2 text-3xl font-semibold text-white">{metric.value}</div>
            <div className="mt-2 text-xs text-slate-300">{metric.detail}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
              Alerts
            </div>
            <h3 className="mt-2 font-semibold text-white">告警中心</h3>
          </div>
          <div className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-slate-200">
            基于当前筛选结果生成
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {dashboard.alerts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-300">
              当前没有足够的数据生成运维告警。
            </div>
          ) : (
            dashboard.alerts.map((alert) => (
              <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4" key={alert.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-white">{alert.title}</div>
                    <div className="mt-1 text-xs text-slate-300">{alert.detail}</div>
                  </div>
                  <span className={severityClassName(alert)}>
                    {alert.severity === 'high'
                      ? '高优先级'
                      : alert.severity === 'medium'
                        ? '中优先级'
                        : '低优先级'}
                  </span>
                </div>
                <div className="mt-3 rounded-xl border border-white/8 bg-black/10 px-3 py-3 text-sm text-slate-200">
                  {alert.recommendation}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
              Tasks
            </div>
            <h3 className="mt-2 font-semibold text-white">巡检与工单</h3>
          </div>
          <div className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-slate-200">
            待推进 {dashboard.tasks.length} 项
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {dashboard.tasks.map((task) => (
            <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4" key={task.id}>
              <div className="font-medium text-white">{task.title}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
                <span className="rounded-full border border-white/10 bg-black/10 px-2.5 py-1">
                  负责人 {task.assignee}
                </span>
                <span className="rounded-full border border-white/10 bg-black/10 px-2.5 py-1">
                  截止 {task.due}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div>
          <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Strategy
          </div>
          <h3 className="mt-2 font-semibold text-white">下一步设计建议</h3>
        </div>

        <div className="mt-4 space-y-3">
          {dashboard.strategies.map((strategy) => (
            <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4" key={strategy.title}>
              <div className="font-medium text-white">{strategy.title}</div>
              <div className="mt-2 text-sm text-slate-300">{strategy.description}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
