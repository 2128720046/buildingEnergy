'use client'

import { ChevronLeft, RotateCcw, X } from 'lucide-react'
import Image from 'next/image'
import { cn } from '../../../lib/utils'

interface PanelWrapperProps {
  title: string
  icon?: string
  onClose?: () => void
  onReset?: () => void
  onBack?: () => void
  children: React.ReactNode
  className?: string
  width?: number | string
}

export function PanelWrapper({
  title,
  icon,
  onClose,
  onReset,
  onBack,
  children,
  className,
  width = 320, // default width
}: PanelWrapperProps) {
  const panelTop = 'var(--host-editor-panel-top, 124px)'

  return (
    <div
      className={cn(
        'pointer-events-auto fixed right-4 z-[240] flex flex-col overflow-hidden rounded-xl border border-border/50 bg-sidebar/95 shadow-2xl backdrop-blur-xl transition-[right] duration-200 dark:text-foreground',
        className,
      )}
      style={{
        width,
        ['--host-editor-panel-width' as string]: typeof width === 'number' ? `${width}px` : String(width),
        top: panelTop,
        height: `calc(100dvh - ${panelTop})`,
        right: 'calc(1rem + var(--host-editor-panel-avoid-right, 0px))',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-border/50 border-b px-3 py-3">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              className="mr-1 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#3e3e3e] hover:text-foreground"
              onClick={onBack}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {icon && (
            <Image alt="" className="shrink-0 object-contain" height={16} src={icon} width={16} />
          )}
          <h2 className="truncate font-semibold text-foreground text-sm tracking-tight">{title}</h2>
        </div>

        <div className="flex items-center gap-1">
          {onReset && (
            <button
              className="flex h-7 w-7 items-center justify-center rounded-md bg-[#2C2C2E] text-muted-foreground transition-colors hover:bg-[#3e3e3e] hover:text-foreground"
              onClick={onReset}
              type="button"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          {onClose && (
            <button
              className="flex h-7 w-7 items-center justify-center rounded-md bg-[#2C2C2E] text-muted-foreground transition-colors hover:bg-[#3e3e3e] hover:text-foreground"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  )
}
