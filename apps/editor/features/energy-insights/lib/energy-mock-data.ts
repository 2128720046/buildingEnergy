// ============================================================================
// 建筑能耗模拟数据引擎
//
// 基于房间类型、面积、时间模式生成逼真的建筑运维数据，
// 包括电耗、暖通、照明、水耗、室内外温湿度、降水量、PM2.5、CO₂ 等。
// 使用 zoneId / componentId 作为确定性种子，同一天同一区域返回一致数据。
// ============================================================================

// ---- 房间类型 ----
type RoomType =
  | 'office'
  | 'corridor'
  | 'server_room'
  | 'restroom'
  | 'lobby'
  | 'meeting'
  | 'storage'
  | 'mixed'

export interface OfficeMonitoringRecord {
  building_id: string
  building_type: string
  chilled_water_return_temp: number
  chilled_water_supply_temp: number
  device_id: string
  device_status: 'maintenance' | 'normal' | 'offline' | 'warning'
  electricity_kwh: number
  env_humidity: number
  env_temperature: number
  hvac_kwh: number
  id: number
  monitor_time: string
  occupancy_density: number
  water_m3: number
}

export interface OfficeOperationsAlert {
  baselineDeltaPct: number
  baselineValue: number
  currentValue: number
  detail: string
  id: string
  location: string
  occurredAt: string
  recommendation: string
  severity: 'high' | 'medium'
  status: string
  title: string
  type: 'hvac-load' | 'lighting-lock' | 'return-temp'
  unit: 'kWh' | '°C'
}

export interface OfficeOperationsSnapshot {
  activeAlerts: OfficeOperationsAlert[]
  alertSummary: {
    high: number
    medium: number
    total: number
  }
  healthScore: number
  monitoringRecords: OfficeMonitoringRecord[]
  statusCounts: Record<OfficeMonitoringRecord['device_status'], number>
  todayElectricityKwh: number
  todayHvacKwh: number
  updatedAt: string
}

// ---- 每小时数据 ----
export interface HourlyEnergyRecord {
  hour: number // 0-23
  electricity_kwh: number // 总电耗
  hvac_kwh: number // 暖通电耗
  lighting_kwh: number // 照明电耗
  socket_kwh: number // 插座/设备电耗
  water_m3: number // 水耗
  indoor_temp_c: number // 室内温度
  indoor_humidity_pct: number // 室内湿度
  outdoor_temp_c: number // 室外温度
  outdoor_humidity_pct: number // 室外湿度
  precipitation_mm: number // 降水量
  occupancy_count: number // 在室人数
  co2_ppm: number // CO₂ 浓度
  pm25_ugm3: number // PM2.5
}

// ---- 每日汇总 ----
export interface DailyEnergySummary {
  date: string
  total_electricity_kwh: number
  total_hvac_kwh: number
  total_lighting_kwh: number
  total_socket_kwh: number
  total_water_m3: number
  peak_power_kw: number
  avg_indoor_temp_c: number
  avg_indoor_humidity_pct: number
  avg_occupancy: number
  max_occupancy: number
  hourly: HourlyEnergyRecord[]
}

// ---- 各房间类型每平米基准电耗 (kWh/m²/h) ----
const ROOM_TYPE_BASE_LOAD: Record<
  RoomType,
  { electricity: number; hvac: number; lighting: number; socket: number }
> = {
  office: { electricity: 0.045, hvac: 0.018, lighting: 0.012, socket: 0.015 },
  corridor: { electricity: 0.018, hvac: 0.004, lighting: 0.01, socket: 0.004 },
  server_room: { electricity: 0.32, hvac: 0.13, lighting: 0.006, socket: 0.184 },
  restroom: { electricity: 0.022, hvac: 0.004, lighting: 0.008, socket: 0.01 },
  lobby: { electricity: 0.035, hvac: 0.014, lighting: 0.015, socket: 0.006 },
  meeting: { electricity: 0.052, hvac: 0.021, lighting: 0.013, socket: 0.018 },
  storage: { electricity: 0.012, hvac: 0.002, lighting: 0.004, socket: 0.006 },
  mixed: { electricity: 0.034, hvac: 0.012, lighting: 0.01, socket: 0.012 },
}

const dailySummaryCache = new Map<string, DailyEnergySummary>()
const officeMonitoringCache = new Map<string, OfficeMonitoringRecord[]>()
const officeOperationsSnapshotCache = new Map<string, OfficeOperationsSnapshot>()
export const OFFICE_ALERTS_CHANGED_EVENT = 'office-operations-alerts-changed'
const OFFICE_RESOLVED_ALERTS_STORAGE_KEY = 'editor:office-operations:resolved-alerts'

const OFFICE_SAMPLE_BUILDINGS = [
  { id: 'OFFICE-A', type: 'office', area: 12_500, occupancy: 0.78 },
  { id: 'OFFICE-B', type: 'office', area: 10_800, occupancy: 0.66 },
  { id: 'OFFICE-C', type: 'office', area: 14_200, occupancy: 0.72 },
  { id: 'OFFICE-D', type: 'mixed-office', area: 9_600, occupancy: 0.58 },
] as const

const OFFICE_ACTIVE_ANOMALIES = [
  {
    buildingId: 'OFFICE-C',
    hour: 18,
    id: 'office-c-18f-fresh-air-high-load',
    location: '18F 西侧设备间',
    severity: 'high',
    status: '处理中',
    title: 'OFFICE-C-18F 新风机组 负荷偏高',
    type: 'hvac-load',
  },
  {
    buildingId: 'OFFICE-D',
    hour: 18,
    id: 'office-d-2f-lighting-unlocked',
    location: '2F 公区走廊',
    severity: 'medium',
    status: '已派单',
    title: 'OFFICE-D-2F 公区照明回路 夜间未闭锁',
    type: 'lighting-lock',
  },
  {
    buildingId: 'OFFICE-A',
    hour: 12,
    id: 'office-a-12f-ahu-return-temp',
    location: '12F 北侧办公区',
    severity: 'medium',
    status: '待处理',
    title: 'OFFICE-A-12F 空调机组 回风温度异常',
    type: 'return-temp',
  },
] as const

function resolvedAlertStorageKey(projectId: string) {
  return `${OFFICE_RESOLVED_ALERTS_STORAGE_KEY}:${projectId}`
}

export function getResolvedOfficeAlertIds(projectId: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(resolvedAlertStorageKey(projectId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function markOfficeAlertResolved(projectId: string, alertId: string) {
  if (typeof window === 'undefined') return
  const ids = new Set(getResolvedOfficeAlertIds(projectId))
  ids.add(alertId)
  window.localStorage.setItem(resolvedAlertStorageKey(projectId), JSON.stringify([...ids]))
  window.dispatchEvent(new CustomEvent(OFFICE_ALERTS_CHANGED_EVENT, { detail: { projectId } }))
}

// ---- 时间乘数曲线（24h），反映工作日负荷波动 ----
// 峰值 9-11, 14-17；午休低谷；夜间基准负荷
const HOURLY_LOAD_MULTIPLIERS: Record<
  RoomType,
  number[] // 24个值
> = {
  office: [
    0.18, 0.16, 0.14, 0.13, 0.15, 0.18, // 0-5 夜间
    0.35, 0.65, 0.95, 1.00, 0.90, 0.55, // 6-11 早班→午休
    0.48, 0.85, 0.98, 0.92, 0.88, 0.72, // 12-17 下午
    0.48, 0.32, 0.24, 0.20, 0.18, 0.16, // 18-23 晚班→夜间
  ],
  corridor: [
    0.30, 0.28, 0.26, 0.25, 0.25, 0.28,
    0.45, 0.70, 0.90, 0.95, 0.88, 0.60,
    0.52, 0.82, 0.92, 0.88, 0.85, 0.72,
    0.50, 0.38, 0.32, 0.28, 0.26, 0.25,
  ],
  server_room: [
    0.92, 0.92, 0.92, 0.92, 0.92, 0.93,
    0.94, 0.95, 1.00, 1.00, 1.00, 0.96,
    0.94, 0.98, 1.00, 1.00, 0.98, 0.95,
    0.94, 0.93, 0.92, 0.92, 0.92, 0.92,
  ],
  restroom: [
    0.15, 0.13, 0.12, 0.12, 0.14, 0.22,
    0.45, 0.70, 0.90, 0.95, 0.88, 0.62,
    0.55, 0.82, 0.92, 0.88, 0.85, 0.72,
    0.48, 0.35, 0.28, 0.22, 0.18, 0.15,
  ],
  lobby: [
    0.20, 0.18, 0.16, 0.15, 0.18, 0.28,
    0.50, 0.72, 0.95, 0.98, 0.90, 0.65,
    0.55, 0.85, 0.95, 0.90, 0.88, 0.75,
    0.55, 0.42, 0.35, 0.28, 0.22, 0.18,
  ],
  meeting: [
    0.12, 0.10, 0.10, 0.10, 0.10, 0.15,
    0.40, 0.72, 0.98, 1.00, 0.92, 0.55,
    0.50, 0.90, 1.00, 0.95, 0.88, 0.65,
    0.38, 0.25, 0.18, 0.14, 0.12, 0.10,
  ],
  storage: [
    0.28, 0.25, 0.25, 0.25, 0.25, 0.28,
    0.42, 0.62, 0.85, 0.88, 0.82, 0.55,
    0.48, 0.78, 0.88, 0.85, 0.82, 0.68,
    0.48, 0.38, 0.32, 0.28, 0.25, 0.25,
  ],
  mixed: [
    0.22, 0.18, 0.16, 0.15, 0.18, 0.25,
    0.42, 0.68, 0.92, 0.95, 0.90, 0.58,
    0.50, 0.82, 0.95, 0.92, 0.88, 0.72,
    0.50, 0.38, 0.30, 0.24, 0.20, 0.18,
  ],
}

// ---- 室外温度曲线（°C）----
// 典型中国夏季商务日
const OUTDOOR_TEMP_PROFILE: number[] = [
  25.2, 24.8, 24.3, 24.0, 24.2, 25.0, // 0-5
  26.5, 28.8, 31.2, 33.5, 35.1, 35.8, // 6-11
  36.2, 35.9, 34.8, 33.2, 32.0, 30.5, // 12-17
  28.8, 27.5, 26.8, 26.2, 25.8, 25.5, // 18-23
]

const OUTDOOR_HUMIDITY_PROFILE: number[] = [
  82, 84, 86, 87, 85, 82,
  75, 68, 58, 52, 48, 45,
  44, 46, 48, 52, 56, 62,
  68, 74, 78, 80, 82, 83,
]

// ---- 室内 HVAC 目标温度偏差 ----
const INDOOR_TEMP_TARGET = 23.5 // 制冷目标温度
const INDOOR_TEMP_VARIANCE = 1.2 // ± 波动
const HVAC_DAMPING = 0.22 // HVAC开启时室外温度对室内的渗透系数（真实建筑不可能100%隔绝）

// ---- 确定性伪随机（基于种子字符串） ----
function seededRandom(seed: string, offset: number): number {
  let h = offset
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) % 100003
  }
  return (h % 10000) / 10000
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ---- 根据房间名称推断类型 ----
export function classifyRoomType(name: string): RoomType {
  const n = name.toLowerCase()

  if (n.includes('\u529e\u516c') || n.includes('\u5de5\u4f4d') || n.includes('\u4eba\u529b') || n.includes('\u8d22\u52a1') || n.includes('\u6cd5\u52a1') || n.includes('\u91c7\u8d2d') || n.includes('\u884c\u653f') || n.includes('\u7814\u53d1') || n.includes('\u5ba2\u6237\u6210\u529f') || n.includes('\u5ba2\u6237\u670d\u52a1') || n.includes('\u6218\u7565\u7ba1\u7406')) return 'office'
  if (n.includes('\u8d70\u5eca') || n.includes('\u8fc7\u9053') || n.includes('\u7535\u68af\u5385')) return 'corridor'
  if (n.includes('\u673a\u623f') || n.includes('\u8bbe\u5907') || n.includes('\u76d1\u63a7') || n.includes('\u914d\u7535') || n.includes('\u80fd\u8017\u76d1\u63a7') || n.includes('\u8fd0\u7ef4') || n.includes('\u5e94\u6025\u6307\u6325')) return 'server_room'
  if (n.includes('\u6d17\u624b\u95f4') || n.includes('\u536b\u751f\u95f4') || n.includes('\u65e0\u969c\u788d')) return 'restroom'
  if (n.includes('\u5927\u5802') || n.includes('\u63a5\u5f85') || n.includes('\u7b49\u5019') || n.includes('\u4f53\u9a8c\u5927\u5385') || n.includes('\u529e\u516c\u5927\u5385') || n.includes('\u6307\u6325\u5927\u5385')) return 'lobby'
  if (n.includes('\u4f1a\u8bae') || n.includes('\u6d3d\u8c08') || n.includes('\u4f1a\u5546') || n.includes('\u7814\u8ba8') || n.includes('\u57f9\u8bad') || n.includes('\u8bc4\u5ba1') || n.includes('\u8ba8\u8bba') || n.includes('\u6f14\u793a')) return 'meeting'
  if (n.includes('\u5e93') || n.includes('\u50a8\u85cf') || n.includes('\u50a8\u7269') || n.includes('\u6863\u6848') || n.includes('\u7269\u8d44') || n.includes('\u5907\u54c1') || n.includes('\u6587\u5370') || n.includes('\u4fdd\u6d01\u5de5\u5177')) return 'storage'

  if (n.includes('办公') || n.includes('office') || n.includes('工作')) return 'office'
  if (n.includes('走廊') || n.includes('走道') || n.includes('过道') || n.includes('corridor')) return 'corridor'
  if (
    n.includes('机房') ||
    n.includes('设备') ||
    n.includes('配电') ||
    n.includes('弱电') ||
    n.includes('server') ||
    n.includes('数据中心')
  )
    return 'server_room'
  if (n.includes('卫生') || n.includes('洗手') || n.includes('盥洗') || n.includes('厕所') || n.includes('wc') || n.includes('restroom'))
    return 'restroom'
  if (n.includes('大堂') || n.includes('大厅') || n.includes('门厅') || n.includes('lobby') || n.includes('前台'))
    return 'lobby'
  if (n.includes('会议') || n.includes('meeting') || n.includes('洽谈') || n.includes('报告'))
    return 'meeting'
  if (n.includes('仓库') || n.includes('储藏') || n.includes('储物') || n.includes('storage'))
    return 'storage'

  return 'mixed'
}

// ---- 估算房间面积（基于多边形） ----
export function estimateZoneArea(polygon: Array<[number, number]>): number {
  let area = 0
  const n = polygon.length
  for (let i = 0; i < n; i++) {
    const [x1, z1] = polygon[i]!
    const [x2, z2] = polygon[(i + 1) % n]!
    area += x1 * z2 - x2 * z1
  }
  return Math.abs(area) / 2
}

// ---- 构建单区域每小时数据 ----
export function buildHourlyRecords(
  zoneId: string,
  roomType: RoomType,
  areaM2: number,
  date: string,
): HourlyEnergyRecord[] {
  const base = ROOM_TYPE_BASE_LOAD[roomType]
  const multipliers = HOURLY_LOAD_MULTIPLIERS[roomType]
  const records: HourlyEnergyRecord[] = []

  // 日期级能量波动系数：不同日期总能耗可相差 ±18%
  const dateScale = 0.84 + seededRandom(date, 1) * 0.32

  // 日期级天气偏移：不同日期室外温度偏移 ±4°C
  const weatherShift = (seededRandom(date, 3) - 0.5) * 8

  for (let hour = 0; hour < 24; hour++) {
    const mult = multipliers[hour]!
    const seed = `${zoneId}:${date}:${hour}`
    const jitter = (seededRandom(seed, 7) - 0.5) * 0.12 // ±6% 小时级抖动

    const effectiveMult = clamp((mult + jitter) * dateScale, 0.04, 1.3)
    const areaFactor = areaM2 * effectiveMult

    // 各分项电耗
    const electricity = Number((areaFactor * base.electricity).toFixed(3))
    const hvac = Number((areaFactor * base.hvac).toFixed(3))
    const lighting = Number((areaFactor * base.lighting).toFixed(3))
    const socket = Number((areaFactor * base.socket).toFixed(3))

    // 水耗：卫生间远高于其他
    const waterBase = roomType === 'restroom' ? 0.003 : 0.0003
    const occupancyBoost = effectiveMult < 0.3 ? 0.25 : 1.0
    const water = Number((areaM2 * waterBase * effectiveMult * occupancyBoost).toFixed(4))

    // 室外环境（含日期级天气偏移）
    const baseOutdoorTemp = OUTDOOR_TEMP_PROFILE[hour]!
    const outdoorJitter = (seededRandom(seed, 19) - 0.5) * 2.0
    const effectiveOutdoor = baseOutdoorTemp + weatherShift  // 日期级天气影响后的"真实"室外参考温度
    const outdoorTemp = Number((effectiveOutdoor + outdoorJitter).toFixed(1))

    const baseOutdoorHumidity = OUTDOOR_HUMIDITY_PROFILE[hour]!
    const humidityJitter = (seededRandom(seed, 23) - 0.5) * 8
    const outdoorHumidity = clamp(Math.round(baseOutdoorHumidity + humidityJitter), 30, 98)

    // 室内温度：HVAC 无法完全隔绝室外温度，渗透系数约 22%
    // 真实场景：室外 36°C 时，即使空调全开，室内也会漂移到 25-27°C
    // 不同日期天气不同，effectiveOutdoor 不同 → 室内温度随之变化
    const hvacLoaded = areaFactor * base.hvac > 0.01
    const hvacDamping = roomType === 'server_room' ? 0.10 : HVAC_DAMPING
    const indoorTemp = Number(
      hvacLoaded
        ? (INDOOR_TEMP_TARGET + (effectiveOutdoor - INDOOR_TEMP_TARGET) * hvacDamping + (seededRandom(seed, 31) - 0.5) * INDOOR_TEMP_VARIANCE).toFixed(1)
        : (effectiveOutdoor * 0.65 + INDOOR_TEMP_TARGET * 0.35 + (seededRandom(seed, 31) - 0.5) * 2.0).toFixed(1),
    )
    const indoorHumidity = clamp(Math.round(baseOutdoorHumidity * (hvacLoaded ? 0.55 : 0.78) + (seededRandom(seed, 37) - 0.5) * 6), 30, 70)

    // 在室人数（按房间类型估算）
    const baseOccupancy = roomType === 'office' ? areaM2 * 0.12 : roomType === 'meeting' ? areaM2 * 0.18 : roomType === 'lobby' ? areaM2 * 0.08 : areaM2 * 0.04
    const occupancy = Math.max(0, Math.round(baseOccupancy * effectiveMult + (seededRandom(seed, 41) - 0.5) * 2))

    // CO₂
    const co2 = Math.round(420 + occupancy * 35 + (seededRandom(seed, 47) - 0.5) * 40)

    // PM2.5
    const pm25 = Math.round(18 + (seededRandom(seed, 53) - 0.3) * 30)
    const pm25Clamped = clamp(pm25, 8, 85)

    // 降水量（仅部分时段可能有雨）
    const precipBase = hour >= 14 && hour <= 17 ? (seededRandom(seed, 59) * 2.5) : seededRandom(seed, 59) * 0.3
    const precipitation = Number(precipBase.toFixed(1))

    records.push({
      hour,
      electricity_kwh: electricity,
      hvac_kwh: hvac,
      lighting_kwh: lighting,
      socket_kwh: socket,
      water_m3: water,
      indoor_temp_c: indoorTemp,
      indoor_humidity_pct: indoorHumidity,
      outdoor_temp_c: outdoorTemp,
      outdoor_humidity_pct: outdoorHumidity,
      precipitation_mm: precipitation,
      occupancy_count: occupancy,
      co2_ppm: co2,
      pm25_ugm3: pm25Clamped,
    })
  }

  return records
}

// ---- 构建每日汇总 ----
export function buildDailySummary(
  zoneId: string,
  roomType: RoomType,
  areaM2: number,
  date: string,
): DailyEnergySummary {
  const cacheKey = `${zoneId}:${roomType}:${areaM2.toFixed(2)}:${date}`
  const cached = dailySummaryCache.get(cacheKey)
  if (cached) return cached

  const hourly = buildHourlyRecords(zoneId, roomType, areaM2, date)

  const totalElectricity = hourly.reduce((s, r) => s + r.electricity_kwh, 0)
  const totalHvac = hourly.reduce((s, r) => s + r.hvac_kwh, 0)
  const totalLighting = hourly.reduce((s, r) => s + r.lighting_kwh, 0)
  const totalSocket = hourly.reduce((s, r) => s + r.socket_kwh, 0)
  const totalWater = hourly.reduce((s, r) => s + r.water_m3, 0)
  const peakKw = Math.max(...hourly.map((r) => r.electricity_kwh))
  const avgIndoorTemp = hourly.reduce((s, r) => s + r.indoor_temp_c, 0) / 24
  const avgHumidity = hourly.reduce((s, r) => s + r.indoor_humidity_pct, 0) / 24
  const occupancies = hourly.map((r) => r.occupancy_count)
  const avgOccupancy = occupancies.reduce((s, v) => s + v, 0) / 24
  const maxOccupancy = Math.max(...occupancies)

  const summary = {
    date,
    total_electricity_kwh: Number(totalElectricity.toFixed(2)),
    total_hvac_kwh: Number(totalHvac.toFixed(2)),
    total_lighting_kwh: Number(totalLighting.toFixed(2)),
    total_socket_kwh: Number(totalSocket.toFixed(2)),
    total_water_m3: Number(totalWater.toFixed(3)),
    peak_power_kw: Number(peakKw.toFixed(2)),
    avg_indoor_temp_c: Number(avgIndoorTemp.toFixed(1)),
    avg_indoor_humidity_pct: Number(avgHumidity.toFixed(0)),
    avg_occupancy: Number(avgOccupancy.toFixed(1)),
    max_occupancy: Math.round(maxOccupancy),
    hourly,
  }
  dailySummaryCache.set(cacheKey, summary)
  return summary
}

// ---- 日期工具 ----
export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function yesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function shiftDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getWeekDates(anchor: string): string[] {
  const d = new Date(anchor)
  const dayOfWeek = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7))
  const result: string[] = []
  for (let i = 0; i < 7; i++) {
    const wd = new Date(monday)
    wd.setDate(monday.getDate() + i)
    result.push(`${wd.getFullYear()}-${String(wd.getMonth() + 1).padStart(2, '0')}-${String(wd.getDate()).padStart(2, '0')}`)
  }
  return result
}

/** 简单电费模型：峰电 1.05 元/kWh，谷电 0.46 元/kWh */
export function estimateCost(kwh: number): number {
  return Number((kwh * 0.82).toFixed(2))
}

function formatTimestamp(date: string, hour: number): string {
  return `${date} ${String(hour).padStart(2, '0')}:00`
}

function resolveDeviceStatus(
  projectId: string,
  buildingId: string,
  record: HourlyEnergyRecord,
  daily: DailyEnergySummary,
): OfficeMonitoringRecord['device_status'] {
  if (
    OFFICE_ACTIVE_ANOMALIES.some(
      (anomaly) => anomaly.buildingId === buildingId && anomaly.hour === record.hour,
    )
  ) {
    return 'warning'
  }

  const baseline = daily.total_electricity_kwh / 24
  const peakRatio = record.electricity_kwh / Math.max(baseline, 1)
  if (
    (record.hour >= 6 && record.hour <= 18 && peakRatio > 1.92) ||
    record.indoor_temp_c > 30.4
  ) {
    return 'warning'
  }
  if (record.pm25_ugm3 > 76 && seededRandom(`${projectId}:${buildingId}:${record.hour}`, 83) > 0.82) {
    return 'maintenance'
  }
  if (
    record.electricity_kwh < baseline * 0.15 &&
    record.hour >= 2 &&
    record.hour <= 4 &&
    seededRandom(`${projectId}:${buildingId}:${record.hour}`, 89) > 0.9
  ) {
    return 'offline'
  }
  return 'normal'
}

function applyActiveAnomaly(
  projectId: string,
  buildingId: string,
  record: HourlyEnergyRecord,
): HourlyEnergyRecord {
  const anomaly = OFFICE_ACTIVE_ANOMALIES.find(
    (item) => item.buildingId === buildingId && item.hour === record.hour,
  )
  if (!anomaly) return record

  const loadFactor =
    anomaly.type === 'hvac-load' ? 1.24 : anomaly.type === 'lighting-lock' ? 1.16 : 1.08
  const hvacFactor = anomaly.type === 'hvac-load' ? 1.35 : anomaly.type === 'return-temp' ? 1.18 : 1.03
  const tempLift = anomaly.type === 'return-temp' ? 2.2 : anomaly.type === 'hvac-load' ? 0.8 : 0.2
  const jitter = 0.98 + seededRandom(`${projectId}:${buildingId}:${record.hour}:active`, 97) * 0.04
  const electricity = record.electricity_kwh * loadFactor * jitter
  const hvac = Math.min(electricity * 0.58, record.hvac_kwh * hvacFactor * jitter)

  return {
    ...record,
    electricity_kwh: Number(electricity.toFixed(3)),
    hvac_kwh: Number(hvac.toFixed(3)),
    indoor_temp_c: Number((record.indoor_temp_c + tempLift).toFixed(1)),
  }
}

export function buildOfficeMonitoringDataset(
  projectId: string,
  anchorDate = todayStr(),
): OfficeMonitoringRecord[] {
  const cacheKey = `${projectId}:${anchorDate}`
  const cached = officeMonitoringCache.get(cacheKey)
  if (cached) return cached

  const records: OfficeMonitoringRecord[] = []
  let id = 1

  for (let dayOffset = 11; dayOffset >= 0; dayOffset--) {
    const date = shiftDateStr(anchorDate, -dayOffset)
    for (const building of OFFICE_SAMPLE_BUILDINGS) {
      const effectiveArea =
        building.area * (0.96 + seededRandom(`${projectId}:${building.id}`, 71) * 0.08)
      const daily = buildDailySummary(`${projectId}:${building.id}`, 'office', effectiveArea, date)

      for (const hour of [0, 6, 12, 18]) {
        const record = applyActiveAnomaly(projectId, building.id, daily.hourly[hour]!)
        const status = resolveDeviceStatus(projectId, building.id, record, daily)
        const hvacRatio = record.hvac_kwh / Math.max(record.electricity_kwh, 1)
        const supplyTemp = clamp(7.2 - hvacRatio * 1.2, 5.8, 8.4)
        const returnTemp = supplyTemp + clamp(3.8 + record.indoor_temp_c * 0.08, 4.2, 7.4)
        const occupancyBase =
          hour >= 9 && hour <= 17 ? 72 : hour >= 6 && hour < 9 ? 38 : hour >= 18 ? 24 : 8
        const occupancyDensity = clamp(
          occupancyBase * building.occupancy + (seededRandom(`${building.id}:${date}:${hour}`, 79) - 0.5) * 10,
          4,
          92,
        )

        records.push({
          building_id: building.id,
          building_type: building.type,
          chilled_water_return_temp: Number(returnTemp.toFixed(2)),
          chilled_water_supply_temp: Number(supplyTemp.toFixed(2)),
          device_id: `${building.id}-MTR-${String((id % 36) + 1).padStart(2, '0')}`,
          device_status: status,
          electricity_kwh: Number(record.electricity_kwh.toFixed(1)),
          env_humidity: record.indoor_humidity_pct,
          env_temperature: record.indoor_temp_c,
          hvac_kwh: Number(record.hvac_kwh.toFixed(1)),
          id,
          monitor_time: formatTimestamp(date, hour),
          occupancy_density: Number(occupancyDensity.toFixed(1)),
          water_m3: Number(record.water_m3.toFixed(1)),
        })
        id++
      }
    }
  }

  records.sort((left, right) => right.monitor_time.localeCompare(left.monitor_time))
  officeMonitoringCache.set(cacheKey, records)
  return records
}

function baselineForRecord(record: OfficeMonitoringRecord): number {
  const seed = `${record.building_id}:${record.monitor_time.slice(0, 10)}:${record.monitor_time.slice(11, 13)}`
  return Number((record.electricity_kwh * (0.84 + seededRandom(seed, 101) * 0.05)).toFixed(1))
}

function currentForAnomaly(record: OfficeMonitoringRecord, type: OfficeOperationsAlert['type']) {
  if (type === 'return-temp') {
    return Number((record.env_temperature + 0.6).toFixed(1))
  }
  return record.electricity_kwh
}

function baselineForAnomaly(record: OfficeMonitoringRecord, type: OfficeOperationsAlert['type']) {
  if (type === 'return-temp') {
    return Number((record.env_temperature - 2.1).toFixed(1))
  }
  return baselineForRecord(record)
}

function recommendationForAnomaly(type: OfficeOperationsAlert['type']) {
  if (type === 'lighting-lock') {
    return '建议调取 21:00-06:00 控制日志，复核定时闭锁、人体感应阈值和回路联动状态，确认后同步修正策略参数。'
  }
  if (type === 'return-temp') {
    return '建议先核对回风传感器读数，再检查冷冻水阀门开度和末端风量；若温差仍扩大，切换为重点监测并复核控制策略。'
  }
  return '建议优先比对近 30 天同时间段基线与实时负荷曲线，再现场核查过滤器压差、阀门开度和送回风温差。'
}

function buildOfficeOperationsAlerts(
  projectId: string,
  monitoringRecords: OfficeMonitoringRecord[],
  anchorDate: string,
): OfficeOperationsAlert[] {
  const alerts: OfficeOperationsAlert[] = []

  for (const anomaly of OFFICE_ACTIVE_ANOMALIES) {
    const record = monitoringRecords.find(
      (item) =>
        item.building_id === anomaly.buildingId &&
        item.monitor_time.startsWith(anchorDate) &&
        Number(item.monitor_time.slice(11, 13)) === anomaly.hour,
    )
    if (!record) continue

    const currentValue = currentForAnomaly(record, anomaly.type)
    const baselineValue = baselineForAnomaly(record, anomaly.type)
    const baselineDeltaPct =
      anomaly.type === 'return-temp'
        ? Number((currentValue - baselineValue).toFixed(1))
        : Number((((currentValue - baselineValue) / Math.max(baselineValue, 1)) * 100).toFixed(1))
    const unit = anomaly.type === 'return-temp' ? '°C' : 'kWh'

    alerts.push({
      baselineDeltaPct,
      baselineValue,
      currentValue,
      detail:
        anomaly.type === 'return-temp'
          ? `${anomaly.location} · ${currentValue.toFixed(1)}${unit}(+${baselineDeltaPct.toFixed(1)}${unit})`
          : `${anomaly.location} · ${currentValue.toFixed(1)} ${unit}(+${baselineDeltaPct.toFixed(1)}%)`,
      id: `${projectId}-${anomaly.id}`,
      location: anomaly.location,
      occurredAt: `${String(anomaly.hour).padStart(2, '0')}:${anomaly.severity === 'high' ? '42' : '18'}`,
      recommendation: recommendationForAnomaly(anomaly.type),
      severity: anomaly.severity,
      status: anomaly.status,
      title: anomaly.title,
      type: anomaly.type,
      unit,
    })
  }

  return alerts
}

export function buildOfficeOperationsSnapshot(
  projectId: string,
  anchorDate = todayStr(),
): OfficeOperationsSnapshot {
  const cacheKey = `${projectId}:${anchorDate}`
  const cached = officeOperationsSnapshotCache.get(cacheKey)
  if (cached) return cached

  const monitoringRecords = buildOfficeMonitoringDataset(projectId, anchorDate)
  const activeAlerts = buildOfficeOperationsAlerts(projectId, monitoringRecords, anchorDate)
  const statusCounts: Record<OfficeMonitoringRecord['device_status'], number> = {
    maintenance: 0,
    normal: 0,
    offline: 0,
    warning: 0,
  }
  for (const record of monitoringRecords) {
    statusCounts[record.device_status] += 1
  }

  const todayRecords = monitoringRecords.filter((record) => record.monitor_time.startsWith(anchorDate))
  const todayElectricityKwh = Number(
    todayRecords.reduce((sum, record) => sum + record.electricity_kwh, 0).toFixed(1),
  )
  const todayHvacKwh = Number(
    todayRecords.reduce((sum, record) => sum + record.hvac_kwh, 0).toFixed(1),
  )
  const alertSummary = {
    high: activeAlerts.filter((alert) => alert.severity === 'high').length,
    medium: activeAlerts.filter((alert) => alert.severity === 'medium').length,
    total: activeAlerts.length,
  }
  const abnormalCount = statusCounts.warning + statusCounts.maintenance + statusCounts.offline
  const abnormalRate = abnormalCount / Math.max(monitoringRecords.length, 1)
  const hvacRatio = todayHvacKwh / Math.max(todayElectricityKwh, 1)
  const healthScore = Math.round(
    clamp(
      96 -
        alertSummary.high * 9 -
        alertSummary.medium * 5 -
        statusCounts.maintenance * 2 -
        statusCounts.offline * 3 -
        abnormalRate * 28 -
        Math.max(0, hvacRatio - 0.42) * 18,
      52,
      96,
    ),
  )

  const snapshot = {
    activeAlerts,
    alertSummary,
    healthScore,
    monitoringRecords,
    statusCounts,
    todayElectricityKwh,
    todayHvacKwh,
    updatedAt: `${anchorDate}T18:00:00.000Z`,
  }
  officeOperationsSnapshotCache.set(cacheKey, snapshot)
  return snapshot
}

export function getActiveOfficeOperationsSnapshot(
  projectId: string,
  anchorDate = todayStr(),
): OfficeOperationsSnapshot {
  const snapshot = buildOfficeOperationsSnapshot(projectId, anchorDate)
  const resolvedAlertIds = new Set(getResolvedOfficeAlertIds(projectId))
  const activeAlerts = snapshot.activeAlerts.filter((alert) => !resolvedAlertIds.has(alert.id))
  const alertSummary = {
    high: activeAlerts.filter((alert) => alert.severity === 'high').length,
    medium: activeAlerts.filter((alert) => alert.severity === 'medium').length,
    total: activeAlerts.length,
  }
  const resolvedCount = snapshot.alertSummary.total - alertSummary.total
  const healthScore = Math.round(clamp(snapshot.healthScore + resolvedCount * 5, 52, 96))

  return {
    ...snapshot,
    activeAlerts,
    alertSummary,
    healthScore,
  }
}

// ---- 从 hourly 构建旧版 EnergyApiResponse 兼容结构 ----
export function buildComponentEnergyFromDaily(
  projectId: string,
  componentId: string,
  daily: DailyEnergySummary,
  monthMultiplier = 28,
): {
  projectId: string
  componentId: string
  currentPower: number
  todayUsage: number
  monthUsage: number
  series: Array<{ time: string; value: number }>
  hvacUsage: number
  waterUsage: number
  lightingUsage: number
  socketUsage: number
  updatedAt: string
} {
  const todayUsage = daily.total_electricity_kwh
  const monthUsage = Number((todayUsage * monthMultiplier).toFixed(1))
  const series = daily.hourly.map((r) => ({
    time: `${String(r.hour).padStart(2, '0')}:00`,
    value: r.electricity_kwh,
  }))
  const currentPower = daily.hourly[new Date().getHours() % 24]?.electricity_kwh ?? daily.hourly[12]!.electricity_kwh

  return {
    projectId,
    componentId,
    currentPower: Number(currentPower.toFixed(1)),
    todayUsage: Number(todayUsage.toFixed(1)),
    monthUsage: Number(monthUsage.toFixed(1)),
    series,
    hvacUsage: Number(daily.total_hvac_kwh.toFixed(1)),
    waterUsage: Number(daily.total_water_m3.toFixed(2)),
    lightingUsage: Number(daily.total_lighting_kwh.toFixed(1)),
    socketUsage: Number(daily.total_socket_kwh.toFixed(1)),
    updatedAt: new Date().toISOString(),
  }
}
