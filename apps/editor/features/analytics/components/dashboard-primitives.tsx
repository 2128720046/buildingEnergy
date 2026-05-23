'use client'

import Image from 'next/image'
import type { CSSProperties, ReactNode } from 'react'
import {
  CARD_FRAME_BY_SIZE,
  type CardSize,
  DASHBOARD_ASSETS,
  DASHBOARD_COLORS,
  DASHBOARD_FONTS,
} from './dashboard-theme'

export function VideoBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{ backgroundColor: DASHBOARD_COLORS.bgDeep }}
    >
      <video
        autoPlay
        className="h-full w-full object-cover opacity-35"
        loop
        muted
        playsInline
        preload="auto"
      >
        <source src={DASHBOARD_ASSETS.videoBg} type="video/mp4" />
        <source src={DASHBOARD_ASSETS.videoBgFallback} type="video/mp4" />
      </video>
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 80% at 50% 0%, rgba(0, 212, 255, 0.18) 0%, transparent 55%),
            radial-gradient(100% 70% at 50% 100%, rgba(10, 37, 64, 0.86) 0%, transparent 60%),
            linear-gradient(180deg, rgba(2, 8, 23, 0.58) 0%, rgba(2, 8, 23, 0.78) 100%)`,
        }}
      />
    </div>
  )
}

export interface BevelCardProps {
  children: ReactNode
  className?: string
  size?: CardSize
  style?: CSSProperties
  withCorners?: boolean
  contentClassName?: string
}

export function BevelCard({
  children,
  className,
  size = 'medium',
  style,
  withCorners = false,
  contentClassName,
}: BevelCardProps) {
  const frame = CARD_FRAME_BY_SIZE[size]

  return (
    <div
      className={`glass-panel relative overflow-hidden ${className ?? ''}`}
      style={{
        backgroundImage: `linear-gradient(135deg, rgba(8, 38, 68, 0.7), rgba(3, 11, 28, 0.46) 42%, rgba(1, 22, 40, 0.72)), url(${frame})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        ...style,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-px"
        style={{
          background:
            'linear-gradient(135deg, rgba(122,247,255,0.1), transparent 30%, rgba(0,212,255,0.08) 68%, transparent)',
          boxShadow:
            'inset 0 0 32px rgba(0, 212, 255, 0.08), inset 0 1px 0 rgba(221, 251, 255, 0.12)',
        }}
      />
      {withCorners ? (
        <>
          <CornerPiece position="tl" />
          <CornerPiece position="tr" />
          <CornerPiece position="bl" />
          <CornerPiece position="br" />
        </>
      ) : null}
      <div className={`relative h-full w-full ${contentClassName ?? ''}`}>{children}</div>
    </div>
  )
}

function CornerPiece({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const base: CSSProperties = {
    position: 'absolute',
    width: 24,
    height: 24,
    pointerEvents: 'none',
  }
  const rotation: Record<typeof position, number> = {
    tl: 0,
    tr: 90,
    br: 180,
    bl: 270,
  }
  const placement: Record<typeof position, CSSProperties> = {
    tl: { top: 6, left: 6 },
    tr: { top: 6, right: 6 },
    br: { bottom: 6, right: 6 },
    bl: { bottom: 6, left: 6 },
  }
  return (
    <Image
      alt=""
      aria-hidden
      className="select-none"
      height={24}
      src={DASHBOARD_ASSETS.cornerDecor1}
      style={{ ...base, ...placement[position], transform: `rotate(${rotation[position]}deg)` }}
      width={24}
    />
  )
}

export interface SectionHeaderProps {
  title: string
  eyebrow?: string
  description?: string
  rightSlot?: ReactNode
  divider?: 1 | 2 | 3 | 4 | 5 | 6
}

const DIVIDERS = [
  DASHBOARD_ASSETS.divider1,
  DASHBOARD_ASSETS.divider2,
  DASHBOARD_ASSETS.divider3,
  DASHBOARD_ASSETS.divider4,
  DASHBOARD_ASSETS.divider5,
  DASHBOARD_ASSETS.divider6,
]

export function SectionHeader({
  title,
  eyebrow,
  description,
  rightSlot,
  divider = 1,
}: SectionHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex-1">
        {eyebrow ? (
          <div
            className="text-[11px] font-semibold tracking-[0.24em] uppercase"
            style={{ color: DASHBOARD_COLORS.textMuted, fontFamily: DASHBOARD_FONTS.num }}
          >
            {eyebrow}
          </div>
        ) : null}
        <h3
          className="mt-2 text-[16px] font-bold leading-tight"
          style={{ color: DASHBOARD_COLORS.textPrimary, fontFamily: DASHBOARD_FONTS.cn }}
        >
          <span
            aria-hidden
            className="mr-2 inline-block h-3 w-1 align-middle"
            style={{ backgroundColor: DASHBOARD_COLORS.primary }}
          />
          {title}
        </h3>
        {description ? (
          <p
            className="mt-2 max-w-2xl text-[12px] leading-5"
            style={{ color: DASHBOARD_COLORS.textSecondary, fontFamily: DASHBOARD_FONTS.cn }}
          >
            {description}
          </p>
        ) : null}
        <div
          aria-hidden
          className="mt-2 h-[10px] w-full max-w-[280px] bg-no-repeat"
          style={{
            backgroundImage: `url(${DIVIDERS[divider - 1]})`,
            backgroundSize: '100% 100%',
          }}
        />
      </div>
      {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
    </header>
  )
}

export interface KpiTileProps {
  label: string
  value: string | number
  unit?: string
  detail?: string
  tone?: 'primary' | 'amber' | 'emerald' | 'rose'
  icon?: ReactNode
}

export function KpiTile({ label, value, unit, detail, tone = 'primary', icon }: KpiTileProps) {
  const accent =
    tone === 'amber'
      ? DASHBOARD_COLORS.amber
      : tone === 'emerald'
        ? DASHBOARD_COLORS.emerald
        : tone === 'rose'
          ? DASHBOARD_COLORS.rose
          : DASHBOARD_COLORS.primary

  return (
    <BevelCard className="min-h-[120px] px-5 py-4" size="kpi">
      <div className="flex items-center justify-between">
        <div
          className="text-[11px] font-medium tracking-[0.18em] uppercase"
          style={{ color: DASHBOARD_COLORS.textMuted, fontFamily: DASHBOARD_FONTS.num }}
        >
          {label}
        </div>
        {icon ? <div style={{ color: accent }}>{icon}</div> : null}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span
          className="text-[36px] font-bold leading-none tracking-tight"
          style={{ color: accent, fontFamily: DASHBOARD_FONTS.num }}
        >
          {value}
        </span>
        {unit ? (
          <span
            className="text-[12px]"
            style={{ color: DASHBOARD_COLORS.textSecondary, fontFamily: DASHBOARD_FONTS.cn }}
          >
            {unit}
          </span>
        ) : null}
      </div>
      {detail ? (
        <div
          className="mt-2 text-[11px] leading-[18px]"
          style={{ color: DASHBOARD_COLORS.textSecondary, fontFamily: DASHBOARD_FONTS.cn }}
        >
          {detail}
        </div>
      ) : null}
    </BevelCard>
  )
}

export interface PillProps {
  children: ReactNode
  tone?: 'primary' | 'amber' | 'emerald' | 'rose' | 'neutral'
}

export function Pill({ children, tone = 'neutral' }: PillProps) {
  const palette = {
    primary: { color: DASHBOARD_COLORS.primary, border: 'rgba(0, 212, 255, 0.35)' },
    amber: { color: DASHBOARD_COLORS.amber, border: 'rgba(255, 184, 0, 0.35)' },
    emerald: { color: DASHBOARD_COLORS.emerald, border: 'rgba(34, 211, 160, 0.35)' },
    rose: { color: DASHBOARD_COLORS.rose, border: 'rgba(255, 77, 109, 0.35)' },
    neutral: { color: DASHBOARD_COLORS.textSecondary, border: DASHBOARD_COLORS.borderStrong },
  }[tone]
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium"
      style={{
        backgroundColor: 'rgba(10, 37, 64, 0.5)',
        border: `1px solid ${palette.border}`,
        clipPath:
          'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
        color: palette.color,
        fontFamily: DASHBOARD_FONTS.cn,
      }}
    >
      {children}
    </span>
  )
}
