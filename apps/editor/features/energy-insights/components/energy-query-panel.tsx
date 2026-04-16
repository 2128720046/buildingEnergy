'use client'

import { useEffect, useRef } from 'react'
import EnergyVisuals from '@/features/energy-insights/components/energy-visuals'
import HostFilterBar from '@/features/energy-insights/components/host-filter-bar'
import type { EnergyApiResponse, ZoneEnergyResponse } from '@/features/energy-insights/lib/energy-api'
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
  energyResultZone: ZoneEnergyResponse | null
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

function ZoneSummarySection({ energyResultZone }: { energyResultZone: ZoneEnergyResponse }) {
  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Zone
          </div>
          <h3 className="mt-2 font-semibold text-slate-950">房间级环境与能耗概览</h3>
        </div>
        <div className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs text-indigo-700">
          按房间聚合
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#eef2ff_0%,#e0e7ff_100%)] p-4 sm:col-span-2">
          <div className="text-xs text-indigo-500">房间总耗电量</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">
            {energyResultZone.total_electricity_kwh != null
              ? Number(energyResultZone.total_electricity_kwh).toFixed(1)
              : '--'}
            <span className="ml-1 text-sm text-slate-500">kWh</span>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-400">室内温度</div>
          <div className="mt-2 text-xl font-semibold text-slate-950">
            {energyResultZone.indoor_temp != null ? energyResultZone.indoor_temp : '--'}
            <span className="ml-1 text-sm text-slate-500">°C</span>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-400">室内湿度</div>
          <div className="mt-2 text-xl font-semibold text-slate-950">
            {energyResultZone.indoor_humidity != null ? energyResultZone.indoor_humidity : '--'}
            <span className="ml-1 text-sm text-slate-500">%</span>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
          <div className="text-xs text-slate-400">人员密度</div>
          <div className="mt-2 text-xl font-semibold text-slate-950">
            {energyResultZone.occupancy_density != null ? energyResultZone.occupancy_density : '--'}
            <span className="ml-1 text-sm text-slate-500">人/m²</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function ComponentSummarySection({ energyResult }: { energyResult: EnergyApiResponse }) {
  const normalizedType = energyResult.item_type?.toLowerCase() ?? ''

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Component
          </div>
          <h3 className="mt-2 font-semibold text-slate-950">构件级能耗详情</h3>
        </div>
        <div className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs text-cyan-700">
          实时联动
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-400">实时耗电量</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">
            {energyResult.electricity_kwh != null
              ? Number(energyResult.electricity_kwh).toFixed(1)
              : '--'}
            <span className="ml-1 text-sm text-slate-500">kWh</span>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-400">设备信息</div>
          <div className="mt-2 truncate font-semibold text-slate-950" title={energyResult.item_name || ''}>
            {energyResult.item_name || '未命名设备'}
          </div>
          <div className="mt-1 text-[11px] tracking-[0.16em] text-slate-400 uppercase">
            类型 {energyResult.item_type || '通用构件'}
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-400">运行状态</div>
          <div className="mt-2 flex items-center gap-2 text-xl font-semibold text-slate-950">
            {(energyResult.operating_status === 'active' ||
              energyResult.operating_status === '正常') && (
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.45)]" />
            )}
            <span className="truncate">{energyResult.operating_status || '未知'}</span>
          </div>
        </div>

        {normalizedType === 'light' && energyResult.light_brightness_pct != null ? (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs text-amber-600">当前亮度</div>
            <div className="mt-2 text-xl font-semibold text-slate-950">
              {energyResult.light_brightness_pct}%
            </div>
          </div>
        ) : null}

        {normalizedType === 'fridge' && energyResult.fridge_temp_setting != null ? (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs text-amber-600">目标冷藏温度</div>
            <div className="mt-2 text-xl font-semibold text-slate-950">
              {energyResult.fridge_temp_setting}°C
            </div>
          </div>
        ) : null}

        {normalizedType === 'fan' && energyResult.motor_speed_level != null ? (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs text-amber-600">电机档位</div>
            <div className="mt-2 text-xl font-semibold text-slate-950">
              {energyResult.motor_speed_level}
            </div>
          </div>
        ) : null}

        {normalizedType === 'stove' && energyResult.stove_power_level != null ? (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs text-amber-600">加热功率档位</div>
            <div className="mt-2 text-xl font-semibold text-slate-950">
              {energyResult.stove_power_level}
            </div>
          </div>
        ) : null}

        {normalizedType === 'electricbox' &&
        (energyResult.electric_voltage_v != null || energyResult.electric_current_a != null) ? (
          <div className="grid grid-cols-2 gap-4 rounded-[24px] border border-amber-200 bg-amber-50 p-4 lg:col-span-2">
            <div>
              <div className="text-xs text-amber-600">实时电压</div>
              <div className="mt-2 text-xl font-semibold text-slate-950">
                {energyResult.electric_voltage_v != null ? energyResult.electric_voltage_v : '--'}V
              </div>
            </div>
            <div>
              <div className="text-xs text-amber-600">实时电流</div>
              <div className="mt-2 text-xl font-semibold text-slate-950">
                {energyResult.electric_current_a != null ? energyResult.electric_current_a : '--'}A
              </div>
            </div>
          </div>
        ) : null}

        {normalizedType === 'smarttoilet' && energyResult.seat_temp_setting != null ? (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs text-amber-600">座圈设定温度</div>
            <div className="mt-2 text-xl font-semibold text-slate-950">
              {energyResult.seat_temp_setting}°C
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default function EnergyQueryPanel({
  energyError,
  energyLoading,
  energyResult,
  energyResultZone,
  filters,
  levelOptions,
  onFiltersChange,
  projectId,
  queryResults,
  selectedComponentId,
  selectedComponentName,
  zoneOptions,
}: EnergyQueryPanelProps) {
  const visualsRef = useRef<HTMLDivElement>(null)
  const lastAutoJumpedSelectionIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!selectedComponentId) {
      lastAutoJumpedSelectionIdRef.current = null
      return
    }

    if (energyLoading) {
      return
    }

    if (lastAutoJumpedSelectionIdRef.current === selectedComponentId) {
      return
    }

    visualsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    lastAutoJumpedSelectionIdRef.current = selectedComponentId
  }, [energyError, energyLoading, energyResult, energyResultZone, selectedComponentId])

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
              实时数据驱动图表
            </div>
            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
              查询结果支持模型联动
            </div>
          </div>
        </div>

        {energyLoading ? (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-700">
            正在根据当前选中构件拉取能耗数据并生成图表...
          </div>
        ) : null}

        {energyError ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
            能耗查询失败：{energyError}
          </div>
        ) : null}
      </section>

      {energyResultZone?.type === 'zone' ? (
        <ZoneSummarySection energyResultZone={energyResultZone} />
      ) : null}

      {energyResult ? <ComponentSummarySection energyResult={energyResult} /> : null}

      <div className="scroll-mt-4" ref={visualsRef}>
        <EnergyVisuals
          energyResult={energyResult}
          selectedComponentName={selectedComponentName}
        />
      </div>
    </div>
  )
}
