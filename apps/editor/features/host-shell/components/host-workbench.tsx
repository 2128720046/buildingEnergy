'use client'

import { type AnyNode, emitter, type LevelNode, useScene, type ZoneNode } from '@pascal-app/core'
import {
  applySceneGraphToEditor,
  buildSceneGraphFromReferenceFile,
  useEditor,
} from '@pascal-app/editor'
import {
  DefaultModelingViewerToolbarLeft,
  DefaultModelingViewerToolbarRight,
} from '@pascal-app/editor/chrome'
import { createEditorApiClient } from '@pascal-app/editor/host'
import {
  ModelingEditorCoreModule,
  type ModelingSelectionSnapshot,
  type SceneGraph,
} from '@pascal-app/editor/modeling'
import { useViewer } from '@pascal-app/viewer'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DASHBOARD_ASSETS } from '@/features/analytics/components/dashboard-theme'
import DataAnalysisWorkspace from '@/features/analytics/components/data-analysis-workspace'
import type { AssistantWorkOrderDraft } from '@/features/energy-insights/components/energy-assistant-chat'
import EnergyTwinDashboard from '@/features/energy-insights/components/energy-twin-dashboard'
import HostFilterBar from '@/features/energy-insights/components/host-filter-bar'
import HostRightRail from '@/features/energy-insights/components/host-right-rail'
import {
  type EnergyApiResponse,
  loadComponentEnergy,
  type ZoneEnergyResponse,
} from '@/features/energy-insights/lib/energy-api'
import {
  buildDailySummary,
  classifyRoomType,
  estimateZoneArea,
} from '@/features/energy-insights/lib/energy-mock-data'
import {
  buildHostQueryModel,
  type HostQueryFilters,
} from '@/features/energy-insights/lib/host-query'
import WorkspaceNavigation from '@/features/host-shell/components/workspace-navigation'
import type { HostWorkspace } from '@/features/host-shell/lib/host-workspaces'
import { loadProjectSummaries, type ProjectSummary } from '@/features/host-shell/lib/project-api'
import SmartOperationsWorkspace from '@/features/operations/components/smart-operations-workspace'
import type { OperationsTask } from '@/features/operations/lib/operations-dashboard'
import { cn } from '@/lib/utils'

const DEFAULT_PROJECT_ID = 'building'
const ACTIVE_WORKSPACE_STORAGE_KEY = 'building-energy:active-workspace'
const HOST_WORKSPACE_VALUES = new Set<HostWorkspace>([
  'energy-query',
  'data-analysis',
  'smart-operations',
])
const WORKSPACE_QUERY_KEY = 'workspace'
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
  initialWorkspace?: HostWorkspace
}

function isHostWorkspace(value: string | null): value is HostWorkspace {
  return HOST_WORKSPACE_VALUES.has(value as HostWorkspace)
}

function readPreferredWorkspace(): HostWorkspace {
  if (typeof window === 'undefined') {
    return 'energy-query'
  }

  const urlWorkspace = new URLSearchParams(window.location.search).get(WORKSPACE_QUERY_KEY)
  if (isHostWorkspace(urlWorkspace)) {
    return urlWorkspace
  }

  const storedWorkspace = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)
  return isHostWorkspace(storedWorkspace) ? storedWorkspace : 'energy-query'
}

function persistWorkspace(workspace: HostWorkspace) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspace)

  const url = new URL(window.location.href)
  url.searchParams.set(WORKSPACE_QUERY_KEY, workspace)
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

function HostViewerToolbarRight({
  editEnabled,
  onToggle,
  apiBaseUrl,
  projectId,
}: {
  editEnabled: boolean
  onToggle: () => void
  apiBaseUrl?: string
  projectId: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const handleImport = useCallback(async (file: File | null) => {
    if (!file) return
    // 导入前拍照：保存当前场景，以便失败时恢复
    if (typeof window !== 'undefined') {
      ;(window as any).__preImportSceneSnapshot = JSON.parse(JSON.stringify(useScene.getState().nodes))
      ;(window as any).__preImportRootSnapshot = [...useScene.getState().rootNodeIds]
    }
    setIsImporting(true)
    setImportError(null)

    try {
      const sceneGraph = await buildSceneGraphFromReferenceFile(file)

      // 如果配置了后端，先 GLB 文件再上传到后端，替换 asset:// URL
      if (apiBaseUrl) {
        const isGlb = /\.(glb|gltf)$/i.test(file.name)
        for (const node of Object.values(sceneGraph.nodes) as any[]) {
          if (isGlb && node?.type === 'scan' && typeof node?.url === 'string' && node.url.startsWith('asset://')) {
            // 重新上传原始文件到后端
            const uploadUrl = `${apiBaseUrl.replace(/\/+$/, '')}/projects/${encodeURIComponent(projectId)}/assets?filename=${encodeURIComponent(file.name)}`
            const uploadRes = await fetch(uploadUrl, { method: 'POST', body: file })
            if (uploadRes.ok) {
              const result = await uploadRes.json() as { url: string }
              node.url = result.url.startsWith('http') ? result.url : `${apiBaseUrl}${result.url}`
            }
          }
        }
      }

      applySceneGraphToEditor(sceneGraph)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      setImportError(msg)
      console.error('[host] failed to import reference', error)
    } finally {
      setIsImporting(false)
    }
  }, [apiBaseUrl, projectId])

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

      {/* 导入失败对话框 */}
      {importError ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60">
          <div className="w-[360px] rounded-xl border border-white/8 bg-[#0C0E14] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.7)]">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15 text-red-400 text-xs font-bold">!</span>
              <h3 className="font-semibold text-white/90 text-sm">导入模型失败</h3>
            </div>
            <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-white/60">
              <p>未能成功导入所选文件。常见原因：</p>
              <ul className="space-y-1 pl-3">
                <li>文件格式不受支持（支持 .glb/.gltf/.svg/.json 或图片）</li>
                <li>文件已损坏或不是有效的 3D 模型</li>
                <li>文件中不包含可解析的场景数据</li>
              </ul>
              {importError ? (
                <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/8 px-2.5 py-2 font-mono text-[11px] text-red-300/80 leading-relaxed">
                  {importError}
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex gap-3">
              <button
                className="flex-1 rounded-lg border border-white/8 bg-white/10 px-4 py-2 text-[12px] font-medium text-white/80 transition-colors hover:bg-white/15"
                onClick={() => {
                  // 恢复导入前的场景
                  const snapshot =
                    typeof window !== 'undefined' ? (window as any).__preImportSceneSnapshot : null
                  const rootSnapshot =
                    typeof window !== 'undefined' ? (window as any).__preImportRootSnapshot : null
                  if (snapshot) {
                    useScene.setState({ nodes: snapshot, rootNodeIds: rootSnapshot ?? [] })
                    Object.keys(snapshot).forEach((id) => useScene.getState().markDirty(id as any))
                    useScene.temporal.getState().clear()
                  }
                  delete (window as any).__preImportSceneSnapshot
                  delete (window as any).__preImportRootSnapshot
                  setImportError(null)
                }}
                type="button"
              >
                恢复导入前场景
              </button>
              <button
                className="flex-1 rounded-lg border border-white/8 bg-white/10 px-4 py-2 text-[12px] font-medium text-white/80 transition-colors hover:bg-white/15"
                onClick={() => setImportError(null)}
                type="button"
              >
                仅关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function HostWorkbench({
  apiBaseUrl,
  initialWorkspace = 'energy-query',
}: HostWorkbenchProps) {
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
  const [activeWorkspace, setActiveWorkspace] = useState<HostWorkspace>(initialWorkspace)
  const [activeRightRailModule, setActiveRightRailModule] = useState<'query' | 'operations'>(
    'query',
  )
  const [draftFilters, setDraftFilters] = useState<HostQueryFilters>(DEFAULT_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<HostQueryFilters>(DEFAULT_FILTERS)
  const [hasQueried, setHasQueried] = useState(false)
  const [editEnabled, setEditEnabled] = useState(true)
  const [generatedWorkOrders, setGeneratedWorkOrders] = useState<OperationsTask[]>([])
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

  const draftQueryModel = useMemo(
    () => buildHostQueryModel(nodes, draftFilters),
    [nodes, draftFilters],
  )
  const appliedQueryModel = useMemo(
    () => buildHostQueryModel(nodes, appliedFilters),
    [appliedFilters, nodes],
  )
  const queryResults = hasQueried ? appliedQueryModel.results : []

  const selectedComponentId = selection?.selectedIds[0] ?? null
  const selectedNodeType = selection?.selectedNodes[0]?.type
  const selectedComponentName =
    (selection?.selectedNodes[0]?.name as string | undefined) ?? selectedComponentId ?? '未选中构件'

  const handleLoad = useCallback(async () => apiClient.loadScene(), [apiClient])
  const handleSave = useCallback(
    async (scene: SceneGraph) => apiClient.saveScene(scene),
    [apiClient],
  )
  const handleSubmitQuery = useCallback(() => {
    setAppliedFilters(draftFilters)
    setHasQueried(true)
  }, [draftFilters])

  const handleWorkspaceChange = useCallback((workspace: HostWorkspace) => {
    setActiveWorkspace(workspace)
    persistWorkspace(workspace)
  }, [])

  useEffect(() => {
    const syncWorkspace = () => {
      const preferredWorkspace = readPreferredWorkspace()
      setActiveWorkspace((current) =>
        current === preferredWorkspace ? current : preferredWorkspace,
      )
    }
    syncWorkspace()

    const interval = window.setInterval(syncWorkspace, 1000)
    window.addEventListener('focus', syncWorkspace)
    window.addEventListener('pageshow', syncWorkspace)
    window.addEventListener('storage', syncWorkspace)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', syncWorkspace)
      window.removeEventListener('pageshow', syncWorkspace)
      window.removeEventListener('storage', syncWorkspace)
    }
  }, [])

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editSnapshot, setEditSnapshot] = useState<Record<string, AnyNode> | null>(null)
  const pendingEditToggleRef = useRef(false)

  const handleToggleEdit = useCallback(() => {
    if (!editEnabled) {
      // 进入编辑：保存快照（改为 state，触发 React 重渲染传递 props）
      const clone = JSON.parse(JSON.stringify(nodes)) as Record<string, AnyNode>
      setEditSnapshot(clone)
      setEditEnabled(true)
      return
    }
    // 退出编辑：检测是否有修改（节点内容是否变化）
    let hasChanges = false
    if (editSnapshot) {
      const cur = JSON.stringify(nodes)
      const snap = JSON.stringify(editSnapshot)
      hasChanges = cur !== snap
    }

    if (hasChanges) {
      pendingEditToggleRef.current = true
      setEditDialogOpen(true)
    } else {
      setEditSnapshot(null)
      if (mode !== 'select') setMode('select')
      setEditEnabled(false)
    }
  }, [editEnabled, mode, setMode, nodes, editSnapshot])

  const handleSaveEdits = useCallback(() => {
    useScene.temporal.getState().clear()
    setEditSnapshot(null)
    setEditDialogOpen(false)
    if (pendingEditToggleRef.current) {
      pendingEditToggleRef.current = false
      if (mode !== 'select') setMode('select')
      setEditEnabled(false)
    }
  }, [mode, setMode])

  const handleDiscardEdits = useCallback(() => {
    // RAF 确保在 React 批处理外恢复状态
    requestAnimationFrame(() => {
      const stored = editSnapshot // 从闭包捕获当时的快照
      if (stored) {
        useScene.setState({ nodes: stored as any })
        // 强制标记所有节点 dirty，确保 UI 刷新
        const s = useScene.getState()
        Object.keys(stored).forEach((id) => s.markDirty(id as any))
        useScene.temporal.getState().clear()
      }
    })
    setEditSnapshot(null)
    setEditDialogOpen(false)
    if (pendingEditToggleRef.current) {
      pendingEditToggleRef.current = false
      if (mode !== 'select') setMode('select')
      setEditEnabled(false)
    }
  }, [mode, setMode, editSnapshot])

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

    handleWorkspaceChange('energy-query')
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
  }, [handleWorkspaceChange, nodes])

  const handleCreateWorkOrder = useCallback((draft: AssistantWorkOrderDraft) => {
    const nextTask: OperationsTask = {
      assignee: draft.assignee,
      due: draft.due,
      id: `assistant-order-${Date.now()}`,
      title: draft.title,
    }

    setGeneratedWorkOrders((current) => [nextTask, ...current].slice(0, 6))
  }, [])

  const cockpitToolbar = (
    <HostViewerToolbarRight
      apiBaseUrl={apiBaseUrl}
      editEnabled={editEnabled}
      onToggle={handleToggleEdit}
      projectId={projectId}
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
    setGeneratedWorkOrders([])
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

      if (
        selection.zoneId !== null ||
        selection.levelId !== levelId ||
        pendingSelectedIds !== selection.selectedIds
      ) {
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
  }, [draftFilters.levelId, draftFilters.zoneId, hoveredId, isSelectionDebugEnabled, nodes])

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
          const zoneNode = nodes[selectedComponentId as ZoneNode['id']] as ZoneNode | undefined
          if (zoneNode && Array.isArray(zoneNode.polygon) && zoneNode.polygon.length >= 3) {
            const area = estimateZoneArea(zoneNode.polygon)
            const roomType = classifyRoomType(zoneNode.name || zoneNode.id)
            const d = new Date()
            const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            const summary = buildDailySummary(zoneNode.id, roomType, area, date)
            const zoneResponse: ZoneEnergyResponse = {
              type: 'zone',
              projectId,
              zoneId: zoneNode.id,
              total_electricity_kwh: summary.total_electricity_kwh,
              total_hvac_kwh: summary.total_hvac_kwh,
              total_lighting_kwh: summary.total_lighting_kwh,
              total_socket_kwh: summary.total_socket_kwh,
              total_water_m3: summary.total_water_m3,
              peak_power_kw: summary.peak_power_kw,
              indoor_temp: summary.avg_indoor_temp_c,
              indoor_humidity: summary.avg_indoor_humidity_pct,
              outdoor_temp: 30,
              outdoor_humidity: 55,
              precipitation_mm: 0,
              occupancy_density: summary.avg_occupancy,
              co2_ppm: Math.round(summary.hourly.reduce((s, r) => s + r.co2_ppm, 0) / 24),
              pm25_ugm3: Math.round(summary.hourly.reduce((s, r) => s + r.pm25_ugm3, 0) / 24),
              series: summary.hourly.map((r) => ({
                time: `${String(r.hour).padStart(2, '0')}:00`,
                value: r.electricity_kwh,
              })),
              updatedAt: new Date().toISOString(),
            }
            if (!cancelled) {
              setEnergyResult(null)
              setEnergyResultZone(zoneResponse)
            }
          }
          return
        }

        const itemResponse = await loadComponentEnergy(apiBaseUrl, projectId, selectedComponentId)
        if (cancelled) return
        setEnergyResult(itemResponse)

        const componentInfo = appliedQueryModel.results.find(
          (result) => result.componentId === selectedComponentId,
        )
        if (!componentInfo?.zoneId) {
          setEnergyResultZone(null)
          return
        }

        const zoneNode = nodes[componentInfo.zoneId as ZoneNode['id']] as ZoneNode | undefined
        if (zoneNode && Array.isArray(zoneNode.polygon) && zoneNode.polygon.length >= 3) {
          const area = estimateZoneArea(zoneNode.polygon)
          const roomType = classifyRoomType(zoneNode.name || zoneNode.id)
          const d = new Date()
          const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          const summary = buildDailySummary(zoneNode.id, roomType, area, date)
          const zoneResponse: ZoneEnergyResponse = {
            type: 'zone',
            projectId,
            zoneId: zoneNode.id,
            total_electricity_kwh: summary.total_electricity_kwh,
            total_hvac_kwh: summary.total_hvac_kwh,
            total_lighting_kwh: summary.total_lighting_kwh,
            total_socket_kwh: summary.total_socket_kwh,
            total_water_m3: summary.total_water_m3,
            peak_power_kw: summary.peak_power_kw,
            indoor_temp: summary.avg_indoor_temp_c,
            indoor_humidity: summary.avg_indoor_humidity_pct,
            outdoor_temp: 30,
            outdoor_humidity: 55,
            precipitation_mm: 0,
            occupancy_density: summary.avg_occupancy,
            co2_ppm: Math.round(summary.hourly.reduce((s, r) => s + r.co2_ppm, 0) / 24),
            pm25_ugm3: Math.round(summary.hourly.reduce((s, r) => s + r.pm25_ugm3, 0) / 24),
            series: summary.hourly.map((r) => ({
              time: `${String(r.hour).padStart(2, '0')}:00`,
              value: r.electricity_kwh,
            })),
            updatedAt: new Date().toISOString(),
          }
          if (!cancelled) setEnergyResultZone(zoneResponse)
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
        activeWorkspace === 'energy-query' || activeWorkspace === 'data-analysis'
          ? 'bg-[#030712] text-slate-100'
          : 'bg-[radial-gradient(circle_at_top,#f8fbff_0%,#edf3fb_40%,#dbe5f2_100%)]',
      )}
    >
      <header
        className={cn(
          'relative z-40 border-b px-4 backdrop-blur-md',
          activeWorkspace === 'data-analysis'
            ? 'border-cyan-300/10 bg-[linear-gradient(180deg,rgba(2,8,23,0.18)_0%,rgba(2,8,23,0)_100%)] py-2 shadow-[0_8px_34px_rgba(0,212,255,0.08)]'
            : 'border-white/6 bg-transparent py-3',
        )}
      >
        <div
          className={cn(
            'relative w-full',
            activeWorkspace === 'data-analysis'
              ? 'flex min-h-[56px] items-center'
              : 'grid grid-cols-1',
          )}
        >
          <WorkspaceNavigation activeWorkspace={activeWorkspace} onChange={handleWorkspaceChange} />
          {activeWorkspace === 'energy-query' ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="min-w-0 flex-1 overflow-hidden">
                <HostFilterBar
                  filters={draftFilters}
                  hasQueried={hasQueried}
                  levelOptions={draftQueryModel.levelOptions}
                  onFiltersChange={setDraftFilters}
                  onQuery={handleSubmitQuery}
                  resultCount={queryResults.length}
                  variant="cockpit"
                  zoneOptions={draftQueryModel.zoneOptions}
                />
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
                {cockpitToolbar ? (
                  <div className="glass-panel whitespace-nowrap rounded border border-white/6 px-2 py-0.5">
                    {cockpitToolbar}
                  </div>
                ) : null}
                <div className="whitespace-nowrap text-right">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">项目</div>
                  <div className="text-sm text-white/70">{projectId}</div>
                </div>
              </div>
            </div>
          ) : activeWorkspace === 'data-analysis' ? (
            <div className="pointer-events-none absolute left-1/2 top-1/2 flex w-[min(46vw,620px)] -translate-x-1/2 -translate-y-1/2 justify-center">
              <img
                alt="数据分析标题"
                className="h-auto w-full max-w-full object-contain"
                draggable={false}
                src={DASHBOARD_ASSETS.pageTitle}
              />
            </div>
          ) : null}
        </div>
      </header>

      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden',
          activeWorkspace === 'data-analysis' ? 'px-0 pb-0' : 'px-4 pb-3',
        )}
      >
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
              assetUploadBaseUrl={apiBaseUrl ?? undefined}
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
              viewerToolbarLeft={
                activeWorkspace === 'energy-query' ? null : <DefaultModelingViewerToolbarLeft />
              }
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
                zoneOptions={draftQueryModel.zoneOptions}
                editSnapshot={editSnapshot}
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
            generatedTasks={generatedWorkOrders}
            onCreateWorkOrder={handleCreateWorkOrder}
            projectId={projectId}
            queryResults={queryResults}
            saveStatus={saveStatus}
            selectedComponentId={selectedComponentId}
            selectedComponentName={selectedComponentName}
          />
        </div>
      </div>

      {/* 编辑保存确认对话框 */}
      {editDialogOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60">
          <div className="w-[320px] rounded border border-white/8 bg-[#0C0E14] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.7)]">
            <div className="mb-4 text-center">
              <div className="text-[15px] font-semibold text-white/90">保存模型修改？</div>
              <div className="mt-2 text-[12px] leading-relaxed text-white/50">
                您在编辑模式下对模型做了修改。<br />是否保存这些修改？
              </div>
            </div>
            <div className="flex gap-3">
              <button
                className="flex-1 rounded border border-white/8 bg-white/10 py-2 text-[12px] font-medium text-white/70 transition hover:bg-white/15"
                onClick={handleDiscardEdits}
                type="button"
              >
                放弃
              </button>
              <button
                className="flex-1 rounded border border-[#00F5FF]/40 bg-[#00F5FF]/15 py-2 text-[12px] font-medium text-[#00F5FF] transition hover:bg-[#00F5FF]/25"
                onClick={handleSaveEdits}
                type="button"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
