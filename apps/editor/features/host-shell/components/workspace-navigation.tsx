'use client'

import type { HostWorkspace } from '@/features/host-shell/lib/host-workspaces'
import { HOST_WORKSPACES } from '@/features/host-shell/lib/host-workspaces'
import { cn } from '@/lib/utils'

function EnergyIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('h-4 w-4', active ? 'text-sky-600' : 'text-slate-500')}
      viewBox="0 0 24 24"
    >
      <path
        d="M12.5 3.5 7 13h4l-.5 7.5L17 11h-4.25L12.5 3.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

function ChartIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('h-4 w-4', active ? 'text-emerald-600' : 'text-slate-500')}
      viewBox="0 0 24 24"
    >
      <path
        d="M5 18.25h14v1.5H5Zm1-2.5V9.5h1.75v6.25Zm5 0V5.5h1.75v10.25Zm5 0v-4.5h1.75v4.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

function OperationsIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('h-4 w-4', active ? 'text-amber-600' : 'text-slate-500')}
      viewBox="0 0 24 24"
    >
      <path
        d="M12 4.25a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5Zm-5 8.25h10A2.75 2.75 0 0 1 19.75 15v4.75h-1.5V15a1.25 1.25 0 0 0-1.25-1.25H7A1.25 1.25 0 0 0 5.75 15v4.75h-1.5V15A2.75 2.75 0 0 1 7 12.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

function WorkspaceIcon({
  active,
  workspace,
}: {
  active: boolean
  workspace: HostWorkspace
}) {
  if (workspace === 'energy-query') {
    return <EnergyIcon active={active} />
  }

  if (workspace === 'data-analysis') {
    return <ChartIcon active={active} />
  }

  return <OperationsIcon active={active} />
}

export interface WorkspaceNavigationProps {
  activeWorkspace: HostWorkspace
  mode?: 'horizontal' | 'vertical'
  tone?: 'light' | 'dark'
  onChange: (workspace: HostWorkspace) => void
}

export default function WorkspaceNavigation({
  activeWorkspace,
  mode = 'horizontal',
  tone = 'light',
  onChange,
}: WorkspaceNavigationProps) {
  const isVertical = mode === 'vertical'
  const isDark = tone === 'dark'

  return (
    <nav
      aria-label="Workspace navigation"
      className={cn(
        'rounded-[22px] p-1.5 backdrop-blur-xl',
        isDark
          ? 'border border-cyan-300/20 bg-[#07101c]/88 shadow-[0_12px_30px_rgba(2,6,23,0.35)]'
          : 'border border-white/80 bg-white/72 shadow-[0_12px_30px_rgba(15,23,42,0.06)]',
        isVertical ? 'flex w-full flex-col gap-1.5' : 'flex flex-wrap gap-2',
      )}
    >
      {HOST_WORKSPACES.map((workspace) => {
        const isActive = workspace.key === activeWorkspace

        return (
          <button
            className={cn(
              'inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition-all',
              isVertical && 'w-full justify-start',
              isActive
                ? isDark
                  ? 'bg-cyan-500/22 text-cyan-100 shadow-[0_10px_24px_rgba(8,47,73,0.35)]'
                  : 'bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)]'
                : isDark
                  ? 'text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-100'
                  : 'text-slate-600 hover:bg-white hover:text-slate-950',
            )}
            key={workspace.key}
            onClick={() => onChange(workspace.key)}
            type="button"
          >
            <WorkspaceIcon active={isActive} workspace={workspace.key} />
            <span className="font-medium">{workspace.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
