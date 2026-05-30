import type { EnergyApiResponse } from '@/features/energy-insights/lib/energy-api'
import type { HostQueryResult } from '@/features/energy-insights/lib/host-query'
import {
  getActiveOfficeOperationsSnapshot,
  type OfficeOperationsAlert,
} from '@/features/energy-insights/lib/energy-mock-data'

export interface OperationsMetric {
  detail: string
  label: string
  value: string
}

export interface OperationsAlert {
  baselineDelta: string
  currentValue: string
  detail: string
  location: string
  occurredAt: string
  id: string
  recommendation: string
  severity: 'high' | 'low' | 'medium'
  status: string
  title: string
}

export interface OperationsTask {
  assignee: string
  code?: string
  due: string
  id: string
  progress?: number
  status?: string
  title: string
}

export interface OperationsDecarbonAction {
  confidence: number
  expectedCarbonKg: number
  expectedSavingKwh: number
  id: string
  linkedWorkOrder: string
  nextAction: string
  owner: string
  risk: 'high' | 'low' | 'medium'
  source: '告警中心' | '工单进度' | '智能体问答'
  status: string
  title: string
}

export interface OperationsOperator {
  name: string
  phone: string
  role: string
  site: string
}

export interface MobileAlertReport {
  detail: string
  deviceId: string
  id: string
  imageUrls: string[]
  location: string
  photoCount: number
  reporter: string
  severity: 'high' | 'low' | 'medium'
  status: '待接收' | '已推送待处理' | '已受理'
  submittedAt: string
  title: string
}

export interface MobileUploadedWorkOrder {
  anomaly: string
  code: string
  deviceId: string
  due: string
  id: string
  imageUrls: string[]
  location: string
  photoCount: number
  resultNote: string
  resultStatus: string
  source: string
  status: '待手机处理' | '待电脑端审阅' | '已审阅'
  title: string
}

export interface OperationsStrategy {
  description: string
  title: string
}

export interface OperationsDashboardData {
  alerts: OperationsAlert[]
  decarbonActions: OperationsDecarbonAction[]
  metrics: OperationsMetric[]
  mobileAlerts: MobileAlertReport[]
  mobileOperators: OperationsOperator[]
  mobileWorkOrders: MobileUploadedWorkOrder[]
  strategies: OperationsStrategy[]
  summary: string
  tasks: OperationsTask[]
}

function formatAlertDelta(alert: OfficeOperationsAlert) {
  if (alert.unit === '°C') return `+${alert.baselineDeltaPct.toFixed(1)}°C`
  return `+${alert.baselineDeltaPct.toFixed(1)}%`
}

function formatAlertCurrent(alert: OfficeOperationsAlert) {
  if (alert.unit === '°C') return `${alert.currentValue.toFixed(1)}°C`
  return `${alert.currentValue.toFixed(1)} kWh`
}

function mapOfficeAlert(alert: OfficeOperationsAlert): OperationsAlert {
  return {
    baselineDelta: formatAlertDelta(alert),
    currentValue: formatAlertCurrent(alert),
    detail: alert.detail,
    id: alert.id,
    location: alert.location,
    occurredAt: alert.occurredAt,
    recommendation: alert.recommendation,
    severity: alert.severity,
    status: alert.status,
    title: alert.title,
  }
}

function operatorForAlert(alert: OperationsAlert) {
  if (alert.title.includes('照明')) return '李工 · 照明巡检组'
  if (alert.title.includes('新风') || alert.title.includes('空调')) return '赵工 · 暖通运维组'
  return '陈工 · 综合维修组'
}

function taskTitleForAlert(alert: OperationsAlert) {
  return `处置 ${alert.title.replace(/^OFFICE-[A-Z]-/, '')}`
}

function buildAlertTasks(alerts: OperationsAlert[]) {
  return alerts.slice(0, 2).map((alert, index) => ({
    assignee: operatorForAlert(alert),
    code: `WO-BUILDING-${String(31 + index).padStart(3, '0')}`,
    due: index === 0 ? '今天 16:30' : '明天 10:00',
    id: `work-order-${String(31 + index).padStart(3, '0')}`,
    progress: index === 0 ? 65 : 30,
    status: index === 0 ? '处理中' : '待复核',
    title: taskTitleForAlert(alert),
  }))
}

export function buildOperationsDashboardData({
  additionalTasks,
  energyResult: _energyResult,
  projectId,
  queryResults: _queryResults,
  saveStatus: _saveStatus,
  selectedComponentId: _selectedComponentId,
  selectedComponentName: _selectedComponentName,
}: {
  additionalTasks?: OperationsTask[]
  energyResult: EnergyApiResponse | null
  projectId: string
  queryResults: HostQueryResult[]
  saveStatus: string
  selectedComponentId: string | null
  selectedComponentName: string
}): OperationsDashboardData {
  const operationsSnapshot = getActiveOfficeOperationsSnapshot(projectId)
  const alerts = operationsSnapshot.activeAlerts.map(mapOfficeAlert)
  const tasks: OperationsTask[] = [...buildAlertTasks(alerts), ...(additionalTasks ?? [])]
  const primaryAlert = alerts[0]

  const decarbonActions: OperationsDecarbonAction[] = [
    {
      confidence: 0.86,
      expectedCarbonKg: Number(((alerts[0]?.currentValue ? Number.parseFloat(alerts[0].currentValue) : 0) * 0.12).toFixed(1)),
      expectedSavingKwh: Number(((alerts[0]?.currentValue ? Number.parseFloat(alerts[0].currentValue) : 0) * 0.21).toFixed(1)),
      id: 'decarbon-3f-fresh-air-review',
      linkedWorkOrder: tasks[0]?.code ?? 'WO-BUILDING-031',
      nextAction: '复核过滤器压差与新风阀开度，确认后调整夜间新风策略。',
      owner: '赵工 · 暖通运维组',
      risk: 'medium',
      source: '智能体问答',
      status: '可执行',
      title: alerts[0]?.title.includes('新风') ? '18F 新风机组策略复核' : '首要告警策略复核',
    },
    {
      confidence: 0.82,
      expectedCarbonKg: Number(((alerts[1]?.currentValue ? Number.parseFloat(alerts[1].currentValue) : 0) * 0.1).toFixed(1)),
      expectedSavingKwh: Number(((alerts[1]?.currentValue ? Number.parseFloat(alerts[1].currentValue) : 0) * 0.18).toFixed(1)),
      id: 'decarbon-2f-lighting-lock',
      linkedWorkOrder: tasks[1]?.code ?? 'WO-BUILDING-032',
      nextAction: '今晚 22:00 下发强制闭锁策略，并回看 21:00-06:00 控制日志。',
      owner: '李工 · 照明巡检组',
      risk: 'low',
      source: '告警中心',
      status: '已关联工单',
      title: '2F 公区照明强制闭锁',
    },
  ]

  const mobileOperators: OperationsOperator[] = [
    { name: '王工', phone: '13800010001', role: '电气运维组', site: '思源楼' },
    { name: '李工', phone: '13800010002', role: '照明巡检组', site: '思源楼' },
    { name: '赵工', phone: '13800010003', role: '暖通运维组', site: '思源楼' },
    { name: '陈工', phone: '13800010004', role: '综合维修组', site: '思源楼' },
  ]

  const mobileAlerts: MobileAlertReport[] = [
    {
      detail: '巡检时发现 1A 配电箱附近有轻微焦糊味，柜门温度偏高。',
      deviceId: 'panel-1a',
      id: 'report-1',
      imageUrls: ['/mobile-ops/panel-inspection.png', '/mobile-ops/meter-review.png'],
      location: '思源楼 / 1F 配电间',
      photoCount: 2,
      reporter: '值班员 王工',
      severity: 'high',
      status: '已推送待处理',
      submittedAt: '今天 10:18',
      title: '配电间有焦糊味',
    },
    {
      detail: '现场确认无人通行时照明仍保持常亮，疑似时控策略未生效。',
      deviceId: 'light-2e',
      id: 'report-2',
      imageUrls: ['/mobile-ops/site-risk.png'],
      location: '思源楼 / 2F 东侧走廊',
      photoCount: 1,
      reporter: '值班员 李工',
      severity: 'medium',
      status: '已受理',
      submittedAt: '今天 09:35',
      title: '走廊照明常亮',
    },
  ]

  const mobileWorkOrders: MobileUploadedWorkOrder[] = [
    {
      anomaly: '过去 2 小时电流波动幅度较大，需复核采样稳定性。',
      code: 'WO-MOBILE-041',
      deviceId: 'panel-1a',
      due: '今天 18:00',
      id: 'wo-mobile-041',
      imageUrls: [
        '/mobile-ops/panel-inspection.png',
        '/mobile-ops/meter-review.png',
        '/mobile-ops/electric-safety.png',
      ],
      location: '思源楼 / 1F 配电间',
      photoCount: 3,
      resultNote: '紧固二次端子，复测电流曲线已恢复稳定。',
      resultStatus: '已检修',
      source: '电脑端能耗监测',
      status: '待电脑端审阅',
      title: '配电箱电流波动异常工单',
    },
    {
      anomaly: '低人流时段能耗未下降，存在待机设备未关闭。',
      code: 'WO-MOBILE-042',
      deviceId: 'meeting-5f',
      due: '昨天 15:10',
      id: 'wo-mobile-042',
      imageUrls: ['/mobile-ops/hvac-repair.png', '/mobile-ops/maintenance-team.png'],
      location: '思源楼 / 5F 会议区',
      photoCount: 2,
      resultNote: '关闭投影和插座待机负载，已提交等待电脑端审阅。',
      resultStatus: '已关闭异常',
      source: '电脑端能耗监测',
      status: '待电脑端审阅',
      title: '会议区待机能耗复核工单',
    },
  ]

  const metrics = [
    {
      label: '站点健康度',
      value: `${operationsSnapshot.healthScore}`,
      detail:
        operationsSnapshot.healthScore >= 85
          ? '运行稳定'
          : operationsSnapshot.healthScore >= 72
            ? '需关注告警闭环'
            : '需优先处置高优告警',
    },
    {
      label: '活跃告警',
      value: `${operationsSnapshot.alertSummary.total}`,
      detail: `高优 ${operationsSnapshot.alertSummary.high} · 中优 ${operationsSnapshot.alertSummary.medium}`,
    },
    {
      label: '待处理工单',
      value: '4',
      detail: '手机端待审 2 · 即将到期 1',
    },
    {
      label: '巡检覆盖率',
      value: '99%',
      detail: '本月累计 412 次',
    },
  ]

  const strategies = [
    {
      title: '完成 3F 新风机组过滤器更换',
      description: '暖通组负责，本周内完成并回填复核记录。',
    },
    {
      title: '复核 2F 公区照明感应阈值',
      description: '电气组负责，今晚完成夜间闭锁策略复核。',
    },
    {
      title: '校准 B1 水泵压差报警阈值',
      description: '给排水组负责，本周内完成阈值校准。',
    },
  ]

  const summary =
    primaryAlert
      ? `运维智能体建议优先处理 ${primaryAlert.title}。当前值 ${primaryAlert.currentValue}，较 30 天同时间段基线 ${primaryAlert.baselineDelta}。处置重点：${primaryAlert.recommendation}`
      : '当前统一模拟数据集未生成活跃告警，建议保持常规巡检并持续观察能耗基线。'

  return {
    alerts,
    decarbonActions,
    metrics,
    mobileAlerts,
    mobileOperators,
    mobileWorkOrders,
    strategies,
    summary,
    tasks,
  }
}
