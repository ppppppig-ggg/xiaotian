#!/usr/bin/env node
/**
 * 故障注入测试：故意让模型层坏掉，验证系统是否「优雅失败」而不是卡死或白屏。
 * 用法：node eval/fault.mjs
 */
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

// 注意：项目路径含中文，必须用 fileURLToPath 解码，否则 spawn 的 cwd 会带 %E4%BC%A0 之类的转义
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TSX_CLI = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const PORT = 8799
const BASE = `http://localhost:${PORT}`

const SCENARIOS = [
  { fault: 'bad_json', name: '模型输出非 JSON', expectInMessage: ['校验', 'JSON'], maxSeconds: 90 },
  { fault: 'http_error', name: '模型接口 500', expectInMessage: ['模型调用失败', '500'], maxSeconds: 60 },
]

function startServer(fault) {
  // 不经 shell 直接拉起 node + tsx，避免 Windows 下 cmd.exe 解析问题
  const child = spawn(process.execPath, [TSX_CLI, 'server/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, SERVER_PORT: String(PORT), USE_MOCK: 'false', LLM_FAULT: fault },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', () => {})
  child.stderr.on('data', () => {})
  return child
}

async function waitForHealth(timeoutMs = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`)
      if (res.ok) return true
    } catch {
      // 还没起来
    }
    await sleep(500)
  }
  return false
}

async function killTree(child) {
  if (!child.pid) return
  const pid = String(child.pid)
  await new Promise((resolve) => {
    try {
      child.kill()
    } catch {
      // 已经退出
    }
    const killer = spawn('taskkill', ['/pid', pid, '/T', '/F'])
    killer.on('exit', resolve)
    killer.on('error', resolve)
  })
}

async function runScenario(scenario) {
  const child = startServer(scenario.fault)
  const started = Date.now()

  try {
    const healthy = await waitForHealth()
    if (!healthy) return { ...scenario, pass: false, detail: '服务未能启动' }

    const res = await fetch(`${BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '传智杯报名截止 2026-11-20', sourceType: 'wechat' }),
    })

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalEvent = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let index
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        if (chunk.startsWith('data:')) finalEvent = JSON.parse(chunk.slice(5).trim())
      }
    }

    const elapsed = (Date.now() - started) / 1000
    const message = finalEvent?.message ?? ''
    const gotError = finalEvent?.node === 'all' && finalEvent?.status === 'error'
    const messageOk = scenario.expectInMessage.some((keyword) => message.includes(keyword))
    const fastEnough = elapsed < scenario.maxSeconds

    return {
      ...scenario,
      pass: gotError && messageOk && fastEnough,
      elapsed: `${elapsed.toFixed(1)}s`,
      detail: gotError
        ? `${fastEnough ? '及时' : '超时'}失败：${message.slice(0, 60)}`
        : '未返回错误事件（可能静默失败）',
    }
  } finally {
    await killTree(child)
  }
}

console.log('开始故障注入测试…\n')
const results = []
for (const scenario of SCENARIOS) {
  process.stdout.write(`${scenario.name} … `)
  const result = await runScenario(scenario)
  results.push(result)
  console.log(result.pass ? '✅' : '❌', result.elapsed ?? '', result.detail)
}

const passed = results.filter((r) => r.pass).length
console.log(`\n通过 ${passed}/${results.length}`)
process.exit(passed === results.length ? 0 : 1)