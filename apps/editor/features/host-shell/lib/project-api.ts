export interface ProjectSummary {
  projectId: string
  updatedAt?: string
}

function normalizeBaseUrl(baseUrl?: string): string | null {
  const trimmed = baseUrl?.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, '')
}

export async function loadProjectSummaries(baseUrl?: string): Promise<ProjectSummary[]> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  if (!normalizedBaseUrl) return []

  const response = await fetch(`${normalizedBaseUrl}/projects`, {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Failed to load projects: ${response.status}`)
  }

  const payload = (await response.json()) as { projects?: ProjectSummary[] }
  return Array.isArray(payload.projects) ? payload.projects : []
}