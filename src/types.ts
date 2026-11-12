export type NodeId = 'extractor' | 'fact_checker' | 'matchmaker' | 'planner'

export type NodeStatus = 'idle' | 'running' | 'done' | 'error'

export type AppMode = 'checking' | 'mock' | 'live' | 'offline'

export type SourceType = 'wechat' | 'group_chat' | 'official_site' | 'social' | 'poster'

export type SampleId = 'official_notice' | 'vague_group_chat' | 'scam_notice' | 'irrelevant_chat'

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

export interface Timing {
  start: number
  end?: number
}

export interface AnalysisState {
  statuses: Record<NodeId, NodeStatus>
  payloads: Partial<Record<NodeId, any>>
  timings: Partial<Record<NodeId, Timing>>
  finished: boolean
  error: string | null
}

export interface SourceOption {
  value: SourceType
  label: string
  short: string
}

export interface Sample {
  id: SampleId
  label: string
  text: string
  sourceType: SourceType
}

export const MAX_TEXT_CHARS = 6000

export const EMPTY_STATUS: Record<NodeId, NodeStatus> = {
  extractor: 'idle',
  fact_checker: 'idle',
  matchmaker: 'idle',
  planner: 'idle',
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

export const SOURCE_OPTIONS: SourceOption[] = [
  { value: 'wechat', label: '公众号 / 微信推文', short: '公众号' },
  { value: 'group_chat', label: '群聊消息', short: '群聊' },
  { value: 'official_site', label: '官方网站', short: '官网' },
  { value: 'social', label: '社交平台', short: '社交平台' },
  { value: 'poster', label: '海报 / OCR 文本', short: '海报 OCR' },
]

export const SAMPLES: Sample[] = [
  {
    id: 'official_notice',
    label: '官方通知',
    sourceType: 'official_site',
    text: '【官方通知】2026第九届传智杯全国大学生数智创新与AI应用大赛——AI创新应用挑战赛国赛安排公布。主办单位：全国高等院校计算机基础教育研究会。国赛报名时间：2026-12-10 至 2026-12-21；作品提交截止：2026-12-27。本赛项为个人赛，以个人为单位参赛。作品要求：借助 AI 辅助编程完成可演示的全栈应用，提交代码仓库、技术文档 PDF 与 5-8 分钟演示视频，评审重点关注过程可复现性与 Prompt 链。参赛对象：全日制在校研究生、本科生、高职高专学生。报名与提交入口：https://www.boxuegu.com/match/ 。',
  },
  {
    id: 'vague_group_chat',
    label: '群聊消息',
    sourceType: 'group_chat',
    text: '群主：那个传智杯下周三截止啊，想报的赶紧，我看群里说今年加了个 AI 编程赛道，具体规则你们去问学长。',
  },
  {
    id: 'scam_notice',
    label: '可疑赛事',
    sourceType: 'group_chat',
    text: '【速报】全国青年创新大赛开始报名！无需考试，交钱即可拿证，保过保就业，保研必备！名额有限，先到先得，加微信 138xxxx8888 咨询。',
  },
  {
    id: 'irrelevant_chat',
    label: '无效内容',
    sourceType: 'social',
    text: '今天食堂的红烧肉又涨价了，谁懂啊，窗口阿姨说下周还要涨两块。',
  },
]