import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { NodeCard } from './components/NodeCard'
import { ReportPanel } from './components/ReportPanel'
import { createSseParser } from './lib/sse'
import { NODES, type NodeId, type NodeStatus, type SseEvent } from './types'

const EMPTY_STATUS: Record<NodeId, NodeStatus> = {
  extractor: 'idle',
  fact_checker: 'idle',
  matchmaker: 'idle',
  planner: 'idle',
}

interface State {
  statuses: Record<NodeId, NodeStatus>
  payloads: Partial<Record<NodeId, any>>
  finished: boolean
  error: string | null
}

type Action =
  | { type: 'reset' }
  | { type: 'event'; event: SseEvent }
  | { type: 'fail'; message: string }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'reset':
      return { statuses: { ...EMPTY_STATUS }, payloads: {}, finished: false, error: null }

    case 'event': {
      const event = action.event
      if (event.node === 'all') {
        return {
          ...state,
          error: event.status === 'error' ? (event.message ?? '分析失败') : state.error,
          finished: true,
        }
      }
      return {
        ...state,
        statuses: { ...state.statuses, [event.node]: event.status },
        payloads: event.payload
          ? { ...state.payloads, [event.node]: event.payload }
          : state.payloads,
      }
    }

    case 'fail': {
      const statuses = { ...state.statuses }
      for (const key of Object.keys(statuses) as NodeId[]) {
        if (statuses[key] === 'running') statuses[key] = 'error'
      }
      return { ...state, statuses, error: action.message, finished: true }
    }
  }
}

const SAMPLES: Array<{ label: string; text: string }> = [
  {
    label: '公众号推文',
    text: '【传智杯】第十届传智杯全国大学生计算机应用能力大赛正式启动！报名截止 2026-11-20，作品提交截止 2026-12-15。本届新增 Vibe Coding 赛道，要求以 AI 辅助完成轻量 Web 应用，评审重点关注过程可复现性。报名请登录官网 https://www.itcast.cn/ 提交材料。',
  },
  {
    label: '群聊消息',
    text: '群主：那个传智杯下周三截止啊，想报的赶紧，我看群里说今年加了个 AI 编程赛道，具体规则你们去问学长。',
  },
  {
    label: '无效内容',
    text: '今天食堂的红烧肉又涨价了，谁懂啊，窗口阿姨说下周还要涨两块。',
  },
]

export default function App() {
  const [text, setText] = useState('')
  const [state, dispatch] = useReducer(reducer, {
    statuses: { ...EMPTY_STATUS },
    payloads: {},
    finished: false,
    error: null,
  })

  const abortRef = useRef<AbortController | null>(null)
  const running = Object.values(state.statuses).some((s) => s === 'running')

  // 组件卸载时中断流，避免内存泄漏
  useEffect(() => () => abortRef.current?.abort(), [])

  const analyze = useCallback(async () => {
    const content = text.trim()
    if (!content) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    dispatch({ type: 'reset' })

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error(`请求失败：HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const parse = createSseParser((event) =>
        dispatch({ type: 'event', event: event as SseEvent }),
      )

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        parse(decoder.decode(value, { stream: true }))
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      dispatch({ type: 'fail', message: (error as Error).message })
    }
  }, [text])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold tracking-wide">赛博赛事雷达</h1>
          <span className="text-xs text-slate-500">CampusRace Radar</span>
        </div>
        <span className="rounded-full border border-slate-800 px-2 py-0.5 text-xs text-slate-500">
          多 Agent 赛事解析
        </span>
      </header>

      <main className="grid flex-1 grid-cols-[340px_minmax(0,1fr)_420px] gap-4 overflow-hidden p-4">
        {/* 左：输入 */}
        <section className="flex flex-col gap-3 overflow-hidden">
          <h2 className="text-sm font-medium text-slate-300">粘贴赛事资讯</h2>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="把公众号推文、群聊记录或网页通知粘到这里…"
            className="min-h-0 flex-1 resize-none rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm leading-relaxed text-slate-200 outline-none focus:border-sky-600"
          />
          <div className="flex flex-wrap gap-2">
            {SAMPLES.map((sample) => (
              <button
                key={sample.label}
                onClick={() => setText(sample.text)}
                className="rounded-lg border border-slate-800 px-2.5 py-1 text-xs text-slate-400 hover:border-slate-700 hover:text-slate-200"
              >
                {sample.label}
              </button>
            ))}
          </div>
          <button
            onClick={analyze}
            disabled={running || !text.trim()}
            className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
          >
            {running ? '分析中…' : '开始分析'}
          </button>
          {state.error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {state.error}
            </p>
          )}
        </section>

        {/* 中：工作流 */}
        <section className="flex flex-col items-stretch overflow-y-auto pr-1">
          <h2 className="mb-3 text-sm font-medium text-slate-300">处理流程</h2>
          {NODES.map((meta, index) => (
            <div key={meta.id}>
              <NodeCard
                meta={meta}
                status={state.statuses[meta.id]}
                payload={state.payloads[meta.id]}
                onRetry={analyze}
              />
              {index < NODES.length - 1 && (
                <div className="flex justify-center py-1">
                  <div className="h-5 w-px bg-slate-800" />
                </div>
              )}
            </div>
          ))}
        </section>

        {/* 右：报告 */}
        <section className="overflow-hidden">
          <ReportPanel
            finished={state.finished && !state.error}
            payloads={state.payloads as Record<NodeId, any>}
          />
        </section>
      </main>
    </div>
  )
}