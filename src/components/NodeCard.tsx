import type { NodeMeta, NodeStatus } from '../types'

interface Props {
  meta: NodeMeta
  status: NodeStatus
  payload: any
  onRetry: () => void
}

const statusText: Record<NodeStatus, string> = {
  idle: '等待中',
  running: '处理中',
  done: '已完成',
  error: '失败',
}

/** 每种节点的结果摘要，保持简短，一眼能看懂 */
function summary(meta: NodeMeta, payload: any) {
  if (!payload) return null

  if (meta.id === 'extractor') {
    return (
      <div className="space-y-1">
        <p className="text-slate-200">{payload.event?.name ?? '未识别出赛事'}</p>
        <p className="text-slate-500">
          主办方：{payload.event?.organizer?.join('、') ?? '未知'} · 置信度{' '}
          {Math.round((payload.confidence ?? 0) * 100)}%
        </p>
      </div>
    )
  }

  if (meta.id === 'fact_checker') {
    const color =
      payload.verdict === 'green'
        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
        : payload.verdict === 'red'
          ? 'bg-red-500/15 text-red-300 border-red-500/30'
          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    return (
      <div className="flex items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-xs ${color}`}>
          {payload.verdict}
        </span>
        <span className="text-slate-400">权威度 {payload.authority_score}</span>
        <span className="text-slate-500">
          风险 {payload.risk_flags?.length ?? 0} 项
        </span>
      </div>
    )
  }

  if (meta.id === 'matchmaker') {
    return (
      <div className="flex items-center gap-3">
        <span className="text-2xl font-semibold text-sky-300">{payload.fit_score}</span>
        <span className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
          {payload.recommendation}
        </span>
      </div>
    )
  }

  return (
    <p className="text-slate-400">
      总工期 {payload.total_weeks} 周 · 缓冲 {payload.buffered_weeks} 周 ·{' '}
      {payload.feasible ? '可行' : '不可行'}
    </p>
  )
}

export function NodeCard({ meta, status, payload, onRetry }: Props) {
  const border =
    status === 'running'
      ? 'border-sky-500/70 shadow-[0_0_24px_-6px] shadow-sky-500/40'
      : status === 'done'
        ? 'border-emerald-500/40'
        : status === 'error'
          ? 'border-slate-700 opacity-60'
          : 'border-slate-800'

  return (
    <div
      className={`rounded-xl border bg-slate-900/60 p-4 transition-all duration-300 ${border}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
              status === 'done'
                ? 'bg-emerald-500/20 text-emerald-300'
                : status === 'running'
                  ? 'bg-sky-500/20 text-sky-300'
                  : 'bg-slate-800 text-slate-400'
            }`}
          >
            {status === 'done' ? '✓' : meta.index}
          </span>
          <h3 className="text-sm font-medium text-slate-200">{meta.title}</h3>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-xs ${
              status === 'running'
                ? 'text-sky-300'
                : status === 'done'
                  ? 'text-emerald-400'
                  : status === 'error'
                    ? 'text-red-400'
                    : 'text-slate-500'
            }`}
          >
            {status === 'running' ? meta.runningText : statusText[status]}
          </span>
          {status === 'error' && (
            <button
              onClick={onRetry}
              className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              重试
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 min-h-[2.5rem] text-sm">{summary(meta, payload)}</div>
    </div>
  )
}