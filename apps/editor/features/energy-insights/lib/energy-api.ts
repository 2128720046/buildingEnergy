import {
  buildComponentEnergyFromDaily,
  buildDailySummary,
  type DailyEnergySummary,
  type HourlyEnergyRecord,
} from './energy-mock-data'

// ---- 公开类型（向后兼容 + 新增字段） ----

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
  /** 暖通分项电耗 (kWh) */
  hvacUsage: number
  /** 水耗 (m³) */
  waterUsage: number
  /** 照明分项电耗 (kWh) — 新增 */
  lightingUsage: number
  /** 插座/设备电耗 (kWh) — 新增 */
  socketUsage: number
  binding?: {
    bindingType: string
    bindingTargetId: string
  }
  updatedAt: string
}

export interface ZoneEnergyResponse {
  type: 'zone'
  projectId: string
  zoneId: string
  total_electricity_kwh: number
  total_hvac_kwh: number
  total_lighting_kwh: number
  total_socket_kwh: number
  total_water_m3: number
  peak_power_kw: number
  indoor_temp: number
  indoor_humidity: number
  outdoor_temp: number
  outdoor_humidity: number
  precipitation_mm: number
  occupancy_density: number
  co2_ppm: number
  pm25_ugm3: number
  series: EnergySeriesPoint[]
  updatedAt: string
}

// ---- 重新导出 — 供上层业务直接使用 ----
export type { DailyEnergySummary, HourlyEnergyRecord }

// ---- 内部工具 ----

/** 用于估算任意 zone / component 面积的退化逻辑 */
function fallbackAreaM2(zoneId: string): number {
  let h = 0
  for (let i = 0; i < zoneId.length; i++) h = (h * 31 + zoneId.charCodeAt(i)) % 200
  return Math.max(8, (h % 120) + 15)
}

function todayDateStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---- 对外查询 API（统一使用模拟引擎） ----

export async function loadComponentEnergy(
  _baseUrl: string | undefined,
  projectId: string,
  componentId: string,
): Promise<EnergyApiResponse | null> {
  const daily = buildDailySummary(componentId, 'mixed', fallbackAreaM2(componentId), todayDateStr())
  return buildComponentEnergyFromDaily(projectId, componentId, daily)
}

export async function loadZoneEnergy(
  _baseUrl: string | undefined,
  projectId: string,
  zoneId: string,
): Promise<ZoneEnergyResponse | null> {
  const daily = buildDailySummary(zoneId, 'mixed', fallbackAreaM2(zoneId), todayDateStr())

  const series = daily.hourly.map((r) => ({
    time: `${String(r.hour).padStart(2, '0')}:00`,
    value: r.electricity_kwh,
  }))

  const afternoonHours = daily.hourly.filter((r) => r.hour >= 12 && r.hour <= 18)
  const afternoonTemp =
    afternoonHours.length > 0
      ? Number(
          (afternoonHours.reduce((s, r) => s + r.outdoor_temp_c, 0) / afternoonHours.length).toFixed(1),
        )
      : 30
  const afternoonHumidity =
    afternoonHours.length > 0
      ? Math.round(afternoonHours.reduce((s, r) => s + r.outdoor_humidity_pct, 0) / afternoonHours.length)
      : 55
  const totalPrecip = Number(daily.hourly.reduce((s, r) => s + r.precipitation_mm, 0).toFixed(1))
  const avgCo2 = Math.round(daily.hourly.reduce((s, r) => s + r.co2_ppm, 0) / 24)
  const avgPm25 = Math.round(daily.hourly.reduce((s, r) => s + r.pm25_ugm3, 0) / 24)

  return {
    type: 'zone',
    projectId,
    zoneId,
    total_electricity_kwh: daily.total_electricity_kwh,
    total_hvac_kwh: daily.total_hvac_kwh,
    total_lighting_kwh: daily.total_lighting_kwh,
    total_socket_kwh: daily.total_socket_kwh,
    total_water_m3: daily.total_water_m3,
    peak_power_kw: daily.peak_power_kw,
    indoor_temp: daily.avg_indoor_temp_c,
    indoor_humidity: daily.avg_indoor_humidity_pct,
    outdoor_temp: afternoonTemp,
    outdoor_humidity: afternoonHumidity,
    precipitation_mm: totalPrecip,
    occupancy_density: Number(daily.avg_occupancy.toFixed(1)),
    co2_ppm: avgCo2,
    pm25_ugm3: avgPm25,
    series,
    updatedAt: new Date().toISOString(),
  }
}
