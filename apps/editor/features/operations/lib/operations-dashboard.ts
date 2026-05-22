import type { EnergyApiResponse } from '@/features/energy-insights/lib/energy-api'
import type { HostQueryResult } from '@/features/energy-insights/lib/host-query'

export interface OperationsMetric {
  detail: string
  label: string
  value: string
}

export interface OperationsAlert {
  detail: string
  id: string
  recommendation: string
  severity: 'high' | 'low' | 'medium'
  title: string
}

export interface OperationsTask {
  assignee: string
  due: string
  id: string
  title: string
}

export interface OperationsStrategy {
  description: string
  title: string
}

export interface OperationsDashboardData {
  alerts: OperationsAlert[]
  metrics: OperationsMetric[]
  strategies: OperationsStrategy[]
  summary: string
  tasks: OperationsTask[]
}

function resolveSeverity(result: HostQueryResult): 'high' | 'low' | 'medium' {
  const normalized = result.energyLevel.toLowerCase()

  if (result.energyLevel.includes('高') || normalized.includes('high')) {
    return 'high'
  }

  if (result.energyLevel.includes('中') || normalized.includes('mid')) {
    return 'medium'
  }

  return 'low'
}

function normalizeComponentName(name: string) {
  return name === '未选中构件' ? '公寓楼-设备样本' : name
}

export function buildOperationsDashboardData({
  additionalTasks,
  energyResult,
  projectId,
  queryResults,
  saveStatus,
  selectedComponentId,
  selectedComponentName,
}: {
  additionalTasks?: OperationsTask[]
  energyResult: EnergyApiResponse | null
  projectId: string
  queryResults: HostQueryResult[]
  saveStatus: string
  selectedComponentId: string | null
  selectedComponentName: string
}): OperationsDashboardData {
  const rankedResults = [...queryResults].sort((left, right) => right.predictedUsage - left.predictedUsage)
  const highSeverityCount = rankedResults.filter((item) => resolveSeverity(item) === 'high').length
  const mediumSeverityCount = rankedResults.filter((item) => resolveSeverity(item) === 'medium').length
  const siteHealthScore = Math.max(66, 96 - highSeverityCount * 6 - mediumSeverityCount * 2)
  const inspectionCoverage = Math.min(99, 82 + Math.max(0, queryResults.length - highSeverityCount))

  function toAlert(item: HostQueryResult, severity: 'high' | 'medium' | 'low'): OperationsAlert {
    const currentLoad = Number((item.predictedUsage * 0.78).toFixed(1))
    const baselineLoad = Number((item.predictedUsage * 0.61).toFixed(1))
    const deviation = Number((((currentLoad - baselineLoad) / Math.max(1, baselineLoad)) * 100).toFixed(1))

    return {
      id: `${item.componentId}-${severity}`,
      severity,
      title: `${item.componentName} 负荷偏高`,
      detail: `${item.levelName} / ${item.zoneName} · 当前负荷 ${currentLoad} kWh（较基线 +${deviation}%）`,
      recommendation:
        severity === 'high'
          ? '建议 30 分钟内到场核查电流、送回风温差与阀门开度，并立即下发抢修工单。'
          : severity === 'medium'
            ? '建议纳入当班复核清单，校验时段策略与传感器采样频率。'
            : '保持监测，安排下个巡检窗口复核并记录趋势变化。',
    }
  }

  function fallbackAlert(severity: 'high' | 'medium' | 'low'): OperationsAlert {
    if (severity === 'high') {
      return {
        id: `fallback-${severity}-${projectId}`,
        severity,
        title: '公寓楼 3F 新风机组 负荷偏高',
        detail: 'Level 3 / 东侧走廊 · 当前负荷 108.0 kWh（较基线 +34.6%）',
        recommendation: '建议立即派发巡检工单，核查电流、送风温度与过滤器压差是否超阈值。',
      }
    }

    if (severity === 'medium') {
      return {
        id: `fallback-${severity}-${projectId}`,
        severity,
        title: '公寓楼 2F 公区照明回路 夜间未闭锁',
        detail: 'Level 2 / 电梯前室 · 当前负荷 86.0 kWh（较基线 +18.2%）',
        recommendation: '建议当班复核时控策略与人体感应器阈值，并核对节假日策略模板。',
      }
    }

    return {
      id: `fallback-${severity}-${projectId}`,
      severity,
      title: '公寓楼 B1 车库排风机 运行时长偏长',
      detail: 'Level B1 / 车道西区 · 当前负荷 64.0 kWh（较基线 +9.4%）',
      recommendation: '建议纳入低优先级观察清单，在下次巡检复核联动启停时序。',
    }
  }

  const highAlert =
    rankedResults.find((item) => resolveSeverity(item) === 'high') ?? rankedResults[0]
  const mediumAlert =
    rankedResults.find((item) => resolveSeverity(item) === 'medium' && item.componentId !== highAlert?.componentId) ??
    rankedResults.find((item) => item.componentId !== highAlert?.componentId)
  const lowAlert =
    rankedResults.find(
      (item) =>
        resolveSeverity(item) === 'low' &&
        item.componentId !== highAlert?.componentId &&
        item.componentId !== mediumAlert?.componentId,
    ) ??
    rankedResults.find(
      (item) => item.componentId !== highAlert?.componentId && item.componentId !== mediumAlert?.componentId,
    )

  const alerts: OperationsAlert[] = [
    highAlert ? toAlert(highAlert, 'high') : fallbackAlert('high'),
    mediumAlert ? toAlert(mediumAlert, 'medium') : fallbackAlert('medium'),
    lowAlert ? toAlert(lowAlert, 'low') : fallbackAlert('low'),
  ]

  const highPriorityAlertCount = alerts.filter((alert) => alert.severity === 'high').length

  const tasks: OperationsTask[] = [
    {
      id: `${alerts[0]!.id}-dispatch`,
      title: `工单 WO-${projectId.toUpperCase()}-031：处置 ${normalizeComponentName(alerts[0]!.title.replace(' 负荷偏高', ''))}`,
      assignee: '暖通运维一组',
      due: '今天 16:30',
    },
    {
      id: `${alerts[1]!.id}-inspection`,
      title: `工单 WO-${projectId.toUpperCase()}-032：复核 ${normalizeComponentName(alerts[1]!.title.replace(' 负荷偏高', ''))}`,
      assignee: '电气运维二组',
      due: '明天 10:00',
    },
  ]

  if (energyResult && selectedComponentId) {
    tasks[1] = {
      id: `${selectedComponentId}-calibration`,
      title: `工单 WO-${projectId.toUpperCase()}-032：复核 ${normalizeComponentName(selectedComponentName)} 的实时功率采样`,
      assignee: '数据诊断组',
      due: '明天 10:00',
    }
  }

  const mergedTasks = [...(additionalTasks ?? []), ...tasks]
    .filter((task, index, list) => list.findIndex((item) => item.id === task.id) === index)
    .slice(0, 8)

  const pendingTasks = mergedTasks.length

  const metrics = [
    {
      label: '站点健康度',
      value: `${siteHealthScore}`,
      detail: `项目 ${projectId} 的综合评估`,
    },
    {
      label: '活跃告警',
      value: `${alerts.length}`,
      detail: `高优先级 ${highPriorityAlertCount} 项`,
    },
    {
      label: '待处理工单',
      value: `${pendingTasks}`,
      detail: `当前保存状态 ${saveStatus}`,
    },
    {
      label: '巡检覆盖率',
      value: `${inspectionCoverage}%`,
      detail: '基于当前筛选结果估算',
    },
  ]

  const strategies = [
    {
      title: '建立峰值时段巡检策略',
      description:
        alerts.length > 0
          ? `优先围绕 ${alerts[0]!.title.replace(' 负荷偏高', '')} 所在区域建立定时巡检策略。`
          : '当前没有高优先级告警，可以先按楼层规划巡检路线。',
    },
    {
      title: '把查询结果直接联动成工单',
      description:
        '建议下一步把能耗查询中的高能耗结果一键转换成运维工单，提高从分析到处置的闭环效率。',
    },
  ]

  const summary =
    alerts.length > 0
      ? `当前最值得优先处理的是 ${alerts[0]!.title.replace(' 负荷偏高', '')}，建议把它作为智慧运维的首个告警闭环样板。`
      : '当前筛选范围内没有明显异常对象，这个模块可以先沉淀巡检、工单和知识问答结构。'

  return {
    alerts,
    metrics,
    strategies,
    summary,
    tasks: mergedTasks,
  }
}
