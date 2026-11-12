import type { RiskResult } from './risk.js'
import { evaluateDeadline } from './time.js'

export type VerificationStatus = 'verified' | 'conflict' | 'missing' | 'unverified'

export interface VerificationItem {
  key: string
  label: string
  value: string
  status: VerificationStatus
  source: string
  note: string
}

export interface VerificationResult {
  items: VerificationItem[]
  summary: Record<VerificationStatus, number>
  checked_at: string
}

function text(value: unknown): string {
  if (Array.isArray(value)) return value.filter(Boolean).join('、')
  if (value == null) return ''
  return String(value).trim()
}

/**
 * 把「一条笼统的风险结论」拆成五项可对照的事实。
 * 这里的 verified 只表示「原文有证据，且命中本地白名单」，
 * 不代表已经和主办方实时核验过——产品边界必须说清楚。
 */
export function buildVerification(extraction: any, risk: RiskResult): VerificationResult {
  const event = extraction?.event ?? {}
  const evidence: Record<string, unknown> = extraction?.evidence ?? {}
  const conflicts: any[] = Array.isArray(extraction?.conflicts) ? extraction.conflicts : []
  const trusted = Boolean(risk.matched_event_id)

  const quote = (...keys: string[]) => {
    for (const key of keys) {
      const value = evidence[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
    return null
  }

  const conflictFor = (...needles: string[]) =>
    conflicts.find((conflict) =>
      needles.some((needle) => String(conflict?.field ?? '').includes(needle)),
    )

  const items: VerificationItem[] = []

  const add = (
    key: string,
    label: string,
    value: string,
    quoteText: string | null,
    conflict: any,
    note: string,
  ) => {
    let status: VerificationStatus
    if (!value) status = 'missing'
    else if (conflict) status = 'conflict'
    else if (trusted) status = 'verified'
    else status = 'unverified'

    items.push({
      key,
      label,
      value: value || '未提供',
      status,
      source: quoteText
        ? `原文：“${quoteText}”`
        : trusted
          ? '本地白名单命中'
          : '原文未提供逐字证据',
      note:
        status === 'verified'
          ? '本地白名单可对照，仍需以主办方最新通知为准'
          : status === 'conflict'
            ? '不同来源说法不一致，无法据此下结论'
            : status === 'missing'
              ? note || '原文未提供，需要向主办方确认'
              : '有原文出处，但未与官方来源比对',
    })
  }

  const name = text(event.name)
  add(
    'name',
    '届次与赛事名称',
    name,
    quote('name', 'event.name'),
    conflictFor('name'),
    '原文未给出赛事全称，无法核对届次',
  )

  const organizer = text(event.organizer)
  add(
    'organizer',
    '主办方',
    organizer,
    quote('organizer', 'event.organizer'),
    conflictFor('organizer'),
    '原文未提供主办方，无法判断主办资质',
  )

  const url = text(event.registration?.url)
  add(
    'registration.url',
    '报名入口',
    url,
    quote('registration.url', 'event.registration.url'),
    conflictFor('url'),
    '原文未提供报名入口',
  )

  const registrationDeadline = text(event.registration?.deadline)
  const submissionDeadline = text(event.submission?.deadline)
  const deadline = [
    registrationDeadline ? `报名 ${registrationDeadline}` : '',
    submissionDeadline ? `提交 ${submissionDeadline}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const deadlineQuote = [
    quote('registration.deadline', 'event.registration.deadline'),
    quote('submission.deadline', 'event.submission.deadline'),
  ]
    .filter(Boolean)
    .join('；')
  const deadlineInfo = evaluateDeadline(registrationDeadline || submissionDeadline || null)
  add(
    'deadline',
    '报名 / 提交截止',
    deadline,
    deadlineQuote || null,
    conflictFor('registration.deadline', 'submission.deadline', 'deadline'),
    '原文未给出可解析的截止时间',
  )
  if (deadlineInfo.expired) {
    const item = items[items.length - 1]
    item.note = `时间已过（${registrationDeadline || submissionDeadline}）`
    if (item.status === 'verified') item.status = 'conflict'
  }

  const eligibility = text(event.eligibility ?? event.submission?.method)
  add(
    'eligibility',
    '参赛资格 / 提交物',
    eligibility,
    quote('eligibility', 'event.eligibility', 'submission.method'),
    conflictFor('eligibility'),
    '原文未说明资格或提交物',
  )

  const summary: Record<VerificationStatus, number> = {
    verified: 0,
    conflict: 0,
    missing: 0,
    unverified: 0,
  }
  for (const item of items) summary[item.status] += 1

  return { items, summary, checked_at: new Date().toISOString() }
}