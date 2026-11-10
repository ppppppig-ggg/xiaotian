import { useEffect, useState } from 'react'
import type { NodeMeta, NodeStatus } from '../types'

interface Props {
  meta: NodeMeta
  status: NodeStatus
  payload: any
  startedAt?: number
  endedAt?: number
  onRetry: () => void
}

const statusText: Record<NodeStatus, string> = {
  idle: '等待中',
  running: '处理中',
  done: '已完成',
  error: '失败',
}

const VERDICT_STYLE: Record<string, string> = {
  green: 'bg-emerald-400/[0.09] text-emerald-200 border-emerald-300/20',
  yellow: 'bg-amber-300/[0.09] text-amber-100 border-amber-200/20',
  red: 'bg-rose-400/[0.09] text-rose-200 border-rose-300/20',
}

const VERDICT_LABEL: Record<string, string> = {
  green: '低风险',
  yellow: '待核实',
  red: '高风险',
}

/** 节点耗时：运行中每秒刷新，完成后固定 */
function useElapsed(startedAt?: number, endedAt?: number) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!startedAt || endedAt) return
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [startedAt, endedAt])

  if (!startedAt) return null
  return ((endedAt ?? now) - startedAt) / 1000
}

function summary(meta: NodeMeta, payload: any) {
  if (!payload) return null
  if (payload.skipped) {
    return <p className="text-[#718992]">{payload.reason ?? '已跳过'}</p>
  }

  if (meta.id === 'extractor') {
    const name =
      payload.is_event === false ? '未识别出赛事信息' : (payload.event?.name ?? '未识别出赛事')
    return (
      <div className="space-y-1">
        <p className="text-[#e0ecee]">{name}</p>
        <p className="text-[#829aa3]">
          主办方：{payload.event?.organizer?.join('、') || '未知'} · 置信度{' '}
          {Math.round((payload.confidence ?? 0) * 100)}%
        </p>
      </div>
    )
  }

  if (meta.id === 'fact_checker') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-xs ${
            VERDICT_STYLE[payload.verdict] ?? VERDICT_STYLE.yellow
          }`}
        >
          {VERDICT_LABEL[payload.verdict] ?? payload.verdict}
        </span>
        <span className="text-[#a6bbc1]">权威度 {payload.authority_score}</span>
        <span className={payload.risk_flags?.length ? 'text-amber-200' : 'text-[#829aa3]'}>
          风险 {payload.risk_flags?.length ?? 0} 项
        </span>
        {payload.matched_event_id && (
          <span className="rounded-md border border-emerald-300/20 bg-emerald-300/[0.06] px-1.5 py-0.5 text-[11px] text-emerald-200">
            白名单命中
          </span>
        )}
      </div>
    )
  }

  if (meta.id === 'matchmaker') {
    return (
      <div className="flex items-center gap-3">
        <span className="text-2xl font-semibold text-[#89d1ed]">{payload.fit_score}</span>
        <span className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-0.5 text-xs text-[#c3d1d6]">
          {payload.recommendation}
        </span>
        {payload.hard_blockers?.length > 0 && (
          <span className="text-xs text-red-400">硬门槛 {payload.hard_blockers.length} 条</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-[#a1b5bc]">
      <span>
        总工期 <span className="text-[#dbe8eb]">{payload.total_weeks}</span> 周
      </span>
      <span>缓冲 {payload.buffered_weeks} 周</span>
      <span className={payload.feasible ? 'text-emerald-400' : 'text-red-400'}>
        {payload.feasible ? '可行' : '不可行'}
      </span>
      {payload.phases?.length > 0 && <span>{payload.phases.length} 个阶段</span>}
    </div>
  )
}

export function NodeCard({ meta, status, payload, startedAt, endedAt, onRetry }: Props) {
  const elapsed = useElapsed(startedAt, endedAt)
  const skipped = Boolean(payload?.skipped)

  return (
    <div
      className={`workflow-step p-4 transition-all duration-300 ${skipped ? 'opacity-55' : ''} ${status === 'done' ? 'animate-fade-in-up' : ''}`}
      data-status={status}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
              skipped
                ? 'bg-white/[0.06] text-[#718992]'
                : status === 'done'
                  ? 'bg-[#69dfc5]/[0.13] text-[#91ebd5]'
                  : status === 'running'
                    ? 'animate-pulse-ring bg-[#76c4ed]/[0.13] text-[#99d7f2]'
                    : status === 'error'
                      ? 'bg-rose-400/[0.12] text-rose-200'
                      : 'bg-white/[0.06] text-[#a5bbc1]'
            }`}
          >
            {skipped ? '–' : status === 'done' ? (
              '✓'
            ) : status === 'running' ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-300" />
            ) : status === 'error' ? (
              '!'
            ) : (
              meta.index
            )}
          </span>

          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-[#e1ecee]">{meta.title}</h3>
            <p className="truncate text-[11px] text-[#78919b]">{meta.subtitle}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {elapsed !== null && (
            <span className="font-mono text-[11px] text-[#76909a]">{elapsed.toFixed(1)}s</span>
          )}
          <span
            className={`text-xs ${
              skipped
                ? 'text-[#748c96]'
                : status === 'running'
                  ? 'text-[#96d5ef]'
                  : status === 'done'
                    ? 'text-[#82dfcb]'
                    : status === 'error'
                      ? 'text-rose-200'
                      : 'text-[#78919b]'
            }`}
          >
            {skipped ? '已跳过' : status === 'running' ? meta.runningText : statusText[status]}
          </span>
          {status === 'error' && (
            <button
              onClick={onRetry}
              className="rounded-md border border-white/10 px-2 py-0.5 text-xs text-[#cad8dc] transition hover:border-[#69dfc5]/30 hover:bg-white/[0.04]"
            >
              重试
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 min-h-[2.5rem] text-sm">
        {status === 'running' && !payload ? (
          <div className="space-y-2">
            <div className="animate-shimmer h-3 w-2/3 rounded" />
            <div className="animate-shimmer h-3 w-1/3 rounded" />
          </div>
        ) : (
          summary(meta, payload)
        )}
      </div>
    </div>
  )
}
