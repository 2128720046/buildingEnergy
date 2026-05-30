'use client'

import NumberFlow from '@number-flow/react'
import {
  AlertTriangle,
  Bot,
  Camera,
  ChevronDown,
  ClipboardList,
  CloudSun,
  Cpu,
  Filter,
  Image as ImageIcon,
  Radar,
  Send,
  SendToBack,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BevelCard, VideoBackground } from '@/features/analytics/components/dashboard-primitives'
import { DASHBOARD_COLORS, DASHBOARD_FONTS } from '@/features/analytics/components/dashboard-theme'
import {
  type DashboardTooltipContent,
  DashboardTooltipLayer,
  tooltipAttrs,
} from '@/features/analytics/components/dashboard-tooltip'
import type { AssistantWorkOrderDraft } from '@/features/energy-insights/components/energy-assistant-chat'
import type { EnergyApiResponse } from '@/features/energy-insights/lib/energy-api'
import { markOfficeAlertResolved } from '@/features/energy-insights/lib/energy-mock-data'
import type { HostQueryResult } from '@/features/energy-insights/lib/host-query'
import { useNow } from '@/features/host-shell/lib/time-store'
import {
  buildOperationsDashboardData,
  type MobileAlertReport,
  type MobileUploadedWorkOrder,
  type OperationsAlert,
  type OperationsDashboardData,
  type OperationsDecarbonAction,
  type OperationsOperator,
  type OperationsTask,
} from '@/features/operations/lib/operations-dashboard'
import { cn } from '@/lib/utils'

type Severity = OperationsAlert['severity']
type ToastTone = 'cyan' | 'emerald' | 'rose'

interface LiveAlert extends OperationsAlert {
  linkedTaskId?: string
}

interface LiveTask extends OperationsTask {
  code: string
  linkedAlertId?: string
  opinion?: string
  progress: number
  source?: 'mobile-alert' | 'platform' | 'manual'
  sourceLabel?: string
  status: string
  steps: string[]
  tools: string
}

type MobileDetailState =
  | { item: MobileAlertReport; kind: 'alert' }
  | { item: MobileUploadedWorkOrder; kind: 'work-order' }
  | null

type MobileDispatchStatus = '待派发' | '已发至手机端' | '手机端处理中'

interface AgentTrigger {
  answer?: AgentAnswer
  id: number
  prompt: string
}

interface DispatchPlanItem {
  alert: LiveAlert
  assignee: string
  code: string
  due: string
  opinion: string
}

interface AgentMessage {
  content: string
  followUps?: string[]
  id: string
  role: 'assistant' | 'user'
  typing?: boolean
}

interface AgentAnswer {
  followUps: string[]
  text: string
}

const QUICK_PROMPTS = [
  '总结当前能耗情况',
  '派发工单',
  '峰值出现在什么时段?',
  '给我三条优化建议',
  '列出当前高能耗设备',
]

const DEFAULT_AGENT_QUESTION = '总结当前能耗情况'

const ANSWER_BANK: Record<string, AgentAnswer> = {
  派发工单: {
    followUps: ['总结当前能耗情况', '列出当前高能耗设备'],
    text: `【派单建议】
已根据当前告警优先级生成待派发工单清单。
请在弹窗中核对工单、处理人员和处理意见，确认后将统一派发。`,
  },
  总结当前能耗情况: {
    followUps: ['新风机组的能耗趋势怎么样?', '怎么排查照明回路夜间未闭锁?'],
    text: '从当前统一告警池、健康分和工单状态生成摘要。',
  },
  '峰值出现在什么时段?': {
    followUps: ['新风机组的能耗趋势怎么样?', '列出当前高能耗设备'],
    text: '从当前首要告警的发生时间和告警详情生成峰值解释。',
  },
  给我三条优化建议: {
    followUps: ['怎么排查照明回路夜间未闭锁?', '列出当前高能耗设备'],
    text: `【问题理解】
给出可执行、能落到班组的优化动作。
【核心结论】
建议先做 3 项:新风复核、照明闭锁、水泵阈值校准。
这些动作能覆盖当前主要异常来源。
【分析依据】
● 高优告警来自 3F 新风机组。
● 中优告警中有照明、水泵、空调机组三类。
● 待处理工单正好 2 条,均未超期。
【原因分析】
● 当前问题不是单点仪表误差,而是策略和设备状态共同偏离。
【排查与优化建议】
● 推进 WO-BUILDING-031 至 100%,完成过滤器压差复核。
● 推进 WO-BUILDING-032,今晚核对照明闭锁日志。
● 本周内校准 B1 水泵压差报警阈值。`,
  },
  列出当前高能耗设备: {
    followUps: ['新风机组的能耗趋势怎么样?', '峰值出现在什么时段?'],
    text: '从当前告警中心排序生成高能耗设备列表。',
  },
  '新风机组的能耗趋势怎么样?': {
    followUps: ['峰值出现在什么时段?', '给我三条优化建议'],
    text: '从当前新风/暖通告警详情生成趋势判断。',
  },
  '怎么排查照明回路夜间未闭锁?': {
    followUps: ['列出当前高能耗设备', '给我三条优化建议'],
    text: '从当前照明告警详情生成闭锁策略排查路径。',
  },
}

function buildDecarbonReasonAnswer(action: OperationsDecarbonAction): AgentAnswer {
  return {
    followUps: ['生成对应工单', '这项动作的减排口径是什么?'],
    text: `【问题理解】
解释“${action.title}”为什么被纳入智能减排闭环。
【核心结论】
该动作来自${action.source}，已关联${action.linkedWorkOrder}，优先级来自当前负荷偏差、工单可落地性和责任班组可执行性。
【分析依据】
● 预计节电 ${action.expectedSavingKwh.toFixed(1)} kWh/日，预计减排 ${action.expectedCarbonKg.toFixed(1)} kgCO₂e/日。
● 责任人：${action.owner}。
● 置信度：${Math.round(action.confidence * 100)}%。
【原因分析】
● 当前不是单纯的报表建议，而是可以进入工单或巡检闭环的动作。
● 减排量 = 预计节电量 × 项目排放因子，当前为项目估算口径，不代表真实碳核算结果。
【下一步】
${action.nextAction}`,
  }
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function randomInt(min: number, max: number) {
  return Math.floor(randomBetween(min, max + 1))
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

function formatClockWithSeconds(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function severityTone(severity: Severity): 'amber' | 'emerald' | 'rose' {
  if (severity === 'high') return 'rose'
  if (severity === 'medium') return 'amber'
  return 'emerald'
}

function severityLabel(severity: Severity) {
  if (severity === 'high') return '高优'
  if (severity === 'medium') return '中优'
  return '低优'
}

function severityColor(severity: Severity) {
  if (severity === 'high') return DASHBOARD_COLORS.rose
  if (severity === 'medium') return DASHBOARD_COLORS.amber
  return DASHBOARD_COLORS.emerald
}

function decarbonRiskTone(risk: OperationsDecarbonAction['risk']): 'amber' | 'emerald' | 'rose' {
  if (risk === 'high') return 'rose'
  if (risk === 'medium') return 'amber'
  return 'emerald'
}

function decarbonStatusTone(status: string): ToastTone | 'amber' {
  if (status.includes('关联')) return 'cyan'
  if (status.includes('巡检')) return 'amber'
  if (status.includes('可执行')) return 'emerald'
  return 'cyan'
}

function decarbonSourceTone(source: OperationsDecarbonAction['source']): ToastTone | 'amber' {
  if (source === '告警中心') return 'amber'
  if (source === '工单进度') return 'emerald'
  return 'cyan'
}

function taskSteps(task: OperationsTask) {
  if (task.code === 'WO-BUILDING-031') {
    return ['现场到达', '读取压差与电流', '复核送回风温差', '回填处理记录']
  }

  return ['调取控制日志', '复核感应阈值', '更新时控策略', '提交复核结论']
}

function taskTools(task: OperationsTask) {
  return task.code === 'WO-BUILDING-031'
    ? '钳形表 / 压差计 / 温度探针'
    : '网关面板 / 巡检终端'
}

function taskCode(task: OperationsTask, index: number) {
  return task.code ?? `WO-BUILDING-${String(31 + index).padStart(3, '0')}`
}

function metricValue(metrics: Array<{ label: string; value: string }>, label: string, fallback: number) {
  return parseNumber(metrics.find((metric) => metric.label === label)?.value, fallback)
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
  return (
    <span className={cn('live-number', className)} style={style}>
      <NumberFlow
        format={{
          maximumFractionDigits: decimals,
          minimumFractionDigits: decimals,
        }}
        value={value}
      />
      {suffix ? <span className="live-number-unit">{suffix}</span> : null}
    </span>
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
            className="text-[22px] font-black leading-tight text-cyan-50"
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

const OperationsKpiCard = memo(function OperationsKpiCard({
  detail,
  icon,
  label,
  numeric,
  suffix,
  textValue,
  tone,
  tooltip,
}: {
  detail: string
  icon: ReactNode
  label: string
  numeric?: number
  suffix?: string
  textValue?: string
  tone: 'amber' | 'cyan' | 'emerald' | 'rose'
  tooltip: DashboardTooltipContent
}) {
  return (
    <BevelCard
      className="metric-card-interactive operations-kpi-card min-h-[158px] px-6 py-5"
      size="kpi"
      {...tooltipAttrs(tooltip)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="operations-kpi-label font-black tracking-[0.04em] text-cyan-100/76">{label}</div>
          <div
            className="operations-kpi-value mt-3 font-black leading-none text-cyan-50"
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
      <div className="operations-kpi-detail mt-4 font-semibold text-cyan-100/68">{detail}</div>
    </BevelCard>
  )
})

const FocusSummary = memo(function FocusSummary({
  alert,
  summary,
  onFocusAlert,
}: {
  alert?: LiveAlert
  onFocusAlert: (id: string) => void
  summary: string
}) {
  const keyword = alert?.title ?? 'BLDG-APT-3F 新风机组'
  const [before = summary, after = ''] = summary.includes(keyword)
    ? (summary.split(keyword) as [string, string])
    : [summary, '']

  return (
    <OperationsPanel
      icon={<Sparkles className="h-5 w-5" strokeWidth={1.8} />}
      title="优先事项"
      contentClassName="flex-1"
    >
      <div
        className="operations-focus-copy relative min-h-[132px] border border-cyan-300/24 bg-cyan-950/20 px-5 py-5 text-cyan-50/88"
        {...tooltipAttrs({
          rows: [
            { label: '来源', value: '告警优先级 / 工单状态 / 负荷偏差' },
            { label: '关联设备', value: keyword },
            { label: '当前工单', value: 'WO-BUILDING-031' },
          ],
          title: '优先事项',
        })}
      >
        <span className="operations-focus-rail" />
        <span className="operations-typewriter">
          {before}
          {summary.includes(keyword) ? (
            <button
              className="operations-focus-keyword"
              onClick={() => alert && onFocusAlert(alert.id)}
              type="button"
            >
              {keyword}
            </button>
          ) : null}
          {after}
        </span>
      </div>
    </OperationsPanel>
  )
})

const AlertCard = memo(function AlertCard({
  alert,
  highlighted,
  onDispatchWorkOrder,
  onHighlightTask,
  operatorOptions,
  pulse,
}: {
  alert: LiveAlert
  highlighted: boolean
  onDispatchWorkOrder: (alert: LiveAlert, assignee: string) => void
  onHighlightTask: (id: string | null) => void
  operatorOptions: OperationsOperator[]
  pulse: boolean
}) {
  const tone = severityTone(alert.severity)
  const formattedOperators = operatorOptions.map((operator) => `${operator.name} · ${operator.role}`)
  const [selectedAssignee, setSelectedAssignee] = useState(formattedOperators[0] ?? '')
  const dispatched = Boolean(alert.linkedTaskId)

  useEffect(() => {
    if (!formattedOperators.length || formattedOperators.includes(selectedAssignee)) return
    setSelectedAssignee(formattedOperators[0] ?? '')
  }, [formattedOperators, selectedAssignee])

  return (
    <article
      className="operations-alert-card group relative overflow-hidden border bg-cyan-950/20 p-4"
      data-highlighted={highlighted ? 'true' : undefined}
      data-new={pulse ? 'true' : undefined}
      data-severity={alert.severity}
      onPointerEnter={() => onHighlightTask(alert.linkedTaskId ?? null)}
      onPointerLeave={() => onHighlightTask(null)}
      {...tooltipAttrs({
        actions: ['查看详情'],
        rows: [
          { label: '设备位置', value: alert.location },
          { label: '当前值', value: alert.currentValue },
          { label: '基线偏差', tone, value: alert.baselineDelta },
          { label: '发生时间', value: alert.occurredAt },
          { label: '状态', value: alert.status },
          { label: '关联工单', value: alert.linkedTaskId ?? '未关联' },
        ],
        title: alert.title,
      })}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="operations-card-title font-black text-cyan-50">{alert.title}</h4>
          <div className="operations-alert-detail-grid mt-3">
            <span>
              <b>位置</b>
              {alert.location}
            </span>
            <span>
              <b>当前值</b>
              {alert.currentValue}
            </span>
            <span>
              <b>基线偏差</b>
              {alert.baselineDelta}
            </span>
            <span>
              <b>发生时间</b>
              {alert.occurredAt}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge tone={tone}>{severityLabel(alert.severity)}</StatusBadge>
          <StatusBadge tone={alert.status === '处理中' ? 'rose' : 'cyan'}>{alert.status}</StatusBadge>
        </div>
      </div>
      <div className="operations-alert-recommendation mt-4 border-l border-dashed border-cyan-300/45 bg-cyan-950/20 px-4 py-3 text-cyan-50/82">
        <b className="mb-1 block text-sm font-black text-cyan-200/78">处理意见</b>
        {alert.recommendation}
      </div>
      <div className="operations-alert-actions mt-3 flex justify-end gap-2">
        <label className="operations-dispatch-control">
          <span>处理人员</span>
          <select
            disabled={dispatched}
            onChange={(event) => setSelectedAssignee(event.target.value)}
            value={selectedAssignee}
          >
            {formattedOperators.map((assignee) => (
              <option key={assignee} value={assignee}>
                {assignee}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={dispatched}
          onClick={() => onDispatchWorkOrder(alert, selectedAssignee)}
          type="button"
        >
          {dispatched ? '已派单' : '派发工单'}
        </button>
        <button type="button">查看详情</button>
      </div>
    </article>
  )
})

const AlertCenter = memo(function AlertCenter({
  alerts,
  highlightedAlertId,
  onDispatchWorkOrder,
  onHighlightTask,
  onOneClickDispatch,
  operatorOptions,
  pulseAlertId,
}: {
  alerts: LiveAlert[]
  highlightedAlertId: string | null
  onDispatchWorkOrder: (alert: LiveAlert, assignee: string) => void
  onHighlightTask: (id: string | null) => void
  onOneClickDispatch: () => void
  operatorOptions: OperationsOperator[]
  pulseAlertId: string | null
}) {
  return (
    <OperationsPanel
      icon={<AlertTriangle className="h-5 w-5" strokeWidth={1.8} />}
      rightSlot={
        <div className="flex items-center gap-2">
          <StatusBadge tone="rose">{alerts.length} 条活跃</StatusBadge>
          <button className="operations-one-click-btn" onClick={onOneClickDispatch} type="button">
            一键派发
          </button>
        </div>
      }
      title="告警中心"
    >
      <div className="operations-alert-list space-y-3">
        {alerts.map((alert) => (
          <AlertCard
            alert={alert}
            highlighted={highlightedAlertId === alert.id}
            key={alert.id}
            onDispatchWorkOrder={onDispatchWorkOrder}
            onHighlightTask={onHighlightTask}
            operatorOptions={operatorOptions}
            pulse={pulseAlertId === alert.id}
          />
        ))}
      </div>
    </OperationsPanel>
  )
})

const TaskCard = memo(function TaskCard({ highlighted, task }: { highlighted: boolean; task: LiveTask }) {
  const dueTone = task.due.includes('今天') ? 'amber' : 'cyan'
  const isMobileConvertedTask = task.source === 'mobile-alert' || task.id.startsWith('mobile-alert-work-order-')

  return (
    <article
      className="operations-task-card border border-cyan-300/24 bg-cyan-950/18 p-4"
      data-highlighted={highlighted ? 'true' : undefined}
      id={task.id}
      {...tooltipAttrs({
        actions: ['打开工单', '追加记录'],
        rows: [
          { label: '关联告警', value: task.linkedAlertId ? '已绑定' : '未绑定' },
          { label: '工单来源', value: task.sourceLabel ?? '平台告警工单' },
          { label: '处理步骤', value: task.steps.join(' / ') },
          { label: '责任人', value: task.assignee },
          { label: '工具材料', value: task.tools },
          { label: '当前状态', value: task.status },
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
          <h4 className="operations-card-title mt-2 font-black text-cyan-50">{task.title}</h4>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge
              tooltip={{
                rows: [
                  { label: '责任人', value: task.assignee },
                  { label: '状态', value: task.status },
                ],
                title: '责任信息',
              }}
            >
              责任人 {task.assignee}
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
            <StatusBadge tone={task.status === '处理中' ? 'rose' : 'amber'}>{task.status}</StatusBadge>
            {isMobileConvertedTask ? <StatusBadge tone="emerald">手机端报警转工单</StatusBadge> : null}
          </div>
        </div>
        <div
          className="operations-task-progress w-[112px] shrink-0"
          {...tooltipAttrs({
            rows: [
              { label: '当前进度', value: `${task.progress}%` },
              { label: '推进口径', value: '来自工单系统状态' },
            ],
            title: '工单进度',
          })}
        >
          <div
            className="text-right text-2xl font-black text-cyan-50"
            style={{ fontFamily: DASHBOARD_FONTS.num }}
          >
            <NumberFlow value={task.progress} />%
          </div>
          <div className="mt-2 h-2 overflow-hidden bg-cyan-950/80">
            <span style={{ width: `${task.progress}%` }} />
          </div>
        </div>
      </div>
      <div className="operations-task-opinion mt-3 border-l border-dashed border-cyan-300/38 bg-cyan-950/18 px-4 py-3 text-sm font-semibold leading-6 text-cyan-50/82">
        <b className="mb-1 block text-sm font-black text-cyan-200/78">处理意见</b>
        {task.opinion ?? `${task.steps.join('；')}。使用 ${task.tools}，处理后回填复核结果。`}
      </div>
    </article>
  )
})

const TaskList = memo(function TaskList({
  highlightedTaskId,
  tasks,
}: {
  highlightedTaskId: string | null
  tasks: LiveTask[]
}) {
  const mobileConvertedTasks = tasks.filter(
    (task) => task.source === 'mobile-alert' || task.id.startsWith('mobile-alert-work-order-'),
  )
  const platformTasks = tasks.filter((task) => !mobileConvertedTasks.some((mobileTask) => mobileTask.id === task.id))
  const mobileReportCount = mobileConvertedTasks.length

  return (
    <OperationsPanel
      icon={<ClipboardList className="h-5 w-5" strokeWidth={1.8} />}
      rightSlot={<StatusBadge tone="amber">手机转工单 {mobileReportCount} · 总计 {tasks.length}</StatusBadge>}
      title="巡检与工单"
    >
      <div className="space-y-4">
        {mobileConvertedTasks.length ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 text-sm font-black text-cyan-100/76">
              <span>手机端报警转工单</span>
              <StatusBadge tone="emerald">{mobileConvertedTasks.length} 条已生成</StatusBadge>
            </div>
            {mobileConvertedTasks.map((task) => (
              <TaskCard highlighted={highlightedTaskId === task.id} key={task.id} task={task} />
            ))}
          </section>
        ) : null}

        <section className="space-y-3">
          {mobileConvertedTasks.length ? (
            <div className="flex items-center justify-between gap-3 text-sm font-black text-cyan-100/76">
              <span>平台工单</span>
              <StatusBadge tone="cyan">{platformTasks.length} 条</StatusBadge>
            </div>
          ) : null}
          {platformTasks.map((task) => (
            <TaskCard highlighted={highlightedTaskId === task.id} key={task.id} task={task} />
          ))}
        </section>
      </div>
    </OperationsPanel>
  )
})

function mobileMaterialPhotos(kind: 'alert' | 'work-order', id: string, count: number, imageUrls: string[]) {
  const safeCount = Math.max(1, imageUrls.length || count)
  const labels =
    kind === 'alert'
      ? ['现场全景', '设备铭牌', '异常特写', '位置环境']
      : ['处理前', '处理过程', '处理后', '复测记录']

  return Array.from({ length: safeCount }, (_, index) => ({
    id: `${kind}-${id}-photo-${index}`,
    imageUrl: imageUrls[index],
    label: labels[index % labels.length],
  }))
}

function DispatchConfirmDialog({
  onApprove,
  onClose,
  plan,
}: {
  onApprove: () => void
  onClose: () => void
  plan: DispatchPlanItem[]
}) {
  if (!plan.length) return null

  return (
    <div className="operations-mobile-detail-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-modal="true"
        className="operations-mobile-detail-dialog operations-dispatch-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="operations-mobile-detail-header">
          <div>
            <div className="operations-mobile-sync-label">一键派发确认</div>
            <h3>待派发工单清单</h3>
          </div>
          <button aria-label="关闭" className="operations-detail-close" onClick={onClose} type="button">
            ×
          </button>
        </header>

        <div className="operations-dispatch-plan-list">
          {plan.map((item) => (
            <article className="operations-dispatch-plan-row" key={item.alert.id}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="operations-task-code font-black text-[#7AF7FF]">{item.code}</span>
                  <span className="font-black text-cyan-50">{item.alert.title}</span>
                  <StatusBadge tone={severityTone(item.alert.severity)}>{severityLabel(item.alert.severity)}</StatusBadge>
                </div>
                <div className="mt-1 text-sm font-semibold leading-5 text-cyan-100/68">
                  {item.alert.location} · 截止 {item.due}
                </div>
                <div className="mt-2 text-sm font-semibold leading-6 text-cyan-50/82">
                  <b className="text-cyan-200/78">处理意见：</b>
                  {item.opinion}
                </div>
              </div>
              <div className="operations-dispatch-assignee">
                <span>派给</span>
                <b>{item.assignee}</b>
              </div>
            </article>
          ))}
        </div>

        <footer className="operations-mobile-detail-footer">
          <button className="operations-mobile-mini-btn operations-reject-btn" onClick={onClose} type="button">
            拒绝
          </button>
          <button className="operations-mobile-mini-btn" onClick={onApprove} type="button">
            同意并派发
          </button>
        </footer>
      </section>
    </div>
  )
}

function MobileMaterialDetailDialog({
  detail,
  onClose,
  onRejectWorkOrder,
  onReviewWorkOrder,
  rejectionOpinions,
  reviewedOrderIds,
}: {
  detail: MobileDetailState
  onClose: () => void
  onRejectWorkOrder: (id: string, opinion: string) => void
  onReviewWorkOrder: (id: string) => void
  rejectionOpinions: Record<string, string>
  reviewedOrderIds: Set<string>
}) {
  const [rejectOpinion, setRejectOpinion] = useState('')

  useEffect(() => {
    setRejectOpinion('')
  }, [detail?.item.id])

  if (!detail) return null

  const isAlert = detail.kind === 'alert'
  const item = detail.item
  const photos = mobileMaterialPhotos(detail.kind, item.id, item.photoCount, item.imageUrls)
  const reviewed = !isAlert && reviewedOrderIds.has(item.id)
  const rejectionOpinion = !isAlert ? rejectionOpinions[item.id] : ''

  return (
    <div className="operations-mobile-detail-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-modal="true"
        className="operations-mobile-detail-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="operations-mobile-detail-header">
          <div>
            <div className="operations-mobile-sync-label">{isAlert ? '现场上报材料' : '工单处理材料'}</div>
            <h3>{isAlert ? '上报现场异常' : '工单处理'}</h3>
          </div>
          <button aria-label="关闭" className="operations-detail-close" onClick={onClose} type="button">
            ×
          </button>
        </header>

        {isAlert ? (
          <div className="operations-detail-section">
            <div className="operations-detail-title">{item.title}</div>
            <div className="operations-detail-meta">
              {item.location} · {item.reporter} · {item.submittedAt}
            </div>
            <div className="operations-detail-grid">
              <span>
                <b>严重程度</b>
                {severityLabel(item.severity)}
              </span>
              <span>
                <b>设备编号</b>
                {item.deviceId}
              </span>
              <span>
                <b>当前状态</b>
                {item.status}
              </span>
              <span>
                <b>材料数量</b>
                {item.photoCount} 张照片
              </span>
            </div>
            <div className="operations-detail-note">
              <b>现场说明</b>
              <p>{item.detail}</p>
            </div>
          </div>
        ) : (
          <div className="operations-detail-section">
            <div className="operations-detail-title">{item.title}</div>
            <div className="operations-detail-meta">
              {item.code} · {item.location} · 截止 {item.due}
            </div>
            <div className="operations-detail-grid">
              <span>
                <b>异常来源</b>
                {item.source}
              </span>
              <span>
                <b>设备编号</b>
                {item.deviceId}
              </span>
              <span>
                <b>检修结果</b>
                {item.resultStatus}
              </span>
              <span>
                <b>电脑端状态</b>
                {reviewed ? '已审阅' : item.status}
              </span>
            </div>
            <div className="operations-detail-note">
              <b>异常说明</b>
              <p>{item.anomaly}</p>
            </div>
            <div className="operations-detail-note">
              <b>处理意见</b>
              <p>{item.resultNote}</p>
            </div>
            {rejectionOpinion ? (
              <div className="operations-detail-note operations-reject-note">
                <b>驳回意见</b>
                <p>{rejectionOpinion}</p>
              </div>
            ) : null}
            {!reviewed ? (
              <label className="operations-reject-editor">
                <span>修改意见</span>
                <textarea
                  onChange={(event) => setRejectOpinion(event.target.value)}
                  placeholder="例如：请补充电流复测截图，并说明异常是否已连续 30 分钟恢复稳定。"
                  value={rejectOpinion}
                />
              </label>
            ) : null}
          </div>
        )}

        <div className="operations-detail-photo-block">
          <div className="operations-detail-subtitle">
            <Camera className="h-4 w-4" strokeWidth={1.9} />
            现场照片
          </div>
          <div className="operations-detail-photo-grid">
            {photos.map((photo, index) => (
              <div className="operations-detail-photo" key={photo.id}>
                {photo.imageUrl ? (
                  <img alt={photo.label} src={photo.imageUrl} />
                ) : (
                  <ImageIcon className="h-6 w-6" strokeWidth={1.8} />
                )}
                <span>{photo.label}</span>
                <small>{String(index + 1).padStart(2, '0')}</small>
              </div>
            ))}
          </div>
        </div>

        <footer className="operations-mobile-detail-footer">
          <button className="operations-mobile-mini-btn" onClick={onClose} type="button">
            关闭
          </button>
          {!isAlert ? (
            <>
              <button
                className="operations-mobile-mini-btn operations-reject-btn"
                disabled={reviewed || !rejectOpinion.trim()}
                onClick={() => {
                  onRejectWorkOrder(item.id, rejectOpinion.trim())
                  onClose()
                }}
                type="button"
              >
                驳回并提交意见
              </button>
              <button
                className="operations-mobile-mini-btn"
                disabled={reviewed}
                onClick={() => {
                  onReviewWorkOrder(item.id)
                  onClose()
                }}
                type="button"
              >
                {reviewed ? '已审阅' : '确认审阅'}
              </button>
            </>
          ) : null}
        </footer>
      </section>
    </div>
  )
}

const MobileOpsBridge = memo(function MobileOpsBridge({
  alerts,
  mobileWorkOrders,
  onAcceptAlert,
  onOpenAlertDetail,
  onOpenWorkOrderDetail,
  onReviewWorkOrder,
  rejectionOpinions,
  reviewedOrderIds,
}: {
  alerts: MobileAlertReport[]
  mobileWorkOrders: MobileUploadedWorkOrder[]
  onAcceptAlert: (id: string) => void
  onOpenAlertDetail: (alert: MobileAlertReport) => void
  onOpenWorkOrderDetail: (order: MobileUploadedWorkOrder) => void
  onReviewWorkOrder: (id: string) => void
  rejectionOpinions: Record<string, string>
  reviewedOrderIds: Set<string>
}) {
  const pendingReviewCount = mobileWorkOrders.filter(
    (order) => order.status === '待电脑端审阅' && !reviewedOrderIds.has(order.id),
  ).length
  const pendingAlertCount = alerts.filter((alert) => alert.status !== '已受理').length

  return (
    <OperationsPanel
      icon={<Smartphone className="h-5 w-5" strokeWidth={1.8} />}
      rightSlot={<StatusBadge tone="emerald">Android 已联动</StatusBadge>}
      title="移动端协同工单"
    >
      <div className="operations-mobile-sync-grid">
        <div className="operations-mobile-sync-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="operations-mobile-sync-label">手机端报警</div>
              <h4 className="operations-mobile-sync-title">接收现场上报预警</h4>
            </div>
            <StatusBadge tone={pendingAlertCount > 0 ? 'rose' : 'emerald'}>{pendingAlertCount} 条待受理</StatusBadge>
          </div>
          <div className="mt-3 space-y-2.5">
            {alerts.map((alert) => (
              <div className="operations-mobile-row" data-severity={alert.severity} key={alert.id}>
                {alert.imageUrls[0] ? (
                  <img alt={alert.title} className="operations-mobile-thumb" src={alert.imageUrls[0]} />
                ) : null}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-cyan-50">{alert.title}</span>
                    <StatusBadge tone={severityTone(alert.severity)}>{severityLabel(alert.severity)}</StatusBadge>
                  </div>
                  <div className="mt-1 text-sm font-semibold leading-5 text-cyan-100/68">
                    {alert.location} · {alert.reporter} · 照片 {alert.photoCount} 张 · {alert.submittedAt}
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-cyan-50/82">{alert.detail}</div>
                </div>
                <div className="operations-mobile-row-actions">
                  <button className="operations-mobile-mini-btn" onClick={() => onOpenAlertDetail(alert)} type="button">
                    查看详细
                  </button>
                <button
                  className="operations-mobile-mini-btn"
                  disabled={alert.status === '已受理'}
                  onClick={() => onAcceptAlert(alert.id)}
                  type="button"
                >
                  {alert.status === '已受理' ? '已转工单' : '接收并转工单'}
                </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="operations-mobile-sync-card operations-mobile-review-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="operations-mobile-sync-label">手机端上传</div>
              <h4 className="operations-mobile-sync-title">审阅已处理工单</h4>
            </div>
            <StatusBadge tone={pendingReviewCount > 0 ? 'amber' : 'emerald'}>{pendingReviewCount} 条待审</StatusBadge>
          </div>
          <div className="mt-3 space-y-2.5">
            {mobileWorkOrders.map((order) => {
              const reviewed = reviewedOrderIds.has(order.id)
              const rejected = Boolean(rejectionOpinions[order.id])
              return (
                <div
                  className="operations-mobile-row"
                  data-rejected={rejected ? 'true' : undefined}
                  data-reviewed={reviewed ? 'true' : undefined}
                  key={order.id}
                >
                  {order.imageUrls[0] ? (
                    <img alt={order.title} className="operations-mobile-thumb" src={order.imageUrls[0]} />
                  ) : null}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="operations-task-code font-black text-[#7AF7FF]">{order.code}</span>
                      <span className="font-black text-cyan-50">{order.title}</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold leading-5 text-cyan-100/68">
                      {order.location} · {order.resultStatus} · 照片 {order.photoCount} 张
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-cyan-50/82">
                      处理意见：{order.resultNote}
                    </div>
                    {rejected ? (
                      <div className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-rose-100/86">
                        驳回意见：{rejectionOpinions[order.id]}
                      </div>
                    ) : null}
                  </div>
                  <div className="operations-mobile-row-actions">
                    <button
                      className="operations-mobile-mini-btn"
                      onClick={() => onOpenWorkOrderDetail(order)}
                      type="button"
                    >
                      查看详细
                    </button>
                  <button
                    className="operations-mobile-mini-btn"
                    disabled={reviewed}
                    onClick={() => onReviewWorkOrder(order.id)}
                    type="button"
                  >
                    {reviewed ? '已审阅' : '确认处理'}
                  </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </OperationsPanel>
  )
})

const FocusOverview = memo(function FocusOverview({
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
        {alerts.slice(0, 4).map((alert, index) => (
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
                { label: '状态', value: alert.status },
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
            <div className="mt-2 text-sm font-semibold leading-5 text-cyan-100/68">
              {alert.location} · {alert.currentValue}
            </div>
          </button>
        ))}
      </div>
    </OperationsPanel>
  )
})

function TypingText({
  active,
  content,
  onDone,
  onVisibleChange,
}: {
  active?: boolean
  content: string
  onDone?: () => void
  onVisibleChange?: () => void
}) {
  const [visible, setVisible] = useState(active ? '' : content)
  const onDoneRef = useRef(onDone)
  const onVisibleChangeRef = useRef(onVisibleChange)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    onVisibleChangeRef.current = onVisibleChange
  }, [onVisibleChange])

  useEffect(() => {
    if (!active || !visible) return
    onVisibleChangeRef.current?.()
  }, [active, visible])

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
        onDoneRef.current?.()
      }
    }, 33)

    return () => window.clearInterval(timer)
  }, [active, content])

  return <>{visible}</>
}

function firstAlertSummary(alerts: OperationsAlert[]) {
  const alert = alerts[0]
  if (!alert) return '当前没有未闭环告警。'
  return `${alert.title}，当前值 ${alert.currentValue}，较基线 ${alert.baselineDelta}。`
}

function buildContextualAnswer(prompt: string, dashboard: OperationsDashboardData): AgentAnswer {
  const health = metricValue(dashboard.metrics, '站点健康度', 72)
  const highAlerts = dashboard.alerts.filter((alert) => alert.severity === 'high').length
  const mediumAlerts = dashboard.alerts.filter((alert) => alert.severity === 'medium').length
  const alertCount = dashboard.alerts.length
  const primary = dashboard.alerts[0]
  const secondary = dashboard.alerts[1]
  const topAlertLines = dashboard.alerts
    .slice(0, 4)
    .map((alert) => `● ${alert.title}:${alert.currentValue},${alert.baselineDelta}。`)
    .join('\n')

  if (prompt === '总结当前能耗情况') {
    return {
      followUps: ['峰值出现在什么时段?', '列出当前高能耗设备'],
      text: `【问题理解】
快速复盘当前运行负荷和未闭环异常。
【核心结论】
站点健康度 ${health} 分,活跃告警 ${alertCount} 条。
当前优先级最高的是${primary ? primary.title : '暂无高优告警'}。
【分析依据】
${topAlertLines || '● 当前统一告警池为空。'}
【原因分析】
● 健康分按未闭环告警数量、优先级和设备状态扣减，不再使用固定高分。
【排查与优化建议】
● 先闭环高优告警 ${highAlerts} 条。
● 同步复核中优告警 ${mediumAlerts} 条的控制策略和现场读数。`,
    }
  }

  if (prompt === '峰值出现在什么时段?') {
    return {
      followUps: ['总结当前能耗情况', '给我三条优化建议'],
      text: `【问题理解】
定位今天能耗峰值的时间窗口和主因设备。
【核心结论】
当前峰值优先看 ${primary?.occurredAt ?? '--:--'} 附近。
【分析依据】
● ${firstAlertSummary(dashboard.alerts)}
${secondary ? `● 次要异常:${secondary.title}，发生在 ${secondary.occurredAt}。` : ''}
【排查与优化建议】
● 核对峰值前后 30 分钟设备启停记录。
● 复核对应回路和暖通策略是否按计划回落。`,
    }
  }

  if (prompt === '列出当前高能耗设备') {
    return {
      followUps: ['总结当前能耗情况', '给我三条优化建议'],
      text: `【问题理解】
列出当前最影响能耗的设备和处理顺序。
【核心结论】
当前统一告警池共有 ${alertCount} 个高能耗/运行异常对象。
【分析依据】
${topAlertLines || '● 当前没有高能耗告警对象。'}
【排查与优化建议】
● 按高优先级到中优先级依次派单。
● 处理后观察能耗查询页告警数是否同步下降。`,
    }
  }

  if (prompt === '给我三条优化建议') {
    return {
      followUps: ['总结当前能耗情况', '派发工单'],
      text: `【问题理解】
给出可执行、能落到班组的优化动作。
【核心结论】
建议先做 3 项:高优告警复核、照明/空调策略闭环、健康分回归复盘。
【分析依据】
● 当前活跃告警 ${alertCount} 条,站点健康度 ${health} 分。
● 高优 ${highAlerts} 条,中优 ${mediumAlerts} 条。
【排查与优化建议】
● 优先处理:${firstAlertSummary(dashboard.alerts)}
● 将所有已派工单回填为闭环后,能耗查询页告警数会同步下降。
● 复核第二天同时间段负荷是否回到基线附近。`,
    }
  }

  return buildFallbackAnswer(prompt, dashboard)
}

function buildFallbackAnswer(prompt: string, dashboard?: OperationsDashboardData): AgentAnswer {
  const alertCount = dashboard?.alerts.length ?? 0
  const taskCount = dashboard?.tasks.length ?? 0
  return {
    followUps: ['总结当前能耗情况', '给我三条优化建议'],
    text: `【问题理解】
你想确认:${prompt}
【核心结论】
当前先按 ${alertCount} 条活跃告警和 ${taskCount} 条待处理工单处置。
【分析依据】
● 告警数量来自统一模拟数据集。
● 工单数量来自当前告警派生和手动新增工单。
【原因分析】
● 当前主要风险来自未闭环告警对应的能耗或环境偏离。
【排查与优化建议】
● 优先查看高优告警。
● 同步复核已派发工单。
● 处理后再观察 30 分钟负荷回落情况。`,
  }
}

const AgentChat = memo(function AgentChat({
  agentPulse,
  dashboard,
  onOneClickDispatch,
  trigger,
}: {
  agentPulse: boolean
  dashboard: OperationsDashboardData
  onOneClickDispatch: () => void
  trigger?: AgentTrigger | null
}) {
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [activePrompt, setActivePrompt] = useState<string | null>(null)
  const [scrollRequest, setScrollRequest] = useState(0)
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      content: DEFAULT_AGENT_QUESTION,
      id: 'user-default-summary',
      role: 'user',
    },
    {
      content: buildContextualAnswer(DEFAULT_AGENT_QUESTION, dashboard).text,
      followUps: ['新风机组的能耗趋势怎么样?', '怎么排查照明回路夜间未闭锁?'],
      id: 'assistant-default-summary',
      role: 'assistant',
      typing: false,
    },
  ])
  const messageAreaRef = useRef<HTMLDivElement>(null)
  const messageSequenceRef = useRef(0)
  const handledTriggerIdRef = useRef<number | null>(null)

  const scrollChatToBottom = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const area = messageAreaRef.current
        if (!area) return
        area.scrollTop = area.scrollHeight
      })
    })
  }, [])

  const requestChatScroll = useCallback(() => {
    setScrollRequest((current) => current + 1)
  }, [])

  useEffect(() => {
    scrollChatToBottom()
  }, [scrollChatToBottom])

  useEffect(() => {
    if (scrollRequest <= 0) return
    scrollChatToBottom()
  }, [scrollChatToBottom, scrollRequest])

  const completeTyping = (messageId: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, typing: false } : message,
      ),
    )
    requestChatScroll()
  }

  const submitPrompt = useCallback((rawPrompt: string, overrideAnswer?: AgentAnswer) => {
    const prompt = rawPrompt.trim()
    if (!prompt || thinking) return

    const answer = overrideAnswer ?? buildContextualAnswer(prompt, dashboard)
    messageSequenceRef.current += 1
    const messageKey = `${Date.now()}-${messageSequenceRef.current}`
    const assistantId = `assistant-${messageKey}`
    const shouldOpenDispatch = prompt === '派发工单'

    setMessages((current) => [
      ...current,
      { content: prompt, id: `user-${messageKey}`, role: 'user' },
    ])
    setDraft('')
    setThinking(true)
    setActivePrompt(prompt)
    requestChatScroll()

    window.setTimeout(() => {
      setThinking(false)
      if (shouldOpenDispatch) {
        onOneClickDispatch()
      }
      setMessages((current) => [
        ...current,
        {
          content: answer.text,
          followUps: answer.followUps,
          id: assistantId,
          role: 'assistant',
          typing: true,
        },
      ])
      requestChatScroll()
      window.setTimeout(() => setActivePrompt(null), 520)
    }, 5000)
  }, [dashboard, onOneClickDispatch, requestChatScroll, thinking])

  useEffect(() => {
    if (!trigger) return
    if (thinking) return
    if (handledTriggerIdRef.current === trigger.id) return
    handledTriggerIdRef.current = trigger.id
    submitPrompt(trigger.prompt, trigger.answer)
  }, [submitPrompt, thinking, trigger])

  return (
    <OperationsPanel
      className={cn('operations-agent-panel min-h-[640px]', agentPulse && 'operations-agent-pulse')}
      icon={<Bot className="h-5 w-5" strokeWidth={1.8} />}
      rightSlot={
        <span
          className="operations-agent-online"
          {...tooltipAttrs({
            rows: [
              { label: '平均响应', value: '1.2s' },
              { label: '版本', value: 'v2.4.1' },
              { label: '数据范围', value: '公寓楼全部设备' },
            ],
            title: '智能体状态',
          })}
        >
          <span />
          已接入
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
                body: ANSWER_BANK[prompt]?.text.slice(0, 54),
                title: `推荐问题:${prompt}`,
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
            <div className="operations-chat-message" key={message.id}>
              <div
                className={cn(
                  'operations-chat-row flex',
                  message.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                {message.role === 'assistant' ? (
                  <span className="operations-agent-avatar">AI</span>
                ) : null}
                <div
                  className={cn(
                    'operations-chat-bubble max-w-[88%] whitespace-pre-line px-3 py-2 text-sm font-semibold leading-6',
                    message.role === 'assistant' ? 'assistant' : 'user',
                  )}
                >
                  <TypingText
                    active={message.typing}
                    content={message.content}
                    onDone={() => completeTyping(message.id)}
                    onVisibleChange={scrollChatToBottom}
                  />
                </div>
              </div>
              {message.role === 'assistant' && !message.typing && message.followUps?.length ? (
                <div className="operations-chat-followups">
                  {message.followUps.map((followUp) => (
                    <button
                      className="operations-followup-btn"
                      disabled={thinking}
                      key={followUp}
                      onClick={() => submitPrompt(followUp)}
                      type="button"
                    >
                      {followUp}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {thinking ? (
            <div className="operations-chat-row flex justify-start">
              <span className="operations-agent-avatar">AI</span>
              <div className="operations-chat-bubble assistant operations-thinking-bubble">
                <span className="operations-thinking-dots" />
                <span className="operations-thinking-label">正在分析能耗数据...</span>
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
              placeholder="例如:3F 新风机组为什么负荷偏高?"
              value={draft}
            />
          </label>
          <button
            aria-label="发送"
            className="operations-send-btn"
            disabled={thinking}
            type="submit"
            {...tooltipAttrs({
              rows: [{ label: '快捷键', value: 'Enter 发送,Shift+Enter 换行' }],
              title: '发送问题',
            })}
          >
            <Send className="h-5 w-5" strokeWidth={1.9} />
          </button>
        </form>
      </div>
    </OperationsPanel>
  )
})

const DecarbonAgentPanel = memo(function DecarbonAgentPanel({
  actions,
  adoptedActionIds,
  askedActionIds,
  onAdoptAction,
  onAskReason,
}: {
  actions: OperationsDecarbonAction[]
  adoptedActionIds: string[]
  askedActionIds: string[]
  onAdoptAction: (action: OperationsDecarbonAction) => void
  onAskReason: (action: OperationsDecarbonAction) => void
}) {
  const totalSavingKwh = actions.reduce((total, action) => total + action.expectedSavingKwh, 0)
  const totalCarbonKg = actions.reduce((total, action) => total + action.expectedCarbonKg, 0)
  const actionableCount = actions.length
  const estimateTooltip: DashboardTooltipContent = {
    body: '减排量 = 预计节电量 × 项目排放因子。当前为项目估算口径，不代表真实碳核算结果。',
    rows: [
      { label: '口径', value: '项目估算' },
      { label: '数据来源', value: '告警、工单、智能体结论' },
    ],
    title: '减排估算说明',
  }

  return (
    <OperationsPanel
      className="operations-decarbon-panel"
      icon={<SendToBack className="h-5 w-5" strokeWidth={1.8} />}
      rightSlot={<StatusBadge tone="emerald">{actionableCount} 项可执行</StatusBadge>}
      title="智能减排闭环"
    >
      <div className="operations-decarbon-shell">
        <p className="operations-decarbon-intro">
          基于当前告警、工单和智能体结论生成，优先展示可落地的节能减排行动。
        </p>

        <div className="operations-alert-detail-grid operations-decarbon-summary-grid">
          <span {...tooltipAttrs(estimateTooltip)}>
            <b>预计节电</b>
            <strong className="operations-decarbon-summary-value">
              <AnimatedNumber decimals={1} value={totalSavingKwh} />
            </strong>
            <em>kWh/日</em>
          </span>
          <span {...tooltipAttrs(estimateTooltip)}>
            <b>预计减排</b>
            <strong className="operations-decarbon-summary-value">
              <AnimatedNumber decimals={1} value={totalCarbonKg} />
            </strong>
            <em>kgCO₂e/日</em>
          </span>
          <span
            {...tooltipAttrs({
              body: '统计当前智能体已生成、且能落到工单或巡检项的动作数量。',
              rows: [
                { label: '关联工单', value: '2 项' },
                { label: '待纳入巡检', value: '1 项' },
              ],
              title: '可执行动作数量',
            })}
          >
            <b>可执行动作</b>
            <strong className="operations-decarbon-summary-value">
              <AnimatedNumber value={actionableCount} />
            </strong>
            <em>项</em>
          </span>
        </div>

        <div className="operations-decarbon-list">
          {actions.map((action, index) => {
            const adopted = adoptedActionIds.includes(action.id)
            const asked = askedActionIds.includes(action.id)

            return (
              <article
                className="operations-decarbon-action"
                data-risk={action.risk}
                key={action.id}
                {...tooltipAttrs({
                  rows: [
                    { label: '置信度', value: `${Math.round(action.confidence * 100)}%` },
                    {
                      label: '风险',
                      tone: decarbonRiskTone(action.risk),
                      value:
                        action.risk === 'high'
                          ? '高'
                          : action.risk === 'medium'
                            ? '中'
                            : '低',
                    },
                    { label: '关联项', value: action.linkedWorkOrder },
                  ],
                  title: action.title,
                })}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="operations-decarbon-meta-line">
                      <span className="operations-strategy-index">{String(index + 1).padStart(2, '0')}</span>
                      <span className="operations-task-code font-black text-[#7AF7FF]">
                        {action.linkedWorkOrder}
                      </span>
                      <StatusBadge tone={decarbonSourceTone(action.source)}>来源：{action.source}</StatusBadge>
                    </div>
                    <h4 className="operations-card-title mt-2 font-black text-cyan-50">{action.title}</h4>
                  </div>
                  <div className="operations-decarbon-status-stack">
                    <StatusBadge tone={decarbonStatusTone(action.status)}>{action.status}</StatusBadge>
                    <StatusBadge tone={decarbonRiskTone(action.risk)}>
                      置信度 {Math.round(action.confidence * 100)}%
                    </StatusBadge>
                  </div>
                </div>

                <div className="operations-alert-detail-grid operations-decarbon-grid mt-3">
                  <span>
                    <b>预计节电</b>
                    {action.expectedSavingKwh.toFixed(1)} kWh/日
                  </span>
                  <span>
                    <b>预计减排</b>
                    {action.expectedCarbonKg.toFixed(1)} kgCO₂e/日
                  </span>
                  <span>
                    <b>责任</b>
                    {action.owner}
                  </span>
                  <span>
                    <b>置信度</b>
                    {Math.round(action.confidence * 100)}%
                  </span>
                </div>

                <div className="operations-alert-recommendation operations-decarbon-next mt-3 border-l border-dashed border-cyan-300/38 bg-cyan-950/18 px-4 py-3 text-cyan-50/82">
                  <b className="mb-1 block text-sm font-black text-cyan-200/78">下一步动作</b>
                  {action.nextAction}
                </div>

                <div className="operations-alert-actions operations-decarbon-actions mt-3">
                  <button
                    className="operations-decarbon-btn primary"
                    data-active={adopted ? 'true' : undefined}
                    onClick={() => onAdoptAction(action)}
                    type="button"
                  >
                    <ClipboardList className="h-4 w-4" strokeWidth={1.8} />
                    {adopted ? '已纳入' : '纳入工单'}
                  </button>
                  <button
                    className="operations-decarbon-btn"
                    data-active={asked ? 'true' : undefined}
                    onClick={() => onAskReason(action)}
                    type="button"
                  >
                    <Bot className="h-4 w-4" strokeWidth={1.8} />
                    {asked ? '已追问' : '追问原因'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </OperationsPanel>
  )
})

const OperationsStatusBar = memo(function OperationsStatusBar({
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
      <div className="grid grid-cols-2 gap-3 text-sm font-semibold text-cyan-100/74 md:grid-cols-4">
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
          在线运维人员 <span className="text-lg font-bold text-cyan-50">{operators}</span> 人
        </div>
        <div>
          今日已处理工单 <span className="text-lg font-bold text-cyan-50">{doneTasks}</span> 件
        </div>
        <div
          {...tooltipAttrs({
            rows: [
              { label: '累计口径', value: '今日 00:00 至当前全部新增告警' },
              { label: '活跃口径', value: `当前未闭环告警 ${todayAlerts} 条` },
            ],
            title: '今日新增告警口径',
          })}
        >
          今日新增告警 <span className="text-lg font-bold text-cyan-50">{todayAlerts}</span> 条
        </div>
      </div>
    </BevelCard>
  )
})

function kpiTooltip(label: string): DashboardTooltipContent {
  if (label === '站点健康度') {
    return {
      rows: [
        { label: '设备完好率', value: '28 分' },
        { label: '告警响应率', value: '24 分' },
        { label: '巡检完成率', value: '23 分' },
        { label: '能效达标率', value: '22 分' },
      ],
      title: '站点健康度构成',
    }
  }

  if (label === '活跃告警') {
    return {
      rows: [
        { label: '高 / 中 / 低', tone: 'rose', value: '1 / 3 / 1' },
        { label: '本页口径', value: '当前未闭环告警' },
        { label: '设备范围', value: '公寓楼全部设备' },
      ],
      title: '活跃告警分布',
    }
  }

  if (label === '待处理工单') {
    return {
      rows: [
        { label: '待办', value: '2 条' },
        { label: '处理中', value: '1 条' },
        { label: '即将到期', tone: 'amber', value: '1 条' },
        { label: '超期', value: '0 条' },
      ],
      title: '待处理工单分布',
    }
  }

  if (label === '巡检覆盖率') {
    return {
      rows: [
        { label: '本月累计', value: '412 次' },
        { label: '覆盖率', value: '99%' },
        { label: '未覆盖', value: '屋面备用回路' },
      ],
      title: '巡检覆盖率',
    }
  }

  return {
    rows: [
      { label: '平均响应', value: '1.2s' },
      { label: '版本', value: 'v2.4.1' },
      { label: '状态', value: '已接入' },
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

  const [scope, setScope] = useState('全部设备')
  const now = useNow()
  const [lastSyncSeconds, setLastSyncSeconds] = useState(0)
  const [operators, setOperators] = useState(7)
  const [pulseAlertId, setPulseAlertId] = useState<string | null>(null)
  const [highlightedAlertId, setHighlightedAlertId] = useState<string | null>(null)
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null)
  const [agentPulse, setAgentPulse] = useState(false)
  const [mobileDispatchStatus, setMobileDispatchStatus] = useState<MobileDispatchStatus>('待派发')
  const [acceptedMobileAlertIds, setAcceptedMobileAlertIds] = useState<string[]>([])
  const [reviewedMobileOrderIds, setReviewedMobileOrderIds] = useState<string[]>([])
  const [rejectionOpinions, setRejectionOpinions] = useState<Record<string, string>>({})
  const [manualTasks, setManualTasks] = useState<LiveTask[]>([])
  const [resolvedPlatformAlertIds, setResolvedPlatformAlertIds] = useState<string[]>([])
  const [mobileDetail, setMobileDetail] = useState<MobileDetailState>(null)
  const [dispatchPlan, setDispatchPlan] = useState<DispatchPlanItem[]>([])
  const [adoptedDecarbonActionIds, setAdoptedDecarbonActionIds] = useState<string[]>([])
  const [askedDecarbonActionIds, setAskedDecarbonActionIds] = useState<string[]>([])
  const [agentTrigger, setAgentTrigger] = useState<AgentTrigger | null>(null)
  const agentTriggerSequenceRef = useRef(0)

  const operatorLabels = useMemo(
    () => dashboard.mobileOperators.map((operator) => `${operator.name} · ${operator.role}`),
    [dashboard.mobileOperators],
  )

  const mobileAlertTasks = useMemo<LiveTask[]>(
    () =>
      dashboard.mobileAlerts
        .filter((alert) => alert.status === '已受理' || acceptedMobileAlertIds.includes(alert.id))
        .map((alert) => {
          const assignee =
            alert.title.includes('照明')
              ? operatorLabels.find((name) => name.includes('李工'))
              : alert.title.includes('配电') || alert.title.includes('电')
                ? operatorLabels.find((name) => name.includes('王工'))
                : operatorLabels[0]

          return {
            assignee: assignee ?? operatorLabels[0] ?? '综合维修组',
            code: `WO-REPORT-${alert.id.replace(/\D/g, '').padStart(3, '0')}`,
            due: alert.severity === 'high' ? '今天 18:00' : '明天 10:00',
            id: `mobile-alert-work-order-${alert.id}`,
            linkedAlertId: alert.id,
            opinion: alert.detail,
            progress: 0,
            source: 'mobile-alert',
            sourceLabel: '手机端报警转工单',
            status: '待接单',
            steps: ['接收手机端告警', '现场复核', '处理异常', '回填结果'],
            title: `处置手机端上报：${alert.title}`,
            tools: '移动工单 / 现场照片 / 处理记录',
          }
        }),
    [acceptedMobileAlertIds, dashboard.mobileAlerts, operatorLabels],
  )

  const liveTasks = useMemo<LiveTask[]>(
    () => [
      ...mobileAlertTasks,
      ...dashboard.tasks.map((task, index) => ({
        ...task,
        code: taskCode(task, index),
        linkedAlertId: dashboard.alerts[index]?.id,
        progress: task.progress ?? (index === 0 ? 65 : 30),
        source: 'platform' as const,
        sourceLabel: '平台告警工单',
        status: task.status ?? (index === 0 ? '处理中' : '待复核'),
        steps: taskSteps(task),
        tools: taskTools(task),
      })),
      ...manualTasks,
    ],
    [dashboard.alerts, dashboard.tasks, manualTasks, mobileAlertTasks],
  )

  const liveAlerts = useMemo<LiveAlert[]>(
    () =>
      dashboard.alerts
        .filter((alert) => !resolvedPlatformAlertIds.includes(alert.id))
        .map((alert, index) => ({
          ...alert,
          status:
            manualTasks.some((task) => task.linkedAlertId === alert.id) || index < 2
              ? '已派单'
              : alert.status,
          linkedTaskId:
            manualTasks.find((task) => task.linkedAlertId === alert.id)?.id ??
            (index < 2 ? liveTasks[index]?.id : undefined),
        })),
    [dashboard.alerts, liveTasks, manualTasks, resolvedPlatformAlertIds],
  )

  const mobileAlerts = useMemo(
    () =>
      dashboard.mobileAlerts.map((alert) => ({
        ...alert,
        status: acceptedMobileAlertIds.includes(alert.id) ? ('已受理' as const) : alert.status,
      })),
    [acceptedMobileAlertIds, dashboard.mobileAlerts],
  )

  const reviewedOrderIdSet = useMemo(() => new Set(reviewedMobileOrderIds), [reviewedMobileOrderIds])

  useIntervalTick(() => {
    setLastSyncSeconds((seconds) => (seconds >= 5 ? 0 : seconds + 1))
  }, 1000)

  useIntervalTick(() => {
    setOperators(randomInt(6, 9))
  }, 5000)

  const buildDispatchPlan = (preferredAssignee?: string): DispatchPlanItem[] => {
    const candidates = liveAlerts.filter((alert) => !alert.linkedTaskId)
    const fallbackAssignees = operatorLabels.length ? operatorLabels : ['综合维修组']

    return candidates.map((alert, index) => {
      const assignee =
        preferredAssignee ||
        (alert.title.includes('照明')
          ? fallbackAssignees.find((name) => name.includes('李工'))
          : alert.title.includes('空调') || alert.title.includes('新风')
            ? fallbackAssignees.find((name) => name.includes('赵工'))
            : alert.title.includes('配电') || alert.title.includes('电')
              ? fallbackAssignees.find((name) => name.includes('王工'))
              : fallbackAssignees[index % fallbackAssignees.length]) ||
        fallbackAssignees[index % fallbackAssignees.length] ||
        '综合维修组'

      return {
        alert,
        assignee,
        code: `WO-AUTO-${String(51 + index).padStart(3, '0')}`,
        due: alert.severity === 'high' ? '今天 18:00' : '明天 10:00',
        opinion: alert.recommendation,
      }
    })
  }

  const openDispatchPlan = (preferredAssignee?: string) => {
    const plan = buildDispatchPlan(preferredAssignee)
    if (!plan.length) {
      setAgentPulse(true)
      window.setTimeout(() => setAgentPulse(false), 1200)
      return
    }
    setDispatchPlan(plan)
  }

  const acceptMobileAlert = (id: string) => {
    setAcceptedMobileAlertIds((current) => (current.includes(id) ? current : [...current, id]))
    const alert = dashboard.mobileAlerts.find((item) => item.id === id)
    if (alert) {
      const taskId = `mobile-alert-work-order-${alert.id}`
      setHighlightedTaskId(taskId)
      window.setTimeout(() => document.getElementById(taskId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
    }
    setAgentPulse(true)
    window.setTimeout(() => setAgentPulse(false), 1400)
  }

  const reviewMobileWorkOrder = (id: string) => {
    setReviewedMobileOrderIds((current) => (current.includes(id) ? current : [...current, id]))
    setRejectionOpinions((current) => {
      const { [id]: _removed, ...rest } = current
      return rest
    })
    setAgentPulse(true)
    window.setTimeout(() => setAgentPulse(false), 1400)
  }

  const rejectMobileWorkOrder = (id: string, opinion: string) => {
    setReviewedMobileOrderIds((current) => current.filter((orderId) => orderId !== id))
    setRejectionOpinions((current) => ({ ...current, [id]: opinion }))
    setAgentPulse(true)
    window.setTimeout(() => setAgentPulse(false), 1400)
  }

  const dispatchAlertWorkOrder = (
    alert: LiveAlert,
    assignee: string,
    options?: { code?: string; due?: string; opinion?: string },
  ) => {
    if (liveTasks.some((task) => task.linkedAlertId === alert.id)) return

    const sequence = liveTasks.length + 31
    const task: LiveTask = {
      assignee,
      code: options?.code ?? `WO-MANUAL-${String(sequence).padStart(3, '0')}`,
      due: options?.due ?? (alert.severity === 'high' ? '今天 18:00' : '明天 10:00'),
      id: `manual-work-order-${alert.id}`,
      linkedAlertId: alert.id,
      opinion: options?.opinion ?? alert.recommendation,
      progress: 0,
      status: '待接单',
      steps: ['接收工单', '现场复核', '处理异常', '回填结果'],
      title: `处置 ${alert.title}`,
      tools: '移动工单 / 巡检终端 / 现场照片',
    }

    setManualTasks((current) => [...current, task])
    setHighlightedAlertId(alert.id)
    setHighlightedTaskId(task.id)
    setPulseAlertId(alert.id)
    setAgentPulse(true)
    window.setTimeout(() => {
      setPulseAlertId(null)
      setAgentPulse(false)
    }, 1800)
  }

  const resolvePlatformAlert = useCallback(
    (alertId: string) => {
      setResolvedPlatformAlertIds((current) =>
        current.includes(alertId) ? current : [...current, alertId],
      )
      markOfficeAlertResolved(projectId, alertId)
    },
    [projectId],
  )

  const adoptDecarbonAction = (action: OperationsDecarbonAction) => {
    setAdoptedDecarbonActionIds((current) => (current.includes(action.id) ? current : [...current, action.id]))

    const taskId = `decarbon-work-order-${action.id}`
    if (liveTasks.some((task) => task.id === taskId)) {
      setHighlightedTaskId(taskId)
      setAgentPulse(true)
      window.setTimeout(() => setAgentPulse(false), 1200)
      return
    }

    const linkedAlert = dashboard.alerts.find((alert) => action.title.includes('3F')
      ? alert.id.includes('3f')
      : action.title.includes('2F')
        ? alert.id.includes('2f')
        : action.title.includes('B1')
          ? alert.id.includes('b1')
          : false)
    const task: LiveTask = {
      assignee: action.owner,
      code: action.linkedWorkOrder.startsWith('WO-') ? action.linkedWorkOrder : `WO-DECARBON-${String(manualTasks.length + 41).padStart(3, '0')}`,
      due: action.risk === 'low' ? '明天 10:00' : '今天 18:00',
      id: taskId,
      linkedAlertId: linkedAlert?.id,
      opinion: `智能减排闭环纳入：${action.title}。预计节电 ${action.expectedSavingKwh.toFixed(1)} kWh/日，预计减排 ${action.expectedCarbonKg.toFixed(1)} kgCO₂e/日。${action.nextAction}`,
      progress: 0,
      status: '待接单',
      steps: ['接收减排动作', '现场复核', '执行节能策略', '回填节电效果'],
      title: `减排动作：${action.title}`,
      tools: '移动工单 / 能耗曲线 / 策略日志',
    }

    setManualTasks((current) =>
      current.some((existingTask) => existingTask.id === task.id) ? current : [...current, task],
    )
    setHighlightedTaskId(task.id)
    if (linkedAlert) {
      setHighlightedAlertId(linkedAlert.id)
      setPulseAlertId(linkedAlert.id)
    }
    setAgentPulse(true)
    window.setTimeout(() => {
      setPulseAlertId(null)
      setAgentPulse(false)
    }, 1800)
  }

  const askDecarbonReason = (action: OperationsDecarbonAction) => {
    setAskedDecarbonActionIds((current) => (current.includes(action.id) ? current : [...current, action.id]))
    agentTriggerSequenceRef.current += 1
    setAgentTrigger({
      answer: buildDecarbonReasonAnswer(action),
      id: agentTriggerSequenceRef.current,
      prompt: `追问减排原因：${action.title}`,
    })
    setAgentPulse(true)
    window.setTimeout(() => setAgentPulse(false), 1400)
  }

  const approveDispatchPlan = () => {
    dispatchPlan.forEach((item) => {
      dispatchAlertWorkOrder(item.alert, item.assignee, {
        code: item.code,
        due: item.due,
        opinion: item.opinion,
      })
      window.setTimeout(() => resolvePlatformAlert(item.alert.id), 1200)
    })
    setDispatchPlan([])
    setMobileDispatchStatus('已发至手机端')
    window.setTimeout(() => setMobileDispatchStatus('手机端处理中'), 1200)
  }

  const activeAlertCount = liveAlerts.length
  const pendingTaskCount =
    liveTasks.length + dashboard.mobileWorkOrders.filter((order) => !reviewedOrderIdSet.has(order.id)).length

  const kpis = [
    {
      detail: dashboard.metrics.find((metric) => metric.label === '站点健康度')?.detail ?? '较昨日 +2',
      icon: <ShieldCheck className="h-7 w-7" strokeWidth={1.7} />,
      label: '站点健康度',
      numeric: metricValue(dashboard.metrics, '站点健康度', 72),
      suffix: '分',
      tone: 'cyan' as const,
    },
    {
      detail: dashboard.metrics.find((metric) => metric.label === '活跃告警')?.detail ?? '高优 1 · 中优 3 · 低优 1',
      icon: <AlertTriangle className="h-7 w-7" strokeWidth={1.7} />,
      label: '活跃告警',
      numeric: activeAlertCount,
      suffix: '条',
      tone: 'rose' as const,
    },
    {
      detail: dashboard.metrics.find((metric) => metric.label === '待处理工单')?.detail ?? '超期 0 · 即将到期 1',
      icon: <ClipboardList className="h-7 w-7" strokeWidth={1.7} />,
      label: '待处理工单',
      numeric: pendingTaskCount,
      suffix: '条',
      tone: 'amber' as const,
    },
    {
      detail: dashboard.metrics.find((metric) => metric.label === '巡检覆盖率')?.detail ?? '本月累计 412 次',
      icon: <Radar className="h-7 w-7" strokeWidth={1.7} />,
      label: '巡检覆盖率',
      numeric: metricValue(dashboard.metrics, '巡检覆盖率', 99),
      suffix: '%',
      tone: 'emerald' as const,
    },
    {
      detail: '平均响应 1.2s · v2.4.1',
      icon: <Cpu className="h-7 w-7" strokeWidth={1.7} />,
      label: '智能体状态',
      textValue: '已接入',
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
      <DispatchConfirmDialog
        onApprove={approveDispatchPlan}
        onClose={() => setDispatchPlan([])}
        plan={dispatchPlan}
      />
      <MobileMaterialDetailDialog
        detail={mobileDetail}
        onClose={() => setMobileDetail(null)}
        onRejectWorkOrder={rejectMobileWorkOrder}
        onReviewWorkOrder={reviewMobileWorkOrder}
        rejectionOpinions={rejectionOpinions}
        reviewedOrderIds={reviewedOrderIdSet}
      />

      <div className="relative z-10 flex w-full flex-col gap-6 px-5 pb-6 pt-4">
        <header className="operations-page-hero flex flex-wrap items-center justify-between gap-4 border border-cyan-300/24 bg-cyan-950/18 px-5 py-4">
          <div>
            <h1
              className="operations-page-title text-[46px] leading-none text-cyan-50"
              style={{ fontFamily: DASHBOARD_FONTS.title }}
            >
              智慧运维
            </h1>
            <div className="mt-2 text-sm font-bold text-cyan-100/70">
              公寓楼(BLDG-APT) / 全部设备
            </div>
          </div>
          <div className="operations-header-tools flex flex-wrap items-center gap-3">
            <label className="operations-filter-wrap">
              <Filter className="h-4 w-4" strokeWidth={1.8} />
              <span className="sr-only">筛选范围</span>
              <select
                className="operations-filter-select"
                onChange={(event) => setScope(event.target.value)}
                value={scope}
              >
                <option>全部设备</option>
                <option>暖通设备</option>
                <option>电气回路</option>
                <option>给排水设备</option>
              </select>
              <ChevronDown className="h-4 w-4" strokeWidth={1.8} />
            </label>
            <span
              className="operations-health-pill"
              {...tooltipAttrs({
                rows: [
                  { label: 'API 延迟', value: '86ms' },
                  { label: '最近一次心跳', value: '19:58:50' },
                ],
                title: '健康运行',
              })}
            >
              <span className="data-status-dot" />
              健康运行
            </span>
            <span className="operations-header-clock">{now ? formatClockWithSeconds(now) : '--:--:--'}</span>
            <span className="operations-weather">
              <CloudSun className="h-4 w-4" strokeWidth={1.8} />
              多云 26°C
            </span>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
          {kpis.map((kpi) => (
            <OperationsKpiCard key={kpi.label} {...kpi} tooltip={kpiTooltip(kpi.label)} />
          ))}
        </section>

        <div className="operations-main-grid">
          <div className="operations-left-stack flex min-w-0 flex-col gap-6">
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
              onDispatchWorkOrder={dispatchAlertWorkOrder}
              onHighlightTask={setHighlightedTaskId}
              onOneClickDispatch={() => openDispatchPlan()}
              operatorOptions={dashboard.mobileOperators}
              pulseAlertId={pulseAlertId}
            />
            <TaskList highlightedTaskId={highlightedTaskId} tasks={liveTasks} />
            <MobileOpsBridge
              alerts={mobileAlerts}
              mobileWorkOrders={dashboard.mobileWorkOrders}
              onAcceptAlert={acceptMobileAlert}
              onOpenAlertDetail={(alert) => setMobileDetail({ item: alert, kind: 'alert' })}
              onOpenWorkOrderDetail={(order) => setMobileDetail({ item: order, kind: 'work-order' })}
              onReviewWorkOrder={reviewMobileWorkOrder}
              rejectionOpinions={rejectionOpinions}
              reviewedOrderIds={reviewedOrderIdSet}
            />
          </div>

          <div className="operations-right-stack flex min-w-0 flex-col gap-6">
            <FocusOverview
              alerts={liveAlerts}
              highlightedAlertId={highlightedAlertId}
              onHighlight={setHighlightedAlertId}
            />
            <AgentChat
              agentPulse={agentPulse}
              dashboard={dashboard}
              onOneClickDispatch={() => openDispatchPlan()}
              trigger={agentTrigger}
            />
            <DecarbonAgentPanel
              actions={dashboard.decarbonActions}
              adoptedActionIds={adoptedDecarbonActionIds}
              askedActionIds={askedDecarbonActionIds}
              onAdoptAction={adoptDecarbonAction}
              onAskReason={askDecarbonReason}
            />
          </div>
        </div>

        <OperationsStatusBar
          doneTasks={8 + reviewedOrderIdSet.size}
          lastSyncSeconds={lastSyncSeconds}
          operators={operators}
          todayAlerts={activeAlertCount}
        />
      </div>
    </div>
  )
}
