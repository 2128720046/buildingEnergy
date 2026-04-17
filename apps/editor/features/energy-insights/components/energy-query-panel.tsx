'use client'

import EnergyVisuals from '@/features/energy-insights/components/energy-visuals'
import HostFilterBar from '@/features/energy-insights/components/host-filter-bar'
import type { EnergyApiResponse, ZoneEnergyResponse } from '@/features/energy-insights/lib/energy-api'
import type {
  HostFilterOption,
  HostQueryFilters,
  HostQueryResult,
} from '@/features/energy-insights/lib/host-query'

export interface EnergyQueryPanelProps {
  energyError: string | null
  energyLoading: boolean
  energyResult: EnergyApiResponse | null
  energyResultZone: ZoneEnergyResponse | null
  filters: HostQueryFilters
  hasQueried: boolean
  levelOptions: HostFilterOption[]
  onFiltersChange: (nextFilters: HostQueryFilters) => void
  onQuery: () => void
  projectId: string
  queryResults: HostQueryResult[]
  selectedComponentId: string | null
  selectedComponentName: string
  zoneOptions: HostFilterOption[]
}

function QueryResultsSection({ queryResults }: { queryResults: HostQueryResult[] }) {
  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-950">Query Results</h3>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
          {queryResults.length} items
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {queryResults.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            No result for current filters.
          </div>
        ) : (
          queryResults.slice(0, 8).map((result) => (
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-3" key={result.componentId}>
              <div className="truncate font-medium text-slate-900">{result.componentName}</div>
              <div className="mt-1 text-xs text-slate-500">
                {result.componentTypeLabel} | {result.levelName} | {result.zoneName}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Predicted {result.predictedUsage} kWh | {result.timeRangeLabel}
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
      <h3 className="font-semibold text-slate-950">Zone Summary</h3>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          Total electricity {Number(energyResultZone.total_electricity_kwh).toFixed(1)} kWh
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          Indoor temperature {energyResultZone.indoor_temp} C
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          Indoor humidity {energyResultZone.indoor_humidity} %
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          Occupancy density {energyResultZone.occupancy_density} person/m2
        </div>
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
  hasQueried,
  levelOptions,
  onFiltersChange,
  onQuery,
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
          <h3 className="font-semibold text-slate-950">Energy Query</h3>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
            Project {projectId}
          </div>
        </div>

        <div className="mt-4">
          <HostFilterBar
            filters={filters}
            hasQueried={hasQueried}
            levelOptions={levelOptions}
            onFiltersChange={onFiltersChange}
            onQuery={onQuery}
            resultCount={queryResults.length}
            variant="sidebar"
            zoneOptions={zoneOptions}
          />
        </div>
      </section>

      {!hasQueried ? (
        <section className="rounded-[28px] border border-dashed border-slate-300 bg-white/90 p-6 text-sm text-slate-600 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
          Set filters and click Start Query.
        </section>
      ) : (
        <>
          <QueryResultsSection queryResults={queryResults} />

          <section className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
            <div className="text-xs text-slate-400">Current selection ID</div>
            <div className="mt-2 break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-sm text-slate-700">
              {selectedComponentId ?? 'No component selected'}
            </div>
            <div className="mt-3 text-sm text-slate-600">Name: {selectedComponentName}</div>

            {energyLoading ? (
              <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-700">
                Loading energy data...
              </div>
            ) : null}

            {energyError ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                Energy query failed: {energyError}
              </div>
            ) : null}
          </section>

          {energyResultZone?.type === 'zone' ? (
            <ZoneSummarySection energyResultZone={energyResultZone} />
          ) : null}

          <div className="scroll-mt-4">
            <EnergyVisuals energyResult={energyResult} selectedComponentName={selectedComponentName} />
          </div>
        </>
      )}
    </div>
  )
}
