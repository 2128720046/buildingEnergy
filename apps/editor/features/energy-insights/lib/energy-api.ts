export interface EnergySeriesPoint {
  time: string
  value: number
}

export interface EnergyBinding {
  bindingTargetId: string
  bindingType: string
}

export interface EnergyApiResponse {
  [x: string]: any
  binding?: EnergyBinding
  componentId?: string
  currentPower: number
  electric_current_a: number | null
  electric_voltage_v: number | null
  electricity_kwh: number | null
  fridge_temp_setting: number | null
  item_name: string | null
  item_type: string | null
  light_brightness_pct: number | null
  monthUsage: number
  motor_speed_level: number | null
  operating_status: string | null
  projectId?: string
  seat_temp_setting: number | null
  series: EnergySeriesPoint[]
  stove_power_level: number | null
  todayUsage: number
  updatedAt?: string
}

export interface ZoneEnergyResponse {
  indoor_humidity: number
  indoor_temp: number
  occupancy_density: number
  total_electricity_kwh: number
  type: 'zone'
}

function normalizeBaseUrl(baseUrl?: string): string | null {
  const trimmed = baseUrl?.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, '')
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function toNumberOrFallback(value: unknown, fallback: number) {
  return toNullableNumber(value) ?? fallback
}

function normalizeSeries(value: unknown): EnergySeriesPoint[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }

    const point = item as Record<string, unknown>
    const time = typeof point.time === 'string' ? point.time : null
    const numericValue = toNullableNumber(point.value)

    if (!time || numericValue == null) {
      return []
    }

    return [{ time, value: numericValue }]
  })
}

function normalizeBinding(value: unknown): EnergyBinding | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const binding = value as Record<string, unknown>
  const bindingType = typeof binding.bindingType === 'string' ? binding.bindingType : null
  const bindingTargetId =
    typeof binding.bindingTargetId === 'string' ? binding.bindingTargetId : null

  if (!bindingType || !bindingTargetId) {
    return undefined
  }

  return {
    bindingTargetId,
    bindingType,
  }
}

function normalizeComponentEnergyResponse(
  value: unknown,
  projectId: string,
  componentId: string,
): EnergyApiResponse {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const series = normalizeSeries(raw.series)
  const electricity = toNullableNumber(raw.electricity_kwh)
  const todayUsage = toNumberOrFallback(raw.todayUsage, electricity ?? 0)
  const monthUsage = toNumberOrFallback(raw.monthUsage, todayUsage)
  const currentPower = toNumberOrFallback(raw.currentPower, electricity ?? 0)

  return {
    ...raw,
    binding: normalizeBinding(raw.binding),
    componentId:
      typeof raw.componentId === 'string'
        ? raw.componentId
        : typeof raw.component_id === 'string'
          ? raw.component_id
          : componentId,
    currentPower,
    electric_current_a: toNullableNumber(raw.electric_current_a),
    electric_voltage_v: toNullableNumber(raw.electric_voltage_v),
    electricity_kwh: electricity,
    fridge_temp_setting: toNullableNumber(raw.fridge_temp_setting),
    item_name: typeof raw.item_name === 'string' ? raw.item_name : null,
    item_type: typeof raw.item_type === 'string' ? raw.item_type : null,
    light_brightness_pct: toNullableNumber(raw.light_brightness_pct),
    monthUsage,
    motor_speed_level: toNullableNumber(raw.motor_speed_level),
    operating_status: typeof raw.operating_status === 'string' ? raw.operating_status : null,
    projectId:
      typeof raw.projectId === 'string'
        ? raw.projectId
        : typeof raw.project_id === 'string'
          ? raw.project_id
          : projectId,
    seat_temp_setting: toNullableNumber(raw.seat_temp_setting),
    series,
    stove_power_level: toNullableNumber(raw.stove_power_level),
    todayUsage,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
  }
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

  return normalizeComponentEnergyResponse(await response.json(), projectId, componentId)
}

export async function loadZoneEnergy(
  baseUrl: string | undefined,
  projectId: string,
  zoneId: string,
): Promise<ZoneEnergyResponse | null> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  if (!normalizedBaseUrl) return null

  const response = await fetch(
    `${normalizedBaseUrl}/projects/${encodeURIComponent(projectId)}/energy/zones/${encodeURIComponent(zoneId)}`,
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

  return (await response.json()) as ZoneEnergyResponse
}
