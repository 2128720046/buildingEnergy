export interface EnergyApiResponse {
  [x: string]: any;
  item_type: string | null;
  item_name: string | null;
  electricity_kwh: number | null;
  operating_status: string | null;
  light_brightness_pct: number | null;
  fridge_temp_setting: number | null;
  motor_speed_level: number | null;
  stove_power_level: number | null;
  electric_voltage_v: number | null;
  electric_current_a: number | null;
  seat_temp_setting: number | null;
  // 保留下游可能需要的原始请求参数（设为可选）
  projectId?: string;
  componentId?: string;
}

export interface ZoneEnergyResponse {
  type: 'zone';
  total_electricity_kwh: number;
  indoor_temp: number;
  indoor_humidity: number;
  occupancy_density: number;
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

export async function loadZoneEnergy(
  baseUrl: string | undefined,
  projectId: string,
  ZoneId: string,
): Promise<ZoneEnergyResponse | null> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  if (!normalizedBaseUrl) return null

  const response = await fetch(
    `${normalizedBaseUrl}/projects/${encodeURIComponent(projectId)}/energy/zones/${encodeURIComponent(ZoneId)}`,
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