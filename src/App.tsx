import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Cover } from './components/Cover'
import { RadarBackdrop } from './components/RadarBackdrop'
import { Workspace } from './components/Workspace'
import { EMPTY_PROFILE, PROFILE_STORAGE_KEY, parseSkills, type ProfileFormValue } from './lib/profile'
import { createSseParser } from './lib/sse'
import {
  EMPTY_STATUS,
  type AnalysisState,
  type AppMode,
  type NodeId,
  type Sample,
  type SourceType,
  type SseEvent,
} from './types'

type Action =
  | { type: 'reset' }
  | { type: 'event'; event: SseEvent }
  | { type: 'fail'; message: string }

function reducer(state: AnalysisState, action: Action): AnalysisState {
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

export default function App() {
  const [text, setText] = useState('')
  const [sourceType, setSourceType] = useState<SourceType>('wechat')
  const [sampleId, setSampleId] = useState<string | null>(null)
  const [mode, setMode] = useState<AppMode>('checking')
  const [pending, setPending] = useState(false)
  const [profile, setProfile] = useState<ProfileFormValue>(() => {
    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
      if (raw) return { ...EMPTY_PROFILE, ...JSON.parse(raw) }
    } catch {
      // 忽略损坏的本地数据
    }
    return EMPTY_PROFILE
  })

  const [cover, setCover] = useState(true)
  const [revealed, setRevealed] = useState(false)
  const [veil, setVeil] = useState(false)
  const transitionTimers = useRef<number[]>([])

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

  const enter = useCallback(() => {
    if (!cover || veil) return
    setVeil(true)
    const swap = window.setTimeout(() => {
      setCover(false)
      setRevealed(true)
      const lift = window.setTimeout(() => setVeil(false), 120)
      transitionTimers.current.push(lift)
    }, 280)
    transitionTimers.current.push(swap)
  }, [cover, veil])

  const returnToCover = useCallback(() => {
    if (veil) return
    setVeil(true)
    const swap = window.setTimeout(() => {
      setRevealed(false)
      setCover(true)
      const lift = window.setTimeout(() => setVeil(false), 120)
      transitionTimers.current.push(lift)
    }, 280)
    transitionTimers.current.push(swap)
  }, [veil])

  const resetAnalysis = useCallback(() => {
    dispatch({ type: 'reset' })
  }, [])

  useEffect(() => {
    document.body.style.overflow = cover || veil ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [cover, veil])

  useEffect(
    () => () => {
      transitionTimers.current.forEach((timer) => window.clearTimeout(timer))
      transitionTimers.current = []
    },
    [],
  )

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
    setPending(true)

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
      let receivedFirstEvent = false
      const parse = createSseParser((event) => {
        const sseEvent = event as SseEvent
        if (!receivedFirstEvent) {
          receivedFirstEvent = true
          setPending(false)
        }
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
      setPending(false)
      if (!receivedTerminalEvent) {
        dispatch({ type: 'fail', message: '分析连接已结束，但没有收到完成事件。请重试。' })
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      setPending(false)
      dispatch({ type: 'fail', message: (error as Error).message })
    }
  }, [text, sourceType, profile, sampleId])

  const handleText = (value: string) => {
    setText(value)
    setSampleId(null)
    resetAnalysis()
  }

  const handleSource = (value: SourceType) => {
    setSourceType(value)
    setSampleId(null)
    resetAnalysis()
  }

  const handleSample = (sample: Sample) => {
    setText(sample.text)
    setSourceType(sample.sourceType)
    setSampleId(sample.id)
    resetAnalysis()
  }

  const handleClear = () => {
    setText('')
    setSampleId(null)
    resetAnalysis()
  }

  return (
    <div className="app-root">
      <RadarBackdrop intensity={revealed ? 0.5 : 1} />
      <div className="pointer-glow" aria-hidden="true" />
      <Workspace
        revealed={revealed}
        mode={mode}
        text={text}
        sourceType={sourceType}
        sampleId={sampleId}
        profile={profile}
        state={state}
        running={running || pending}
        doneCount={doneCount}
        onText={handleText}
        onSource={handleSource}
        onSample={handleSample}
        onClear={handleClear}
        onProfile={setProfile}
        onAnalyze={analyze}
        onReturn={returnToCover}
      />
      {cover && <Cover busy={veil} onEnter={enter} />}
      <div className={`screen-veil${veil ? ' is-active' : ''}`} aria-hidden="true">
        <span className="veil-ring" />
      </div>
    </div>
  )
}