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
  demo?: boolean
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

const PARTICIPATION_LABEL: Record<string, string> = {
  individual: '个人赛',
  team: '团队赛',
  unknown: '参赛形式未识别',
}

const VERIFY_LABEL: Record<string, string> = {
  verified: '已核对',
  conflict: '有冲突',
  missing: '无来源',
  unverified: '待核验',
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

function formatTime(iso?: string | null) {
  if (!iso) return ''
  const time = new Date(iso)
  if (Number.isNaN(time.getTime())) return ''
  return time.toLocaleString('zh-CN', { hour12: false })
}

export function ReportPanel({ finished, running, error, doneCount, payloads, sourceType, demo = false }: Props) {
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

  const verification: any[] = Array.isArray(checker?.verification) ? checker.verification : []
  const verificationSummary = checker?.verification_summary ?? {}
  const participation =
    matcher?.participation_type ?? planner?.participation_type ?? 'unknown'
  const participationLabel = PARTICIPATION_LABEL[participation] ?? PARTICIPATION_LABEL.unknown
  const fitScore = typeof matcher?.fit_score === 'number' ? matcher.fit_score : null
  const milestones: any[] = Array.isArray(planner?.milestones) ? planner.milestones : []

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
              <span>{participationLabel}</span>
              <span>置信度 {Math.round((extractor?.confidence ?? 0) * 100)}%</span>
              {demo && <span className="demo-tag">演示样例</span>}
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
                {fitScore === null ? (
                  <span className="metric-pending">待补充</span>
                ) : (
                  <>
                    {fitScore}
                    <small>/100</small>
                  </>
                )}
              </p>
            </div>
            <div className="metric">
              <p className="metric-label">建议</p>
              <p className="metric-value metric-text">{matcher?.recommendation ?? '—'}</p>
            </div>
          </div>

          {matcher?.profile_incomplete && (
            <p className="match-note">
              画像为空，匹配分与建议暂停：先在左侧填写专业、年级、技能栈、目标和每周投入，再重新研判。
            </p>
          )}
          {!matcher?.profile_incomplete && matcher?.score_note && (
            <p className="match-note">{matcher.score_note}</p>
          )}

          {checker?.score_breakdown?.length > 0 && (
            <details className="basis">
              <summary>
                查看风险判定依据
                <span>
                  {checker.evidence_coverage?.covered ?? 0}/
                  {checker.evidence_coverage?.total ?? 5} 项有原文证据
                </span>
              </summary>
              <div className="basis-body">
                <div className="basis-head">
                  <span>权威度 {checker.authority_score} / 100</span>
                  {checker.checked_at && <span>核验时间 {formatTime(checker.checked_at)}</span>}
                </div>
                <ul className="basis-list">
                  {checker.score_breakdown.map((item: any, index: number) => (
                    <li key={`${item.label}-${index}`}>
                      <span>{item.label}</span>
                      <b data-delta={item.delta > 0 ? 'plus' : item.delta < 0 ? 'minus' : 'zero'}>
                        {item.delta > 0 ? `+${item.delta}` : item.delta === 0 ? '—' : item.delta}
                      </b>
                      {item.note && <em>{item.note}</em>}
                    </li>
                  ))}
                </ul>
                {checker.evidence_coverage?.missing?.length > 0 && (
                  <p className="basis-missing">
                    缺少原文证据：{checker.evidence_coverage.missing.join('、')}
                  </p>
                )}
                <p className="basis-legal">
                  白名单只覆盖本地收录赛事；未命中时最高判为待核实，规则上限不能被正向项抵消。
                </p>
              </div>
            </details>
          )}

          {verification.length > 0 && (
            <section className="report-section">
              <h3 className="section-title">
                五项核验
                <span className="section-rule" aria-hidden="true" />
                <span className="section-note">
                  {verificationSummary.verified ?? 0} 已核对 · {verificationSummary.conflict ?? 0} 冲突 ·{' '}
                  {verificationSummary.missing ?? 0} 无来源 · {verificationSummary.unverified ?? 0} 待核验
                </span>
              </h3>
              <ul className="verify-facts">
                {verification.map((item: any) => (
                  <li className="verify-fact" data-status={item.status} key={item.key}>
                    <span className="verify-status">
                      {VERIFY_LABEL[item.status] ?? item.status}
                    </span>
                    <div>
                      <p className="verify-fact-label">
                        {item.label}
                        <b>{item.value}</b>
                      </p>
                      <p className="verify-fact-source">{item.source}</p>
                      <p className="verify-fact-note">{item.note}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="verify-legal">
                「已核对」= 原文有逐字证据且命中本地白名单；不代表主办方实时认证。
              </p>
            </section>
          )}

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
              <>
                <p className="verify-steps-label">需要你手动完成</p>
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
              </>
            )}
          </section>

          <section className="report-section">
            <h3 className="section-title">
              匹配评估
              <span className="section-rule" aria-hidden="true" />
              <span className="section-note">{participationLabel}</span>
            </h3>

            {matcher?.profile_incomplete ? (
              <div className="match-pending">
                <p>画像为空，匹配分暂不计算。</p>
                <p>
                  填写左侧「参赛画像」后重新研判，系统会按技能 40% / 时间 30% / 目标 20% /
                  门槛 10% 重算，不会用默认画像硬凑高分。
                </p>
              </div>
            ) : (
              <>
                <p className="match-formula">
                  {matcher?.score_formula ?? '技能 40% + 时间 30% + 目标 20% + 门槛 10%'}
                  {fitScore !== null && <span>加权合计 {fitScore} / 100</span>}
                </p>

                {matcher?.breakdown && (
                  <div className="dimensions">
                    {Object.entries(matcher.breakdown).map(([key, dimension]: [string, any]) => {
                      const score = typeof dimension.score === 'number' ? dimension.score : null
                      const weight = typeof dimension.weight === 'number' ? dimension.weight : null
                      return (
                        <div className="dimension" key={key}>
                          <div className="dimension-head">
                            <span>{DIMENSION_LABEL[key] ?? key}</span>
                            <b>{score === null ? '待补充' : score}</b>
                          </div>
                          <div className="dimension-track">
                            <span
                              className="dimension-fill"
                              style={{ width: `${score === null ? 0 : Math.max(0, Math.min(100, score))}%` }}
                            />
                          </div>
                          <p className="dimension-meta">
                            {weight !== null && <>权重 {Math.round(weight * 100)}%</>}
                            {weight !== null && typeof dimension.contribution === 'number' && <> · </>}
                            {typeof dimension.contribution === 'number' && (
                              <>贡献 {dimension.contribution}</>
                            )}
                            {dimension.reason && <> · {dimension.reason}</>}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
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
              <>
                <p className="action-label">下一步</p>
                <ul className="action-list">
                  {matcher.next_actions.map((action: string, index: number) => (
                    <li key={index}>{action}</li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {planner?.phases?.length > 0 && (
            <section className="report-section">
              <h3 className="section-title">
                备赛计划
                <span className="section-rule" aria-hidden="true" />
                <span className="section-note">
                  {PARTICIPATION_LABEL[planner.participation_type] ?? participationLabel} ·{' '}
                  {planner.total_weeks} 周 · 缓冲 {planner.buffered_weeks} 周
                </span>
              </h3>

              {planner.plan_warnings?.map((warning: string, index: number) => (
                <p className="plan-warning" key={`plan-warning-${index}`}>
                  {warning}
                </p>
              ))}

              <ol className="plan">
                {planner.phases.map((phase: any, index: number) => (
                  <li className="plan-item" key={index}>
                    <span className="plan-week">{phase.week_range}</span>
                    <div>
                      <p className="plan-name">{phase.name}</p>
                      <ul className="plan-tasks">
                        {phase.tasks?.map((task: any, taskIndex: number) => (
                          <li className="plan-task" key={taskIndex}>
                            <div className="plan-task-head">
                              <span className="plan-task-name">{task.task}</span>
                              {task.status && (
                                <span className="plan-task-status">{task.status}</span>
                              )}
                            </div>
                            <p className="plan-task-meta">
                              {task.owner && <span>负责人 {task.owner}</span>}
                              {task.due && <span>时间 {task.due}</span>}
                            </p>
                            {task.output && (
                              <p className="plan-task-line">成果物：{task.output}</p>
                            )}
                            {task.acceptance && (
                              <p className="plan-task-line">验收：{task.acceptance}</p>
                            )}
                            {Array.isArray(task.depends_on) && task.depends_on.length > 0 && (
                              <p className="plan-task-line">依赖：{task.depends_on.join('、')}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                ))}
              </ol>

              {milestones.length > 0 && (
                <div className="plan-milestones">
                  <p className="action-label">里程碑</p>
                  <ul>
                    {milestones.map((milestone: any, index: number) => (
                      <li key={index}>
                        {milestone.due && <span>{milestone.due}</span>}
                        {milestone.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {planner?.risk_note && <p className="plan-risk">{planner.risk_note}</p>}
        </>
      )}

      <p className="report-foot">
        本工具不判定赛事真伪，仅提示风险与核验路径。报名与截止时间请以主办方官方信息为准。
      </p>
    </div>
  )
}