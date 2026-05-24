'use client'

import { tooltipAttrs } from '@/features/analytics/components/dashboard-tooltip'
import type { HostWorkspace } from '@/features/host-shell/lib/host-workspaces'
import { HOST_WORKSPACES } from '@/features/host-shell/lib/host-workspaces'
import { cn } from '@/lib/utils'

function EnergyIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('h-5 w-5', active ? 'text-[#00F5FF]' : 'text-white/38')}
      viewBox="0 0 24 24"
    >
      <path d="M12.5 3.5 7 13h4l-.5 7.5L17 11h-4.25L12.5 3.5Z" fill="currentColor" />
    </svg>
  )
}
function ChartIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('h-5 w-5', active ? 'text-[#00F5FF]' : 'text-white/38')}
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
      className={cn('h-5 w-5', active ? 'text-[#FFB300]' : 'text-white/38')}
      viewBox="0 0 24 24"
    >
      <path
        d="M12 4.25a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5Zm-5 8.25h10A2.75 2.75 0 0 1 19.75 15v4.75h-1.5V15a1.25 1.25 0 0 0-1.25-1.25H7A1.25 1.25 0 0 0 5.75 15v4.75h-1.5V15A2.75 2.75 0 0 1 7 12.5Z"
        fill="currentColor"
      />
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

export default function WorkspaceNavigation({
  activeWorkspace,
  onChange,
}: WorkspaceNavigationProps) {
  return (
    <nav
      aria-label="Workspace navigation"
      className="cyber-nav-shell"
      style={{ fontFamily: 'var(--font-alimama-shuhei)' }}
    >
      {HOST_WORKSPACES.map((workspace) => {
        const isActive = workspace.key === activeWorkspace
        return (
          <button
            className={cn(
              'inline-flex items-center gap-2.5 transition-all',
              isActive ? 'cyber-tab-active' : 'cyber-tab',
            )}
            key={workspace.key}
            onClick={() => onChange(workspace.key)}
            type="button"
            {...tooltipAttrs({
              rows: isActive
                ? [
                    { label: '核心指标', value: '累计耗电 / 人流 / 峰值负荷' },
                    { label: '图表模块', value: '趋势 / 时段 / 热力 / 构成' },
                    { label: '明细模块', value: '风险分层 / 监测表格 / 设备卡片' },
                  ]
                : [{ label: '模块简介', value: workspace.description }],
              title: workspace.label,
            })}
          >
            <WorkspaceIcon active={isActive} workspace={workspace.key} />
            <span>{workspace.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
