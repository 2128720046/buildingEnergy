'use client'

import EnergyAssistantChat from '@/features/energy-insights/components/energy-assistant-chat'
import type { EnergyApiResponse } from '@/features/energy-insights/lib/energy-api'
import type { HostQueryResult } from '@/features/energy-insights/lib/host-query'
import OperationsOverviewPanel from '@/features/operations/components/operations-overview-panel'
import { buildOperationsDashboardData } from '@/features/operations/lib/operations-dashboard'
import { cn } from '@/lib/utils'

function MetricStrip({
  detail,
  label,
  value,
}: {
  detail: string
  label: string
  value: string
}) {
  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <div className="text-xs tracking-[0.18em] text-slate-400 uppercase">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-slate-950">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-500">{detail}</div>
    </div>
  )
}

export interface SmartOperationsWorkspaceProps {
  energyResult: EnergyApiResponse | null
  projectId: string
  queryResults: HostQueryResult[]
  saveStatus: string
  selectedComponentId: string | null
  selectedComponentName: string
}

export default function SmartOperationsWorkspace({
  energyResult,
  projectId,
  queryResults,
  saveStatus,
  selectedComponentId,
  selectedComponentName,
}: SmartOperationsWorkspaceProps) {
  const dashboard = buildOperationsDashboardData({
    energyResult,
    projectId,
    queryResults,
    saveStatus,
    selectedComponentId,
    selectedComponentName,
  })

  return (
    <div className="h-full overflow-auto bg-[radial-gradient(circle_at_top_left,#fffdf7_0%,#f4f8ff_42%,#e8eef8_100%)]">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-6 px-6 py-6">
        <section className="rounded-[36px] border border-white/80 bg-white/88 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="text-[11px] font-semibold tracking-[0.28em] text-slate-400 uppercase">
                Smart Operations Workspace
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-slate-950">智慧运维协同大界面</h1>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                运维告警、任务协同和智能体问答集中在同一个一级页面，更适合做告警闭环、任务推进和运维决策。
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-sm text-slate-600">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                项目 {projectId}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                当前构件 {selectedComponentName}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
                活跃结果 {queryResults.length} 条
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-4">
            {dashboard.metrics.map((metric) => (
              <MetricStrip
                detail={metric.detail}
                key={metric.label}
                label={metric.label}
                value={metric.value}
              />
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.08fr)_420px]">
          <OperationsOverviewPanel
            energyResult={energyResult}
            projectId={projectId}
            queryResults={queryResults}
            saveStatus={saveStatus}
            selectedComponentId={selectedComponentId}
            selectedComponentName={selectedComponentName}
          />

          <div className="space-y-6">
            <section className="rounded-[32px] border border-slate-200/80 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
              <div className="text-[11px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
                Dispatch Focus
              </div>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">当前运维焦点</h2>

              <div className="mt-5 space-y-3">
                {dashboard.alerts.slice(0, 3).map((alert) => (
                  <div
                    className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4"
                    key={alert.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-950">{alert.title}</div>
                        <div className="mt-2 text-sm leading-6 text-slate-500">{alert.detail}</div>
                      </div>
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-1 text-xs font-semibold',
                          alert.severity === 'high'
                            ? 'bg-rose-50 text-rose-700'
                            : alert.severity === 'medium'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-emerald-50 text-emerald-700',
                        )}
                      >
                        {alert.severity === 'high'
                          ? '高优先'
                          : alert.severity === 'medium'
                            ? '中优先'
                            : '低优先'}
                      </span>
                    </div>

                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                      {alert.recommendation}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <EnergyAssistantChat
              energyResult={energyResult}
              projectId={projectId}
              queryResults={queryResults}
              selectedComponentId={selectedComponentId}
              selectedComponentName={selectedComponentName}
              tone="light"
              variant="workspace"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
