'use client'

import NumberFlow from '@number-flow/react'
import {
  AlertTriangle,
  Bot,
  ClipboardList,
  Cpu,
  Lightbulb,
  Radar,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BevelCard, VideoBackground } from '@/features/analytics/components/dashboard-primitives'
import { DASHBOARD_COLORS, DASHBOARD_FONTS } from '@/features/analytics/components/dashboard-theme'
import {
  type DashboardTooltipContent,
  DashboardTooltipLayer,
  tooltipAttrs,
} from '@/features/analytics/components/dashboard-tooltip'
import { INITIAL_GLOBAL_STATS } from '@/features/analytics/lib/global-stats'
import type { AssistantWorkOrderDraft } from '@/features/energy-insights/components/energy-assistant-chat'
import type { EnergyApiResponse } from '@/features/energy-insights/lib/energy-api'
import type { HostQueryResult } from '@/features/energy-insights/lib/host-query'
import {
  buildOperationsDashboardData,
  type OperationsAlert,
  type OperationsStrategy,
  type OperationsTask,
} from '@/features/operations/lib/operations-dashboard'
import { cn } from '@/lib/utils'

type Severity = OperationsAlert['severity']
type ToastTone = 'cyan' | 'emerald' | 'rose'

interface OperationsToast {
  body: string
  id: number
  title: string
  tone: ToastTone
}

interface LiveAlert extends OperationsAlert {
  createdAt: string
  deltaText: string
  duration: string
  historyCount: number
  inserted?: boolean
  linkedTaskId?: string
  loadText: string
  locationText: string
  similarCount: number
}

interface LiveTask extends OperationsTask {
  code: string
  createdAt: string
  estimate: string
  linkedAlertId?: string
  progress: number
  steps: string[]
  tools: string
}

interface AgentMessage {
  content: string
  id: string
  proactive?: boolean
  role: 'assistant' | 'user'
  typing?: boolean
}

const QUICK_PROMPTS = [
  '总结当前能耗情况',
  '峰值出现在什么时段？',
  '给我三条优化建议',
  '列出当前高能耗对象',
]

const AGENT_REPLIES: Record<string, string> = {
  总结当前能耗情况:
    '当前运维侧重点集中在 BLDG-APT-3F 新风机组。近 1 小时负荷高于基线约 34%，建议优先派单核查过滤器压差、送回风温差和阀门开度。',
  '峰值出现在什么时段？':
    '峰值主要出现在 14:00-16:00，与人员回流和暖通调节叠加有关。建议把巡检窗口前移到 13:30，并在峰值前复核新风策略。',
  给我三条优化建议:
    '1. 将 BLDG-APT 峰值时段加入优先巡检策略。\n2. 把高负荷告警自动关联到抢修工单。\n3. 对照明和排风回路增加夜间闭锁复核。',
  列出当前高能耗对象:
    '当前高能耗对象包括 BLDG-APT-3F 新风机组、BLDG-APT-2F 公区照明回路、BLDG-APT-B1 车库排风机。建议先处理 3F 新风机组。',
}

const PROACTIVE_INSIGHTS = [
  '检测到 BLDG-APT-3F 新风机组负荷持续走高，建议派单复核。',
  '过去 1 小时新增告警 2 条，整体健康度下降 1.2 分。',
  '建议将巡检策略调整为峰值时段优先，并保留夜间照明复核。',
]

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function randomInt(min: number, max: number) {
  return Math.floor(randomBetween(min, max + 1))
}

function stableRatio(seed: string, min: number, max: number) {
  let hash = 0

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 9973
  }

  return min + (hash / 9973) * (max - min)
}

function parseNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const match = value.match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : fallback
}

function useIntervalTick(callback: () => void, delay: number) {
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    const timer = window.setInterval(() => callbackRef.current(), delay)
    return () => window.clearInterval(timer)
  }, [delay])
}

function formatClock(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
  }).format(date)
}

function severityTone(severity: Severity): 'amber' | 'emerald' | 'rose' {
  if (severity === 'high') return 'rose'
  if (severity === 'medium') return 'amber'
  return 'emerald'
}

function severityLabel(severity: Severity) {
  if (severity === 'high') return '高优先级'
  if (severity === 'medium') return '中优先级'
  return '低优先级'
}

function severityColor(severity: Severity) {
  if (severity === 'high') return DASHBOARD_COLORS.rose
  if (severity === 'medium') return DASHBOARD_COLORS.amber
  return DASHBOARD_COLORS.emerald
}

function splitAlertDetail(detail: string) {
  const [location = 'BLDG-APT / 设备区域', load = detail] = detail.split(' · ')
  const deltaMatch = detail.match(/较基线\s*([+-]?\d+(?:\.\d+)?%)/)

  return {
    deltaText: deltaMatch?.[1] ?? '+12.0%',
    loadText: load.replace(/[（）]/g, ''),
    locationText: location,
  }
}

function normalizeBuildingLabel(title: string) {
  return title
    .replace('公寓楼 3F', 'BLDG-APT-3F')
    .replace('公寓楼 2F', 'BLDG-APT-2F')
    .replace('公寓楼 B1', 'BLDG-APT-B1')
}

function normalizeOperationsCopy(copy: string) {
  return normalizeBuildingLabel(copy)
    .replace('公寓楼-设备样本', 'BLDG-APT-设备样本')
    .replace('公寓楼', 'BLDG-APT')
}

function createLiveAlert(alert: OperationsAlert, index: number, taskId?: string): LiveAlert {
  const detail = splitAlertDetail(alert.detail)
  const minutesAgo = 8 + index * 13

  return {
    ...alert,
    ...detail,
    createdAt: formatClock(new Date(Date.now() - minutesAgo * 60_000)),
    duration: `${minutesAgo} 分钟`,
    historyCount: 2 + index,
    linkedTaskId: taskId,
    similarCount: 1 + index,
    title: normalizeBuildingLabel(alert.title),
  }
}

function createSyntheticAlert(projectId: string, linkedTaskId?: string): LiveAlert {
  const templates: Array<Omit<LiveAlert, 'createdAt' | 'duration' | 'id' | 'inserted'>> = [
    {
      detail: 'Level 3 / 西侧设备间 · 当前负荷 112.4 kWh（较基线 +29.8%）',
      deltaText: '+29.8%',
      historyCount: 4,
      linkedTaskId,
      loadText: '当前负荷 112.4 kWh 较基线 +29.8%',
      locationText: 'Level 3 / 西侧设备间',
      recommendation: '建议派发暖通巡检，核查新风阀开度与过滤器压差。',
      severity: 'high',
      similarCount: 2,
      title: 'BLDG-APT-3F 新风机组 负荷偏高',
    },
    {
      detail: 'Level 2 / 公区走廊 · 当前负荷 78.8 kWh（较基线 +16.4%）',
      deltaText: '+16.4%',
      historyCount: 3,
      linkedTaskId,
      loadText: '当前负荷 78.8 kWh 较基线 +16.4%',
      locationText: 'Level 2 / 公区走廊',
      recommendation: '建议复核照明时控策略，确认人体感应器阈值。',
      severity: 'medium',
      similarCount: 1,
      title: 'BLDG-APT-2F 公区照明回路 夜间未闭锁',
    },
  ]
  const template = templates[randomInt(0, templates.length - 1)]!

  return {
    ...template,
    createdAt: formatClock(new Date()),
    duration: '刚刚',
    id: `live-${projectId}-${Date.now()}`,
    inserted: true,
  }
}

function extractTaskCode(task: OperationsTask, index: number, projectId: string) {
  return task.title.match(/WO-[A-Z0-9-]+-\w+/)?.[0] ?? `WO-${projectId.toUpperCase()}-${31 + index}`
}

function cleanTaskTitle(task: OperationsTask) {
  return task.title.replace(/^工单\s*WO-[A-Z0-9-]+-\w+[:：]\s*/, '')
}

function createLiveTask(
  task: OperationsTask,
  index: number,
  projectId: string,
  linkedAlertId?: string,
): LiveTask {
  return {
    ...task,
    code: extractTaskCode(task, index, projectId),
    createdAt: formatClock(new Date(Date.now() - (36 + index * 18) * 60_000)),
    estimate: index === 0 ? '45 分钟' : '70 分钟',
    linkedAlertId,
    progress: clamp(46 + index * 17, 8, 88),
    steps:
      index === 0
        ? ['到场确认', '读取电流与压差', '复核送回风温差', '回填闭环记录']
        : ['远程复核策略', '现场抽查设备', '更新时控模板', '提交复盘'],
    title: cleanTaskTitle(task),
    tools: index === 0 ? '钳形表 / 压差计 / 温度探针' : '网关面板 / 巡检终端',
  }
}

function pushToast(
  setToasts: Dispatch<SetStateAction<OperationsToast[]>>,
  toast: Omit<OperationsToast, 'id'>,
) {
  const id = Date.now() + randomInt(0, 999)
  setToasts((current) => [{ ...toast, id }, ...current].slice(0, 3))
}

function AnimatedNumber({
  className,
  decimals = 0,
  style,
  suffix,
  value,
}: {
  className?: string
  decimals?: number
  style?: CSSProperties
  suffix?: string
  value: number
}) {
  const [flash, setFlash] = useState<'down' | 'up' | null>(null)
  const [deltaLabel, setDeltaLabel] = useState<string | null>(null)
  const [previous, setPrevious] = useState(value)

  useEffect(() => {
    if (value === previous) return

    const delta = value - previous
    setFlash(delta > 0 ? 'up' : 'down')
    setDeltaLabel(`${delta > 0 ? '↑+' : '↓'}${Math.abs(delta).toFixed(decimals > 0 ? 1 : 0)}`)
    setPrevious(value)

    const flashTimer = window.setTimeout(() => setFlash(null), 560)
    const deltaTimer = window.setTimeout(() => setDeltaLabel(null), 1000)
    return () => {
      window.clearTimeout(flashTimer)
      window.clearTimeout(deltaTimer)
    }
  }, [decimals, previous, value])

  return (
    <span className={cn('live-number', className)} data-flash={flash ?? undefined} style={style}>
      <NumberFlow
        format={{
          maximumFractionDigits: decimals,
          minimumFractionDigits: decimals,
        }}
        value={value}
      />
      {suffix ? <span className="live-number-unit">{suffix}</span> : null}
      {deltaLabel ? (
        <span className="live-number-delta" data-tone={flash ?? undefined}>
          {deltaLabel}
        </span>
      ) : null}
    </span>
  )
}

function MetricMiniTrend({ seed }: { seed: string }) {
  const [points, setPoints] = useState<number[]>(() =>
    Array.from({ length: 10 }, (_, index) => stableRatio(`${seed}-${index}`, 0.18, 0.86)),
  )

  useIntervalTick(() => {
    setPoints((current) => [
      ...current.slice(1),
      clamp(current[current.length - 1]! + randomBetween(-0.22, 0.22), 0.12, 0.9),
    ])
  }, 2000)

  const path = points
    .map((value, index) => {
      const x = index * 10
      const y = 22 - value * 18
      return `${index === 0 ? 'M' : 'L'}${x},${y}`
    })
    .join(' ')

  return (
    <svg
      aria-hidden="true"
      className="metric-mini-trend mt-2 h-6 w-full overflow-visible"
      preserveAspectRatio="none"
      viewBox="0 0 90 24"
    >
      <path
        d={path}
        fill="none"
        stroke="rgba(122,247,255,0.9)"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path d={`${path} L90,24 L0,24 Z`} fill="rgba(0,212,255,0.12)" stroke="none" />
      <circle cx="90" cy={22 - points[points.length - 1]! * 18} fill="#7AF7FF" r="2.2" />
    </svg>
  )
}

function OperationsToastStack({ toasts }: { toasts: OperationsToast[] }) {
  return (
    <div className="dashboard-toast-stack fixed right-5 top-[138px] z-40 flex w-[330px] flex-col gap-2">
      {toasts.map((toast) => (
        <div className="dashboard-toast" data-tone={toast.tone} key={toast.id}>
          <div className="dashboard-toast-title">{toast.title}</div>
          <div className="dashboard-toast-body">{toast.body}</div>
        </div>
      ))}
    </div>
  )
}

function PanelHeader({
  icon,
  rightSlot,
  title,
}: {
  icon: ReactNode
  rightSlot?: ReactNode
  title: string
}) {
  return (
    <header className="operations-panel-header flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="operations-panel-icon shrink-0">{icon}</span>
        <div className="min-w-0">
          <h3
            className="text-[17px] font-black leading-tight text-cyan-50"
            style={{ fontFamily: DASHBOARD_FONTS.cn }}
          >
            <span
              aria-hidden
              className="operations-title-bar mr-2 inline-block h-3.5 w-1 align-middle"
            />
            {title}
          </h3>
          <div aria-hidden className="hud-title-rail mt-2 h-[10px] w-full max-w-[280px]" />
        </div>
      </div>
      {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
    </header>
  )
}

function OperationsPanel({
  children,
  className,
  contentClassName,
  icon,
  rightSlot,
  title,
}: {
  children: ReactNode
  className?: string
  contentClassName?: string
  icon: ReactNode
  rightSlot?: ReactNode
  title: string
}) {
  return (
    <BevelCard
      className={cn('operations-hud-card px-5 py-4', className)}
      contentClassName="flex h-full flex-col"
      size="medium"
      withCorners
    >
      <span aria-hidden className="operations-card-slashes">
        {'///'}
      </span>
      <PanelHeader icon={icon} rightSlot={rightSlot} title={title} />
      <div className={cn('mt-4 min-h-0', contentClassName)}>{children}</div>
    </BevelCard>
  )
}

function StatusBadge({
  children,
  tone = 'cyan',
  tooltip,
}: {
  children: ReactNode
  tone?: ToastTone | 'amber'
  tooltip?: DashboardTooltipContent
}) {
  return (
    <span className="operations-badge" data-tone={tone} {...(tooltip ? tooltipAttrs(tooltip) : {})}>
      {children}
    </span>
  )
}

function OperationsKpiCard({
  detail,
  icon,
  label,
  numeric,
  seed,
  suffix,
  textValue,
  tone,
  tooltip,
}: {
  detail: string
  icon: ReactNode
  label: string
  numeric?: number
  seed: string
  suffix?: string
  textValue?: string
  tone: 'amber' | 'cyan' | 'emerald' | 'rose'
  tooltip: DashboardTooltipContent
}) {
  return (
    <BevelCard
      className="metric-card-interactive operations-kpi-card min-h-[142px] px-5 py-4"
      size="kpi"
      {...tooltipAttrs(tooltip)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-black tracking-[0.04em] text-cyan-100/72">{label}</div>
          <div
            className="mt-3 text-[36px] font-black leading-none text-cyan-50"
            data-tone={tone}
            style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
          >
            {typeof numeric === 'number' ? (
              <AnimatedNumber suffix={suffix} value={numeric} />
            ) : (
              <span className="operations-online-value">{textValue}</span>
            )}
          </div>
        </div>
        <span className="metric-card-icon operations-kpi-icon" data-tone={tone}>
          {icon}
        </span>
      </div>
      <div className="mt-2 text-[13px] font-semibold text-cyan-100/60">{detail}</div>
      <MetricMiniTrend seed={seed} />
    </BevelCard>
  )
}

function FocusSummary({
  alert,
  summary,
  onFocusAlert,
}: {
  alert?: LiveAlert
  onFocusAlert: (id: string) => void
  summary: string
}) {
  const keyword = alert?.title.replace(' 负荷偏高', '') ?? 'BLDG-APT-3F 新风机组'
  const normalizedSummary = normalizeOperationsCopy(summary)
  const hasKeyword = normalizedSummary.includes(keyword)
  const [before = '', ...rest] = hasKeyword ? normalizedSummary.split(keyword) : []
  const after = rest.join(keyword)

  return (
    <OperationsPanel
      icon={<Sparkles className="h-5 w-5" strokeWidth={1.8} />}
      title="运维焦点建议"
      contentClassName="flex-1"
    >
      <div
        className="operations-focus-copy relative min-h-[96px] border border-cyan-300/24 bg-cyan-950/20 px-4 py-4 text-[17px] leading-8 text-cyan-50/86"
        {...tooltipAttrs({
          rows: [
            { label: '建议来源', value: '告警优先级 / 工单状态 / 峰值负荷' },
            { label: '联动对象', value: keyword },
            { label: '点击动作', value: '高亮告警中心对应项' },
          ],
          title: '运维焦点建议',
        })}
      >
        <span className="operations-focus-rail" />
        <span className="operations-typewriter">
          {hasKeyword ? before : '当前最值得优先处理的是 '}
          <button
            className="operations-focus-keyword"
            onClick={() => alert && onFocusAlert(alert.id)}
            type="button"
          >
            {keyword}
          </button>
          {hasKeyword ? after : '，建议把它作为智慧运维的首个告警闭环样板。'}
        </span>
      </div>
    </OperationsPanel>
  )
}

function AlertCard({
  alert,
  highlighted,
  onHighlightTask,
  pulse,
}: {
  alert: LiveAlert
  highlighted: boolean
  onHighlightTask: (id: string | null) => void
  pulse: boolean
}) {
  const tone = severityTone(alert.severity)

  return (
    <article
      className="operations-alert-card group relative overflow-hidden border bg-cyan-950/20 p-4"
      data-highlighted={highlighted ? 'true' : undefined}
      data-new={alert.inserted || pulse ? 'true' : undefined}
      data-severity={alert.severity}
      onPointerEnter={() => onHighlightTask(alert.linkedTaskId ?? null)}
      onPointerLeave={() => onHighlightTask(null)}
      {...tooltipAttrs({
        actions: ['立即派单', '忽略'],
        rows: [
          { label: '首次触发', value: alert.createdAt },
          {
            label: '持续时长',
            tone: alert.severity === 'high' ? 'rose' : 'cyan',
            value: alert.duration,
          },
          { label: '历史发生', value: `${alert.historyCount} 次` },
          { label: '同设备类似告警', value: `${alert.similarCount} 条` },
          { label: '关联工单', value: alert.linkedTaskId ? '已关联' : '待派单' },
        ],
        title: alert.title,
      })}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-[17px] font-black leading-6 text-cyan-50">{alert.title}</h4>
          <div className="mt-2 text-[13px] font-semibold leading-5 text-cyan-100/62">
            {alert.locationText} · {alert.loadText}{' '}
            <span className="operations-delta" data-tone={tone}>
              ↑ {alert.deltaText}
            </span>
          </div>
        </div>
        <StatusBadge
          tone={tone}
          tooltip={{
            rows: [
              {
                label: '定义',
                value:
                  alert.severity === 'high'
                    ? '需 30 分钟内响应'
                    : alert.severity === 'medium'
                      ? '当班复核'
                      : '纳入巡检观察',
              },
              {
                label: 'SLA',
                value:
                  alert.severity === 'high'
                    ? '30 分钟'
                    : alert.severity === 'medium'
                      ? '4 小时'
                      : '24 小时',
              },
            ],
            title: severityLabel(alert.severity),
          }}
        >
          {severityLabel(alert.severity)}
        </StatusBadge>
      </div>
      <div className="mt-3 border-l border-dashed border-cyan-300/55 bg-cyan-950/24 px-3 py-2 text-[13px] leading-6 text-cyan-50/78">
        {alert.recommendation}
      </div>
      <div className="operations-alert-actions mt-3 flex justify-end gap-2">
        <button type="button">立即派单</button>
        <button type="button">忽略</button>
      </div>
    </article>
  )
}

function AlertCenter({
  alerts,
  highlightedAlertId,
  onHighlightTask,
  pulseAlertId,
}: {
  alerts: LiveAlert[]
  highlightedAlertId: string | null
  onHighlightTask: (id: string | null) => void
  pulseAlertId: string | null
}) {
  return (
    <OperationsPanel
      icon={<AlertTriangle className="h-5 w-5" strokeWidth={1.8} />}
      rightSlot={<StatusBadge tone="rose">{alerts.length} 项活跃</StatusBadge>}
      title="告警中心"
    >
      <div className="operations-alert-list space-y-3">
        {alerts.map((alert) => (
          <AlertCard
            alert={alert}
            highlighted={highlightedAlertId === alert.id}
            key={alert.id}
            onHighlightTask={onHighlightTask}
            pulse={pulseAlertId === alert.id}
          />
        ))}
      </div>
    </OperationsPanel>
  )
}

function TaskCard({ highlighted, task }: { highlighted: boolean; task: LiveTask }) {
  const dueTone = task.due.includes('今天') ? 'amber' : 'cyan'

  return (
    <article
      className="operations-task-card border border-cyan-300/24 bg-cyan-950/18 p-4"
      data-highlighted={highlighted ? 'true' : undefined}
      {...tooltipAttrs({
        actions: ['打开工单', '追加记录'],
        rows: [
          { label: '创建时间', value: task.createdAt },
          { label: '关联告警', value: task.linkedAlertId ? '已绑定' : '未绑定' },
          { label: '处理步骤', value: task.steps.join(' / ') },
          { label: '负责人联系方式', value: `${task.assignee} 值班终端` },
          { label: '工具材料', value: task.tools },
          { label: '预计耗时', value: task.estimate },
        ],
        title: task.code,
      })}
    >
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <div
            className="operations-task-code font-black text-[#7AF7FF]"
            style={{ fontFamily: DASHBOARD_FONTS.numHeavy }}
          >
            {task.code}
          </div>
          <h4 className="mt-2 text-[16px] font-black leading-6 text-cyan-50">{task.title}</h4>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge
              tooltip={{
                rows: [
                  { label: '值班组', value: task.assignee },
                  { label: '状态', value: '处理中' },
                ],
                title: '负责人',
              }}
            >
              负责人 {task.assignee}
            </StatusBadge>
            <StatusBadge
              tone={dueTone}
              tooltip={{
                rows: [
                  { label: '截止时间', value: task.due },
                  {
                    label: '提醒策略',
                    value: task.due.includes('今天') ? '临近截止，持续提醒' : '常规提醒',
                  },
                ],
                title: '截止时间',
              }}
            >
              截止 {task.due}
            </StatusBadge>
          </div>
        </div>
        <div
          className="operations-task-progress w-[112px] shrink-0"
          {...tooltipAttrs({
            rows: [
              { label: '当前进度', value: `${task.progress}%` },
              { label: '更新频率', value: '每 10 秒模拟推进' },
            ],
            title: '工单进度',
          })}
        >
          <div
            className="text-right text-[20px] font-black text-cyan-50"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
          >
            <NumberFlow value={task.progress} />%
          </div>
          <div className="mt-2 h-2 overflow-hidden bg-cyan-950/80">
            <span style={{ width: `${task.progress}%` }} />
          </div>
        </div>
      </div>
    </article>
  )
}

function TaskList({
  highlightedTaskId,
  tasks,
}: {
  highlightedTaskId: string | null
  tasks: LiveTask[]
}) {
  return (
    <OperationsPanel
      icon={<ClipboardList className="h-5 w-5" strokeWidth={1.8} />}
      rightSlot={<StatusBadge tone="amber">待推进 {tasks.length} 项</StatusBadge>}
      title="巡检与工单"
    >
      <div className="space-y-3">
        {tasks.map((task) => (
          <TaskCard highlighted={highlightedTaskId === task.id} key={task.id} task={task} />
        ))}
      </div>
    </OperationsPanel>
  )
}

function StrategyList({ strategies }: { strategies: OperationsStrategy[] }) {
  const [expanded, setExpanded] = useState<string | null>(strategies[0]?.title ?? null)

  useEffect(() => {
    if (!expanded && strategies[0]) {
      setExpanded(strategies[0].title)
    }
  }, [expanded, strategies])

  return (
    <OperationsPanel
      icon={<Lightbulb className="h-5 w-5" strokeWidth={1.8} />}
      title="下一步建设建议"
    >
      <div className="space-y-3">
        {strategies.map((strategy, index) => {
          const isExpanded = expanded === strategy.title
          return (
            <button
              className="operations-strategy-item group w-full border border-cyan-300/22 bg-cyan-950/16 p-4 text-left"
              data-expanded={isExpanded ? 'true' : undefined}
              key={strategy.title}
              onClick={() => setExpanded(isExpanded ? null : strategy.title)}
              type="button"
              {...tooltipAttrs({
                rows: [
                  { label: '采纳后预期收益', tone: 'emerald', value: `${4 + index * 2}% 节能潜力` },
                  { label: '建设周期', value: index < 2 ? '1-2 周' : '2-4 周' },
                ],
                title: strategy.title,
              })}
            >
              <div className="flex items-center gap-3">
                <span className="operations-strategy-index">{index + 1}</span>
                <span className="min-w-0 flex-1 text-[16px] font-black text-cyan-50">
                  {strategy.title}
                </span>
                <span className="operations-adopt-btn">采纳</span>
              </div>
              {isExpanded ? (
                <div className="mt-3 pl-11 text-[13px] leading-6 text-cyan-100/66">
                  {strategy.description}
                </div>
              ) : null}
            </button>
          )
        })}
      </div>
    </OperationsPanel>
  )
}

function FocusOverview({
  alerts,
  highlightedAlertId,
  onHighlight,
}: {
  alerts: LiveAlert[]
  highlightedAlertId: string | null
  onHighlight: (id: string | null) => void
}) {
  return (
    <OperationsPanel icon={<Radar className="h-5 w-5" strokeWidth={1.8} />} title="当前运维焦点">
      <div className="space-y-3">
        {alerts.slice(0, 3).map((alert, index) => (
          <button
            className="operations-focus-card w-full border border-cyan-300/24 bg-cyan-950/18 p-3 text-left"
            data-highlighted={highlightedAlertId === alert.id ? 'true' : undefined}
            key={alert.id}
            onPointerEnter={() => onHighlight(alert.id)}
            onPointerLeave={() => onHighlight(null)}
            type="button"
            {...tooltipAttrs({
              rows: [
                { label: '排序', value: `Top ${index + 1}` },
                {
                  label: '优先级',
                  tone: severityTone(alert.severity),
                  value: severityLabel(alert.severity),
                },
                { label: '联动', value: '悬停高亮告警中心对应项' },
              ],
              title: alert.title,
            })}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[14px] font-black text-cyan-50">{alert.title}</span>
              <span
                className="h-2 w-2 shrink-0 rounded-full shadow-[0_0_10px_currentColor]"
                style={{
                  backgroundColor: severityColor(alert.severity),
                  color: severityColor(alert.severity),
                }}
              />
            </div>
            <div className="mt-2 text-[12px] leading-5 text-cyan-100/58">{alert.locationText}</div>
          </button>
        ))}
      </div>
    </OperationsPanel>
  )
}

function TypingText({ active, content }: { active?: boolean; content: string }) {
  const [visible, setVisible] = useState(active ? '' : content)

  useEffect(() => {
    if (!active) {
      setVisible(content)
      return
    }

    setVisible('')
    let index = 0
    const timer = window.setInterval(() => {
      index += 1
      setVisible(content.slice(0, index))
      if (index >= content.length) {
        window.clearInterval(timer)
      }
    }, 30)

    return () => window.clearInterval(timer)
  }, [active, content])

  return <>{visible}</>
}

function AgentChat({
  agentPulse,
  onCreateWorkOrder,
  projectId,
}: {
  agentPulse: boolean
  onCreateWorkOrder?: (draft: AssistantWorkOrderDraft) => void
  projectId: string
}) {
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [activePrompt, setActivePrompt] = useState<string | null>(null)
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      content:
        '我已经接入智能体。你可以直接问我当前构件的能耗趋势、峰值成因、节能建议，或者让我结合筛选结果做分析。',
      id: 'assistant-welcome',
      role: 'assistant',
      typing: true,
    },
  ])
  const messageAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const area = messageAreaRef.current
    if (!area) return
    area.scrollTop = area.scrollHeight
  })

  const submitPrompt = (rawPrompt: string) => {
    const prompt = rawPrompt.trim()
    if (!prompt || thinking) return

    setMessages((current) => [
      ...current,
      { content: prompt, id: `user-${Date.now()}`, role: 'user' },
    ])
    setDraft('')
    setThinking(true)
    setActivePrompt(prompt)

    if (prompt.includes('工单') && onCreateWorkOrder) {
      window.setTimeout(() => {
        onCreateWorkOrder({
          assignee: '综合运维值班组',
          due: '今天 18:00',
          title: `工单 WO-${projectId.toUpperCase()}-A${String(Date.now()).slice(-3)}：处置 BLDG-APT-3F 新风机组能耗异常`,
        })
      }, 1800)
    }

    window.setTimeout(() => {
      setThinking(false)
      setMessages((current) => [
        ...current,
        {
          content:
            AGENT_REPLIES[prompt] ??
            '已收到。我会结合告警中心、工单进度和当前筛选结果给出运维建议，优先保证高优先级告警闭环。',
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          typing: true,
        },
      ])
      window.setTimeout(() => setActivePrompt(null), 520)
    }, 2000)
  }

  useIntervalTick(() => {
    const insight = PROACTIVE_INSIGHTS[randomInt(0, PROACTIVE_INSIGHTS.length - 1)]!
    setMessages((current) => [
      ...current,
      {
        content: insight,
        id: `assistant-push-${Date.now()}`,
        proactive: true,
        role: 'assistant',
        typing: true,
      },
    ])
  }, 32_000)

  return (
    <OperationsPanel
      className={cn('operations-agent-panel min-h-[640px]', agentPulse && 'operations-agent-pulse')}
      icon={<Bot className="h-5 w-5" strokeWidth={1.8} />}
      rightSlot={
        <span
          className="operations-agent-online"
          {...tooltipAttrs({
            rows: [
              { label: '模型版本', value: 'Operations-Agent v1.0' },
              { label: '今日响应次数', value: '128 次' },
              { label: '平均响应时长', value: '1.8 秒' },
            ],
            title: '智能体状态',
          })}
        >
          <span />
          AGENT ONLINE
        </span>
      }
      title="智能体问答"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-wrap gap-2.5">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              className="operations-quick-prompt"
              data-active={activePrompt === prompt ? 'true' : undefined}
              disabled={thinking}
              key={prompt}
              onClick={() => submitPrompt(prompt)}
              type="button"
              {...tooltipAttrs({
                body: AGENT_REPLIES[prompt]?.slice(0, 54),
                title: `样例回复：${prompt}`,
              })}
            >
              {prompt}
            </button>
          ))}
        </div>

        <div
          className="operations-chat-feed mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto border border-cyan-300/20 bg-cyan-950/16 p-3"
          ref={messageAreaRef}
        >
          {messages.map((message) => (
            <div
              className={cn(
                'operations-chat-row flex',
                message.role === 'user' ? 'justify-end' : 'justify-start',
              )}
              data-proactive={message.proactive ? 'true' : undefined}
              key={message.id}
            >
              {message.role === 'assistant' ? (
                <span className="operations-agent-avatar">AI</span>
              ) : null}
              <div
                className={cn(
                  'operations-chat-bubble max-w-[86%] whitespace-pre-line px-3 py-2 text-[13px] leading-6',
                  message.role === 'assistant' ? 'assistant' : 'user',
                )}
              >
                <TypingText active={message.typing} content={message.content} />
              </div>
            </div>
          ))}
          {thinking ? (
            <div className="operations-chat-row flex justify-start">
              <span className="operations-agent-avatar">AI</span>
              <div className="operations-chat-bubble assistant">
                AI 思考中
                <span className="operations-thinking-dots" />
              </div>
            </div>
          ) : null}
        </div>

        <form
          className="operations-agent-form mt-4 flex shrink-0 items-center gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            submitPrompt(draft)
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">输入问题</span>
            <textarea
              className="operations-agent-input"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submitPrompt(draft)
                }
              }}
              placeholder="例如：帮我解释这个构件为什么峰值偏高..."
              value={draft}
            />
          </label>
          <button
            aria-label="发送"
            className="operations-send-btn"
            disabled={thinking}
            type="submit"
            {...tooltipAttrs({
              rows: [{ label: '快捷键', value: 'Enter 发送，Shift+Enter 换行' }],
              title: '发送问题',
            })}
          >
            <Send className="h-5 w-5" strokeWidth={1.9} />
          </button>
        </form>
      </div>
    </OperationsPanel>
  )
}

function OperationsStatusBar({
  doneTasks,
  lastSyncSeconds,
  operators,
  todayAlerts,
}: {
  doneTasks: number
  lastSyncSeconds: number
  operators: number
  todayAlerts: number
}) {
  return (
    <BevelCard className="operations-status-bar px-4 py-2" size="small">
      <div className="grid grid-cols-2 gap-3 text-[13px] font-semibold text-cyan-100/70 md:grid-cols-4">
        <div
          className="flex items-center gap-2"
          {...tooltipAttrs({
            rows: [
              { label: '同步状态', value: '实时同步中' },
              { label: '上次同步', value: `${lastSyncSeconds}s 前` },
            ],
            title: '实时同步',
          })}
        >
          <span className="sync-radar" />
          上次同步 {lastSyncSeconds}s 前
        </div>
        <div>
          在线运维人员 <span className="text-cyan-50">{operators}</span> 人
        </div>
        <div>
          今日已处理工单 <span className="text-cyan-50">{doneTasks}</span> 件
        </div>
        <div>
          今日新增告警 <span className="text-cyan-50">{todayAlerts}</span> 条
        </div>
      </div>
    </BevelCard>
  )
}

function kpiTooltip(label: string): DashboardTooltipContent {
  if (label === '站点健康度') {
    return {
      rows: [
        { label: '设备完好率', value: '28 分' },
        { label: '告警响应率', value: '24 分' },
        { label: '巡检完成率', value: '22 分' },
        { label: '能效达标率', value: '22 分' },
      ],
      title: '站点健康度构成',
    }
  }

  if (label === '活跃告警') {
    return {
      rows: [
        { label: '高 / 中 / 低', tone: 'rose', value: '1 / 1 / 1' },
        { label: 'BLDG-APT', value: '3 条' },
        { label: '今日预警口径', value: `${INITIAL_GLOBAL_STATS.warning} 条累计预警` },
        { label: '本页口径', value: '正在处置的活跃告警' },
      ],
      title: '活跃告警分布',
    }
  }

  if (label === '待处理工单') {
    return {
      rows: [
        { label: '处理中', value: '2 项' },
        { label: '平均处理时长', value: '58 分钟' },
        { label: '即将逾期', tone: 'amber', value: '1 项' },
      ],
      title: '待处理工单分布',
    }
  }

  if (label === '巡检覆盖率') {
    return {
      rows: [
        { label: '已巡检楼栋', value: '7 栋' },
        { label: '未巡检楼栋', value: '2 栋' },
        { label: '本周计划完成率', value: '82%' },
      ],
      title: '巡检覆盖率',
    }
  }

  return {
    rows: [
      { label: '模型版本', value: 'Operations-Agent v1.0' },
      { label: '今日响应次数', value: '128 次' },
      { label: '平均响应时长', value: '1.8 秒' },
    ],
    title: '智能体状态',
  }
}

export interface SmartOperationsWorkspaceProps {
  energyResult: EnergyApiResponse | null
  generatedTasks?: OperationsTask[]
  onCreateWorkOrder?: (draft: AssistantWorkOrderDraft) => void
  projectId: string
  queryResults: HostQueryResult[]
  saveStatus: string
  selectedComponentId: string | null
  selectedComponentName: string
}

export default function SmartOperationsWorkspace({
  energyResult,
  generatedTasks,
  onCreateWorkOrder,
  projectId,
  queryResults,
  saveStatus,
  selectedComponentId,
  selectedComponentName,
}: SmartOperationsWorkspaceProps) {
  const dashboard = useMemo(
    () =>
      buildOperationsDashboardData({
        additionalTasks: generatedTasks,
        energyResult,
        projectId,
        queryResults,
        saveStatus,
        selectedComponentId,
        selectedComponentName,
      }),
    [
      energyResult,
      generatedTasks,
      projectId,
      queryResults,
      saveStatus,
      selectedComponentId,
      selectedComponentName,
    ],
  )

  const initialStats = useMemo(() => {
    const health = dashboard.metrics.find((metric) => metric.label === '站点健康度')
    const coverage = dashboard.metrics.find((metric) => metric.label === '巡检覆盖率')

    return {
      ...INITIAL_GLOBAL_STATS,
      activeAlerts: dashboard.alerts.length,
      healthScore: parseNumber(health?.value, INITIAL_GLOBAL_STATS.healthScore),
      inspectionRate: parseNumber(coverage?.value, INITIAL_GLOBAL_STATS.inspectionRate),
      pendingTasks: dashboard.tasks.length,
    }
  }, [dashboard.alerts.length, dashboard.metrics, dashboard.tasks.length])

  const [toasts, setToasts] = useState<OperationsToast[]>([])
  const [healthScore, setHealthScore] = useState(initialStats.healthScore)
  const [inspectionRate, setInspectionRate] = useState(initialStats.inspectionRate)
  const [lastSyncSeconds, setLastSyncSeconds] = useState(0)
  const [operators, setOperators] = useState(7)
  const [doneTasks, setDoneTasks] = useState(6)
  const [todayAlerts, setTodayAlerts] = useState(INITIAL_GLOBAL_STATS.warning)
  const [pulseAlertId, setPulseAlertId] = useState<string | null>(null)
  const [highlightedAlertId, setHighlightedAlertId] = useState<string | null>(null)
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null)
  const [agentPulse, setAgentPulse] = useState(false)
  const [progressById, setProgressById] = useState<Record<string, number>>({})
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>(() =>
    dashboard.alerts.map((alert, index) =>
      createLiveAlert(alert, index, dashboard.tasks[index]?.id),
    ),
  )

  useEffect(() => {
    setHealthScore(initialStats.healthScore)
    setInspectionRate(initialStats.inspectionRate)
  }, [initialStats.healthScore, initialStats.inspectionRate])

  useEffect(() => {
    setLiveAlerts(
      dashboard.alerts.map((alert, index) =>
        createLiveAlert(alert, index, dashboard.tasks[index]?.id),
      ),
    )
  }, [dashboard.alerts, dashboard.tasks])

  useEffect(() => {
    setProgressById((current) => {
      const next = { ...current }
      dashboard.tasks.forEach((task, index) => {
        if (typeof next[task.id] !== 'number') {
          next[task.id] = clamp(46 + index * 17, 8, 88)
        }
      })
      return next
    })
  }, [dashboard.tasks])

  const liveTasks = useMemo(
    () =>
      dashboard.tasks.map((task, index) => ({
        ...createLiveTask(task, index, projectId, liveAlerts[index]?.id),
        progress: progressById[task.id] ?? clamp(46 + index * 17, 8, 88),
      })),
    [dashboard.tasks, liveAlerts, progressById, projectId],
  )

  const strategies = useMemo<OperationsStrategy[]>(
    () =>
      [
        ...dashboard.strategies,
        {
          title: '统一 BLDG-APT 告警编码',
          description:
            '将公寓楼 3F / 2F / B1 统一映射为 BLDG-APT 楼栋体系，减少跨页排查时的口径差异。',
        },
        {
          title: '补充智能体派单确认流',
          description: '智能体给出处置建议后增加二次确认、责任组匹配和工单追踪，形成可审计闭环。',
        },
      ].slice(0, 4),
    [dashboard.strategies],
  )

  useIntervalTick(() => {
    setLastSyncSeconds((seconds) => (seconds >= 5 ? 0 : seconds + 1))
  }, 1000)

  useIntervalTick(() => {
    setOperators(randomInt(6, 9))
  }, 5000)

  useIntervalTick(() => {
    setProgressById((current) => {
      const next = { ...current }
      let completedTask: string | null = null

      for (const task of liveTasks) {
        const progress = next[task.id] ?? task.progress
        const updated = clamp(progress + randomInt(1, 3), 0, 100)
        next[task.id] = updated

        if (updated >= 100 && progress < 100) {
          completedTask = task.code
        }
      }

      if (completedTask) {
        setDoneTasks((value) => value + 1)
        pushToast(setToasts, {
          body: `${completedTask} 已完成并回填闭环记录`,
          title: '工单完成',
          tone: 'emerald',
        })
      }

      return next
    })
  }, 10_000)

  useIntervalTick(() => {
    const newAlert = createSyntheticAlert(projectId, liveTasks[0]?.id)
    setLiveAlerts((current) => [newAlert, ...current].slice(0, 5))
    setPulseAlertId(newAlert.id)
    setTodayAlerts((value) => value + 1)
    pushToast(setToasts, {
      body: newAlert.title,
      title: '新告警',
      tone: 'rose',
    })
    window.setTimeout(() => setPulseAlertId(null), 2200)
  }, 12_000)

  useIntervalTick(() => {
    setHealthScore((score) => clamp(score + randomInt(-1, 1), 88, 99))
    setInspectionRate((rate) => clamp(rate + 1, 82, 99))
  }, 30_000)

  useIntervalTick(() => {
    setAgentPulse(true)
    pushToast(setToasts, {
      body: '智能体已推送新的运维洞察',
      title: '智能体推送',
      tone: 'cyan',
    })
    window.setTimeout(() => setAgentPulse(false), 1800)
  }, 32_000)

  const kpis = [
    {
      detail: '综合评估',
      icon: <ShieldCheck className="h-7 w-7" strokeWidth={1.7} />,
      label: '站点健康度',
      numeric: healthScore,
      seed: 'health',
      tone: 'cyan' as const,
    },
    {
      detail: '高优先级 1 项',
      icon: <AlertTriangle className="h-7 w-7" strokeWidth={1.7} />,
      label: '活跃告警',
      numeric: liveAlerts.length,
      seed: 'alerts',
      suffix: '条',
      tone: 'rose' as const,
    },
    {
      detail: `当前保存状态 ${saveStatus}`,
      icon: <ClipboardList className="h-7 w-7" strokeWidth={1.7} />,
      label: '待处理工单',
      numeric: liveTasks.length,
      seed: 'tasks',
      suffix: '条',
      tone: 'amber' as const,
    },
    {
      detail: '基于筛选估算',
      icon: <Radar className="h-7 w-7" strokeWidth={1.7} />,
      label: '巡检覆盖率',
      numeric: inspectionRate,
      seed: 'inspection',
      suffix: '%',
      tone: 'emerald' as const,
    },
    {
      detail: '在线响应',
      icon: <Cpu className="h-7 w-7" strokeWidth={1.7} />,
      label: '智能体状态',
      seed: 'agent',
      textValue: initialStats.agentOnline ? '已接入' : '离线',
      tone: 'emerald' as const,
    },
  ]

  return (
    <div
      className="relative h-full overflow-auto bg-[#020817]/35 text-cyan-50"
      style={{ fontFamily: DASHBOARD_FONTS.cn }}
    >
      <VideoBackground />
      <div className="cockpit-atmosphere" />
      <DashboardTooltipLayer />
      <OperationsToastStack toasts={toasts} />

      <div className="relative z-10 flex w-full flex-col gap-4 px-5 pb-6 pt-4">
        <header className="operations-page-hero flex flex-wrap items-center justify-between gap-4 border border-cyan-300/24 bg-cyan-950/18 px-5 py-4">
          <div>
            <h1
              className="operations-page-title text-[30px] leading-none text-cyan-50"
              style={{ fontFamily: DASHBOARD_FONTS.title }}
            >
              智慧运维协同大界面
            </h1>
            <div className="mt-2 text-[13px] font-semibold text-cyan-100/62">
              公寓楼 = BLDG-APT · 项目 {projectId} · 当前构件 {selectedComponentName}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              tooltip={{
                rows: [
                  { label: '项目 ID', value: projectId },
                  { label: '活跃结果', value: `${queryResults.length} 条` },
                ],
                title: '项目筛选',
              }}
            >
              项目 {projectId}
            </StatusBadge>
            <StatusBadge>当前构件 {selectedComponentName}</StatusBadge>
            <StatusBadge>活跃结果 {queryResults.length} 条</StatusBadge>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {kpis.map((kpi) => (
            <OperationsKpiCard key={kpi.label} {...kpi} tooltip={kpiTooltip(kpi.label)} />
          ))}
        </section>

        <div className="operations-main-grid">
          <div className="operations-left-stack flex min-w-0 flex-col gap-4">
            <FocusSummary
              alert={liveAlerts[0]}
              onFocusAlert={(id) => {
                setHighlightedAlertId(id)
                setPulseAlertId(id)
                window.setTimeout(() => {
                  setHighlightedAlertId(null)
                  setPulseAlertId(null)
                }, 2200)
              }}
              summary={dashboard.summary}
            />
            <AlertCenter
              alerts={liveAlerts}
              highlightedAlertId={highlightedAlertId}
              onHighlightTask={setHighlightedTaskId}
              pulseAlertId={pulseAlertId}
            />
            <TaskList highlightedTaskId={highlightedTaskId} tasks={liveTasks} />
            <StrategyList strategies={strategies} />
          </div>

          <div className="operations-right-stack flex min-w-0 flex-col gap-4">
            <FocusOverview
              alerts={liveAlerts}
              highlightedAlertId={highlightedAlertId}
              onHighlight={setHighlightedAlertId}
            />
            <AgentChat
              agentPulse={agentPulse}
              onCreateWorkOrder={onCreateWorkOrder}
              projectId={projectId}
            />
          </div>
        </div>

        <OperationsStatusBar
          doneTasks={doneTasks}
          lastSyncSeconds={lastSyncSeconds}
          operators={operators}
          todayAlerts={todayAlerts}
        />
      </div>
    </div>
  )
}
