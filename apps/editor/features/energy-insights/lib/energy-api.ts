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
  hvacUsage?: number
  waterUsage?: number
  binding?: {
    bindingType: string
    bindingTargetId: string
  }
  updatedAt?: string
}

export interface ZoneEnergyResponse {
  type: 'zone'
  projectId: string
  zoneId: string
  total_electricity_kwh: number
  indoor_temp: number
  indoor_humidity: number
  occupancy_density: number
  updatedAt?: string
}

function normalizeBaseUrl(baseUrl?: string): string | null {
  const trimmed = baseUrl?.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, '')
}

function seededNumber(input: string, offset = 0): number {
  let value = 0

  for (let index = 0; index < input.length; index += 1) {
    value += input.charCodeAt(index) * (index + 1 + offset)
  }

  return value
}

function buildMockZoneEnergy(projectId: string, zoneId: string): ZoneEnergyResponse {
  const seed = seededNumber(`${projectId}:${zoneId}`, 11)

  return {
    type: 'zone',
    projectId,
    zoneId,
    total_electricity_kwh: Number((((seed % 420) / 3.4) + 28).toFixed(1)),
    indoor_temp: Number((((seed % 60) / 10) + 20).toFixed(1)),
    indoor_humidity: Number((((seed % 450) / 10) + 35).toFixed(1)),
    occupancy_density: Number((((seed % 28) / 10) + 0.6).toFixed(2)),
    updatedAt: new Date().toISOString(),
  }
}

function buildMockComponentEnergy(projectId: string, componentId: string): EnergyApiResponse {
  const seed = seededNumber(`${projectId}:${componentId}`, 17)
  const currentPower = Number((((seed % 180) / 6.4) + 4.8).toFixed(1))
  const todayUsage = Number((((seed % 420) / 4.2) + 22).toFixed(1))
  const monthUsage = Number((todayUsage * 24 + ((seed % 950) / 5)).toFixed(1))
  const hvacUsage = Number((todayUsage * (0.24 + (seed % 16) / 100)).toFixed(1))
  const waterUsage = Number((((seed % 120) / 18) + 0.8).toFixed(2))

  const series = Array.from({ length: 7 }, (_, index) => {
    const drift = ((seed >> (index % 6)) % 14) - 6
    const wave = Math.sin((index / 6) * Math.PI * 1.8) * 8
    return {
      time: `${String(index * 4).padStart(2, '0')}:00`,
      value: Number((todayUsage * 0.56 + wave + drift).toFixed(1)),
    }
  })

  return {
    projectId,
    componentId,
    currentPower,
    todayUsage,
    monthUsage,
    hvacUsage,
    waterUsage,
    series,
    updatedAt: new Date().toISOString(),
  }
}

export async function loadComponentEnergy(
  baseUrl: string | undefined,
  projectId: string,
  componentId: string,
): Promise<EnergyApiResponse | null> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  if (!normalizedBaseUrl) {
    return buildMockComponentEnergy(projectId, componentId)
  }

  const response = await fetch(
    `${normalizedBaseUrl}/projects/${encodeURIComponent(projectId)}/energy/components/${encodeURIComponent(componentId)}`,
    {
      cache: 'no-store',
    },
  )

  if (response.status === 404) {
    return buildMockComponentEnergy(projectId, componentId)
  }

  if (!response.ok) {
    throw new Error(`Failed to load energy data: ${response.status}`)
  }

  const payload = (await response.json()) as EnergyApiResponse

  if (payload.hvacUsage === undefined || payload.waterUsage === undefined) {
    const mock = buildMockComponentEnergy(projectId, componentId)
    return {
      ...payload,
      hvacUsage: payload.hvacUsage ?? mock.hvacUsage,
      waterUsage: payload.waterUsage ?? mock.waterUsage,
    }
  }

  return payload
}

export async function loadZoneEnergy(
  baseUrl: string | undefined,
  projectId: string,
  zoneId: string,
): Promise<ZoneEnergyResponse | null> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  if (!normalizedBaseUrl) {
    return buildMockZoneEnergy(projectId, zoneId)
  }

  const response = await fetch(
    `${normalizedBaseUrl}/projects/${encodeURIComponent(projectId)}/energy/zones/${encodeURIComponent(zoneId)}`,
    {
      cache: 'no-store',
    },
  )

  if (response.status === 404) {
    return buildMockZoneEnergy(projectId, zoneId)
  }

  if (!response.ok) {
    throw new Error(`Failed to load zone energy data: ${response.status}`)
  }

  return (await response.json()) as ZoneEnergyResponse
}
