'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface DashboardTooltipRow {
  label: string
  tone?: string
  value: string
}

export interface DashboardTooltipContent {
  actions?: string[]
  body?: string
  rows?: DashboardTooltipRow[]
  title: string
}

type TooltipTarget = Element & {
  dataset?: DOMStringMap
}

function parseJsonArray<T>(value: string | undefined): T[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function readTooltipContent(target: TooltipTarget): DashboardTooltipContent | null {
  const title = target.dataset?.tooltipTitle
  if (!title) return null

  return {
    actions: parseJsonArray<string>(target.dataset?.tooltipActions),
    body: target.dataset?.tooltipBody,
    rows: parseJsonArray<DashboardTooltipRow>(target.dataset?.tooltipRows),
    title,
  }
}

function clampTooltipPosition(
  point: { x: number; y: number },
  size: { height: number; width: number },
) {
  if (typeof window === 'undefined') return point

  const margin = 12
  const offset = 16
  const width = size.width || 260
  const height = size.height || 160
  let x = point.x + offset
  let y = point.y + offset

  if (x + width + margin > window.innerWidth) {
    x = point.x - width - offset
  }
  if (y + height + margin > window.innerHeight) {
    y = point.y - height - offset
  }

  return {
    x: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
    y: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
  }
}

export function tooltipAttrs(content: DashboardTooltipContent) {
  return {
    'data-tooltip-actions': content.actions?.length ? JSON.stringify(content.actions) : undefined,
    'data-tooltip-body': content.body,
    'data-tooltip-rows': content.rows?.length ? JSON.stringify(content.rows) : undefined,
    'data-tooltip-title': content.title,
  }
}

export function DashboardTooltipLayer() {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<number | null>(null)
  const [content, setContent] = useState<DashboardTooltipContent | null>(null)
  const [visible, setVisible] = useState(false)
  const [pointer, setPointer] = useState({ x: 0, y: 0 })
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const findTarget = (event: PointerEvent) =>
      (event.target as Element | null)?.closest?.('[data-tooltip-title]') as TooltipTarget | null

    const show = (event: PointerEvent) => {
      const target = findTarget(event)
      if (!target) return

      const nextContent = readTooltipContent(target)
      if (!nextContent) return

      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }

      setPointer({ x: event.clientX, y: event.clientY })
      setContent(nextContent)
      setVisible(true)
    }

    const move = (event: PointerEvent) => {
      if (!findTarget(event)) return
      setPointer({ x: event.clientX, y: event.clientY })
    }

    const hide = (event: PointerEvent) => {
      const target = findTarget(event)
      if (!target) return

      const relatedTarget = event.relatedTarget as Element | null
      if (relatedTarget && target.contains(relatedTarget)) return

      setVisible(false)
      hideTimerRef.current = window.setTimeout(() => {
        setContent(null)
        hideTimerRef.current = null
      }, 200)
    }

    document.addEventListener('pointerover', show)
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerout', hide)

    return () => {
      document.removeEventListener('pointerover', show)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerout', hide)
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current)
      }
    }
  }, [])

  useLayoutEffect(() => {
    const rect = tooltipRef.current?.getBoundingClientRect()
    setPosition(
      clampTooltipPosition(pointer, {
        height: rect?.height ?? 0,
        width: rect?.width ?? 0,
      }),
    )
  }, [pointer])

  if (!content || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="dashboard-tooltip"
      data-visible={visible ? 'true' : 'false'}
      ref={tooltipRef}
      style={{ left: position.x, top: position.y }}
    >
      <div className="dashboard-tooltip-title">{content.title}</div>
      {content.body ? <div className="dashboard-tooltip-body">{content.body}</div> : null}
      {content.rows?.length ? (
        <div className="dashboard-tooltip-rows">
          {content.rows.map((row) => (
            <div className="dashboard-tooltip-row" key={`${row.label}-${row.value}`}>
              <span className="dashboard-tooltip-label">{row.label}</span>
              <span className="dashboard-tooltip-value" data-tone={row.tone ?? 'cyan'}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {content.actions?.length ? (
        <div className="dashboard-tooltip-actions">
          {content.actions.map((action) => (
            <span className="dashboard-tooltip-action" key={action}>
              {action}
            </span>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  )
}
