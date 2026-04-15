export type HostWorkspace = 'energy-query' | 'data-analysis' | 'smart-operations'

export const HOST_WORKSPACES = [
  {
    key: 'energy-query',
    label: '能耗查询',
    description: '建模画布与能耗查询并行联动',
  },
  {
    key: 'data-analysis',
    label: '数据分析',
    description: '按天汇总监测数据与多维图表',
  },
  {
    key: 'smart-operations',
    label: '智慧运维',
    description: '告警、工单、策略与智能体协同',
  },
] as const satisfies ReadonlyArray<{
  key: HostWorkspace
  label: string
  description: string
}>
