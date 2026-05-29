'use client'

import { sceneRegistry, useScene, type ZoneNode } from '@pascal-app/core'

const HIGH_COLOR = '#FF3333'
const DEFAULT_COLOR = '#0066aa'
const HIGHLIGHT_THRESHOLD = 0.7

let appliedHighlighted: Set<string> = new Set()

function setsAreEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) if (!b.has(item)) return false
  return true
}

export function applyEnergyHighlights(
  zones: Array<{ zoneId: string; normalizedEnergy: number }>,
): void {
  const nowHigh = new Set<string>()
  for (const z of zones) {
    if (z.normalizedEnergy > HIGHLIGHT_THRESHOLD) nowHigh.add(z.zoneId)
  }
  if (setsAreEqual(nowHigh, appliedHighlighted)) return

  const nodesPatch: Record<string, any> = {}
  let hasUpdates = false

  for (const id of sceneRegistry.byType.zone) {
    const node = useScene.getState().nodes[id as ZoneNode['id']] as
      | (ZoneNode & { color?: string })
      | undefined
    if (!node) continue
    const isHigh = nowHigh.has(id)
    if (isHigh && node.color !== HIGH_COLOR) {
      nodesPatch[id] = { ...node, color: HIGH_COLOR }
      hasUpdates = true
    } else if (!isHigh && appliedHighlighted.has(id) && node.color !== DEFAULT_COLOR) {
      nodesPatch[id] = { ...node, color: DEFAULT_COLOR }
      hasUpdates = true
    }
  }

  appliedHighlighted = nowHigh
  if (!hasUpdates) return

  useScene.setState((prev) => ({
    nodes: { ...prev.nodes, ...nodesPatch },
  }))
}

export function resetAllEnergyHighlights(): void {
  if (appliedHighlighted.size === 0) return
  const nodesPatch: Record<string, any> = {}

  for (const id of sceneRegistry.byType.zone) {
    if (!appliedHighlighted.has(id)) continue
    const node = useScene.getState().nodes[id as ZoneNode['id']] as
      | (ZoneNode & { color?: string })
      | undefined
    if (node && node.color !== DEFAULT_COLOR) {
      nodesPatch[id] = { ...node, color: DEFAULT_COLOR }
    }
  }
  appliedHighlighted = new Set()
  if (Object.keys(nodesPatch).length === 0) return

  useScene.setState((prev) => ({
    nodes: { ...prev.nodes, ...nodesPatch },
  }))
}
