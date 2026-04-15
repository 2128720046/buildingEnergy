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

export function buildOperationsDashboardData({
  energyResult,
  projectId,
  queryResults,
  saveStatus,
  selectedComponentId,
  selectedComponentName,
}: {
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
  const pendingTasks = Math.max(2, Math.min(8, highSeverityCount + Math.ceil(mediumSeverityCount / 2)))
  const siteHealthScore = Math.max(66, 96 - highSeverityCount * 6 - mediumSeverityCount * 2)
  const inspectionCoverage = Math.min(99, 82 + Math.max(0, queryResults.length - highSeverityCount))

  const alerts = rankedResults.slice(0, 4).map((item) => {
    const severity = resolveSeverity(item)

    return {
      id: item.componentId,
      severity,
      title: `${item.componentName} 负荷偏高`,
      detail: `${item.levelName} / ${item.zoneName} · 预测能耗 ${item.predictedUsage} kWh`,
      recommendation:
        severity === 'high'
          ? '建议优先生成现场巡检任务，并比对设备额定参数与当前负荷。'
          : severity === 'medium'
            ? '建议纳入本轮运维观察名单，重点关注峰值时段策略。'
            : '保持监测，当前优先级较低。',
    } satisfies OperationsAlert
  })

  const tasks = alerts.slice(0, 3).map((alert, index) => ({
    id: `${alert.id}-task`,
    title: `检查 ${alert.title.replace(' 负荷偏高', '')}`,
    assignee: index % 2 === 0 ? '设备巡检组' : '节能优化组',
    due: index === 0 ? '今天 16:30' : index === 1 ? '明天 10:00' : '本周五 14:00',
  }))

  if (energyResult && selectedComponentId) {
    tasks.unshift({
      id: `${selectedComponentId}-calibration`,
      title: `复核 ${selectedComponentName} 的实时功率采样`,
      assignee: '数据诊断组',
      due: '今天 15:00',
    })
  }

  const metrics = [
    {
      label: '站点健康度',
      value: `${siteHealthScore}`,
      detail: `项目 ${projectId} 的综合评估`,
    },
    {
      label: '活跃告警',
      value: `${alerts.length}`,
      detail: `高优先级 ${highSeverityCount} 项`,
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
    {
      title: '补充智能体的运维知识',
      description:
        '后续可接入设备台账、保养标准和告警阈值，让智能体的建议更偏向运维决策而不只是能耗解释。',
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
    tasks,
  }
}
