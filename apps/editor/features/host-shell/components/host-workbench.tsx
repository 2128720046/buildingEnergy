'use client'

import { emitter, useScene, type AnyNode, type LevelNode, type ZoneNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import {
  ModelingEditorCoreModule,
  type ModelingSelectionSnapshot,
  type SceneGraph,
} from '@pascal-app/editor/modeling'
import {
  DefaultModelingViewerToolbarLeft,
  DefaultModelingViewerToolbarRight,
} from '@pascal-app/editor/chrome'
import { applySceneGraphToEditor, buildSceneGraphFromReferenceFile, useEditor } from '@pascal-app/editor'
import { createEditorApiClient } from '@pascal-app/editor/host'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DataAnalysisWorkspace from '@/features/analytics/components/data-analysis-workspace'
import EnergyTwinDashboard from '@/features/energy-insights/components/energy-twin-dashboard'
import HostRightRail from '@/features/energy-insights/components/host-right-rail'
import {
  loadComponentEnergy,
  loadZoneEnergy,
  type EnergyApiResponse,
  type ZoneEnergyResponse,
} from '@/features/energy-insights/lib/energy-api'
import { buildHostQueryModel, type HostQueryFilters } from '@/features/energy-insights/lib/host-query'
import WorkspaceNavigation from '@/features/host-shell/components/workspace-navigation'
import type { HostWorkspace } from '@/features/host-shell/lib/host-workspaces'
import { loadProjectSummaries, type ProjectSummary } from '@/features/host-shell/lib/project-api'
import SmartOperationsWorkspace from '@/features/operations/components/smart-operations-workspace'
import { cn } from '@/lib/utils'

const DEFAULT_PROJECT_ID = 'local-editor'
const DEFAULT_FILTERS: HostQueryFilters = {
  keyword: '',
  levelId: '',
  zoneId: '',
  timeRange: '24h',
  energyLevel: '',
}

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'paused' | 'error'

export interface HostWorkbenchProps {
  apiBaseUrl?: string
}

function HostViewerToolbarRight({
  editEnabled,
  onToggle,
}: {
  editEnabled: boolean
  onToggle: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)

  const handleImport = useCallback(async (file: File | null) => {
    if (!file) return
    setIsImporting(true)

    try {
      const sceneGraph = await buildSceneGraphFromReferenceFile(file)
      applySceneGraphToEditor(sceneGraph)
    } catch (error) {
      console.error('[host] failed to import reference', error)
    } finally {
      setIsImporting(false)
    }
  }, [])

  return (
    <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
      <DefaultModelingViewerToolbarRight />
      <button
        className="inline-flex h-8 items-center rounded-xl border border-slate-300/60 bg-slate-900/95 px-3 font-medium text-white text-xs transition-colors hover:bg-slate-800"
        disabled={isImporting}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        导入
      </button>
      <button
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium transition-colors',
          editEnabled
            ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/22'
            : 'border-amber-400/35 bg-amber-500/15 text-amber-100 hover:bg-amber-500/22',
        )}
        onClick={onToggle}
        type="button"
      >
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
          {editEnabled ? (
            <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24">
              <path
                d="M4 16.75V20h3.25l9.58-9.58-3.25-3.25L4 16.75Zm13.75-10.5a.92.92 0 0 0 0-1.3l-1.7-1.7a.92.92 0 0 0-1.3 0l-1.33 1.33 3.25 3.25 1.08-1.08Z"
                fill="currentColor"
              />
            </svg>
          ) : (
            <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24">
              <path
                d="M12 2.75A4.25 4.25 0 0 0 7.75 7v1.5H7A2.75 2.75 0 0 0 4.25 11v8A2.75 2.75 0 0 0 7 21.75h10A2.75 2.75 0 0 0 19.75 19v-8A2.75 2.75 0 0 0 17 8.5h-.75V7A4.25 4.25 0 0 0 12 2.75Zm-2.75 5.75V7a2.75 2.75 0 1 1 5.5 0v1.5h-5.5Z"
                fill="currentColor"
              />
            </svg>
          )}
        </span>
        {editEnabled ? '编辑中' : '只读'}
      </button>
      <input
        accept=".svg,.json,.glb,.gltf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null
          event.currentTarget.value = ''
          void handleImport(file)
        }}
        ref={inputRef}
        type="file"
      />
    </div>
  )
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
  const [energyResultZone, setEnergyResultZone] = useState<ZoneEnergyResponse | null>(null)
  const [energyLoading, setEnergyLoading] = useState(false)
  const [energyError, setEnergyError] = useState<string | null>(null)
  const [insightsCollapsed, setInsightsCollapsed] = useState(false)
  const [insightsWidth, setInsightsWidth] = useState(432)
  const [activeWorkspace, setActiveWorkspace] = useState<HostWorkspace>('energy-query')
  const [activeRightRailModule, setActiveRightRailModule] = useState<'query' | 'operations'>('query')
  const [draftFilters, setDraftFilters] = useState<HostQueryFilters>(DEFAULT_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<HostQueryFilters>(DEFAULT_FILTERS)
  const [hasQueried, setHasQueried] = useState(false)
  const [editEnabled, setEditEnabled] = useState(true)
  const useTwinCockpit = true
  const mode = useEditor((state) => state.mode)
  const setMode = useEditor((state) => state.setMode)
  const hoveredId = useViewer((state) => state.hoveredId)
  const lastFocusedZoneRef = useRef<ZoneNode['id'] | null>(null)
  const pendingLevelZoneHighlightRef = useRef<{
    levelId: LevelNode['id']
    zoneIds: ZoneNode['id'][]
  } | null>(null)

  const nodes = useScene((state) => state.nodes) as Record<string, AnyNode>

  const isSelectionDebugEnabled = useCallback(() => {
    if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') {
      return false
    }

    return (
      window.localStorage.getItem('editor:debug:selection') === '1' ||
      window.location.search.includes('debugSelection=1')
    )
  }, [])

  const apiClient = useMemo(
    () => createEditorApiClient({ baseUrl: apiBaseUrl ?? undefined, projectId }),
    [apiBaseUrl, projectId],
  )

  const draftQueryModel = useMemo(() => buildHostQueryModel(nodes, draftFilters), [nodes, draftFilters])
  const appliedQueryModel = useMemo(
    () => buildHostQueryModel(nodes, appliedFilters),
    [appliedFilters, nodes],
  )
  const queryResults = hasQueried ? appliedQueryModel.results : []

  const selectedComponentId = selection?.selectedIds[0] ?? null
  const selectedNodeType = selection?.selectedNodes[0]?.type
  const selectedComponentName =
    (selection?.selectedNodes[0]?.name as string | undefined) ??
    selectedComponentId ??
    '未选中构件'

  const handleLoad = useCallback(async () => apiClient.loadScene(), [apiClient])
  const handleSave = useCallback(async (scene: SceneGraph) => apiClient.saveScene(scene), [apiClient])
  const handleSubmitQuery = useCallback(() => {
    setAppliedFilters(draftFilters)
    setHasQueried(true)
  }, [draftFilters])

  const handleToggleEdit = useCallback(() => {
    if (editEnabled && mode !== 'select') {
      setMode('select')
    }
    setEditEnabled((current) => !current)
  }, [editEnabled, mode, setMode])

  const handleJumpToLevel3HighlightZones = useCallback(() => {
    const levelNodes = Object.values(nodes)
      .filter((node): node is LevelNode => node.type === 'level')
      .sort((left, right) => left.level - right.level)
    const targetLevel =
      levelNodes[2] ??
      levelNodes.find((node) => {
        const levelName = (node.name || '').replace(/\s+/g, '').toLowerCase()
        return levelName.includes('3') || levelName.includes('三')
      })

    if (!targetLevel) {
      return
    }

    const targetLevelId = targetLevel.id as LevelNode['id']
    const zoneIds = Object.values(nodes)
      .filter((node): node is ZoneNode => node.type === 'zone' && node.parentId === targetLevelId)
      .map((node) => node.id as ZoneNode['id'])
    pendingLevelZoneHighlightRef.current = {
      levelId: targetLevelId,
      zoneIds,
    }

    setActiveWorkspace('energy-query')
    setDraftFilters((prev) => ({
      ...prev,
      levelId: targetLevelId as string,
      zoneId: '',
    }))
    setAppliedFilters((prev) => ({
      ...prev,
      levelId: targetLevelId as string,
      zoneId: '',
    }))
    setHasQueried(true)

    const viewer = useViewer.getState()
    viewer.setSelection({
      levelId: targetLevelId as LevelNode['id'],
      zoneId: null,
      selectedIds: zoneIds,
    })
    viewer.setHoveredId(null)
    viewer.setLevelMode('solo')

  }, [nodes])

  const cockpitToolbar = (
    <HostViewerToolbarRight
      editEnabled={editEnabled}
      onToggle={handleToggleEdit}
    />
  )

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
    setEnergyResultZone(null)
    setEnergyError(null)
    setEnergyLoading(false)
    setHasQueried(false)
    setDraftFilters(DEFAULT_FILTERS)
    setAppliedFilters(DEFAULT_FILTERS)
  }, [projectId])

  useEffect(() => {
    useScene.getState().setReadOnly(!editEnabled)

    return () => {
      useScene.getState().setReadOnly(false)
    }
  }, [editEnabled])

  useEffect(() => {
    // Keep room filter consistent with selected floor.
    if (!(draftFilters.levelId && draftFilters.zoneId)) return

    const zoneNode = nodes[draftFilters.zoneId as ZoneNode['id']]
    const zoneParentLevelId = zoneNode?.type === 'zone' ? (zoneNode.parentId as string) : null

    if (zoneParentLevelId === draftFilters.levelId) return

    setDraftFilters((prev) => ({ ...prev, zoneId: '' }))
    setAppliedFilters((prev) => {
      if (!(prev.levelId && prev.zoneId)) return prev
      const appliedZoneNode = nodes[prev.zoneId as ZoneNode['id']]
      const appliedZoneParentLevelId =
        appliedZoneNode?.type === 'zone' ? (appliedZoneNode.parentId as string) : null
      return appliedZoneParentLevelId === prev.levelId ? prev : { ...prev, zoneId: '' }
    })
  }, [draftFilters.levelId, draftFilters.zoneId, nodes])

  useEffect(() => {
    const viewer = useViewer.getState()
    const selection = viewer.selection
    const zoneId = (draftFilters.zoneId || null) as ZoneNode['id'] | null

    if (zoneId) {
      const zoneNode = nodes[zoneId]
      const levelId =
        zoneNode?.type === 'zone'
          ? (zoneNode.parentId as LevelNode['id'])
          : ((draftFilters.levelId || null) as LevelNode['id'] | null)

      if (selection.zoneId !== zoneId || selection.levelId !== (levelId || null)) {
        viewer.setSelection({
          levelId: levelId || null,
          zoneId,
          selectedIds: [],
        })
        if (isSelectionDebugEnabled()) {
          console.debug('[host-selection-sync] apply zone filter', {
            draftLevelId: draftFilters.levelId || null,
            draftZoneId: zoneId,
            nextLevelId: levelId || null,
            previousSelection: selection,
          })
        }
      }
      if (hoveredId !== null) {
        viewer.setHoveredId(null)
      }
      viewer.setLevelMode('solo')

      if (lastFocusedZoneRef.current !== zoneId) {
        emitter.emit('camera-controls:focus', { nodeId: zoneId })
        lastFocusedZoneRef.current = zoneId
      }
      return
    }

    lastFocusedZoneRef.current = null
    if (hoveredId !== null) {
      viewer.setHoveredId(null)
    }

    if (draftFilters.levelId) {
      const levelId = draftFilters.levelId as LevelNode['id']
      const pendingHighlight = pendingLevelZoneHighlightRef.current
      const pendingSelectedIds =
        pendingHighlight && pendingHighlight.levelId === levelId
          ? pendingHighlight.zoneIds
          : selection.selectedIds

      if (selection.zoneId !== null || selection.levelId !== levelId || pendingSelectedIds !== selection.selectedIds) {
        viewer.setSelection({ levelId, zoneId: null, selectedIds: pendingSelectedIds })
        if (isSelectionDebugEnabled()) {
          console.debug('[host-selection-sync] apply level filter', {
            draftLevelId: levelId,
            previousSelection: selection,
          })
        }
      }

      if (pendingHighlight && pendingHighlight.levelId === levelId) {
        emitter.emit('camera-controls:focus', {
          nodeId: (pendingHighlight.zoneIds[0] ?? levelId) as AnyNode['id'],
        })
        pendingLevelZoneHighlightRef.current = null
      }

      viewer.setLevelMode('solo')
      return
    }

    if (selection.zoneId !== null || selection.levelId !== null) {
      viewer.setSelection({
        levelId: null,
        zoneId: null,
        selectedIds: selection.selectedIds,
      })
      if (isSelectionDebugEnabled()) {
        console.debug('[host-selection-sync] clear level and zone filters', {
          previousSelection: selection,
        })
      }
    }
    viewer.setLevelMode('stacked')
  }, [
    draftFilters.levelId,
    draftFilters.zoneId,
    hoveredId,
    isSelectionDebugEnabled,
    nodes,
  ])

  useEffect(() => {
    let cancelled = false

    async function syncEnergyResult() {
      if (!hasQueried || !selectedComponentId) {
        setEnergyResult(null)
        setEnergyResultZone(null)
        setEnergyError(null)
        setEnergyLoading(false)
        return
      }

      setEnergyLoading(true)
      setEnergyError(null)

      try {
        if (selectedNodeType === 'zone') {
          const zoneResponse = await loadZoneEnergy(apiBaseUrl, projectId, selectedComponentId)
          if (!cancelled) {
            setEnergyResult(null)
            setEnergyResultZone(zoneResponse)
          }
          return
        }

        const itemResponse = await loadComponentEnergy(apiBaseUrl, projectId, selectedComponentId)
        if (cancelled) {
          return
        }

        setEnergyResult(itemResponse)

        const componentInfo = appliedQueryModel.results.find(
          (result) => result.componentId === selectedComponentId,
        )

        if (!componentInfo?.zoneId) {
          setEnergyResultZone(null)
          return
        }

        const zoneResponse = await loadZoneEnergy(apiBaseUrl, projectId, componentInfo.zoneId)
        if (!cancelled) {
          setEnergyResultZone(zoneResponse)
        }
      } catch (error) {
        if (!cancelled) {
          setEnergyResult(null)
          setEnergyResultZone(null)
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
  }, [
    apiBaseUrl,
    appliedQueryModel.results,
    hasQueried,
    projectId,
    selectedComponentId,
    selectedNodeType,
  ])

  return (
    <main
      className={cn(
        'flex h-screen w-screen flex-col overflow-hidden text-slate-950',
        activeWorkspace === 'energy-query'
          ? 'bg-[#050505] text-slate-100'
          : 'bg-[radial-gradient(circle_at_top,#f8fbff_0%,#edf3fb_40%,#dbe5f2_100%)]',
      )}
    >
      <header className="relative z-40 border-b border-white/60 bg-white/70 px-4 py-3 backdrop-blur-xl">
        <div className="flex w-full justify-start">
          <WorkspaceNavigation
            activeWorkspace={activeWorkspace}
            onChange={setActiveWorkspace}
          />
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden px-4 pb-3">

        <div
          className={cn(
            'absolute inset-0 transition-opacity',
            activeWorkspace === 'energy-query'
              ? 'z-20 opacity-100'
              : 'pointer-events-none opacity-0',
          )}
        >
          <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
            <ModelingEditorCoreModule
              className="h-full w-full"
              onLoad={apiClient.isConfigured ? handleLoad : undefined}
              onSave={apiClient.isConfigured ? handleSave : undefined}
              onSaveStatusChange={setSaveStatus}
              onSelectionChange={setSelection}
              projectId={projectId}
              sidebarTabs={[]}
              viewerOverlayOptions={{
                showActionMenu: editEnabled,
                showFloatingActionMenu: editEnabled,
                showFloatingLevelSelector: false,
                showHelperManager: true,
                showPanelManager: editEnabled,
              }}
              viewerToolbarLeft={activeWorkspace === 'energy-query' ? null : <DefaultModelingViewerToolbarLeft />}
              viewerToolbarRight={activeWorkspace === 'energy-query' ? null : cockpitToolbar}
            />

            {useTwinCockpit ? (
              <EnergyTwinDashboard
                energyError={energyError}
                energyLoading={energyLoading}
                energyResult={energyResult}
                energyResultZone={energyResultZone}
                filters={draftFilters}
                hasQueried={hasQueried}
                levelOptions={draftQueryModel.levelOptions}
                onFiltersChange={setDraftFilters}
                onJumpToLevel3HighlightZones={handleJumpToLevel3HighlightZones}
                onQuery={handleSubmitQuery}
                projectId={projectId}
                queryResults={queryResults}
                selectedComponentId={selectedComponentId}
                selectedComponentName={selectedComponentName}
                topToolbar={cockpitToolbar}
                zoneOptions={draftQueryModel.zoneOptions}
              />
            ) : (
              <HostRightRail
                activeModule={activeRightRailModule}
                energyError={energyError}
                energyLoading={energyLoading}
                energyResult={energyResult}
                energyResultZone={energyResultZone}
                filters={draftFilters}
                hasQueried={hasQueried}
                insightsCollapsed={insightsCollapsed}
                levelOptions={draftQueryModel.levelOptions}
                onFiltersChange={setDraftFilters}
                onInsightsCollapsedChange={setInsightsCollapsed}
                onModuleChange={setActiveRightRailModule}
                onQuery={handleSubmitQuery}
                onWidthChange={setInsightsWidth}
                projectId={projectId}
                queryResults={queryResults}
                saveStatus={saveStatus}
                selection={selection}
                width={insightsWidth}
                zoneOptions={draftQueryModel.zoneOptions}
              />
            )}
          </div>
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
            queryResults={queryResults}
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
            queryResults={queryResults}
            saveStatus={saveStatus}
            selectedComponentId={selectedComponentId}
            selectedComponentName={selectedComponentName}
          />
        </div>
      </div>
    </main>
  )
}
