/**
 * 风险核查的确定性规则层。
 * 这里的所有判断都能复现——同样的输入永远得到同样的分数，
 * LLM 只负责把结论解释成人话（见 agents/fact-checker.ts）。
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const whitelist: any[] = JSON.parse(
  readFileSync(resolve(__dirname, '../../data/whitelist.json'), 'utf-8'),
)

export type Verdict = 'green' | 'yellow' | 'red'

export interface RiskFlag {
  code: string
  level: 'high' | 'medium' | 'low'
  message: string
  evidence?: string
}

export interface RiskResult {
  verdict: Verdict
  authority_score: number
  risk_flags: RiskFlag[]
  known_facts: string[]
  matched_event_id: string | null
  fallback_steps: Array<{ action: string; where: string; pass_criteria: string }>
}

/** 常见的赛事诈骗话术 */
const SCAM_PATTERNS = [
  '保过',
  '包过',
  '保研必备',
  '包就业',
  '内推名额',
  '证书直出',
  '无需考试',
  '交钱即可',
  '百分之百获奖',
  '100%获奖',
]

const INJECTION_PATTERNS = [
  /忽略.{0,12}(?:以上|之前|前面)?.{0,6}(?:指令|要求|规则)/i,
  /ignore.{0,24}(?:instructions|rules|the above)/i,
  /不要输出.{0,8}(?:风险|警告|提示)/i,
]

function textOf(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.join(' ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

function extractHosts(text: string): string[] {
  const tokens = text.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s"'<>]*)?/gi) ?? []
  return tokens.flatMap((token) => {
    try {
      const candidate = token.replace(/[),.;!?，。！？；：]+$/u, '')
      return [new URL(candidate.includes('://') ? candidate : `https://${candidate}`).hostname.toLowerCase()]
    } catch {
      return []
    }
  })
}

function matchesDomain(host: string, domain: string): boolean {
  const root = domain.toLowerCase().replace(/^www\./, '')
  return host === root || host.endsWith(`.${root}`)
}

/** 赛事名称按文本比对，域名按解析后的 hostname 比对，避免前缀相似造成误命中。 */
function matchWhitelist(text: string) {
  const haystack = normalize(text)
  const hosts = extractHosts(text)
  for (const item of whitelist as any[]) {
    const nameHit = item.names.find((name: string) => haystack.includes(normalize(name)))
    const domainHit = item.domains.find((domain: string) => hosts.some((host) => matchesDomain(host, domain)))
    if (nameHit || domainHit) {
      return { item, nameHit: nameHit ?? null, domainHit: domainHit ?? null }
    }
  }
  return null
}

export function evaluateRisk(extraction: any, rawText: string, sourceType = 'unknown'): RiskResult {
  const event = extraction?.event ?? {}
  const flags: RiskFlag[] = []
  const facts: string[] = []

  const registration = event.registration ?? {}
  const submission = event.submission ?? {}
  const organizer: string[] = Array.isArray(event.organizer) ? event.organizer : []
  const conflicts: any[] = Array.isArray(extraction?.conflicts) ? extraction.conflicts : []

  const combined = `${textOf(event)} ${textOf(extraction?.source_versions)} ${rawText}`

  let score = 50
  let scoreCeiling = 100

  // 1. 白名单命中
  const hit = matchWhitelist(combined)
  if (hit) {
    score += 30
    facts.push(
      `本地白名单命中：${hit.item.names[0]}（${hit.item.organizer.join('、')}）`,
    )
    if (hit.domainHit) {
      score += 15
      facts.push(`原文出现官方域名：${hit.domainHit}`)
    }
  } else {
    flags.push({
      code: 'not_in_whitelist',
      level: 'medium',
      message: '该赛事不在本地白名单中，需自行核实主办方身份',
    })
  }

  // 2. 结构完整度（正向信号）
  const url = typeof registration.url === 'string' ? registration.url : ''
  if (/^https:\/\//i.test(url)) {
    score += 10
    facts.push('提供了 HTTPS 官方链接')
  }
  if (registration.deadline && submission.deadline) {
    score += 5
    facts.push('报名与提交两条时间线均明确')
  }
  if (organizer.length > 0) {
    score += 5
  }

  // 3. 来源渠道可信度
  if (sourceType === 'group_chat' || sourceType === 'social') {
    score -= 15
    flags.push({
      code: 'unofficial_channel',
      level: 'medium',
      message: '来源为群聊/社交平台，非官方发布渠道，信息可能失真',
    })
  }

  // 4. 关键字段缺失
  if (!registration.url) {
    score -= 10
    flags.push({
      code: 'no_official_url',
      level: 'medium',
      message: '缺少官方报名地址，无法核对主办方',
    })
  }
  if (!registration.deadline) {
    score -= 5
    flags.push({
      code: 'no_deadline',
      level: 'low',
      message: '未找到明确的报名截止时间',
      evidence: registration.raw_time_text ?? undefined,
    })
  }
  if (organizer.length === 0) {
    score -= 10
    flags.push({
      code: 'no_organizer',
      level: 'medium',
      message: '未识别出主办方，无法判断赛事权威性',
    })
  }

  // 5. 话术检测
  const normalizedCombined = normalize(combined)
  const scamHit = SCAM_PATTERNS.find((pattern) => normalizedCombined.includes(normalize(pattern)))
  if (scamHit) {
    score -= 30
    // 诈骗承诺是强风险信号，白名单或完整字段不能把它抵消成低风险。
    scoreCeiling = Math.min(scoreCeiling, 39)
    flags.push({
      code: 'scam_keyword',
      level: 'high',
      message: `出现高风险话术「${scamHit}」，正规赛事不会承诺此类结果`,
      evidence: scamHit,
    })
  }

  const injectionDetected =
    extraction?.injection_detected === true || INJECTION_PATTERNS.some((pattern) => pattern.test(rawText))
  if (injectionDetected) {
    scoreCeiling = Math.min(scoreCeiling, 79)
    flags.push({
      code: 'prompt_injection',
      level: 'medium',
      message: '原文包含试图改变分析规则的指令，已按普通文本处理并建议人工核对',
    })
  }

  // 6. 多版本冲突
  if (conflicts.length > 0) {
    score -= 10
    flags.push({
      code: 'source_conflict',
      level: 'medium',
      message: `不同来源对 ${conflicts.map((c) => c.field).join('、')} 的说法不一致`,
    })
  }

  // 7. 已经截止
  const deadline = registration.deadline ?? submission.deadline
  if (typeof deadline === 'string' && deadline) {
    const time = new Date(deadline).getTime()
    if (!Number.isNaN(time) && time < Date.now()) {
      score -= 25
      scoreCeiling = Math.min(scoreCeiling, 59)
      flags.push({
        code: 'expired',
        level: 'high',
        message: `报名/提交时间已过（${deadline}）`,
        evidence: deadline,
      })
    }
  }

  score = Math.max(0, Math.min(scoreCeiling, score))
  const verdict: Verdict = score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red'

  // 降级用的核验步骤（LLM 不可用时直接使用）
  const fallbackSteps = [
    {
      action: '打开官网核对本届通知',
      where: registration.url ?? '搜索引擎检索「赛事名 + 官网」',
      pass_criteria: '官网能看到与本条资讯一致的赛事名称与时间',
    },
    {
      action: '核对主办方是否具备主办资质',
      where: organizer[0] ? `${organizer[0]} 官网/官方公众号` : '主办方官网',
      pass_criteria: '主办方官网上有该赛事的官方通知',
    },
    {
      action: '向校内竞赛负责老师确认',
      where: '学院教务/竞赛群',
      pass_criteria: '老师能确认该赛事在推荐名单内',
    },
  ]

  return {
    verdict,
    authority_score: score,
    risk_flags: flags,
    known_facts: facts,
    matched_event_id: hit?.item.id ?? null,
    fallback_steps: fallbackSteps,
  }
}
