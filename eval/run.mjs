#!/usr/bin/env node
/**
 * 批量评测：把 eval/cases.json 里的用例逐个跑完整链路，逐项核对预期，生成报告。
 * 用法：node eval/run.mjs   （需要后端已启动，且 USE_MOCK=false）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API = process.env.EVAL_API ?? 'http://localhost:8787/api/analyze'
const CONCURRENCY = 3

const cases = JSON.parse(readFileSync(resolve(__dirname, 'cases.json'), 'utf-8'))

const PROFILE = {
  major: '计算机科学与技术',
  grade: '大三',
  skills: ['React', 'TypeScript', 'Python'],
  goal: '求职',
  hoursPerWeek: 10,
}

async function runCase(testCase) {
  const started = Date.now()
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: testCase.text, sourceType: testCase.sourceType, ...PROFILE }),
  })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const payloads = {}
  let error = null

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
      if (event.node === 'all' && event.status === 'error') error = event.message
      if (event.payload) payloads[event.node] = event.payload
    }
  }

  return {
    id: testCase.id,
    category: testCase.category,
    elapsed: Date.now() - started,
    error,
    payloads,
  }
}

function check(name, actual, expected) {
  let pass = false

  if (Array.isArray(expected)) pass = expected.includes(actual)
  else if (expected === null) pass = actual === null || actual === undefined
  else pass = actual === expected

  return { name, pass, actual, expected }
}

function evaluate(testCase, result) {
  const { expect } = testCase
  const ex = result.payloads.extractor ?? {}
  const fc = result.payloads.fact_checker ?? {}
  const mm = result.payloads.matchmaker ?? {}
  const pl = result.payloads.planner ?? {}
  const checks = []

  if (result.error) {
    return [{ name: '链路无错误', pass: false, actual: result.error, expected: '无错误' }]
  }

  if ('is_event' in expect) checks.push(check('赛事识别', ex.is_event, expect.is_event))

  if ('verdict' in expect) checks.push(check('风险结论', fc.verdict, expect.verdict))

  if ('registration_deadline' in expect) {
    checks.push(
      check('报名截止', ex.event?.registration?.deadline ?? null, expect.registration_deadline),
    )
  }

  if (expect.organizer_not_empty) {
    const organizer = ex.event?.organizer ?? []
    checks.push(check('主办方非空', organizer.length > 0, true))
  }

  if (expect.warnings_include) {
    const warnings = ex.warnings ?? []
    const hit = expect.warnings_include.some((w) => warnings.includes(w))
    checks.push(check('警告命中', hit, true))
  }

  if (expect.flags_include) {
    const codes = (fc.risk_flags ?? []).map((f) => f.code)
    const hit = expect.flags_include.some((c) => codes.includes(c))
    checks.push(check('风险标签命中', hit, true))
  }

  if (expect.recommendation) {
    checks.push(check('推荐档位', mm.recommendation, expect.recommendation))
  }

  if ('feasible' in expect) checks.push(check('规划可行性', pl.feasible, expect.feasible))

  if (expect.conflicts_not_empty) {
    checks.push(check('冲突被识别', (ex.conflicts ?? []).length > 0, true))
  }

  if ('confidence_max' in expect) {
    checks.push(check('置信度上限', (ex.confidence ?? 1) <= expect.confidence_max, true))
  }

  if (expect.injection_detected) {
    checks.push(check('注入被识别', ex.injection_detected === true, true))
  }

  return checks
}

async function pool(items, size, worker) {
  const results = []
  let cursor = 0

  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index])
    }
  })

  await Promise.all(runners)
  return results
}

console.log(`开始评测 ${cases.length} 条用例，并发 ${CONCURRENCY}…\n`)

const results = await pool(cases, CONCURRENCY, async (testCase) => {
  const result = await runCase(testCase)
  const checks = evaluate(testCase, result)
  const passed = checks.filter((c) => c.pass).length
  console.log(
    `${passed === checks.length ? '✅' : '❌'} ${testCase.id.padEnd(20)} ${passed}/${checks.length}  ${result.elapsed}ms`,
  )
  return { ...result, checks }
})

// ---- 汇总 ----
const allChecks = results.flatMap((r) => r.checks)
const passedChecks = allChecks.filter((c) => c.pass).length
const casePassed = results.filter((r) => r.checks.every((c) => c.pass)).length
const latencies = results.map((r) => r.elapsed).sort((a, b) => a - b)

const byCheck = {}
for (const check of allChecks) {
  byCheck[check.name] ??= { pass: 0, total: 0 }
  byCheck[check.name].total += 1
  if (check.pass) byCheck[check.name].pass += 1
}

const summary = {
  generatedAt: new Date().toISOString(),
  cases: cases.length,
  caseAccuracy: Number(((casePassed / cases.length) * 100).toFixed(1)),
  checkAccuracy: Number(((passedChecks / allChecks.length) * 100).toFixed(1)),
  latency: {
    min: latencies[0],
    median: latencies[Math.floor(latencies.length / 2)],
    max: latencies[latencies.length - 1],
  },
  byCheck: Object.fromEntries(
    Object.entries(byCheck).map(([name, v]) => [name, `${v.pass}/${v.total}`]),
  ),
  failures: results
    .flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => ({ caseId: r.id, ...c })))
    .map((f) => `${f.caseId} · ${f.name}（实际 ${JSON.stringify(f.actual)}，期望 ${JSON.stringify(f.expected)}）`),
}

writeFileSync(resolve(__dirname, 'latest.json'), JSON.stringify({ summary, results }, null, 2), 'utf-8')

// ---- Markdown 报告 ----
const rows = results
  .map((r) => {
    const passed = r.checks.filter((c) => c.pass).length
    const status = r.checks.every((c) => c.pass) ? '✅' : '❌'
    return `| ${status} | ${r.category} | \`${r.id}\` | ${passed}/${r.checks.length} | ${r.elapsed}ms |`
  })
  .join('\n')

const checkRows = Object.entries(summary.byCheck)
  .map(([name, ratio]) => {
    const [pass, total] = ratio.split('/').map(Number)
    return `| ${name} | ${ratio} | ${Math.round((pass / total) * 100)}% |`
  })
  .join('\n')

const markdown = `# 评测报告

生成时间：${summary.generatedAt}

## 总览

| 指标 | 数值 |
|---|---|
| 用例数 | ${summary.cases} |
| 用例全通过率 | **${summary.caseAccuracy}%** |
| 单项检查通过率 | **${summary.checkAccuracy}%** |
| 延迟（中位数） | ${summary.latency.median}ms |
| 延迟（最大） | ${summary.latency.max}ms |

## 分项准确率

| 检查项 | 通过 | 比例 |
|---|---|---|
${checkRows}

## 逐条结果

| 结果 | 类别 | 用例 | 通过 | 耗时 |
|---|---|---|---|---|
${rows}

## 失败明细

${summary.failures.length ? summary.failures.map((f) => `- ${f}`).join('\n') : '无'}
`

writeFileSync(resolve(__dirname, 'report.md'), markdown, 'utf-8')

console.log(`\n用例通过率 ${summary.caseAccuracy}%   单项通过率 ${summary.checkAccuracy}%   中位延迟 ${summary.latency.median}ms`)
if (summary.failures.length) {
  console.log('\n失败项：')
  summary.failures.forEach((f) => console.log(' -', f))
}
console.log('\n报告已写入 eval/report.md')