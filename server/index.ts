import 'dotenv/config'
import express from 'express'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extract } from './agents/extractor.js'
import { factCheck } from './agents/fact-checker.js'
import { match, emptyMatchResult, type Profile } from './agents/matchmaker.js'
import { plan } from './agents/planner.js'
import { detectParticipation } from './rules/participation.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.SERVER_PORT ?? 8787)
const MAX_ANALYSIS_CHARS = 6000
const SOURCE_TYPES = new Set(['wechat', 'group_chat', 'official_site', 'social', 'poster', 'unknown'])
// 默认走 mock：演示和断网时不会意外消耗额度；只有显式 USE_MOCK=false 才调真模型
const USE_MOCK = (process.env.USE_MOCK ?? 'true').toLowerCase() !== 'false'

type NodeId = 'extractor' | 'fact_checker' | 'matchmaker' | 'planner'

interface SseEvent {
  node: NodeId | 'all'
  status: 'running' | 'done' | 'error'
  payload?: unknown
  message?: string
}

const MOCK_SCENARIOS: Record<string, Array<{ delay: number; event: SseEvent }>> = {
  official_notice: JSON.parse(
  readFileSync(resolve(__dirname, '../data/mock-run.json'), 'utf-8'),
  ),
  ...JSON.parse(readFileSync(resolve(__dirname, '../data/mock-cases.json'), 'utf-8')),
}

const app = express()
// 前端通过 Vite /api 代理与后端同源通信；不开放跨站读取本地分析结果。
app.use(express.json({ limit: '64kb' }))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function readProfile(body: any): Profile {
  const hours = Number(body?.hoursPerWeek)
  return {
    major: typeof body?.major === 'string' ? body.major.slice(0, 40) : undefined,
    grade: typeof body?.grade === 'string' ? body.grade.slice(0, 20) : undefined,
    skills: Array.isArray(body?.skills)
      ? body.skills.filter((s: unknown) => typeof s === 'string').slice(0, 10)
      : undefined,
    goal: typeof body?.goal === 'string' ? body.goal.slice(0, 40) : undefined,
    hoursPerWeek:
      Number.isFinite(hours) && hours > 0 ? Math.max(1, Math.min(80, hours)) : undefined,
  }
}

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
  if (text.length > MAX_ANALYSIS_CHARS) {
    res.status(413).json({ error: `文本不能超过 ${MAX_ANALYSIS_CHARS} 个字符` })
    return
  }

  const requestedSourceType = req.body?.sourceType
  const sourceType =
    typeof requestedSourceType === 'string' && SOURCE_TYPES.has(requestedSourceType)
      ? requestedSourceType
      : 'unknown'
  const sampleId = typeof req.body?.sampleId === 'string' ? req.body.sampleId : ''
  if (USE_MOCK && !Object.hasOwn(MOCK_SCENARIOS, sampleId)) {
    res.status(400).json({ error: '演示模式只回放预置样例，请先选择下方的样例按钮。' })
    return
  }
  const profile = readProfile(req.body)

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

  // 四段链路跑满要十几秒，中间层（代理/浏览器）可能提前掐断空闲连接，
  // 每 15 秒发一条 SSE 注释行保活；前端解析器会忽略没有 data: 的行
  const heartbeat = setInterval(() => {
    if (!aborted && !res.writableEnded) res.write(': keep-alive\n\n')
  }, 15_000)

  try {
    if (USE_MOCK) {
      const hasProfile = Boolean(
        profile.major || profile.grade || profile.skills?.length || profile.goal || profile.hoursPerWeek,
      )
      for (const step of MOCK_SCENARIOS[sampleId]) {
        if (aborted) return
        await sleep(step.delay)
        // 固定回放里的匹配结果是「填了画像」的版本；
        // 用户没填画像时改发待补充，避免演示回放再次出现「空画像高分」。
        if (!hasProfile && step.event.node === 'matchmaker' && step.event.status === 'done') {
          send({ ...step.event, payload: emptyMatchResult('unknown') })
        } else {
          send(step.event)
        }
      }
      res.end()
      return
    }

    // ① 信息提取
    send({ node: 'extractor', status: 'running' })
    const extraction = await extract({ text, sourceType })
    send({ node: 'extractor', status: 'done', payload: extraction })
    if (aborted) return

    // 不是赛事内容：后面三个节点没有输入，直接跳过，省下三次模型调用
    if (extraction?.is_event === false) {
      for (const node of ['fact_checker', 'matchmaker', 'planner'] as const) {
        send({ node, status: 'done', payload: { skipped: true, reason: '未识别出赛事信息' } })
      }
      send({ node: 'all', status: 'done' })
      return
    }

    // ② 风险核查（规则算分 + 模型解释）
    send({ node: 'fact_checker', status: 'running' })
    const risk = await factCheck(extraction, text, sourceType)
    send({ node: 'fact_checker', status: 'done', payload: risk })
    if (aborted) return

    // ③ 匹配评估
    const participation = detectParticipation(text, extraction?.event)
    send({ node: 'matchmaker', status: 'running' })
    const matchResult = await match(extraction?.event ?? {}, profile, participation)

    // 风险优先于匹配：核查判红的赛事，无论契合度多高都不推荐
    if (risk.verdict === 'red' && matchResult.recommendation !== '不建议') {
      matchResult.recommendation = '不建议'
      matchResult.hard_blockers = [
        `风险核查未通过（权威度 ${risk.authority_score}），不建议投入时间`,
      ]
    }

    send({ node: 'matchmaker', status: 'done', payload: matchResult })
    if (aborted) return

    // ④ 备赛规划
    send({ node: 'planner', status: 'running' })
    const planResult = await plan(extraction?.event ?? {}, profile, matchResult, participation)
    send({ node: 'planner', status: 'done', payload: planResult })

    send({ node: 'all', status: 'done' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[analyze] 失败：', message)
    send({ node: 'all', status: 'error', message })
  } finally {
    clearInterval(heartbeat)
    if (!res.writableEnded) res.end()
  }
})

app.listen(PORT, () => {
  console.log(`[server] 已启动 http://localhost:${PORT}  mode=${USE_MOCK ? 'mock' : 'live'}`)
})
