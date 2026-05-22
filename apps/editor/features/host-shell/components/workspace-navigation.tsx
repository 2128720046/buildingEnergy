'use client'

import type { HostWorkspace } from '@/features/host-shell/lib/host-workspaces'
import { HOST_WORKSPACES } from '@/features/host-shell/lib/host-workspaces'
import { cn } from '@/lib/utils'

function EnergyIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden="true" className={cn('h-4 w-4', active ? 'text-[#00F5FF]' : 'text-white/30')} viewBox="0 0 24 24">
      <path d="M12.5 3.5 7 13h4l-.5 7.5L17 11h-4.25L12.5 3.5Z" fill="currentColor" />
    </svg>
  )
}
function ChartIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden="true" className={cn('h-4 w-4', active ? 'text-[#00F5FF]' : 'text-white/30')} viewBox="0 0 24 24">
      <path d="M5 18.25h14v1.5H5Zm1-2.5V9.5h1.75v6.25Zm5 0V5.5h1.75v10.25Zm5 0v-4.5h1.75v4.5Z" fill="currentColor" />
    </svg>
  )
}
function OperationsIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden="true" className={cn('h-4 w-4', active ? 'text-[#FFB300]' : 'text-white/30')} viewBox="0 0 24 24">
      <path d="M12 4.25a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5Zm-5 8.25h10A2.75 2.75 0 0 1 19.75 15v4.75h-1.5V15a1.25 1.25 0 0 0-1.25-1.25H7A1.25 1.25 0 0 0 5.75 15v4.75h-1.5V15A2.75 2.75 0 0 1 7 12.5Z" fill="currentColor" />
    </svg>
  )
}

function WorkspaceIcon({ active, workspace }: { active: boolean; workspace: HostWorkspace }) {
  if (workspace === 'energy-query') return <EnergyIcon active={active} />
  if (workspace === 'data-analysis') return <ChartIcon active={active} />
  return <OperationsIcon active={active} />
}

export interface WorkspaceNavigationProps {
  activeWorkspace: HostWorkspace
  onChange: (workspace: HostWorkspace) => void
}

export default function WorkspaceNavigation({ activeWorkspace, onChange }: WorkspaceNavigationProps) {
  return (
    <nav aria-label="Workspace navigation" className="flex flex-wrap gap-1 rounded-lg border border-white/6 bg-[#030712]/70 p-1 backdrop-blur-md">
      {HOST_WORKSPACES.map((workspace) => {
        const isActive = workspace.key === activeWorkspace
        return (
          <button
            className={cn('inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold uppercase tracking-[0.1em] transition-all', isActive ? 'cyber-tab-active' : 'cyber-tab')}
            key={workspace.key}
            onClick={() => onChange(workspace.key)}
            type="button"
          >
            <WorkspaceIcon active={isActive} workspace={workspace.key} />
            <span>{workspace.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
