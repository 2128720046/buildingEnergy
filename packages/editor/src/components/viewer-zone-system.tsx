'use client'

import { sceneRegistry, useScene, type ZoneNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'
import useEditor from '../store/use-editor'

export const ViewerZoneSystem = () => {
  useFrame(() => {
    const { levelId, zoneId } = useViewer.getState().selection
    const structureLayer = useEditor.getState().structureLayer
    const nodes = useScene.getState().nodes
    const readOnly = useScene.getState().readOnly

    sceneRegistry.byType.zone.forEach((id) => {
      const obj = sceneRegistry.nodes.get(id)
      if (!obj) return

      const zone = nodes[id as ZoneNode['id']] as ZoneNode | undefined
      if (!zone) return

      const isOnSelectedLevel = zone.parentId === levelId
      const isSelected = id === zoneId

      // 只读模式（能耗查询等）：显示当前楼层的所有 zone
      // 编辑模式：仅在 zone 图层 + 选中楼层 或 选中特定 zone 时显示
      const shouldShowGeometry = readOnly
        ? (!!levelId && isOnSelectedLevel)
        : ((structureLayer === 'zones' && !!levelId && isOnSelectedLevel) || isSelected)

      if (!obj.visible) obj.visible = true
      obj.traverse((child) => {
        if ((child as Mesh).isMesh) {
          child.visible = shouldShowGeometry
        }
      })

      // 只读模式：显示所有 zone 标签
      // 编辑模式：仅显示选中 zone 的标签
      const showLabel = readOnly
        ? (!!levelId && isOnSelectedLevel)
        : (zoneId === id && !!levelId && isOnSelectedLevel)
      const targetOpacity = showLabel ? '1' : '0'
      const labelEl = document.getElementById(`${id}-label`)
      if (labelEl && labelEl.style.opacity !== targetOpacity) {
        labelEl.style.opacity = targetOpacity
      }
    })
  })

  return null
}
