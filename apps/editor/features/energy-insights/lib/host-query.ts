import type { AnyNode, LevelNode, ZoneNode } from '@pascal-app/core'
import { estimateZoneArea, classifyRoomType, buildDailySummary, type DailyEnergySummary } from './energy-mock-data'

export interface HostQueryFilters {
  keyword: string
  levelId: string
  zoneId: string
  timeRange: string
  energyLevel: string
}

export interface HostFilterOption {
  value: string
  label: string
}

export interface HostQueryResult {
  componentId: string
  componentName: string
  componentType: string
  componentTypeLabel: string
  levelId: string
  levelName: string
  zoneId: string
  zoneName: string
  energyLevel: '低' | '中' | '高'
  predictedUsage: number
  timeRangeLabel: string
}

export interface HostQueryModel {
  levelOptions: HostFilterOption[]
  zoneOptions: HostFilterOption[]
  results: HostQueryResult[]
}

const COMPONENT_LABELS: Record<string, string> = {
  wall: '墙体',
  item: '家具/设备',
  door: '门',
  window: '窗',
  slab: '楼板',
  ceiling: '吊顶',
  roof: '屋顶',
  zone: '房间',
}

const COMPONENT_TYPES = new Set(Object.keys(COMPONENT_LABELS))

const TIME_RANGE_LABELS: Record<string, string> = {
  '24h': '近 24 小时',
  '7d': '近 7 天',
  '30d': '近 30 天',
}

function resolveLevelId(nodes: Record<string, AnyNode>, node: AnyNode | undefined): string {
  let current = node
  while (current) {
    if (current.type === 'level') return current.id
    current = current.parentId ? nodes[current.parentId] : undefined
  }
  return ''
}

function getLevelLabel(level: LevelNode): string {
  return level.name || `楼层 ${level.level}`
}

function getZoneLabel(zone: ZoneNode): string {
  return zone.name || zone.id
}

function pickDemoZone(componentId: string, zones: ZoneNode[]): ZoneNode | null {
  if (zones.length === 0) return null
  let h = 0
  for (let i = 0; i < componentId.length; i++) h = (h * 31 + componentId.charCodeAt(i)) % 100000
  return zones[h % zones.length] ?? null
}

function isQueryResult(value: HostQueryResult | null): value is HostQueryResult {
  return value !== null
}

/**
 * 获取或构建 zone 的每日能耗汇总，带内存缓存
 */
const dailySummaryCache = new Map<string, DailyEnergySummary>()

function getZoneDailySummary(zone: ZoneNode): DailyEnergySummary {
  const cached = dailySummaryCache.get(zone.id)
  if (cached) return cached

  const area = zone.polygon && zone.polygon.length >= 3 ? estimateZoneArea(zone.polygon) : 30
  const roomType = classifyRoomType(zone.name || zone.id)
  const d = new Date()
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const summary = buildDailySummary(zone.id, roomType, area, date)
  dailySummaryCache.set(zone.id, summary)
  return summary
}

/**
 * 从场景节点和筛选条件构建查询模型。
 * 现在每个构件/房间的 predictedUsage 来自模拟能耗引擎的每日汇总，
 * energyLevel 按百分位动态分类（top 25% → 高, mid 50% → 中, bottom 25% → 低）。
 */
export function buildHostQueryModel(
  nodes: Record<string, AnyNode>,
  filters: HostQueryFilters,
): HostQueryModel {
  const levels = Object.values(nodes)
    .filter((node): node is LevelNode => node.type === 'level')
    .sort((left, right) => left.level - right.level)

  const zones = Object.values(nodes).filter((node): node is ZoneNode => node.type === 'zone')

  const levelOptions = levels.map((level) => ({
    value: level.id,
    label: getLevelLabel(level),
  }))

  const zoneOptions = zones
    .filter((zone) => !filters.levelId || resolveLevelId(nodes, zone) === filters.levelId)
    .map((zone) => ({
      value: zone.id,
      label: getZoneLabel(zone),
    }))

  const zonesByLevel = new Map<string, ZoneNode[]>()
  for (const zone of zones) {
    const levelId = resolveLevelId(nodes, zone)
    if (!levelId) continue
    const current = zonesByLevel.get(levelId) ?? []
    current.push(zone)
    zonesByLevel.set(levelId, current)
  }

  // 预构建 zone 能耗映射
  const zoneEnergyMap = new Map<string, number>()
  for (const zone of zones) {
    const summary = getZoneDailySummary(zone)
    zoneEnergyMap.set(zone.id, summary.total_electricity_kwh)
  }

  const multiplier = filters.timeRange === '30d' ? 28 : filters.timeRange === '7d' ? 7 : 1
  const timeRangeLabel = TIME_RANGE_LABELS[filters.timeRange] ?? TIME_RANGE_LABELS['24h']!

  const unsorted = Object.values(nodes)
    .filter((node) => COMPONENT_TYPES.has(node.type))
    .map((node) => {
      const levelId = resolveLevelId(nodes, node)
      if (!levelId) return null

      const level = nodes[levelId]
      if (!(level && level.type === 'level')) return null

      const availableZones = zonesByLevel.get(levelId) ?? []
      const matchedZone = node.type === 'zone' ? (node as ZoneNode) : pickDemoZone(node.id, availableZones)

      let predictedUsage: number

      if (node.type === 'zone') {
        // zone 类型直接使用模拟引擎的每日总能耗
        predictedUsage = zoneEnergyMap.get(node.id) ?? 0
      } else if (matchedZone) {
        // 非 zone 构件：分配到 zone 的能耗加权份额（含确定性抖动）
        const zoneTotal = zoneEnergyMap.get(matchedZone.id) ?? 0
        let h = 0
        for (let i = 0; i < node.id.length; i++) h = (h * 31 + node.id.charCodeAt(i)) % 100000
        const share = 0.08 + (h % 40) / 100 // 8% ~ 48% of zone total
        predictedUsage = Number((zoneTotal * share).toFixed(1))
      } else {
        predictedUsage = 0
      }

      const result: HostQueryResult = {
        componentId: node.id,
        componentName: node.name || node.id,
        componentType: node.type,
        componentTypeLabel: COMPONENT_LABELS[node.type] ?? node.type,
        levelId,
        levelName: getLevelLabel(level),
        zoneId: matchedZone?.id ?? '',
        zoneName: matchedZone ? getZoneLabel(matchedZone) : '未分配房间',
        energyLevel: '低', // 下面按百分位统一赋值
        predictedUsage: Number((predictedUsage * multiplier).toFixed(1)),
        timeRangeLabel,
      }

      return result
    })
    .filter(isQueryResult)
    .filter((item) => {
      if (filters.levelId && item.levelId !== filters.levelId) return false
      if (filters.zoneId && item.zoneId !== filters.zoneId) return false

      const keyword = filters.keyword.trim().toLowerCase()
      if (!keyword) return true
      return [item.componentName, item.componentTypeLabel, item.zoneName, item.levelName]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })

  // 排序：高能耗在前
  const sorted = [...unsorted].sort((a, b) => b.predictedUsage - a.predictedUsage)

  // 按百分位赋值 energyLevel
  const total = sorted.length
  if (total > 0) {
    const topIdx = Math.max(1, Math.floor(total * 0.25))
    const midIdx = Math.max(1, Math.floor(total * 0.75))

    for (let i = 0; i < total; i++) {
      if (i < topIdx) {
        sorted[i]!.energyLevel = '高'
      } else if (i < midIdx) {
        sorted[i]!.energyLevel = '中'
      } else {
        sorted[i]!.energyLevel = '低'
      }
    }
  }

  // 按 energyLevel 过滤（必须在排序后执行，否则过滤高/中/低时数据未赋值）
  const filtered = filters.energyLevel
    ? sorted.filter((item) => item.energyLevel === filters.energyLevel)
    : sorted

  return {
    levelOptions,
    zoneOptions,
    results: filtered,
  }
}
