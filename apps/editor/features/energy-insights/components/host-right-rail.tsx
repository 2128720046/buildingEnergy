'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ModelingSelectionSnapshot } from '@pascal-app/editor/modeling'
import HostFilterBar from '@/features/energy-insights/components/host-filter-bar'
import type { EnergyApiResponse } from '@/features/energy-insights/lib/energy-api'
import type { HostFilterOption, HostQueryFilters, HostQueryResult } from '@/features/energy-insights/lib/host-query'
import { cn } from '@/lib/utils'

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'paused' | 'error'

const COLLAPSED_INSIGHTS_WIDTH = 8
const MIN_INSIGHTS_WIDTH = 420
const MAX_INSIGHTS_WIDTH = 620
const TOGGLE_GAP = 12
const TOGGLE_SIZE = 32

function ToggleChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path
        d={collapsed ? 'M14.5 5.5 8.5 12l6 6M18.5 5.5 12.5 12l6 6' : 'M9.5 5.5l6 6-6 6M5.5 5.5l6 6-6 6'}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
      <circle cx="12" cy="12" fill="none" opacity="0.2" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  )
}

function QueryIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 text-sky-200" viewBox="0 0 24 24">
      <path
        d="M10 4.75a5.25 5.25 0 1 0 3.17 9.43l4.58 4.57 1.06-1.06-4.57-4.58A5.25 5.25 0 0 0 10 4.75Zm0 1.5a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Zm8.72 9.97-2.47 2.47-.9-.9 2.47-2.47.9.9Z"
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
  energyError: string | null
  energyLoading: boolean
  energyResult: EnergyApiResponse | null
  filters: HostQueryFilters
  insightsCollapsed: boolean
  levelOptions: HostFilterOption[]
  onFiltersChange: (nextFilters: HostQueryFilters) => void
  onInsightsCollapsedChange: (collapsed: boolean) => void
  onProjectChange: (projectId: string) => void
  onWidthChange: (width: number) => void
  projectId: string
  projectLoading: boolean
  projectOptions: Array<{ projectId: string; updatedAt?: string }>
  queryResults: HostQueryResult[]
  saveStatus: SaveStatus
  selection: ModelingSelectionSnapshot | null
  width: number
  zoneOptions: HostFilterOption[]
}

export default function HostRightRail({
  energyError,
  energyLoading,
  energyResult,
  filters,
  insightsCollapsed,
  levelOptions,
  onFiltersChange,
  onInsightsCollapsedChange,
  onProjectChange,
  onWidthChange,
  projectId,
  projectLoading,
  projectOptions,
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
    (selection?.selectedNodes[0]?.name as string | undefined) ?? selectedComponentId ?? '未选择构件'

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
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold tracking-[0.28em] text-sidebar-foreground/55 uppercase">
                      宿主业务区
                    </div>
                    <h2 className="mt-2 font-semibold text-lg text-sidebar-foreground">能耗与查询面板</h2>

                    <div className="mt-3">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-semibold tracking-[0.18em] text-slate-300 uppercase">
                          当前项目
                        </span>
                        <select
                          className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-white/20"
                          disabled={projectLoading || projectOptions.length === 0}
                          onChange={(event) => onProjectChange(event.target.value)}
                          value={projectId}
                        >
                          {projectOptions.length === 0 ? (
                            <option value={projectId}>{projectLoading ? '正在加载项目...' : projectId}</option>
                          ) : (
                            projectOptions.map((option) => (
                              <option key={option.projectId} value={option.projectId}>
                                {option.projectId}
                              </option>
                            ))
                          )}
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-sidebar-foreground/85">
                    保存状态：{saveStatus}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-4">
                <section className="rounded-2xl border border-white/10 bg-white/6 p-4">
                  <HostFilterBar
                    filters={filters}
                    levelOptions={levelOptions}
                    onFiltersChange={onFiltersChange}
                    resultCount={queryResults.length}
                    variant="sidebar"
                    zoneOptions={zoneOptions}
                  />
                </section>

                <section className="mt-4 rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
                  <div className="text-xs text-slate-300">当前选中的组件</div>
                  <div className="mt-2 break-all rounded-xl border border-white/10 bg-slate-950/45 px-3 py-3 font-mono text-sm text-white">
                    {selectedComponentId ?? '还没有选中任何组件'}
                  </div>
                  <div className="mt-3 text-xs text-slate-300">组件名称：{selectedComponentName}</div>

                  {energyLoading ? (
                    <div className="mt-4 inline-flex items-center gap-2 text-sm text-sky-200">
                      <SpinnerIcon />
                      正在向后端查询组件能耗...
                    </div>
                  ) : null}

                  {energyError ? (
                    <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-3 text-sm text-rose-100">
                      能耗查询失败：{energyError}
                    </div>
                  ) : null}

                  {energyResult ? (
                    <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                        <div className="text-xs text-slate-300">当前功率</div>
                        <div className="mt-2 text-2xl font-semibold text-white">
                          {energyResult.currentPower.toFixed(1)}
                          <span className="ml-1 text-sm text-slate-300">kW</span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                        <div className="text-xs text-slate-300">今日耗电</div>
                        <div className="mt-2 text-2xl font-semibold text-white">
                          {energyResult.todayUsage.toFixed(1)}
                          <span className="ml-1 text-sm text-slate-300">kWh</span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                        <div className="text-xs text-slate-300">本月累计</div>
                        <div className="mt-2 text-2xl font-semibold text-white">
                          {energyResult.monthUsage.toFixed(1)}
                          <span className="ml-1 text-sm text-slate-300">kWh</span>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {energyResult?.series?.length ? (
                    <div className="mt-4 space-y-2">
                      {energyResult.series.map((point) => (
                        <div
                          className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-sm"
                          key={point.time}
                        >
                          <span className="text-slate-300">{point.time}</span>
                          <span className="font-medium text-white">{point.value.toFixed(2)} kWh</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>

                <section className="mt-4 rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <QueryIcon />
                    <h3 className="font-semibold text-white">筛选查询结果</h3>
                  </div>

                  <div className="mt-4 space-y-3">
                    {queryResults.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-300">
                        当前筛选条件下没有命中结果。
                      </div>
                    ) : (
                      queryResults.map((result) => (
                        <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4" key={result.componentId}>
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
                                result.energyLevel === '高'
                                  ? 'bg-rose-500/20 text-rose-100'
                                  : result.energyLevel === '中'
                                    ? 'bg-amber-500/20 text-amber-100'
                                    : 'bg-emerald-500/20 text-emerald-100',
                              )}
                            >
                              {result.energyLevel}能耗
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
              </div>
          </section>
        )}
      </div>
    </div>
  )
}