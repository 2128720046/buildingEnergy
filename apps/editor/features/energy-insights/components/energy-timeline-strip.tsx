'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import type { HourlyEnergyRecord } from '@/features/energy-insights/lib/energy-mock-data'
import { ChevronDown, ChevronLeft, ChevronRight, Calendar, Play, Pause, Zap, Thermometer, Droplets, Users } from 'lucide-react'

export interface TimelineState { date: string; hour: number }
export interface EnergyTimelineProps {
  date: string; hour: number; hourlySamples: HourlyEnergyRecord[] | null
  onChange: (state: TimelineState) => void; className?: string; onPlaybackChange?: (playing: boolean) => void
}

function todayStr(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function parseYMD(s: string) { const [y, m, d] = s.split('-'); return { year: Number(y), month: Number(m) - 1, day: Number(d) } }
function fromYMD(y: number, m: number, d: number) { const date = new Date(y, m, d); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function shiftDay(dateStr: string, days: number): string { const d = new Date(dateStr); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function shiftMonth(y: number, m: number, delta: number) { const next = new Date(y, m + delta, 1); return { year: next.getFullYear(), month: next.getMonth() } }
function daysInMonth(y: number, m: number) { return 32 - new Date(y, m, 32).getDate() }
function firstDayOfWeek(y: number, m: number) { return new Date(y, m, 1).getDay() }
function hourLabel(h: number) { return `${String(h).padStart(2, '0')}:00` }

function useAutoPlay(hour: number, onTick: (h: number) => void) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hourRef = useRef(hour); hourRef.current = hour
  const onTickRef = useRef(onTick); onTickRef.current = onTick
  const start = useCallback(() => { if (intervalRef.current) return; intervalRef.current = setInterval(() => { onTickRef.current((hourRef.current + 1) % 24) }, 2500) }, [])
  const stop = useCallback(() => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null } }, [])
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])
  return { start, stop }
}

function CalendarPopup({ date, onSelect, onClose, triggerRef }: { date: string; onSelect: (d: string) => void; onClose: () => void; triggerRef: RefObject<HTMLElement | null> }) {
  const current = parseYMD(date)
  const [view, setView] = useState({ year: current.year, month: current.month })
  const today = parseYMD(todayStr())
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

  useEffect(() => { let attempts = 0; const max = 5
    const recalc = () => { const el = triggerRef.current; if (!el) { if (attempts < max) { attempts++; requestAnimationFrame(recalc) } return }
      const rect = el.getBoundingClientRect(); if (rect.width === 0 || rect.height === 0) { if (attempts < max) { attempts++; requestAnimationFrame(recalc) } return }
      setPosition({ top: Math.min(rect.bottom + 6, window.innerHeight - 400), left: Math.max(12, Math.min(rect.left, window.innerWidth - 280)) }) }
    recalc(); window.addEventListener('resize', recalc); window.addEventListener('scroll', recalc, true)
    return () => { window.removeEventListener('resize', recalc); window.removeEventListener('scroll', recalc, true) } }, [triggerRef])

  const cells = useMemo(() => { const total = daysInMonth(view.year, view.month); const startDow = firstDayOfWeek(view.year, view.month)
    const all: Array<{ day: number; outside: boolean }> = []
    const prevDays = daysInMonth(view.year, view.month - 1); for (let i = startDow - 1; i >= 0; i--) all.push({ day: prevDays - i, outside: true })
    for (let d = 1; d <= total; d++) all.push({ day: d, outside: false })
    const rem = 7 - (all.length % 7); if (rem < 7) for (let d = 1; d <= rem; d++) all.push({ day: d, outside: true })
    const rows: Array<Array<{ day: number; outside: boolean }>> = []; for (let i = 0; i < all.length; i += 7) rows.push(all.slice(i, i + 7))
    return rows }, [view])

  useEffect(() => { const handler = (e: MouseEvent) => { const t = e.target as HTMLElement; if (t.closest('[data-cal-popup]')) return; onClose() }
    document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler) }, [onClose])

  if (!position) return null

  const CAL_W = 280; const CELL_H = 36; const GAP = 2; const PAD = 14

  return (
    <div className="z-[100] rounded border border-white/8 bg-[#030712] shadow-[0_24px_60px_rgba(0,0,0,0.85)]" data-cal-popup
      style={{ position: 'fixed', top: position.top, left: position.left, width: `${CAL_W}px`, padding: `${PAD}px`, boxSizing: 'border-box', maxHeight: 'min(460px, 90vh)', overflowY: 'auto', overflowX: 'hidden' }}>
      <div className="whitespace-nowrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))} type="button" style={{ flex: '0 0 24px', height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer' }}><ChevronLeft style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.5)' }} /></button>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{view.year} {MONTHS[view.month]}</span>
        <button onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))} type="button" style={{ flex: '0 0 24px', height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer' }}><ChevronRight style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.5)' }} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: `${GAP}px`, marginBottom: 2, textAlign: 'center', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)' }}>
        {['日','一','二','三','四','五','六'].map((d) => <span key={d} style={{ padding: '4px 0', lineHeight: 1 }}>{d}</span>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${GAP}px` }}>
        {cells.map((row, ri) => (
          <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: `${GAP}px` }}>
            {row.map((cell, ci) => {
              const cellDate = fromYMD(view.year, view.month, cell.day); const isSel = date === cellDate
              const isTdy = cellDate === fromYMD(today.year, today.month, today.day); const isOut = cell.outside
              let bg = 'transparent'; let color = isOut ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.55)'; let bd = 'none'; let bs = 'none'
              if (isSel) { bg = 'rgba(92,148,187,0.2)'; color = 'rgba(255,255,255,0.9)'; bd = '1px solid rgba(92,148,187,0.4)'; bs = '0 0 8px rgba(92,148,187,0.2)' }
              else if (isTdy) { bd = '1px solid rgba(255,255,255,0.15)'; color = 'rgba(255,255,255,0.7)' }
              return <button disabled={isOut} key={ci} onClick={() => { if (!isOut) { onSelect(cellDate); onClose() } }}
                style={{ height: `${CELL_H}px`, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: bd, background: bg, color, fontSize: 12, fontWeight: isSel ? 600 : 400, lineHeight: 1, boxShadow: bs, cursor: isOut ? 'default' : 'pointer' }} type="button">{cell.day}</button>
            })}
          </div>))}
      </div>
      <button onClick={() => { onSelect(todayStr()); onClose() }} style={{ width: '100%', marginTop: 10, padding: '6px 0', borderRadius: 4, border: '1px solid rgba(255,255,255,0.06)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }} type="button">回到今天</button>
    </div>
  )
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)

export default function EnergyTimelineStrip({ date, hour, hourlySamples, onChange, className, onPlaybackChange }: EnergyTimelineProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const dateBtnRef = useRef<HTMLButtonElement>(null)
  const goToHour = useCallback((h: number) => onChange({ date, hour: ((h % 24) + 24) % 24 }), [date, onChange])
  const { start, stop } = useAutoPlay(hour, goToHour)
  const togglePlayback = useCallback(() => { setIsPlaying((prev) => { const next = !prev; if (prev) stop(); else start(); onPlaybackChange?.(next); return next }) }, [onPlaybackChange, start, stop])
  const activeSample = hourlySamples?.[hour] ?? null
  const today = todayStr(); const isToday = date === today
  const pd = parseYMD(date)

  return (
    <div className={cn('pointer-events-auto relative z-30 w-full select-none', className)}>
      <div className="relative rounded border border-white/6 bg-[#061522]/60 backdrop-blur-sm" style={{ overflow: 'clip' }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="flex items-stretch">
          <div className="relative flex shrink-0 items-center gap-1.5 border-r border-white/6 px-3 py-2.5">
            <button aria-label="Previous day" className="flex h-8 w-8 items-center justify-center rounded border border-white/8 text-white/40 transition hover:border-white/15 hover:text-white/70" onClick={() => onChange({ date: shiftDay(date, -1), hour })} type="button"><ChevronLeft className="h-3.5 w-3.5" /></button>
            <button ref={dateBtnRef} className="group flex min-w-[108px] flex-col items-center gap-0.5 rounded px-2 py-1 transition hover:bg-white/5" onClick={() => setCalendarOpen((v) => !v)} type="button">
              <div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-white/35" /><span className="font-semibold text-[12px] text-white/75">{pd.year}年{pd.month + 1}月{pd.day}日</span><ChevronDown className={cn('h-3 w-3 text-white/25 transition-transform', calendarOpen && 'rotate-180')} /></div>
              {isToday ? <span className="rounded-full bg-white/5 px-2 py-px text-[9px] text-white/40">今天</span> : null}
            </button>
            <button aria-label="Next day" className="flex h-8 w-8 items-center justify-center rounded border border-white/8 text-white/40 transition hover:border-white/15 hover:text-white/70" onClick={() => onChange({ date: shiftDay(date, 1), hour })} type="button"><ChevronRight className="h-3.5 w-3.5" /></button>
            {calendarOpen && typeof document !== 'undefined' ? createPortal(<CalendarPopup date={date} onClose={() => setCalendarOpen(false)} onSelect={(d) => onChange({ date: d, hour })} triggerRef={dateBtnRef} />, document.body) : null}
          </div>
          <div className="relative flex min-w-0 flex-1 items-center overflow-visible">
            <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-white/3 via-white/10 to-white/3" />
            <div className="relative z-10 flex w-full items-center justify-between px-1">
              {HOURS.map((h) => { const isActive = h === hour; const isMajor = h % 6 === 0
                return <button aria-label={`${hourLabel(h)}${isActive ? ' selected' : ''}`} className="group relative flex h-12 w-4 flex-col items-center justify-center" key={h} onClick={() => { if (isPlaying) { stop(); setIsPlaying(false); onPlaybackChange?.(false) } goToHour(h) }} type="button">
                  <span className="absolute inset-0" />
                  <span className={cn('relative block rounded-full transition-all duration-200', isMajor ? 'h-2.5 w-[3px]' : 'h-1.5 w-[2px]', isActive ? 'bg-[#00F5FF]' : 'bg-white/15 group-hover:bg-white/30')} />
                  <span className={cn('relative block rounded-full transition-all duration-200', isActive ? 'mt-1 h-[11px] w-[11px] bg-[#00F5FF] shadow-[0_0_12px_rgba(92,148,187,0.4)] ring-[3px] ring-[#00F5FF]/30' : isMajor ? 'mt-1 h-[7px] w-[7px] bg-white/25 group-hover:bg-white/40' : 'mt-1 h-[5px] w-[5px] bg-white/15 group-hover:bg-white/30')} />
                  <span className={cn('relative mt-0.5 text-[8px] transition-colors duration-200', isActive ? 'font-semibold text-[#00F5FF]' : isMajor ? 'text-white/25 group-hover:text-white/40' : 'text-white/15 group-hover:text-white/30')}>{isMajor || isActive || h % 3 === 0 ? h : ''}</span>
                </button> })}
            </div>
            <div className="ml-1 flex shrink-0 items-center pr-1.5">
              <button aria-label={isPlaying ? 'Pause' : 'Play'} className={cn('flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200', isPlaying ? 'bg-[#00F5FF]/20 text-[#00F5FF]' : 'border border-white/8 text-white/30 hover:border-white/15 hover:text-white/60')} onClick={togglePlayback} type="button">{isPlaying ? <Pause className="h-3 w-3" /> : <Play className="ml-0.5 h-3 w-3" />}</button>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 border-l border-white/6 px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <div className="rounded bg-[#00F5FF]/10 px-2 py-1"><span className="font-mono font-semibold text-[13px] text-white/90">{hourLabel(hour)}</span></div>
              {activeSample ? (
                <div className="flex items-center gap-2.5 pl-1">
                  <div className="flex items-center gap-1"><Zap className="h-3 w-3 text-white/50" /><span className="font-mono font-medium text-[11px] text-white/80">{activeSample.electricity_kwh.toFixed(2)}<span className="text-[9px] text-white/30"> kWh</span></span></div>
                  <div className="flex items-center gap-1"><Thermometer className="h-3 w-3 text-white/40" /><span className="font-mono font-medium text-[11px] text-white/70">{activeSample.indoor_temp_c}°</span></div>
                  <div className="flex items-center gap-1"><Droplets className="h-3 w-3 text-white/40" /><span className="font-mono font-medium text-[11px] text-white/70">{activeSample.water_m3.toFixed(3)}<span className="text-[9px] text-white/30"> m3</span></span></div>
                  <div className="flex items-center gap-1"><Users className="h-3 w-3 text-white/40" /><span className="font-mono font-medium text-[11px] text-white/70">{activeSample.occupancy_count}</span></div>
                </div>
              ) : <span className="text-[10px] italic text-white/20">等待数据</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
