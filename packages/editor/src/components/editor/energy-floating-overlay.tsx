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
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  ENERGY_OVERLAY_TIMELINE_EVENT,
  readEnergyOverlayTimeline,
  readEnergyOverlayZoneSnapshot,
  type EnergyOverlayTimelineState,
} from '../../lib/energy-overlay-state'
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
  subtitle: string
  kind: 'device' | 'room'
  monitorTime: string
  primaryMetric: { label: string; value: number; unit: string; precision?: number }
  energyMetrics: Array<{ label: string; value: string; highlight?: boolean }>
  secondaryTitle: string
  secondaryMetrics: Array<{ label: string; value: string; highlight?: boolean }>
  status: string
  statusTone: 'amber' | 'cyan' | 'emerald' | 'rose'
}

type ItemEnergyProfile = {
  category: 'climate' | 'cooking' | 'electronics' | 'lighting' | 'refrigeration' | 'safety' | 'water'
  displayName: string
  isElectrical: boolean
  hasHvac: boolean
  hasWater: boolean
  ratedKw: number
  standbyKw: number
}

function resolveItemEnergyProfile(itemNode: ItemNode): ItemEnergyProfile {
  const category = itemNode.asset?.category?.toLowerCase() ?? ''
  const name = (itemNode.name ?? '').toLowerCase()
  const tags = Array.isArray(itemNode.asset?.tags)
    ? itemNode.asset.tags.join(' ').toLowerCase()
    : ''
  const searchable = `${category} ${name} ${tags}`
  const isRefrigeration = /(fridge|refrigerator|freezer|冰箱|冷柜|冷藏|冷冻)/.test(searchable)
  const isCooking = /(oven|microwave|stove|toaster|kettle|coffee|烤箱|微波|炉|咖啡|热水壶)/.test(searchable)
  const isLighting = /(lamp|light|exit-sign|灯|照明|筒灯|射灯|灯带|应急灯)/.test(searchable)
  const isSafety = /(sprinkler|smoke|fire|alarm|hydrant|detector|keypad|panel|消防|烟感|报警|喷淋|探测|弱电)/.test(searchable)
  const isElectronics = /(computer|tv|screen|monitor|speaker|television|charger|socket)/.test(
    searchable,
  )
  const hasHvac = /(air[-\s]?condition|\bac\b|hvac|fan|heater|thermostat|vent|空调|暖通|新风|风机|风口|温控|加热)/.test(searchable)
  const hasWater = /(sink|bath|shower|toilet|wash|dishwasher|water|coffee|humidifier|faucet|水槽|龙头|洗手|马桶|加湿|水泵)/.test(searchable)
  const hasInteractiveControl =
    Array.isArray(itemNode.asset?.interactive?.controls) &&
    itemNode.asset.interactive.controls.length > 0
  const looksElectrical =
    /(appliance|electrical|electric|electronics|device|equipment|lamp|light|computer|tv|screen|monitor|fridge|refrigerator|oven|microwave|stove|machine|keypad|alarm|charger|socket|switch|air|conditioner)/.test(
      searchable,
    )
  const looksFurniture =
    /(sofa|couch|chair|table|bed|bookshelf|book|plant|bush|cactus|door|window|column|rug|bean|bag|barbell|basket|toy|closet|dresser|cabinet|沙发|椅|桌|床|书架|植物|门|窗|地毯|柜)/.test(
      searchable,
    )
  const isElectrical =
    hasHvac || hasWater || hasInteractiveControl || (looksElectrical && !looksFurniture)

  const resolvedCategory: ItemEnergyProfile['category'] = hasHvac
    ? 'climate'
    : isRefrigeration
      ? 'refrigeration'
      : isCooking
        ? 'cooking'
        : isLighting
          ? 'lighting'
          : hasWater
            ? 'water'
            : isSafety
              ? 'safety'
              : isElectronics
                ? 'electronics'
                : 'electronics'

  const ratedKwByCategory: Record<ItemEnergyProfile['category'], number> = {
    climate: 1.6,
    cooking: 1.2,
    electronics: 0.18,
    lighting: 0.045,
    refrigeration: 0.12,
    safety: 0.018,
    water: 0.75,
  }
  const standbyKwByCategory: Record<ItemEnergyProfile['category'], number> = {
    climate: 0.04,
    cooking: 0.012,
    electronics: 0.018,
    lighting: 0.002,
    refrigeration: 0.045,
    safety: 0.006,
    water: 0.01,
  }

  return {
    category: resolvedCategory,
    displayName: categoryLabel(resolvedCategory),
    hasHvac,
    hasWater,
    isElectrical,
    ratedKw: ratedKwByCategory[resolvedCategory],
    standbyKw: standbyKwByCategory[resolvedCategory],
  }
}

function shouldRenderEnergyCardForItem(itemNode: ItemNode): boolean {
  return resolveItemEnergyProfile(itemNode).isElectrical
}

function categoryLabel(category: ItemEnergyProfile['category']): string {
  switch (category) {
    case 'climate':
      return '暖通末端'
    case 'cooking':
      return '厨房电器'
    case 'electronics':
      return '办公/电子设备'
    case 'lighting':
      return '照明设备'
    case 'refrigeration':
      return '制冷设备'
    case 'safety':
      return '消防/弱电设备'
    case 'water':
      return '给排水设备'
  }
}

function statusTone(status: string): EnergyOverlaySnapshot['statusTone'] {
  if (status.includes('异常') || status.includes('高')) return 'rose'
  if (status.includes('待机') || status.includes('低')) return 'amber'
  if (status.includes('在线') || status.includes('运行')) return 'emerald'
  return 'cyan'
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

// ---- 悬浮框数据 ----

function seeded01(input: string, offset: number): number {
  let h = offset
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) % 100003
  return (h % 10000) / 10000
}

function buildTimelineRoomSnapshot(
  zoneNode: ZoneNode,
  timeline: EnergyOverlayTimelineState,
): EnergyOverlaySnapshot {
  const zoneSnapshot = readEnergyOverlayZoneSnapshot(zoneNode.id, timeline)
  const hourly = zoneSnapshot?.hourly[timeline.hour] ?? null
  if (!zoneSnapshot || !hourly) {
    return {
      energyMetrics: [{ label: '数据状态', value: '等待仪表盘同步' }],
      kind: 'room',
      monitorTime: `${timeline.date} ${String(timeline.hour).padStart(2, '0')}:00`,
      primaryMetric: { label: '当前房间负荷', unit: 'kWh', value: 0, precision: 2 },
      secondaryMetrics: [{ label: '房间', value: zoneNode.name || zoneNode.id }],
      secondaryTitle: '空间信息',
      status: '等待数据',
      statusTone: 'amber',
      subtitle: '房间小时级数据',
      title: zoneNode.name || zoneNode.id,
    }
  }

  const status =
    hourly.indoor_temp_c > 29 || hourly.co2_ppm > 950
      ? '环境偏高'
      : hourly.electricity_kwh >= zoneSnapshot.peakPowerKw * 0.92
        ? '接近峰值'
        : '空间正常'

  return {
    energyMetrics: [
      { label: '暖通', value: `${hourly.hvac_kwh.toFixed(2)} kWh` },
      { label: '照明', value: `${hourly.lighting_kwh.toFixed(2)} kWh` },
      { label: '插座/设备', value: `${hourly.socket_kwh.toFixed(2)} kWh` },
      { label: '用水', value: `${hourly.water_m3.toFixed(3)} m3` },
      { label: '今日累计', value: `${zoneSnapshot.totalElectricityKwh.toFixed(1)} kWh` },
      {
        label: '今日峰值',
        value: `${zoneSnapshot.peakPowerKw.toFixed(1)} kW @ ${String(zoneSnapshot.peakHour).padStart(2, '0')}:00`,
      },
    ],
    kind: 'room',
    monitorTime: `${timeline.date} ${String(timeline.hour).padStart(2, '0')}:00`,
    primaryMetric: {
      label: '当前房间负荷',
      unit: 'kWh',
      value: hourly.electricity_kwh,
      precision: 2,
    },
    secondaryMetrics: [
      { label: '室内温度', value: `${hourly.indoor_temp_c.toFixed(1)} °C` },
      { label: '室内湿度', value: `${hourly.indoor_humidity_pct}%` },
      { label: '室外温度', value: `${hourly.outdoor_temp_c.toFixed(1)} °C` },
      { label: '室外湿度', value: `${hourly.outdoor_humidity_pct}%` },
      { label: 'CO2', value: `${hourly.co2_ppm} ppm` },
      { label: 'PM2.5', value: `${hourly.pm25_ugm3}` },
      { label: '在室人数', value: `${hourly.occupancy_count} 人` },
    ],
    secondaryTitle: '环境',
    status,
    statusTone: statusTone(status),
    subtitle: '房间小时级数据',
    title: zoneSnapshot.zoneName,
  }
}

function deviceLoadFactor(category: ItemEnergyProfile['category'], hour: number) {
  if (category === 'refrigeration' || category === 'safety') return 0.92
  if (hour >= 9 && hour <= 18) return category === 'lighting' ? 0.72 : 0.68
  if (hour >= 19 && hour <= 22) return category === 'electronics' ? 0.34 : 0.28
  return category === 'lighting' ? 0.08 : 0.14
}

function buildDeviceSnapshot(
  itemNode: ItemNode,
  zoneNode: ZoneNode,
  timeline: EnergyOverlayTimelineState,
): EnergyOverlaySnapshot {
  const profile = resolveItemEnergyProfile(itemNode)
  const zoneSnapshot = readEnergyOverlayZoneSnapshot(zoneNode.id, timeline)
  const roomRecord = zoneSnapshot?.hourly[timeline.hour] ?? null
  const factor = deviceLoadFactor(profile.category, timeline.hour)
  const jitter = 0.92 + seeded01(`${itemNode.id}:${timeline.date}:${timeline.hour}`, 107) * 0.16
  const currentKw = Number(Math.max(profile.standbyKw, profile.ratedKw * factor * jitter).toFixed(2))
  const todayKwh = Number(
    Array.from({ length: 24 }, (_, hour) =>
      Math.max(profile.standbyKw, profile.ratedKw * deviceLoadFactor(profile.category, hour)),
    )
      .reduce((sum, value) => sum + value, 0)
      .toFixed(2),
  )
  const status =
    currentKw > profile.ratedKw * 0.86 ? '负荷偏高' : currentKw <= profile.standbyKw * 1.4 ? '低负荷待机' : '在线运行'
  const secondaryMetrics =
    profile.category === 'refrigeration'
      ? [
          { label: '箱内温度', value: `${(4.2 + (seeded01(itemNode.id, 113) - 0.5) * 1.4).toFixed(1)} °C` },
          { label: '压缩机负载', value: `${Math.round(42 + factor * 48)}%` },
          { label: '开门估计', value: `${Math.round(1 + seeded01(itemNode.id, 117) * 6)} 次/h` },
        ]
      : profile.category === 'climate'
        ? [
            {
              label: '关联室温',
              value: roomRecord ? `${roomRecord.indoor_temp_c.toFixed(1)} °C` : '--',
            },
            { label: '设定温度', value: `${(23.5 + (seeded01(itemNode.id, 115) - 0.5) * 1.2).toFixed(1)} °C` },
            { label: '风机档位', value: factor > 0.65 ? '高' : factor > 0.3 ? '中' : '低' },
          ]
        : profile.category === 'lighting'
          ? [
              { label: '回路亮度', value: `${Math.round(35 + factor * 60)}%` },
              { label: '运行模式', value: factor > 0.5 ? '有人联动' : '夜间低照度' },
            ]
          : profile.category === 'water'
            ? [
                {
                  label: '关联用水',
                  value: roomRecord ? `${roomRecord.water_m3.toFixed(3)} m3` : '--',
                },
                { label: '运行周期', value: `${Math.round(8 + factor * 22)} min/h` },
              ]
            : profile.category === 'cooking'
              ? [
                  { label: '加热负载', value: `${Math.round((currentKw / profile.ratedKw) * 100)}%` },
                  { label: '安全状态', value: factor > 0.6 ? '工作中' : '待机' },
                ]
              : profile.category === 'safety'
                ? [
                    { label: '回路电流', value: `${(0.04 + factor * 0.12).toFixed(2)} A` },
                    { label: '巡检状态', value: '在线自检' },
                  ]
                : [
                    { label: '待机功率', value: `${profile.standbyKw.toFixed(3)} kW` },
                    { label: '负载率', value: `${Math.round((currentKw / profile.ratedKw) * 100)}%` },
                  ]

  return {
    energyMetrics: [
      { label: '今日耗电', value: `${todayKwh.toFixed(2)} kWh` },
      { label: '额定功率', value: `${profile.ratedKw.toFixed(2)} kW` },
      { label: '所在房间', value: zoneNode.name || zoneNode.id },
      { label: '设备类型', value: profile.displayName },
      ...(roomRecord
        ? [{ label: '房间当前负荷', value: `${roomRecord.electricity_kwh.toFixed(2)} kWh` }]
        : []),
    ],
    kind: 'device',
    monitorTime: `${timeline.date} ${String(timeline.hour).padStart(2, '0')}:00`,
    primaryMetric: { label: '当前功率', unit: 'kW', value: currentKw, precision: 2 },
    secondaryMetrics,
    secondaryTitle: '运行',
    status,
    statusTone: statusTone(status),
    subtitle: '设备小时级数据',
    title: itemNode.name || itemNode.id,
  }
}

function EnergyInfoCard({ snapshot }: { snapshot: EnergyOverlaySnapshot }) {
  const precision = snapshot.primaryMetric.precision ?? (snapshot.primaryMetric.unit === 'kWh' ? 2 : 1)
  const badgeLabel = snapshot.kind === 'device' ? '设备估算' : '空间同步'

  return (
    <div className="w-[var(--energy-card-width,332px)] max-w-[calc(100vw-24px)] overflow-hidden rounded border border-cyan-200/25 bg-[#03111d]/88 text-slate-100 shadow-[0_18px_48px_rgba(0,0,0,0.48),0_0_28px_rgba(0,212,255,0.14)] backdrop-blur-md">
      <div className="border-cyan-200/10 border-b bg-cyan-200/[0.04] px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-200 shadow-[0_0_10px_rgba(103,232,249,0.9)]" />
            <div className="truncate font-semibold text-cyan-50 text-sm">{snapshot.title}</div>
            <div className="ml-auto rounded border border-cyan-200/15 bg-cyan-300/8 px-2 py-0.5 text-[10px] text-cyan-100/80">
              {badgeLabel}
            </div>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-cyan-100/42">
            <span>{snapshot.subtitle}</span>
            <span className="text-cyan-100/22">|</span>
            <span>{snapshot.monitorTime}</span>
          </div>
        </div>
      </div>

      <div className="p-3">
        <div className="mb-2 rounded border border-cyan-200/14 bg-cyan-300/[0.06] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] tracking-[0.12em] text-cyan-100/46">
              {snapshot.primaryMetric.label}
            </div>
            <div
              className="rounded px-1.5 py-0.5 text-[10px]"
              data-tone={snapshot.statusTone}
              style={{
                background:
                  snapshot.statusTone === 'rose'
                    ? 'rgba(244,63,94,0.16)'
                    : snapshot.statusTone === 'amber'
                      ? 'rgba(245,158,11,0.16)'
                      : 'rgba(16,185,129,0.14)',
                color:
                  snapshot.statusTone === 'rose'
                    ? 'rgb(254,205,211)'
                    : snapshot.statusTone === 'amber'
                      ? 'rgb(253,230,138)'
                      : 'rgb(167,243,208)',
              }}
            >
              {snapshot.status}
            </div>
          </div>
          <div className="mt-1 flex items-end gap-1">
            <span className="font-semibold text-2xl text-cyan-50 tabular-nums">
              {snapshot.primaryMetric.value.toFixed(precision)}
            </span>
            <span className="pb-1 text-[11px] text-cyan-100/55">{snapshot.primaryMetric.unit}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 [@media(min-width:300px)]:grid-cols-2">
          <div className="rounded border border-cyan-300/18 bg-black/22 p-2">
            <div className="mb-1 text-[11px] tracking-wide text-cyan-100/48">能耗</div>
            <div className="space-y-2 text-[12px]">
              {snapshot.energyMetrics.map((metric) => (
                <MetricRow
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  highlight={metric.highlight}
                />
              ))}
            </div>
          </div>

          <div className="rounded border border-cyan-300/18 bg-black/22 p-2">
            <div className="mb-1 text-[11px] tracking-wide text-cyan-100/48">
              {snapshot.secondaryTitle}
            </div>
            <div className="space-y-2 text-[12px]">
              {snapshot.secondaryMetrics.map((metric) => (
                <MetricRow
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  highlight={metric.highlight}
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
  const layoutUpdateAtRef = useRef(0)
  const [frameLayoutState, setFrameLayoutState] = useState<FrameLayoutState | null>(null)
  const [timeline, setTimeline] = useState<EnergyOverlayTimelineState>(() => {
    const now = new Date()
    return (
      readEnergyOverlayTimeline() ?? {
        date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
        hour: now.getHours(),
      }
    )
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleTimelineChange = (event: Event) => {
      const detail = (event as CustomEvent<Partial<EnergyOverlayTimelineState>>).detail
      const next = readEnergyOverlayTimeline() ?? {
        date: typeof detail?.date === 'string' ? detail.date : timeline.date,
        hour: typeof detail?.hour === 'number' ? detail.hour : timeline.hour,
      }
      setTimeline((prev) =>
        prev.date === next.date && prev.hour === next.hour
          ? prev
          : { date: next.date, hour: Math.max(0, Math.min(23, Math.round(next.hour))) },
      )
    }
    window.addEventListener(ENERGY_OVERLAY_TIMELINE_EVENT, handleTimelineChange)
    return () => window.removeEventListener(ENERGY_OVERLAY_TIMELINE_EVENT, handleTimelineChange)
  }, [timeline.date, timeline.hour])

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
    if (selectedItemNode?.type === 'item') {
      return buildDeviceSnapshot(selectedItemNode, zn as ZoneNode, timeline)
    }
    return buildTimelineRoomSnapshot(zn as ZoneNode, timeline)
  }, [overlayTarget, nodes, selectedItemNode, timeline])

  useFrame(() => {
    if (!(shouldRender && groupRef.current && typeof window !== 'undefined')) return
    const frame = performance.now()
    if (frame - layoutUpdateAtRef.current < 120) return
    layoutUpdateAtRef.current = frame

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
