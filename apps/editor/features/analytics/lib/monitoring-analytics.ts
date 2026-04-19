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
  occupancy: number
  water: number
}

export interface MonitoringHourlyPoint {
  electricity: number
  hour: string
  hvac: number
  occupancy: number
  temperature: number
}

export interface MonitoringBuildingSummary {
  averageOccupancy: number
  buildingId: string
  buildingType: string
  efficiencyScore: number
  electricity: number
  hvac: number
  statusLabel: string
  warningCount: number
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
  occupancy: number
  temperature: number
}

export interface MonitoringScatterPoint {
  buildingId: string
  electricity: number
  hour: string
  id: string
  occupancy: number
  temperature: number
  tone: 'amber' | 'emerald' | 'rose' | 'sky'
}

export interface MonitoringCompositionItem {
  color: string
  label: string
  value: number
}

export interface MonitoringHeatmapCell {
  date: string
  electricity: number
  hour: string
  intensity: number
  occupancy: number
}

export interface MonitoringRelationshipInsights {
  busiestHour: string
  occupancyCorrelation: number
  peakHour: string
  quietHour: string
  temperatureCorrelation: number
}

export interface MonitoringAnalyticsModel {
  buildingSummaries: MonitoringBuildingSummary[]
  composition: MonitoringCompositionItem[]
  dailySeries: MonitoringDailyPoint[]
  fieldGlossary: MonitoringFieldGlossaryItem[]
  heatmap: MonitoringHeatmapCell[]
  hourlySeries: MonitoringHourlyPoint[]
  metrics: MonitoringMetric[]
  occupancyScatter: MonitoringScatterPoint[]
  peakSnapshot: MonitoringPeakSnapshot
  performanceScore: number
  recentRecords: MonitoringRecord[]
  relationshipInsights: MonitoringRelationshipInsights
  statusDistribution: MonitoringStatusBucket[]
}

const BUILDINGS = [
  {
    id: 'BLDG-A-03',
    tone: 'sky',
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
    tone: 'emerald',
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
    tone: 'amber',
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
    tone: 'rose',
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

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

function pearsonCorrelation(values: Array<{ x: number; y: number }>) {
  if (values.length < 2) {
    return 0
  }

  const count = values.length
  const sumX = values.reduce((sum, item) => sum + item.x, 0)
  const sumY = values.reduce((sum, item) => sum + item.y, 0)
  const meanX = sumX / count
  const meanY = sumY / count

  let numerator = 0
  let denominatorX = 0
  let denominatorY = 0

  for (const item of values) {
    const deltaX = item.x - meanX
    const deltaY = item.y - meanY
    numerator += deltaX * deltaY
    denominatorX += deltaX * deltaX
    denominatorY += deltaY * deltaY
  }

  const denominator = Math.sqrt(denominatorX * denominatorY)
  if (denominator === 0) {
    return 0
  }

  return numerator / denominator
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
        const hourlyOccupancyBoost =
          hour === 12 ? 0.28 : hour === 18 ? 0.14 : hour === 6 ? 0.08 : -0.16
        const weatherSwing = ((seed % 9) - 4) * 0.3
        const envTemperature =
          building.temperatureBase +
          dailyWave * 2.3 +
          (hour === 12 ? 2.7 : hour === 18 ? 1.6 : hour === 6 ? 0.9 : 0.1) +
          weatherSwing
        const occupancyDensity =
          building.occupancyBase +
          hourlyOccupancyBoost +
          (((seed >> 3) % 9) - 4) * 0.03 +
          dailyWave * 0.05
        const occupancyPercent = clamp(occupancyDensity * 100, 22, 98)
        const occupancyLoadFactor = Math.max(0, occupancyDensity - 0.42) * 58
        const coolingLoadFactor = Math.max(0, envTemperature - 24) * 4.8
        const electricity =
          building.electricityBase +
          dailyWave * 15 +
          (hour === 12 ? 18 : hour === 18 ? 10 : hour === 6 ? 6 : -12) +
          occupancyLoadFactor +
          coolingLoadFactor +
          ((seed >> 5) % 15) -
          5
        const hvac =
          building.hvacBase +
          dailyWave * 8.2 +
          coolingLoadFactor * 1.7 +
          occupancyLoadFactor * 0.32 +
          ((seed >> 6) % 10) -
          3
        const water =
          building.waterBase +
          dailyWave * 2.1 +
          occupancyDensity * 4.6 +
          (hour === 12 ? 1.7 : hour === 18 ? 1.1 : 0.3) +
          (((seed >> 7) % 11) - 4) * 0.18
        const envHumidity =
          building.humidityBase +
          dailyWave * 4.2 +
          (hour === 0 ? 4.8 : hour === 6 ? 2.7 : 0.9) +
          (((seed >> 8) % 7) - 3) * 0.9
        const supplyTemp =
          building.supplyBase +
          dailyWave * 0.35 +
          (((seed >> 9) % 8) - 4) * 0.08
        const returnTemp =
          supplyTemp +
          4.6 +
          Math.max(0, envTemperature - 24) * 0.12 +
          (((seed >> 10) % 9) - 4) * 0.08

        let deviceStatus: MonitoringRecord['device_status'] = 'normal'
        if (electricity > building.electricityBase + 44 || envTemperature > 30.8) {
          deviceStatus = 'warning'
        } else if ((seed >> 11) % 21 === 0) {
          deviceStatus = 'maintenance'
        } else if ((seed >> 12) % 39 === 0) {
          deviceStatus = 'offline'
        }

        records.push({
          id,
          building_id: building.id,
          building_type: building.type,
          chilled_water_return_temp: Number(returnTemp.toFixed(2)),
          chilled_water_supply_temp: Number(supplyTemp.toFixed(2)),
          device_id: `${building.id}-DEV-${`${(seed % 27) + 1}`.padStart(2, '0')}`,
          device_status: deviceStatus,
          electricity_kwh: Number(electricity.toFixed(1)),
          env_humidity: Number(envHumidity.toFixed(1)),
          env_temperature: Number(envTemperature.toFixed(1)),
          hvac_kwh: Number(hvac.toFixed(1)),
          monitor_time: formatTimestamp(date, hour),
          occupancy_density: Number(occupancyPercent.toFixed(1)),
          water_m3: Number(water.toFixed(1)),
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

  const averageOccupancy =
    records.reduce((sum, record) => sum + record.occupancy_density, 0) / records.length
  const occupancyCorrelation = pearsonCorrelation(
    records.map((record) => ({
      x: record.occupancy_density,
      y: record.electricity_kwh,
    })),
  )
  const temperatureCorrelation = pearsonCorrelation(
    records.map((record) => ({
      x: record.env_temperature,
      y: record.electricity_kwh,
    })),
  )

  const metrics: MonitoringMetric[] = [
    {
      label: '累计耗电量',
      value: `${totalElectricity.toFixed(0)} kWh`,
      detail: '最近 12 天所有楼栋的总电耗汇总。',
      tone: 'sky',
    },
    {
      label: '平均人流密度',
      value: `${averageOccupancy.toFixed(1)} 人流指数`,
      detail: '按楼栋和时段平均后的整体空间活跃度。',
      tone: 'emerald',
    },
    {
      label: '峰值负荷',
      value: `${peakRecord.electricity_kwh.toFixed(1)} kWh`,
      detail: `${peakRecord.building_id} · ${peakRecord.monitor_time}`,
      tone: 'amber',
    },
    {
      label: 'HVAC 占电比',
      value: `${((totalHvac / totalElectricity) * 100).toFixed(1)}%`,
      detail: '用于判断暖通系统是否持续处于高负荷状态。',
      tone: 'sky',
    },
    {
      label: '预警时段',
      value: `${warningCount} 条`,
      detail: `最新监测时间 ${latestRecord.monitor_time}`,
      tone: 'rose',
    },
  ]

  const dailyGroups = new Map<
    string,
    {
      count: number
      date: string
      electricity: number
      hvac: number
      occupancy: number
      water: number
    }
  >()

  for (const record of records) {
    const date = record.monitor_time.slice(0, 10)
    const existing = dailyGroups.get(date) ?? {
      count: 0,
      date,
      electricity: 0,
      hvac: 0,
      occupancy: 0,
      water: 0,
    }

    existing.count += 1
    existing.electricity += record.electricity_kwh
    existing.hvac += record.hvac_kwh
    existing.occupancy += record.occupancy_density
    existing.water += record.water_m3

    dailyGroups.set(date, existing)
  }

  const dailySeries = [...dailyGroups.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((point) => ({
      date: point.date.slice(5),
      electricity: Number(point.electricity.toFixed(1)),
      hvac: Number(point.hvac.toFixed(1)),
      occupancy: Number((point.occupancy / point.count).toFixed(1)),
      water: Number(point.water.toFixed(1)),
    }))

  const hourlyGroups = new Map<
    number,
    {
      count: number
      electricity: number
      hour: number
      hvac: number
      occupancy: number
      temperature: number
    }
  >()

  for (const record of records) {
    const hour = Number(record.monitor_time.slice(11, 13))
    const existing = hourlyGroups.get(hour) ?? {
      count: 0,
      electricity: 0,
      hour,
      hvac: 0,
      occupancy: 0,
      temperature: 0,
    }

    existing.count += 1
    existing.electricity += record.electricity_kwh
    existing.hvac += record.hvac_kwh
    existing.occupancy += record.occupancy_density
    existing.temperature += record.env_temperature

    hourlyGroups.set(hour, existing)
  }

  const hourlySeries = HOURS.map((hour) => {
    const point = hourlyGroups.get(hour)!
    return {
      electricity: Number((point.electricity / point.count).toFixed(1)),
      hour: `${`${hour}`.padStart(2, '0')}:00`,
      hvac: Number((point.hvac / point.count).toFixed(1)),
      occupancy: Number((point.occupancy / point.count).toFixed(1)),
      temperature: Number((point.temperature / point.count).toFixed(1)),
    }
  })

  const buildingGroups = new Map<
    string,
    MonitoringBuildingSummary & {
      count: number
    }
  >()

  for (const record of records) {
    const existing = buildingGroups.get(record.building_id) ?? {
      averageOccupancy: 0,
      buildingId: record.building_id,
      buildingType: record.building_type,
      count: 0,
      efficiencyScore: 0,
      electricity: 0,
      hvac: 0,
      statusLabel: '运行平稳',
      warningCount: 0,
      water: 0,
    }

    existing.count += 1
    existing.electricity += record.electricity_kwh
    existing.hvac += record.hvac_kwh
    existing.water += record.water_m3
    existing.averageOccupancy += record.occupancy_density

    if (record.device_status === 'warning') {
      existing.warningCount += 1
      existing.statusLabel = '预警优先'
    } else if (record.device_status === 'maintenance' && existing.statusLabel !== '预警优先') {
      existing.statusLabel = '维护观察'
    } else if (record.device_status === 'offline' && existing.statusLabel === '运行平稳') {
      existing.statusLabel = '离线补采'
    }

    buildingGroups.set(record.building_id, existing)
  }

  const buildingSummaries = [...buildingGroups.values()]
    .map((summary) => {
      const averageOccupancyValue = summary.averageOccupancy / summary.count
      const electricityPerOccupancy = summary.electricity / Math.max(averageOccupancyValue, 1)
      const efficiencyScore = clamp(
        100 - electricityPerOccupancy * 0.52 - summary.warningCount * 2.4,
        61,
        96,
      )

      return {
        averageOccupancy: Number(averageOccupancyValue.toFixed(1)),
        buildingId: summary.buildingId,
        buildingType: summary.buildingType,
        efficiencyScore: Math.round(efficiencyScore),
        electricity: Number(summary.electricity.toFixed(1)),
        hvac: Number(summary.hvac.toFixed(1)),
        statusLabel: summary.statusLabel,
        warningCount: summary.warningCount,
        water: Number(summary.water.toFixed(1)),
      }
    })
    .sort((left, right) => right.electricity - left.electricity)

  const statusCounts = new Map<MonitoringRecord['device_status'], number>()
  for (const record of records) {
    statusCounts.set(record.device_status, (statusCounts.get(record.device_status) ?? 0) + 1)
  }

  const statusDistribution: MonitoringStatusBucket[] = (
    ['normal', 'warning', 'maintenance', 'offline'] as const
  ).map((status) => ({
    count: statusCounts.get(status) ?? 0,
    label: statusLabel(status),
    tone: toneFromStatus(status),
  }))

  const occupancyScatter = records.slice(0, 48).map((record) => {
    const building = BUILDINGS.find((item) => item.id === record.building_id)
    return {
      buildingId: record.building_id,
      electricity: record.electricity_kwh,
      hour: record.monitor_time.slice(11, 16),
      id: `${record.building_id}-${record.id}`,
      occupancy: record.occupancy_density,
      temperature: record.env_temperature,
      tone: building?.tone ?? 'sky',
    }
  })

  const composition: MonitoringCompositionItem[] = [
    { label: '暖通系统', value: totalHvac, color: '#3b82f6' },
    { label: '照明系统', value: totalElectricity * 0.24, color: '#22c55e' },
    { label: '插座与设备', value: totalElectricity * 0.21, color: '#f59e0b' },
    { label: '公共区域', value: totalElectricity * 0.14, color: '#ef4444' },
    { label: '实验与专用负荷', value: totalElectricity * 0.11, color: '#8b5cf6' },
    { label: '其他损耗', value: totalElectricity * 0.08, color: '#06b6d4' },
  ].map((item) => ({
    ...item,
    value: Number(item.value.toFixed(1)),
  }))

  const heatmapSource = [...dailyGroups.values()]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 7)
    .map((item) => item.date)
    .reverse()

  const heatmapCells: MonitoringHeatmapCell[] = []
  for (const date of heatmapSource) {
    for (const hour of HOURS) {
      const recordsForSlot = records.filter(
        (record) =>
          record.monitor_time.startsWith(date) && Number(record.monitor_time.slice(11, 13)) === hour,
      )

      const electricity =
        recordsForSlot.reduce((sum, record) => sum + record.electricity_kwh, 0) / recordsForSlot.length
      const occupancy =
        recordsForSlot.reduce((sum, record) => sum + record.occupancy_density, 0) / recordsForSlot.length

      heatmapCells.push({
        date: date.slice(5),
        electricity: Number(electricity.toFixed(1)),
        hour: `${`${hour}`.padStart(2, '0')}:00`,
        intensity: 0,
        occupancy: Number(occupancy.toFixed(1)),
      })
    }
  }

  const maxHeatmapElectricity = Math.max(...heatmapCells.map((cell) => cell.electricity), 1)
  const heatmap = heatmapCells.map((cell) => ({
    ...cell,
    intensity: Number((cell.electricity / maxHeatmapElectricity).toFixed(3)),
  }))

  const busiestHour =
    hourlySeries.reduce((best, point) => (point.occupancy > best.occupancy ? point : best)).hour
  const peakHour =
    hourlySeries.reduce((best, point) => (point.electricity > best.electricity ? point : best)).hour
  const quietHour =
    hourlySeries.reduce((best, point) => (point.electricity < best.electricity ? point : best)).hour

  const relationshipInsights: MonitoringRelationshipInsights = {
    busiestHour,
    occupancyCorrelation: Number(occupancyCorrelation.toFixed(3)),
    peakHour,
    quietHour,
    temperatureCorrelation: Number(temperatureCorrelation.toFixed(3)),
  }

  const performanceScore = Math.round(
    clamp(
      92 -
        warningCount * 0.28 -
        Math.max(0, (totalHvac / totalElectricity) * 12 - 4) +
        occupancyCorrelation * 6 +
        Math.max(0, temperatureCorrelation) * 3,
      72,
      97,
    ),
  )

  const fieldGlossary: MonitoringFieldGlossaryItem[] = [
    { field: 'id', dataType: 'BIGINT', description: '监测记录主键，便于做明细追踪和数据回溯。' },
    { field: 'building_id', dataType: 'VARCHAR', description: '楼栋标识，用于做楼栋能耗排行和分组分析。' },
    { field: 'building_type', dataType: 'VARCHAR', description: '楼栋类型，可区分办公、教学和实验等空间。' },
    { field: 'monitor_time', dataType: 'DATETIME', description: '监测时间，可拆成日期和小时做时序、热力和高峰分析。' },
    { field: 'electricity_kwh', dataType: 'DECIMAL', description: '当前监测时段总耗电量，是看板的核心分析指标。' },
    { field: 'hvac_kwh', dataType: 'DECIMAL', description: '暖通耗电量，可与总耗电一起分析系统占比。' },
    { field: 'water_m3', dataType: 'DECIMAL', description: '用水量，用于辅助判断高人流与配套系统负载。' },
    { field: 'chilled_water_supply_temp', dataType: 'DECIMAL', description: '冷冻水供水温度，用于观察空调侧供冷基线。' },
    { field: 'chilled_water_return_temp', dataType: 'DECIMAL', description: '冷冻水回水温度，可辅助判断末端换热压力。' },
    { field: 'env_temperature', dataType: 'DECIMAL', description: '环境温度，可与电耗做温度-负荷关系分析。' },
    { field: 'env_humidity', dataType: 'DECIMAL', description: '环境湿度，可辅助判断空调与除湿负荷变化。' },
    { field: 'occupancy_density', dataType: 'DECIMAL', description: '人流密度/人员活跃指数，用于分析人流与电耗关系。' },
    { field: 'device_id', dataType: 'VARCHAR', description: '设备编号，用于定位异常记录对应的采集终端。' },
    { field: 'device_status', dataType: 'VARCHAR', description: '设备状态，用于形成预警、维护和离线占比。' },
  ]

  return {
    buildingSummaries,
    composition,
    dailySeries,
    fieldGlossary,
    heatmap,
    hourlySeries,
    metrics,
    occupancyScatter,
    peakSnapshot: {
      buildingId: peakRecord.building_id,
      deviceId: peakRecord.device_id,
      electricity: peakRecord.electricity_kwh,
      humidity: peakRecord.env_humidity,
      monitorTime: peakRecord.monitor_time,
      occupancy: peakRecord.occupancy_density,
      temperature: peakRecord.env_temperature,
    },
    performanceScore,
    recentRecords: records.slice(0, 14),
    relationshipInsights,
    statusDistribution,
  }
}
