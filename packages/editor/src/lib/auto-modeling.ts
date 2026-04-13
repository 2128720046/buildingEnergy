import {
  BuildingNode,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  GuideNode,
  LevelNode,
  ScanNode,
  type SiteNode as SiteNodeType,
  SiteNode,
  SlabNode,
  WallNode,
  ZoneNode,
} from '@pascal-app/core'
import type { SceneGraph } from './scene'

type Point2D = [number, number]
type RawGeometry = {
  id: string
  role: 'wall' | 'zone' | 'slab' | 'site'
  levelKey: string
  points: Point2D[]
  closed: boolean
  strokeWidth?: number
  label?: string
}

export type AutoModelUnits = 'm' | 'cm' | 'mm'

export interface AutoModelWallBlueprint {
  id?: string
  name?: string
  start: Point2D
  end: Point2D
  thickness?: number
  height?: number
  metadata?: Record<string, unknown>
}

export interface AutoModelZoneBlueprint {
  id?: string
  name: string
  polygon: Point2D[]
  color?: string
  metadata?: Record<string, unknown>
}

export interface AutoModelSlabBlueprint {
  id?: string
  name?: string
  polygon: Point2D[]
  elevation?: number
  metadata?: Record<string, unknown>
}

export interface AutoModelGuideBlueprint {
  name?: string
  url: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
  opacity?: number
  metadata?: Record<string, unknown>
}

export interface AutoModelLevelBlueprint {
  id?: string
  name?: string
  level: number
  walls: AutoModelWallBlueprint[]
  zones?: AutoModelZoneBlueprint[]
  slabs?: AutoModelSlabBlueprint[]
  guides?: AutoModelGuideBlueprint[]
  metadata?: Record<string, unknown>
}

export interface AutoModelBlueprint {
  version?: '1.0'
  name?: string
  units?: AutoModelUnits
  site?: {
    name?: string
    polygon?: Point2D[]
    metadata?: Record<string, unknown>
  }
  building?: {
    name?: string
    metadata?: Record<string, unknown>
  }
  levels: AutoModelLevelBlueprint[]
}

export interface AutoModelImportOptions {
  name?: string
  units?: AutoModelUnits
  scaleToMeters?: number
  defaultWallThickness?: number
  defaultWallHeight?: number
  defaultGuideOpacity?: number
  defaultGuideWidthMeters?: number
  attachReferenceGuide?: boolean
  sitePadding?: number
}

const DEFAULT_LEVEL_KEY = 'level-0'
const DEFAULT_SITE_PADDING = 1
const DEFAULT_GUIDE_WIDTH_METERS = 20

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const getUnitsScale = (units: AutoModelUnits | undefined): number => {
  switch (units) {
    case 'mm':
      return 0.001
    case 'cm':
      return 0.01
    case 'm':
    default:
      return 1
  }
}

const roundPoint = ([x, y]: Point2D, precision = 1000): Point2D => {
  return [Math.round(x * precision) / precision, Math.round(y * precision) / precision]
}

const pointKey = ([x, y]: Point2D): string => `${x.toFixed(4)},${y.toFixed(4)}`

const dedupePolygon = (points: Point2D[]): Point2D[] => {
  const normalized = points.map((point) => roundPoint(point))
  const next: Point2D[] = []

  for (const point of normalized) {
    const previous = next[next.length - 1]
    if (previous && pointKey(previous) === pointKey(point)) {
      continue
    }
    next.push(point)
  }

  if (next.length > 2 && pointKey(next[0]!) === pointKey(next[next.length - 1]!)) {
    next.pop()
  }

  return next
}

const toDataUrl = (svgText: string): string => {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`
}

const computeBounds = (points: Point2D[]) => {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const [x, y] of points) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

const getAllBlueprintPoints = (blueprint: AutoModelBlueprint): Point2D[] => {
  const points: Point2D[] = []

  if (blueprint.site?.polygon) {
    points.push(...blueprint.site.polygon)
  }

  for (const level of blueprint.levels) {
    for (const wall of level.walls) {
      points.push(wall.start, wall.end)
    }
    for (const zone of level.zones ?? []) {
      points.push(...zone.polygon)
    }
    for (const slab of level.slabs ?? []) {
      points.push(...slab.polygon)
    }
  }

  return points
}

const getAllSceneGraphPoints = (sceneGraph: SceneGraph): Point2D[] => {
  const points: Point2D[] = []

  for (const node of Object.values(sceneGraph.nodes) as Record<string, unknown>[]) {
    if (!isRecord(node)) continue

    if (node.type === 'site' && isRecord(node.polygon) && Array.isArray(node.polygon.points)) {
      points.push(...(node.polygon.points as Point2D[]))
    }

    if (node.type === 'wall' && Array.isArray(node.start) && Array.isArray(node.end)) {
      points.push(node.start as Point2D, node.end as Point2D)
    }

    if ((node.type === 'zone' || node.type === 'slab') && Array.isArray(node.polygon)) {
      points.push(...(node.polygon as Point2D[]))
    }
  }

  return points
}

const createBoundingPolygon = (points: Point2D[], padding = DEFAULT_SITE_PADDING): Point2D[] => {
  if (points.length === 0) {
    return [
      [-15, -15],
      [15, -15],
      [15, 15],
      [-15, 15],
    ]
  }

  const bounds = computeBounds(points)
  return dedupePolygon([
    [bounds.minX - padding, bounds.minY - padding],
    [bounds.maxX + padding, bounds.minY - padding],
    [bounds.maxX + padding, bounds.maxY + padding],
    [bounds.minX - padding, bounds.maxY + padding],
  ])
}

const normalizeSvgPoint = (
  point: Point2D,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  scale: number,
): Point2D => {
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2
  return roundPoint([(point[0] - centerX) * scale, (centerY - point[1]) * scale])
}

const tokenizePath = (pathData: string): string[] => {
  return pathData
    .replace(/,/g, ' ')
    .match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? []
}

const parseSvgPath = (pathData: string): { points: Point2D[]; closed: boolean } => {
  const tokens = tokenizePath(pathData)
  const points: Point2D[] = []
  let index = 0
  let command = ''
  let current: Point2D = [0, 0]
  let start: Point2D | null = null
  let closed = false

  const readNumber = () => Number(tokens[index++] ?? 0)

  while (index < tokens.length) {
    const token = tokens[index]!
    if (/^[a-zA-Z]$/.test(token)) {
      command = token
      index += 1
      if (command === 'Z' || command === 'z') {
        closed = true
        if (start) {
          points.push(start)
          current = start
        }
        continue
      }
    }

    switch (command) {
      case 'M':
      case 'L': {
        const x = readNumber()
        const y = readNumber()
        current = [x, y]
        points.push(current)
        if (!start) start = current
        if (command === 'M') command = 'L'
        break
      }
      case 'm':
      case 'l': {
        const x = current[0] + readNumber()
        const y = current[1] + readNumber()
        current = [x, y]
        points.push(current)
        if (!start) start = current
        if (command === 'm') command = 'l'
        break
      }
      case 'H': {
        current = [readNumber(), current[1]]
        points.push(current)
        break
      }
      case 'h': {
        current = [current[0] + readNumber(), current[1]]
        points.push(current)
        break
      }
      case 'V': {
        current = [current[0], readNumber()]
        points.push(current)
        break
      }
      case 'v': {
        current = [current[0], current[1] + readNumber()]
        points.push(current)
        break
      }
      case 'C':
      case 'S':
      case 'Q':
      case 'T':
      case 'A': {
        const stride = command === 'A' ? 7 : command === 'C' ? 6 : command === 'S' ? 4 : 4
        const values = Array.from({ length: stride }, () => readNumber())
        current = [values[stride - 2]!, values[stride - 1]!]
        points.push(current)
        break
      }
      case 'c':
      case 's':
      case 'q':
      case 't':
      case 'a': {
        const stride = command === 'a' ? 7 : command === 'c' ? 6 : command === 's' ? 4 : 4
        const values = Array.from({ length: stride }, () => readNumber())
        current = [current[0] + values[stride - 2]!, current[1] + values[stride - 1]!]
        points.push(current)
        break
      }
      default: {
        index += 1
        break
      }
    }
  }

  return { points: dedupePolygon(points), closed }
}

const parsePointsAttribute = (value: string): Point2D[] => {
  const numbers = value.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/g)?.map(Number) ?? []
  const points: Point2D[] = []

  for (let index = 0; index < numbers.length - 1; index += 2) {
    points.push([numbers[index]!, numbers[index + 1]!])
  }

  return dedupePolygon(points)
}

const inferRole = (element: Element, inheritedRole: RawGeometry['role'] | null) => {
  const roleHint = [
    element.getAttribute('data-pascal-role'),
    element.getAttribute('data-pascal-layer'),
    element.getAttribute('inkscape:label'),
    element.getAttribute('id'),
    element.getAttribute('class'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (roleHint.includes('wall')) return 'wall'
  if (roleHint.includes('zone') || roleHint.includes('room') || roleHint.includes('space')) {
    return 'zone'
  }
  if (roleHint.includes('slab') || roleHint.includes('floor')) return 'slab'
  if (roleHint.includes('site') || roleHint.includes('parcel') || roleHint.includes('property')) {
    return 'site'
  }

  return inheritedRole
}

const inferLevelKey = (element: Element, inheritedLevelKey: string) => {
  const levelHint = [
    element.getAttribute('data-level'),
    element.getAttribute('data-pascal-level'),
    element.getAttribute('inkscape:label'),
    element.getAttribute('id'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const match = levelHint.match(/(?:level|floor|storey|story)[\s_-]*([\w]+)/i)
  if (match?.[1]) {
    return `level-${match[1]}`
  }

  return inheritedLevelKey
}

const parseGeometryFromElement = (element: Element): { points: Point2D[]; closed: boolean } | null => {
  switch (element.tagName.toLowerCase()) {
    case 'line':
      return {
        points: [
          [Number(element.getAttribute('x1') ?? 0), Number(element.getAttribute('y1') ?? 0)],
          [Number(element.getAttribute('x2') ?? 0), Number(element.getAttribute('y2') ?? 0)],
        ],
        closed: false,
      }
    case 'polyline':
      return {
        points: parsePointsAttribute(element.getAttribute('points') ?? ''),
        closed: false,
      }
    case 'polygon':
      return {
        points: parsePointsAttribute(element.getAttribute('points') ?? ''),
        closed: true,
      }
    case 'rect': {
      const x = Number(element.getAttribute('x') ?? 0)
      const y = Number(element.getAttribute('y') ?? 0)
      const width = Number(element.getAttribute('width') ?? 0)
      const height = Number(element.getAttribute('height') ?? 0)
      return {
        points: dedupePolygon([
          [x, y],
          [x + width, y],
          [x + width, y + height],
          [x, y + height],
        ]),
        closed: true,
      }
    }
    case 'path':
      return parseSvgPath(element.getAttribute('d') ?? '')
    default:
      return null
  }
}

const extractSvgGeometries = (svgRoot: Element) => {
  const geometries: RawGeometry[] = []
  let syntheticId = 0

  const walk = (
    element: Element,
    inheritedRole: RawGeometry['role'] | null,
    inheritedLevelKey: string,
  ) => {
    const role = inferRole(element, inheritedRole)
    const levelKey = inferLevelKey(element, inheritedLevelKey)
    const geometry = parseGeometryFromElement(element)

    if (role && geometry && geometry.points.length >= 2) {
      geometries.push({
        id: element.getAttribute('id') ?? `${role}-${syntheticId++}`,
        role,
        levelKey,
        points: geometry.points,
        closed: geometry.closed,
        strokeWidth: Number(element.getAttribute('stroke-width') ?? Number.NaN),
        label: element.getAttribute('data-name') ?? element.getAttribute('aria-label') ?? undefined,
      })
    }

    for (const child of Array.from(element.children)) {
      walk(child, role, levelKey)
    }
  }

  walk(svgRoot, null, DEFAULT_LEVEL_KEY)
  return geometries
}

const buildBlueprintFromSvgGeometries = (
  geometries: RawGeometry[],
  svgText: string,
  options: AutoModelImportOptions = {},
): AutoModelBlueprint => {
  const units = options.units ?? 'mm'
  const scale = options.scaleToMeters ?? getUnitsScale(units)
  const allPoints = geometries.flatMap((geometry) => geometry.points)
  const bounds = computeBounds(allPoints)
  const levelMap = new Map<string, AutoModelLevelBlueprint>()
  const defaultWallThickness = options.defaultWallThickness ?? DEFAULT_WALL_THICKNESS
  const defaultWallHeight = options.defaultWallHeight ?? DEFAULT_WALL_HEIGHT
  const attachReferenceGuide = options.attachReferenceGuide ?? true
  const sitePadding = options.sitePadding ?? DEFAULT_SITE_PADDING

  const ensureLevel = (levelKey: string) => {
    const existing = levelMap.get(levelKey)
    if (existing) return existing

    const created: AutoModelLevelBlueprint = {
      name: levelKey === DEFAULT_LEVEL_KEY ? 'Level 1' : levelKey.replace(/^level-/, 'Level '),
      level: levelMap.size,
      walls: [],
      zones: [],
      slabs: [],
      guides: [],
      metadata: {
        sourceLevelKey: levelKey,
      },
    }
    levelMap.set(levelKey, created)
    return created
  }

  const wallKeys = new Set<string>()
  let explicitSitePolygon: Point2D[] | undefined

  for (const geometry of geometries) {
    const points = geometry.points.map((point) => normalizeSvgPoint(point, bounds, scale))

    if (geometry.role === 'site' && geometry.closed) {
      explicitSitePolygon = dedupePolygon(points)
      continue
    }

    const level = ensureLevel(geometry.levelKey)

    if (geometry.role === 'wall') {
      for (let index = 0; index < points.length - 1; index += 1) {
        const start = points[index]!
        const end = points[index + 1]!
        const key = [pointKey(start), pointKey(end)].sort().join('|')
        if (wallKeys.has(key) || pointKey(start) === pointKey(end)) {
          continue
        }
        wallKeys.add(key)
        level.walls.push({
          id: geometry.id,
          name: geometry.label,
          start,
          end,
          thickness: Number.isFinite(geometry.strokeWidth)
            ? Math.max(defaultWallThickness, geometry.strokeWidth! * scale)
            : defaultWallThickness,
          height: defaultWallHeight,
          metadata: {
            sourceElementId: geometry.id,
            sourceLevelKey: geometry.levelKey,
          },
        })
      }
      if (geometry.closed && points.length > 2) {
        const start = points[points.length - 1]!
        const end = points[0]!
        const key = [pointKey(start), pointKey(end)].sort().join('|')
        if (!wallKeys.has(key) && pointKey(start) !== pointKey(end)) {
          wallKeys.add(key)
          level.walls.push({
            id: `${geometry.id}-closing`,
            name: geometry.label,
            start,
            end,
            thickness: Number.isFinite(geometry.strokeWidth)
              ? Math.max(defaultWallThickness, geometry.strokeWidth! * scale)
              : defaultWallThickness,
            height: defaultWallHeight,
            metadata: {
              sourceElementId: geometry.id,
              sourceLevelKey: geometry.levelKey,
              syntheticClosingEdge: true,
            },
          })
        }
      }
      continue
    }

    if (geometry.closed && points.length >= 3 && geometry.role === 'zone') {
      level.zones?.push({
        id: geometry.id,
        name: geometry.label ?? `Zone ${level.zones!.length + 1}`,
        polygon: dedupePolygon(points),
        metadata: {
          sourceElementId: geometry.id,
          sourceLevelKey: geometry.levelKey,
        },
      })
      continue
    }

    if (geometry.closed && points.length >= 3 && geometry.role === 'slab') {
      level.slabs?.push({
        id: geometry.id,
        name: geometry.label ?? `Slab ${level.slabs!.length + 1}`,
        polygon: dedupePolygon(points),
        metadata: {
          sourceElementId: geometry.id,
          sourceLevelKey: geometry.levelKey,
        },
      })
    }
  }

  const sitePolygon = explicitSitePolygon ?? [
    [bounds.minX * scale - sitePadding, -bounds.minY * scale - sitePadding],
    [bounds.maxX * scale + sitePadding, -bounds.minY * scale - sitePadding],
    [bounds.maxX * scale + sitePadding, -bounds.maxY * scale + sitePadding],
    [bounds.minX * scale - sitePadding, -bounds.maxY * scale + sitePadding],
  ]

  if (attachReferenceGuide) {
    const widthMeters = Math.max((bounds.width || 10) * scale, 1)
    const guide = {
      name: options.name ? `${options.name} Reference` : 'Reference Guide',
      url: toDataUrl(svgText),
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: widthMeters / 10,
      opacity: options.defaultGuideOpacity ?? 55,
      metadata: {
        sourceType: 'svg',
      },
    }

    for (const level of levelMap.values()) {
      level.guides?.push(guide)
    }
  }

  const levels = Array.from(levelMap.values()).sort((left, right) => left.level - right.level)
  return {
    version: '1.0',
    name: options.name,
    units: 'm',
    site: {
      name: options.name ? `${options.name} Site` : 'Imported Site',
      polygon: dedupePolygon(sitePolygon),
      metadata: {
        sourceType: 'svg',
      },
    },
    building: {
      name: options.name ? `${options.name} Building` : 'Imported Building',
      metadata: {
        sourceType: 'svg',
      },
    },
    levels,
  }
}

export function parseAutoModelingSvg(
  svgText: string,
  options: AutoModelImportOptions = {},
): AutoModelBlueprint {
  if (typeof DOMParser === 'undefined') {
    throw new Error('SVG parsing requires a browser environment with DOMParser.')
  }

  const document = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const parserError = document.querySelector('parsererror')
  if (parserError) {
    throw new Error('The SVG reference file could not be parsed.')
  }

  const root = document.documentElement
  const geometries = extractSvgGeometries(root)
  if (geometries.length === 0) {
    throw new Error(
      'No usable geometry was found. Export CAD to SVG with layers named wall, zone, slab, or site.',
    )
  }

  return buildBlueprintFromSvgGeometries(geometries, svgText, options)
}

export function parseAutoModelingBlueprintJson(jsonText: string): AutoModelBlueprint {
  const parsed = JSON.parse(jsonText) as unknown

  if (isRecord(parsed) && Array.isArray(parsed.levels)) {
    return parsed as unknown as AutoModelBlueprint
  }

  if (isRecord(parsed) && Array.isArray(parsed.walls)) {
    return {
      version: '1.0',
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      units: (parsed.units as AutoModelUnits | undefined) ?? 'm',
      site: isRecord(parsed.site)
        ? {
            name: typeof parsed.site.name === 'string' ? parsed.site.name : undefined,
            polygon: Array.isArray(parsed.site.polygon)
              ? (parsed.site.polygon as Point2D[])
              : undefined,
            metadata: isRecord(parsed.site.metadata)
              ? (parsed.site.metadata as Record<string, unknown>)
              : undefined,
          }
        : undefined,
      building: isRecord(parsed.building)
        ? {
            name: typeof parsed.building.name === 'string' ? parsed.building.name : undefined,
            metadata: isRecord(parsed.building.metadata)
              ? (parsed.building.metadata as Record<string, unknown>)
              : undefined,
          }
        : undefined,
      levels: [
        {
          name: typeof parsed.levelName === 'string' ? parsed.levelName : 'Level 1',
          level: Number.isFinite(parsed.level) ? Number(parsed.level) : 0,
          walls: parsed.walls as AutoModelWallBlueprint[],
          zones: Array.isArray(parsed.zones)
            ? (parsed.zones as AutoModelZoneBlueprint[])
            : undefined,
          slabs: Array.isArray(parsed.slabs)
            ? (parsed.slabs as AutoModelSlabBlueprint[])
            : undefined,
          guides: Array.isArray(parsed.guides)
            ? (parsed.guides as AutoModelGuideBlueprint[])
            : undefined,
          metadata: isRecord(parsed.metadata)
            ? (parsed.metadata as Record<string, unknown>)
            : undefined,
        },
      ],
    }
  }

  throw new Error(
    'Unsupported JSON format. Provide a Pascal SceneGraph JSON, a blueprint with levels, or a loose layout JSON with walls.',
  )
}

const isSceneGraphLike = (value: unknown): value is SceneGraph => {
  return isRecord(value) && isRecord(value.nodes) && Array.isArray(value.rootNodeIds)
}

const normalizeSceneGraph = (sceneGraph: SceneGraph): SceneGraph => {
  const nodes = Object.fromEntries(
    Object.entries(sceneGraph.nodes).map(([id, node]) => [id, { ...(node as Record<string, unknown>) }]),
  ) as Record<string, Record<string, unknown>>

  let rootNodeIds = Array.isArray(sceneGraph.rootNodeIds) ? [...sceneGraph.rootNodeIds] : []
  if (rootNodeIds.length === 0) {
    rootNodeIds = Object.values(nodes)
      .filter((node) => node.parentId == null)
      .map((node) => String(node.id))
  }

  for (const node of Object.values(nodes)) {
    if (node.type === 'building' && Array.isArray(node.children)) {
      for (const childId of node.children) {
        const child = nodes[String(childId)]
        if (child) child.parentId = node.id
      }
    }

    if (node.type === 'level' && Array.isArray(node.children)) {
      for (const childId of node.children) {
        const child = nodes[String(childId)]
        if (child) child.parentId = node.id
      }
    }
  }

  let siteRoot =
    rootNodeIds
      .map((id) => nodes[id])
      .find((node): node is Record<string, unknown> => node?.type === 'site') ?? null
  let buildingRoots = rootNodeIds
    .map((id) => nodes[id])
    .filter((node): node is Record<string, unknown> => node?.type === 'building')
  let levelRoots = rootNodeIds
    .map((id) => nodes[id])
    .filter((node): node is Record<string, unknown> => node?.type === 'level')

  if (!siteRoot && buildingRoots.length === 0 && levelRoots.length > 0) {
    const building = BuildingNode.parse({
      name: 'Imported Building',
      children: levelRoots.map((node) => String(node.id)),
      metadata: {
        sourceType: 'scene-graph-normalized',
      },
    })

    nodes[building.id] = building as unknown as Record<string, unknown>
    for (const level of levelRoots) {
      level.parentId = building.id
    }
    buildingRoots = [nodes[building.id]!]
    levelRoots = []
    rootNodeIds = [building.id]
  }

  if (!siteRoot && buildingRoots.length > 0) {
    const points = getAllSceneGraphPoints({ nodes, rootNodeIds })
    const site = SiteNode.parse({
      name: 'Imported Site',
      polygon: {
        type: 'polygon',
        points: createBoundingPolygon(points),
      },
        children: buildingRoots as unknown as Array<Record<string, unknown>>,
      metadata: {
        sourceType: 'scene-graph-normalized',
      },
    }) as SiteNodeType

    nodes[site.id] = site as unknown as Record<string, unknown>
    for (const buildingNode of buildingRoots) {
      buildingNode.parentId = site.id
    }
    siteRoot = nodes[site.id] ?? null
    rootNodeIds = [site.id]
  }

  if (siteRoot?.type === 'site') {
    rootNodeIds = [String(siteRoot.id)]
  }

  return {
    nodes,
    rootNodeIds,
  }
}

const getImageSize = async (file: File): Promise<{ width: number; height: number; url: string }> => {
  const url = URL.createObjectURL(file)

  try {
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => {
        resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height })
      }
      image.onerror = () => reject(new Error('The floorplan image could not be loaded.'))
      image.src = url
    })

    return { ...size, url }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

export async function buildGuideSceneGraphFromImageFile(
  file: File,
  options: AutoModelImportOptions = {},
): Promise<SceneGraph> {
  const { width, url } = await getImageSize(file)
  const guideWidthMeters = options.defaultGuideWidthMeters ?? DEFAULT_GUIDE_WIDTH_METERS
  const guide = GuideNode.parse({
    name: file.name.replace(/\.[^.]+$/, ''),
    url,
    opacity: options.defaultGuideOpacity ?? 60,
    scale: guideWidthMeters / 10,
    metadata: {
      sourceType: 'image-guide',
      imageWidth: width,
      fileName: file.name,
    },
  })

  const level = LevelNode.parse({
    name: 'Level 1',
    level: 0,
    children: [guide.id],
    metadata: {
      sourceType: 'image-guide',
    },
  })

  const building = BuildingNode.parse({
    name: options.name ? `${options.name} Building` : 'Imported Building',
    children: [level.id],
    metadata: {
      sourceType: 'image-guide',
    },
  })

  const site = SiteNode.parse({
    name: options.name ? `${options.name} Site` : 'Imported Site',
    polygon: {
      type: 'polygon',
      points: createBoundingPolygon(
        [
          [-guideWidthMeters / 2, -guideWidthMeters / 2],
          [guideWidthMeters / 2, guideWidthMeters / 2],
        ],
        4,
      ),
    },
    children: [building],
    metadata: {
      sourceType: 'image-guide',
    },
  }) as SiteNodeType

  return {
    nodes: {
      [site.id]: site,
      [building.id]: {
        ...building,
        parentId: site.id,
      },
      [level.id]: {
        ...level,
        parentId: building.id,
      },
      [guide.id]: {
        ...guide,
        parentId: level.id,
      },
    },
    rootNodeIds: [site.id],
  }
}

export async function buildScanSceneGraphFromModelFile(
  file: File,
  options: AutoModelImportOptions = {},
): Promise<SceneGraph> {
  const url = URL.createObjectURL(file)
  const scan = ScanNode.parse({
    name: file.name.replace(/\.[^.]+$/, ''),
    url,
    opacity: 100,
    scale: 1,
    metadata: {
      sourceType: 'scan-model',
      fileName: file.name,
    },
  })

  const level = LevelNode.parse({
    name: 'Level 1',
    level: 0,
    children: [scan.id],
    metadata: {
      sourceType: 'scan-model',
    },
  })

  const building = BuildingNode.parse({
    name: options.name ? `${options.name} Building` : 'Imported Building',
    children: [level.id],
    metadata: {
      sourceType: 'scan-model',
    },
  })

  const site = SiteNode.parse({
    name: options.name ? `${options.name} Site` : 'Imported Site',
    polygon: {
      type: 'polygon',
      points: createBoundingPolygon(
        [
          [-15, -15],
          [15, 15],
        ],
        8,
      ),
    },
    children: [building],
    metadata: {
      sourceType: 'scan-model',
    },
  }) as SiteNodeType

  return {
    nodes: {
      [site.id]: site,
      [building.id]: {
        ...building,
        parentId: site.id,
      },
      [level.id]: {
        ...level,
        parentId: building.id,
      },
      [scan.id]: {
        ...scan,
        parentId: level.id,
      },
    },
    rootNodeIds: [site.id],
  }
}

export function generateSceneGraphFromBlueprint(
  blueprint: AutoModelBlueprint,
  options: AutoModelImportOptions = {},
): SceneGraph {
  const defaultWallHeight = options.defaultWallHeight ?? DEFAULT_WALL_HEIGHT
  const defaultWallThickness = options.defaultWallThickness ?? DEFAULT_WALL_THICKNESS
  const blueprintPoints = getAllBlueprintPoints(blueprint)
  const fallbackPolygon: Point2D[] = blueprintPoints.length
    ? dedupePolygon([
        [computeBounds(blueprintPoints).minX - 1, computeBounds(blueprintPoints).minY - 1],
        [computeBounds(blueprintPoints).maxX + 1, computeBounds(blueprintPoints).minY - 1],
        [computeBounds(blueprintPoints).maxX + 1, computeBounds(blueprintPoints).maxY + 1],
        [computeBounds(blueprintPoints).minX - 1, computeBounds(blueprintPoints).maxY + 1],
      ])
    : [
        [-15, -15],
        [15, -15],
        [15, 15],
        [-15, 15],
      ]

  const levels = blueprint.levels
    .slice()
    .sort((left, right) => left.level - right.level)
    .map((levelBlueprint) => LevelNode.parse({
      name: levelBlueprint.name,
      level: levelBlueprint.level,
      children: [],
      metadata: levelBlueprint.metadata ?? {},
    }))

  const building = BuildingNode.parse({
    name: blueprint.building?.name,
    children: levels.map((level) => level.id),
    metadata: blueprint.building?.metadata ?? {},
  })

  const site = SiteNode.parse({
    name: blueprint.site?.name,
    polygon: {
      type: 'polygon',
      points: dedupePolygon(blueprint.site?.polygon ?? fallbackPolygon),
    },
    children: [building],
    metadata: blueprint.site?.metadata ?? {},
  }) as SiteNodeType

  const nodes: SceneGraph['nodes'] = {
    [site.id]: site,
    [building.id]: {
      ...building,
      parentId: site.id,
    },
  }

  levels.forEach((level, index) => {
    const levelBlueprint = blueprint.levels
      .slice()
      .sort((left, right) => left.level - right.level)[index]!
    const levelNode = {
      ...level,
      parentId: building.id,
      children: [] as string[],
    }

    for (const wallBlueprint of levelBlueprint.walls) {
      const wall = WallNode.parse({
        name: wallBlueprint.name,
        start: roundPoint(wallBlueprint.start),
        end: roundPoint(wallBlueprint.end),
        thickness: wallBlueprint.thickness ?? defaultWallThickness,
        height: wallBlueprint.height ?? defaultWallHeight,
        metadata: wallBlueprint.metadata ?? {},
      })
      nodes[wall.id] = {
        ...wall,
        parentId: levelNode.id,
      }
      levelNode.children.push(wall.id)
    }

    for (const slabBlueprint of levelBlueprint.slabs ?? []) {
      const polygon = dedupePolygon(slabBlueprint.polygon)
      if (polygon.length < 3) continue
      const slab = SlabNode.parse({
        name: slabBlueprint.name,
        polygon,
        elevation: slabBlueprint.elevation ?? 0.05,
        metadata: slabBlueprint.metadata ?? {},
      })
      nodes[slab.id] = {
        ...slab,
        parentId: levelNode.id,
      }
      levelNode.children.push(slab.id)
    }

    for (const zoneBlueprint of levelBlueprint.zones ?? []) {
      const polygon = dedupePolygon(zoneBlueprint.polygon)
      if (polygon.length < 3) continue
      const zone = ZoneNode.parse({
        name: zoneBlueprint.name,
        polygon,
        color: zoneBlueprint.color,
        metadata: zoneBlueprint.metadata ?? {},
      })
      nodes[zone.id] = {
        ...zone,
        parentId: levelNode.id,
      }
      levelNode.children.push(zone.id)
    }

    for (const guideBlueprint of levelBlueprint.guides ?? []) {
      const guide = GuideNode.parse({
        name: guideBlueprint.name,
        url: guideBlueprint.url,
        position: guideBlueprint.position,
        rotation: guideBlueprint.rotation,
        scale: guideBlueprint.scale,
        opacity: guideBlueprint.opacity,
        metadata: guideBlueprint.metadata ?? {},
      })
      nodes[guide.id] = {
        ...guide,
        parentId: levelNode.id,
      }
      levelNode.children.push(guide.id)
    }

    nodes[levelNode.id] = levelNode
  })

  return {
    nodes,
    rootNodeIds: [site.id],
  }
}

export function buildSceneGraphFromReferenceText(
  referenceText: string,
  format: 'svg' | 'json',
  options: AutoModelImportOptions = {},
): SceneGraph {
  if (format === 'json') {
    const parsed = JSON.parse(referenceText) as unknown
    if (isSceneGraphLike(parsed)) {
      return normalizeSceneGraph(parsed)
    }

    const blueprint = parseAutoModelingBlueprintJson(referenceText)
    return generateSceneGraphFromBlueprint(blueprint, options)
  }

  const blueprint = parseAutoModelingSvg(referenceText, options)
  return generateSceneGraphFromBlueprint(blueprint, options)
}

export async function buildSceneGraphFromReferenceFile(
  file: File,
  options: AutoModelImportOptions = {},
): Promise<SceneGraph> {
  const lowerName = file.name.toLowerCase()

  if (lowerName.endsWith('.svg')) {
    const text = await file.text()
    return buildSceneGraphFromReferenceText(text, 'svg', {
      ...options,
      name: options.name ?? file.name.replace(/\.[^.]+$/, ''),
    })
  }

  if (lowerName.endsWith('.json')) {
    const text = await file.text()
    return buildSceneGraphFromReferenceText(text, 'json', {
      ...options,
      name: options.name ?? file.name.replace(/\.[^.]+$/, ''),
    })
  }

  if (/(\.png|\.jpg|\.jpeg|\.webp)$/i.test(lowerName)) {
    return buildGuideSceneGraphFromImageFile(file, {
      ...options,
      name: options.name ?? file.name.replace(/\.[^.]+$/, ''),
    })
  }

  if (/(\.glb|\.gltf)$/i.test(lowerName)) {
    return buildScanSceneGraphFromModelFile(file, {
      ...options,
      name: options.name ?? file.name.replace(/\.[^.]+$/, ''),
    })
  }

  throw new Error(
    'Unsupported reference file. Please provide an SVG, JSON, GLB, GLTF, PNG, JPG, JPEG, or WEBP resource.',
  )
}