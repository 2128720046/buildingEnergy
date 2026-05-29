import { useScene } from '@pascal-app/core'
import { useEffect, useRef } from 'react'
import useViewer from '../../store/use-viewer'

function setLabelPinOpacity(zoneId: string | null, opacity: string) {
  if (!zoneId) return
  const label = document.getElementById(`${zoneId}-label`)
  const pin = label?.querySelector('.label-pin') as HTMLElement | null
  if (pin) pin.style.opacity = opacity
}

export const ZoneSystem = () => {
  const hoveredId = useViewer((state) => state.hoveredId)
  const highlightedZoneRef = useRef<string | null>(null)

  useEffect(() => {
    const hoveredNode = hoveredId ? useScene.getState().nodes[hoveredId] : null
    const highlightedZone = hoveredNode?.type === 'zone' ? hoveredId : null

    if (highlightedZone === highlightedZoneRef.current) return

    setLabelPinOpacity(highlightedZoneRef.current, '0.72')
    setLabelPinOpacity(highlightedZone, '1')
    highlightedZoneRef.current = highlightedZone
  }, [hoveredId])

  return null
}
