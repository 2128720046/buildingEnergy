'use client'

import { type AnyNodeId, type ItemNode, sceneRegistry, useScene, type ZoneNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import useEditor from '../../store/use-editor'

type OverlayKind = 'item' | 'zone'

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
  const panelAvoidRight = parseCssPixelValue(rootStyle.getPropertyValue('--host-editor-panel-avoid-right'))
  const panelWidth = parseCssPixelValue(rootStyle.getPropertyValue('--host-editor-panel-width')) || PANEL_DEFAULT_WIDTH
  return window.innerWidth - (PANEL_RIGHT_GAP + panelAvoidRight + panelWidth)
}

function seededNumber(input: string, offset = 0): number {
  let value = 0
  for (let index = 0; index < input.length; index += 1) {
    value += input.charCodeAt(index) * (index + 1 + offset)
  }
  return value
}

function formatMonitorTime(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:00`
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
  const tags = Array.isArray(itemNode.asset?.tags) ? itemNode.asset.tags.join(' ').toLowerCase() : ''
  const searchable = `${category} ${name} ${tags}`

  const hasHvac = /(air[-\s]?condition|\bac\b|hvac|fan|heater|thermostat|vent)/.test(searchable)
  const hasWater = /(sink|bath|shower|toilet|wash|dishwasher|water|coffee|humidifier|faucet)/.test(searchable)
  const hasInteractiveControl = Array.isArray(itemNode.asset?.interactive?.controls) && itemNode.asset.interactive.controls.length > 0
  const looksElectrical = /(lamp|light|computer|tv|screen|monitor|fridge|refrigerator|oven|microwave|stove|machine|keypad|alarm|charger|socket|switch|air|conditioner)/.test(searchable)
  const looksFurniture = /(sofa|couch|chair|table|bed|bookshelf|book|plant|bush|cactus|door|window|column|rug|bean|bag|barbell|basket|toy|closet|dresser|cabinet)/.test(searchable)

  const isElectrical = hasHvac || hasWater || hasInteractiveControl || (looksElectrical && !looksFurniture)

  return {
    isElectrical,
    hasHvac,
    hasWater,
  }
}

function shouldRenderEnergyCardForItem(itemNode: ItemNode): boolean {
  return resolveItemEnergyProfile(itemNode).isElectrical
}

function buildSnapshot(
  kind: OverlayKind,
  nodeId: string,
  projectId: string,
  title: string,
  itemNode?: ItemNode,
): EnergyOverlaySnapshot {
  const seed = seededNumber(`${projectId}:${nodeId}:${kind}`, 13)

  const electricKwh = Number((((seed % 380) / 5.3) + (kind === 'zone' ? 65 : 8)).toFixed(1))
  const waterM3 = kind === 'zone' ? Number((((seed % 120) / 16) + 1.5).toFixed(2)) : Number((((seed % 45) / 20) + 0.2).toFixed(2))
  const hvacKwh = kind === 'zone' ? Number((electricKwh * 0.42).toFixed(1)) : Number((electricKwh * 0.28).toFixed(1))
  const envTemp = Number((((seed % 90) / 10) + 18).toFixed(1))
  const envHumidity = Number((((seed % 500) / 10) + 35).toFixed(1))

  const profile = itemNode ? resolveItemEnergyProfile(itemNode) : null

  const energyMetrics: Array<{ label: string; value: number; unit: string }> = []

  if (kind === 'zone' || profile?.isElectrical) {
    energyMetrics.push({ label: '电力', value: electricKwh, unit: 'kWh' })
  }
  if (kind === 'zone' || profile?.hasHvac) {
    energyMetrics.push({ label: '空调', value: hvacKwh, unit: 'kWh' })
  }
  if (kind === 'zone' || profile?.hasWater) {
    energyMetrics.push({ label: '水耗', value: waterM3, unit: 'm3' })
  }

  const environmentMetrics = [
    { label: '温度', value: envTemp, unit: '℃' },
    { label: '湿度', value: envHumidity, unit: '%RH' },
  ]

  return {
    title,
    monitorTime: formatMonitorTime(new Date()),
    energyMetrics,
    environmentMetrics,
  }
}

function EnergyInfoCard({ snapshot }: { snapshot: EnergyOverlaySnapshot }) {
  return (
    <div className="w-[var(--energy-card-width,332px)] max-w-[calc(100vw-24px)] rounded-xl border border-cyan-300/45 bg-transparent p-3 text-slate-100 shadow-none backdrop-blur-none">
      <div className="mb-2.5 border-cyan-300/20 border-b pb-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-cyan-100 text-sm">{snapshot.title}</div>
          <div className="mt-1 text-[11px] text-slate-400">查询时间 {snapshot.monitorTime}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 [@media(min-width:300px)]:grid-cols-2">
        <div className="rounded-lg border border-cyan-300/28 bg-transparent p-2">
          <div className="mb-1 text-[11px] tracking-wide text-slate-400">能耗</div>
          <div className="space-y-2 text-[12px]">
            {snapshot.energyMetrics.map((metric, index) => (
              <MetricRow
                highlight={index === 0}
                key={metric.label}
                label={metric.label}
                value={`${metric.value.toFixed(metric.unit === 'm3' ? 2 : 1)} ${metric.unit}`}
              />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-cyan-300/28 bg-transparent p-2">
          <div className="mb-1 text-[11px] tracking-wide text-slate-400">环境</div>
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
      <span className="text-slate-400 text-xs leading-4">{label}</span>
      <span
        className={`break-words text-right font-medium leading-4 tabular-nums ${highlight ? 'text-cyan-200' : 'text-slate-100'}`}
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

export function EnergyFloatingOverlay() {
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const zoneId = useViewer((s) => s.selection.zoneId)
  const projectId = useViewer((s) => s.projectId) || 'building'
  const nodes = useScene((s) => s.nodes)
  const mode = useEditor((s) => s.mode)
  const viewMode = useEditor((s) => s.viewMode)
  const isFloorplanHovered = useEditor((s) => s.isFloorplanHovered)
  const { camera } = useThree()

  const groupRef = useRef<THREE.Group>(null)
  const [layout, setLayout] = useState<FloatingLayout>({
    xOffset: -220,
    cardWidth: FLOATING_CARD_WIDTH,
  })

  const selectedItemId = selectedIds.length === 1 ? selectedIds[0] : null
  const selectedItemNode = selectedItemId ? nodes[selectedItemId as AnyNodeId] : null
  const selectedZoneNode = zoneId ? nodes[zoneId as AnyNodeId] : null

  const overlayTarget = useMemo(() => {
    if (selectedItemNode?.type === 'item') {
      if (!shouldRenderEnergyCardForItem(selectedItemNode)) {
        return null
      }
      return {
        id: selectedItemNode.id,
        kind: 'item' as const,
        title: selectedItemNode.name || selectedItemNode.id,
      }
    }

    if (selectedZoneNode?.type === 'zone' && selectedIds.length === 0) {
      return {
        id: selectedZoneNode.id,
        kind: 'zone' as const,
        title: selectedZoneNode.name || selectedZoneNode.id,
      }
    }

    return null
  }, [selectedIds.length, selectedItemNode, selectedZoneNode])

  const shouldRender =
    Boolean(overlayTarget) &&
    mode !== 'delete' &&
    !(isFloorplanHovered && viewMode !== '3d')

  const snapshot = useMemo(() => {
    if (!overlayTarget) return null
    return buildSnapshot(
      overlayTarget.kind,
      overlayTarget.id,
      projectId,
      overlayTarget.title,
      overlayTarget.kind === 'item' && selectedItemNode?.type === 'item' ? selectedItemNode : undefined,
    )
  }, [overlayTarget, projectId, selectedItemNode])

  useFrame(() => {
    if (!(shouldRender && overlayTarget && groupRef.current)) return

    const object = sceneRegistry.nodes.get(overlayTarget.id)
    if (object) {
      const box = new THREE.Box3().setFromObject(object)
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3())
        const yOffset = overlayTarget.kind === 'zone' ? 1.3 : 0.9
        const anchor = new THREE.Vector3(center.x, box.max.y + yOffset, center.z)
        groupRef.current.position.copy(anchor)

        const projected = anchor.clone().project(camera)
        if (typeof window !== 'undefined') {
          const anchorScreenX = ((projected.x + 1) / 2) * window.innerWidth
          const nextLayout = resolveFloatingLayout(anchorScreenX)
          setLayout((prev) => {
            if (
              Math.abs(prev.xOffset - nextLayout.xOffset) <= 1 &&
              Math.abs(prev.cardWidth - nextLayout.cardWidth) <= 1
            ) {
              return prev
            }
            return nextLayout
          })
        }
        return
      }
    }

    if (overlayTarget.kind === 'zone') {
      const zoneNode = nodes[overlayTarget.id as AnyNodeId]
      if (zoneNode?.type === 'zone' && Array.isArray(zoneNode.polygon) && zoneNode.polygon.length > 0) {
        const center = zoneNode.polygon.reduce(
          (acc, point) => {
            return [acc[0] + point[0], acc[1] + point[1]]
          },
          [0, 0],
        )
        const x = center[0] / zoneNode.polygon.length
        const z = center[1] / zoneNode.polygon.length
        const anchor = new THREE.Vector3(x, 1.4, z)
        groupRef.current.position.copy(anchor)

        const projected = anchor.clone().project(camera)
        if (typeof window !== 'undefined') {
          const anchorScreenX = ((projected.x + 1) / 2) * window.innerWidth
          const nextLayout = resolveFloatingLayout(anchorScreenX)
          setLayout((prev) => {
            if (
              Math.abs(prev.xOffset - nextLayout.xOffset) <= 1 &&
              Math.abs(prev.cardWidth - nextLayout.cardWidth) <= 1
            ) {
              return prev
            }
            return nextLayout
          })
        }
      }
    }
  })

  if (!(shouldRender && overlayTarget && snapshot)) {
    return null
  }

  return (
    <group ref={groupRef}>
      <Html
        center
        style={{
          pointerEvents: 'none',
          touchAction: 'auto',
          marginLeft: `${layout.xOffset}px`,
          ['--energy-card-width' as string]: `${layout.cardWidth}px`,
        }}
        zIndexRange={[90, 0]}
      >
        <EnergyInfoCard snapshot={snapshot} />
      </Html>
    </group>
  )
}
