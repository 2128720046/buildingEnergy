'use client'

import { useCallback, useMemo } from 'react'
import { createEditorApiClient } from '../lib/editor-api-client'
import {
  ModelingEditorModule,
  type ModelingEditorModuleProps,
  type ModelingSelectionSnapshot,
} from './modeling-editor-module'
import type { SceneGraph } from '../lib/scene'

export interface ModelingHostShellProps
  extends Omit<ModelingEditorModuleProps, 'onLoad' | 'onSave' | 'onSelectionChange'> {
  apiBaseUrl?: string | null
  projectId: string
  onSelectionChange?: (snapshot: ModelingSelectionSnapshot) => void
}

export function ModelingHostShell({
  apiBaseUrl,
  projectId,
  onSelectionChange,
  ...props
}: ModelingHostShellProps) {
  const apiClient = useMemo(
    () => createEditorApiClient({ baseUrl: apiBaseUrl ?? undefined, projectId }),
    [apiBaseUrl, projectId],
  )

  const handleLoad = useCallback(async () => apiClient.loadScene(), [apiClient])

  const handleSave = useCallback(
    async (scene: SceneGraph) => apiClient.saveScene(scene),
    [apiClient],
  )

  return (
    <ModelingEditorModule
      {...props}
      projectId={projectId}
      onLoad={apiClient.isConfigured ? handleLoad : undefined}
      onSave={apiClient.isConfigured ? handleSave : undefined}
      onSelectionChange={onSelectionChange}
    />
  )
}

export default ModelingHostShell
