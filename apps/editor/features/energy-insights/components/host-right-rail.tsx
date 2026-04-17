'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ModelingSelectionSnapshot } from '@pascal-app/editor/modeling'
import EnergyQueryPanel from '@/features/energy-insights/components/energy-query-panel'
import type { EnergyApiResponse, ZoneEnergyResponse } from '@/features/energy-insights/lib/energy-api'
import type {
  HostFilterOption,
  HostQueryFilters,
  HostQueryResult,
} from '@/features/energy-insights/lib/host-query'
import OperationsOverviewPanel from '@/features/operations/components/operations-overview-panel'
import { cn } from '@/lib/utils'

export type HostBusinessModule = 'query' | 'operations'

const HOST_BUSINESS_MODULES: Array<{
  key: HostBusinessModule
  label: string
}> = [
  {
    key: 'query',
    label: '能耗查询',
  },
  {
    key: 'operations',
    label: '智慧运维',
  },
]

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'paused' | 'error'

const COLLAPSED_INSIGHTS_WIDTH = 8
const MIN_INSIGHTS_WIDTH = 420
const MAX_INSIGHTS_WIDTH = 680
const TOGGLE_GAP = 12
const TOGGLE_SIZE = 32

function ToggleChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path
        d={
          collapsed
            ? 'M14.5 5.5 8.5 12l6 6M18.5 5.5 12.5 12l6 6'
            : 'M9.5 5.5l6 6-6 6M5.5 5.5l6 6-6 6'
        }
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function ModuleIcon({ active, kind }: { active: boolean; kind: HostBusinessModule }) {
  if (kind === 'query') {
    return (
      <svg
        aria-hidden="true"
        className={cn('h-4 w-4', active ? 'text-white' : 'text-slate-400')}
        viewBox="0 0 24 24"
      >
        <path
          d="M5 18.25h14v1.5H5Zm1.25-2.5V9.63h1.5v6.12Zm5 0V5.75h1.5v10Zm5 0v-3.5h1.5v3.5Z"
          fill="currentColor"
        />
      </svg>
    )
  }

  return (
    <svg
      aria-hidden="true"
      className={cn('h-4 w-4', active ? 'text-white' : 'text-slate-400')}
      viewBox="0 0 24 24"
    >
      <path
        d="M12 3.75 4.5 7.5v9L12 20.25l7.5-3.75v-9ZM6 8.41l6-3 6 3V16L12 19l-6-3Zm2 2.09h8V12H8Zm0 3.5h5v1.5H8Z"
        fill="currentColor"
      />
    </svg>
  )
}

function RailToggleButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <div className="inline-flex h-8 items-stretch overflow-hidden rounded-xl border border-border bg-background/90 shadow-2xl backdrop-blur-md">
      <button
        className="flex w-8 items-center justify-center text-muted-foreground/80 transition-colors hover:bg-white/8 hover:text-foreground/90"
        onClick={onClick}
        title={collapsed ? '展开右侧业务栏' : '收起右侧业务栏'}
        type="button"
      >
        <ToggleChevronIcon collapsed={collapsed} />
      </button>
    </div>
  )
}

export interface HostRightRailProps {
  activeModule: HostBusinessModule
  energyError: string | null
  energyLoading: boolean
  energyResult: EnergyApiResponse | null
  energyResultZone: ZoneEnergyResponse | null
  filters: HostQueryFilters
  hasQueried: boolean
  insightsCollapsed: boolean
  levelOptions: HostFilterOption[]
  onFiltersChange: (nextFilters: HostQueryFilters) => void
  onInsightsCollapsedChange: (collapsed: boolean) => void
  onModuleChange: (module: HostBusinessModule) => void
  onQuery: () => void
  onWidthChange: (width: number) => void
  projectId: string
  queryResults: HostQueryResult[]
  saveStatus: SaveStatus
  selection: ModelingSelectionSnapshot | null
  width: number
  zoneOptions: HostFilterOption[]
}

export default function HostRightRail({
  activeModule,
  energyError,
  energyLoading,
  energyResult,
  energyResultZone,
  filters,
  hasQueried,
  insightsCollapsed,
  levelOptions,
  onFiltersChange,
  onInsightsCollapsedChange,
  onModuleChange,
  onQuery,
  onWidthChange,
  projectId,
  queryResults,
  saveStatus,
  selection,
  width,
  zoneOptions,
}: HostRightRailProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  const isResizing = useRef(false)
  const isExpanding = useRef(false)
  const [isDragging, setIsDragging] = useState(false)

  const selectedComponentId = selection?.selectedIds[0] ?? null
  const selectedComponentName =
    (selection?.selectedNodes[0]?.name as string | undefined) ?? selectedComponentId ?? '未选中构件'

  const clampWidth = useCallback((nextWidth: number) => {
    return Math.max(MIN_INSIGHTS_WIDTH, Math.min(MAX_INSIGHTS_WIDTH, nextWidth))
  }, [])

  const handleResizeStart = useCallback((event: React.PointerEvent) => {
    event.preventDefault()
    isResizing.current = true
    setIsDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const handleExpandStart = useCallback((event: React.PointerEvent) => {
    event.preventDefault()
    isExpanding.current = true
    setIsDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const shellRect = shellRef.current?.getBoundingClientRect()
      if (!shellRect) {
        return
      }

      const nextWidth = clampWidth(shellRect.right - event.clientX)

      if (isResizing.current) {
        onWidthChange(nextWidth)
      } else if (isExpanding.current && nextWidth > MIN_INSIGHTS_WIDTH) {
        onInsightsCollapsedChange(false)
        onWidthChange(nextWidth)
      }
    }

    const handlePointerUp = () => {
      isResizing.current = false
      isExpanding.current = false
      setIsDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [clampWidth, onInsightsCollapsedChange, onWidthChange])

  const panelStyle = useMemo(
    () => ({
      width: insightsCollapsed ? COLLAPSED_INSIGHTS_WIDTH : width,
      transition: isDragging ? 'none' : 'width 150ms ease',
    }),
    [insightsCollapsed, isDragging, width],
  )

  const toggleOffset = TOGGLE_GAP + TOGGLE_SIZE

  return (
    <div className="relative h-full flex-shrink-0" ref={shellRef} style={panelStyle}>
      <div className="absolute top-4 z-30" style={{ left: -toggleOffset }}>
        <div className="pointer-events-auto">
          <RailToggleButton
            collapsed={insightsCollapsed}
            onClick={() => onInsightsCollapsedChange(!insightsCollapsed)}
          />
        </div>
      </div>

      <div className="h-full w-full overflow-hidden">
        {insightsCollapsed ? (
          <div
            className="h-full w-full cursor-col-resize transition-colors hover:bg-primary/20"
            onPointerDown={handleExpandStart}
            title="展开右侧业务栏"
          />
        ) : (
          <section className="dark relative flex h-full w-full flex-col overflow-hidden border-l border-border bg-sidebar text-sidebar-foreground">
            <div
              className="absolute inset-y-0 -left-3 z-20 flex w-6 cursor-col-resize items-center justify-center"
              onPointerDown={handleResizeStart}
              title="拖拽调整右侧业务栏宽度"
            >
              <div className="h-8 w-1 rounded-full bg-neutral-500" />
            </div>

            <div className="border-border/50 border-b px-4 py-4">
              <div className="grid grid-cols-2 gap-2">
                {HOST_BUSINESS_MODULES.map((module) => {
                  const isActive = activeModule === module.key

                  return (
                    <button
                      className={cn(
                        'rounded-2xl border px-3 py-3 text-left transition-all',
                        isActive
                          ? 'border-sky-400/30 bg-sky-500/15 shadow-[0_14px_30px_rgba(14,165,233,0.14)]'
                          : 'border-white/10 bg-black/10 hover:bg-white/8',
                      )}
                      key={module.key}
                      onClick={() => onModuleChange(module.key)}
                      type="button"
                    >
                      <div className="flex items-center gap-2">
                        <ModuleIcon active={isActive} kind={module.key} />
                        <span
                          className={cn(
                            'font-medium text-sm',
                            isActive ? 'text-white' : 'text-slate-200',
                          )}
                        >
                          {module.label}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {activeModule === 'query' ? (
                <EnergyQueryPanel
                  energyError={energyError}
                  energyLoading={energyLoading}
                  energyResult={energyResult}
                  energyResultZone={energyResultZone}
                  filters={filters}
                  hasQueried={hasQueried}
                  levelOptions={levelOptions}
                  onFiltersChange={onFiltersChange}
                  onQuery={onQuery}
                  projectId={projectId}
                  queryResults={queryResults}
                  selectedComponentId={selectedComponentId}
                  selectedComponentName={selectedComponentName}
                  zoneOptions={zoneOptions}
                />
              ) : (
                <OperationsOverviewPanel
                  energyResult={energyResult}
                  projectId={projectId}
                  queryResults={queryResults}
                  saveStatus={saveStatus}
                  selectedComponentId={selectedComponentId}
                  selectedComponentName={selectedComponentName}
                />
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
