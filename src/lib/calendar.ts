interface PlanTask {
  task?: string
  owner?: string
  due?: string
  output?: string
  acceptance?: string
}

interface PlanPhase {
  week_range?: string
  tasks?: PlanTask[]
}

interface PlanLike {
  phases?: PlanPhase[]
  milestones?: Array<{ label?: string; due?: string } | string>
}

function escapeIcs(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function startOfWeek(now: Date): Date {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  const day = date.getDay()
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day))
  return date
}

function weekNumber(value: unknown, fallback = 1): number {
  const match = String(value ?? '').match(/W?\s*(\d+)/i)
  if (!match) return fallback
  return Math.max(1, Math.min(52, Number(match[1])))
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function dateForWeek(week: number, now: Date): Date {
  const date = startOfWeek(now)
  date.setDate(date.getDate() + (week - 1) * 7)
  return date
}

/**
 * 生成可导入日历的 .ics。任务按「due / week_range」落到对应周的周一，
 * 只是周级提醒，精确到日的时间仍以赛事官方截止为准。
 */
export function buildPlanCalendar(plan: PlanLike, eventName = '备赛计划', now = new Date()): string {
  const phases = Array.isArray(plan?.phases) ? plan.phases : []
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CampusRace Radar//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(eventName)} 备赛计划`,
  ]
  const stamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  let index = 0

  const addEvent = (summary: string, description: string, week: number) => {
    index += 1
    const date = dateForWeek(week, now)
    lines.push(
      'BEGIN:VEVENT',
      `UID:campusrace-${now.getTime()}-${index}@local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${formatDate(date)}`,
      `SUMMARY:${escapeIcs(summary)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      'END:VEVENT',
    )
  }

  let phaseIndex = 0
  for (const phase of phases) {
    phaseIndex += 1
    const fallbackWeek = phaseIndex
    const week = weekNumber(phase.week_range, fallbackWeek)
    for (const task of Array.isArray(phase.tasks) ? phase.tasks : []) {
      const description = [
        task.owner ? `负责人：${task.owner}` : '',
        task.output ? `成果物：${task.output}` : '',
        task.acceptance ? `验收：${task.acceptance}` : '',
      ]
        .filter(Boolean)
        .join('\n')
      addEvent(`备赛：${task.task ?? '任务'}`, description, weekNumber(task.due, week))
    }
  }

  for (const milestone of Array.isArray(plan?.milestones) ? plan.milestones : []) {
    if (typeof milestone === 'string') {
      addEvent(`里程碑：${milestone}`, '来自 CampusRace Radar 的备赛计划', 1)
    } else if (milestone?.label) {
      addEvent(
        `里程碑：${milestone.label}`,
        '来自 CampusRace Radar 的备赛计划',
        weekNumber(milestone.due, 1),
      )
    }
  }

  if (index === 0) return ''
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadPlanCalendar(plan: PlanLike, eventName = '备赛计划') {
  const content = buildPlanCalendar(plan, eventName)
  if (!content) return
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${eventName.replace(/[\\/:*?"<>|]/g, '-')}-备赛日历.ics`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}