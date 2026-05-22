import type { AnyNode, ZoneNode } from '@pascal-app/core'
import {
  estimateZoneArea,
  classifyRoomType,
  buildDailySummary,
  type HourlyEnergyRecord,
} from './energy-mock-data'
import type { HostQueryResult } from './host-query'

export interface ZoneHeatmapEntry {
  zoneId: string
  zoneName: string
  polygon: Array<[number, number]>
  totalEnergy: number
  normalizedEnergy: number
  hvacEnergy: number
  lightingEnergy: number
  waterUsage: number
  avgIndoorTemp: number
  avgOccupancy: number
}

export interface FloorHeatmapData {
  floorName: string
  levelId: string
  zones: ZoneHeatmapEntry[]
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface FloorHeatmapOptions {
  /** 目标日期，YYYY-MM-DD，默认今天 */
  targetDate?: string
  /** 目标小时 0-23，传入则展示该小时数据，不传则展示全天汇总 */
  targetHour?: number
}

/**
 * 基于模拟能耗引擎构建当前楼层的热力图数据。
 * 支持按日期和小时精确筛选，联动时间轴实时刷新。
 */
export function buildFloorHeatmapData(
  nodes: Record<string, AnyNode>,
  levelId: string,
  queryResults: HostQueryResult[],
  options?: FloorHeatmapOptions,
): FloorHeatmapData | null {
  const floorZones = Object.values(nodes).filter(
    (node): node is ZoneNode =>
      node.type === 'zone' && node.parentId === levelId && Array.isArray(node.polygon) && node.polygon.length >= 3,
  )

  if (floorZones.length === 0) return null

  const targetDate =
    options?.targetDate ??
    (() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()
  const targetHour = options?.targetHour

  const entries: ZoneHeatmapEntry[] = floorZones.map((zone) => {
    const area = estimateZoneArea(zone.polygon)
    const roomType = classifyRoomType(zone.name || zone.id)
    const daily = buildDailySummary(zone.id, roomType, area, targetDate)

    let totalEnergy: number
    let hvacEnergy: number
    let lightingEnergy: number
    let waterUsage: number
    let avgIndoorTemp: number
    let avgOccupancy: number

    if (targetHour !== undefined && daily.hourly[targetHour]) {
      const h = daily.hourly[targetHour]!
      totalEnergy = h.electricity_kwh
      hvacEnergy = h.hvac_kwh
      lightingEnergy = h.lighting_kwh
      waterUsage = h.water_m3
      avgIndoorTemp = h.indoor_temp_c
      avgOccupancy = h.occupancy_count
    } else {
      totalEnergy = daily.total_electricity_kwh
      hvacEnergy = daily.total_hvac_kwh
      lightingEnergy = daily.total_lighting_kwh
      waterUsage = daily.total_water_m3
      avgIndoorTemp = daily.avg_indoor_temp_c
      avgOccupancy = daily.avg_occupancy
    }

    return {
      zoneId: zone.id,
      zoneName: zone.name || zone.id,
      polygon: zone.polygon,
      totalEnergy,
      normalizedEnergy: 0,
      hvacEnergy,
      lightingEnergy,
      waterUsage,
      avgIndoorTemp,
      avgOccupancy,
    }
  })

  if (entries.length === 0) return null

  // 小时级差异化抖动：不同 room type 在不同小时的负荷占比不同，
  // 添加小幅度 jitter 使热力图切换小时时有可见的颜色变化
  if (targetHour !== undefined) {
    for (const entry of entries) {
      // 基于 zoneId + hour 的确定性伪随机
      let hash = 0
      for (let i = 0; i < entry.zoneId.length; i++) {
        hash = (hash * 31 + entry.zoneId.charCodeAt(i)) % 1007
      }
      const jitter = ((hash * (targetHour + 7)) % 47) / 100 - 0.12 // -0.12 ~ +0.35
      entry.totalEnergy = Number((entry.totalEnergy * (1 + jitter * 0.18)).toFixed(3))
    }
  }

  // 归一化
  const allValues = entries.map((e) => e.totalEnergy)
  const maxEnergy = Math.max(...allValues)
  const minEnergy = Math.min(...allValues)
  const range = maxEnergy - minEnergy

  if (range > 0.001) {
    for (const entry of entries) {
      entry.normalizedEnergy = Number(((entry.totalEnergy - minEnergy) / range).toFixed(3))
    }
  } else {
    for (const entry of entries) {
      entry.normalizedEnergy = 0.5
    }
  }

  // 包围盒
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const entry of entries) {
    for (const [x, z] of entry.polygon) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
  }

  const levelNode = nodes[levelId] as Record<string, unknown> | undefined
  const floorName =
    (levelNode && typeof levelNode.name === 'string' ? levelNode.name : '') || levelId

  return { floorName, levelId, zones: entries, minX, maxX, minZ, maxZ }
}

/**
 * 构建楼层级别的小时聚合数据，供时间轴组件使用。
 * 将当前楼层所有 zone 的每小时能耗加总。
 */
export function buildFloorHourlyAggregate(
  nodes: Record<string, AnyNode>,
  levelId: string,
  targetDate: string,
): HourlyEnergyRecord[] | null {
  const floorZones = Object.values(nodes).filter(
    (node): node is ZoneNode =>
      node.type === 'zone' && node.parentId === levelId && Array.isArray(node.polygon) && node.polygon.length >= 3,
  )

  if (floorZones.length === 0) return null

  const hourly: HourlyEnergyRecord[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    electricity_kwh: 0,
    hvac_kwh: 0,
    lighting_kwh: 0,
    socket_kwh: 0,
    water_m3: 0,
    indoor_temp_c: 0,
    indoor_humidity_pct: 0,
    outdoor_temp_c: 0,
    outdoor_humidity_pct: 0,
    precipitation_mm: 0,
    occupancy_count: 0,
    co2_ppm: 0,
    pm25_ugm3: 0,
  }))

  for (const zone of floorZones) {
    const area = estimateZoneArea(zone.polygon)
    const roomType = classifyRoomType(zone.name || zone.id)
    const daily = buildDailySummary(zone.id, roomType, area, targetDate)

    for (let h = 0; h < 24; h++) {
      const record = daily.hourly[h]
      if (!record) continue
      const agg = hourly[h]!
      agg.electricity_kwh = Number((agg.electricity_kwh + record.electricity_kwh).toFixed(3))
      agg.hvac_kwh = Number((agg.hvac_kwh + record.hvac_kwh).toFixed(3))
      agg.lighting_kwh = Number((agg.lighting_kwh + record.lighting_kwh).toFixed(3))
      agg.socket_kwh = Number((agg.socket_kwh + record.socket_kwh).toFixed(3))
      agg.water_m3 = Number((agg.water_m3 + record.water_m3).toFixed(3))
      agg.indoor_temp_c = record.indoor_temp_c // 用最后一个 zone 的（近似）
      agg.indoor_humidity_pct = record.indoor_humidity_pct
      agg.outdoor_temp_c = record.outdoor_temp_c
      agg.outdoor_humidity_pct = record.outdoor_humidity_pct
      agg.precipitation_mm = record.precipitation_mm
      agg.occupancy_count += record.occupancy_count
      agg.co2_ppm = Math.max(agg.co2_ppm, record.co2_ppm)
      agg.pm25_ugm3 = Math.max(agg.pm25_ugm3, record.pm25_ugm3)
    }
  }

  return hourly
}

/**
 * 热力图颜色梯度：低能耗绿色 → 中等黄色 → 高能耗深红
 *   - 0.00: 半透明冷绿  (凉爽 / 节能)
 *   - 0.25: 黄绿色过渡
 *   - 0.50: 橙黄色警示
 *   - 0.75: 橘红色
 *   - 1.00: 深红不透   (高温耗)
 */
export function energyToHeatColor(normalizedEnergy: number): string {
  const t = Math.max(0, Math.min(1, normalizedEnergy))

  // 三段插值：绿→黄→红
  let r: number, g: number, b: number

  if (t < 0.5) {
    // 绿色 → 黄色 (0.0 ~ 0.5)
    const s = t / 0.5
    r = Math.round(57 + s * (255 - 57))   // 57 → 255
    g = Math.round(255 - s * 20)           // 255 → 235
    b = Math.round(20 + s * (60 - 20))     // 20 → 60
  } else {
    // 黄色 → 深红 (0.5 ~ 1.0)
    const s = (t - 0.5) / 0.5
    r = Math.round(255 - s * 55)           // 255 → 200
    g = Math.round(235 - s * 220)          // 235 → 15
    b = Math.round(60 - s * 45)            // 60 → 15
  }

  const a = (0.18 + t * 0.7).toFixed(2)

  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export function energyToStrokeColor(normalizedEnergy: number): string {
  const t = Math.max(0, Math.min(1, normalizedEnergy))
  let r: number, g: number, b: number

  if (t < 0.5) {
    const s = t / 0.5
    r = Math.round(40 + s * (240 - 40))
    g = Math.round(240 - s * 30)
    b = Math.round(15 + s * (55 - 15))
  } else {
    const s = (t - 0.5) / 0.5
    r = Math.round(240 - s * 60)
    g = Math.round(210 - s * 200)
    b = Math.round(55 - s * 40)
  }

  const a = (0.25 + t * 0.65).toFixed(2)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
