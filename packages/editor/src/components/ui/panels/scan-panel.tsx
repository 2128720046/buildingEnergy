'use client'

import { type AnyNode, type ScanNode, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Trash2 } from 'lucide-react'
import { useCallback } from 'react'
import { ActionButton, ActionGroup } from '../controls/action-button'
import { PanelSection } from '../controls/panel-section'
import { SliderControl } from '../controls/slider-control'
import { PanelWrapper } from './panel-wrapper'

export function ScanPanel() {
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const setSelection = useViewer((s) => s.setSelection)
  const nodes = useScene((s) => s.nodes)
  const updateNode = useScene((s) => s.updateNode)
  const deleteNode = useScene((s) => s.deleteNode)

  const selectedId = selectedIds[0]
  const node = selectedId ? (nodes[selectedId as AnyNode['id']] as ScanNode | undefined) : undefined

  const handleUpdate = useCallback(
    (updates: Partial<ScanNode>) => {
      if (!(selectedId && node)) return
      updateNode(selectedId as AnyNode['id'], updates)
    },
    [selectedId, node, updateNode],
  )

  const handleClose = useCallback(() => {
    setSelection({ selectedIds: [] })
  }, [setSelection])

  const handleDelete = useCallback(() => {
    if (!selectedId) return
    deleteNode(selectedId as AnyNode['id'])
    setSelection({ selectedIds: [] })
  }, [selectedId, deleteNode, setSelection])

  if (!node || node.type !== 'scan' || selectedIds.length !== 1) return null

  return (
    <PanelWrapper
      onClose={handleClose}
      title={node.name || 'Scan'}
      width={300}
    >
      <div className="px-3 pb-1 text-[10px] text-muted-foreground/60">
        选中后可在 3D 视口中直接拖拽移动
      </div>
      <PanelSection title="Position">
        <SliderControl
          label={<>X<sub className="ml-[1px] text-[11px] opacity-70">pos</sub></>}
          max={node.position[0] + 2}
          min={node.position[0] - 2}
          onChange={(value) => handleUpdate({ position: [value, node.position[1], node.position[2]] })}
          precision={2}
          step={0.01}
          unit="m"
          value={Math.round(node.position[0] * 100) / 100}
        />
        <SliderControl
          label={<>Y<sub className="ml-[1px] text-[11px] opacity-70">pos</sub></>}
          max={node.position[1] + 2}
          min={node.position[1] - 2}
          onChange={(value) => handleUpdate({ position: [node.position[0], value, node.position[2]] })}
          precision={2}
          step={0.01}
          unit="m"
          value={Math.round(node.position[1] * 100) / 100}
        />
        <SliderControl
          label={<>Z<sub className="ml-[1px] text-[11px] opacity-70">pos</sub></>}
          max={node.position[2] + 2}
          min={node.position[2] - 2}
          onChange={(value) => handleUpdate({ position: [node.position[0], node.position[1], value] })}
          precision={2}
          step={0.01}
          unit="m"
          value={Math.round(node.position[2] * 100) / 100}
        />
      </PanelSection>

      <PanelSection title="Rotation">
        <SliderControl
          label={<>X<sub className="ml-[1px] text-[11px] opacity-70">rot</sub></>}
          max={Math.round((node.rotation[0] * 180) / Math.PI) + 45}
          min={Math.round((node.rotation[0] * 180) / Math.PI) - 45}
          onChange={(degrees) => {
            const radians = (degrees * Math.PI) / 180
            handleUpdate({ rotation: [radians, node.rotation[1], node.rotation[2]] })
          }}
          precision={0}
          step={1}
          unit="°"
          value={Math.round((node.rotation[0] * 180) / Math.PI)}
        />
        <SliderControl
          label={<>Y<sub className="ml-[1px] text-[11px] opacity-70">rot</sub></>}
          max={Math.round((node.rotation[1] * 180) / Math.PI) + 45}
          min={Math.round((node.rotation[1] * 180) / Math.PI) - 45}
          onChange={(degrees) => {
            const radians = (degrees * Math.PI) / 180
            handleUpdate({ rotation: [node.rotation[0], radians, node.rotation[2]] })
          }}
          precision={0}
          step={1}
          unit="°"
          value={Math.round((node.rotation[1] * 180) / Math.PI)}
        />
        <SliderControl
          label={<>Z<sub className="ml-[1px] text-[11px] opacity-70">rot</sub></>}
          max={Math.round((node.rotation[2] * 180) / Math.PI) + 45}
          min={Math.round((node.rotation[2] * 180) / Math.PI) - 45}
          onChange={(degrees) => {
            const radians = (degrees * Math.PI) / 180
            handleUpdate({ rotation: [node.rotation[0], node.rotation[1], radians] })
          }}
          precision={0}
          step={1}
          unit="°"
          value={Math.round((node.rotation[2] * 180) / Math.PI)}
        />
      </PanelSection>

      <PanelSection title="Scale">
        <SliderControl
          label={<>Scale</>}
          max={10}
          min={0.01}
          onChange={(value) => handleUpdate({ scale: Math.max(0.01, value) })}
          precision={2}
          step={0.1}
          value={Math.round(node.scale * 100) / 100}
        />
      </PanelSection>

      <PanelSection title="Opacity">
        <SliderControl
          label={<>Opacity</>}
          max={100}
          min={0}
          onChange={(value) => handleUpdate({ opacity: Math.round(value) })}
          precision={0}
          step={1}
          unit="%"
          value={node.opacity}
        />
      </PanelSection>

      <PanelSection title="Actions">
        <ActionGroup>
          <ActionButton
            className="hover:bg-red-500/20"
            icon={<Trash2 className="h-3.5 w-3.5 text-red-400" />}
            label="Delete"
            onClick={handleDelete}
          />
        </ActionGroup>
      </PanelSection>
    </PanelWrapper>
  )
}
