import type { AnyNode, LevelNode, ZoneNode } from '@pascal-app/core'

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

function hashString(input: string): number {
  let value = 0
  for (let index = 0; index < input.length; index += 1) {
    value = (value * 31 + input.charCodeAt(index)) % 100000
  }
  return value
}

function resolveLevelId(nodes: Record<string, AnyNode>, node: AnyNode | undefined): string {
  let current = node
  while (current) {
    if (current.type === 'level') {
      return current.id
    }
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
  return zones[hashString(componentId) % zones.length] ?? null
}

function isQueryResult(value: HostQueryResult | null): value is HostQueryResult {
  return value !== null
}

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

  const results = Object.values(nodes)
    .filter((node) => COMPONENT_TYPES.has(node.type))
    .map((node) => {
      const levelId = resolveLevelId(nodes, node)
      if (!levelId) return null

      const level = nodes[levelId]
      if (!(level && level.type === 'level')) return null

      const availableZones = zonesByLevel.get(levelId) ?? []
      const matchedZone = node.type === 'zone' ? (node as ZoneNode) : pickDemoZone(node.id, availableZones)

      const seed = hashString(node.id)
      const energyLevel: '低' | '中' | '高' = seed % 3 === 0 ? '高' : seed % 3 === 1 ? '中' : '低'
      const timeRangeLabel = TIME_RANGE_LABELS[filters.timeRange] ?? TIME_RANGE_LABELS['24h']!
      const multiplier = filters.timeRange === '30d' ? 2.8 : filters.timeRange === '7d' ? 1.7 : 1

      const result: HostQueryResult = {
        componentId: node.id,
        componentName: node.name || node.id,
        componentType: node.type,
        componentTypeLabel: COMPONENT_LABELS[node.type] ?? node.type,
        levelId,
        levelName: getLevelLabel(level),
        zoneId: matchedZone?.id ?? '',
        zoneName: matchedZone ? getZoneLabel(matchedZone) : '未分配房间',
        energyLevel,
        predictedUsage: Number((((seed % 90) + 10) * multiplier).toFixed(1)),
        timeRangeLabel,
      }

      return result
    })
    .filter(isQueryResult)
    .filter((item) => {
      if (filters.levelId && item.levelId !== filters.levelId) return false
      if (filters.zoneId && item.zoneId !== filters.zoneId) return false
      if (filters.energyLevel && item.energyLevel !== filters.energyLevel) return false

      const keyword = filters.keyword.trim().toLowerCase()
      if (!keyword) return true

      return [item.componentName, item.componentTypeLabel, item.zoneName, item.levelName]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
    .sort((left, right) => right.predictedUsage - left.predictedUsage)

  return {
    levelOptions,
    zoneOptions,
    results,
  }
}