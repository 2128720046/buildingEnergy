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
}

function normalizeBaseUrl(baseUrl?: string): string | null {
  const trimmed = baseUrl?.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, '')
}

export function createEditorApiClient({ baseUrl, projectId }: EditorApiClientOptions): EditorApiClient {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)

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

      const response = await fetch(
        `${normalizedBaseUrl}/projects/${encodeURIComponent(projectId)}/scene`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ scene }),
        },
      )

      if (!response.ok) {
        throw new Error(`Failed to save scene: ${response.status}`)
      }
    },
  }
}
