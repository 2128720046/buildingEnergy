'use client'

import { useScene, type AnyNode } from '@pascal-app/core'
import {
  ModelingEditorCoreModule,
  type ModelingSelectionSnapshot,
  type SceneGraph,
} from '@pascal-app/editor/modeling'
import {
  createDefaultModelingSidebarTabs,
  DefaultModelingViewerToolbarLeft,
  DefaultModelingViewerToolbarRight,
} from '@pascal-app/editor/chrome'
import { createEditorApiClient } from '@pascal-app/editor/host'
import { useCallback, useEffect, useMemo, useState } from 'react'
import DataAnalysisWorkspace from '@/features/analytics/components/data-analysis-workspace'
import HostRightRail from '@/features/energy-insights/components/host-right-rail'
import { loadComponentEnergy, type EnergyApiResponse } from '@/features/energy-insights/lib/energy-api'
import { buildHostQueryModel, type HostQueryFilters } from '@/features/energy-insights/lib/host-query'
import WorkspaceNavigation from '@/features/host-shell/components/workspace-navigation'
import type { HostWorkspace } from '@/features/host-shell/lib/host-workspaces'
import { loadProjectSummaries, type ProjectSummary } from '@/features/host-shell/lib/project-api'
import SmartOperationsWorkspace from '@/features/operations/components/smart-operations-workspace'
import { cn } from '@/lib/utils'

const DEFAULT_PROJECT_ID = 'local-editor'

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'paused' | 'error'

export interface HostWorkbenchProps {
  apiBaseUrl?: string
}

export default function HostWorkbench({ apiBaseUrl }: HostWorkbenchProps) {
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID)
  const [projectOptions, setProjectOptions] = useState<ProjectSummary[]>([
    { projectId: DEFAULT_PROJECT_ID },
  ])
  const [projectLoading, setProjectLoading] = useState(false)
  const [selection, setSelection] = useState<ModelingSelectionSnapshot | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [energyResult, setEnergyResult] = useState<EnergyApiResponse | null>(null)
  const [energyLoading, setEnergyLoading] = useState(false)
  const [energyError, setEnergyError] = useState<string | null>(null)
  const [insightsCollapsed, setInsightsCollapsed] = useState(false)
  const [insightsWidth, setInsightsWidth] = useState(432)
  const [activeWorkspace, setActiveWorkspace] = useState<HostWorkspace>('energy-query')
  const [filters, setFilters] = useState<HostQueryFilters>({
    keyword: '',
    levelId: '',
    zoneId: '',
    timeRange: '24h',
    energyLevel: '',
  })

  const nodes = useScene((state) => state.nodes) as Record<string, AnyNode>

  const apiClient = useMemo(
    () => createEditorApiClient({ baseUrl: apiBaseUrl ?? undefined, projectId }),
    [apiBaseUrl, projectId],
  )

  const sidebarTabs = useMemo(
    () =>
      createDefaultModelingSidebarTabs({
        includeSiteTab: true,
        includeAutoModelingTab: true,
        includeZoneMappingTab: true,
        includeSettingsTab: false,
      }),
    [],
  )

  const queryModel = useMemo(() => buildHostQueryModel(nodes, filters), [nodes, filters])
  const selectedComponentId = selection?.selectedIds[0] ?? null
  const selectedComponentName =
    (selection?.selectedNodes[0]?.name as string | undefined) ??
    selectedComponentId ??
    '未选中构件'

  const handleLoad = useCallback(async () => apiClient.loadScene(), [apiClient])
  const handleSave = useCallback(async (scene: SceneGraph) => apiClient.saveScene(scene), [apiClient])

  useEffect(() => {
    let cancelled = false

    async function syncProjects() {
      if (!apiBaseUrl) {
        setProjectOptions([{ projectId: DEFAULT_PROJECT_ID }])
        return
      }

      setProjectLoading(true)

      try {
        const nextProjects = await loadProjectSummaries(apiBaseUrl)
        if (cancelled) return

        if (nextProjects.length > 0) {
          setProjectOptions(nextProjects)
          if (!nextProjects.some((project) => project.projectId === projectId)) {
            setProjectId(nextProjects[0]!.projectId)
          }
        } else {
          setProjectOptions([{ projectId: DEFAULT_PROJECT_ID }])
        }
      } catch {
        if (!cancelled) {
          setProjectOptions([{ projectId: projectId || DEFAULT_PROJECT_ID }])
        }
      } finally {
        if (!cancelled) {
          setProjectLoading(false)
        }
      }
    }

    void syncProjects()

    return () => {
      cancelled = true
    }
  }, [apiBaseUrl, projectId])

  useEffect(() => {
    setSelection(null)
    setEnergyResult(null)
    setEnergyError(null)
    setEnergyLoading(false)
  }, [projectId])

  useEffect(() => {
    let cancelled = false

    async function syncEnergyResult() {
      if (!selectedComponentId) {
        setEnergyResult(null)
        setEnergyError(null)
        setEnergyLoading(false)
        return
      }

      setEnergyLoading(true)
      setEnergyError(null)

      try {
        const response = await loadComponentEnergy(apiBaseUrl, projectId, selectedComponentId)
        if (!cancelled) {
          setEnergyResult(response)
        }
      } catch (error) {
        if (!cancelled) {
          setEnergyResult(null)
          setEnergyError(error instanceof Error ? error.message : '未知错误')
        }
      } finally {
        if (!cancelled) {
          setEnergyLoading(false)
        }
      }
    }

    void syncEnergyResult()

    return () => {
      cancelled = true
    }
  }, [apiBaseUrl, projectId, selectedComponentId])

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top,#f8fbff_0%,#edf3fb_40%,#dbe5f2_100%)] text-slate-950">
      <div className="relative border-b border-white/60 bg-white/70 backdrop-blur-xl">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.42),rgba(255,255,255,0))]" />

        <div className="relative flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <WorkspaceNavigation
              activeWorkspace={activeWorkspace}
              onChange={setActiveWorkspace}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex min-w-[220px] flex-col gap-1">
              <span className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">
                当前项目
              </span>
              <select
                className="rounded-2xl border border-white/80 bg-white/92 px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400"
                disabled={projectLoading || projectOptions.length === 0}
                onChange={(event) => setProjectId(event.target.value)}
                value={projectId}
              >
                {projectOptions.length === 0 ? (
                  <option value={projectId}>
                    {projectLoading ? '正在加载项目...' : projectId}
                  </option>
                ) : (
                  projectOptions.map((option) => (
                    <option key={option.projectId} value={option.projectId}>
                      {option.projectId}
                    </option>
                  ))
                )}
              </select>
            </label>

            <div className="rounded-2xl border border-white/80 bg-white/92 px-4 py-2.5 text-sm text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
              <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-400 uppercase">
                Save Status
              </div>
              <div className="mt-1.5 font-medium text-slate-950">{saveStatus}</div>
            </div>

            <div className="rounded-2xl border border-white/80 bg-white/92 px-4 py-2.5 text-sm text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
              <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-400 uppercase">
                Current Selection
              </div>
              <div className="mt-1.5 max-w-[220px] truncate font-medium text-slate-950">
                {selectedComponentName}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            'absolute inset-0 transition-opacity',
            activeWorkspace === 'energy-query'
              ? 'z-20 flex opacity-100'
              : 'pointer-events-none opacity-0',
          )}
        >
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <ModelingEditorCoreModule
              className="h-full w-full"
              onLoad={apiClient.isConfigured ? handleLoad : undefined}
              onSave={apiClient.isConfigured ? handleSave : undefined}
              onSaveStatusChange={setSaveStatus}
              onSelectionChange={setSelection}
              projectId={projectId}
              sidebarTabs={sidebarTabs}
              viewerOverlayOptions={{
                showActionMenu: true,
                showFloatingLevelSelector: false,
                showHelperManager: true,
                showPanelManager: true,
              }}
              viewerToolbarLeft={<DefaultModelingViewerToolbarLeft />}
              viewerToolbarRight={<DefaultModelingViewerToolbarRight />}
            />
          </div>

          <HostRightRail
            energyError={energyError}
            energyLoading={energyLoading}
            energyResult={energyResult}
            filters={filters}
            insightsCollapsed={insightsCollapsed}
            levelOptions={queryModel.levelOptions}
            onFiltersChange={setFilters}
            onInsightsCollapsedChange={setInsightsCollapsed}
            onWidthChange={setInsightsWidth}
            projectId={projectId}
            queryResults={queryModel.results}
            selection={selection}
            width={insightsWidth}
            zoneOptions={queryModel.zoneOptions}
          />
        </div>

        <div
          className={cn(
            'absolute inset-0 transition-opacity',
            activeWorkspace === 'data-analysis'
              ? 'z-20 opacity-100'
              : 'pointer-events-none opacity-0',
          )}
        >
          <DataAnalysisWorkspace
            projectId={projectId}
            queryResults={queryModel.results}
            selectedComponentName={selectedComponentName}
          />
        </div>

        <div
          className={cn(
            'absolute inset-0 transition-opacity',
            activeWorkspace === 'smart-operations'
              ? 'z-20 opacity-100'
              : 'pointer-events-none opacity-0',
          )}
        >
          <SmartOperationsWorkspace
            energyResult={energyResult}
            projectId={projectId}
            queryResults={queryModel.results}
            saveStatus={saveStatus}
            selectedComponentId={selectedComponentId}
            selectedComponentName={selectedComponentName}
          />
        </div>
      </div>
    </main>
  )
}
