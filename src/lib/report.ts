const SOURCE_LABELS: Record<string, string> = {
  wechat: '公众号/微信推文',
  group_chat: '群聊消息',
  official_site: '官方网站',
  social: '社交平台',
  poster: '海报/OCR',
  unknown: '未说明',
}

const show = (value: unknown) => (value == null || value === '' ? '未提供' : String(value))

function bullets(values: unknown[] | undefined): string {
  if (!values?.length) return '暂无'
  return values.map((value) => `- ${String(value)}`).join('\n')
}

export function buildMarkdownReport(payloads: Record<string, any>, sourceType: string): string {
  const extraction = payloads.extractor ?? {}
  const event = extraction.event ?? {}
  const checker = payloads.fact_checker ?? {}
  const matcher = payloads.matchmaker ?? {}
  const planner = payloads.planner ?? {}
  const verdictLabels: Record<string, string> = { green: '低风险', yellow: '待核实', red: '高风险' }
  const breakdown = matcher.breakdown ?? {}
  const evidence = extraction.evidence ?? {}
  const lines = [
    `# ${show(event.name ?? '赛事决策报告')}`,
    '',
    `- 生成时间：${new Date().toLocaleString('zh-CN')}`,
    `- 来源类型：${SOURCE_LABELS[sourceType] ?? SOURCE_LABELS.unknown}`,
    `- 识别结果：${extraction.is_event === false ? '未识别为赛事' : '赛事资讯'}`,
    '',
    '## 赛事信息',
    '',
    '| 字段 | 结果 |',
    '| --- | --- |',
    `| 主办方 | ${show(Array.isArray(event.organizer) ? event.organizer.join('、') : event.organizer)} |`,
    `| 级别 | ${show(event.level)} |`,
    `| 报名截止 | ${show(event.registration?.deadline)} |`,
    `| 报名链接 | ${show(event.registration?.url)} |`,
    `| 作品提交截止 | ${show(event.submission?.deadline)} |`,
    `| 参赛资格 | ${show(event.eligibility)} |`,
    `| 赛道 | ${show(event.tracks?.map((track: any) => track.name).filter(Boolean).join('、'))} |`,
    '',
    '## 风险核查',
    '',
    `- 结论：${verdictLabels[checker.verdict] ?? '待核实'}`,
    `- 权威度：${show(checker.authority_score)}/100`,
    `- 规则说明：${show(checker.verdict_reason)}`,
    '',
    '### 已知信息',
    '',
    bullets(checker.known_facts),
    '',
    '### 风险提示',
    '',
    bullets(checker.risk_flags?.map((flag: any) => `${flag.level ?? '提示'}：${flag.message}`)),
    '',
    '### 建议核验步骤',
    '',
    checker.verify_steps?.length
      ? checker.verify_steps
          .map((step: any, index: number) => `${index + 1}. ${step.action}；位置：${step.where}；标准：${step.pass_criteria}`)
          .join('\n')
      : '暂无',
    '',
    '## 个人匹配',
    '',
    `- 综合分：${show(matcher.fit_score)}/100`,
    `- 建议：${show(matcher.recommendation)}`,
    '',
    '| 维度 | 分数 | 说明 |',
    '| --- | ---: | --- |',
    ...Object.entries(breakdown).map(([key, value]: [string, any]) => `| ${key} | ${show(value.score)} | ${show(value.reason)} |`),
    '',
    '## 备赛计划',
    '',
    `- 可行性：${planner.feasible === true ? '可行' : planner.feasible === false ? '不可行' : '未生成'}`,
    `- 规划工期：${show(planner.total_weeks)} 周；缓冲：${show(planner.buffered_weeks)} 周`,
    `- 风险说明：${show(planner.risk_note)}`,
    '',
    ...(planner.phases ?? []).flatMap((phase: any) => [
      `### ${show(phase.week_range)} · ${show(phase.name)}`,
      '',
      ...(phase.tasks ?? []).map((task: any) => `- ${task.task}${task.output ? `（产出：${task.output}）` : ''}`),
      '',
    ]),
    '## 原文证据摘录',
    '',
    ...Object.entries(evidence).map(([field, quote]) => `- **${field}**：${String(quote)}`),
    ...(Object.keys(evidence).length ? [] : ['暂无可展示的字段证据。']),
    '',
    '## 抽取警告与缺失字段',
    '',
    `- 警告：${extraction.warnings?.length ? extraction.warnings.join('；') : '无'}`,
    `- 缺失字段：${extraction.missing_fields?.length ? extraction.missing_fields.join('、') : '无'}`,
    '',
    '> 本工具不判定赛事真伪，仅提供风险线索和核验路径。请以赛事主办方的正式通知为准。',
    '',
  ]

  return lines.join('\n')
}

export function downloadMarkdownReport(payloads: Record<string, any>, sourceType: string): void {
  const name = String(payloads.extractor?.event?.name ?? '赛事报告')
  const slug = [...name]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0
      return /[<>:"/\\|?*]/.test(character) || code < 32 || code === 127 ? '-' : character
    })
    .join('')
    .trim()
    .slice(0, 40) || '赛事报告'
  const date = new Date().toISOString().slice(0, 10)
  const file = new Blob([buildMarkdownReport(payloads, sourceType)], {
    type: 'text/markdown;charset=utf-8',
  })
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `campusrace-${slug}-${date}.md`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
