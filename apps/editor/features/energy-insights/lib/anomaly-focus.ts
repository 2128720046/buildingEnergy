import type { AnyNode, LevelNode, ZoneNode } from '@pascal-app/core'
import type { FloorHeatmapData, FloorHeatmapOptions, ZoneHeatmapEntry } from './floor-heatmap'
import { buildFloorHeatmapData } from './floor-heatmap'
import type { HostFilterOption, HostQueryResult } from './host-query'

export const ANOMALY_ZONE_THRESHOLD = 0.7

export interface EnergyAnomalyZone {
  energyKwh: number
  normalizedEnergy: number
  zoneId: string
  zoneName: string
}

export interface EnergyAnomalyFocus {
  floorName: string
  levelId: string
  severity: 'high' | 'medium'
  threshold: number
  topZone: EnergyAnomalyZone
  zones: EnergyAnomalyZone[]
}

export interface EnergyAssistantAction {
  focus?: EnergyAnomalyFocus | null
  type: 'focus_anomaly_zones'
}

function zoneToAnomaly(entry: ZoneHeatmapEntry): EnergyAnomalyZone {
  return {
    energyKwh: entry.totalEnergy,
    normalizedEnergy: entry.normalizedEnergy,
    zoneId: entry.zoneId,
    zoneName: entry.zoneName,
  }
}

export function buildAnomalyFocusFromHeatmap(
  heatmap: FloorHeatmapData | null,
): EnergyAnomalyFocus | null {
  if (!heatmap) return null

  const zones = heatmap.zones
    .filter((zone) => zone.normalizedEnergy > ANOMALY_ZONE_THRESHOLD)
    .sort((left, right) => right.normalizedEnergy - left.normalizedEnergy)
    .map(zoneToAnomaly)

  const topZone = zones[0]
  if (!topZone) return null

  return {
    floorName: heatmap.floorName,
    levelId: heatmap.levelId,
    severity: topZone.normalizedEnergy >= 0.9 ? 'high' : 'medium',
    threshold: ANOMALY_ZONE_THRESHOLD,
    topZone,
    zones,
  }
}

export function buildBestAnomalyFocus(
  nodes: Record<string, AnyNode>,
  levelOptions: HostFilterOption[],
  queryResults: HostQueryResult[],
  options?: FloorHeatmapOptions,
): EnergyAnomalyFocus | null {
  const candidates = levelOptions
    .map((level) =>
      buildAnomalyFocusFromHeatmap(
        buildFloorHeatmapData(nodes, level.value, queryResults, options),
      ),
    )
    .filter((focus): focus is EnergyAnomalyFocus => focus !== null)
    .sort((left, right) => {
      const byTopZone = right.topZone.normalizedEnergy - left.topZone.normalizedEnergy
      if (Math.abs(byTopZone) > 0.001) return byTopZone
      return right.zones.length - left.zones.length
    })

  return candidates[0] ?? null
}

export function validateAnomalyFocus(
  focus: EnergyAnomalyFocus | null | undefined,
  nodes: Record<string, AnyNode>,
): EnergyAnomalyFocus | null {
  if (!focus) return null

  const level = nodes[focus.levelId]
  if (!level || level.type !== 'level') return null

  const zones = focus.zones.filter((zone) => {
    const node = nodes[zone.zoneId]
    return node?.type === 'zone' && node.parentId === focus.levelId
  })
  const topZone = zones[0]
  if (!topZone) return null

  return {
    ...focus,
    floorName: (level as LevelNode).name || focus.floorName,
    topZone,
    zones,
  }
}

export function formatAnomalyFocusForAssistant(focus: EnergyAnomalyFocus | null): string {
  if (!focus) {
    return '当前能耗查询页面没有检测到超过标红阈值的异常 zone，前端不会执行跳转。'
  }

  const zoneSummary = focus.zones
    .slice(0, 5)
    .map(
      (zone, index) =>
        `${index + 1}. ${zone.zoneName} (${zone.zoneId})，归一化能耗 ${zone.normalizedEnergy.toFixed(2)}，当前能耗 ${zone.energyKwh.toFixed(2)} kWh`,
    )
    .join('\n')

  return [
    `当前可跳转异常楼层：${focus.floorName} (${focus.levelId})`,
    `标红阈值：归一化能耗 > ${focus.threshold}`,
    `异常 zone 数量：${focus.zones.length}`,
    `首个聚焦 zone：${focus.topZone.zoneName} (${focus.topZone.zoneId})`,
    `异常 zone 明细：\n${zoneSummary}`,
    '重要约束：回答只能引用上述楼层和 zone，不要编造其他异常位置。',
  ].join('\n')
}

export function isAnomalyFocusPrompt(prompt: string): boolean {
  const compact = prompt.replace(/\s+/g, '').toLowerCase()
  return (
    (compact.includes('异常') &&
      (compact.includes('楼层') ||
        compact.includes('位置') ||
        compact.includes('区域') ||
        compact.includes('zone') ||
        compact.includes('标红') ||
        compact.includes('跳转') ||
        compact.includes('定位') ||
        compact.includes('查询'))) ||
    compact.includes('异常zone') ||
    compact.includes('标红区域') ||
    compact.includes('哪里异常') ||
    compact.includes('哪层楼有问题') ||
    compact.includes('那层楼有问题')
  )
}

export function resolveLevelName(nodes: Record<string, AnyNode>, levelId: string): string {
  const node = nodes[levelId]
  return node?.type === 'level' ? (node as LevelNode).name || node.id : levelId
}

export function resolveZoneNames(nodes: Record<string, AnyNode>, zoneIds: string[]): string[] {
  return zoneIds.map((zoneId) => {
    const node = nodes[zoneId]
    return node?.type === 'zone' ? (node as ZoneNode).name || node.id : zoneId
  })
}
