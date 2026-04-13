export interface EnergySeriesPoint {
  time: string
  value: number
}

export interface EnergyApiResponse {
  projectId: string
  componentId: string
  currentPower: number
  todayUsage: number
  monthUsage: number
  series: EnergySeriesPoint[]
  binding?: {
    bindingType: string
    bindingTargetId: string
  }
  updatedAt?: string
}

function normalizeBaseUrl(baseUrl?: string): string | null {
  const trimmed = baseUrl?.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, '')
}

export async function loadComponentEnergy(
  baseUrl: string | undefined,
  projectId: string,
  componentId: string,
): Promise<EnergyApiResponse | null> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  if (!normalizedBaseUrl) return null

  const response = await fetch(
    `${normalizedBaseUrl}/projects/${encodeURIComponent(projectId)}/energy/components/${encodeURIComponent(componentId)}`,
    {
      cache: 'no-store',
    },
  )

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`Failed to load energy data: ${response.status}`)
  }

  return (await response.json()) as EnergyApiResponse
}