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
  runningText: string
}

export const NODES: NodeMeta[] = [
  { id: 'extractor', index: 1, title: '信息提取', runningText: '正在扫描文本…' },
  { id: 'fact_checker', index: 2, title: '风险核查', runningText: '正在比对白名单…' },
  { id: 'matchmaker', index: 3, title: '匹配评估', runningText: '正在对照画像…' },
  { id: 'planner', index: 4, title: '备赛规划', runningText: '正在倒排工期…' },
]