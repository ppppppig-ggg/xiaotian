import type { NodeId } from '../types'
import { NODES, SOURCE_OPTIONS } from '../types'
import { downloadMarkdownReport } from '../lib/report'

interface Props {
  finished: boolean
  running: boolean
  error: string | null
  doneCount: number
  payloads: Record<NodeId, any>
  sourceType: string
}

const VERDICT_LABEL: Record<string, string> = {
  green: '低风险',
  yellow: '待核实',
  red: '高风险',
}

const DIMENSION_LABEL: Record<string, string> = {
  skill_fit: '技能匹配',
  time_fit: '时间充裕度',
  goal_value: '目标价值',
  access_fit: '门槛可达',
}

const FIELD_LABEL: Record<string, string> = {
  name: '赛事名称',
  'event.name': '赛事名称',
  organizer: '主办方',
  'event.organizer': '主办方',
  'registration.deadline': '报名截止',
  'event.registration.deadline': '报名截止',
  'submission.deadline': '作品提交',
  'event.submission.deadline': '作品提交',
  'registration.url': '报名入口',
  'event.registration.url': '报名入口',
}

function fieldLabel(field: string) {
  return FIELD_LABEL[field] ?? field
}

export function ReportPanel({ finished, running, error, doneCount, payloads, sourceType }: Props) {
  const extractor = payloads.extractor
  const event = extractor?.event ?? {}
  const checker = payloads.fact_checker
  const matcher = payloads.matchmaker
  const planner = payloads.planner

  if (error) {
    return (
      <div className="report report-failed">
        <p className="report-kicker">决策报告</p>
        <h2 className="empty-title">这次没有跑完。</h2>
        <p className="empty-copy">{error}</p>
        <p className="empty-hint">检查服务状态后，点左侧的「开始研判」或「重试」重新发起。</p>
      </div>
    )
  }

  if (running) {
    return (
      <div className="report report-running" aria-busy="true">
        <p className="report-kicker">决策报告</p>
        <h2 className="empty-title">正在研判。</h2>
        <p className="empty-copy">
          四个节点依次进行，结果会写到这一页；中途可以看上方每个节点的状态和耗时。
        </p>
        <div
          className="run-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={NODES.length}
          aria-valuenow={doneCount}
        >
          <span style={{ width: `${(doneCount / NODES.length) * 100}%` }} />
        </div>
        <p className="run-meta">
          {doneCount} / {NODES.length} 节点完成
        </p>
      </div>
    )
  }

  if (!finished) {
    return (
      <div className="report report-empty">
        <p className="report-kicker">决策报告</p>
        <h2 className="empty-title">还差一条赛事通知。</h2>
        <p className="empty-copy">
          在左侧粘贴原文，或选一个预置样例。四个节点会依次把事实、风险、匹配和计划写在这一页。
        </p>
        <p className="empty-hint">演示模式不调用模型；实时模式的原文只用于本次研判。</p>
      </div>
    )
  }

  const isEvent = extractor?.is_event !== false
  const verdict = VERDICT_LABEL[checker?.verdict] ?? '待核实'
  const sourceLabel =
    SOURCE_OPTIONS.find((option) => option.value === sourceType)?.short ?? '未知来源'
  const registrationUrl = typeof event.registration?.url === 'string' ? event.registration.url : ''
  const safeRegistrationUrl = /^https?:\/\//i.test(registrationUrl)
  const evidenceCount = Object.keys(extractor?.evidence ?? {}).length

  return (
    <div className="report">
      <header className="report-head">
        <div className="report-head-main">
          <p className="report-kicker">决策报告</p>
          <h2 className="report-title">
            {isEvent ? (event.name ?? '未识别出赛事') : '这段内容里没有识别出赛事'}
          </h2>
          {isEvent && checker?.verdict_reason && (
            <p className="report-reason">{checker.verdict_reason}</p>
          )}
          {isEvent && (
            <div className="report-meta">
              <span className="verdict-tag" data-verdict={checker?.verdict ?? 'yellow'}>
                <i aria-hidden="true" />
                {verdict}
              </span>
              <span>来源 {sourceLabel}</span>
              <span>置信度 {Math.round((extractor?.confidence ?? 0) * 100)}%</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="text-action"
          onClick={() => downloadMarkdownReport(payloads, sourceType)}
        >
          导出 Markdown
        </button>
      </header>

      {!isEvent ? (
        <p className="report-plain">
          这段文本不像赛事通知，可能是群聊闲聊、广告或无关内容。换一条来源再试。
        </p>
      ) : (
        <>
          <div className="metrics">
            <div className="metric">
              <p className="metric-label">风险结论</p>
              <p className="metric-value" data-verdict={checker?.verdict ?? 'yellow'}>
                {verdict}
              </p>
            </div>
            <div className="metric">
              <p className="metric-label">权威度</p>
              <p className="metric-value">
                {checker ? checker.authority_score : '—'}
                <small>/100</small>
              </p>
            </div>
            <div className="metric">
              <p className="metric-label">匹配分</p>
              <p className="metric-value">
                {matcher ? matcher.fit_score : '—'}
                <small>/100</small>
              </p>
            </div>
            <div className="metric">
              <p className="metric-label">建议</p>
              <p className="metric-value metric-text">{matcher?.recommendation ?? '—'}</p>
            </div>
          </div>

          <section className="report-section">
            <h3 className="section-title">
              赛事事实
              <span className="section-rule" aria-hidden="true" />
            </h3>
            <dl className="facts">
              <dt>主办方</dt>
              <dd>{event.organizer?.join('、') || '未提供'}</dd>
              <dt>赛事级别</dt>
              <dd>{event.level || '未提供'}</dd>
              <dt>报名截止</dt>
              <dd>{event.registration?.deadline || event.registration?.raw_time_text || '未提供'}</dd>
              <dt>报名入口</dt>
              <dd>
                {safeRegistrationUrl ? (
                  <a href={registrationUrl} target="_blank" rel="noreferrer">
                    {registrationUrl}
                  </a>
                ) : (
                  registrationUrl || '未提供'
                )}
              </dd>
              <dt>作品提交</dt>
              <dd>{event.submission?.deadline || event.submission?.raw_time_text || '未提供'}</dd>
              <dt>参赛资格</dt>
              <dd>{event.eligibility || '未提供'}</dd>
              <dt>赛道</dt>
              <dd>
                {event.tracks
                  ?.map((track: any) => track.name)
                  .filter(Boolean)
                  .join('、') || '未提供'}
              </dd>
            </dl>

            {evidenceCount > 0 && (
              <details className="evidence">
                <summary>
                  原文证据
                  <span>{evidenceCount} 条</span>
                </summary>
                <div className="evidence-body">
                  {Object.entries(extractor.evidence).map(([field, quote]: [string, any]) => (
                    <div className="evidence-item" key={field}>
                      <p>{fieldLabel(field)}</p>
                      <p className="evidence-quote">“{String(quote)}”</p>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {(extractor?.warnings?.length > 0 || extractor?.missing_fields?.length > 0) && (
              <div className="report-notes">
                {extractor.warnings?.map((warning: string, index: number) => (
                  <p key={`warning-${index}`}>提示：{warning}</p>
                ))}
                {extractor.missing_fields?.length > 0 && (
                  <p>未能从原文确认：{extractor.missing_fields.join('、')}</p>
                )}
              </div>
            )}
          </section>

          <section className="report-section">
            <h3 className="section-title">
              风险与核验
              <span className="section-rule" aria-hidden="true" />
            </h3>

            {checker?.known_facts?.length > 0 && (
              <ul className="fact-list">
                {checker.known_facts.map((fact: string, index: number) => (
                  <li key={index}>{fact}</li>
                ))}
              </ul>
            )}

            {checker?.risk_flags?.length > 0 ? (
              <ul className="risk-list">
                {checker.risk_flags.map((flag: any, index: number) => (
                  <li className="risk-item" data-level={flag.level} key={index}>
                    <i aria-hidden="true" />
                    <span>{flag.message}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="report-plain">未命中风险信号。仍需以主办方官方信息为准。</p>
            )}

            {checker?.verify_steps?.length > 0 && (
              <ol className="verify-list">
                {checker.verify_steps.map((step: any, index: number) => (
                  <li className="verify-item" key={index}>
                    <div>
                      <p className="verify-action">{step.action}</p>
                      <p className="verify-meta">去哪：{step.where}</p>
                      <p className="verify-meta">通过标准：{step.pass_criteria}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="report-section">
            <h3 className="section-title">
              匹配评估
              <span className="section-rule" aria-hidden="true" />
            </h3>

            {matcher?.breakdown && (
              <div className="dimensions">
                {Object.entries(matcher.breakdown).map(([key, dimension]: [string, any]) => (
                  <div className="dimension" key={key}>
                    <div className="dimension-head">
                      <span>{DIMENSION_LABEL[key] ?? key}</span>
                      <b>{dimension.score}</b>
                    </div>
                    <div className="dimension-track">
                      <span
                        className="dimension-fill"
                        style={{ width: `${Math.max(0, Math.min(100, dimension.score))}%` }}
                      />
                    </div>
                    <p className="dimension-reason">{dimension.reason}</p>
                  </div>
                ))}
              </div>
            )}

            {matcher?.hard_blockers?.length > 0 && (
              <div className="blocker">
                <p>硬门槛</p>
                <ul>
                  {matcher.hard_blockers.map((blocker: string, index: number) => (
                    <li key={index}>{blocker}</li>
                  ))}
                </ul>
              </div>
            )}

            {matcher?.next_actions?.length > 0 && (
              <ul className="action-list">
                {matcher.next_actions.map((action: string, index: number) => (
                  <li key={index}>{action}</li>
                ))}
              </ul>
            )}
          </section>

          {planner?.phases?.length > 0 && (
            <section className="report-section">
              <h3 className="section-title">
                备赛计划
                <span className="section-rule" aria-hidden="true" />
                <span className="section-note">
                  {planner.total_weeks} 周 · 缓冲 {planner.buffered_weeks} 周
                </span>
              </h3>
              <ol className="plan">
                {planner.phases.map((phase: any, index: number) => (
                  <li className="plan-item" key={index}>
                    <span className="plan-week">{phase.week_range}</span>
                    <div>
                      <p className="plan-name">{phase.name}</p>
                      <ul className="plan-tasks">
                        {phase.tasks?.map((task: any, taskIndex: number) => (
                          <li key={taskIndex}>
                            {task.task}
                            {task.output && <span> / {task.output}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}

      <p className="report-foot">
        本工具不判定赛事真伪，仅提示风险与核验路径。报名与截止时间请以主办方官方信息为准。
      </p>
    </div>
  )
}