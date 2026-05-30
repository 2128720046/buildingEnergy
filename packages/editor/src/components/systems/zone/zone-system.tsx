import { sceneRegistry, useScene, type ZoneNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Color, type Group, MathUtils, type Mesh } from 'three'
import type { MeshBasicNodeMaterial } from 'three/webgpu'
import useEditor from '../../../store/use-editor'

// Disable raycasting on zone geometry so clicks pass through to items underneath.
// Zone selection in the editor is handled exclusively via the HTML label overlay.
const noopRaycast = () => {}
const energyColor = new Color('#FF3333')
const restoreColor = new Color()

interface EnergyOverlayInfoSnapshot {
  currentKwh: number
  deltaKwh: number
  deltaPct: number
  isAnomaly: boolean
  normalizedEnergy: number
}

interface ZoneLabelCache {
  badge: HTMLElement | null
  lastBadgeBorderColor: string
  lastBadgeColor: string
  lastBadgeOpacity: string
  lastBadgeText: string
  lastBadgeTransform: string
  lastNameOpacity: string
  lastNameShadow: string
  lastPinOpacity: string
  lastRootOpacity: string
  name: HTMLElement | null
  pin: HTMLElement | null
  root: HTMLElement
}

function getEnergyHighlightSnapshot():
  | {
      highlightedZones: Map<string, number>
      overlayInfo?: Map<
        string,
        EnergyOverlayInfoSnapshot
      >
      revision: number
    }
  | null {
  if (typeof window === 'undefined') return null
  const value = (window as unknown as Record<string, unknown>).__pascalEnergyZoneHighlights
  if (!value || typeof value !== 'object') return null
  const snapshot = value as {
    highlightedZones?: Map<string, number>
    overlayInfo?: Map<
      string,
      EnergyOverlayInfoSnapshot
    >
    revision?: number
  }
  if (!(snapshot.highlightedZones instanceof Map)) return null
  return {
    highlightedZones: snapshot.highlightedZones,
    overlayInfo: snapshot.overlayInfo,
    revision: snapshot.revision ?? 0,
  }
}

function applyMaterialColor(material: MeshBasicNodeMaterial, color: Color) {
  const colorUniform = material.userData.uColor as { value?: Color } | undefined
  colorUniform?.value?.copy(color)
}

function updateZoneMaterial(
  material: MeshBasicNodeMaterial,
  isEnergyHighlighted: boolean,
  baseColor: string,
  targetOpacity: number,
  lerpSpeed: number,
) {
  if (!material?.userData?.uOpacity) return

  if (isEnergyHighlighted) {
    applyMaterialColor(material, energyColor)
    material.userData.__energyHighlightApplied = true
    material.userData.uOpacity.value = Math.max(material.userData.uOpacity.value, 0.92)
  } else if (material.userData.__energyHighlightApplied) {
    restoreColor.set(baseColor)
    applyMaterialColor(material, restoreColor)
    material.userData.__energyHighlightApplied = false
  }

  material.userData.uOpacity.value = MathUtils.lerp(
    material.userData.uOpacity.value,
    targetOpacity,
    lerpSpeed,
  )
}

function getZoneLabelCache(zoneId: string, cache: Map<string, ZoneLabelCache>) {
  const root = document.getElementById(`${zoneId}-label`)
  if (!root) {
    cache.delete(zoneId)
    return null
  }

  const existing = cache.get(zoneId)
  if (existing?.root === root) return existing

  const next: ZoneLabelCache = {
    badge: root.querySelector('.zone-energy-badge') as HTMLElement | null,
    lastBadgeBorderColor: '',
    lastBadgeColor: '',
    lastBadgeOpacity: '',
    lastBadgeText: '',
    lastBadgeTransform: '',
    lastNameOpacity: '',
    lastNameShadow: '',
    lastPinOpacity: '',
    lastRootOpacity: '',
    name: root.querySelector('.zone-name-label') as HTMLElement | null,
    pin: root.querySelector('.label-pin') as HTMLElement | null,
    root,
  }
  cache.set(zoneId, next)
  return next
}

function writeStyle(
  element: HTMLElement,
  property: keyof CSSStyleDeclaration,
  value: string,
  lastValue: string,
): string {
  if (lastValue !== value) {
    ;(element.style[property] as string) = value
    return value
  }
  return lastValue
}

export const ZoneSystem = () => {
  const labelCacheRef = useRef(new Map<string, ZoneLabelCache>())
  const lastLabelStateRef = useRef(new Map<string, string>())

  useFrame((_, delta) => {
    const structureLayer = useEditor.getState().structureLayer
    const editorMode = useEditor.getState().mode
    const selectedLevelId = useViewer.getState().selection.levelId
    const selectedZoneId = useViewer.getState().selection.zoneId
    const hoveredId = useViewer.getState().hoveredId

    const zoneGeometryVisible = structureLayer === 'zones'
    const zones = sceneRegistry.byType.zone || new Set()
    const nodes = useScene.getState().nodes
    const lerpSpeed = 10 * delta
    const energySnapshot = getEnergyHighlightSnapshot()
    const energyHighlighted = energySnapshot?.highlightedZones ?? null
    const energyOverlayInfo = energySnapshot?.overlayInfo ?? null

    zones.forEach((zoneId) => {
      const obj = sceneRegistry.nodes.get(zoneId)
      if (!obj) return

      const zone = nodes[zoneId as ZoneNode['id']] as ZoneNode | undefined

      const isOnSelectedLevel = zone?.parentId === selectedLevelId
      const isSelected = zoneId === selectedZoneId
      const isDeleteHovered = editorMode === 'delete' && hoveredId === zoneId
      const energyValue = energyHighlighted?.get(zoneId) ?? 0
      const isEnergyHighlighted = energyValue > 0
      const info = energyOverlayInfo?.get(zoneId)

      // Keep group visible (so <Html> labels stay active), hide/show meshes only.
      // Show meshes when: in zone mode, selected, or delete-hovered.
      if (!obj.visible) obj.visible = true
      const meshVisible =
        zoneGeometryVisible || isSelected || isDeleteHovered || isEnergyHighlighted
      const targetOpacity =
        isSelected || isDeleteHovered || isEnergyHighlighted
          ? 1
          : zoneGeometryVisible
            ? 1
            : 0
      const baseColor = zone?.color || '#3b82f6'

      const walls = (obj as Group).getObjectByName('walls') as Mesh | undefined
      if (walls) {
        updateZoneMaterial(
          walls.material as MeshBasicNodeMaterial,
          isEnergyHighlighted,
          baseColor,
          targetOpacity,
          lerpSpeed,
        )
        walls.visible = meshVisible
      }

      const floor = (obj as Group).getObjectByName('floor') as Mesh | undefined
      if (floor) {
        updateZoneMaterial(
          floor.material as MeshBasicNodeMaterial,
          isEnergyHighlighted,
          baseColor,
          targetOpacity,
          lerpSpeed,
        )
        floor.visible = meshVisible
      }

      // Disable raycasting once per zone object so geometry never intercepts clicks
      if (!obj.userData.__raycastDisabled) {
        obj.raycast = noopRaycast
        obj.traverse((child) => {
          child.raycast = noopRaycast
        })
        obj.userData.__raycastDisabled = true
      }

      const showName = !!selectedLevelId && isOnSelectedLevel && isEnergyHighlighted
      const showBadge = !!info && !!selectedLevelId && isOnSelectedLevel
      const labelStateKey = [
        energySnapshot?.revision ?? -1,
        showName ? 1 : 0,
        showBadge ? 1 : 0,
        isEnergyHighlighted ? 1 : 0,
        info?.currentKwh ?? '',
        info?.deltaKwh ?? '',
        info?.deltaPct ?? '',
        info?.isAnomaly ? 1 : 0,
      ].join('|')

      if (lastLabelStateRef.current.get(zoneId) !== labelStateKey) {
        const label = getZoneLabelCache(zoneId, labelCacheRef.current)
        if (label) {
          label.lastRootOpacity = writeStyle(
            label.root,
            'opacity',
            showName || showBadge ? '1' : '0',
            label.lastRootOpacity,
          )

          if (label.name) {
            label.lastNameOpacity = writeStyle(
              label.name,
              'opacity',
              showName ? '1' : '0',
              label.lastNameOpacity,
            )
            label.lastNameShadow = writeStyle(
              label.name,
              'textShadow',
              isEnergyHighlighted
                ? '-1px -1px 0 #FF3333, 1px -1px 0 #FF3333, -1px 1px 0 #FF3333, 1px 1px 0 #FF3333, 0 0 10px rgba(255,51,51,0.55)'
                : '-1px -1px 0 #3b82f6, 1px -1px 0 #3b82f6, -1px 1px 0 #3b82f6, 1px 1px 0 #3b82f6',
              label.lastNameShadow,
            )
          }
          if (label.pin) {
            label.lastPinOpacity = writeStyle(
              label.pin,
              'opacity',
              showName ? '1' : '0',
              label.lastPinOpacity,
            )
          }

          const badge = label.badge
          if (badge && info && showBadge) {
            const sign = info.deltaKwh > 0 ? '+' : ''
            const deltaTone =
              info.deltaKwh > 0 ? '#fbfb04' : info.deltaKwh < 0 ? '#66f2c2' : '#7dd3fc'
            const text = `${info.currentKwh.toFixed(1)} kWh ${sign}${info.deltaKwh.toFixed(1)} (${sign}${info.deltaPct.toFixed(1)}%)`
            if (badge.textContent !== text) {
              badge.textContent = text
            }
            label.lastBadgeText = text
            label.lastBadgeOpacity = writeStyle(badge, 'opacity', '1', label.lastBadgeOpacity)
            label.lastBadgeTransform = writeStyle(
              badge,
              'transform',
              'translateY(-3px)',
              label.lastBadgeTransform,
            )
            label.lastBadgeBorderColor = writeStyle(
              badge,
              'borderColor',
              'transparent',
              label.lastBadgeBorderColor,
            )
            label.lastBadgeColor = writeStyle(badge, 'color', deltaTone, label.lastBadgeColor)
          } else if (badge) {
            label.lastBadgeOpacity = writeStyle(badge, 'opacity', '0', label.lastBadgeOpacity)
            label.lastBadgeTransform = writeStyle(
              badge,
              'transform',
              'translateY(-2px)',
              label.lastBadgeTransform,
            )
          }
        }
        lastLabelStateRef.current.set(zoneId, labelStateKey)
      }
    })
  })

  return null
}
