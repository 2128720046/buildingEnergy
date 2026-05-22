'use client'

import { useMemo } from 'react'
import type { FloorHeatmapData } from '@/features/energy-insights/lib/floor-heatmap'
import { energyToHeatColor, energyToStrokeColor } from '@/features/energy-insights/lib/floor-heatmap'
import { cn } from '@/lib/utils'
import { MapPin } from 'lucide-react'

interface FloorHeatmapOverlayProps { data: FloorHeatmapData | null; className?: string }

const CANVAS_PADDING = 24; const HEATMAP_WIDTH = 280; const HEATMAP_HEIGHT = 220

function polygonToSvgPath(polygon: Array<[number, number]>): string {
  if (polygon.length === 0) return ''
  const [firstX, firstZ] = polygon[0]!; const parts = [`M ${firstX} ${firstZ}`]
  for (let i = 1; i < polygon.length; i++) { const [x, z] = polygon[i]!; parts.push(`L ${x} ${z}`) }
  parts.push('Z'); return parts.join(' ')
}

export default function FloorHeatmapOverlay({ data, className }: FloorHeatmapOverlayProps) {
  const renderKey = useMemo(() => { if (!data) return 'empty'; return data.zones.map((z) => `${z.zoneId}:${z.normalizedEnergy.toFixed(3)}`).join('|') }, [data])

  const svgContent = useMemo(() => {
    if (!data || data.zones.length === 0) return null
    const rangeX = data.maxX - data.minX || 1; const rangeZ = data.maxZ - data.minZ || 1
    const availW = HEATMAP_WIDTH - CANVAS_PADDING * 2; const availH = HEATMAP_HEIGHT - CANVAS_PADDING * 2
    const dataAspect = rangeX / rangeZ; const canvasAspect = availW / availH
    let drawW: number, drawH: number, offX: number, offZ: number
    if (dataAspect > canvasAspect) { drawW = availW; drawH = availW / dataAspect; offX = CANVAS_PADDING; offZ = CANVAS_PADDING + (availH - drawH) / 2 }
    else { drawH = availH; drawW = availH * dataAspect; offX = CANVAS_PADDING + (availW - drawW) / 2; offZ = CANVAS_PADDING }
    const scaleX = drawW / rangeX; const scaleZ = drawH / rangeZ
    const patternId = `hmp-${data.levelId}`

    return (
      <svg aria-label={`${data.floorName} 能耗热力图`} className="h-full w-full" viewBox={`0 0 ${HEATMAP_WIDTH} ${HEATMAP_HEIGHT}`} key={renderKey}>
        <defs><pattern height="20" id={patternId} patternUnits="userSpaceOnUse" width="20"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" /></pattern></defs>
        <rect fill={`url(#${patternId})`} height={HEATMAP_HEIGHT} rx="4" width={HEATMAP_WIDTH} x="0" y="0" />
        {data.zones.map((zone) => {
          const transformed = zone.polygon.map(([x, z]) => [offX + (x - data.minX) * scaleX, offZ + (data.maxZ - z) * scaleZ] as [number, number])
          const pathD = polygonToSvgPath(transformed)
          return (
            <g key={zone.zoneId}>
              <path d={pathD} fill={energyToHeatColor(zone.normalizedEnergy)} stroke={energyToStrokeColor(zone.normalizedEnergy)} strokeWidth="1">
                <title>{zone.zoneName}{'\n'}总电耗：{zone.totalEnergy.toFixed(1)} kWh{'\n'}暖通：{zone.hvacEnergy.toFixed(1)} · 照明：{zone.lightingEnergy.toFixed(1)} kWh{'\n'}水耗：{zone.waterUsage.toFixed(3)} m3{'\n'}室内均温：{zone.avgIndoorTemp}°C · 在室：{zone.avgOccupancy}人{zone.normalizedEnergy > 0.7 ? '（高能耗）' : zone.normalizedEnergy > 0.35 ? '（中等能耗）' : '（低能耗）'}</title>
              </path>
            </g>)
        })}
      </svg>
    )
  }, [data])

  if (!data) return null

  return (
    <div className={cn('pointer-events-auto relative overflow-hidden rounded border border-white/8 bg-[#030712]/80 shadow-none backdrop-blur-md', className)} style={{ width: HEATMAP_WIDTH, height: HEATMAP_HEIGHT + 56 }}>
      <div className="flex items-center gap-2 border-b border-white/6 px-3.5 py-2.5">
        <MapPin className="h-3.5 w-3.5 text-[#00F5FF]" strokeWidth={2} />
        <span className="font-semibold text-[11px] tracking-[0.14em] text-white/55 uppercase">楼层能耗热力图</span>
        <span className="ml-auto rounded-full border border-white/8 bg-[#00F5FF]/10 px-2 py-0.5 text-[10px] text-white/55">{data.floorName}</span>
      </div>
      <div className="relative h-full" style={{ height: HEATMAP_HEIGHT }}>
        {svgContent}
        <div className="absolute right-2 bottom-2 flex items-center gap-1 rounded border border-white/6 bg-black/40 px-2 py-1.5">
          <span className="text-[9px] text-white/30">低</span>
          <div className="flex h-2.5 w-20 overflow-hidden rounded-sm">
            {Array.from({ length: 20 }, (_, i) => <span key={i} className="h-full flex-1" style={{ backgroundColor: energyToHeatColor(i / 19) }} />)}
          </div>
          <span className="text-[9px] text-white/30">高</span>
        </div>
      </div>
    </div>
  )
}
