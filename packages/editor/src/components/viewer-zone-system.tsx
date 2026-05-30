'use client'

import { sceneRegistry, useScene, type ZoneNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'
import useEditor from '../store/use-editor'

function hasEnergyZoneOverlay() {
  if (typeof window === 'undefined') return false
  const snapshot = (window as unknown as Record<string, unknown>).__pascalEnergyZoneHighlights
  return !!snapshot && typeof snapshot === 'object'
}

export const ViewerZoneSystem = () => {
  useFrame(() => {
    const { levelId, zoneId } = useViewer.getState().selection
    const structureLayer = useEditor.getState().structureLayer
    const nodes = useScene.getState().nodes
    const readOnly = useScene.getState().readOnly
    const energyOverlayActive = hasEnergyZoneOverlay()

    sceneRegistry.byType.zone.forEach((id) => {
      const obj = sceneRegistry.nodes.get(id)
      if (!obj) return

      const zone = nodes[id as ZoneNode['id']] as ZoneNode | undefined
      if (!zone) return

      const isOnSelectedLevel = zone.parentId === levelId
      const isSelected = id === zoneId
      const shouldShowGeometry = readOnly
        ? energyOverlayActive
          ? false
          : !!levelId && isOnSelectedLevel
        : (structureLayer === 'zones' && !!levelId && isOnSelectedLevel) || isSelected

      if (!energyOverlayActive) {
        if (!obj.visible) obj.visible = true
        obj.traverse((child) => {
          if ((child as Mesh).isMesh) {
            child.visible = shouldShowGeometry
          }
        })
      }

      const showLabel = readOnly
        ? energyOverlayActive
          ? false
          : !!levelId && isOnSelectedLevel
        : zoneId === id && !!levelId && isOnSelectedLevel
      const targetOpacity = showLabel ? '1' : '0'
      const labelEl = document.getElementById(`${id}-label`)
      if (!energyOverlayActive && labelEl && labelEl.style.opacity !== targetOpacity) {
        labelEl.style.opacity = targetOpacity
      }
    })
  })

  return null
}
