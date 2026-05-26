import {
  type AnyNodeId,
  type ScanNode,
  sceneRegistry,
  useRegistry,
  useScene,
} from '@pascal-app/core'
import { type ThreeEvent, useThree } from '@react-three/fiber'
import { memo, Suspense, useCallback, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  EdgesGeometry,
  type Group,
  LineBasicMaterial,
  type Material,
  Mesh,
  MeshBasicMaterial,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
} from 'three'
import { useAssetUrl } from '../../../hooks/use-asset-url'
import { useGLTFKTX2 } from '../../../hooks/use-gltf-ktx2'
import useViewer from '../../../store/use-viewer'
import { ErrorBoundary } from '../../error-boundary'

export const ScanRenderer = ({ node }: { node: ScanNode }) => {
  const showScans = useViewer((s) => s.showScans)
  const ref = useRef<Group>(null!)
  useRegistry(node.id, 'scan', ref)

  const resolvedUrl = useAssetUrl(node.url)

  return (
    <group
      position={node.position}
      ref={ref}
      rotation={node.rotation}
      scale={[node.scale, node.scale, node.scale]}
      visible={showScans}
    >
      {resolvedUrl && (
        <ErrorBoundary fallback={<ScanLoadFailurePlaceholder />}>
          <Suspense fallback={<ScanLoadingPlaceholder />}>
            <ScanModel opacity={node.opacity} url={resolvedUrl} />
          </Suspense>
        </ErrorBoundary>
      )}
      <ScanDragHandle nodeId={node.id} positionY={node.position[1]} />
    </group>
  )
}

// ── Invisible placeholder while GLB loads ───────────────────────────────────

const ScanLoadingPlaceholder = memo(() => {
  return (
    <mesh visible={false}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  )
})
ScanLoadingPlaceholder.displayName = 'ScanLoadingPlaceholder'

const ScanLoadFailurePlaceholder = memo(() => {
  return (
    <mesh visible={false}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  )
})
ScanLoadFailurePlaceholder.displayName = 'ScanLoadFailurePlaceholder'

const ScanModel = memo(({ url, opacity }: { url: string; opacity: number }) => {
  const gltf = useGLTFKTX2(url) as any
  const scene = gltf.scene

  useMemo(() => {
    const normalizedOpacity = opacity / 100
    const isTransparent = normalizedOpacity < 1

    const updateMaterial = (material: Material) => {
      if (isTransparent) {
        material.transparent = true
        material.opacity = normalizedOpacity
        material.depthWrite = false
      } else {
        material.transparent = false
        material.opacity = 1
        material.depthWrite = true
      }
      material.needsUpdate = true
    }

    scene.traverse((child: any) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh
        mesh.geometry.boundingBox = null
        mesh.geometry.boundingSphere = null
        mesh.frustumCulled = false
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m: Material) => updateMaterial(m))
        } else {
          updateMaterial(mesh.material)
        }
      }
    })
  }, [scene, opacity])

  return <primitive object={scene} />
})
ScanModel.displayName = 'ScanModel'

// ── Drag-to-move overlay ────────────────────────────────────────────────────

const _ray = new Raycaster()
const _vec = new Vector3()
const _plane = new Plane(new Vector3(0, 1, 0), 0)
const _mouse = new Vector2()

const ScanDragHandle = memo(({ nodeId, positionY }: { nodeId: string; positionY: number }) => {
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const updateNode = useScene((s) => s.updateNode)
  const isSelected = selectedIds.includes(nodeId)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)

  const isDraggingRef = useRef(false)
  const startPtrRef = useRef(new Vector3())
  const startPosRef = useRef<[number, number, number]>([0, 0, 0])

  const dragCtxRef = useRef({ nodeId, positionY, camera, gl, updateNode })
  dragCtxRef.current = { nodeId, positionY, camera, gl, updateNode }

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (useViewer.getState().cameraDragging) return
    if (e.button !== 0) return
    e.stopPropagation()

    const ctx = dragCtxRef.current
    isDraggingRef.current = true
    startPtrRef.current.copy(e.point)
    const node = useScene.getState().nodes[ctx.nodeId as AnyNodeId] as ScanNode | undefined
    startPosRef.current = node ? [node.position[0], node.position[1], node.position[2]] : [0, 0, 0]

    _plane.set(new Vector3(0, 1, 0), -ctx.positionY)

    const canvas = ctx.gl.domElement
    const handleMove = (ev: PointerEvent) => {
      if (!isDraggingRef.current) return
      const ctx2 = dragCtxRef.current
      const rect = canvas.getBoundingClientRect()
      _mouse.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      )
      _ray.setFromCamera(_mouse, ctx2.camera)
      const hit = _ray.ray.intersectPlane(_plane, _vec)
      if (!hit) return

      const startPos = startPosRef.current
      const startPtr = startPtrRef.current
      const mesh = sceneRegistry.nodes.get(ctx2.nodeId)
      if (!mesh) return
      mesh.position.x = startPos[0] + (_vec.x - startPtr.x)
      mesh.position.z = startPos[2] + (_vec.z - startPtr.z)
    }

    const handleUp = () => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      const ctx3 = dragCtxRef.current
      const mesh = sceneRegistry.nodes.get(ctx3.nodeId)
      if (mesh) {
        ctx3.updateNode(ctx3.nodeId as AnyNodeId, {
          position: [mesh.position.x, ctx3.positionY, mesh.position.z],
        })
      }
      canvas.removeEventListener('pointermove', handleMove)
      canvas.removeEventListener('pointerup', handleUp)
    }

    canvas.addEventListener('pointermove', handleMove)
    canvas.addEventListener('pointerup', handleUp)
  }, [])

  if (!isSelected) return null

  return (
    <mesh onPointerDown={handlePointerDown}>
      <boxGeometry args={[10, 10, 10]} />
      <meshBasicMaterial color="#00F5FF" depthWrite={false} opacity={0.06} transparent />
      <lineSegments>
        <edgesGeometry args={[new BoxGeometry(10, 10, 10)]} />
        <lineBasicMaterial color="#00F5FF" opacity={0.35} transparent />
      </lineSegments>
    </mesh>
  )
})
ScanDragHandle.displayName = 'ScanDragHandle'
