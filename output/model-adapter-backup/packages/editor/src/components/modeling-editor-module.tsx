'use client'

import { saveAsset, useScene } from '@pascal-app/core'
import type { AnyNode, AnyNodeId, LevelNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { ScanNode } from '@pascal-app/core'
import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { useUploadStore } from '../store/use-upload'
import type { EditorProps } from './editor'
import Editor from './editor'
import {
  createDefaultModelingSidebarTabs,
  DefaultModelingViewerToolbarLeft,
  DefaultModelingViewerToolbarRight,
} from './modeling-chrome-modules'
import { cn } from '../lib/utils'

export type ModelingSelectionSnapshot = {
  buildingId: string | null
  levelId: string | null
  zoneId: string | null
  selectedIds: string[]
  buildingNode: Record<string, unknown> | null
  levelNode: Record<string, unknown> | null
  zoneNode: Record<string, unknown> | null
  selectedNodes: Record<string, unknown>[]
}

function SelectionBridge({
  onSelectionChange,
}: {
  onSelectionChange?: (snapshot: ModelingSelectionSnapshot) => void
}) {
  const selection = useViewer((state) => state.selection)
  const nodes = useScene((state) => state.nodes)
  const sceneNodes = nodes as Record<string, Record<string, unknown> | undefined>

  useEffect(() => {
    if (!onSelectionChange) {
      return
    }

    onSelectionChange({
      buildingId: selection.buildingId,
      levelId: selection.levelId,
      zoneId: selection.zoneId,
      selectedIds: selection.selectedIds,
      buildingNode: selection.buildingId ? (sceneNodes[selection.buildingId] ?? null) : null,
      levelNode: selection.levelId ? (sceneNodes[selection.levelId] ?? null) : null,
      zoneNode: selection.zoneId ? (sceneNodes[selection.zoneId] ?? null) : null,
      selectedNodes: selection.selectedIds
        .map((id) => sceneNodes[id])
        .filter((node): node is Record<string, unknown> => Boolean(node)),
    })
  }, [nodes, onSelectionChange, selection])

  return null
}

/**
 * Upload a File to the backend asset store. Returns the absolute backend URL.
 */
async function uploadAssetToBackend(
  file: File,
  assetUploadUrl: string,
  baseUrl: string,
): Promise<string> {
  const response = await fetch(assetUploadUrl, {
    method: 'POST',
    body: file,
    headers: { 'Content-Type': 'application/octet-stream' },
  })
  if (!response.ok) {
    throw new Error(`Asset upload failed: ${response.status}`)
  }
  const result = await response.json() as { url: string }
  // Backend returns relative path like /projects/{id}/assets/{name}
  // Prepend base URL to make it absolute so it works from any origin
  return result.url.startsWith('http') ? result.url : `${baseUrl.replace(/\/+$/, '')}${result.url}`
}

export interface ModelingEditorCoreModuleProps
  extends Omit<EditorProps, 'layoutVersion' | 'viewerToolbarLeft' | 'viewerToolbarRight' | 'sidebarTabs'> {
  className?: string
  viewerToolbarLeft?: ReactNode
  viewerToolbarRight?: ReactNode
  sidebarTabs?: EditorProps['sidebarTabs']
  onSelectionChange?: (snapshot: ModelingSelectionSnapshot) => void
  /** Backend API base URL for asset uploads (e.g. http://localhost:3010) */
  assetUploadBaseUrl?: string
}

/**
 * 建模核心模块：只负责编辑区基础能力，不主动捆绑导航、默认工具栏或默认侧栏标签。
 * 宿主如果想完全自行组装界面，应优先使用这个模块。
 */
export function ModelingEditorCoreModule({
  projectId,
  className,
  sidebarTabs,
  viewerToolbarLeft,
  viewerToolbarRight,
  onSelectionChange,
  assetUploadBaseUrl,
  ...props
}: ModelingEditorCoreModuleProps) {
  const assetUploadBaseUrlRef = useRef(assetUploadBaseUrl)
  assetUploadBaseUrlRef.current = assetUploadBaseUrl

  // 注册扫描模型上传 handler，使工具栏的上传按钮可用
  useEffect(() => {
    useUploadStore.getState().registerUploadHandler(async (_projectId, levelId, file, type) => {
      if (type !== 'scan') return
      try {
        // 如果配置了后端，上传到后端；否则存 IndexedDB
        const baseUrl = assetUploadBaseUrlRef.current
        let url: string
        if (baseUrl) {
          const uploadUrl = `${baseUrl.replace(/\/+$/, '')}/projects/${encodeURIComponent(projectId ?? 'default')}/assets?filename=${encodeURIComponent(file.name)}`
          url = await uploadAssetToBackend(file, uploadUrl, baseUrl)
        } else {
          url = await saveAsset(file)
        }
        const scan = ScanNode.parse({
          name: file.name.replace(/\.[^.]+$/, ''),
          url,
          opacity: 100,
          scale: 1,
        })
        if (levelId) {
          // 直接修改 store state 绕过 readOnly 限制
          useScene.setState((prev) => {
            const targetLevelId = levelId as LevelNode['id']
            const nextNodes: Record<AnyNodeId, AnyNode> = {
              ...prev.nodes,
              [scan.id]: { ...scan, parentId: targetLevelId } as AnyNode,
            }
            const level = nextNodes[targetLevelId]
            if (level && 'children' in level) {
              nextNodes[targetLevelId] = {
                ...level,
                children: [...(level as LevelNode).children, scan.id],
              } as AnyNode
            }
            return { nodes: nextNodes }
          })
          useScene.getState().markDirty(scan.id)
          useScene.getState().markDirty(levelId as AnyNodeId)
        }
      } catch (error) {
        console.error('[modeling-module] scan upload failed:', error)
      }
    })
    return () => {
      useUploadStore.getState().unregisterUploadHandler()
    }
  }, [projectId])

  return (
    <div className={cn('h-screen w-screen', className)}>
      <Editor
        {...props}
        layoutVersion="v2"
        projectId={projectId}
        sidebarTabs={sidebarTabs}
        viewerToolbarLeft={viewerToolbarLeft}
        viewerToolbarRight={viewerToolbarRight}
      />
      <SelectionBridge onSelectionChange={onSelectionChange} />
    </div>
  )
}

export interface ModelingEditorModuleProps extends ModelingEditorCoreModuleProps {}

/**
 * 默认建模模块：在核心模块外，额外挂上默认侧栏标签和默认工具栏。
 * 如果宿主没有自己的壳层，直接用它即可；如果有自己的壳层，请改用 ModelingEditorCoreModule。
 */
export function ModelingEditorModule({
  projectId,
  className,
  sidebarTabs,
  viewerToolbarLeft,
  viewerToolbarRight,
  onSelectionChange,
  settingsPanelProps,
  sitePanelProps,
  assetUploadBaseUrl,
  ...props
}: ModelingEditorModuleProps) {
  const resolvedSidebarTabs =
    sidebarTabs ??
    createDefaultModelingSidebarTabs({
      settingsPanelProps,
      sitePanelProps,
    })

  return (
    <ModelingEditorCoreModule
      {...props}
      assetUploadBaseUrl={assetUploadBaseUrl}
      className={className}
      onSelectionChange={onSelectionChange}
      projectId={projectId}
      settingsPanelProps={settingsPanelProps}
      sidebarTabs={resolvedSidebarTabs}
      sitePanelProps={sitePanelProps}
      viewerToolbarLeft={viewerToolbarLeft ?? <DefaultModelingViewerToolbarLeft />}
      viewerToolbarRight={viewerToolbarRight ?? <DefaultModelingViewerToolbarRight />}
    />
  )
}

export default ModelingEditorModule
