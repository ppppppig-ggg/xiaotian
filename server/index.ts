import cors from 'cors'
import express from 'express'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.SERVER_PORT ?? 8787)
const USE_MOCK = process.env.USE_MOCK === 'true'

type NodeId = 'extractor' | 'fact_checker' | 'matchmaker' | 'planner'

interface SseEvent {
  node: NodeId | 'all'
  status: 'running' | 'done' | 'error'
  payload?: unknown
  message?: string
}

/** Day 1 阶段写死的四个节点 payload，接真模型后会被替换 */
const PAYLOADS: Record<NodeId, unknown> = {
  extractor: {
    event: {
      name: '传智杯全国大学生计算机应用能力大赛',
      organizer: ['传智教育'],
      level: '国家级',
      registration: { deadline: '2026-11-20', url: 'https://www.itcast.cn/' },
      submission: { deadline: '2026-12-15' },
      tracks: [{ name: 'Vibe Coding', requirement: 'AI + Web 轻量应用' }],
    },
    confidence: 0.86,
    missing_fields: [],
    warnings: [],
  },
  fact_checker: {
    verdict: 'green',
    authority_score: 85,
    risk_flags: [],
    known_facts: ['本地白名单命中：传智杯'],
    verify_steps: [
      {
        action: '核对官网报名入口',
        where: 'https://www.itcast.cn/',
        pass_criteria: '能看到本届赛事通知',
      },
    ],
  },
  matchmaker: {
    fit_score: 78,
    recommendation: '可试',
    breakdown: {
      skill_fit: { score: 85, reason: '前端栈对口' },
      time_fit: { score: 70, reason: '剩余 5 周' },
      goal_value: { score: 75, reason: '与求职目标相关' },
      access_fit: { score: 80, reason: '年级专业符合' },
    },
    hard_blockers: [],
    next_actions: ['确认组队', '准备演示视频'],
  },
  planner: {
    feasible: true,
    total_weeks: 5,
    buffered_weeks: 1,
    phases: [
      {
        name: '信息核实与组队',
        week_range: 'W1',
        tasks: [{ task: '核对官网通知', owner: '我', output: '确认截图' }],
      },
    ],
    risk_note: '时间偏紧，建议压缩选题范围',
  },
}

const NODE_ORDER: NodeId[] = ['extractor', 'fact_checker', 'matchmaker', 'planner']

/** 在代码里生成与 data/mock-run.json 完全一致的事件序列 */
function buildSequence(): Array<{ delay: number; event: SseEvent }> {
  const seq: Array<{ delay: number; event: SseEvent }> = []
  NODE_ORDER.forEach((node, index) => {
    seq.push({ delay: index === 0 ? 0 : 900, event: { node, status: 'running' } })
    seq.push({ delay: 900, event: { node, status: 'done', payload: PAYLOADS[node] } })
  })
  seq.push({ delay: 600, event: { node: 'all', status: 'done' } })
  return seq
}

const MOCK_SEQUENCE: Array<{ delay: number; event: SseEvent }> = JSON.parse(
  readFileSync(resolve(__dirname, '../data/mock-run.json'), 'utf-8'),
)

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: USE_MOCK ? 'mock' : 'live', now: new Date().toISOString() })
})

app.post('/api/analyze', (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!text) {
    res.status(400).json({ error: '缺少 text 字段' })
    return
  }

  // SSE 头：不缓存、不断开、禁用代理缓冲
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()

  let closed = false
  const timers = new Set<NodeJS.Timeout>()

  const send = (event: SseEvent) => {
    if (closed || res.writableEnded) return
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  // 注意：这里必须监听 res 的 close，而不是 req 的 close。
  // Node 16+ 在请求体读取完成后就会触发 req 的 close，
  // 用它判断"客户端断开"会把正常请求误判为中断。
  res.on('close', () => {
    closed = true
    timers.forEach((t) => clearTimeout(t))
    timers.clear()
  })

  const sequence = USE_MOCK ? MOCK_SEQUENCE : buildSequence()
  let elapsed = 0

  try {
    for (const step of sequence) {
      elapsed += step.delay
      const timer = setTimeout(() => {
        send(step.event)
        if (step.event.node === 'all') {
          closed = true
          res.end()
        }
      }, elapsed)
      timers.add(timer)
    }
  } catch (error) {
    send({ node: 'all', status: 'error', message: String(error) })
    res.end()
  }
})

app.listen(PORT, () => {
  console.log(`[server] 已启动 http://localhost:${PORT}  mode=${USE_MOCK ? 'mock' : 'live'}`)
})