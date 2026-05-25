'use client'

import NumberFlow from '@number-flow/react'
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ClipboardList,
  CloudSun,
  Cpu,
  Filter,
  Lightbulb,
  Radar,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BevelCard, VideoBackground } from '@/features/analytics/components/dashboard-primitives'
import { DASHBOARD_COLORS, DASHBOARD_FONTS } from '@/features/analytics/components/dashboard-theme'
import {
  type DashboardTooltipContent,
  DashboardTooltipLayer,
  tooltipAttrs,
} from '@/features/analytics/components/dashboard-tooltip'
import type { AssistantWorkOrderDraft } from '@/features/energy-insights/components/energy-assistant-chat'
import type { EnergyApiResponse } from '@/features/energy-insights/lib/energy-api'
import type { HostQueryResult } from '@/features/energy-insights/lib/host-query'
import { useNow } from '@/features/host-shell/lib/time-store'
import {
  buildOperationsDashboardData,
  type OperationsAlert,
  type OperationsStrategy,
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
  progress: number
  status: string
  steps: string[]
  tools: string
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
  '峰值出现在什么时段?',
  '给我三条优化建议',
  '列出当前高能耗设备',
]

const DEFAULT_AGENT_QUESTION = '总结当前能耗情况'

const DEFAULT_AGENT_ANSWER = `【问题理解】
快速掌握公寓楼当前整体能耗状况与异常点。

【核心结论】
整体能耗在合理区间,但有 2 个重点异常:BLDG-APT-3F 新风机组负荷
高于基线 29.8%,需优先处置;2F 公区照明夜间未按计划闭锁,产生
16.4% 的无效负荷。

【分析依据】
● 数据依据:近 1 小时新风机组负荷 112.4 kWh(基线 86.6 kWh);
  2F 公区照明夜间负荷 78.8 kWh(基线 67.7 kWh)。
● 知识依据:基线取自过去 30 天同时段加权平均。

【原因分析】
● 新风机组:阀门开度异常或过滤器压差超标,导致风机长时间高频运转
  (可能性高)。
● 公区照明:人体感应阈值过低或定时控制策略失效,触发夜间常亮
  (可能性中)。

【排查与优化建议】
● 排查步骤:
  1. 现场核查 3F 新风机组过滤器压差与送回风温差
  2. 调取 2F 照明回路 21:00–06:00 控制日志
● 优化措施:
  - 短期:推进工单 WO-BUILDING-031,今晚前完成新风机组复核;
    调整 2F 公区照明定时策略至 22:00 强制闭锁
  - 中长期:为新风机组增配振动传感器,接入预测性维护模型;
    统一公区照明人体感应阈值标准`

const ANSWER_BANK: Record<string, AgentAnswer> = {
  总结当前能耗情况: {
    followUps: ['新风机组的能耗趋势怎么样?', '怎么排查照明回路夜间未闭锁?'],
    text: `【问题理解】
快速复盘当前运行负荷和未闭环异常。
【核心结论】
站点健康度 97 分,活跃告警 5 条。
当前优先级最高的是 3F 新风机组。
【分析依据】
● 新风机组当前 112.4 kWh,高于基线 29.8%。
● 2F 公区照明当前 78.8 kWh,高于基线 16.4%。
【原因分析】
● 暖通侧更像过滤器压差或阀门开度问题。
● 照明侧更像夜间闭锁策略未生效。
【排查与优化建议】
● 今天先推进 WO-BUILDING-031。
● 同步复核 WO-BUILDING-032 的夜间控制日志。
● B1 水泵和 5F 空调机组纳入当班巡检清单。`,
  },
  '峰值出现在什么时段?': {
    followUps: ['新风机组的能耗趋势怎么样?', '列出当前高能耗设备'],
    text: `【问题理解】
定位今天能耗峰值的时间窗口和主因设备。
【核心结论】
峰值集中在 19:00-20:00。
峰值主要由 3F 新风机组和 2F 公区照明叠加造成。
【分析依据】
● 19:42 新风机组负荷达到 112.4 kWh。
● 19:18 公区照明负荷达到 78.8 kWh。
● 两项异常都高于过去 30 天同时段基线。
【原因分析】
● 新风机组可能在晚高峰后仍保持高频运行。
● 照明回路未闭锁扩大了夜间底负荷。
【排查与优化建议】
● 先核对 18:30-20:30 的设备启停记录。
● 检查新风阀门开度是否自动回落。
● 将 2F 照明 22:00 强制闭锁策略今晚生效。`,
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
    text: `【问题理解】
列出当前最影响能耗的设备和处理顺序。
【核心结论】
当前高能耗设备有 4 类。
首位是 BLDG-APT-3F 新风机组。
【分析依据】
● 3F 新风机组:112.4 kWh,+29.8%。
● 2F 公区照明回路:78.8 kWh,+16.4%。
● 5F 空调机组:回风温度 28.6°C,+3.2°C。
● B1 水泵:11 次/小时,启停频次偏高。
【原因分析】
● 暖通负荷和照明底负荷共同抬高晚间总负荷。
【排查与优化建议】
● 先处理新风机组,再复核照明闭锁。
● 空调回风和水泵启停纳入当班复核。`,
  },
  '新风机组的能耗趋势怎么样?': {
    followUps: ['峰值出现在什么时段?', '给我三条优化建议'],
    text: `【问题理解】
判断 3F 新风机组是短时波动还是持续偏高。
【核心结论】
近 1 小时呈持续高位,不是单个采样点异常。
当前 112.4 kWh,较 86.6 kWh 基线高 29.8%。
【分析依据】
● 告警发生在 19:42,状态为处理中。
● 工单 WO-BUILDING-031 已推进到 65%。
● 偏差幅度超过当班复核阈值。
【原因分析】
● 过滤器压差超标会抬高风机功率。
● 阀门开度异常会导致系统持续补风。
【排查与优化建议】
● 现场复核过滤器压差、送回风温差和电流。
● 若压差超标,本周内完成过滤器更换。
● 复核后观察 30 分钟负荷是否回落。`,
  },
  '怎么排查照明回路夜间未闭锁?': {
    followUps: ['列出当前高能耗设备', '给我三条优化建议'],
    text: `【问题理解】
给出 2F 公区照明夜间常亮的排查路径。
【核心结论】
优先检查时控策略,再检查人体感应阈值。
当前负荷 78.8 kWh,较基线高 16.4%。
【分析依据】
● 告警发生在 19:18,状态为已派单。
● 关联工单 WO-BUILDING-032 进度 30%。
● 异常位置为 Level 2 公区走廊。
【原因分析】
● 定时闭锁未下发会导致夜间常亮。
● 感应阈值过低会频繁触发照明保持。
【排查与优化建议】
● 调取 21:00-06:00 控制日志。
● 抽查网关策略是否覆盖该回路。
● 今晚将 22:00 强制闭锁策略先行生效。`,
  },
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

function OperationsKpiCard({
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
        {alert.recommendation}
      </div>
      <div className="operations-alert-actions mt-3 flex justify-end gap-2">
        <button type="button">查看详情</button>
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
      rightSlot={<StatusBadge tone="rose">5 条活跃</StatusBadge>}
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
          { label: '关联告警', value: task.linkedAlertId ? '已绑定' : '未绑定' },
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
      rightSlot={<StatusBadge tone="amber">待办 2 · 处理中 1 · 超期 0</StatusBadge>}
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
    <OperationsPanel icon={<Lightbulb className="h-5 w-5" strokeWidth={1.8} />} title="待优化项">
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
                  { label: '处理类型', value: '运维待办' },
                  { label: '计划窗口', value: index === 1 ? '今晚' : '本周' },
                ],
                title: strategy.title,
              })}
            >
              <div className="flex items-center gap-3">
                <span className="operations-strategy-index">{index + 1}</span>
                <span className="min-w-0 flex-1 text-[16px] font-black text-cyan-50">
                  {strategy.title}
                </span>
                <span className="operations-adopt-btn">查看</span>
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
            <div className="mt-2 text-[12px] leading-5 text-cyan-100/58">
              {alert.location} · {alert.currentValue}
            </div>
          </button>
        ))}
      </div>
    </OperationsPanel>
  )
}

function TypingText({
  active,
  content,
  onDone,
}: {
  active?: boolean
  content: string
  onDone?: () => void
}) {
  const [visible, setVisible] = useState(active ? '' : content)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

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

function buildFallbackAnswer(prompt: string): AgentAnswer {
  return {
    followUps: ['总结当前能耗情况', '给我三条优化建议'],
    text: `【问题理解】
你想确认:${prompt}
【核心结论】
当前先按 5 条活跃告警和 2 条待处理工单处置。
【分析依据】
● 高优告警为 3F 新风机组负荷偏高。
● 两张工单均未超期。
【原因分析】
● 当前主要风险来自暖通负荷和夜间照明策略。
【排查与优化建议】
● 优先查看 WO-BUILDING-031。
● 同步复核 WO-BUILDING-032。
● 处理后再观察 30 分钟负荷回落情况。`,
  }
}

function AgentChat({ agentPulse }: { agentPulse: boolean }) {
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [activePrompt, setActivePrompt] = useState<string | null>(null)
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      content: DEFAULT_AGENT_QUESTION,
      id: 'user-default-summary',
      role: 'user',
    },
    {
      content: DEFAULT_AGENT_ANSWER,
      followUps: ['新风机组的能耗趋势怎么样?', '怎么排查照明回路夜间未闭锁?'],
      id: 'assistant-default-summary',
      role: 'assistant',
      typing: false,
    },
  ])
  const messageAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const area = messageAreaRef.current
    if (!area) return
    area.scrollTop = area.scrollHeight
  }, [messages, thinking])

  const completeTyping = (messageId: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, typing: false } : message,
      ),
    )
  }

  const submitPrompt = (rawPrompt: string) => {
    const prompt = rawPrompt.trim()
    if (!prompt || thinking) return

    const answer = ANSWER_BANK[prompt] ?? buildFallbackAnswer(prompt)
    const now = Date.now()
    const assistantId = `assistant-${now}`

    setMessages((current) => [
      ...current,
      { content: prompt, id: `user-${now}`, role: 'user' },
    ])
    setDraft('')
    setThinking(true)
    setActivePrompt(prompt)

    window.setTimeout(() => {
      setThinking(false)
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
      window.setTimeout(() => setActivePrompt(null), 520)
    }, 5000)
  }

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
                    'operations-chat-bubble max-w-[88%] whitespace-pre-line px-3 py-2 text-[13px] leading-6',
                    message.role === 'assistant' ? 'assistant' : 'user',
                  )}
                >
                  <TypingText
                    active={message.typing}
                    content={message.content}
                    onDone={() => completeTyping(message.id)}
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
        <div
          {...tooltipAttrs({
            rows: [
              { label: '累计口径', value: '今日 00:00 至当前全部新增告警' },
              { label: '活跃口径', value: '当前未闭环告警 5 条' },
            ],
            title: '今日新增告警口径',
          })}
        >
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

  const liveTasks = useMemo<LiveTask[]>(
    () =>
      dashboard.tasks.map((task, index) => ({
        ...task,
        code: taskCode(task, index),
        linkedAlertId: dashboard.alerts[index]?.id,
        progress: task.progress ?? (index === 0 ? 65 : 30),
        status: task.status ?? (index === 0 ? '处理中' : '待复核'),
        steps: taskSteps(task),
        tools: taskTools(task),
      })),
    [dashboard.alerts, dashboard.tasks],
  )

  const liveAlerts = useMemo<LiveAlert[]>(
    () =>
      dashboard.alerts.map((alert, index) => ({
        ...alert,
        linkedTaskId: index < 2 ? liveTasks[index]?.code : undefined,
      })),
    [dashboard.alerts, liveTasks],
  )

  useIntervalTick(() => {
    setLastSyncSeconds((seconds) => (seconds >= 5 ? 0 : seconds + 1))
  }, 1000)

  useIntervalTick(() => {
    setOperators(randomInt(6, 9))
  }, 5000)

  const kpis = [
    {
      detail: dashboard.metrics.find((metric) => metric.label === '站点健康度')?.detail ?? '较昨日 +2',
      icon: <ShieldCheck className="h-7 w-7" strokeWidth={1.7} />,
      label: '站点健康度',
      numeric: metricValue(dashboard.metrics, '站点健康度', 97),
      suffix: '分',
      tone: 'cyan' as const,
    },
    {
      detail: dashboard.metrics.find((metric) => metric.label === '活跃告警')?.detail ?? '高优 1 · 中优 3 · 低优 1',
      icon: <AlertTriangle className="h-7 w-7" strokeWidth={1.7} />,
      label: '活跃告警',
      numeric: liveAlerts.length,
      suffix: '条',
      tone: 'rose' as const,
    },
    {
      detail: dashboard.metrics.find((metric) => metric.label === '待处理工单')?.detail ?? '超期 0 · 即将到期 1',
      icon: <ClipboardList className="h-7 w-7" strokeWidth={1.7} />,
      label: '待处理工单',
      numeric: liveTasks.length,
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

      <div className="relative z-10 flex w-full flex-col gap-6 px-5 pb-6 pt-4">
        <header className="operations-page-hero flex flex-wrap items-center justify-between gap-4 border border-cyan-300/24 bg-cyan-950/18 px-5 py-4">
          <div>
            <h1
              className="operations-page-title text-[46px] leading-none text-cyan-50"
              style={{ fontFamily: DASHBOARD_FONTS.title }}
            >
              智慧运维
            </h1>
            <div className="mt-2 text-[13px] font-semibold text-cyan-100/62">
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
              onHighlightTask={setHighlightedTaskId}
              pulseAlertId={pulseAlertId}
            />
            <TaskList highlightedTaskId={highlightedTaskId} tasks={liveTasks} />
            <StrategyList strategies={dashboard.strategies} />
          </div>

          <div className="operations-right-stack flex min-w-0 flex-col gap-6">
            <FocusOverview
              alerts={liveAlerts}
              highlightedAlertId={highlightedAlertId}
              onHighlight={setHighlightedAlertId}
            />
            <AgentChat agentPulse={agentPulse} />
          </div>
        </div>

        <OperationsStatusBar
          doneTasks={8}
          lastSyncSeconds={lastSyncSeconds}
          operators={operators}
          todayAlerts={237}
        />
      </div>
    </div>
  )
}
