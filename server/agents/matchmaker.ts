import { callJSON } from '../llm'
import { MATCHMAKER_SYSTEM_PROMPT } from '../prompts/matchmaker'

export interface Profile {
  major?: string
  grade?: string
  skills?: string[]
  goal?: string
  hoursPerWeek?: number
}

const RECOMMENDATIONS = ['优先冲', '可试', '不建议'] as const

function clampScore(value: unknown): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return 50
  return Math.max(0, Math.min(100, Math.round(num)))
}

/**
 * 匹配评估：模型给分，这里做钳位与枚举校验，
 * 避免模型返回 120 分或「强烈建议参加」这种不在枚举里的档位。
 */
export async function match(event: any, profile: Profile) {
  const result = await callJSON<any>(
    MATCHMAKER_SYSTEM_PROMPT,
    `【赛事信息】${JSON.stringify(event).slice(0, 2000)}

【学生画像】
专业：${profile.major ?? '未提供'}
年级：${profile.grade ?? '未提供'}
技能栈：${profile.skills?.join('、') || '未提供'}
目标：${profile.goal ?? '未提供'}
每周可投入：${profile.hoursPerWeek ?? '未提供'} 小时`,
    { temperature: 0.3, maxTokens: 1200 },
  )

  const breakdown = result.breakdown ?? {}
  const cleanBreakdown = {
    skill_fit: {
      score: clampScore(breakdown.skill_fit?.score),
      reason: String(breakdown.skill_fit?.reason ?? '信息不足'),
    },
    time_fit: {
      score: clampScore(breakdown.time_fit?.score),
      reason: String(breakdown.time_fit?.reason ?? '信息不足'),
    },
    goal_value: {
      score: clampScore(breakdown.goal_value?.score),
      reason: String(breakdown.goal_value?.reason ?? '信息不足'),
    },
    access_fit: {
      score: clampScore(breakdown.access_fit?.score),
      reason: String(breakdown.access_fit?.reason ?? '信息不足'),
    },
  }

  const fitScore = clampScore(result.fit_score)
  const recommendation = (RECOMMENDATIONS as readonly string[]).includes(result.recommendation)
    ? result.recommendation
    : fitScore >= 75
      ? '优先冲'
      : fitScore >= 55
        ? '可试'
        : '不建议'

  return {
    fit_score: fitScore,
    recommendation,
    breakdown: cleanBreakdown,
    hard_blockers: Array.isArray(result.hard_blockers) ? result.hard_blockers.slice(0, 3) : [],
    next_actions: Array.isArray(result.next_actions) ? result.next_actions.slice(0, 3) : [],
    summary: String(result.summary ?? ''),
  }
}