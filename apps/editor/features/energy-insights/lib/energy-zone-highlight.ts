'use client'

const HIGHLIGHT_THRESHOLD = 0.7

export const ENERGY_ZONE_HIGHLIGHT_COLOR = '#FF3333'
export const ENERGY_ZONE_HIGHLIGHT_EVENT = 'energy-zone-highlights-change'

export interface EnergyZoneOverlayInfo {
  currentKwh: number
  deltaKwh: number
  deltaPct: number
  isAnomaly: boolean
  normalizedEnergy: number
}

let highlightedZones = new Map<string, number>()
let overlayInfo = new Map<string, EnergyZoneOverlayInfo>()
let revision = 0

function publishHighlightSnapshot() {
  if (typeof window === 'undefined') return
  ;(window as unknown as Record<string, unknown>).__pascalEnergyZoneHighlights = {
    highlightedZones,
    overlayInfo,
    revision,
  }
}

function mapsAreEqual(left: Map<string, number>, right: Map<string, number>): boolean {
  if (left.size !== right.size) return false
  for (const [zoneId, value] of left) {
    if (right.get(zoneId) !== value) return false
  }
  return true
}

function overlayMapsAreEqual(
  left: Map<string, EnergyZoneOverlayInfo>,
  right: Map<string, EnergyZoneOverlayInfo>,
): boolean {
  if (left.size !== right.size) return false
  for (const [zoneId, value] of left) {
    const other = right.get(zoneId)
    if (!other) return false
    if (
      other.currentKwh !== value.currentKwh ||
      other.deltaKwh !== value.deltaKwh ||
      other.deltaPct !== value.deltaPct ||
      other.isAnomaly !== value.isAnomaly ||
      other.normalizedEnergy !== value.normalizedEnergy
    ) {
      return false
    }
  }
  return true
}

function emitHighlightChange() {
  revision += 1
  publishHighlightSnapshot()
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ENERGY_ZONE_HIGHLIGHT_EVENT, { detail: { revision } }))
}

export function applyEnergyHighlights(
  zones: Array<{
    currentKwh?: number
    deltaKwh?: number
    deltaPct?: number
    normalizedEnergy: number
    zoneId: string
  }>,
): void {
  const next = new Map<string, number>()
  const nextOverlay = new Map<string, EnergyZoneOverlayInfo>()
  for (const zone of zones) {
    const isAnomaly = zone.normalizedEnergy > HIGHLIGHT_THRESHOLD
    if (zone.normalizedEnergy > HIGHLIGHT_THRESHOLD) {
      next.set(zone.zoneId, zone.normalizedEnergy)
    }
    if (
      typeof zone.currentKwh === 'number' &&
      typeof zone.deltaKwh === 'number' &&
      typeof zone.deltaPct === 'number'
    ) {
      nextOverlay.set(zone.zoneId, {
        currentKwh: zone.currentKwh,
        deltaKwh: zone.deltaKwh,
        deltaPct: zone.deltaPct,
        isAnomaly,
        normalizedEnergy: zone.normalizedEnergy,
      })
    }
  }

  if (mapsAreEqual(next, highlightedZones) && overlayMapsAreEqual(nextOverlay, overlayInfo)) {
    return
  }
  highlightedZones = next
  overlayInfo = nextOverlay
  emitHighlightChange()
}

export function forceEnergyHighlights(zoneIds: string[]): void {
  const next = new Map<string, number>()
  const nextOverlay = new Map(overlayInfo)
  for (const zoneId of zoneIds) {
    next.set(zoneId, 1)
    const existing = nextOverlay.get(zoneId)
    if (existing) {
      nextOverlay.set(zoneId, { ...existing, isAnomaly: true, normalizedEnergy: 1 })
    }
  }
  if (mapsAreEqual(next, highlightedZones)) return
  highlightedZones = next
  overlayInfo = nextOverlay
  emitHighlightChange()
}

export function resetAllEnergyHighlights(): void {
  if (highlightedZones.size === 0 && overlayInfo.size === 0) return
  highlightedZones = new Map()
  overlayInfo = new Map()
  emitHighlightChange()
}

export function getEnergyHighlightSnapshot(): {
  highlightedZones: Map<string, number>
  overlayInfo: Map<string, EnergyZoneOverlayInfo>
  revision: number
} {
  return {
    highlightedZones,
    overlayInfo,
    revision,
  }
}
