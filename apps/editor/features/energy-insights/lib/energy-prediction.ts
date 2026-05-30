'use client'

import type { AnyNode } from '@pascal-app/core'
import { buildFloorHourlyAggregate } from './floor-heatmap'

export interface PredictionPoint {
  hour: number
  predicted: number
  upper: number
  lower: number
}

export interface EditImpact {
  adjusted: PredictionPoint[]
  hasEdits: boolean
  summary: string
}

/** 根据 item 名称/分类估算单位能耗 (kWh/h) */
function estimateItemKw(name: string): number {
  const n = name.toLowerCase()
  if (/(air[- ]?condition|hvac|ac\b|heater|fan|thermostat|vent|chiller|压缩机)/.test(n)) return 1.5
  if (/(lamp|light|ceiling\s*light|wall\s*sconce|chandelier)/.test(n)) return 0.06
  if (/(computer|pc\b|laptop|monitor|screen|tv\b|display|投影)/.test(n)) return 0.15
  if (/(fridge|refrigerator|freezer|oven|microwave|stove|dishwasher)/.test(n)) return 0.08
  if (/(charger|phone|keypad|router|modem|switch|socket)/.test(n)) return 0.02
  if (/(coffee|kettle|humidifier|dehumidifier|purifier)/.test(n)) return 0.12
  if (/(printer|scanner|projector)/.test(n)) return 0.18
  return 0.05
}

/** 计算编辑前后 item 能耗差异 */
function computeItemDelta(
  currentNodes: Record<string, AnyNode>,
  snapshot: Record<string, AnyNode> | null | undefined,
): number {
  if (!snapshot) return 0
  const currentItems = Object.values(currentNodes).filter((n) => n.type === 'item')
  const snapshotItems = Object.values(snapshot).filter((n) => n.type === 'item')

  const snapshotMap = new Map(snapshotItems.map((n) => [n.id, n]))
  const currentMap = new Map(currentItems.map((n) => [n.id, n]))

  let totalDelta = 0

  // 新增的 item
  for (const item of currentItems) {
    if (!snapshotMap.has(item.id)) {
      totalDelta += estimateItemKw(item.name || '')
    }
  }
  // 删除的 item
  for (const item of snapshotItems) {
    if (!currentMap.has(item.id)) {
      totalDelta -= estimateItemKw(item.name || '')
    }
  }

  return totalDelta
}

export function buildPrediction(
  nodes: Record<string, AnyNode>,
  levelId: string | '',
  zoneId: string | '',
  todayStr: string,
  preEditSnapshot?: Record<string, AnyNode> | null,
): { labels: string[]; actual: number[]; predicted: PredictionPoint[]; editImpact: EditImpact } {
  const hourly = levelId ? buildFloorHourlyAggregate(nodes, levelId, todayStr) : null

  let actual: number[]
  let predicted: PredictionPoint[]

  if (hourly && hourly.length >= 24) {
    actual = hourly.map((h) => Number(h.electricity_kwh.toFixed(2)))
    const total = actual.reduce((s, v) => s + v, 0)
    const avg = total / 24
    const key = `${levelId}-${zoneId || 'floor'}-${todayStr}`
    let seed = 0
    for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) % 997

    predicted = []
    for (let h = 0; h < 24; h++) {
      const base = actual[h] ?? avg
      const drift = ((seed + h * 7) % 51) / 100 - 0.25
      const predVal = Math.max(0.5, base * (1 + drift))
      const spread = base * 0.12 + avg * 0.05
      predicted.push({
        hour: h,
        predicted: Number(predVal.toFixed(2)),
        upper: Number((predVal + spread).toFixed(2)),
        lower: Number(Math.max(0.1, predVal - spread).toFixed(2)),
      })
    }
  } else {
    actual = Array.from({ length: 24 }, () => 0)
    predicted = []
    const key = `${levelId}-${zoneId || 'floor'}`
    let seed = 0
    for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) % 997
    for (let h = 0; h < 24; h++) {
      const wave = Math.sin(((h - 9) / 12) * Math.PI) * 0.5 + 0.5
      const predVal = Math.max(2, 60 + wave * 80 + ((seed * (h + 3)) % 40))
      predicted.push({ hour: h, predicted: Number(predVal.toFixed(2)), upper: predVal + 10, lower: Math.max(0.5, predVal - 10) })
    }
  }

  // 编辑影响
  const delta = computeItemDelta(nodes, preEditSnapshot)
  const hasEdits = preEditSnapshot !== null && Math.abs(delta) > 0.001

  let summary = ''
  if (hasEdits) {
    summary = delta > 0 ? `编辑后预计 +${delta.toFixed(2)} kWh/h` : `编辑后预计 ${delta.toFixed(2)} kWh/h`
  }

  const adjusted: PredictionPoint[] = predicted.map((p) => ({
    ...p,
    predicted: Number(Math.max(0.1, p.predicted + delta).toFixed(2)),
  }))

  return {
    labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
    actual,
    predicted,
    editImpact: { adjusted, hasEdits, summary },
  }
}
