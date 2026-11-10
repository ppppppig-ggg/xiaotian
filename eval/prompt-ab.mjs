#!/usr/bin/env node
/**
 * Prompt 版本对照实验。
 *
 * 目的：用数据说明「每次给 Prompt 加约束，到底改变了什么」，而不是只写"我们改了"。
 * 做法：依次把三版 System Prompt 写进 server/prompts/extractor.ts，
 *      等 tsx watch 重启后跑同一批用例，统计三项指标，最后恢复原文件。
 *
 * 用法：node eval/prompt-ab.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXTRACTOR_PATH = resolve(__dirname, '../server/prompts/extractor.ts')
const CASES_PATH = resolve(__dirname, 'cases.json')
const API = 'http://localhost:8787/api/analyze'
const HEALTH = 'http://localhost:8787/api/health'

// 只跑与 Prompt 质量相关的 6 条，控制耗时
const CASE_IDS = [
  'official-notice',
  'vague-group-chat',
  'relative-time',
  'prompt-injection',
  'ocr-noise',
  'name-only',
]

const PROFILE = {
  major: '计算机科学与技术',
  grade: '大三',
  skills: ['React', 'TypeScript'],
  goal: '求职',
  hoursPerWeek: 10,
}

/** 用于计算「无证据支撑的字段」 */
const KEY_FIELDS = [
  'name',
  'organizer',
  'registration.deadline',
  'registration.url',
  'submission.deadline',
  'eligibility',
  'prizes',
  'contact',
]

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj)
}

function hasEvidence(evidence, field) {
  return Object.keys(evidence ?? {}).some(
    (key) => key === field || field.endsWith(`.${key}`) || key.endsWith(`.${field}`),
  )
}

async function waitForServer(timeoutMs = 40000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(HEALTH)
      if (res.ok) return true
    } catch {
      // 重启中
    }
    await sleep(400)
  }
  return false
}

async function runCase(testCase) {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: testCase.text, sourceType: testCase.sourceType, ...PROFILE }),
  })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const payloads = {}

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let index
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      if (!chunk.startsWith('data:')) continue
      const event = JSON.parse(chunk.slice(5).trim())
      if (event.payload) payloads[event.node] = event.payload
    }
  }

  return payloads.extractor ?? {}
}

function scoreVariant(cases, results) {
  let nonEmptyFields = 0
  let evidenceFields = 0
  let relativeTimeLeaks = 0
  let passedCases = 0

  cases.forEach((testCase, index) => {
    const extraction = results[index]
    const evidence = extraction.evidence ?? {}
    const expect = testCase.expect

    for (const field of KEY_FIELDS) {
      const value = getPath(extraction.event ?? {}, field)
      const filled = Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== ''
      if (!filled) continue
      nonEmptyFields += 1
      if (hasEvidence(evidence, field)) evidenceFields += 1
    }

    // 相对时间是否被瞎猜成具体日期
    if (testCase.id === 'relative-time' || testCase.id === 'vague-group-chat') {
      if (getPath(extraction.event ?? {}, 'registration.deadline')) relativeTimeLeaks += 1
    }

    // 简化判定：只查与 Prompt 直接相关的断言
    let ok = true
    if ('is_event' in expect && extraction.is_event !== expect.is_event) ok = false
    if ('registration_deadline' in expect) {
      const actual = getPath(extraction.event ?? {}, 'registration.deadline') ?? null
      if (actual !== expect.registration_deadline) ok = false
    }
    if (expect.warnings_include) {
      const warnings = extraction.warnings ?? []
      if (!expect.warnings_include.some((w) => warnings.includes(w))) ok = false
    }
    if (expect.conflicts_not_empty && (extraction.conflicts ?? []).length === 0) ok = false
    if ('confidence_max' in expect && (extraction.confidence ?? 1) > expect.confidence_max) ok = false
    if (expect.injection_detected && extraction.injection_detected !== true) ok = false
    if (ok) passedCases += 1
  })

  return {
    passRate: Math.round((passedCases / cases.length) * 100),
    hallucinationRate: nonEmptyFields === 0 ? 0 : Math.round(((nonEmptyFields - evidenceFields) / nonEmptyFields) * 100),
    relativeTimeLeaks,
    nonEmptyFields,
    evidenceFields,
  }
}

async function applyVariant(body) {
  const content = `/** 对照实验临时写入，运行结束会恢复 */\nexport const EXTRACTOR_SYSTEM_PROMPT = \`${body.trim()}\`\n`
  writeFileSync(EXTRACTOR_PATH, content, 'utf-8')
  // 等 tsx watch 重启并恢复健康
  await sleep(1200)
  await waitForServer()
  await sleep(500)
}

async function main() {
  if (!existsSync(EXTRACTOR_PATH)) {
    console.error('找不到 extractor prompt 文件')
    process.exit(1)
  }

  const original = readFileSync(EXTRACTOR_PATH, 'utf-8')
  const allCases = JSON.parse(readFileSync(CASES_PATH, 'utf-8'))
  const cases = CASE_IDS.map((id) => allCases.find((item) => item.id === id)).filter(Boolean)

  const v1 = readFileSync(resolve(__dirname, 'prompt-variants/v1-baseline.txt'), 'utf-8')
  const v2 = readFileSync(resolve(__dirname, 'prompt-variants/v2-evidence.txt'), 'utf-8')
  const v3 = original.match(/`([\s\S]*)`/)?.[1] ?? ''

  const variants = [
    { name: 'v1 基础版', hint: '无证据、无冲突、无注入规则', body: v1 },
    { name: 'v2 加证据', hint: '加 evidence 铁律与 conflicts', body: v2 },
    { name: 'v3 现行版', hint: '再加注入声明与营销话术规则', body: v3 },
  ]

  const rows = []

  try {
    for (const variant of variants) {
      process.stdout.write(`运行 ${variant.name} … `)
      await applyVariant(variant.body)

      const results = []
      for (const testCase of cases) {
        results.push(await runCase(testCase))
      }

      const score = scoreVariant(cases, results)
      rows.push({ ...variant, ...score })
      console.log(
        `通过 ${score.passRate}%  无证据字段 ${score.hallucinationRate}%  相对时间误判 ${score.relativeTimeLeaks}`,
      )
    }
  } finally {
    writeFileSync(EXTRACTOR_PATH, original, 'utf-8')
    await sleep(1200)
    await waitForServer()
    console.log('\n已恢复原 Prompt。')
  }

  const markdown = [
    '| 版本 | 用例通过率 | 无证据字段占比 | 相对时间误判 |',
    '|---|---:|---:|---:|',
    ...rows.map(
      (row) => `| ${row.name} | ${row.passRate}% | ${row.hallucinationRate}% | ${row.relativeTimeLeaks} 例 |`,
    ),
  ].join('\n')

  console.log(`\n${markdown}`)
  writeFileSync(
    resolve(__dirname, 'prompt-ab.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), cases: CASE_IDS, rows }, null, 2),
    'utf-8',
  )
}

main()