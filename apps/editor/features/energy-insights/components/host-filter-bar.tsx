'use client'

import { cn } from '@/lib/utils'
import type { HostFilterOption, HostQueryFilters } from '@/features/energy-insights/lib/host-query'

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 text-slate-400" viewBox="0 0 24 24">
      <path
        d="M10.5 4a6.5 6.5 0 1 0 4.03 11.6l4.44 4.43 1.06-1.06-4.43-4.44A6.5 6.5 0 0 0 10.5 4Zm0 1.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"
        fill="currentColor"
      />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path
        d="M4 6.25c0-.41.34-.75.75-.75h14.5a.75.75 0 0 1 .53 1.28l-5.03 5.03v4.94a.75.75 0 0 1-.4.66l-3 1.5A.75.75 0 0 1 10 18.25v-6.44L4.22 6.78A.75.75 0 0 1 4 6.25Z"
        fill="currentColor"
      />
    </svg>
  )
}

function ResetIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path
        d="M12 4a8 8 0 1 1-7.75 10h1.56A6.5 6.5 0 1 0 7 7.73V11H5.5V5.5H11V7H8.06A7.96 7.96 0 0 1 12 4Z"
        fill="currentColor"
      />
    </svg>
  )
}

export interface HostFilterBarProps {
  filters: HostQueryFilters
  levelOptions: HostFilterOption[]
  zoneOptions: HostFilterOption[]
  resultCount: number
  onFiltersChange: (nextFilters: HostQueryFilters) => void
  onQuery: () => void
  hasQueried?: boolean
  variant?: 'floating' | 'sidebar'
}

export default function HostFilterBar({
  filters,
  levelOptions,
  zoneOptions,
  resultCount,
  onFiltersChange,
  onQuery,
  hasQueried = false,
  variant = 'floating',
}: HostFilterBarProps) {
  const isSidebar = variant === 'sidebar'

  const updateField = <K extends keyof HostQueryFilters>(field: K, value: HostQueryFilters[K]) => {
    onFiltersChange({
      ...filters,
      [field]: value,
    })
  }

  return (
    <section
      className={cn(
        isSidebar
          ? 'rounded-none border-0 bg-transparent p-0 shadow-none'
          : 'rounded-[24px] border border-white/70 bg-white/88 p-3 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl',
      )}
    >
      <div className={cn('gap-3', isSidebar ? 'flex flex-col items-stretch' : 'flex flex-wrap items-center')}>
        <div
          className={cn(
            'flex min-w-[220px] flex-1 items-center gap-2 rounded-2xl px-3 py-2',
            isSidebar
              ? 'border border-slate-200 bg-white text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.04)]'
              : 'border border-slate-200/80 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
          )}
        >
          <SearchIcon />
          <input
            className={cn(
              'w-full bg-transparent text-sm outline-none',
              isSidebar
                ? 'text-slate-700 placeholder:text-slate-400'
                : 'text-slate-700 placeholder:text-slate-400',
            )}
            onChange={(event) => updateField('keyword', event.target.value)}
            placeholder="按楼层、房间或构件名称搜索"
            value={filters.keyword}
          />
        </div>

        <div
          className={cn(
            'flex items-center gap-2 rounded-2xl px-3 py-2 text-xs',
            isSidebar
              ? 'w-fit border border-slate-200 bg-slate-50 text-slate-500'
              : 'border border-slate-200/80 bg-slate-50/90 text-slate-500',
          )}
        >
          <FilterIcon />
          当前结果 {resultCount} 条
        </div>
      </div>

      <div
        className={cn(
          'mt-3 grid gap-3',
          isSidebar
            ? 'grid-cols-1 sm:grid-cols-2'
            : 'grid-cols-1 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]',
        )}
      >
        <label className="flex flex-col gap-1.5">
          <span
            className={cn(
              'text-[11px] font-semibold tracking-[0.18em] uppercase',
              isSidebar ? 'text-slate-500' : 'text-slate-500',
            )}
          >
            楼层
          </span>
          <select
            className={cn(
              'rounded-2xl px-3 py-2 text-sm outline-none',
              isSidebar
                ? 'border border-slate-200 bg-white text-slate-700 focus:border-slate-400'
                : 'border border-slate-200/80 bg-white text-slate-700 focus:border-slate-400',
            )}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                levelId: event.target.value,
                // Switching floor invalidates current room filter; clear it eagerly.
                zoneId: '',
              })
            }
            value={filters.levelId}
          >
            <option value="">全部楼层</option>
            {levelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span
            className={cn(
              'text-[11px] font-semibold tracking-[0.18em] uppercase',
              isSidebar ? 'text-slate-500' : 'text-slate-500',
            )}
          >
            房间
          </span>
          <select
            className={cn(
              'rounded-2xl px-3 py-2 text-sm outline-none',
              isSidebar
                ? 'border border-slate-200 bg-white text-slate-700 focus:border-slate-400'
                : 'border border-slate-200/80 bg-white text-slate-700 focus:border-slate-400',
            )}
            onChange={(event) => updateField('zoneId', event.target.value)}
            value={filters.zoneId}
          >
            <option value="">全部房间</option>
            {zoneOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span
            className={cn(
              'text-[11px] font-semibold tracking-[0.18em] uppercase',
              isSidebar ? 'text-slate-500' : 'text-slate-500',
            )}
          >
            时间
          </span>
          <select
            className={cn(
              'rounded-2xl px-3 py-2 text-sm outline-none',
              isSidebar
                ? 'border border-slate-200 bg-white text-slate-700 focus:border-slate-400'
                : 'border border-slate-200/80 bg-white text-slate-700 focus:border-slate-400',
            )}
            onChange={(event) => updateField('timeRange', event.target.value)}
            value={filters.timeRange}
          >
            <option value="24h">近 24 小时</option>
            <option value="7d">近 7 天</option>
            <option value="30d">近 30 天</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span
            className={cn(
              'text-[11px] font-semibold tracking-[0.18em] uppercase',
              isSidebar ? 'text-slate-500' : 'text-slate-500',
            )}
          >
            能耗等级
          </span>
          <select
            className={cn(
              'rounded-2xl px-3 py-2 text-sm outline-none',
              isSidebar
                ? 'border border-slate-200 bg-white text-slate-700 focus:border-slate-400'
                : 'border border-slate-200/80 bg-white text-slate-700 focus:border-slate-400',
            )}
            onChange={(event) => updateField('energyLevel', event.target.value)}
            value={filters.energyLevel}
          >
            <option value="">全部等级</option>
            <option value="高">高</option>
            <option value="中">中</option>
            <option value="低">低</option>
          </select>
        </label>

        <div className={cn('grid gap-3', isSidebar ? 'sm:col-span-2 grid-cols-2' : 'grid-cols-2')}>
          <button
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 font-medium text-sm transition-transform hover:-translate-y-0.5',
              isSidebar
                ? 'border border-slate-200 bg-slate-900 text-white shadow-[0_12px_24px_rgba(15,23,42,0.12)] hover:bg-slate-800'
                : 'bg-slate-900 text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)]',
            )}
            onClick={onQuery}
            type="button"
          >
            <FilterIcon />
            {hasQueried ? '重新查询' : '开始查询'}
          </button>

          <button
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 font-medium text-sm transition-transform hover:-translate-y-0.5',
              isSidebar
                ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
            )}
            onClick={() =>
              onFiltersChange({
                keyword: '',
                levelId: '',
                zoneId: '',
                timeRange: '24h',
                energyLevel: '',
              })
            }
            type="button"
          >
            <ResetIcon />
            重置筛选
          </button>
        </div>
      </div>
    </section>
  )
}
