export type NodeId = 'extractor' | 'fact_checker' | 'matchmaker' | 'planner'

export type NodeStatus = 'idle' | 'running' | 'done' | 'error'

export interface SseEvent {
  node: NodeId | 'all'
  status: NodeStatus
  payload?: any
  message?: string
}

export interface NodeMeta {
  id: NodeId
  index: number
  title: string
  subtitle: string
  runningText: string
}

export const NODES: NodeMeta[] = [
  {
    id: 'extractor',
    index: 1,
    title: '信息提取',
    subtitle: '非结构化文本 → 结构化字段',
    runningText: '正在扫描文本…',
  },
  {
    id: 'fact_checker',
    index: 2,
    title: '风险核查',
    subtitle: '白名单比对 + 风险信号',
    runningText: '正在比对白名单…',
  },
  {
    id: 'matchmaker',
    index: 3,
    title: '匹配评估',
    subtitle: '赛事要求 × 个人画像',
    runningText: '正在对照画像…',
  },
  {
    id: 'planner',
    index: 4,
    title: '备赛规划',
    subtitle: '倒排工期 + 任务拆解',
    runningText: '正在倒排工期…',
  },
]