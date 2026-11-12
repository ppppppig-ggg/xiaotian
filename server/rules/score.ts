export const MATCH_WEIGHTS = {
  skill_fit: 0.4,
  time_fit: 0.3,
  goal_value: 0.2,
  access_fit: 0.1,
} as const

export type MatchDimension = keyof typeof MATCH_WEIGHTS

export interface WeightedScoreResult {
  total: number
  contributions: Record<MatchDimension, number>
}

/**
 * 匹配总分由代码按 40/30/20/10 重算，不再直接采用模型自报的 fit_score。
 * 缺失或非法分项按 0 计，避免模型用一个高分掩盖空维度。
 */
export function computeWeightedScore(
  breakdown: Record<string, { score?: unknown } | undefined>,
): WeightedScoreResult {
  const contributions = {} as Record<MatchDimension, number>
  let total = 0

  for (const key of Object.keys(MATCH_WEIGHTS) as MatchDimension[]) {
    const raw = Number(breakdown?.[key]?.score)
    const safe = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0
    const contribution = safe * MATCH_WEIGHTS[key]
    contributions[key] = Math.round(contribution * 10) / 10
    total += contribution
  }

  return { total: Math.round(total), contributions }
}