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
import HostRightRail from '@/features/energy-insights/components/host-right-rail'
import { loadComponentEnergy, type EnergyApiResponse } from '@/features/energy-insights/lib/energy-api'
import { buildHostQueryModel, type HostQueryFilters } from '@/features/energy-insights/lib/host-query'
import { loadProjectSummaries, type ProjectSummary } from '@/features/host-shell/lib/project-api'

const DEFAULT_PROJECT_ID = 'local-editor'

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'paused' | 'error'

export interface HostWorkbenchProps {
  apiBaseUrl?: string
}

/**
 * 宿主工作台只负责装配页面级能力：
 * 1. 挂载建模核心模块。
 * 2. 维护宿主业务查询状态。
 * 3. 把业务面板作为独立 feature 叠加到编辑器右侧。
 */
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
    <main className="h-screen w-screen overflow-hidden bg-[radial-gradient(circle_at_top,#f8fbff_0%,#edf3fb_40%,#dbe5f2_100%)]">
      <div className="relative h-full w-full overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.35),rgba(255,255,255,0))]" />

        <div className="relative flex h-full w-full overflow-hidden">
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
            onProjectChange={setProjectId}
            onWidthChange={setInsightsWidth}
            projectId={projectId}
            projectLoading={projectLoading}
            projectOptions={projectOptions}
            queryResults={queryModel.results}
            saveStatus={saveStatus}
            selection={selection}
            width={insightsWidth}
            zoneOptions={queryModel.zoneOptions}
          />
        </div>
      </div>
    </main>
  )
}