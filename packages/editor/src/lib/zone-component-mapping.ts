import {
  emitter,
  getScaledDimensions,
  pointInPolygon,
  type AnyNode,
  type DoorNode,
  type GuideNode,
  type ItemNode,
  type ScanNode,
  type WallNode,
  type WindowNode,
  type ZoneNode,
} from '@pascal-app/core'
import type { SceneGraph } from './scene'
import { localizeDisplayName } from './zh-cn'

export type MappableComponentType = 'item' | 'door' | 'window' | 'scan' | 'guide'

export type ZoneMappedComponentRecord = {
  id: AnyNode['id']
  name: string
  type: MappableComponentType
}

export type ZoneComponentMappingFile = {
  project_id: string
  mapping_data: Record<
    string,
    {
      level_id: string | null
      zone_name: string
      components: ZoneMappedComponentRecord[]
    }
  >
}

export type ZoneMappedComponent = {
  id: AnyNode['id']
  name: string
  type: MappableComponentType
  levelId: string | null
  buildingId: string | null
  anchor: [number, number]
}

export type ZoneMappingEntry = {
  zoneId: string
  zoneName: string
  levelId: string | null
  buildingId: string | null
  polygon: Array<[number, number]>
  componentIds: string[]
  components: ZoneMappedComponent[]
}

type SceneNodes = Record<string, AnyNode>
type MappableSceneNode = ItemNode | DoorNode | WindowNode | ScanNode | GuideNode

type MappableComponentCandidate = {
  node: MappableSceneNode
  component: ZoneMappedComponent
}

type WallMetrics = {
  wall: WallNode
  normalX: number
  normalZ: number
}

type ZoneFit = {
  score: number
  distance: number
}

const MAPPABLE_COMPONENT_TYPES = new Set<MappableComponentType>([
  'item',
  'door',
  'window',
  'scan',
  'guide',
])

const EDGE_FALLBACK_DISTANCE = 0.18
const POINT_NEIGHBOR_SAMPLE_OFFSET = 0.08
const WALL_SIDE_SAMPLE_PADDING = 0.05

const hasPlanPosition = (
  node: Partial<ItemNode | ScanNode | GuideNode>,
): node is { position: [number, number, number] } => Array.isArray(node.position)

function resolveLevelId(node: AnyNode | undefined, nodes: SceneNodes): string | null {
  let current = node

  while (current) {
    if (current.type === 'level') {
      return current.id
    }

    current = current.parentId ? (nodes[current.parentId] as AnyNode | undefined) : undefined
  }

  return null
}

function resolveBuildingId(levelId: string | null, nodes: SceneNodes): string | null {
  let current = levelId ? (nodes[levelId] as AnyNode | undefined) : undefined

  while (current) {
    if (current.type === 'building') {
      return current.id
    }

    current = current.parentId ? (nodes[current.parentId] as AnyNode | undefined) : undefined
  }

  return null
}

function getWallPlanAnchor(wall: WallNode): [number, number] {
  return [(wall.start[0] + wall.end[0]) / 2, (wall.start[1] + wall.end[1]) / 2]
}

function projectWallOffsetToPlan(wall: WallNode, localOffsetX: number): [number, number] {
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const length = Math.hypot(dx, dz)

  if (length === 0) {
    return getWallPlanAnchor(wall)
  }

  const dirX = dx / length
  const dirZ = dz / length
  return [wall.start[0] + dirX * localOffsetX, wall.start[1] + dirZ * localOffsetX]
}

function getWallMetrics(wall: WallNode): WallMetrics | null {
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const length = Math.hypot(dx, dz)

  if (length <= 1e-9) {
    return null
  }

  return {
    wall,
    normalX: -dz / length,
    normalZ: dx / length,
  }
}

function getItemFootprint(
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
  inset = 0,
): Array<[number, number]> {
  const [x, , z] = position
  const [width, , depth] = dimensions
  const yRotation = rotation[1]
  const halfWidth = Math.max(0, width / 2 - inset)
  const halfDepth = Math.max(0, depth / 2 - inset)
  const cos = Math.cos(yRotation)
  const sin = Math.sin(yRotation)

  return [
    [x + (-halfWidth * cos + halfDepth * sin), z + (-halfWidth * sin - halfDepth * cos)],
    [x + (halfWidth * cos + halfDepth * sin), z + (halfWidth * sin - halfDepth * cos)],
    [x + (halfWidth * cos - halfDepth * sin), z + (halfWidth * sin + halfDepth * cos)],
    [x + (-halfWidth * cos - halfDepth * sin), z + (-halfWidth * sin + halfDepth * cos)],
  ]
}

function segmentsIntersect(
  ax1: number,
  az1: number,
  ax2: number,
  az2: number,
  bx1: number,
  bz1: number,
  bx2: number,
  bz2: number,
): boolean {
  const cross = (ox: number, oz: number, ax: number, az: number, bx: number, bz: number) =>
    (ax - ox) * (bz - oz) - (az - oz) * (bx - ox)

  const d1 = cross(bx1, bz1, bx2, bz2, ax1, az1)
  const d2 = cross(bx1, bz1, bx2, bz2, ax2, az2)
  const d3 = cross(ax1, az1, ax2, az2, bx1, bz1)
  const d4 = cross(ax1, az1, ax2, az2, bx2, bz2)

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }

  const onSegment = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) =>
    Math.min(px, qx) <= rx &&
    rx <= Math.max(px, qx) &&
    Math.min(pz, qz) <= rz &&
    rz <= Math.max(pz, qz)

  if (d1 === 0 && onSegment(bx1, bz1, bx2, bz2, ax1, az1)) return true
  if (d2 === 0 && onSegment(bx1, bz1, bx2, bz2, ax2, az2)) return true
  if (d3 === 0 && onSegment(ax1, az1, ax2, az2, bx1, bz1)) return true
  if (d4 === 0 && onSegment(ax1, az1, ax2, az2, bx2, bz2)) return true

  return false
}

function segmentIntersectsPolygon(
  sx1: number,
  sz1: number,
  sx2: number,
  sz2: number,
  polygon: Array<[number, number]>,
): boolean {
  for (let index = 0; index < polygon.length; index += 1) {
    const nextIndex = (index + 1) % polygon.length
    if (
      segmentsIntersect(
        sx1,
        sz1,
        sx2,
        sz2,
        polygon[index]![0],
        polygon[index]![1],
        polygon[nextIndex]![0],
        polygon[nextIndex]![1],
      )
    ) {
      return true
    }
  }

  return false
}

function itemOverlapsPolygon(
  position: [number, number, number],
  dimensions: [number, number, number],
  rotation: [number, number, number],
  polygon: Array<[number, number]>,
  inset = 0.01,
): boolean {
  const footprint = getItemFootprint(position, dimensions, rotation, inset)

  for (const [pointX, pointZ] of footprint) {
    if (pointInPolygon(pointX, pointZ, polygon)) {
      return true
    }
  }

  for (const [pointX, pointZ] of polygon) {
    if (pointInPolygon(pointX, pointZ, footprint)) {
      return true
    }
  }

  for (let index = 0; index < footprint.length; index += 1) {
    const nextIndex = (index + 1) % footprint.length
    if (
      segmentIntersectsPolygon(
        footprint[index]![0],
        footprint[index]![1],
        footprint[nextIndex]![0],
        footprint[nextIndex]![1],
        polygon,
      )
    ) {
      return true
    }
  }

  return false
}

function distancePointToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const abx = bx - ax
  const abz = bz - az
  const apx = px - ax
  const apz = pz - az
  const lengthSquared = abx * abx + abz * abz

  if (lengthSquared <= 1e-12) {
    return Math.hypot(px - ax, pz - az)
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / lengthSquared))
  const closestX = ax + abx * t
  const closestZ = az + abz * t
  return Math.hypot(px - closestX, pz - closestZ)
}

function distancePointToPolygon(px: number, pz: number, polygon: Array<[number, number]>): number {
  if (polygon.length < 2) {
    return Number.POSITIVE_INFINITY
  }

  if (pointInPolygon(px, pz, polygon)) {
    return 0
  }

  let minDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < polygon.length; index += 1) {
    const nextIndex = (index + 1) % polygon.length
    minDistance = Math.min(
      minDistance,
      distancePointToSegment(
        px,
        pz,
        polygon[index]![0],
        polygon[index]![1],
        polygon[nextIndex]![0],
        polygon[nextIndex]![1],
      ),
    )
  }

  return minDistance
}

function countPointsInsidePolygon(points: Array<[number, number]>, polygon: Array<[number, number]>): number {
  return points.reduce(
    (count, [pointX, pointZ]) => count + (pointInPolygon(pointX, pointZ, polygon) ? 1 : 0),
    0,
  )
}

function getPointNeighborhoodSamples(anchor: [number, number], offset = POINT_NEIGHBOR_SAMPLE_OFFSET) {
  const [anchorX, anchorZ] = anchor
  return [
    anchor,
    [anchorX + offset, anchorZ] as [number, number],
    [anchorX - offset, anchorZ] as [number, number],
    [anchorX, anchorZ + offset] as [number, number],
    [anchorX, anchorZ - offset] as [number, number],
  ]
}

function getWallSampleOffsets(width: number): number[] {
  if (width <= 0.3) {
    return [0]
  }

  return [-0.35, 0, 0.35].map((ratio) => ratio * width)
}

function getWallAttachedPlacement(
  node: MappableSceneNode,
  nodes: SceneNodes,
): { metrics: WallMetrics; localOffsetX: number; width: number; preferredSide?: 'front' | 'back' } | null {
  if (node.type === 'item') {
    const wallId = node.wallId ?? node.parentId
    const wall = wallId ? (nodes[wallId] as AnyNode | undefined) : undefined
    if (wall?.type !== 'wall') {
      return null
    }

    const metrics = getWallMetrics(wall)
    if (!metrics) {
      return null
    }

    return {
      metrics,
      localOffsetX: node.position[0],
      width: getScaledDimensions(node)[0],
      preferredSide: node.asset.attachTo === 'wall-side' ? node.side : undefined,
    }
  }

  if (node.type === 'door' || node.type === 'window') {
    const wallId = node.wallId ?? node.parentId
    const wall = wallId ? (nodes[wallId] as AnyNode | undefined) : undefined
    if (wall?.type !== 'wall') {
      return null
    }

    const metrics = getWallMetrics(wall)
    if (!metrics) {
      return null
    }

    return {
      metrics,
      localOffsetX: node.position[0],
      width: node.width,
      preferredSide: node.side,
    }
  }

  return null
}

function getWallCenterSamples(placement: { metrics: WallMetrics; localOffsetX: number; width: number }) {
  return getWallSampleOffsets(placement.width).map((sampleOffset) =>
    projectWallOffsetToPlan(placement.metrics.wall, placement.localOffsetX + sampleOffset),
  )
}

function getWallSideSamples(
  placement: { metrics: WallMetrics; localOffsetX: number; width: number },
  side: 'front' | 'back',
): Array<[number, number]> {
  const sideSign = side === 'front' ? 1 : -1
  const offsetDistance = Math.max((placement.metrics.wall.thickness ?? 0.1) / 2 + WALL_SIDE_SAMPLE_PADDING, 0.08)

  return getWallSampleOffsets(placement.width).map((sampleOffset) => {
    const center = projectWallOffsetToPlan(placement.metrics.wall, placement.localOffsetX + sampleOffset)
    return [
      center[0] + placement.metrics.normalX * offsetDistance * sideSign,
      center[1] + placement.metrics.normalZ * offsetDistance * sideSign,
    ]
  })
}

function getComponentAnchor(node: AnyNode, nodes: SceneNodes): [number, number] | null {
  if (node.type === 'item') {
    if (node.asset.attachTo === 'wall' || node.asset.attachTo === 'wall-side') {
      const wallId = node.wallId ?? node.parentId
      const wall = wallId ? (nodes[wallId] as AnyNode | undefined) : undefined
      if (wall?.type === 'wall') {
        return projectWallOffsetToPlan(wall, node.position[0])
      }
    }

    return hasPlanPosition(node) ? [node.position[0], node.position[2]] : null
  }

  if (node.type === 'scan' || node.type === 'guide') {
    return hasPlanPosition(node) ? [node.position[0], node.position[2]] : null
  }

  if (node.type === 'door' || node.type === 'window') {
    const wallId = node.wallId ?? node.parentId
    const wall = wallId ? (nodes[wallId] as AnyNode | undefined) : undefined
    if (wall?.type === 'wall') {
      return projectWallOffsetToPlan(wall, node.position[0])
    }

    return Array.isArray(node.position) ? [node.position[0], node.position[2]] : null
  }

  return null
}

function getComponentZoneFit(
  node: MappableSceneNode,
  anchor: [number, number],
  zone: ZoneNode,
  nodes: SceneNodes,
): ZoneFit {
  let score = pointInPolygon(anchor[0], anchor[1], zone.polygon) ? 24 : 0

  if (node.type === 'item') {
    const wallPlacement = getWallAttachedPlacement(node, nodes)

    if (wallPlacement) {
      const centerHits = countPointsInsidePolygon(getWallCenterSamples(wallPlacement), zone.polygon)
      const frontHits = countPointsInsidePolygon(getWallSideSamples(wallPlacement, 'front'), zone.polygon)
      const backHits = countPointsInsidePolygon(getWallSideSamples(wallPlacement, 'back'), zone.polygon)

      score += centerHits * 6
      if (wallPlacement.preferredSide === 'front') {
        score += frontHits * 30 + backHits * 2
      } else if (wallPlacement.preferredSide === 'back') {
        score += backHits * 30 + frontHits * 2
      } else {
        score += Math.max(frontHits, backHits) * 22 + Math.min(frontHits, backHits) * 3
      }
    } else {
      if (itemOverlapsPolygon(node.position, getScaledDimensions(node), node.rotation, zone.polygon)) {
        score += 64
      }
      score += countPointsInsidePolygon(getPointNeighborhoodSamples(anchor), zone.polygon) * 4
    }
  } else if (node.type === 'door' || node.type === 'window') {
    const wallPlacement = getWallAttachedPlacement(node, nodes)

    if (wallPlacement) {
      const centerHits = countPointsInsidePolygon(getWallCenterSamples(wallPlacement), zone.polygon)
      const frontHits = countPointsInsidePolygon(getWallSideSamples(wallPlacement, 'front'), zone.polygon)
      const backHits = countPointsInsidePolygon(getWallSideSamples(wallPlacement, 'back'), zone.polygon)

      score += centerHits * 4
      if (wallPlacement.preferredSide === 'front') {
        score += frontHits * 34 + backHits
      } else if (wallPlacement.preferredSide === 'back') {
        score += backHits * 34 + frontHits
      } else {
        score += Math.max(frontHits, backHits) * 24
      }
    }
  } else {
    score += countPointsInsidePolygon(getPointNeighborhoodSamples(anchor), zone.polygon) * 5
  }

  return {
    score,
    distance: distancePointToPolygon(anchor[0], anchor[1], zone.polygon),
  }
}

function getNodeDisplayName(node: AnyNode): string {
  return localizeDisplayName(node.name || node.id, node.type)
}

function collectMappableComponents(nodes: SceneNodes): Map<string | null, MappableComponentCandidate[]> {
  const componentsByLevel = new Map<string | null, MappableComponentCandidate[]>()

  for (const node of Object.values(nodes)) {
    if (!MAPPABLE_COMPONENT_TYPES.has(node.type as MappableComponentType)) {
      continue
    }

    const anchor = getComponentAnchor(node, nodes)
    if (!anchor) {
      continue
    }

    const levelId = resolveLevelId(node, nodes)
    const buildingId = resolveBuildingId(levelId, nodes)
    const component: ZoneMappedComponent = {
      id: node.id,
      name: getNodeDisplayName(node),
      type: node.type as MappableComponentType,
      levelId,
      buildingId,
      anchor,
    }

    const bucket = componentsByLevel.get(levelId) ?? []
    bucket.push({
      node: node as MappableSceneNode,
      component,
    })
    componentsByLevel.set(levelId, bucket)
  }

  return componentsByLevel
}

function getProjectId(nodes: SceneNodes, rootNodeIds: string[]): string {
  const rootNodes = rootNodeIds
    .map((id) => nodes[id])
    .filter((node): node is AnyNode => Boolean(node))

  for (const rootNode of rootNodes) {
    if (rootNode.type === 'building') {
      return rootNode.id
    }

    const siteChildren =
      rootNode.type === 'site' && 'children' in rootNode
        ? (rootNode as AnyNode & { children?: unknown[] }).children
        : undefined

    if (Array.isArray(siteChildren)) {
      for (const child of siteChildren) {
        const building = typeof child === 'string' ? nodes[child] : undefined
        if (building?.type === 'building') {
          return building.id
        }
      }
    }
  }

  const firstBuilding = Object.values(nodes).find((node) => node.type === 'building')
  return firstBuilding?.id ?? rootNodeIds[0] ?? 'unknown-project'
}

function isBetterFit(next: ZoneFit, current: ZoneFit, nextZoneId: string, currentZoneId: string) {
  if (next.score !== current.score) {
    return next.score > current.score
  }

  if (Math.abs(next.distance - current.distance) > 1e-6) {
    return next.distance < current.distance
  }

  return nextZoneId.localeCompare(currentZoneId) < 0
}

export function createZoneComponentMapping(sceneGraph: SceneGraph): {
  mapFile: ZoneComponentMappingFile
  zones: ZoneMappingEntry[]
} {
  const nodes = sceneGraph.nodes as SceneNodes
  const zoneEntries: ZoneMappingEntry[] = Object.values(nodes)
    .filter((node): node is ZoneNode => node.type === 'zone')
    .map((zone): ZoneMappingEntry => {
      const levelId = resolveLevelId(zone, nodes)
      const buildingId = resolveBuildingId(levelId, nodes)

      return {
        zoneId: zone.id,
        zoneName: zone.name || zone.id,
        levelId,
        buildingId,
        polygon: zone.polygon,
        componentIds: [],
        components: [],
      }
    })

  const zoneEntriesById = new Map<ZoneMappingEntry['zoneId'], ZoneMappingEntry>(
    zoneEntries.map((zone) => [zone.zoneId, zone]),
  )
  const zonesByLevel = new Map<string | null, ZoneNode[]>()
  for (const zone of Object.values(nodes).filter((node): node is ZoneNode => node.type === 'zone')) {
    const levelId = resolveLevelId(zone, nodes)
    const bucket = zonesByLevel.get(levelId) ?? []
    bucket.push(zone)
    zonesByLevel.set(levelId, bucket)
  }

  const componentsByLevel = collectMappableComponents(nodes)

  for (const [levelId, candidates] of componentsByLevel.entries()) {
    const levelZones = zonesByLevel.get(levelId) ?? []
    if (levelZones.length === 0) {
      continue
    }

    for (const candidate of candidates) {
      let bestZoneId: ZoneMappingEntry['zoneId'] | null = null
      let bestFit: ZoneFit | null = null

      for (const zone of levelZones) {
        const fit = getComponentZoneFit(candidate.node, candidate.component.anchor, zone, nodes)
        if (!bestFit || isBetterFit(fit, bestFit, zone.id, bestZoneId ?? zone.id)) {
          bestZoneId = zone.id
          bestFit = fit
        }
      }

      if (!bestZoneId || !bestFit) {
        continue
      }

      if (bestFit.score <= 0 && bestFit.distance > EDGE_FALLBACK_DISTANCE) {
        continue
      }

      const zoneEntry = zoneEntriesById.get(bestZoneId)
      if (!zoneEntry) {
        continue
      }

      zoneEntry.components.push(candidate.component)
    }
  }

  for (const zone of zoneEntries) {
    zone.components.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
    zone.componentIds = zone.components.map((component) => component.id)
  }

  zoneEntries.sort((left, right) => left.zoneName.localeCompare(right.zoneName) || left.zoneId.localeCompare(right.zoneId))

  return {
    mapFile: {
      project_id: getProjectId(nodes, sceneGraph.rootNodeIds),
      mapping_data: Object.fromEntries(
        zoneEntries.map((zoneEntry) => [
          zoneEntry.zoneId,
          {
            level_id: zoneEntry.levelId,
            zone_name: localizeDisplayName(zoneEntry.zoneName, 'zone'),
            components: zoneEntry.components.map((component) => ({
              id: component.id,
              name: component.name,
              type: component.type,
            })),
          },
        ]),
      ),
    },
    zones: zoneEntries,
  }
}

export function focusMappedComponent(componentId: AnyNode['id']) {
  emitter.emit('camera-controls:focus', { nodeId: componentId })
}