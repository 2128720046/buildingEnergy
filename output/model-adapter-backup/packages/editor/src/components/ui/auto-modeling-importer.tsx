'use client'

import { useCallback, useState } from 'react'
import { applySceneGraphToEditor, type SceneGraph } from '../../lib/scene'
import {
  buildSceneGraphFromReferenceFile,
  type AutoModelImportOptions,
} from '../../lib/auto-modeling'
import { useScene } from '@pascal-app/core'
import type { AnyNode, AnyNodeId, LevelNode, ScanNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'

export interface AutoModelingImporterProps {
  onSceneGraphImported?: (sceneGraph: SceneGraph) => void
  options?: AutoModelImportOptions
}

function isSceneGraphNode(value: unknown): value is AnyNode {
  return typeof value === 'object' && value !== null && 'id' in value && 'type' in value
}

function isScanSceneGraphNode(value: unknown): value is ScanNode {
  return isSceneGraphNode(value) && value.type === 'scan'
}

export function AutoModelingImporter({
  onSceneGraphImported,
  options,
}: AutoModelingImporterProps) {
  const [isImporting, setIsImporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleImport = useCallback(async (file: File | null) => {
    if (!file) return

    setIsImporting(true)
    setError(null)
    setMessage(null)

    try {
      const isGlb = /\.(glb|gltf)$/i.test(file.name)
      const sceneGraph = await buildSceneGraphFromReferenceFile(file, options)

      if (isGlb) {
        // GLB 导入：追加扫描到已有场景的楼层，绝不替换整个场景
        const state = useScene.getState()
        const viewerState = useViewer.getState()
        let targetLevelId = viewerState.selection.levelId

        // 如果无选中楼层，寻找场景中第一个 Level
        if (!targetLevelId) {
          const firstLevel = Object.values(state.nodes).find((n): n is any => n.type === 'level')
          targetLevelId = firstLevel?.id ?? null
        }

        const scanEntry = Object.values(sceneGraph.nodes).find(isScanSceneGraphNode)
        if (scanEntry && targetLevelId) {
          useScene.setState((prev) => {
            const targetLevelNodeId = targetLevelId as LevelNode['id']
            const nextNodes: Record<AnyNodeId, AnyNode> = { ...prev.nodes }
            const scanId = scanEntry.id
            nextNodes[scanId] = { ...scanEntry, parentId: targetLevelNodeId } as AnyNode
            const level = nextNodes[targetLevelNodeId]
            if (level && 'children' in level) {
              nextNodes[targetLevelNodeId] = {
                ...level,
                children: [...(level as LevelNode).children, scanId],
              } as AnyNode
            }
            return { nodes: nextNodes }
          })
          useScene.getState().markDirty(scanEntry.id)
          useScene.getState().markDirty(targetLevelId as AnyNodeId)
          setMessage(`已导入扫描模型 ${file.name}。`)
        } else {
          setError('无法导入：场景中无可用楼层，请先创建楼层。')
        }
      } else {
        // 其他格式：正常逻辑
        if (onSceneGraphImported) {
          onSceneGraphImported(sceneGraph)
        } else {
          applySceneGraphToEditor(sceneGraph)
        }
        setMessage(`Imported ${file.name}. Review the generated walls, slabs, and zones, then fine-tune as needed.`)
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Failed to import reference file.')
    } finally {
      setIsImporting(false)
    }
  }, [options, onSceneGraphImported])

  return (
    <section className="space-y-4 rounded-xl border border-border/50 bg-background/80 p-4">
      <div className="space-y-1">
        <h3 className="font-medium text-foreground text-sm">Auto Modeling</h3>
        <p className="text-muted-foreground text-xs leading-5">
          Import SVG, JSON, GLB, or a floorplan image to generate a baseline scene. SVG and blueprint
          JSON create geometry directly; existing SceneGraph JSON is normalized and loaded as-is; GLB
          enters as a scan reference; images are attached as editable guide references for tracing.
        </p>
      </div>

      <label className="block cursor-pointer rounded-lg border border-dashed border-border/60 bg-background/60 px-4 py-5 text-center transition-colors hover:border-primary/40 hover:bg-background">
        <span className="block font-medium text-foreground text-sm">
          {isImporting ? 'Generating model...' : 'Choose SVG, JSON, GLB, or floorplan image'}
        </span>
        <span className="mt-1 block text-muted-foreground text-xs">
          Recommended flow: CAD SVG for direct geometry, Pascal SceneGraph JSON for semantic reuse,
          GLB as a 3D scan reference, or PNG/JPG/WEBP as a guide layer when you only have screenshots.
        </span>
        <input
          accept=".svg,.json,.glb,.gltf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          className="hidden"
          disabled={isImporting}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null
            event.currentTarget.value = ''
            void handleImport(file)
          }}
          type="file"
        />
      </label>

      <div className="space-y-2 rounded-lg border border-border/40 bg-background/60 p-3 text-muted-foreground text-xs leading-5">
        <p>Supported reference inputs:</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>SVG exported from CAD with wall, zone, slab, or site layers.</li>
          <li>Pascal SceneGraph JSON or a blueprint JSON normalized to walls, zones, and slabs.</li>
          <li>GLB or GLTF imported as scan references for manual zone tracing and alignment.</li>
          <li>PNG, JPG, or WEBP floorplans imported as guide layers when no vector source exists.</li>
        </ul>
      </div>

      {message ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-200 text-xs leading-5">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs leading-5">
          {error}
        </div>
      ) : null}
    </section>
  )
}

export default AutoModelingImporter
