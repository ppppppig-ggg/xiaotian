import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extract } from './agents/extractor.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.SERVER_PORT ?? 8787)
// 默认走 mock：演示和断网时不会意外消耗额度；只有显式 USE_MOCK=false 才调真模型
const USE_MOCK = (process.env.USE_MOCK ?? 'true').toLowerCase() !== 'false'

type NodeId = 'extractor' | 'fact_checker' | 'matchmaker' | 'planner'

interface SseEvent {
  node: NodeId | 'all'
  status: 'running' | 'done' | 'error'
  payload?: unknown
  message?: string
}

/** Day 3 之前的占位数据：风险核查 / 匹配评估 / 备赛规划还没接真模型 */
const PLACEHOLDER: Record<Exclude<NodeId, 'extractor'>, unknown> = {
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

const MOCK_SEQUENCE: Array<{ delay: number; event: SseEvent }> = JSON.parse(
  readFileSync(resolve(__dirname, '../data/mock-run.json'), 'utf-8'),
)

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mode: USE_MOCK ? 'mock' : 'live',
    model: process.env.LLM_MODEL ?? null,
    now: new Date().toISOString(),
  })
})

app.post('/api/analyze', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!text) {
    res.status(400).json({ error: '缺少 text 字段' })
    return
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()

  let aborted = false
  const send = (event: SseEvent) => {
    if (aborted || res.writableEnded) return
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  // 监听 res 而不是 req：Node 16+ 在请求体读完后就会触发 req 的 close
  res.on('close', () => {
    aborted = true
  })

  try {
    if (USE_MOCK) {
      for (const step of MOCK_SEQUENCE) {
        if (aborted) return
        await sleep(step.delay)
        send(step.event)
      }
      res.end()
      return
    }

    // 真模型链路：先接信息提取，其余节点仍用占位数据
    send({ node: 'extractor', status: 'running' })
    const extracted = await extract({
      text,
      sourceType: typeof req.body?.sourceType === 'string' ? req.body.sourceType : 'unknown',
    })
    send({ node: 'extractor', status: 'done', payload: extracted })

    for (const node of ['fact_checker', 'matchmaker', 'planner'] as const) {
      send({ node, status: 'running' })
      await sleep(800)
      send({ node, status: 'done', payload: PLACEHOLDER[node] })
    }

    send({ node: 'all', status: 'done' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[analyze] 失败：', message)
    send({ node: 'all', status: 'error', message })
  } finally {
    if (!res.writableEnded) res.end()
  }
})

app.listen(PORT, () => {
  console.log(`[server] 已启动 http://localhost:${PORT}  mode=${USE_MOCK ? 'mock' : 'live'}`)
})