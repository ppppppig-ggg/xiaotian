import type { NodeId } from '../types'
import { downloadMarkdownReport } from '../lib/report'

interface Props {
  finished: boolean
  payloads: Record<NodeId, any>
  sourceType: string
}

const VERDICT_STYLE: Record<string, { label: string; className: string }> = {
  green: { label: '低风险', className: 'text-emerald-300' },
  yellow: { label: '待核实', className: 'text-amber-300' },
  red: { label: '高风险', className: 'text-red-300' },
}

const LEVEL_STYLE: Record<string, string> = {
  high: 'border-red-500/40 text-red-300',
  medium: 'border-amber-500/40 text-amber-300',
  low: 'border-slate-600 text-slate-400',
}

const DIMENSION_LABEL: Record<string, string> = {
  skill_fit: '技能匹配',
  time_fit: '时间充裕度',
  goal_value: '目标价值',
  access_fit: '门槛可达',
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 p-2.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`mt-0.5 text-sm font-medium ${tone ?? 'text-slate-200'}`}>{value}</p>
    </div>
  )
}

export function ReportPanel({ finished, payloads, sourceType }: Props) {
  const extractor = payloads.extractor
  const event = extractor?.event ?? {}
  const checker = payloads.fact_checker
  const matcher = payloads.matchmaker
  const planner = payloads.planner

  if (!finished) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-slate-800 p-6 text-center">
        <div className="flex items-center gap-3 text-slate-700">
          <span className="text-xl">①</span>
          <span className="h-px w-6 bg-slate-800" />
          <span className="text-xl">②</span>
          <span className="h-px w-6 bg-slate-800" />
          <span className="text-xl">③</span>
          <span className="h-px w-6 bg-slate-800" />
          <span className="text-xl">④</span>
        </div>
        <p className="text-sm text-slate-500">粘贴一段赛事资讯，点击「开始分析」</p>
        <p className="max-w-[240px] text-xs leading-relaxed text-slate-600">
          四个 Agent 会依次抽取信息、核查风险、评估匹配度、倒排备赛计划，最后在这里汇总成一份决策报告。
        </p>
      </div>
    )
  }

  const isEvent = extractor?.is_event !== false
  const verdict = checker ? (VERDICT_STYLE[checker.verdict] ?? VERDICT_STYLE.yellow) : null
  const registrationUrl = typeof event.registration?.url === 'string' ? event.registration.url : ''
  const safeRegistrationUrl = /^https?:\/\//i.test(registrationUrl)

  return (
    <div className="animate-fade-in-up h-full space-y-4 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-slate-500">决策报告</p>
            <h2 className="mt-1 text-base font-semibold leading-snug text-slate-100">
              {isEvent ? (event.name ?? '未识别出赛事') : '这段内容里没有识别出赛事'}
            </h2>
            {isEvent && checker?.verdict_reason && (
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{checker.verdict_reason}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => downloadMarkdownReport(payloads, sourceType)}
            className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-sky-500/50 hover:text-sky-200"
          >
            导出报告
          </button>
        </div>
      </div>

      {!isEvent ? (
        <p className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-400">
          这段文本不像赛事通知。可以是群聊闲聊、广告或无关内容。换个来源再试试？
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
            <p className="text-xs font-medium text-slate-300">抽取到的赛事信息</p>
            <dl className="mt-2 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-xs">
              <dt className="text-slate-500">主办方</dt>
              <dd className="break-words text-slate-300">{event.organizer?.join('、') || '未提供'}</dd>
              <dt className="text-slate-500">赛事级别</dt>
              <dd className="text-slate-300">{event.level || '未提供'}</dd>
              <dt className="text-slate-500">报名截止</dt>
              <dd className="text-slate-300">{event.registration?.deadline || event.registration?.raw_time_text || '未提供'}</dd>
              <dt className="text-slate-500">报名入口</dt>
              <dd className="break-all text-sky-300">
                {safeRegistrationUrl ? (
                  <a href={registrationUrl} target="_blank" rel="noreferrer" className="underline decoration-sky-500/40 underline-offset-2">
                    {registrationUrl}
                  </a>
                ) : registrationUrl || '未提供'}
              </dd>
              <dt className="text-slate-500">作品提交</dt>
              <dd className="text-slate-300">{event.submission?.deadline || event.submission?.raw_time_text || '未提供'}</dd>
              <dt className="text-slate-500">参赛资格</dt>
              <dd className="break-words text-slate-300">{event.eligibility || '未提供'}</dd>
              <dt className="text-slate-500">赛道</dt>
              <dd className="break-words text-slate-300">
                {event.tracks?.map((track: any) => track.name).filter(Boolean).join('、') || '未提供'}
              </dd>
            </dl>
            {Object.keys(extractor?.evidence ?? {}).length > 0 && (
              <details className="mt-3 border-t border-slate-800 pt-2">
                <summary className="cursor-pointer text-[11px] text-sky-300">查看原文证据摘录</summary>
                <dl className="mt-2 space-y-2 text-[11px]">
                  {Object.entries(extractor.evidence).map(([field, quote]: [string, any]) => (
                    <div key={field}>
                      <dt className="text-slate-500">{field}</dt>
                      <dd className="mt-0.5 break-words text-slate-300">“{String(quote)}”</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            {(extractor?.warnings?.length > 0 || extractor?.missing_fields?.length > 0) && (
              <div className="mt-3 space-y-1 border-t border-slate-800 pt-2 text-[11px] text-amber-300/80">
                {extractor.warnings?.map((warning: string, index: number) => <p key={`warning-${index}`}>提示：{warning}</p>)}
                {extractor.missing_fields?.length > 0 && <p>未能从原文确认：{extractor.missing_fields.join('、')}</p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Metric label="风险结论" value={verdict?.label ?? '—'} tone={verdict?.className} />
            <Metric label="权威度" value={checker ? `${checker.authority_score}` : '—'} />
            <Metric
              label="匹配分"
              value={matcher ? `${matcher.fit_score}` : '—'}
              tone="text-sky-300"
            />
            <Metric
              label="建议"
              value={matcher?.recommendation ?? '—'}
              tone={matcher?.recommendation === '不建议' ? 'text-red-300' : 'text-slate-200'}
            />
          </div>

          {checker?.known_facts?.length > 0 && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
              <ul className="space-y-1 text-xs text-emerald-300/90">
                {checker.known_facts.map((fact: string, i: number) => (
                  <li key={i}>✓ {fact}</li>
                ))}
              </ul>
            </div>
          )}

          {checker?.risk_flags?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-300">风险提示</p>
              <ul className="mt-1.5 space-y-1.5">
                {checker.risk_flags.map((flag: any, i: number) => (
                  <li
                    key={i}
                    className={`rounded-lg border bg-slate-950/40 px-2.5 py-1.5 text-xs ${
                      LEVEL_STYLE[flag.level] ?? LEVEL_STYLE.low
                    }`}
                  >
                    {flag.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {matcher?.breakdown && (
            <div>
              <p className="text-xs font-medium text-slate-300">四维打分</p>
              <div className="mt-1.5 space-y-1.5">
                {Object.entries(matcher.breakdown).map(([key, dim]: [string, any]) => (
                  <div key={key} className="text-xs">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>{DIMENSION_LABEL[key] ?? key}</span>
                      <span className="text-slate-300">{dim.score}</span>
                    </div>
                    <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-sky-500/70"
                        style={{ width: `${Math.max(0, Math.min(100, dim.score))}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{dim.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {checker?.verify_steps?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-300">需要你手动核验</p>
              <ul className="mt-1.5 space-y-1.5 text-xs text-slate-400">
                {checker.verify_steps.map((step: any, i: number) => (
                  <li key={i} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                    <p className="text-slate-300">
                      {i + 1}. {step.action}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">去哪：{step.where}</p>
                    <p className="text-[11px] text-slate-500">通过标准：{step.pass_criteria}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {planner?.phases?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-300">
                备赛计划（{planner.total_weeks} 周 · 缓冲 {planner.buffered_weeks} 周）
              </p>
              <ul className="mt-1.5 space-y-1.5 text-xs">
                {planner.phases.map((phase: any, i: number) => (
                  <li key={i} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                    <p className="text-slate-300">
                      {phase.week_range} · {phase.name}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                      {phase.tasks?.map((task: any, j: number) => (
                        <li key={j}>
                          · {task.task}
                          {task.output && <span className="text-slate-600"> → {task.output}</span>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {matcher?.next_actions?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-300">下一步动作</p>
              <ul className="mt-1 space-y-1 text-xs text-slate-400">
                {matcher.next_actions.map((action: string, i: number) => (
                  <li key={i}>· {action}</li>
                ))}
              </ul>
            </div>
          )}

          {matcher?.hard_blockers?.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2.5">
              <p className="text-xs font-medium text-red-300">硬门槛</p>
              <ul className="mt-1 space-y-0.5 text-xs text-red-300/80">
                {matcher.hard_blockers.map((blocker: string, i: number) => (
                  <li key={i}>· {blocker}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <p className="border-t border-slate-800 pt-2.5 text-[11px] leading-relaxed text-slate-600">
        本工具不判定赛事真伪，仅提示风险与核验路径，请以主办方官方信息为准。
      </p>
    </div>
  )
}
