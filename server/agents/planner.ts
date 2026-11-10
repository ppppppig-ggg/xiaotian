import { callJSON } from '../llm'
import { PLANNER_SYSTEM_PROMPT } from '../prompts/planner'
import type { Profile } from './matchmaker'

/** 距截止还剩多少周（向上取整），已过期为负数 */
function weeksUntil(deadline: string | null | undefined): number | null {
  if (!deadline) return null
  const time = new Date(deadline).getTime()
  if (Number.isNaN(time)) return null
  return Math.ceil((time - Date.now()) / (7 * 24 * 3600 * 1000))
}

/**
 * 备赛规划：模型排期，这里做硬约束兜底——
 * 已截止直接判不可行，规划周数不得超过剩余周数。
 */
export async function plan(event: any, profile: Profile, matchResult: any) {
  const deadline = event?.submission?.deadline ?? event?.registration?.deadline ?? null
  const weeksLeft = weeksUntil(deadline)
  const today = new Date().toISOString().slice(0, 10)

  // 已截止：不进模型，直接短路
  if (weeksLeft !== null && weeksLeft <= 0) {
    return {
      feasible: false,
      total_weeks: 0,
      buffered_weeks: 0,
      phases: [],
      milestones: [],
      risk_note: '赛事已截止，无需备赛',
      summary: '该赛事的提交/报名时间已经过去，建议关注下一届。',
      weeks_left: 0,
    }
  }

  const result = await callJSON<any>(
    PLANNER_SYSTEM_PROMPT,
    `【今天】${today}
【赛事】${event?.name ?? '未知赛事'}
【报名截止】${event?.registration?.deadline ?? '未知'}
【提交截止】${deadline ?? '未知'}
【剩余周数】${weeksLeft === null ? '未知' : weeksLeft}
【赛道要求】${JSON.stringify(event?.tracks ?? []).slice(0, 600)}
【匹配结论】${matchResult?.recommendation ?? '未知'}（${matchResult?.fit_score ?? '-'} 分）
【学生画像】专业 ${profile.major ?? '未知'}／${profile.grade ?? '未知'}／技能 ${
      profile.skills?.join('、') || '未知'
    }／每周 ${profile.hoursPerWeek ?? '未知'} 小时／目标 ${profile.goal ?? '未知'}`,
    { temperature: 0.3, maxTokens: 1600 },
  )

  let totalWeeks = Math.max(0, Math.round(Number(result.total_weeks) || 0))
  const bufferedWeeks = Math.max(0, Math.round(Number(result.buffered_weeks) || 0))

  // 硬约束：排期不能超过剩余时间
  if (weeksLeft !== null && totalWeeks > weeksLeft) {
    totalWeeks = weeksLeft
  }

  const phases = Array.isArray(result.phases)
    ? result.phases.slice(0, 6).map((phase: any) => ({
        name: String(phase.name ?? '阶段'),
        week_range: String(phase.week_range ?? ''),
        tasks: Array.isArray(phase.tasks)
          ? phase.tasks.slice(0, 4).map((task: any) => ({
              task: String(task.task ?? ''),
              owner: String(task.owner ?? '我'),
              output: String(task.output ?? ''),
            }))
          : [],
      }))
    : []

  return {
    feasible: Boolean(result.feasible) && totalWeeks > 0,
    total_weeks: totalWeeks,
    buffered_weeks: bufferedWeeks,
    phases,
    milestones: Array.isArray(result.milestones) ? result.milestones.slice(0, 5) : [],
    risk_note: String(result.risk_note ?? ''),
    summary: String(result.summary ?? ''),
    weeks_left: weeksLeft,
  }
}