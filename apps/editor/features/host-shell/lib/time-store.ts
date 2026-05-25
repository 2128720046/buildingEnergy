'use client'

import { useSyncExternalStore } from 'react'

let currentNow = new Date()
let timer: number | null = null
const listeners = new Set<() => void>()

function emit() {
  currentNow = new Date()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (typeof window !== 'undefined' && timer === null) {
    timer = window.setInterval(emit, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  }
}

function getSnapshot() {
  return currentNow
}

export function useNow() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function ClockText({
  className,
  format,
}: {
  className?: string
  format: (date: Date) => string
}) {
  const now = useNow()
  return <span className={className}>{format(now)}</span>
}
