import { useRegistry, type ZoneNode } from '@pascal-app/core'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, type Group, Shape } from 'three'
import { float, uniform, uv } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { useNodeEvents } from '../../../hooks/use-node-events'
import { ZONE_LAYER } from '../../../lib/layers'

const Y_OFFSET = 0.01
const WALL_HEIGHT = 2.3
const LERP_SPEED = 0.18

/**
 * Creates a gradient wall material using a mutable uniform for color.
 * Stores the color uniform on material.userData.uColor so it can be animated at runtime.
 */
function createWallGradientMaterial(zoneColor: string) {
  const colorUniform = uniform(new Color(zoneColor))
  const gradientT = uv().y
  const opacity = uniform(1) // 默认可见
  const finalOpacity = float(0.6).mul(float(1).sub(gradientT)).mul(opacity)

  const mat = new MeshBasicNodeMaterial({
    transparent: true,
    colorNode: colorUniform,
    opacityNode: finalOpacity,
    side: DoubleSide,
    depthWrite: true,
    depthTest: false,
    userData: { uOpacity: opacity, uColor: colorUniform },
  })
  return mat
}

function createFloorMaterial(zoneColor: string) {
  const colorUniform = uniform(new Color(zoneColor))
  const opacity = uniform(1) // 默认可见

  const mat = new MeshBasicNodeMaterial({
    transparent: true,
    colorNode: colorUniform,
    opacityNode: float(0.25).mul(opacity),
    side: DoubleSide,
    depthWrite: false,
    depthTest: false,
    userData: { uOpacity: opacity, uColor: colorUniform },
  })
  return mat
}

function createWallGeometry(polygon: Array<[number, number]>): BufferGeometry {
  const geometry = new BufferGeometry()
  if (polygon.length < 2) return geometry

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i]!
    const next = polygon[(i + 1) % polygon.length]!
    const baseIndex = i * 4

    positions.push(current[0]!, Y_OFFSET, current[1]!)
    uvs.push(0, 0)
    positions.push(next[0]!, Y_OFFSET, next[1]!)
    uvs.push(1, 0)
    positions.push(next[0]!, Y_OFFSET + WALL_HEIGHT, next[1]!)
    uvs.push(1, 1)
    positions.push(current[0]!, Y_OFFSET + WALL_HEIGHT, current[1]!)
    uvs.push(0, 1)

    indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3)
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export const ZoneRenderer = ({ node }: { node: ZoneNode }) => {
  const ref = useRef<Group>(null!)
  useRegistry(node.id, 'zone', ref)

  // ---- 几何体（不随颜色变化） ----
  const floorShape = useMemo(() => {
    if (!node?.polygon || node.polygon.length < 3) return null
    const shape = new Shape()
    shape.moveTo(node.polygon[0]![0]!, -node.polygon[0]![1]!)
    for (let i = 1; i < node.polygon.length; i++) {
      shape.lineTo(node.polygon[i]![0]!, -node.polygon[i]![1]!)
    }
    shape.closePath()
    return shape
  }, [node?.polygon])

  const wallGeometry = useMemo(() => {
    if (!node?.polygon || node.polygon.length < 2) return null
    return createWallGeometry(node.polygon)
  }, [node?.polygon])

  const centroid = useMemo(() => {
    if (!node?.polygon || node.polygon.length < 3) return [0, 0] as [number, number]
    let signedArea = 0, cx = 0, cz = 0
    const polygon = node.polygon
    for (let i = 0; i < polygon.length; i++) {
      const [x0, z0] = polygon[i]!
      const [x1, z1] = polygon[(i + 1) % polygon.length]!
      const cross = x0 * z1 - x1 * z0
      signedArea += cross
      cx += (x0 + x1) * cross
      cz += (z0 + z1) * cross
    }
    signedArea /= 2
    const factor = 1 / (6 * signedArea)
    return [cx * factor, cz * factor] as [number, number]
  }, [node?.polygon])

  // ---- 材质（只创建一次，通过 uniform 更新颜色） ----
  const floorMatRef = useRef<MeshBasicNodeMaterial | null>(null)
  const wallMatRef = useRef<MeshBasicNodeMaterial | null>(null)
  const targetColorRef = useRef(new Color(node.color || '#3b82f6'))
  const initDone = useRef(false)

  if (!initDone.current) {
    initDone.current = true
    floorMatRef.current = createFloorMaterial(node.color || '#3b82f6')
    wallMatRef.current = createWallGradientMaterial(node.color || '#3b82f6')
  }

  // node.color 变化时更新目标色
  useEffect(() => {
    if (node?.color) {
      targetColorRef.current.set(node.color)
    }
  }, [node?.color])

  // 每帧平滑插值颜色 uniform
  useFrame(() => {
    const floorUColor = floorMatRef.current?.userData?.uColor as
      | { value: Color }
      | undefined
    if (floorUColor?.value && !floorUColor.value.equals(targetColorRef.current)) {
      floorUColor.value.lerp(targetColorRef.current, LERP_SPEED)
    }

    const wallUColor = wallMatRef.current?.userData?.uColor as
      | { value: Color }
      | undefined
    if (wallUColor?.value && !wallUColor.value.equals(targetColorRef.current)) {
      wallUColor.value.lerp(targetColorRef.current, LERP_SPEED)
    }
  })

  const handlers = useNodeEvents(node, 'zone')

  const currentColor = node.color || '#3b82f6'

  if (!(node && floorShape && wallGeometry && floorMatRef.current && wallMatRef.current)) {
    return null
  }

  return (
    <group ref={ref} {...handlers} userData={{ labelPosition: [centroid[0], 1, centroid[1]] }}>
      <Html
        name="label"
        position={[centroid[0], 1, centroid[1]]}
        style={{ pointerEvents: 'none' }}
        zIndexRange={[10, 0]}
      >
        <div
          id={`${node.id}-label`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            transform: 'translate3d(-50%, -50%, 0)',
            opacity: 1,
          }}
        >
          <div
            style={{
              width: 'max-content',
              color: 'white',
              textShadow: `-1px -1px 0 ${currentColor}, 1px -1px 0 ${currentColor}, -1px 1px 0 ${currentColor}, 1px 1px 0 ${currentColor}`,
              textAlign: 'center',
            }}
          >
            <span>{node.name}</span>
          </div>
          <div
            className="label-pin"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginTop: '2px',
              opacity: 1,
            }}
          >
            <div style={{ width: '2px', height: '40px', backgroundColor: currentColor }} />
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: currentColor,
                border: '1px solid white',
              }}
            />
          </div>
        </div>
      </Html>

      {/* Floor fill */}
      <mesh
        layers={ZONE_LAYER}
        material={floorMatRef.current}
        name="floor"
        position={[0, Y_OFFSET, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <shapeGeometry args={[floorShape]} />
      </mesh>

      {/* Wall borders with gradient */}
      <mesh
        geometry={wallGeometry}
        layers={ZONE_LAYER}
        material={wallMatRef.current}
        name="walls"
      />
    </group>
  )
}
