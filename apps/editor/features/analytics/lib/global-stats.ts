export interface GlobalStats {
  activeAlerts: number
  agentOnline: boolean
  healthScore: number
  inspectionRate: number
  maintenance: number
  normal: number
  offline: number
  pendingTasks: number
  total: number
  warning: number
}

export const INITIAL_GLOBAL_STATS: GlobalStats = {
  total: 299,
  normal: 101,
  warning: 194,
  maintenance: 2,
  offline: 2,
  healthScore: 96,
  activeAlerts: 3,
  pendingTasks: 2,
  inspectionRate: 82,
  agentOnline: true,
}
