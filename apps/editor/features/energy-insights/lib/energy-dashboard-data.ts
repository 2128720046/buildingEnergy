import type { AnyNode, ZoneNode } from '@pascal-app/core'
import {
  estimateZoneArea,
  classifyRoomType,
  buildDailySummary,
  getActiveOfficeOperationsSnapshot,
  todayStr,
  yesterdayStr,
  shiftDateStr,
  getWeekDates,
  estimateCost,
  type DailyEnergySummary,
  type HourlyEnergyRecord,
} from './energy-mock-data'

// ============ 上下文 ============
export interface DashboardContext {
  nodes: Record<string, AnyNode>
  levelId: string
  zoneId: string
  date: string
  hour: number
  queryResults: any[]
  projectId?: string
}

// ============ 左侧面板数据 ============
export interface AlertData {
  total: number
  high: number
  medium: number
}

export interface RealtimePowerData {
  currentKw: number
  yesterdayKw: number
  changePct: number
  trend: 'up' | 'down' | 'flat'
}

export interface EnergyIntensityData {
  todayKwh: number
  todayKwhPerM2: number
  vsYesterdayPct: number
}

export interface HourlyCurveData {
  today: number[]
  yesterday: number[]
  peak: { hour: number; value: number }
  valley: { hour: number; value: number }
}

export interface CompositionData {
  hvac: number
  lighting: number
  socket: number
  other: number
  total: number
}

// ============ 右侧面板数据 ============
export interface RankingItem {
  name: string
  value: number
  unit: string
}

export interface PeakPowerData {
  value: number
  hour: number
}

export interface IndoorEnvData {
  indoorTemp: number
  indoorHumidity: number
  outdoorTemp: number
  outdoorHumidity: number
  co2: number
  pm25: number
}

export interface CostData {
  today: number
  month: number
}

export interface WeeklyTrendData {
  labels: string[]
  values: number[]
  prevWeekValues: number[]
}

export interface DashboardResult {
  left: {
    alert: AlertData
    realtimePower: RealtimePowerData
    energyIntensity: EnergyIntensityData
    hourlyCurve: HourlyCurveData
    composition: CompositionData
  }
  right: {
    ranking: RankingItem[]
    peakPower: PeakPowerData
    indoorEnv: IndoorEnvData
    cost: CostData
    weeklyTrend: WeeklyTrendData
  }
}

// ============ 辅助 ============
function getApplicableZones(ctx: DashboardContext): ZoneNode[] {
  const zones = Object.values(ctx.nodes).filter(
    (n): n is ZoneNode =>
      n.type === 'zone' && Array.isArray(n.polygon) && n.polygon.length >= 3,
  )
  if (ctx.zoneId) {
    return zones.filter((z) => z.id === ctx.zoneId)
  }
  if (ctx.levelId) {
    return zones.filter((z) => z.parentId === ctx.levelId)
  }
  return zones
}

function getZoneDaily(ctx: DashboardContext, zone: ZoneNode, date: string): DailyEnergySummary {
  const area = estimateZoneArea(zone.polygon)
  const roomType = classifyRoomType(zone.name || zone.id)
  return buildDailySummary(zone.id, roomType, area, date)
}

function aggregateAcrossZones(
  ctx: DashboardContext,
  date: string,
  fn: (daily: DailyEnergySummary) => number,
): number {
  const zones = getApplicableZones(ctx)
  if (zones.length === 0) return 0
  const total = zones.reduce((s, z) => s + fn(getZoneDaily(ctx, z, date)), 0)
  return Number(total.toFixed(2))
}

function aggregateHourlyAcrossZones(
  ctx: DashboardContext,
  date: string,
): { electricity: number[]; hvac: number[]; lighting: number[]; socket: number[]; temp: number[]; humidity: number[]; co2: number[]; pm25: number[] } {
  const zones = getApplicableZones(ctx)
  const zCount = zones.length
  const electricity = new Array(24).fill(0)
  const hvac = new Array(24).fill(0)
  const lighting = new Array(24).fill(0)
  const socket = new Array(24).fill(0)
  const tempSums = new Array(24).fill(0)
  const humiditySums = new Array(24).fill(0)
  const co2 = new Array(24).fill(0)
  const pm25 = new Array(24).fill(0)

  for (const zone of zones) {
    const daily = getZoneDaily(ctx, zone, date)
    for (let h = 0; h < 24; h++) {
      const r = daily.hourly[h]
      if (!r) continue
      electricity[h] += r.electricity_kwh
      hvac[h] += r.hvac_kwh
      lighting[h] += r.lighting_kwh
      socket[h] += r.socket_kwh
      tempSums[h] += r.indoor_temp_c
      humiditySums[h] += r.indoor_humidity_pct
      co2[h] = Math.max(co2[h], r.co2_ppm)
      pm25[h] = Math.max(pm25[h], r.pm25_ugm3)
    }
  }

  const temp = tempSums.map((s) => (zCount > 0 ? Number((s / zCount).toFixed(1)) : 0))
  const humidity = humiditySums.map((s) => (zCount > 0 ? Math.round(s / zCount) : 0))
  const elec = electricity.map((v) => Number(v.toFixed(3)))
  const hvacR = hvac.map((v) => Number(v.toFixed(3)))
  const lightR = lighting.map((v) => Number(v.toFixed(3)))
  const sockR = socket.map((v) => Number(v.toFixed(3)))

  return { electricity: elec, hvac: hvacR, lighting: lightR, socket: sockR, temp, humidity, co2, pm25 }
}

export function buildScopeHourlyAggregate(
  nodes: Record<string, AnyNode>,
  levelId: string,
  zoneId: string,
  date: string,
): HourlyEnergyRecord[] | null {
  const ctx: DashboardContext = {
    nodes,
    levelId,
    zoneId,
    date,
    hour: 0,
    queryResults: [],
  }
  const zones = getApplicableZones(ctx)
  if (zones.length === 0) return null

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

  for (const zone of zones) {
    const daily = getZoneDaily(ctx, zone, date)
    for (let h = 0; h < 24; h++) {
      const record = daily.hourly[h]
      if (!record) continue
      const agg = hourly[h]!
      agg.electricity_kwh += record.electricity_kwh
      agg.hvac_kwh += record.hvac_kwh
      agg.lighting_kwh += record.lighting_kwh
      agg.socket_kwh += record.socket_kwh
      agg.water_m3 += record.water_m3
      agg.indoor_temp_c += record.indoor_temp_c
      agg.indoor_humidity_pct += record.indoor_humidity_pct
      agg.outdoor_temp_c = record.outdoor_temp_c
      agg.outdoor_humidity_pct = record.outdoor_humidity_pct
      agg.precipitation_mm += record.precipitation_mm
      agg.occupancy_count += record.occupancy_count
      agg.co2_ppm = Math.max(agg.co2_ppm, record.co2_ppm)
      agg.pm25_ugm3 = Math.max(agg.pm25_ugm3, record.pm25_ugm3)
    }
  }

  return hourly.map((record) => ({
    ...record,
    electricity_kwh: Number(record.electricity_kwh.toFixed(3)),
    hvac_kwh: Number(record.hvac_kwh.toFixed(3)),
    lighting_kwh: Number(record.lighting_kwh.toFixed(3)),
    socket_kwh: Number(record.socket_kwh.toFixed(3)),
    water_m3: Number(record.water_m3.toFixed(4)),
    indoor_temp_c: Number((record.indoor_temp_c / zones.length).toFixed(1)),
    indoor_humidity_pct: Math.round(record.indoor_humidity_pct / zones.length),
    outdoor_temp_c: Number(record.outdoor_temp_c.toFixed(1)),
    outdoor_humidity_pct: Math.round(record.outdoor_humidity_pct),
    precipitation_mm: Number(record.precipitation_mm.toFixed(1)),
  }))
}

export function buildZoneOverlaySnapshot(
  nodes: Record<string, AnyNode>,
  zoneId: string,
  date: string,
) {
  const zone = nodes[zoneId]
  if (zone?.type !== 'zone' || !Array.isArray(zone.polygon) || zone.polygon.length < 3) {
    return null
  }
  const areaM2 = estimateZoneArea(zone.polygon)
  const roomType = classifyRoomType(zone.name || zone.id)
  const daily = buildDailySummary(zone.id, roomType, areaM2, date)
  const peakHour = daily.hourly.reduce(
    (bestHour, record) =>
      record.electricity_kwh > (daily.hourly[bestHour]?.electricity_kwh ?? 0)
        ? record.hour
        : bestHour,
    0,
  )

  return {
    zoneId: zone.id,
    zoneName: zone.name || zone.id,
    areaM2: Number(areaM2.toFixed(1)),
    roomType,
    totalElectricityKwh: daily.total_electricity_kwh,
    totalHvacKwh: daily.total_hvac_kwh,
    totalLightingKwh: daily.total_lighting_kwh,
    totalSocketKwh: daily.total_socket_kwh,
    totalWaterM3: daily.total_water_m3,
    peakPowerKw: daily.peak_power_kw,
    peakHour,
    avgIndoorTempC: daily.avg_indoor_temp_c,
    avgIndoorHumidityPct: daily.avg_indoor_humidity_pct,
    avgOccupancy: daily.avg_occupancy,
    hourly: daily.hourly,
  }
}

export function buildDashboardData(ctx: DashboardContext): DashboardResult {
  const today = ctx.date
  const yesterday = yesterdayStr()
  const curHour = ctx.hour
  const operationsSnapshot = getActiveOfficeOperationsSnapshot(ctx.projectId ?? 'office-demo', today)

  // --- 左侧 ---
  const zones = getApplicableZones(ctx)
  const highAlerts = operationsSnapshot.alertSummary.high
  const mediumAlerts = operationsSnapshot.alertSummary.medium

  // 实时功率
  const hourlyAgg = aggregateHourlyAcrossZones(ctx, today)
  const todayPower = hourlyAgg.electricity[curHour] ?? 0
  const yesterdayAgg = aggregateHourlyAcrossZones(ctx, yesterday)
  const yesterdayPower = yesterdayAgg.electricity[curHour] ?? 0
  const powerChange = yesterdayPower > 0 ? ((todayPower - yesterdayPower) / yesterdayPower) * 100 : 0

  // 能耗强度
  const todayKwh = hourlyAgg.electricity.reduce((s, v) => s + v, 0)
  const yesterdayKwh = yesterdayAgg.electricity.reduce((s, v) => s + v, 0)
  const totalArea = zones.reduce((s, z) => s + estimateZoneArea(z.polygon), 0)
  const kwhPerM2 = totalArea > 0 ? Number((todayKwh / totalArea).toFixed(2)) : 0
  const vsYesterdayPct = yesterdayKwh > 0 ? Number((((todayKwh - yesterdayKwh) / yesterdayKwh) * 100).toFixed(1)) : 0

  // 24h 曲线
  const peakIdx = hourlyAgg.electricity.indexOf(Math.max(...hourlyAgg.electricity))
  const nonZeroHourly = hourlyAgg.electricity.filter((value) => value > 0)
  const valleyIdx =
    nonZeroHourly.length > 0
      ? hourlyAgg.electricity.indexOf(Math.min(...nonZeroHourly))
      : 0

  // 分项占比
  const hvacTotal = hourlyAgg.hvac.reduce((s, v) => s + v, 0)
  const lightingTotal = hourlyAgg.lighting.reduce((s, v) => s + v, 0)
  const socketTotal = hourlyAgg.socket.reduce((s, v) => s + v, 0)
  const otherTotal = Math.max(0, todayKwh - hvacTotal - lightingTotal - socketTotal)
  const compTotal = todayKwh

  // --- 右侧 ---
  // 能耗排行
  const ranking: RankingItem[] = zones
    .map((z) => {
      const d = getZoneDaily(ctx, z, today)
      return { name: z.name || z.id, value: Number(d.total_electricity_kwh.toFixed(1)), unit: 'kWh' }
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  // 如果当前是整栋楼视角但有多层，按楼层聚合排行
  if (!ctx.levelId && !ctx.zoneId) {
    const levelMap = new Map<string, { name: string; value: number }>()
    for (const z of zones) {
      const lid = z.parentId || 'unknown'
      const levelNode = ctx.nodes[lid] as any
      const lname = levelNode?.name || `楼层 ${lid}`
      const d = getZoneDaily(ctx, z, today)
      const prev = levelMap.get(lid) || { name: lname, value: 0 }
      levelMap.set(lid, { name: lname, value: prev.value + d.total_electricity_kwh })
    }
    const floorRanking = [...levelMap.values()]
      .map((r) => ({ name: r.name, value: Number(r.value.toFixed(1)), unit: 'kWh' as const }))
      .sort((a, b) => b.value - a.value)
    ranking.length = 0
    ranking.push(...floorRanking.slice(0, 8))
  }

  // 峰值功率
  const peakKw = Math.max(...hourlyAgg.electricity)
  const peakH = hourlyAgg.electricity.indexOf(peakKw)

  // 室内环境 — 显示当前小时数据，与时间轴联动
  const indoorTempNow = hourlyAgg.temp[curHour] ?? 24
  const indoorHumiNow = hourlyAgg.humidity[curHour] ?? 55
  const co2Now = hourlyAgg.co2[curHour] ?? 450
  const pm25Now = hourlyAgg.pm25[curHour] ?? 25
  // 室外环境 — 取一个代表性 zone 的当前小时室外数据
  const sampleZone = zones[0]
  const outdoorEnv = sampleZone
    ? (() => { const d = getZoneDaily(ctx, sampleZone, today); return d.hourly[curHour]; })()
    : null
  const outdoorTempNow = outdoorEnv?.outdoor_temp_c ?? 30
  const outdoorHumiNow = outdoorEnv?.outdoor_humidity_pct ?? 55

  // 成本
  const todayCost = estimateCost(todayKwh)
  const monthCost = Number((todayCost * 28).toFixed(0))

  // 本周趋势
  const weekDates = getWeekDates(today)
  const prevWeekDates = weekDates.map((d) => shiftDateStr(d, -7))
  const weekValues = weekDates.map((d) => {
    const agg = aggregateHourlyAcrossZones(ctx, d)
    return Number(agg.electricity.reduce((s, v) => s + v, 0).toFixed(1))
  })
  const prevWeekValues = prevWeekDates.map((d) => {
    const agg = aggregateHourlyAcrossZones(ctx, d)
    return Number(agg.electricity.reduce((s, v) => s + v, 0).toFixed(1))
  })
  const weekLabels = ['一', '二', '三', '四', '五', '六', '日']

  return {
    left: {
      alert: { total: operationsSnapshot.alertSummary.total, high: highAlerts, medium: mediumAlerts },
      realtimePower: {
        currentKw: Number(todayPower.toFixed(1)),
        yesterdayKw: Number(yesterdayPower.toFixed(1)),
        changePct: Number(powerChange.toFixed(1)),
        trend: powerChange > 3 ? 'up' : powerChange < -3 ? 'down' : 'flat',
      },
      energyIntensity: {
        todayKwh: Number(todayKwh.toFixed(1)),
        todayKwhPerM2: kwhPerM2,
        vsYesterdayPct,
      },
      hourlyCurve: {
        today: hourlyAgg.electricity.map((v) => Number(v.toFixed(2))),
        yesterday: yesterdayAgg.electricity.map((v) => Number(v.toFixed(2))),
        peak: { hour: peakIdx, value: Number(peakKw.toFixed(1)) },
        valley: { hour: valleyIdx, value: Number(hourlyAgg.electricity[valleyIdx]?.toFixed(1) ?? '0') },
      },
      composition: {
        hvac: Number(hvacTotal.toFixed(1)),
        lighting: Number(lightingTotal.toFixed(1)),
        socket: Number(socketTotal.toFixed(1)),
        other: Number(otherTotal.toFixed(1)),
        total: Number(compTotal.toFixed(1)),
      },
    },
    right: {
      ranking,
      peakPower: { value: Number(peakKw.toFixed(1)), hour: peakH },
      indoorEnv: {
        indoorTemp: Number(indoorTempNow.toFixed(1)),
        indoorHumidity: indoorHumiNow,
        outdoorTemp: Number(outdoorTempNow.toFixed(1)),
        outdoorHumidity: outdoorHumiNow,
        co2: co2Now,
        pm25: pm25Now,
      },
      cost: { today: todayCost, month: monthCost },
      weeklyTrend: { labels: weekLabels, values: weekValues, prevWeekValues },
    },
  }
}
