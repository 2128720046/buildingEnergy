'use client'

import { Activity, ArrowUpRight, Layers3, Zap } from 'lucide-react'
import { useMemo } from 'react'
import type {
  FloorHeatmapData,
  ZoneHeatmapEntry,
} from '@/features/energy-insights/lib/floor-heatmap'
import {
  energyToHeatColor,
  energyToStrokeColor,
} from '@/features/energy-insights/lib/floor-heatmap'
import { cn } from '@/lib/utils'

interface FloorHeatmapOverlayProps {
  data: FloorHeatmapData | null
  className?: string
}

const CANVAS_PADDING = 24
const HEATMAP_WIDTH = 300
const HEATMAP_HEIGHT = 218
const ANOMALY_THRESHOLD = 0.7

function polygonToSvgPath(polygon: Array<[number, number]>): string {
  if (polygon.length === 0) return ''
  const [firstX, firstZ] = polygon[0]!
  const parts = [`M ${firstX.toFixed(1)} ${firstZ.toFixed(1)}`]

  for (let i = 1; i < polygon.length; i++) {
    const [x, z] = polygon[i]!
    parts.push(`L ${x.toFixed(1)} ${z.toFixed(1)}`)
  }

  parts.push('Z')
  return parts.join(' ')
}

function getZoneTone(zone: ZoneHeatmapEntry): string {
  if (zone.normalizedEnergy > ANOMALY_THRESHOLD) return '#ff4d5e'
  if (zone.normalizedEnergy > 0.45) return '#ffb84d'
  return '#35e6b2'
}

export default function FloorHeatmapOverlay({ data, className }: FloorHeatmapOverlayProps) {
  const summary = useMemo(() => {
    if (!data || data.zones.length === 0) return null

    const sorted = [...data.zones].sort((a, b) => b.normalizedEnergy - a.normalizedEnergy)
    const topZone = sorted[0]!
    const total = data.zones.reduce((sum, zone) => sum + zone.totalEnergy, 0)
    const anomalyCount = data.zones.filter(
      (zone) => zone.normalizedEnergy > ANOMALY_THRESHOLD,
    ).length

    return {
      anomalyCount,
      avgEnergy: total / data.zones.length,
      topZone,
      total,
    }
  }, [data])

  const svgContent = useMemo(() => {
    if (!data || data.zones.length === 0) return null

    const rangeX = data.maxX - data.minX || 1
    const rangeZ = data.maxZ - data.minZ || 1
    const availableWidth = HEATMAP_WIDTH - CANVAS_PADDING * 2
    const availableHeight = HEATMAP_HEIGHT - CANVAS_PADDING * 2
    const dataAspect = rangeX / rangeZ
    const canvasAspect = availableWidth / availableHeight

    let drawWidth: number
    let drawHeight: number
    let offsetX: number
    let offsetZ: number

    if (dataAspect > canvasAspect) {
      drawWidth = availableWidth
      drawHeight = availableWidth / dataAspect
      offsetX = CANVAS_PADDING
      offsetZ = CANVAS_PADDING + (availableHeight - drawHeight) / 2
    } else {
      drawHeight = availableHeight
      drawWidth = availableHeight * dataAspect
      offsetX = CANVAS_PADDING + (availableWidth - drawWidth) / 2
      offsetZ = CANVAS_PADDING
    }

    const scaleX = drawWidth / rangeX
    const scaleZ = drawHeight / rangeZ
    const gridPatternId = `floor-heatmap-grid-${data.levelId}`
    const glowFilterId = `floor-heatmap-glow-${data.levelId}`

    return (
      <svg
        aria-label={`${data.floorName} 能耗热力图`}
        className="h-full w-full"
        viewBox={`0 0 ${HEATMAP_WIDTH} ${HEATMAP_HEIGHT}`}
      >
        <defs>
          <pattern height="18" id={gridPatternId} patternUnits="userSpaceOnUse" width="18">
            <path
              d="M 18 0 L 0 0 0 18"
              fill="none"
              stroke="rgba(125, 249, 255, 0.08)"
              strokeWidth="0.6"
            />
          </pattern>
          <filter id={glowFilterId} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" floodColor="#00d4ff" floodOpacity="0.28" stdDeviation="2" />
          </filter>
        </defs>

        <rect fill="rgba(1, 11, 20, 0.62)" height="100%" rx="8" width="100%" />
        <rect fill={`url(#${gridPatternId})`} height="100%" rx="8" width="100%" />
        <rect
          fill="none"
          height={drawHeight + 12}
          rx="6"
          stroke="rgba(125, 249, 255, 0.14)"
          width={drawWidth + 12}
          x={offsetX - 6}
          y={offsetZ - 6}
        />

        {data.zones.map((zone) => {
          const transformed = zone.polygon.map(
            ([x, z]) =>
              [offsetX + (x - data.minX) * scaleX, offsetZ + (data.maxZ - z) * scaleZ] as [
                number,
                number,
              ],
          )
          const pathD = polygonToSvgPath(transformed)
          const isAnomaly = zone.normalizedEnergy > ANOMALY_THRESHOLD
          const tone = getZoneTone(zone)

          return (
            <path
              d={pathD}
              fill={energyToHeatColor(zone.normalizedEnergy)}
              filter={isAnomaly ? `url(#${glowFilterId})` : undefined}
              key={zone.zoneId}
              stroke={isAnomaly ? tone : energyToStrokeColor(zone.normalizedEnergy)}
              strokeLinejoin="round"
              strokeWidth={isAnomaly ? 1.6 : 1}
            >
              <title>
                {zone.zoneName}
                {'\n'}总电耗：{zone.totalEnergy.toFixed(1)} kWh
                {'\n'}暖通：{zone.hvacEnergy.toFixed(1)} kWh · 照明：
                {zone.lightingEnergy.toFixed(1)} kWh
                {'\n'}水耗：{zone.waterUsage.toFixed(3)} m3
                {'\n'}室内均温：{zone.avgIndoorTemp}°C · 在室：{zone.avgOccupancy}人
              </title>
            </path>
          )
        })}
      </svg>
    )
  }, [data])

  if (!data || !summary) return null

  const topTone = getZoneTone(summary.topZone)

  return (
    <div
      className={cn(
        'pointer-events-auto overflow-hidden rounded border border-cyan-200/12 bg-[#03111d]/82 shadow-[0_18px_42px_rgba(0,0,0,0.42)] backdrop-blur-sm',
        className,
      )}
      style={{ width: HEATMAP_WIDTH }}
    >
      <div className="border-b border-cyan-200/10 bg-cyan-200/[0.03] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded border border-cyan-200/16 bg-cyan-300/8 text-cyan-100">
            <Layers3 className="h-3.5 w-3.5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold text-[12px] text-cyan-50 tracking-[0.1em]">
              楼层能耗热力图
            </div>
            <div className="truncate text-[10px] text-cyan-100/42">{data.floorName}</div>
          </div>
          <div className="ml-auto rounded border border-rose-300/20 bg-rose-400/10 px-2 py-1 text-[10px] text-rose-100">
            异常 {summary.anomalyCount}
          </div>
        </div>
      </div>

      <div className="relative h-[218px]">{svgContent}</div>

      <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-cyan-200/10 bg-black/18 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] text-white/42">
            <Zap className="h-3 w-3 text-cyan-200/70" strokeWidth={1.8} />
            峰值区域
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: topTone, boxShadow: `0 0 10px ${topTone}` }}
            />
            <span className="truncate text-[12px] font-semibold text-white/86">
              {summary.topZone.zoneName}
            </span>
            <span className="text-[11px] text-white/46">
              {summary.topZone.totalEnergy.toFixed(1)} kWh
            </span>
          </div>
        </div>

        <div className="text-right">
          <div className="flex items-center justify-end gap-1 text-[10px] text-white/42">
            <Activity className="h-3 w-3 text-cyan-200/70" strokeWidth={1.8} />
            均值
          </div>
          <div className="mt-1 text-[12px] font-semibold text-cyan-50">
            {summary.avgEnergy.toFixed(1)}
            <span className="ml-1 text-[10px] font-normal text-white/42">kWh</span>
          </div>
        </div>

        <div className="col-span-2 flex items-center gap-2 pt-1">
          <span className="text-[9px] text-white/32">低</span>
          <div className="flex h-2 flex-1 overflow-hidden rounded-sm border border-white/8">
            {Array.from({ length: 18 }, (_, index) => (
              <span
                className="h-full flex-1"
                key={index}
                style={{ backgroundColor: energyToHeatColor(index / 17) }}
              />
            ))}
          </div>
          <span className="text-[9px] text-white/32">高</span>
          <ArrowUpRight className="h-3 w-3 text-rose-200/70" strokeWidth={1.8} />
        </div>
      </div>
    </div>
  )
}
