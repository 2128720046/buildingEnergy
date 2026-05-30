export type EnergyOverlayTimelineState = {
  date: string
  hour: number
}

export type EnergyOverlayHourlyRecord = {
  hour: number
  electricity_kwh: number
  hvac_kwh: number
  lighting_kwh: number
  socket_kwh: number
  water_m3: number
  indoor_temp_c: number
  indoor_humidity_pct: number
  outdoor_temp_c: number
  outdoor_humidity_pct: number
  precipitation_mm: number
  occupancy_count: number
  co2_ppm: number
  pm25_ugm3: number
}

export type EnergyOverlayZoneSnapshot = {
  zoneId: string
  zoneName: string
  areaM2: number
  roomType: string
  totalElectricityKwh: number
  totalHvacKwh: number
  totalLightingKwh: number
  totalSocketKwh: number
  totalWaterM3: number
  peakPowerKw: number
  peakHour: number
  avgIndoorTempC: number
  avgIndoorHumidityPct: number
  avgOccupancy: number
  hourly: EnergyOverlayHourlyRecord[]
}

export type EnergyOverlayZoneSnapshotResolver = (
  zoneId: string,
  state: EnergyOverlayTimelineState,
) => EnergyOverlayZoneSnapshot | null

export const ENERGY_OVERLAY_TIMELINE_EVENT = 'energy-overlay-timeline-change'
export const ENERGY_OVERLAY_TIMELINE_GLOBAL = '__pascalEnergyOverlayTimeline'
export const ENERGY_OVERLAY_ZONE_RESOLVER_GLOBAL = '__pascalEnergyOverlayZoneResolver'

export function readEnergyOverlayTimeline(): EnergyOverlayTimelineState | null {
  if (typeof window === 'undefined') return null
  const value = (window as unknown as Record<string, unknown>)[ENERGY_OVERLAY_TIMELINE_GLOBAL]
  if (!value || typeof value !== 'object') return null
  const state = value as Partial<EnergyOverlayTimelineState>
  if (typeof state.date !== 'string' || typeof state.hour !== 'number') return null
  return {
    date: state.date,
    hour: Math.max(0, Math.min(23, Math.round(state.hour))),
  }
}

export function readEnergyOverlayZoneSnapshot(
  zoneId: string,
  state: EnergyOverlayTimelineState,
): EnergyOverlayZoneSnapshot | null {
  if (typeof window === 'undefined') return null
  const resolver = (window as unknown as Record<string, unknown>)[
    ENERGY_OVERLAY_ZONE_RESOLVER_GLOBAL
  ]
  if (typeof resolver !== 'function') return null
  return (resolver as EnergyOverlayZoneSnapshotResolver)(zoneId, state)
}
