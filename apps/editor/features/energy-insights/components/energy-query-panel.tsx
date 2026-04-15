'use client'

import HostFilterBar from '@/features/energy-insights/components/host-filter-bar'
import EnergyVisuals from '@/features/energy-insights/components/energy-visuals'
import type { EnergyApiResponse } from '@/features/energy-insights/lib/energy-api'
import type {
  HostFilterOption,
  HostQueryFilters,
  HostQueryResult,
} from '@/features/energy-insights/lib/host-query'
import { cn } from '@/lib/utils'

function resolveEnergyLevelTone(level: string) {
  const normalized = level.toLowerCase()

  if (level.includes('高') || normalized.includes('high')) {
    return 'bg-rose-50 text-rose-700'
  }

  if (level.includes('中') || normalized.includes('mid')) {
    return 'bg-amber-50 text-amber-700'
  }

  return 'bg-emerald-50 text-emerald-700'
}

export interface EnergyQueryPanelProps {
  energyError: string | null
  energyLoading: boolean
  energyResult: EnergyApiResponse | null
  filters: HostQueryFilters
  levelOptions: HostFilterOption[]
  onFiltersChange: (nextFilters: HostQueryFilters) => void
  projectId: string
  queryResults: HostQueryResult[]
  selectedComponentId: string | null
  selectedComponentName: string
  zoneOptions: HostFilterOption[]
}

function QueryResultsSection({ queryResults }: { queryResults: HostQueryResult[] }) {
  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Results
          </div>
          <h3 className="mt-2 font-semibold text-slate-950">筛选结果列表</h3>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
          共 {queryResults.length} 条
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {queryResults.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            当前筛选条件下没有命中结果。
          </div>
        ) : (
          queryResults.slice(0, 6).map((result) => (
            <div
              className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4"
              key={result.componentId}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-950">{result.componentName}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {result.componentTypeLabel} · {result.levelName} · {result.zoneName}
                  </div>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                    resolveEnergyLevelTone(result.energyLevel),
                  )}
                >
                  {result.energyLevel}能耗
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <div className="text-xs text-slate-400">预测能耗</div>
                  <div className="mt-1 font-semibold text-slate-950">{result.predictedUsage} kWh</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <div className="text-xs text-slate-400">统计区间</div>
                  <div className="mt-1 font-semibold text-slate-950">{result.timeRangeLabel}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

export default function EnergyQueryPanel({
  energyError,
  energyLoading,
  energyResult,
  filters,
  levelOptions,
  onFiltersChange,
  projectId,
  queryResults,
  selectedComponentId,
  selectedComponentName,
  zoneOptions,
}: EnergyQueryPanelProps) {
  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
              Query
            </div>
            <h3 className="mt-2 font-semibold text-slate-950">能耗查询模块</h3>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
            项目 {projectId}
          </div>
        </div>

        <div className="mt-4">
          <HostFilterBar
            filters={filters}
            levelOptions={levelOptions}
            onFiltersChange={onFiltersChange}
            resultCount={queryResults.length}
            variant="sidebar"
            zoneOptions={zoneOptions}
          />
        </div>
      </section>

      <QueryResultsSection queryResults={queryResults} />

      <section className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-slate-400">当前选中构件</div>
            <div className="mt-2 break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-sm text-slate-700">
              {selectedComponentId ?? '暂未选中构件'}
            </div>
            <div className="mt-3 text-sm text-slate-600">构件名称：{selectedComponentName}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-700">
              JSON 数据驱动图表
            </div>
            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
              查询结果支持模型联动
            </div>
          </div>
        </div>

        {energyLoading ? (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-700">
            正在根据当前选中构件拉取能耗 JSON 数据并生成图表...
          </div>
        ) : null}

        {energyError ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
            能耗查询失败：{energyError}
          </div>
        ) : null}
      </section>

      <EnergyVisuals energyResult={energyResult} selectedComponentName={selectedComponentName} />

      {energyResult ? (
        <section className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
                JSON
              </div>
              <h3 className="mt-2 font-semibold text-slate-950">能耗数据样例</h3>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
              {energyResult.binding?.bindingType ?? 'mock-meter'}
            </div>
          </div>

          <pre className="mt-4 max-h-[260px] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
            {JSON.stringify(energyResult, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  )
}
