export const WEEK_MS = 7 * 24 * 3600 * 1000

export interface DeadlineInfo {
  deadlineTime: number | null
  expired: boolean
  /** 向上取整的剩余周数；已截止为 0，无法解析为 null */
  weeksLeft: number | null
}

/**
 * 直接比较截止时间戳，不再用「周数 <= 0」间接判断过期。
 * 截止前 1 分钟仍是未过期；截止后 1 分钟一定过期。
 */
export function evaluateDeadline(deadline: string | null | undefined, now = Date.now()): DeadlineInfo {
  if (!deadline) return { deadlineTime: null, expired: false, weeksLeft: null }
  const deadlineTime = new Date(deadline).getTime()
  if (Number.isNaN(deadlineTime)) return { deadlineTime: null, expired: false, weeksLeft: null }
  return {
    deadlineTime,
    expired: deadlineTime <= now,
    weeksLeft: Math.max(0, Math.ceil((deadlineTime - now) / WEEK_MS)),
  }
}