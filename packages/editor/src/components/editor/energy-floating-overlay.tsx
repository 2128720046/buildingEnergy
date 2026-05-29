'use client'

import {
  type AnyNodeId,
  type ItemNode,
  sceneRegistry,
  useScene,
  type ZoneNode,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import useEditor from '../../store/use-editor'

const FLOATING_CARD_WIDTH = 332
const FLOATING_CARD_MIN_WIDTH = 248
const FLOATING_CARD_MAX_WIDTH = 360
const PANEL_RIGHT_GAP = 16
const PANEL_DEFAULT_WIDTH = 320
const PANEL_SAFE_GAP = 14
const VIEWPORT_SAFE_GAP = 12

function parseCssPixelValue(value: string | null): number {
  if (!value) return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getEditorPanelLeftBoundary(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Number.POSITIVE_INFINITY
  }
  const rootStyle = window.getComputedStyle(document.documentElement)
  const panelAvoidRight = parseCssPixelValue(
    rootStyle.getPropertyValue('--host-editor-panel-avoid-right'),
  )
  const panelVisible = parseCssPixelValue(rootStyle.getPropertyValue('--host-editor-panel-visible'))
  const panelWidth =
    panelVisible > 0
      ? parseCssPixelValue(rootStyle.getPropertyValue('--host-editor-panel-width')) ||
        PANEL_DEFAULT_WIDTH
      : 0
  return window.innerWidth - (PANEL_RIGHT_GAP + panelAvoidRight + panelWidth)
}

type EnergyOverlaySnapshot = {
  title: string
  monitorTime: string
  energyMetrics: Array<{ label: string; value: number; unit: string }>
  environmentMetrics: Array<{ label: string; value: number; unit: string }>
}

type ItemEnergyProfile = {
  isElectrical: boolean
  hasHvac: boolean
  hasWater: boolean
}

function resolveItemEnergyProfile(itemNode: ItemNode): ItemEnergyProfile {
  const category = itemNode.asset?.category?.toLowerCase() ?? ''
  const name = (itemNode.name ?? '').toLowerCase()
  const tags = Array.isArray(itemNode.asset?.tags)
    ? itemNode.asset.tags.join(' ').toLowerCase()
    : ''
  const searchable = `${category} ${name} ${tags}`
  const hasHvac = /(air[-\s]?condition|\bac\b|hvac|fan|heater|thermostat|vent)/.test(searchable)
  const hasWater = /(sink|bath|shower|toilet|wash|dishwasher|water|coffee|humidifier|faucet)/.test(
    searchable,
  )
  const hasInteractiveControl =
    Array.isArray(itemNode.asset?.interactive?.controls) &&
    itemNode.asset.interactive.controls.length > 0
  const looksElectrical =
    /(appliance|electrical|electric|electronics|device|equipment|lamp|light|computer|tv|screen|monitor|fridge|refrigerator|oven|microwave|stove|machine|keypad|alarm|charger|socket|switch|air|conditioner)/.test(
      searchable,
    )
  const looksFurniture =
    /(sofa|couch|chair|table|bed|bookshelf|book|plant|bush|cactus|door|window|column|rug|bean|bag|barbell|basket|toy|closet|dresser|cabinet)/.test(
      searchable,
    )
  const isElectrical =
    hasHvac || hasWater || hasInteractiveControl || (looksElectrical && !looksFurniture)
  return { isElectrical, hasHvac, hasWater }
}

function shouldRenderEnergyCardForItem(itemNode: ItemNode): boolean {
  return resolveItemEnergyProfile(itemNode).isElectrical
}

function pointInPolygon(point: [number, number], polygon: Array<[number, number]>): boolean {
  const [px, pz] = point
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]!
    const [xj, zj] = polygon[j]!
    const intersects = zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi
    if (intersects) inside = !inside
  }

  return inside
}

function resolveItemZone(itemNode: ItemNode, nodes: Record<string, unknown>): ZoneNode | null {
  let parent = itemNode.parentId ? nodes[itemNode.parentId] : null
  while (parent && typeof parent === 'object' && 'type' in parent) {
    if ((parent as { type?: string }).type === 'zone') return parent as ZoneNode
    const parentId = (parent as { parentId?: string | null }).parentId
    parent = parentId ? nodes[parentId] : null
  }

  let levelId: string | null = itemNode.parentId ?? null
  let cursor = levelId ? nodes[levelId] : null
  while (cursor && typeof cursor === 'object' && 'type' in cursor) {
    if ((cursor as { type?: string }).type === 'level') {
      levelId = (cursor as unknown as { id: string }).id
      break
    }
    const parentId = (cursor as { parentId?: string | null }).parentId
    cursor = parentId ? nodes[parentId] : null
  }

  const [x, , z] = itemNode.position
  const zones = Object.values(nodes).filter((node): node is ZoneNode =>
    Boolean(
      node &&
        typeof node === 'object' &&
        'type' in node &&
        node.type === 'zone' &&
        Array.isArray((node as ZoneNode).polygon) &&
        (node as ZoneNode).polygon.length >= 3 &&
        (!levelId || (node as ZoneNode).parentId === levelId),
    ),
  )

  return zones.find((zone) => pointInPolygon([x, z], zone.polygon)) ?? zones[0] ?? null
}

// ---- 内联模拟引擎（与 apps/editor 同源算法） ----

function polyArea(p: Array<[number, number]>): number {
  let area = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, z1] = p[i]!
    const [x2, z2] = p[(i + 1) % p.length]!
    area += x1 * z2 - x2 * z1
  }
  return Math.abs(area) / 2
}

function seeded01(input: string, offset: number): number {
  let h = offset
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) % 100003
  return (h % 10000) / 10000
}

const RT_BASE: Record<string, { e: number; hvac: number; light: number }> = {
  office: { e: 0.055, hvac: 0.022, light: 0.015 },
  corridor: { e: 0.025, hvac: 0.006, light: 0.012 },
  server: { e: 0.35, hvac: 0.14, light: 0.008 },
  restroom: { e: 0.028, hvac: 0.005, light: 0.01 },
  lobby: { e: 0.042, hvac: 0.018, light: 0.018 },
  meeting: { e: 0.065, hvac: 0.026, light: 0.016 },
  storage: { e: 0.015, hvac: 0.003, light: 0.005 },
  mixed: { e: 0.04, hvac: 0.014, light: 0.012 },
}

function classifyRt(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('office') || n.includes('办公')) return 'office'
  if (n.includes('corridor') || n.includes('走廊') || n.includes('走道')) return 'corridor'
  if (n.includes('server') || n.includes('机房') || n.includes('设备')) return 'server'
  if (n.includes('restroom') || n.includes('卫生') || n.includes('洗手间')) return 'restroom'
  if (n.includes('lobby') || n.includes('大堂') || n.includes('大厅')) return 'lobby'
  if (n.includes('meeting') || n.includes('会议')) return 'meeting'
  if (n.includes('storage') || n.includes('仓库')) return 'storage'
  return 'mixed'
}

const HOUR_MULT: Record<string, number[]> = {
  office: [
    0.18, 0.16, 0.14, 0.13, 0.15, 0.18, 0.35, 0.65, 0.95, 1, 0.9, 0.55, 0.48, 0.85, 0.98, 0.92,
    0.88, 0.72, 0.48, 0.32, 0.24, 0.2, 0.18, 0.16,
  ],
  corridor: [
    0.3, 0.28, 0.26, 0.25, 0.25, 0.28, 0.45, 0.7, 0.9, 0.95, 0.88, 0.6, 0.52, 0.82, 0.92, 0.88,
    0.85, 0.72, 0.5, 0.38, 0.32, 0.28, 0.26, 0.25,
  ],
  server: [
    0.92, 0.92, 0.92, 0.92, 0.92, 0.93, 0.94, 0.95, 1, 1, 1, 0.96, 0.94, 0.98, 1, 1, 0.98, 0.95,
    0.94, 0.93, 0.92, 0.92, 0.92, 0.92,
  ],
  restroom: [
    0.15, 0.13, 0.12, 0.12, 0.14, 0.22, 0.45, 0.7, 0.9, 0.95, 0.88, 0.62, 0.55, 0.82, 0.92, 0.88,
    0.85, 0.72, 0.48, 0.35, 0.28, 0.22, 0.18, 0.15,
  ],
  lobby: [
    0.2, 0.18, 0.16, 0.15, 0.18, 0.28, 0.5, 0.72, 0.95, 0.98, 0.9, 0.65, 0.55, 0.85, 0.95, 0.9,
    0.88, 0.75, 0.55, 0.42, 0.35, 0.28, 0.22, 0.18,
  ],
  meeting: [
    0.12, 0.1, 0.1, 0.1, 0.1, 0.15, 0.4, 0.72, 0.98, 1, 0.92, 0.55, 0.5, 0.9, 1, 0.95, 0.88, 0.65,
    0.38, 0.25, 0.18, 0.14, 0.12, 0.1,
  ],
  storage: [
    0.28, 0.25, 0.25, 0.25, 0.25, 0.28, 0.42, 0.62, 0.85, 0.88, 0.82, 0.55, 0.48, 0.78, 0.88, 0.85,
    0.82, 0.68, 0.48, 0.38, 0.32, 0.28, 0.25, 0.25,
  ],
  mixed: [
    0.22, 0.18, 0.16, 0.15, 0.18, 0.25, 0.42, 0.68, 0.92, 0.95, 0.9, 0.58, 0.5, 0.82, 0.95, 0.92,
    0.88, 0.72, 0.5, 0.38, 0.3, 0.24, 0.2, 0.18,
  ],
}

/** 使用与仪表盘完全同源的算法构建悬浮窗数据 */
function buildSnapshot(zoneNode: ZoneNode): EnergyOverlaySnapshot {
  const area = polyArea(zoneNode.polygon)
  const rt = classifyRt(zoneNode.name || zoneNode.id)
  const base = RT_BASE[rt] ?? RT_BASE.mixed!
  const id = zoneNode.id

  // 模拟室外温度基准曲线（与主引擎一致的夏季曲线）
  const OUTDOOR_BASE = [
    25.2, 24.8, 24.3, 24.0, 24.2, 25.0, 26.5, 28.8, 31.2, 33.5, 35.1, 35.8, 36.2, 35.9, 34.8, 33.2,
    32.0, 30.5, 28.8, 27.5, 26.8, 26.2, 25.8, 25.5,
  ]
  const TARGET = 23.5
  const DAMPING = 0.22

  let totalElec = 0,
    totalHvac = 0,
    totalLight = 0,
    totalWater = 0
  let sumTemp = 0,
    sumHum = 0,
    sumCo2 = 0,
    sumOcc = 0

  for (let h = 0; h < 24; h++) {
    const mult = HOUR_MULT[rt]?.[h] ?? 0.5
    const jitter = (seeded01(`${id}:${h}`, 7) - 0.5) * 0.12
    const eff = Math.max(0.04, Math.min(1.3, mult + jitter))
    const af = area * eff
    totalElec += af * base.e
    totalHvac += af * base.hvac
    totalLight += af * base.light
    totalWater += (rt === 'restroom' ? 0.003 : 0.0003) * af * (eff < 0.3 ? 0.25 : 1)

    // 室内温度：与主引擎同逻辑，HVAC 22% 室外渗透
    const outTemp = OUTDOOR_BASE[h] ?? 30
    const hvacOn = af * base.hvac > 0.01
    sumTemp += hvacOn
      ? TARGET + (outTemp - TARGET) * DAMPING + (seeded01(`${id}:${h}`, 31) - 0.5) * 1.2
      : outTemp * 0.65 + TARGET * 0.35 + (seeded01(`${id}:${h}`, 31) - 0.5) * 2.0

    sumHum += hvacOn
      ? 48 + (seeded01(`${id}:${h}`, 37) - 0.5) * 8
      : 65 + (seeded01(`${id}:${h}`, 37) - 0.5) * 10
    sumCo2 += 420 + Math.round(af * 0.12 * eff) * 35 + (seeded01(`${id}:${h}`, 47) - 0.5) * 40
    sumOcc += Math.max(0, Math.round(af * 0.12 * eff + (seeded01(`${id}:${h}`, 41) - 0.5) * 2))
  }

  const energyMetrics = [
    { label: '电力', value: Number(totalElec.toFixed(1)), unit: 'kWh' },
    { label: '空调', value: Number(totalHvac.toFixed(1)), unit: 'kWh' },
    { label: '照明', value: Number(totalLight.toFixed(1)), unit: 'kWh' },
    { label: '水耗', value: Number(totalWater.toFixed(3)), unit: 'm3' },
  ]

  const environmentMetrics = [
    { label: '室温', value: Number((sumTemp / 24).toFixed(1)), unit: '℃' },
    { label: '湿度', value: Math.round(sumHum / 24), unit: '%' },
    { label: 'CO₂', value: Math.round(sumCo2 / 24), unit: 'ppm' },
    { label: '在室', value: Number((sumOcc / 24).toFixed(1)), unit: '人' },
  ]

  const now = new Date()
  const monitorTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:00`

  return { title: zoneNode.name || zoneNode.id, monitorTime, energyMetrics, environmentMetrics }
}

function EnergyInfoCard({ snapshot }: { snapshot: EnergyOverlaySnapshot }) {
  const mainMetric = snapshot.energyMetrics[0]

  return (
    <div className="w-[var(--energy-card-width,332px)] max-w-[calc(100vw-24px)] overflow-hidden rounded border border-cyan-200/25 bg-[#03111d]/88 text-slate-100 shadow-[0_18px_48px_rgba(0,0,0,0.48),0_0_28px_rgba(0,212,255,0.14)] backdrop-blur-md">
      <div className="border-cyan-200/10 border-b bg-cyan-200/[0.04] px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-200 shadow-[0_0_10px_rgba(103,232,249,0.9)]" />
            <div className="truncate font-semibold text-cyan-50 text-sm">{snapshot.title}</div>
            <div className="ml-auto rounded border border-cyan-200/15 bg-cyan-300/8 px-2 py-0.5 text-[10px] text-cyan-100/80">
              实时估算
            </div>
          </div>
          <div className="mt-1 text-[11px] text-cyan-100/42">查询时间 {snapshot.monitorTime}</div>
        </div>
      </div>

      <div className="p-3">
        {mainMetric ? (
          <div className="mb-2 rounded border border-cyan-200/14 bg-cyan-300/[0.06] px-3 py-2">
            <div className="text-[10px] tracking-[0.12em] text-cyan-100/46">当前区域总电耗</div>
            <div className="mt-1 flex items-end gap-1">
              <span className="font-semibold text-2xl text-cyan-50 tabular-nums">
                {mainMetric.value.toFixed(1)}
              </span>
              <span className="pb-1 text-[11px] text-cyan-100/55">{mainMetric.unit}</span>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2 [@media(min-width:300px)]:grid-cols-2">
          <div className="rounded border border-cyan-300/18 bg-black/22 p-2">
            <div className="mb-1 text-[11px] tracking-wide text-cyan-100/48">能耗</div>
            <div className="space-y-2 text-[12px]">
              {snapshot.energyMetrics.slice(1).map((metric) => (
                <MetricRow
                  key={metric.label}
                  label={metric.label}
                  value={`${metric.value.toFixed(metric.unit === 'm3' ? 2 : 1)} ${metric.unit}`}
                />
              ))}
            </div>
          </div>

          <div className="rounded border border-cyan-300/18 bg-black/22 p-2">
            <div className="mb-1 text-[11px] tracking-wide text-cyan-100/48">环境</div>
            <div className="space-y-2 text-[12px]">
              {snapshot.environmentMetrics.map((metric) => (
                <MetricRow
                  key={metric.label}
                  label={metric.label}
                  value={`${metric.value.toFixed(1)} ${metric.unit}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricRow({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-0.5">
      <span className="text-cyan-100/42 text-xs leading-4">{label}</span>
      <span
        className={`break-words text-right font-medium leading-4 tabular-nums ${highlight ? 'text-cyan-100' : 'text-slate-100/90'}`}
      >
        {value}
      </span>
    </div>
  )
}

type FloatingLayout = {
  xOffset: number
  cardWidth: number
}

type FrameLayoutState = {
  targetId: string | null
  layout: FloatingLayout
}

type FloatingAnchor = {
  position: [number, number, number]
  screenX: number
}

type OverlayTarget = {
  zoneId: string
  anchorId: string
  title?: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

function resolveFloatingLayout(anchorScreenX: number): FloatingLayout {
  if (typeof window === 'undefined') {
    return { xOffset: -220, cardWidth: FLOATING_CARD_WIDTH }
  }

  const panelLeftBoundary = getEditorPanelLeftBoundary()
  const maxWidthFromPanel = panelLeftBoundary - VIEWPORT_SAFE_GAP * 2
  const maxWidthFromViewport = window.innerWidth - VIEWPORT_SAFE_GAP * 2
  const nextCardWidth = clamp(
    Math.min(FLOATING_CARD_MAX_WIDTH, maxWidthFromPanel, maxWidthFromViewport),
    FLOATING_CARD_MIN_WIDTH,
    FLOATING_CARD_MAX_WIDTH,
  )

  const desiredCenterX = anchorScreenX - 220
  const minCenterX = nextCardWidth / 2 + VIEWPORT_SAFE_GAP
  const maxCenterX = Math.min(
    window.innerWidth - nextCardWidth / 2 - VIEWPORT_SAFE_GAP,
    panelLeftBoundary - PANEL_SAFE_GAP - nextCardWidth / 2,
  )
  const clampedCenterX = clamp(desiredCenterX, minCenterX, maxCenterX)

  return {
    xOffset: Math.round(clampedCenterX - anchorScreenX),
    cardWidth: Math.round(nextCardWidth),
  }
}

function resolveFloatingAnchor(targetId: string, camera: THREE.Camera): FloatingAnchor | null {
  const object = sceneRegistry.nodes.get(targetId)
  if (!object) return null

  const box = new THREE.Box3().setFromObject(object)
  if (box.isEmpty()) return null

  const center = box.getCenter(new THREE.Vector3())
  const anchor = new THREE.Vector3(center.x, box.max.y + 1.3, center.z)
  const projected = anchor.clone().project(camera)
  const screenX = typeof window === 'undefined' ? 0 : ((projected.x + 1) / 2) * window.innerWidth

  return {
    position: [anchor.x, anchor.y, anchor.z],
    screenX,
  }
}

export function EnergyFloatingOverlay() {
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const zoneId = useViewer((s) => s.selection.zoneId)
  const nodes = useScene((s) => s.nodes)
  const mode = useEditor((s) => s.mode)
  const viewMode = useEditor((s) => s.viewMode)
  const isFloorplanHovered = useEditor((s) => s.isFloorplanHovered)
  const { camera } = useThree()

  const groupRef = useRef<THREE.Group>(null)
  const [frameLayoutState, setFrameLayoutState] = useState<FrameLayoutState | null>(null)

  const selectedItemId = selectedIds.length === 1 ? selectedIds[0] : null
  const selectedItemNode = selectedItemId ? nodes[selectedItemId as AnyNodeId] : null
  const selectedZoneNode = zoneId ? nodes[zoneId as AnyNodeId] : null

  const overlayTarget = useMemo<OverlayTarget | null>(() => {
    if (selectedItemNode?.type === 'item') {
      if (!shouldRenderEnergyCardForItem(selectedItemNode)) return null
      const zone = resolveItemZone(selectedItemNode, nodes)
      if (zone) {
        return {
          zoneId: zone.id,
          anchorId: selectedItemNode.id,
          title: selectedItemNode.name || selectedItemNode.id,
        }
      }
      return null
    }
    if (selectedZoneNode?.type === 'zone' && selectedIds.length === 0) {
      return {
        zoneId: selectedZoneNode.id,
        anchorId: selectedZoneNode.id,
        title: selectedZoneNode.name,
      }
    }
    return null
  }, [selectedIds.length, selectedItemNode, selectedZoneNode, nodes])
  const overlayTargetId = overlayTarget?.anchorId ?? null

  const shouldRender =
    Boolean(overlayTarget) && mode !== 'delete' && !(isFloorplanHovered && viewMode !== '3d')

  const anchor = useMemo(() => {
    if (!overlayTarget) return null
    return resolveFloatingAnchor(overlayTarget.anchorId, camera)
  }, [overlayTarget, camera])

  const initialLayout = useMemo(
    () =>
      anchor
        ? resolveFloatingLayout(anchor.screenX)
        : { xOffset: -220, cardWidth: FLOATING_CARD_WIDTH },
    [anchor],
  )

  const snapshot = useMemo(() => {
    if (!overlayTarget) return null
    const zn = nodes[overlayTarget.zoneId as AnyNodeId]
    if (zn?.type !== 'zone') return null
    const snapshot = buildSnapshot(zn as ZoneNode)
    return overlayTarget.title ? { ...snapshot, title: overlayTarget.title } : snapshot
  }, [overlayTarget, nodes])

  useFrame(() => {
    if (!(shouldRender && groupRef.current && typeof window !== 'undefined')) return

    const projected = groupRef.current.position.clone().project(camera)
    const anchorScreenX = ((projected.x + 1) / 2) * window.innerWidth
    const nextLayout = resolveFloatingLayout(anchorScreenX)
    setFrameLayoutState((prev) => {
      if (
        prev?.targetId === overlayTargetId &&
        Math.abs(prev.layout.xOffset - nextLayout.xOffset) <= 1 &&
        Math.abs(prev.layout.cardWidth - nextLayout.cardWidth) <= 1
      ) {
        return prev
      }
      return { targetId: overlayTargetId, layout: nextLayout }
    })
  })

  if (!(shouldRender && overlayTarget && snapshot && anchor)) return null

  const layout =
    frameLayoutState?.targetId === overlayTargetId ? frameLayoutState.layout : initialLayout

  return (
    <group position={anchor.position} ref={groupRef}>
      <Html
        center
        style={{
          pointerEvents: 'none',
          touchAction: 'auto',
          marginLeft: `${layout.xOffset}px`,
          opacity: 1,
          ['--energy-card-width' as string]: `${layout.cardWidth}px`,
        }}
        zIndexRange={[180, 0]}
      >
        <EnergyInfoCard snapshot={snapshot} />
      </Html>
    </group>
  )
}
