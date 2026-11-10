/**
 * 抽取结果的硬校验：模型编造的字段在这里被挡掉。
 * 这是整个项目「反幻觉」的核心，不是可选项。
 */

export interface ValidationResult {
  ok: boolean
  data: any
  errors: string[]
}

const DATE_MIN = new Date('2020-01-01T00:00:00Z').getTime()
const DATE_MAX = new Date('2035-12-31T23:59:59Z').getTime()

/** 需要参与完整性统计的关键字段 */
const KEY_FIELDS = [
  'event.name',
  'event.organizer',
  'event.registration.deadline',
  'event.submission.deadline',
  'event.registration.url',
  'event.eligibility',
  'event.prizes',
  'event.contact',
]

function normalize(value: string): string {
  return value.replace(/\s+/g, '')
}

function getPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj)
}

function setPath(obj: any, path: string, value: any): void {
  const keys = path.split('.')
  const last = keys.pop() as string
  const target = keys.reduce((acc, key) => (acc[key] ??= {}), obj)
  target[last] = value
}

function isEmpty(value: any): boolean {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'string') return value.trim() === ''
  return false
}

function checkDate(path: string, value: string, errors: string[]): void {
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) {
    errors.push(`${path} 不是合法日期：${value}`)
    return
  }
  if (time < DATE_MIN || time > DATE_MAX) {
    errors.push(`${path} 超出合理年份区间：${value}`)
  }
}

export function validateExtraction(raw: unknown, sourceText: string): ValidationResult {
  const errors: string[] = []
  const data = raw && typeof raw === 'object' ? structuredClone(raw as any) : {}

  if (typeof data.is_event !== 'boolean') {
    errors.push('缺少 is_event 布尔字段')
  }

  // 1. evidence 逐字校验：原文里找不到的字段一律判为编造
  const evidence: Record<string, string> = data.evidence ?? {}
  const haystack = normalize(sourceText)
  for (const [field, quote] of Object.entries(evidence)) {
    if (typeof quote !== 'string' || !quote.trim()) continue
    if (!haystack.includes(normalize(quote))) {
      errors.push(`${field} 的 evidence 未在原文中命中，已置为 null`)
      if (field.includes('.')) setPath(data, field, null)
    }
  }

  // 2. 日期合法性
  for (const path of ['event.registration.deadline', 'event.submission.deadline']) {
    const value = getPath(data, path)
    if (typeof value === 'string' && value) checkDate(path, value, errors)
  }

  // 3. conflicts 必须给出至少两个不同来源的值
  //    注意：声明了冲突的字段本来就该留 null（不擅自择一），所以这里不检查字段是否为空
  const conflicts: any[] = Array.isArray(data.conflicts) ? data.conflicts : []
  for (const conflict of conflicts) {
    const values = Array.isArray(conflict?.values) ? conflict.values : []
    if (values.length < 2) {
      errors.push(`conflicts 中 ${conflict?.field ?? '未知字段'} 至少需要两个来源的值`)
    }
  }

  // 4. missing_fields 与空字段数量一致性（软校验，只记警告）
  const missing: string[] = Array.isArray(data.missing_fields) ? data.missing_fields : []
  const actuallyMissing = KEY_FIELDS.filter((path) => isEmpty(getPath(data, path))).length
  if (Math.abs(missing.length - actuallyMissing) > 1) {
    data.warnings = Array.isArray(data.warnings) ? data.warnings : []
    data.warnings.push(
      `missing_fields 声明 ${missing.length} 项，实际空字段 ${actuallyMissing} 项，可能存在遗漏`,
    )
  }

  return { ok: errors.length === 0, data, errors }
}