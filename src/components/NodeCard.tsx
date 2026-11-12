import { useEffect, useState } from 'react'
import type { NodeMeta, NodeStatus } from '../types'

interface Props {
  meta: NodeMeta
  status: NodeStatus
  payload: any
  startedAt?: number
  endedAt?: number
  onRetry: () => void
  demo?: boolean
}

const VERDICT_LABEL: Record<string, string> = {
  green: '低风险',
  yellow: '待核实',
  red: '高风险',
}

/** 节点耗时：运行中每 100ms 刷新，完成后固定 */
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

function Summary({ meta, payload }: { meta: NodeMeta; payload: any }) {
  if (!payload) return null

  if (payload.skipped) {
    return <p className="node-note">{payload.reason ?? '内容不是赛事通知，后续节点已跳过。'}</p>
  }

  if (meta.id === 'extractor') {
    const name =
      payload.is_event === false ? '未识别出赛事信息' : (payload.event?.name ?? '未识别出赛事')
    return (
      <>
        <p className="node-event">{name}</p>
        <p className="node-meta">
          主办方 {payload.event?.organizer?.join('、') || '未知'} · 置信度{' '}
          {Math.round((payload.confidence ?? 0) * 100)}%
        </p>
      </>
    )
  }

  if (meta.id === 'fact_checker') {
    return (
      <>
        <span className="node-verdict" data-verdict={payload.verdict}>
          {VERDICT_LABEL[payload.verdict] ?? payload.verdict}
        </span>
        <p className="node-meta">
          权威度 {payload.authority_score} · 风险 {payload.risk_flags?.length ?? 0} 项
        </p>
      </>
    )
  }

  if (meta.id === 'matchmaker') {
    return (
      <>
        <p className="node-score-row">
          <span className="node-score">
            {typeof payload.fit_score === 'number' ? payload.fit_score : '待补充'}
          </span>
          <span className="node-verdict" data-verdict="plain">
            {payload.profile_incomplete ? '暂停结论' : payload.recommendation}
          </span>
        </p>
        <p className="node-meta">
          {payload.profile_incomplete
            ? '填写画像后重算'
            : payload.hard_blockers?.length > 0
              ? `硬门槛 ${payload.hard_blockers.length} 条`
              : '四维加权分'}
        </p>
      </>
    )
  }

  return (
    <>
      <p className="node-score-row">
        <span className="node-score">{payload.total_weeks}</span>
        <span className="node-meta">周 · 缓冲 {payload.buffered_weeks} 周</span>
      </p>
      <p className="node-meta">
        {payload.feasible ? '可行' : '不可行'} · {payload.phases?.length ?? 0} 个阶段
      </p>
    </>
  )
}

export function NodeCard({ meta, status, payload, startedAt, endedAt, onRetry, demo = false }: Props) {
  const elapsed = useElapsed(startedAt, endedAt)
  const skipped = Boolean(payload?.skipped)

  const stateLabel = skipped
    ? '已跳过'
    : status === 'running'
      ? meta.runningText
      : status === 'done'
        ? '完成'
        : status === 'error'
          ? '失败'
          : '待命'

  return (
    <article className="node" data-status={status} data-skipped={skipped || undefined}>
      <div className="node-top">
        <span className="node-index">{String(meta.index).padStart(2, '0')}</span>
        <span className="node-status">
          <i aria-hidden="true" />
          {stateLabel}
        </span>
      </div>

      <h3 className="node-title">{meta.title}</h3>
      <p className="node-sub">{meta.subtitle}</p>

      <div className="node-body">
        {status === 'running' && !payload ? (
          <div className="node-skeleton" aria-hidden="true">
            <span />
            <span />
          </div>
        ) : (
          <Summary meta={meta} payload={payload} />
        )}
      </div>

      <div className="node-foot">
        <span className="node-time">
          {demo ? '回放 ' : ''}
          {elapsed !== null ? `${elapsed.toFixed(1)}s` : '—'}
        </span>
        {status === 'error' && (
          <button type="button" className="node-retry" onClick={onRetry}>
            重试
          </button>
        )}
      </div>
    </article>
  )
}