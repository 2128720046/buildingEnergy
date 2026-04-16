'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ModelingSelectionSnapshot } from '@pascal-app/editor/modeling'
import EnergyAssistantChat from '@/features/energy-insights/components/energy-assistant-chat'
import EnergyQueryPanel from '@/features/energy-insights/components/energy-query-panel'
import type {
  EnergyApiResponse,
  ZoneEnergyResponse,
} from '@/features/energy-insights/lib/energy-api'
import type {
  HostFilterOption,
  HostQueryFilters,
  HostQueryResult,
} from '@/features/energy-insights/lib/host-query'
import { cn } from '@/lib/utils'

const COLLAPSED_INSIGHTS_WIDTH = 8
const MIN_INSIGHTS_WIDTH = 420
const MAX_INSIGHTS_WIDTH = 680
const TOGGLE_GAP = 12
const TOGGLE_SIZE = 32

type RailView = 'agent' | 'query'

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

function RailToggleButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <div className="inline-flex h-8 items-stretch overflow-hidden rounded-xl border border-border bg-background/90 shadow-2xl backdrop-blur-md">
      <button
        className="flex w-8 items-center justify-center text-muted-foreground/80 transition-colors hover:bg-white/8 hover:text-foreground/90"
        onClick={onClick}
        title={collapsed ? '展开右侧工作台' : '收起右侧工作台'}
        type="button"
      >
        <ToggleChevronIcon collapsed={collapsed} />
      </button>
    </div>
  )
}

function RailTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'flex-1 rounded-2xl px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)]'
          : 'text-slate-600 hover:bg-white hover:text-slate-950',
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

export interface HostRightRailProps {
  energyError: string | null
  energyLoading: boolean
  energyResult: EnergyApiResponse | null
  energyResultZone: ZoneEnergyResponse | null
  filters: HostQueryFilters
  insightsCollapsed: boolean
  levelOptions: HostFilterOption[]
  onFiltersChange: (nextFilters: HostQueryFilters) => void
  onInsightsCollapsedChange: (collapsed: boolean) => void
  onWidthChange: (width: number) => void
  projectId: string
  queryResults: HostQueryResult[]
  selection: ModelingSelectionSnapshot | null
  width: number
  zoneOptions: HostFilterOption[]
}

export default function HostRightRail({
  energyError,
  energyLoading,
  energyResult,
  energyResultZone,
  filters,
  insightsCollapsed,
  levelOptions,
  onFiltersChange,
  onInsightsCollapsedChange,
  onWidthChange,
  projectId,
  queryResults,
  selection,
  width,
  zoneOptions,
}: HostRightRailProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  const isResizing = useRef(false)
  const isExpanding = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const [activeView, setActiveView] = useState<RailView>('query')

  const selectedComponentId = selection?.selectedIds[0] ?? null
  const selectedComponentName =
    (selection?.selectedNodes[0]?.name as string | undefined) ??
    selectedComponentId ??
    '未选中构件'

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
            title="展开右侧工作台"
          />
        ) : (
          <aside className="relative flex h-full w-full flex-col overflow-hidden border-l border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f3f7fc_100%)] text-slate-950">
            <div
              className="absolute inset-y-0 -left-3 z-20 flex w-6 cursor-col-resize items-center justify-center"
              onPointerDown={handleResizeStart}
              title="拖拽调整右侧工作台宽度"
            >
              <div className="h-8 w-1 rounded-full bg-slate-400" />
            </div>

            <div className="border-b border-slate-200 px-4 py-4">
              <div className="text-[11px] font-semibold tracking-[0.28em] text-slate-400 uppercase">
                Workspace Panel
              </div>

              <div className="mt-3 rounded-[22px] border border-slate-200 bg-slate-100/80 p-1">
                <div className="flex gap-1">
                  <RailTabButton
                    active={activeView === 'query'}
                    label="能耗查询"
                    onClick={() => setActiveView('query')}
                  />
                  <RailTabButton
                    active={activeView === 'agent'}
                    label="智能体问答"
                    onClick={() => setActiveView('agent')}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <div className="text-[11px] tracking-[0.16em] text-slate-400 uppercase">项目</div>
                  <div className="mt-2 truncate text-sm text-slate-950">{projectId}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <div className="text-[11px] tracking-[0.16em] text-slate-400 uppercase">选中</div>
                  <div className="mt-2 truncate text-sm text-slate-950">{selectedComponentName}</div>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {activeView === 'query' ? (
                <EnergyQueryPanel
                  energyError={energyError}
                  energyLoading={energyLoading}
                  energyResult={energyResult}
                  energyResultZone={energyResultZone}
                  filters={filters}
                  levelOptions={levelOptions}
                  onFiltersChange={onFiltersChange}
                  projectId={projectId}
                  queryResults={queryResults}
                  selectedComponentId={selectedComponentId}
                  selectedComponentName={selectedComponentName}
                  zoneOptions={zoneOptions}
                />
              ) : (
                <EnergyAssistantChat
                  energyResult={energyResult}
                  projectId={projectId}
                  queryResults={queryResults}
                  selectedComponentId={selectedComponentId}
                  selectedComponentName={selectedComponentName}
                  tone="light"
                  variant="panel"
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
