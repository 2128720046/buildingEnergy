'use client'

import { useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
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

export interface ModelingEditorCoreModuleProps
  extends Omit<EditorProps, 'layoutVersion' | 'viewerToolbarLeft' | 'viewerToolbarRight' | 'sidebarTabs'> {
  className?: string
  viewerToolbarLeft?: ReactNode
  viewerToolbarRight?: ReactNode
  sidebarTabs?: EditorProps['sidebarTabs']
  onSelectionChange?: (snapshot: ModelingSelectionSnapshot) => void
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
  ...props
}: ModelingEditorCoreModuleProps) {
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