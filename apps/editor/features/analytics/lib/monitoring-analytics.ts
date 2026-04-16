export interface MonitoringRecord {
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

export interface MonitoringMetric {
  detail: string
  label: string
  tone: 'amber' | 'emerald' | 'rose' | 'sky'
  value: string
}

export interface MonitoringDailyPoint {
  date: string
  electricity: number
  hvac: number
  water: number
}

export interface MonitoringBuildingSummary {
  averageOccupancy: number
  buildingId: string
  buildingType: string
  electricity: number
  hvac: number
  statusLabel: string
  water: number
}

export interface MonitoringStatusBucket {
  count: number
  label: string
  tone: 'amber' | 'emerald' | 'rose' | 'slate'
}

export interface MonitoringFieldGlossaryItem {
  dataType: string
  description: string
  field: string
}

export interface MonitoringPeakSnapshot {
  buildingId: string
  deviceId: string
  electricity: number
  humidity: number
  monitorTime: string
  temperature: number
}

export interface MonitoringAnalyticsModel {
  buildingSummaries: MonitoringBuildingSummary[]
  dailySeries: MonitoringDailyPoint[]
  fieldGlossary: MonitoringFieldGlossaryItem[]
  metrics: MonitoringMetric[]
  peakSnapshot: MonitoringPeakSnapshot
  recentRecords: MonitoringRecord[]
  statusDistribution: MonitoringStatusBucket[]
}

const BUILDINGS = [
  {
    id: 'BLDG-A-03',
    type: 'office',
    electricityBase: 126,
    hvacBase: 56,
    humidityBase: 49,
    occupancyBase: 0.78,
    supplyBase: 7.1,
    temperatureBase: 25.4,
    waterBase: 17.5,
  },
  {
    id: 'BLDG-B-01',
    type: 'teaching',
    electricityBase: 114,
    hvacBase: 42,
    humidityBase: 53,
    occupancyBase: 0.62,
    supplyBase: 6.7,
    temperatureBase: 24.6,
    waterBase: 14.2,
  },
  {
    id: 'BLDG-C-07',
    type: 'lab',
    electricityBase: 149,
    hvacBase: 68,
    humidityBase: 46,
    occupancyBase: 0.55,
    supplyBase: 7.5,
    temperatureBase: 23.9,
    waterBase: 19.3,
  },
  {
    id: 'BLDG-D-02',
    type: 'mixed-use',
    electricityBase: 136,
    hvacBase: 60,
    humidityBase: 51,
    occupancyBase: 0.71,
    supplyBase: 7.0,
    temperatureBase: 25.0,
    waterBase: 16.1,
  },
] as const

const HOURS = [0, 6, 12, 18] as const
const REFERENCE_TIME = new Date('2026-04-15T18:00:00')

function hashString(input: string): number {
  let value = 0
  for (let index = 0; index < input.length; index += 1) {
    value = (value * 33 + input.charCodeAt(index)) % 100003
  }
  return value
}

function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTimestamp(date: Date, hour: number) {
  return `${formatDate(date)} ${`${hour}`.padStart(2, '0')}:00`
}

function statusLabel(status: MonitoringRecord['device_status']) {
  switch (status) {
    case 'maintenance':
      return '维护中'
    case 'offline':
      return '离线'
    case 'warning':
      return '预警'
    default:
      return '正常'
  }
}

function toneFromStatus(status: MonitoringRecord['device_status']) {
  switch (status) {
    case 'maintenance':
      return 'amber'
    case 'offline':
      return 'slate'
    case 'warning':
      return 'rose'
    default:
      return 'emerald'
  }
}

function createMonitoringRecords(projectId: string): MonitoringRecord[] {
  const records: MonitoringRecord[] = []
  let id = 1

  for (let dayOffset = 11; dayOffset >= 0; dayOffset -= 1) {
    const date = new Date(REFERENCE_TIME)
    date.setDate(REFERENCE_TIME.getDate() - dayOffset)

    for (const building of BUILDINGS) {
      for (const hour of HOURS) {
        const seed = hashString(`${projectId}-${building.id}-${dayOffset}-${hour}`)
        const dailyWave = Math.sin((dayOffset / 11) * Math.PI)
        const hourlyBoost =
          hour === 12 ? 20 : hour === 18 ? 12 : hour === 6 ? 6 : -10
        const weatherSwing = ((seed % 9) - 4) * 0.3
        const electricity =
          building.electricityBase +
          dailyWave * 18 +
          hourlyBoost +
          (seed % 17) -
          4
        const hvac =
          building.hvacBase +
          dailyWave * 9 +
          (hour >= 12 ? 10 : 4) +
          ((seed >> 2) % 11) -
          3
        const water =
          building.waterBase +
          dailyWave * 2.4 +
          (hour === 12 ? 1.8 : hour === 18 ? 1.1 : 0.4) +
          ((seed >> 3) % 10) * 0.2
        const envTemperature =
          building.temperatureBase +
          dailyWave * 2.1 +
          (hour === 12 ? 2.6 : hour === 18 ? 1.4 : 0.2) +
          weatherSwing
        const envHumidity =
          building.humidityBase +
          dailyWave * 4.3 +
          (hour === 0 ? 4.2 : 1.5) +
          ((seed >> 4) % 9) -
          4
        const occupancyDensity =
          building.occupancyBase +
          (hour === 12 ? 0.24 : hour === 18 ? 0.12 : hour === 6 ? 0.08 : -0.15) +
          (((seed >> 5) % 7) - 3) * 0.03
        const supplyTemp =
          building.supplyBase +
          dailyWave * 0.35 +
          (((seed >> 6) % 8) - 4) * 0.08
        const returnTemp = supplyTemp + 4.7 + (((seed >> 7) % 7) - 3) * 0.11

        let deviceStatus: MonitoringRecord['device_status'] = 'normal'
        if (electricity > building.electricityBase + 34 || envTemperature > 30.5) {
          deviceStatus = 'warning'
        } else if ((seed >> 8) % 23 === 0) {
          deviceStatus = 'maintenance'
        } else if ((seed >> 9) % 41 === 0) {
          deviceStatus = 'offline'
        }

        records.push({
          id,
          building_id: building.id,
          building_type: building.type,
          monitor_time: formatTimestamp(date, hour),
          electricity_kwh: Number(electricity.toFixed(1)),
          water_m3: Number(water.toFixed(1)),
          hvac_kwh: Number(hvac.toFixed(1)),
          chilled_water_supply_temp: Number(supplyTemp.toFixed(2)),
          chilled_water_return_temp: Number(returnTemp.toFixed(2)),
          env_temperature: Number(envTemperature.toFixed(1)),
          env_humidity: Number(envHumidity.toFixed(1)),
          occupancy_density: Number((occupancyDensity * 100).toFixed(1)),
          device_id: `${building.id}-DEV-${`${(seed % 27) + 1}`.padStart(2, '0')}`,
          device_status: deviceStatus,
        })

        id += 1
      }
    }
  }

  return records.sort((left, right) => right.monitor_time.localeCompare(left.monitor_time))
}

export function buildMonitoringAnalyticsModel(projectId: string): MonitoringAnalyticsModel {
  const records = createMonitoringRecords(projectId)
  const totalElectricity = records.reduce((sum, record) => sum + record.electricity_kwh, 0)
  const totalWater = records.reduce((sum, record) => sum + record.water_m3, 0)
  const totalHvac = records.reduce((sum, record) => sum + record.hvac_kwh, 0)
  const warningCount = records.filter((record) => record.device_status === 'warning').length
  const latestRecord = records[0]!
  const peakRecord = records.reduce((best, record) =>
    record.electricity_kwh > best.electricity_kwh ? record : best,
  )

  const metrics: MonitoringMetric[] = [
    {
      label: '累计电耗',
      value: `${totalElectricity.toFixed(1)} kWh`,
      detail: '最近 12 天的全量楼栋监测汇总',
      tone: 'sky',
    },
    {
      label: '累计水耗',
      value: `${totalWater.toFixed(1)} m3`,
      detail: '按监测点逐时采样汇总',
      tone: 'emerald',
    },
    {
      label: '暖通负荷',
      value: `${totalHvac.toFixed(1)} kWh`,
      detail: '用于观察 HVAC 运行强度',
      tone: 'amber',
    },
    {
      label: '高风险时段',
      value: `${warningCount} 条`,
      detail: `最近更新 ${latestRecord.monitor_time}`,
      tone: 'rose',
    },
  ]

  const dailyGroups = new Map<string, MonitoringDailyPoint>()
  for (const record of records) {
    const date = record.monitor_time.slice(0, 10)
    const existing = dailyGroups.get(date) ?? {
      date,
      electricity: 0,
      water: 0,
      hvac: 0,
    }
    existing.electricity += record.electricity_kwh
    existing.water += record.water_m3
    existing.hvac += record.hvac_kwh
    dailyGroups.set(date, existing)
  }

  const dailySeries = [...dailyGroups.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((point) => ({
      date: point.date.slice(5),
      electricity: Number(point.electricity.toFixed(1)),
      water: Number(point.water.toFixed(1)),
      hvac: Number(point.hvac.toFixed(1)),
    }))

  const buildingGroups = new Map<string, MonitoringBuildingSummary>()
  for (const record of records) {
    const existing = buildingGroups.get(record.building_id) ?? {
      buildingId: record.building_id,
      buildingType: record.building_type,
      electricity: 0,
      water: 0,
      hvac: 0,
      averageOccupancy: 0,
      statusLabel: '正常',
    }

    existing.electricity += record.electricity_kwh
    existing.water += record.water_m3
    existing.hvac += record.hvac_kwh
    existing.averageOccupancy += record.occupancy_density

    if (record.device_status === 'warning') {
      existing.statusLabel = '预警优先'
    } else if (record.device_status === 'maintenance' && existing.statusLabel !== '预警优先') {
      existing.statusLabel = '维护观察'
    } else if (record.device_status === 'offline' && existing.statusLabel === '正常') {
      existing.statusLabel = '离线补采'
    }

    buildingGroups.set(record.building_id, existing)
  }

  const buildingSummaries = [...buildingGroups.values()]
    .map((summary) => ({
      ...summary,
      electricity: Number(summary.electricity.toFixed(1)),
      water: Number(summary.water.toFixed(1)),
      hvac: Number(summary.hvac.toFixed(1)),
      averageOccupancy: Number((summary.averageOccupancy / (HOURS.length * 12)).toFixed(1)),
    }))
    .sort((left, right) => right.electricity - left.electricity)

  const statusCounts = new Map<MonitoringRecord['device_status'], number>()
  for (const record of records) {
    statusCounts.set(record.device_status, (statusCounts.get(record.device_status) ?? 0) + 1)
  }

  const statusDistribution: MonitoringStatusBucket[] = (
    ['normal', 'warning', 'maintenance', 'offline'] as const
  ).map((status) => ({
    label: statusLabel(status),
    count: statusCounts.get(status) ?? 0,
    tone: toneFromStatus(status),
  }))

  const fieldGlossary: MonitoringFieldGlossaryItem[] = [
    { field: 'id', dataType: 'BIGINT', description: '物理主键，保证全局监测记录唯一。' },
    { field: 'building_id', dataType: 'VARCHAR', description: '空间标识，映射楼层与 3D 建模定位。' },
    { field: 'building_type', dataType: 'VARCHAR', description: '建筑类型，用于办公、实验、教学等维度对比。' },
    { field: 'monitor_time', dataType: 'DATETIME', description: '监测时间，精确到小时，驱动逐日与逐时图表。' },
    { field: 'electricity_kwh', dataType: 'DECIMAL', description: '总电耗，反映楼层或整栋建筑的电力负荷。' },
    { field: 'water_m3', dataType: 'DECIMAL', description: '总水耗，用于观察用水波动与异常峰值。' },
    { field: 'hvac_kwh', dataType: 'DECIMAL', description: '暖通系统独立能耗，用来判断 HVAC 运行效率。' },
    { field: 'chilled_water_supply_temp', dataType: 'DECIMAL', description: '冷冻水机组输出的初始供水温度。' },
    { field: 'chilled_water_return_temp', dataType: 'DECIMAL', description: '换热回流温度，用于诊断系统能效异常。' },
    { field: 'env_temperature', dataType: 'DECIMAL', description: '室外气温，对热负荷和电耗有直接影响。' },
    { field: 'env_humidity', dataType: 'DECIMAL', description: '室外湿度，是空调除湿负荷的重要参数。' },
    { field: 'occupancy_density', dataType: 'DECIMAL', description: '人员密度，用于关联空间利用率与负荷变化。' },
    { field: 'device_id', dataType: 'VARCHAR', description: '设备唯一编号，对应电表、水表或传感器位置。' },
    { field: 'device_status', dataType: 'VARCHAR', description: '运行状态，可用于三维高亮、运维告警与补采。' },
  ]

  return {
    metrics,
    dailySeries,
    buildingSummaries,
    statusDistribution,
    recentRecords: records.slice(0, 18),
    fieldGlossary,
    peakSnapshot: {
      buildingId: peakRecord.building_id,
      deviceId: peakRecord.device_id,
      monitorTime: peakRecord.monitor_time,
      electricity: peakRecord.electricity_kwh,
      temperature: peakRecord.env_temperature,
      humidity: peakRecord.env_humidity,
    },
  }
}
