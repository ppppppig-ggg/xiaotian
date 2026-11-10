import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { NodeCard } from './components/NodeCard'
import { ProfileForm } from './components/ProfileForm'
import { ReportPanel } from './components/ReportPanel'
import { EMPTY_PROFILE, PROFILE_STORAGE_KEY, parseSkills, type ProfileFormValue } from './lib/profile'
import { createSseParser } from './lib/sse'
import { NODES, type NodeId, type NodeStatus, type SseEvent } from './types'

const EMPTY_STATUS: Record<NodeId, NodeStatus> = {
  extractor: 'idle',
  fact_checker: 'idle',
  matchmaker: 'idle',
  planner: 'idle',
}

interface Timing {
  start: number
  end?: number
}

interface State {
  statuses: Record<NodeId, NodeStatus>
  payloads: Partial<Record<NodeId, any>>
  timings: Partial<Record<NodeId, Timing>>
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
      return {
        statuses: { ...EMPTY_STATUS },
        payloads: {},
        timings: {},
        finished: false,
        error: null,
      }

    case 'event': {
      const event = action.event
      if (event.node === 'all') {
        return {
          ...state,
          error: event.status === 'error' ? (event.message ?? '分析失败') : state.error,
          finished: true,
        }
      }

      const timings = { ...state.timings }
      if (event.status === 'running') {
        timings[event.node] = { start: Date.now() }
      } else if (timings[event.node]) {
        timings[event.node] = { ...timings[event.node]!, end: Date.now() }
      }

      return {
        ...state,
        statuses: { ...state.statuses, [event.node]: event.status },
        timings,
        payloads: event.payload
          ? { ...state.payloads, [event.node]: event.payload }
          : state.payloads,
      }
    }

    case 'fail': {
      const statuses = { ...state.statuses }
      const timings = { ...state.timings }
      for (const key of Object.keys(statuses) as NodeId[]) {
        if (statuses[key] === 'running') {
          statuses[key] = 'error'
          if (timings[key]) timings[key] = { ...timings[key]!, end: Date.now() }
        }
      }
      return { ...state, statuses, timings, error: action.message, finished: true }
    }
  }
}

const SAMPLES: Array<{ label: string; text: string; sourceType: string }> = [
  {
    label: '公众号推文',
    sourceType: 'wechat',
    text: '【传智杯】第十届传智杯全国大学生计算机应用能力大赛正式启动！报名截止 2026-11-20，作品提交截止 2026-12-15。本届新增 Vibe Coding 赛道，要求以 AI 辅助完成轻量 Web 应用，评审重点关注过程可复现性。报名请登录官网 https://www.itcast.cn/ 提交材料。主办单位：传智教育。',
  },
  {
    label: '群聊消息',
    sourceType: 'group_chat',
    text: '群主：那个传智杯下周三截止啊，想报的赶紧，我看群里说今年加了个 AI 编程赛道，具体规则你们去问学长。',
  },
  {
    label: '可疑赛事',
    sourceType: 'group_chat',
    text: '【速报】全国青年创新大赛开始报名！无需考试，交钱即可拿证，保过保就业，保研必备！名额有限，先到先得，加微信 138xxxx8888 咨询。',
  },
  {
    label: '无效内容',
    sourceType: 'social',
    text: '今天食堂的红烧肉又涨价了，谁懂啊，窗口阿姨说下周还要涨两块。',
  },
]

export default function App() {
  const [text, setText] = useState('')
  const [sourceType, setSourceType] = useState('wechat')
  const [mode, setMode] = useState<'mock' | 'live' | null>(null)
  const [profile, setProfile] = useState<ProfileFormValue>(() => {
    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
      if (raw) return { ...EMPTY_PROFILE, ...JSON.parse(raw) }
    } catch {
      // 忽略损坏的本地数据
    }
    return EMPTY_PROFILE
  })

  const [state, dispatch] = useReducer(reducer, {
    statuses: { ...EMPTY_STATUS },
    payloads: {},
    timings: {},
    finished: false,
    error: null,
  })

  const abortRef = useRef<AbortController | null>(null)
  const running = Object.values(state.statuses).some((s) => s === 'running')
  const doneCount = Object.values(state.statuses).filter((s) => s === 'done').length

  useEffect(() => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
  }, [profile])

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setMode(data?.mode ?? null))
      .catch(() => setMode(null))
  }, [])

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
        body: JSON.stringify({
          text: content,
          sourceType,
          major: profile.major,
          grade: profile.grade,
          skills: parseSkills(profile.skills),
          goal: profile.goal,
          hoursPerWeek: profile.hours,
        }),
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
  }, [text, sourceType, profile])

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 lg:h-screen lg:overflow-hidden">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3 lg:px-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold tracking-wide">赛博赛事雷达</h1>
          <span className="hidden text-xs text-slate-500 sm:inline">CampusRace Radar</span>
        </div>

        <div className="flex items-center gap-2">
          {mode && (
            <span
              className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${
                mode === 'live'
                  ? 'border-emerald-500/30 text-emerald-300'
                  : 'border-slate-700 text-slate-400'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  mode === 'live' ? 'bg-emerald-400' : 'bg-slate-500'
                }`}
              />
              {mode === 'live' ? '实时模型' : '演示数据'}
            </span>
          )}
          <span className="hidden rounded-full border border-slate-800 px-2 py-0.5 text-[11px] text-slate-500 sm:inline">
            多 Agent 赛事解析
          </span>
        </div>
      </header>

      <main className="grid flex-1 gap-4 p-4 lg:grid-cols-[320px_minmax(0,1fr)_400px] lg:overflow-hidden">
        {/* 左：画像 + 输入 */}
        <section className="flex flex-col gap-3 lg:min-h-0 lg:overflow-hidden">
          <ProfileForm value={profile} onChange={setProfile} />

          <h2 className="text-sm font-medium text-slate-300">粘贴赛事资讯</h2>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') analyze()
            }}
            placeholder="把公众号推文、群聊记录或网页通知粘到这里…（Ctrl + Enter 开始分析）"
            className="h-48 resize-none rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm leading-relaxed text-slate-200 outline-none transition focus:border-sky-600 lg:h-auto lg:min-h-0 lg:flex-1"
          />

          <div className="flex flex-wrap gap-2">
            {SAMPLES.map((sample) => (
              <button
                key={sample.label}
                onClick={() => {
                  setText(sample.text)
                  setSourceType(sample.sourceType)
                }}
                className="rounded-lg border border-slate-800 px-2.5 py-1 text-xs text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
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
            {running ? `分析中… ${doneCount}/4` : '开始分析'}
          </button>

          {state.error && (
            <p className="animate-fade-in-up rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {state.error}
            </p>
          )}
        </section>

        {/* 中：工作流 */}
        <section className="flex flex-col lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-300">处理流程</h2>
            <span className="text-[11px] text-slate-600">
              {doneCount}/{NODES.length} 完成
            </span>
          </div>

          <div className="mb-3 flex gap-1">
            {NODES.map((meta) => (
              <div
                key={meta.id}
                className={`h-0.5 flex-1 rounded-full transition-colors duration-500 ${
                  state.statuses[meta.id] === 'done'
                    ? 'bg-emerald-500/70'
                    : state.statuses[meta.id] === 'running'
                      ? 'bg-sky-500/70'
                      : 'bg-slate-800'
                }`}
              />
            ))}
          </div>

          {NODES.map((meta, index) => (
            <div key={meta.id}>
              <NodeCard
                meta={meta}
                status={state.statuses[meta.id]}
                payload={state.payloads[meta.id]}
                startedAt={state.timings[meta.id]?.start}
                endedAt={state.timings[meta.id]?.end}
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
        <section className="min-h-[420px] lg:min-h-0 lg:overflow-hidden">
          <ReportPanel
            finished={state.finished && !state.error}
            payloads={state.payloads as Record<NodeId, any>}
          />
        </section>
      </main>
    </div>
  )
}