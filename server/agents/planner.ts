import { callJSON } from '../llm.js'
import { PLANNER_SYSTEM_PROMPT } from '../prompts/planner.js'
import type { Profile } from './matchmaker.js'
import { evaluateDeadline } from '../rules/time.js'
import type { ParticipationType } from '../rules/participation.js'

/**
 * 备赛规划：模型排期，这里做硬约束兜底——
 * 已截止直接判不可行，规划周数不得超过剩余周数。
 */
export async function plan(
  event: any,
  profile: Profile,
  matchResult: any,
  participation: ParticipationType = 'unknown',
) {
  const deadline = event?.submission?.deadline ?? event?.registration?.deadline ?? null
  const deadlineInfo = evaluateDeadline(deadline)
  const weeksLeft = deadlineInfo.weeksLeft
  const today = new Date().toISOString().slice(0, 10)

  // 已截止：不进模型，直接短路
  if (deadlineInfo.expired) {
    return {
      feasible: false,
      total_weeks: 0,
      buffered_weeks: 0,
      phases: [],
      milestones: [],
      risk_note: '赛事已截止，无需备赛',
      summary: '该赛事的提交/报名时间已经过去，建议关注下一届。',
      weeks_left: 0,
      deadline,
      deadline_time: deadlineInfo.deadlineTime,
      expired: true,
      participation_type: participation,
      plan_warnings: [],
    }
  }

  const result = await callJSON<any>(
    PLANNER_SYSTEM_PROMPT,
    `【今天】${today}
【赛事】${event?.name ?? '未知赛事'}
【参赛形式】${participation === 'individual' ? '个人赛' : participation === 'team' ? '团队赛' : '未识别'}
【报名截止】${event?.registration?.deadline ?? '未知'}
【提交截止】${deadline ?? '未知'}
【剩余周数】${weeksLeft === null ? '未知' : weeksLeft}
【赛道要求】${JSON.stringify(event?.tracks ?? []).slice(0, 600)}
【匹配结论】${matchResult?.recommendation ?? '未知'}（${matchResult?.fit_score ?? '-'} 分）
【学生画像】专业 ${profile.major ?? '未知'}／${profile.grade ?? '未知'}／技能 ${
      profile.skills?.join('、') || '未知'
    }／每周 ${profile.hoursPerWeek ?? '未知'} 小时／目标 ${profile.goal ?? '未知'}`,
    { temperature: 0.3, maxTokens: 1800 },
  )

  let totalWeeks = Math.max(0, Math.round(Number(result.total_weeks) || 0))
  let bufferedWeeks = Math.max(0, Math.round(Number(result.buffered_weeks) || 0))

  // 硬约束：排期不能超过剩余时间
  if (weeksLeft !== null && totalWeeks > weeksLeft) {
    totalWeeks = weeksLeft
  }
  // 缓冲至少 15%，但不超过总工期
  if (totalWeeks > 0) {
    bufferedWeeks = Math.min(totalWeeks, Math.max(bufferedWeeks, Math.ceil(totalWeeks * 0.15)))
  } else {
    bufferedWeeks = 0
  }

  const isIndividual = participation === 'individual'
  const phases = Array.isArray(result.phases)
    ? result.phases.slice(0, 6).map((phase: any) => {
        const weekRange = String(phase.week_range ?? '')
        return {
          name: String(phase.name ?? '阶段'),
          week_range: weekRange,
          tasks: Array.isArray(phase.tasks)
            ? phase.tasks
                .slice(0, 4)
                .map((task: any) => {
                  const label = String(task.task ?? '').trim()
                  if (!label) return null
                  if (isIndividual && /组队|队友|团队|分工|队长|拉人/.test(label)) return null
                  return {
                    task: label,
                    owner: isIndividual ? '我' : String(task.owner ?? '我'),
                    output: String(task.output ?? task.deliverable ?? ''),
                    acceptance: String(
                      task.acceptance ?? '成果物可演示，且与任务描述一致',
                    ),
                    status: '待办',
                    due: String(task.due ?? weekRange ?? ''),
                    depends_on: Array.isArray(task.depends_on)
                      ? task.depends_on.slice(0, 3).map((item: unknown) => String(item))
                      : [],
                  }
                })
                .filter(Boolean)
            : [],
        }
      })
    : []

  const milestones = Array.isArray(result.milestones)
    ? result.milestones.slice(0, 6).map((milestone: any) => {
        if (typeof milestone === 'string') return { label: milestone, due: '' }
        return {
          label: String(milestone?.label ?? milestone?.name ?? ''),
          due: String(milestone?.due ?? milestone?.week ?? ''),
        }
      })
    : []

  const planWarnings: string[] = []
  const coveredWeeks = new Set<number>()
  for (const phase of phases) {
    const range = String(phase.week_range ?? '')
    const rangeMatch = range.match(/(\d+)\s*[-–—~至]\s*(\d+)/)
    if (rangeMatch) {
      const start = Number(rangeMatch[1])
      const end = Number(rangeMatch[2])
      for (let week = start; week <= end && week - start < 12; week += 1) {
        coveredWeeks.add(week)
      }
    } else {
      for (const match of range.matchAll(/\d+/g)) coveredWeeks.add(Number(match[0]))
    }
  }
  if (totalWeeks >= 3 && coveredWeeks.size < Math.min(5, totalWeeks)) {
    planWarnings.push('阶段没有覆盖完整周次，建议按 W1–W5 补齐每周任务与验收标准')
  }
  if (
    isIndividual &&
    phases.some((phase: any) => phase.tasks.some((task: any) => /组队|队友/.test(task.task)))
  ) {
    planWarnings.push('检测到团队任务，已按个人赛过滤')
  }

  return {
    feasible: Boolean(result.feasible) && totalWeeks > 0,
    total_weeks: totalWeeks,
    buffered_weeks: bufferedWeeks,
    phases,
    milestones,
    risk_note: String(result.risk_note ?? ''),
    summary: String(result.summary ?? ''),
    weeks_left: weeksLeft,
    deadline,
    deadline_time: deadlineInfo.deadlineTime,
    expired: false,
    participation_type: participation,
    plan_warnings: planWarnings,
  }
}