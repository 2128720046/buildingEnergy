import type { EnergyApiResponse } from '@/features/energy-insights/lib/energy-api'
import type { HostQueryResult } from '@/features/energy-insights/lib/host-query'

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
  metrics: OperationsMetric[]
  mobileAlerts: MobileAlertReport[]
  mobileOperators: OperationsOperator[]
  mobileWorkOrders: MobileUploadedWorkOrder[]
  strategies: OperationsStrategy[]
  summary: string
  tasks: OperationsTask[]
}

export function buildOperationsDashboardData({
  additionalTasks: _additionalTasks,
  energyResult: _energyResult,
  projectId: _projectId,
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
  const alerts: OperationsAlert[] = [
    {
      baselineDelta: '+29.8%',
      currentValue: '112.4 kWh',
      detail: 'Level 3 西侧设备间 · 112.4 kWh(+29.8%)',
      id: 'apt-3f-fresh-air-high-load',
      location: 'Level 3 西侧设备间',
      occurredAt: '19:42',
      recommendation:
        '优先处理:BLDG-APT-3F 新风机组负荷偏高。当前负荷 112.4 kWh,较 30 天同时间段基线高 29.8%,已派发工单 WO-BUILDING-031。暖通运维一组需先核查过滤器压差、阀门开度和送回风温差,今晚复核后回填处理记录。',
      severity: 'high',
      status: '处理中',
      title: 'BLDG-APT-3F 新风机组 负荷偏高',
    },
    {
      baselineDelta: '+16.4%',
      currentValue: '78.8 kWh',
      detail: 'Level 2 公区走廊 · 78.8 kWh(+16.4%)',
      id: 'apt-2f-lighting-unlocked',
      location: 'Level 2 公区走廊',
      occurredAt: '19:18',
      recommendation: '已派单给电气运维二组，复核 21:00-06:00 定时闭锁与人体感应阈值。',
      severity: 'medium',
      status: '已派单',
      title: 'BLDG-APT-2F 公区照明回路 夜间未闭锁',
    },
    {
      baselineDelta: '较基线 +6 次/小时',
      currentValue: '11 次/小时',
      detail: '地下设备层 · 11 次/小时(较基线 +6 次/小时)',
      id: 'apt-b1-pump-short-cycle',
      location: '地下设备层',
      occurredAt: '18:55',
      recommendation: '待给排水组现场复核止回阀状态、压差传感器采样和启停阈值。',
      severity: 'medium',
      status: '待处理',
      title: 'BLDG-APT-B1 水泵 频繁启停',
    },
    {
      baselineDelta: '+3.2°C',
      currentValue: '28.6°C',
      detail: 'Level 5 · 28.6°C(+3.2)',
      id: 'apt-5f-ahu-return-temp',
      location: 'Level 5',
      occurredAt: '17:30',
      recommendation: '待暖通值班员检查回风传感器、冷冻水阀门开度和末端风量。',
      severity: 'medium',
      status: '待处理',
      title: 'BLDG-APT-5F 空调机组 回风温度异常',
    },
    {
      baselineDelta: '较阈值 +0.6 mm/s',
      currentValue: '4.8 mm/s',
      detail: '屋面 · 4.8 mm/s(较阈值 +0.6 mm/s)',
      id: 'apt-rf-cooling-tower-vibration',
      location: '屋面',
      occurredAt: '16:12',
      recommendation: '已确认并纳入本周巡检，优先检查风机轴承、紧固件和基础减振状态。',
      severity: 'low',
      status: '已确认',
      title: 'BLDG-APT-RF 屋顶冷却塔 风机振动告警',
    },
  ]

  const tasks: OperationsTask[] = [
    {
      code: 'WO-BUILDING-031',
      id: 'work-order-031',
      progress: 65,
      status: '处理中',
      title: '处置 3F 新风机组负荷偏高',
      assignee: '赵工 · 暖通运维组',
      due: '今天 16:30',
    },
    {
      code: 'WO-BUILDING-032',
      id: 'work-order-032',
      progress: 30,
      status: '待复核',
      title: '复核 2F 公区照明回路夜间未闭锁',
      assignee: '李工 · 照明巡检组',
      due: '明天 10:00',
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
      value: '97',
      detail: '较昨日 +2',
    },
    {
      label: '活跃告警',
      value: '5',
      detail: '高优 1 · 中优 3 · 低优 1',
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
    '优先处理:BLDG-APT-3F 新风机组负荷偏高。当前负荷 112.4 kWh,较 30 天同时间段基线高 29.8%,已派发工单 WO-BUILDING-031。处置重点是过滤器压差、阀门开度和送回风温差,责任人为暖通运维一组;今天 16:30 前完成现场复核,若负荷 30 分钟内未回落,同步调整新风策略并升级为值班长复核。'

  return {
    alerts,
    metrics,
    mobileAlerts,
    mobileOperators,
    mobileWorkOrders,
    strategies,
    summary,
    tasks,
  }
}
