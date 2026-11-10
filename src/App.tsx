import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { NodeCard } from './components/NodeCard'
import { ProfileForm } from './components/ProfileForm'
import { ReportPanel } from './components/ReportPanel'
import { EMPTY_PROFILE, PROFILE_STORAGE_KEY, parseSkills, type ProfileFormValue } from './lib/profile'
import { createSseParser } from './lib/sse'
import { NODES, type NodeId, type NodeStatus, type SseEvent } from './types'

const MAX_TEXT_CHARS = 6000
type SourceType = 'wechat' | 'group_chat' | 'official_site' | 'social' | 'poster'
type SampleId = 'official_notice' | 'vague_group_chat' | 'scam_notice' | 'irrelevant_chat'

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
        const statuses = { ...state.statuses }
        const timings = { ...state.timings }
        if (event.status === 'error') {
          for (const key of Object.keys(statuses) as NodeId[]) {
            if (statuses[key] === 'running') {
              statuses[key] = 'error'
              if (timings[key]) timings[key] = { ...timings[key]!, end: Date.now() }
            }
          }
        }
        return {
          ...state,
          statuses,
          timings,
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

const SOURCE_OPTIONS: Array<{ value: SourceType; label: string }> = [
  { value: 'wechat', label: '公众号/微信推文' },
  { value: 'group_chat', label: '群聊消息' },
  { value: 'official_site', label: '官方网站' },
  { value: 'social', label: '社交平台' },
  { value: 'poster', label: '海报/OCR 文本' },
]

const SAMPLES: Array<{ id: SampleId; label: string; text: string; sourceType: SourceType }> = [
  {
    id: 'official_notice',
    label: '公众号推文',
    sourceType: 'wechat',
    text: '【传智杯】第十届传智杯全国大学生计算机应用能力大赛正式启动！报名截止 2026-11-20，作品提交截止 2026-12-15。本届新增 Vibe Coding 赛道，要求以 AI 辅助完成轻量 Web 应用，评审重点关注过程可复现性。报名请登录官网 https://www.itcast.cn/ 提交材料。主办单位：传智教育。',
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

export default function App() {
  const [text, setText] = useState('')
  const [sourceType, setSourceType] = useState<SourceType>('wechat')
  const [sampleId, setSampleId] = useState<SampleId | null>(null)
  const [mode, setMode] = useState<'checking' | 'mock' | 'live' | 'offline'>('checking')
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
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
    } catch {
      // 浏览器禁用本地存储时仍允许临时使用画像。
    }
  }, [profile])

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error('服务不可用')
        return res.json()
      })
      .then((data) => setMode(data?.mode === 'live' ? 'live' : 'mock'))
      .catch(() => setMode('offline'))
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
          sampleId,
          major: profile.major,
          grade: profile.grade,
          skills: parseSkills(profile.skills),
          goal: profile.goal,
          hoursPerWeek: profile.hours,
        }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        const details = await response.json().catch(() => null)
        throw new Error(details?.error ?? `请求失败：HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let receivedTerminalEvent = false
      const parse = createSseParser((event) => {
        const sseEvent = event as SseEvent
        if (sseEvent.node === 'all') receivedTerminalEvent = true
        dispatch({ type: 'event', event: sseEvent })
      })

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          parse(decoder.decode())
          break
        }
        parse(decoder.decode(value, { stream: true }))
      }
      if (!receivedTerminalEvent) {
        dispatch({ type: 'fail', message: '分析连接已结束，但没有收到完成事件。请重试。' })
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      dispatch({ type: 'fail', message: (error as Error).message })
    }
  }, [text, sourceType, profile, sampleId])

  return (
    <div className="app-shell text-slate-100">
      <header className="app-header sticky top-0 z-20">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none">
                <circle cx="16" cy="16" r="11.5" stroke="#69dfc5" strokeOpacity=".55" />
                <circle cx="16" cy="16" r="7.2" stroke="#69dfc5" strokeOpacity=".4" strokeDasharray="2 3" />
                <path d="M16 16 23.4 7.7M16 16h10" stroke="#8ff4dd" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="16" cy="16" r="2" fill="#8ff4dd" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-wide text-[#eaf5f4] sm:text-[15px]">校园赛事雷达</h1>
              <p className="hidden text-[10px] tracking-[0.18em] text-[#73919b] sm:block">CAMPUSRACE · EVENT INTELLIGENCE</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span
              title={
                mode === 'live'
                  ? '实时模式会把输入文本发送给 .env 中配置的模型服务。'
                  : mode === 'mock'
                    ? '演示模式回放本地预置样例，不会调用外部模型。'
                    : mode === 'offline'
                      ? '未连接后端服务，请先启动 npm run dev。'
                      : '正在检查本地服务状态。'
              }
              className="status-pill"
              data-mode={mode}
            >
              <span className="status-dot" />
              {mode === 'live' ? '实时模型' : mode === 'mock' ? '安全演示' : mode === 'offline' ? '服务未连接' : '正在连接'}
            </span>
            <span className="hidden items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-[#9bb0b8] md:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#69dfc5]" />
              多 Agent 协作
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1680px] px-4 pb-8 sm:px-6 lg:px-8">
        <section className="hero-panel mt-5 grid gap-6 px-5 py-6 sm:mt-7 sm:px-7 sm:py-8 lg:mt-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)] lg:items-end lg:px-9 lg:py-9">
          <div className="relative z-10 max-w-3xl">
            <p className="panel-eyebrow mb-3 flex items-center gap-2">
              <span className="h-px w-5 bg-[#69dfc5]" />
              从一条通知，到一份参赛决策
            </p>
            <h2 className="text-[1.85rem] font-semibold leading-[1.2] tracking-[-0.045em] text-[#edf6f5] sm:text-4xl lg:text-[2.7rem]">
              看清赛事，<span className="text-[#79ddc7]">再决定出发。</span>
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#a2b6bd] sm:text-[15px]">
              汇总赛事通知中的关键信息，核对风险与证据，再结合你的时间和目标，整理出一份更有把握的参赛计划。
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { number: '01', label: '赛事原文', note: '多渠道输入' },
              { number: '04', label: '分析节点', note: '逐步协作' },
              { number: '01', label: '决策报告', note: '证据与计划' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/[0.09] bg-[#061720]/55 px-3 py-3.5 backdrop-blur-sm sm:px-4 sm:py-4">
                <p className="font-mono text-xl font-medium tracking-tight text-[#a9eee0] sm:text-2xl">{item.number}</p>
                <p className="mt-1 text-xs font-medium text-[#d9e8e9]">{item.label}</p>
                <p className="mt-0.5 text-[10px] text-[#79949d] sm:text-[11px]">{item.note}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mb-4 mt-7 flex flex-wrap items-end justify-between gap-3 sm:mb-5 sm:mt-8">
          <div>
            <p className="panel-eyebrow">WORKSPACE / 01</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#e9f2f3] sm:text-xl">赛事研判工作台</h2>
            <p className="mt-1 text-xs text-[#7f98a2] sm:text-[13px]">输入通知，跟随每一步分析，查看最终建议。</p>
          </div>
          <div className="hidden items-center gap-2 text-[11px] text-[#78929c] sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[#69dfc5] shadow-[0_0_10px_rgba(105,223,197,.65)]" />
            信息仅用于赛事研判
          </div>
        </div>

        <main className="grid items-start gap-4 xl:grid-cols-[minmax(290px,0.9fr)_minmax(360px,1.12fr)_minmax(350px,1fr)] 2xl:gap-5">
          {/* 输入与个人画像 */}
          <section className="panel-surface flex min-w-0 flex-col gap-4 p-4 sm:gap-5 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="panel-eyebrow">01 / 输入</p>
                <h3 className="mt-1.5 panel-heading text-base">添加赛事资讯</h3>
                <p className="mt-1 text-xs leading-5 text-[#8099a2]">粘贴通知、群聊或海报识别文本。</p>
              </div>
              <span className="rounded-xl border border-[#69dfc5]/20 bg-[#69dfc5]/[0.07] px-2.5 py-1 font-mono text-xs text-[#8adfce]">SOURCE</span>
            </div>

            <ProfileForm value={profile} onChange={setProfile} />

            <div className="flex items-center justify-between gap-3">
              <label htmlFor="source-type" className="text-xs font-medium text-[#c1d0d4]">信息来源</label>
              <select
                id="source-type"
                value={sourceType}
                onChange={(event) => { setSourceType(event.target.value as SourceType); setSampleId(null); dispatch({ type: 'reset' }) }}
                className="source-select max-w-[190px] px-3 py-2 text-xs"
              >
                {SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            <div className="relative">
              <textarea
                id="event-text"
                value={text}
                onChange={(e) => { setText(e.target.value); setSampleId(null); dispatch({ type: 'reset' }) }}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') analyze()
                }}
                maxLength={MAX_TEXT_CHARS}
                aria-label="赛事资讯原文"
                aria-describedby="event-text-help"
                placeholder={'将赛事通知粘贴到这里…\n\n例如：主办方、报名截止、比赛要求、报名链接等。'}
                className="field-control min-h-[210px] w-full resize-y px-3.5 py-3.5 text-[13px] leading-6 sm:min-h-[230px]"
              />
              <span className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-[#06131b]/80 px-2 py-1 font-mono text-[10px] text-[#68818b]">
                {text.length.toLocaleString()}/{MAX_TEXT_CHARS.toLocaleString()}
              </span>
            </div>

            <p id="event-text-help" className="-mt-2 text-[11px] leading-relaxed text-[#748c96]">
              {mode === 'live'
                ? '实时分析会将文本发送至已配置的模型服务。'
                : mode === 'mock'
                  ? '演示模式请选择下方预置样例；不会调用外部模型。'
                  : '最多 6000 字；连接状态确认后会显示数据发送说明。'}
              <span className="ml-1 text-[#69818b]">Ctrl / ⌘ + Enter 快速分析</span>
            </p>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium tracking-wide text-[#a6bac0]">试试预置样例</span>
                {text && (
                  <button
                    type="button"
                    onClick={() => { setText(''); setSampleId(null); dispatch({ type: 'reset' }) }}
                    className="text-[11px] text-[#7e98a2] transition hover:text-[#f0a6a6]"
                  >
                    清空内容
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {SAMPLES.map((sample) => (
                  <button
                    key={sample.id}
                    aria-pressed={sampleId === sample.id}
                    onClick={() => {
                      setText(sample.text)
                      setSourceType(sample.sourceType)
                      setSampleId(sample.id)
                      dispatch({ type: 'reset' })
                    }}
                    className="sample-chip px-3 py-1.5 text-[11px]"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={analyze}
              disabled={running || !text.trim() || (mode === 'mock' && !sampleId)}
              className="primary-action flex w-full items-center justify-center gap-2 px-4 py-3 text-sm"
            >
              {running ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#07302d]/25 border-t-[#07302d]" />分析中… {doneCount}/4</>
              ) : (
                <>
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                    <path d="M3 10h13m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  开始分析
                </>
              )}
            </button>

            {state.error && (
              <div className="animate-fade-in-up flex items-center justify-between gap-2 rounded-xl border border-red-400/25 bg-red-500/[0.08] px-3 py-2.5 text-xs text-red-200">
                {state.error}
                <button type="button" onClick={analyze} className="shrink-0 underline underline-offset-2">重试</button>
              </div>
            )}
          </section>

          {/* 多 Agent 工作流 */}
          <section className="panel-surface min-w-0 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="panel-eyebrow">02 / 分析</p>
                <h3 className="mt-1.5 panel-heading text-base">协作研判流程</h3>
              </div>
              <span className="rounded-full border border-white/[0.09] bg-white/[0.025] px-3 py-1.5 font-mono text-[11px] text-[#9bb2bb]">
                {String(doneCount).padStart(2, '0')} <span className="text-[#58727c]">/</span> {String(NODES.length).padStart(2, '0')} 完成
              </span>
            </div>

            <div
              className="mb-5 flex gap-1.5"
              role="progressbar"
              aria-label="处理流程进度"
              aria-valuemin={0}
              aria-valuemax={NODES.length}
              aria-valuenow={doneCount}
            >
              {NODES.map((meta) => (
                <div
                  key={meta.id}
                  className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                    state.statuses[meta.id] === 'done'
                      ? 'bg-[#69dfc5]'
                      : state.statuses[meta.id] === 'running'
                        ? 'bg-[#76c4ed] shadow-[0_0_12px_rgba(118,196,237,.5)]'
                        : 'bg-white/[0.08]'
                  }`}
                />
              ))}
            </div>

            <div className="space-y-2.5">
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
                    <div className="flex h-2.5 justify-center" aria-hidden="true">
                      <div className="w-px bg-gradient-to-b from-[#426874]/70 to-transparent" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-4 border-t border-white/[0.07] pt-3 text-[11px] leading-relaxed text-[#718993]">
              每个节点独立展示状态、处理结果与耗时，方便追踪完整分析链路。
            </p>
          </section>

          {/* 决策报告 */}
          <section className="min-h-[480px] min-w-0 xl:min-h-[720px]">
            <ReportPanel
              finished={state.finished && !state.error}
              payloads={state.payloads as Record<NodeId, any>}
              sourceType={sourceType}
            />
          </section>
        </main>

        <footer className="mt-5 flex flex-col gap-1 border-t border-white/[0.08] py-4 text-[10px] leading-relaxed text-[#607983] sm:flex-row sm:items-center sm:justify-between sm:text-[11px]">
          <span>校园赛事雷达 · 让赛事信息更清楚，让参赛准备更从容。</span>
          <span>AI 建议用于辅助决策，赛事真伪与报名要求请以主办方官方信息为准。</span>
        </footer>
      </div>
    </div>
  )
}
