import { collectAssetIds, getAssetFile, useScene } from '@pascal-app/core'
import type { SceneGraph } from '../lib/scene'

export interface EditorApiClientOptions {
  baseUrl?: string
  projectId: string
}

export interface EditorSceneResponse {
  projectId: string
  scene: SceneGraph
  updatedAt?: string
}

export interface EditorApiClient {
  isConfigured: boolean
  loadScene(): Promise<SceneGraph | null>
  saveScene(scene: SceneGraph): Promise<void>
  /** Upload a single asset file to the backend and return its full URL */
  uploadAsset(file: File | Blob, filename: string): Promise<string>
}

function normalizeBaseUrl(baseUrl?: string): string | null {
  const trimmed = baseUrl?.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, '')
}

export function createEditorApiClient({ baseUrl, projectId }: EditorApiClientOptions): EditorApiClient {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)

  async function uploadAsset(file: File | Blob, filename: string): Promise<string> {
    if (!normalizedBaseUrl) {
      throw new Error('API base URL is not configured')
    }

    const uploadUrl = `${normalizedBaseUrl}/projects/${encodeURIComponent(projectId)}/assets?filename=${encodeURIComponent(filename)}`
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: file,
    })

    if (!response.ok) {
      throw new Error(`Asset upload failed: ${response.status}`)
    }

    const result = (await response.json()) as { url: string }
    return result.url.startsWith('http') ? result.url : `${normalizedBaseUrl}${result.url}`
  }

  /**
   * Before saving to the backend, scan all nodes for asset:// URLs,
   * upload the corresponding files from local IndexedDB, and replace
   * the URLs with backend URLs so the scene is portable across devices.
   */
  async function resolveLocalAssetsBeforeSave(scene: SceneGraph): Promise<SceneGraph> {
    if (!normalizedBaseUrl) return scene

    const assetIds = collectAssetIds(scene.nodes)
    if (assetIds.length === 0) return scene

    // Resolve asset IDs to backend URLs (parallel uploads)
    const results = await Promise.allSettled(
      assetIds.map(async (assetId) => {
        const file = await getAssetFile(assetId)
        if (!file) {
          console.warn(`[api-client] Asset not found in local store: ${assetId}`)
          return null
        }

        // Try to infer a filename from the stored file
        const filename = file instanceof File
          ? file.name
          : `asset-${assetId}.glb`

        const backendUrl = await uploadAsset(file, filename)
        return { assetId, backendUrl }
      }),
    )

    // Build a lookup: assetId → backendUrl
    const urlMap = new Map<string, string>()
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        urlMap.set(result.value.assetId, result.value.backendUrl)
      }
    }

    if (urlMap.size === 0) return scene

    // Replace asset:// URLs in nodes with backend URLs
    const updatedNodes: Record<string, unknown> = {}
    for (const [nodeId, node] of Object.entries(scene.nodes)) {
      if (!node || typeof node !== 'object') {
        updatedNodes[nodeId] = node
        continue
      }

      const nodeRecord = node as Record<string, unknown>
      const url = nodeRecord.url
      if (typeof url === 'string' && url.startsWith('asset://')) {
        const assetId = url.replace('asset://', '')
        const backendUrl = urlMap.get(assetId)
        if (backendUrl) {
          updatedNodes[nodeId] = { ...nodeRecord, url: backendUrl }
          continue
        }
      }

      updatedNodes[nodeId] = node
    }

    return { ...scene, nodes: updatedNodes }
  }

  /**
   * After saving, synchronize resolved backend URLs back into the in-memory
   * scene store so subsequent saves don't attempt to re-upload the same assets.
   */
  function updateStoreAssetUrls(resolvedScene: SceneGraph): void {
    try {
      const store = useScene.getState()
      const currentNodes = store.nodes as Record<string, Record<string, unknown>>
      let hasChanges = false
      const patchedNodes = { ...currentNodes }

      for (const [nodeId, resolvedNode] of Object.entries(resolvedScene.nodes)) {
        const resolvedUrl = (resolvedNode as Record<string, unknown> | null)?.url
        if (typeof resolvedUrl !== 'string' || !resolvedUrl.startsWith('http')) continue

        const currentNode = patchedNodes[nodeId]
        const currentUrl = currentNode?.url
        if (typeof currentUrl === 'string' && currentUrl.startsWith('asset://')) {
          patchedNodes[nodeId] = { ...currentNode, url: resolvedUrl }
          hasChanges = true
        }
      }

      if (hasChanges) {
        useScene.setState({ nodes: patchedNodes as any })
      }
    } catch {
      // Silently ignore store update failures — the save itself succeeded
    }
  }

  return {
    isConfigured: Boolean(normalizedBaseUrl),

    async loadScene(): Promise<SceneGraph | null> {
      if (!normalizedBaseUrl) return null

      const response = await fetch(
        `${normalizedBaseUrl}/projects/${encodeURIComponent(projectId)}/scene`,
        {
          cache: 'no-store',
        },
      )

      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        throw new Error(`Failed to load scene: ${response.status}`)
      }

      const payload = (await response.json()) as EditorSceneResponse
      return payload.scene
    },

    async saveScene(scene: SceneGraph): Promise<void> {
      if (!normalizedBaseUrl) return

      // Resolve any local asset:// URLs to backend URLs before saving
      const resolvedScene = await resolveLocalAssetsBeforeSave(scene)

      const response = await fetch(
        `${normalizedBaseUrl}/projects/${encodeURIComponent(projectId)}/scene`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ scene: resolvedScene }),
        },
      )

      if (!response.ok) {
        throw new Error(`Failed to save scene: ${response.status}`)
      }

      // After successful save, update the in-memory store to replace
      // asset:// URLs with backend URLs. This prevents re-uploading the
      // same assets on every subsequent auto-save.
      if (resolvedScene !== scene) {
        updateStoreAssetUrls(resolvedScene)
      }
    },

    uploadAsset,
  }
}
