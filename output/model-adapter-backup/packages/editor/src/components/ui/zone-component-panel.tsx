'use client'

import type { AnyNodeId, BuildingNode, LevelNode, ZoneNode } from '@pascal-app/core'
import { useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useEffect, useMemo, useState } from 'react'
import { createZoneComponentMapping, focusMappedComponent } from '../../lib/zone-component-mapping'
import { localizeDisplayName } from '../../lib/zh-cn'
import useEditor from '../../store/use-editor'

function downloadJson(fileName: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ZoneComponentPanel() {
  const nodes = useScene((state) => state.nodes)
  const rootNodeIds = useScene((state) => state.rootNodeIds)
  const selection = useViewer((state) => state.selection)
  const setSelection = useViewer((state) => state.setSelection)
  const setHoveredId = useViewer((state) => state.setHoveredId)
  const setPhase = useEditor((state) => state.setPhase)
  const setMode = useEditor((state) => state.setMode)
  const setTool = useEditor((state) => state.setTool)
  const setStructureLayer = useEditor((state) => state.setStructureLayer)

  const mapping = useMemo(
    () => createZoneComponentMapping({ nodes, rootNodeIds }),
    [nodes, rootNodeIds],
  )

  const [selectedZoneId, setSelectedZoneId] = useState<ZoneNode['id'] | ''>('')

  useEffect(() => {
    if (selection.zoneId && mapping.zones.some((zone) => zone.zoneId === selection.zoneId)) {
      setSelectedZoneId(selection.zoneId)
      return
    }

    if (!(selectedZoneId && mapping.zones.some((zone) => zone.zoneId === selectedZoneId))) {
      setSelectedZoneId((mapping.zones[0]?.zoneId as ZoneNode['id'] | undefined) ?? '')
    }
  }, [mapping.zones, selectedZoneId, selection.zoneId])

  const selectedZone = mapping.zones.find((zone) => zone.zoneId === selectedZoneId) ?? null

  const handleZoneSelect = (zoneId: ZoneNode['id']) => {
    setSelectedZoneId(zoneId)
    const zone = mapping.zones.find((entry) => entry.zoneId === zoneId)
    if (!zone) {
      return
    }

    setPhase('structure')
    setMode('select')
    setTool(null)
    setStructureLayer('zones')
    setHoveredId(null)
    setSelection({
      buildingId: zone.buildingId as BuildingNode['id'] | null,
      levelId: zone.levelId as LevelNode['id'] | null,
      zoneId: zone.zoneId as ZoneNode['id'],
      selectedIds: [],
    })
  }

  const handleComponentSelect = (componentId: AnyNodeId) => {
    if (!selectedZone) {
      return
    }

    setPhase('structure')
    setMode('select')
    setTool(null)
    setStructureLayer('elements')
    setHoveredId(componentId)
    setSelection({
      buildingId: selectedZone.buildingId as BuildingNode['id'] | null,
      levelId: selectedZone.levelId as LevelNode['id'] | null,
      zoneId: selectedZone.zoneId as ZoneNode['id'],
      selectedIds: [componentId],
    })
    focusMappedComponent(componentId)
  }

  return (
    <section className="space-y-4 rounded-xl border border-border/50 bg-background/80 p-4">
      <div className="space-y-1">
        <h3 className="font-medium text-foreground text-sm">区域组件</h3>
        <p className="text-muted-foreground text-xs leading-5">
          根据当前场景自动构建区域到组件的映射关系。你可以按区域筛选组件，并在点击后高亮该组件并聚焦到视图中。
        </p>
      </div>

      <div className="flex items-center gap-2">
        <select
          className="min-w-0 flex-1 rounded-md border border-border/60 bg-background px-3 py-2 text-foreground text-sm"
          onChange={(event) => handleZoneSelect(event.target.value as ZoneNode['id'])}
          value={selectedZoneId}
        >
          {mapping.zones.map((zone) => (
            <option key={zone.zoneId} value={zone.zoneId}>
              {localizeDisplayName(zone.zoneName, 'zone')}
            </option>
          ))}
        </select>
        <button
          className="rounded-md border border-border/60 bg-background px-3 py-2 text-foreground text-xs transition-colors hover:bg-accent"
          onClick={() => downloadJson('map.json', mapping.mapFile)}
          type="button"
        >
          导出 map.json
        </button>
      </div>

      {selectedZone ? (
        <div className="rounded-lg border border-border/40 bg-background/60 p-3 text-muted-foreground text-xs leading-5">
          <p>
            区域 ID: <span className="text-foreground">{selectedZone.zoneId}</span>
          </p>
          <p>
            区域内组件数: <span className="text-foreground">{selectedZone.components.length}</span>
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border/40 bg-background/60 p-3 text-muted-foreground text-xs leading-5">
          当前场景中没有可用区域。
        </div>
      )}

      {selectedZone?.components.length ? (
        <div className="space-y-2">
          {selectedZone.components.map((component) => {
            const isSelected = selection.selectedIds.includes(component.id)

            return (
              <button
                className={[
                  'flex w-full items-start justify-between rounded-lg border px-3 py-2 text-left transition-colors',
                  isSelected
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : 'border-border/40 bg-background/60 text-foreground hover:bg-accent',
                ].join(' ')}
                key={component.id}
                onClick={() => handleComponentSelect(component.id)}
                type="button"
              >
                <span>
                  <span className="block font-medium text-sm">{component.name}</span>
                  <span className="block text-muted-foreground text-xs">
                    {component.id} · {localizeDisplayName(component.type)}
                  </span>
                </span>
                <span className="text-muted-foreground text-xs">
                  ({component.anchor[0].toFixed(2)}, {component.anchor[1].toFixed(2)})
                </span>
              </button>
            )
          })}
        </div>
      ) : selectedZone ? (
        <div className="rounded-lg border border-border/40 bg-background/60 p-3 text-muted-foreground text-xs leading-5">
          该区域内没有映射到组件。
        </div>
      ) : null}
    </section>
  )
}

export default ZoneComponentPanel