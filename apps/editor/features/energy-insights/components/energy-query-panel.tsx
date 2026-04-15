'use client'

import HostFilterBar from '@/features/energy-insights/components/host-filter-bar'
import EnergyAssistantChat from '@/features/energy-insights/components/energy-assistant-chat'
import EnergyVisuals from '@/features/energy-insights/components/energy-visuals'
// 👇 1. 在这里引入了 ZoneEnergyResponse
import type { EnergyApiResponse, ZoneEnergyResponse } from '@/features/energy-insights/lib/energy-api'
import type {
  HostFilterOption,
  HostQueryFilters,
  HostQueryResult,
} from '@/features/energy-insights/lib/host-query'
import { cn } from '@/lib/utils'

function resolveEnergyLevelTone(level: string) {
  const normalized = level.toLowerCase()

  if (
    level.includes('高') ||
    level.includes('楂') ||
    normalized.includes('high')
  ) {
    return 'bg-rose-500/20 text-rose-100'
  }

  if (
    level.includes('中') ||
    level.includes('涓') ||
    normalized.includes('mid')
  ) {
    return 'bg-amber-500/20 text-amber-100'
  }

  return 'bg-emerald-500/20 text-emerald-100'
}

export interface EnergyQueryPanelProps {
  energyError: string | null
  energyLoading: boolean
  energyResult: EnergyApiResponse | null
  energyResultZone: ZoneEnergyResponse | null // 👇 2. 在 Props 中加上这个属性
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
    <section className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
            Results
          </div>
          <h3 className="mt-2 font-semibold text-white">筛选结果列表</h3>
        </div>
        <div className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-slate-200">
          共 {queryResults.length} 条
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {queryResults.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-300">
            当前筛选条件下没有命中结果。
          </div>
        ) : (
          queryResults.slice(0, 6).map((result) => (
            <div
              className="rounded-2xl border border-white/10 bg-slate-950/35 p-4"
              key={result.componentId}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-white">{result.componentName}</div>
                  <div className="mt-1 text-xs text-slate-300">
                    {result.componentTypeLabel} · {result.levelName} · {result.zoneName}
                  </div>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                    resolveEnergyLevelTone(result.energyLevel),
                  )}
                >
                  {result.energyLevel}耗能
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-white/8 bg-black/10 px-3 py-2">
                  <div className="text-xs text-slate-400">预测能耗</div>
                  <div className="mt-1 font-semibold text-white">{result.predictedUsage} kWh</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/10 px-3 py-2">
                  <div className="text-xs text-slate-400">统计区间</div>
                  <div className="mt-1 font-semibold text-white">{result.timeRangeLabel}</div>
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
  energyResultZone, // 👇 3. 别忘了在这里解构它
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
      <section className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
              Query
            </div>
            <h3 className="mt-2 font-semibold text-white">能耗查询模块</h3>
          </div>
          <div className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-slate-200">
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

      <section className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-slate-300">当前选中构件</div>
            <div className="mt-2 break-all rounded-xl border border-white/10 bg-slate-950/45 px-3 py-3 font-mono text-sm text-white">
              {selectedComponentId ?? '暂未选中构件'}
            </div>
            <div className="mt-3 text-sm text-slate-300">构件名称：{selectedComponentName}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-100">
              JSON 数据驱动图表
            </div>
            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
              智能体可读上下文
            </div>
          </div>
        </div>

        {energyLoading ? (
          <div className="mt-4 rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-3 text-sm text-sky-100">
            正在根据当前选中构件拉取能耗 JSON 数据并生成图表...
          </div>
        ) : null}

        {energyError ? (
          <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-3 text-sm text-rose-100">
            能耗查询失败：{energyError}
          </div>
        ) : null}
      </section>

      {/* ======================= 👇 4. 你的房间级 UI 插入在这里 ======================= */}
      {energyResultZone?.type === 'zone' ? (
        <section className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <h3 className="mb-3 text-white font-semibold">房间级环境与能耗汇总</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 rounded-2xl border border-white/10 bg-indigo-950/30 p-4">
              <div className="text-xs text-indigo-200">房间总耗电量</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {energyResultZone.total_electricity_kwh != null ? Number(energyResultZone.total_electricity_kwh).toFixed(1) : '--'}
                <span className="ml-1 text-sm text-indigo-200/70">kWh</span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
              <div className="text-xs text-slate-300">室内温度</div>
              <div className="mt-2 text-xl font-semibold text-white">
                {energyResultZone.indoor_temp != null ? energyResultZone.indoor_temp : '--'}℃
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
              <div className="text-xs text-slate-300">室内湿度</div>
              <div className="mt-2 text-xl font-semibold text-white">
                {energyResultZone.indoor_humidity != null ? energyResultZone.indoor_humidity : '--'}%
              </div>
            </div>
            <div className="col-span-2 rounded-2xl border border-white/10 bg-slate-950/35 p-4">
              <div className="text-xs text-slate-300">人员密度</div>
              <div className="mt-2 text-xl font-semibold text-white">
                {energyResultZone.occupancy_density != null ? energyResultZone.occupancy_density : '--'}
                <span className="ml-1 text-sm text-slate-300/70">人/m²</span>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ======================= 👇 5. 你的构件级 UI 插入在这里 ======================= */}
      {energyResult ? (
        <section className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <h3 className="mb-3 text-white font-semibold">构件级能耗详情</h3>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
              <div className="text-xs text-slate-300">实时耗电量</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {energyResult.electricity_kwh != null ? Number(energyResult.electricity_kwh).toFixed(1) : '--'}
                <span className="ml-1 text-sm text-slate-300">kWh</span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
              <div className="text-xs text-slate-300">设备信息</div>
              <div className="mt-2">
                <div className="font-semibold text-white truncate" title={energyResult.item_name || ''}>
                  {energyResult.item_name || '未命名设备'}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">
                  类型: {energyResult.item_type || '通用构件'}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
              <div className="text-xs text-slate-300">运行状态</div>
              <div className="mt-2 text-xl font-semibold text-white flex items-center gap-2">
                {(energyResult.operating_status === 'active' || energyResult.operating_status === '正常') && (
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"></span>
                )}
                <span className="truncate">
                  {energyResult.operating_status || '未知'}
                </span>
              </div>
            </div>

            {energyResult.item_type?.toLowerCase() === 'light' && energyResult.light_brightness_pct != null && (
              <div className="rounded-2xl border border-white/10 bg-amber-950/30 p-4">
                <div className="text-xs text-amber-200">当前亮度</div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {energyResult.light_brightness_pct}%
                </div>
              </div>
            )}
            {energyResult.item_type?.toLowerCase() === 'fridge' && energyResult.fridge_temp_setting != null && (
              <div className="rounded-2xl border border-white/10 bg-amber-950/30 p-4">
                <div className="text-xs text-amber-200">设定的目标冷藏/冷冻温度</div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {energyResult.fridge_temp_setting}℃
                </div>
              </div>
            )}
            {energyResult.item_type?.toLowerCase() === 'fan' && energyResult.motor_speed_level != null && (
              <div className="rounded-2xl border border-white/10 bg-amber-950/30 p-4">
                <div className="text-xs text-amber-200">电机运转的档位</div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {energyResult.motor_speed_level}
                </div>
              </div>
            )}
            {energyResult.item_type?.toLowerCase() === 'stove' && energyResult.stove_power_level != null && (
              <div className="rounded-2xl border border-white/10 bg-amber-950/30 p-4">
                <div className="text-xs text-amber-200">加热功率档位</div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {energyResult.stove_power_level}
                </div>
              </div>
            )}
            {energyResult.item_type?.toLowerCase() === 'electricbox' && (energyResult.electric_voltage_v != null || energyResult.electric_current_a != null) && (
              <div className="col-span-full rounded-2xl border border-white/10 bg-amber-950/30 p-4 xl:col-span-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-amber-200">实时电压</div>
                    <div className="mt-2 text-xl font-semibold text-white">
                      {energyResult.electric_voltage_v != null ? energyResult.electric_voltage_v : '--'}V
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-amber-200">实时电流</div>
                    <div className="mt-2 text-xl font-semibold text-white">
                      {energyResult.electric_current_a != null ? energyResult.electric_current_a : '--'}A
                    </div>
                  </div>
                </div>
              </div>
            )}
            {energyResult.item_type?.toLowerCase() === 'smarttoilet' && energyResult.seat_temp_setting != null && (
              <div className="rounded-2xl border border-white/10 bg-amber-950/30 p-4">
                <div className="text-xs text-amber-200">座圈的设定加热温度</div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {energyResult.seat_temp_setting}℃
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {/* 团队成员原本的图表和 JSON 组件保持不变，放在最下方 */}
      <EnergyVisuals energyResult={energyResult} selectedComponentName={selectedComponentName} />

      {energyResult ? (
        <section className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold tracking-[0.22em] text-slate-400 uppercase">
                JSON
              </div>
              <h3 className="mt-2 font-semibold text-white">能耗数据样本</h3>
            </div>
            <div className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-slate-200">
              {energyResult.binding?.bindingType ?? 'mock-meter'}
            </div>
          </div>

          <pre className="mt-4 max-h-[260px] overflow-auto rounded-2xl border border-white/8 bg-slate-950/45 p-4 text-xs text-slate-200">
            {JSON.stringify(energyResult, null, 2)}
          </pre>
        </section>
      ) : null}

      <EnergyAssistantChat
        energyResult={energyResult}
        projectId={projectId}
        queryResults={queryResults}
        selectedComponentId={selectedComponentId}
        selectedComponentName={selectedComponentName}
      />
    </div>
  )
}