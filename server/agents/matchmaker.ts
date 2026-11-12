import { callJSON } from '../llm.js'
import { MATCHMAKER_SYSTEM_PROMPT } from '../prompts/matchmaker.js'
import { computeWeightedScore, MATCH_WEIGHTS, type MatchDimension } from '../rules/score.js'
import type { ParticipationType } from '../rules/participation.js'

export interface Profile {
  major?: string
  grade?: string
  skills?: string[]
  goal?: string
  hoursPerWeek?: number
}

const DIMENSION_LABELS: Record<MatchDimension, string> = {
  skill_fit: '技能匹配',
  time_fit: '时间充裕度',
  goal_value: '目标价值',
  access_fit: '门槛可达',
}

function clampScore(value: unknown): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return 50
  return Math.max(0, Math.min(100, Math.round(num)))
}

function missingProfileFields(profile: Profile): string[] {
  const missing: string[] = []
  if (!profile.major) missing.push('专业')
  if (!profile.grade) missing.push('年级')
  if (!profile.skills?.length) missing.push('技能栈')
  if (!profile.goal) missing.push('目标')
  if (!profile.hoursPerWeek) missing.push('每周投入')
  return missing
}

function filterIndividualActions(actions: string[], participation: ParticipationType): string[] {
  if (participation !== 'individual') return actions
  const filtered = actions.filter((action) => !/组队|队友|团队|分工|队长|拉人/.test(action))
  if (filtered.length > 0) return filtered
  return ['按个人赛准备：作品说明、演示视频与过程记录']
}

/**
 * 空画像的统一返回：前端、mock 回放都走这里，避免两处形状不一致。
 */
export function emptyMatchResult(
  participation: ParticipationType = 'unknown',
  missing: string[] = ['专业', '年级', '技能栈', '目标', '每周投入'],
) {
  const emptyBreakdown = Object.fromEntries(
    (Object.keys(MATCH_WEIGHTS) as MatchDimension[]).map((key) => [
      key,
      {
        score: null,
        reason: '画像为空，暂停打分',
        weight: MATCH_WEIGHTS[key],
        contribution: null,
      },
    ]),
  )

  return {
    fit_score: null,
    recommendation: '待补充',
    breakdown: emptyBreakdown,
    hard_blockers: [],
    next_actions: ['先在左侧填写专业、年级、技能栈、目标和每周投入，再重新研判'],
    summary: '画像为空，匹配结论暂停。',
    profile_incomplete: true,
    profile_missing: missing,
    participation_type: participation,
    weights: MATCH_WEIGHTS,
    contributions: null,
    score_formula: '技能 40% + 时间 30% + 目标 20% + 门槛 10%',
    score_note: '未填写画像时刻意不输出匹配分，避免用默认值制造高分。',
  }
}

/**
 * 匹配评估：模型给四个维度的分与理由，代码按 40/30/20/10 重算总分。
 * 空画像直接返回「待补充」，不拿默认画像硬凑一个高分。
 */
export async function match(
  event: any,
  profile: Profile,
  participation: ParticipationType = 'unknown',
) {
  const missing = missingProfileFields(profile)
  const emptyProfile = missing.length === 5

  if (emptyProfile) {
    return emptyMatchResult(participation, missing)
  }

  const result = await callJSON<any>(
    MATCHMAKER_SYSTEM_PROMPT,
    `【赛事信息】${JSON.stringify(event).slice(0, 2000)}
【参赛形式】${participation === 'individual' ? '个人赛' : participation === 'team' ? '团队赛' : '未识别'}

【学生画像】
专业：${profile.major ?? '未提供'}
年级：${profile.grade ?? '未提供'}
技能栈：${profile.skills?.join('、') || '未提供'}
目标：${profile.goal ?? '未提供'}
每周可投入：${profile.hoursPerWeek ?? '未提供'} 小时`,
    { temperature: 0.3, maxTokens: 1200 },
  )

  const rawBreakdown = result.breakdown ?? {}
  const cleanBreakdown = {} as Record<
    MatchDimension,
    { score: number; reason: string; weight: number; contribution: number }
  >

  for (const key of Object.keys(MATCH_WEIGHTS) as MatchDimension[]) {
    cleanBreakdown[key] = {
      score: clampScore(rawBreakdown?.[key]?.score),
      reason: String(rawBreakdown?.[key]?.reason ?? '信息不足'),
      weight: MATCH_WEIGHTS[key],
      contribution: 0,
    }
  }

  const { total, contributions } = computeWeightedScore(cleanBreakdown)
  for (const key of Object.keys(MATCH_WEIGHTS) as MatchDimension[]) {
    cleanBreakdown[key].contribution = contributions[key]
  }

  const hardBlockers = Array.isArray(result.hard_blockers)
    ? result.hard_blockers.slice(0, 3).map((item: unknown) => String(item))
    : []

  const recommendation =
    hardBlockers.length > 0 || total < 55 ? '不建议' : total >= 75 ? '优先冲' : '可试'

  const rawActions = Array.isArray(result.next_actions)
    ? result.next_actions.slice(0, 4).map((item: unknown) => String(item))
    : []
  const nextActions = filterIndividualActions(rawActions, participation)

  if (participation === 'individual') {
    const hasIndividualSubmission = nextActions.some((action) => /作品|文档|视频|演示/.test(action))
    if (!hasIndividualSubmission) nextActions.push('按个人赛提交物准备：作品链接、说明文档、演示视频')
  }

  return {
    fit_score: total,
    recommendation,
    breakdown: cleanBreakdown,
    hard_blockers: hardBlockers,
    next_actions: nextActions.slice(0, 4),
    summary: String(result.summary ?? ''),
    profile_incomplete: false,
    profile_missing: missing,
    participation_type: participation,
    weights: MATCH_WEIGHTS,
    contributions,
    score_formula: '技能 40% + 时间 30% + 目标 20% + 门槛 10%',
    score_note:
      missing.length > 0
        ? `画像缺 ${missing.join('、')}，相关维度按 50 分暂估；总分已按权重重算。`
        : '总分已按四个维度权重由代码重算。',
  }
}

export { DIMENSION_LABELS }