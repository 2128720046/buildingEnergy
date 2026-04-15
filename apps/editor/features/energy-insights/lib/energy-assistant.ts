import type { EnergyApiResponse } from './energy-api'
import type { HostQueryResult } from './host-query'

export interface EnergyAssistantContext {
  energyResult: EnergyApiResponse | null
  projectId: string
  queryResults: HostQueryResult[]
  selectedComponentId: string | null
  selectedComponentName: string
}

function formatTopConsumers(queryResults: HostQueryResult[]) {
  return queryResults
    .slice(0, 3)
    .map(
      (item, index) =>
        `${index + 1}. ${item.componentName} (${item.levelName}/${item.zoneName}) - ${item.predictedUsage} kWh`,
    )
    .join('\n')
}

function resolveTrendDescription(firstValue: number, lastValue: number) {
  const delta = lastValue - firstValue

  if (Math.abs(delta) < 0.3) {
    return '整体波动较平稳，负荷曲线没有明显抬升。'
  }

  if (delta > 0) {
    return `末端时段比起始时段上升 ${delta.toFixed(1)}，需要关注是否存在持续增载。`
  }

  return `末端时段比起始时段下降 ${Math.abs(delta).toFixed(1)}，说明后段负荷在回落。`
}

export function buildEnergyAssistantReply(
  message: string,
  context: EnergyAssistantContext,
): string {
  const normalizedMessage = message.trim().toLowerCase()
  const { energyResult, projectId, queryResults, selectedComponentId, selectedComponentName } = context

  if (!energyResult) {
    if (
      normalizedMessage.includes('排行') ||
      normalizedMessage.includes('高耗') ||
      normalizedMessage.includes('top') ||
      normalizedMessage.includes('rank')
    ) {
      if (queryResults.length === 0) {
        return '当前筛选结果为空，暂时没有可排序的高耗能对象。你可以先调整筛选条件，或在建模区选择一个构件让我继续分析。'
      }

      return `我先给你项目 ${projectId} 的高耗能对象排行：\n${formatTopConsumers(queryResults)}`
    }

    return '当前还没有拿到选中构件的能耗 JSON 数据。请先在建模区点击一个构件，我就可以根据返回的数据帮你生成趋势分析、峰值判断和节能建议。'
  }

  const series = energyResult.series ?? []
  const peakPoint = series.reduce((best, point) => (point.value > best.value ? point : best), series[0]!)
  const valleyPoint = series.reduce((best, point) => (point.value < best.value ? point : best), series[0]!)
  const averageValue =
    series.length > 0
      ? series.reduce((sum, point) => sum + point.value, 0) / series.length
      : energyResult.todayUsage
  const topConsumers = queryResults.slice(0, 3)

  if (
    normalizedMessage.includes('峰值') ||
    normalizedMessage.includes('最高') ||
    normalizedMessage.includes('peak')
  ) {
    return `我看了 ${selectedComponentName} 的曲线，峰值出现在 ${peakPoint.time}，约为 ${peakPoint.value.toFixed(2)} kWh。\n谷值出现在 ${valleyPoint.time}，约为 ${valleyPoint.value.toFixed(2)} kWh。\n峰谷差 ${Math.abs(peakPoint.value - valleyPoint.value).toFixed(2)}，说明这个构件在分时段上存在比较明显的负荷波动。`
  }

  if (
    normalizedMessage.includes('建议') ||
    normalizedMessage.includes('优化') ||
    normalizedMessage.includes('节能')
  ) {
    return `基于 ${selectedComponentName} 当前数据，我建议先做这三件事：\n1. 重点排查 ${peakPoint.time} 前后的运行策略，确认是否有非必要设备同时开启。\n2. 把平均负荷 ${averageValue.toFixed(2)} kWh 以上的时段纳入巡检，优先检查传感器、空调或照明联动配置。\n3. 如果它位于高频使用区域，建议把今天用量 ${energyResult.todayUsage.toFixed(1)} kWh 和本月累计 ${energyResult.monthUsage.toFixed(1)} kWh 做周环比，判断是否有异常上升。`
  }

  if (
    normalizedMessage.includes('异常') ||
    normalizedMessage.includes('风险') ||
    normalizedMessage.includes('告警')
  ) {
    return `我对 ${selectedComponentName} 的风险判断是：\n1. 峰值 ${peakPoint.value.toFixed(2)} kWh 出现在 ${peakPoint.time}，这是优先关注时段。\n2. ${resolveTrendDescription(series[0]?.value ?? 0, series.at(-1)?.value ?? 0)}\n3. 当前功率 ${energyResult.currentPower.toFixed(1)} kW，建议和设备额定功率做一次阈值比对，决定是否生成运维告警。`
  }

  if (
    normalizedMessage.includes('排行') ||
    normalizedMessage.includes('高耗') ||
    normalizedMessage.includes('哪些') ||
    normalizedMessage.includes('对比')
  ) {
    if (topConsumers.length === 0) {
      return '当前筛选结果为空，我还给不出项目内的高耗能排行。'
    }

    return `当前筛选结果里更值得关注的对象有：\n${formatTopConsumers(topConsumers)}\n如果你愿意，我下一步可以继续帮你按楼层或房间解释这些对象为什么会排在前面。`
  }

  return `这里是我对 ${selectedComponentName}${selectedComponentId ? `（${selectedComponentId}）` : ''} 的快速结论：\n1. 当前功率 ${energyResult.currentPower.toFixed(1)} kW，今天累计 ${energyResult.todayUsage.toFixed(1)} kWh，本月累计 ${energyResult.monthUsage.toFixed(1)} kWh。\n2. 峰值时段在 ${peakPoint.time}，谷值时段在 ${valleyPoint.time}，平均时段负荷 ${averageValue.toFixed(2)} kWh。\n3. 如果你要继续追问，我建议下一句直接问我“峰值为什么高”“给我优化建议”或“列出高耗能排行”。`
}
