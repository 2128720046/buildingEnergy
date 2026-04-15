export type HostBusinessModule = 'query' | 'operations'

export const HOST_BUSINESS_MODULES = [
  {
    key: 'query',
    label: '能耗查询',
    description: '图表分析与智能问答',
  },
  {
    key: 'operations',
    label: '智慧运维',
    description: '告警、工单与巡检概览',
  },
] as const satisfies ReadonlyArray<{
  key: HostBusinessModule
  label: string
  description: string
}>
