import { callJSON } from '../llm.js'
import { FACT_CHECK_STEPS_PROMPT } from '../prompts/fact-checker.js'
import { evaluateRisk } from '../rules/risk.js'
import { buildVerification } from '../rules/verification.js'

/**
 * 风险核查 = 确定性规则算分 + LLM 生成核验步骤。
 * 判定权在规则层，LLM 只负责把结论翻译成可执行动作；
 * LLM 挂了就回退到模板步骤，整条链路不会因此中断。
 */
export async function factCheck(extraction: any, rawText: string, sourceType = 'unknown') {
  const risk = evaluateRisk(extraction, rawText, sourceType)
  const verification = buildVerification(extraction, risk)

  let verifySteps = risk.fallback_steps
  let verdictReason = ''

  try {
    const result = await callJSON<{ verify_steps?: any[]; verdict_reason?: string }>(
      FACT_CHECK_STEPS_PROMPT,
      `【赛事信息】${JSON.stringify(extraction?.event ?? {}).slice(0, 1500)}
【规则判定】${risk.verdict}（权威度 ${risk.authority_score}）
【命中事实】${risk.known_facts.join('；') || '无'}
【风险项】${risk.risk_flags.map((f) => `${f.code}:${f.message}`).join('；') || '无'}`,
      { temperature: 0.2, maxTokens: 900 },
    )

    const steps = Array.isArray(result.verify_steps) ? result.verify_steps : []
    if (steps.length > 0) {
      verifySteps = steps.slice(0, 4).map((step: any) => ({
        action: String(step.action ?? '核验赛事信息'),
        where: String(step.where ?? '搜索引擎'),
        pass_criteria: String(step.pass_criteria ?? '信息与原文一致'),
      }))
    }
    verdictReason = String(result.verdict_reason ?? '')
  } catch (error) {
    console.warn('[fact-checker] 生成核验步骤失败，回退模板：', (error as Error).message)
  }

  return {
    verdict: risk.verdict,
    authority_score: risk.authority_score,
    risk_flags: risk.risk_flags,
    known_facts: risk.known_facts,
    matched_event_id: risk.matched_event_id,
    verify_steps: verifySteps,
    verdict_reason:
      (verdictReason || `权威度 ${risk.authority_score}，命中 ${risk.risk_flags.length} 项风险信号`) +
      (risk.risk_flags.some((flag) => flag.code === 'source_conflict')
        ? '；存在来源冲突，冲突消除前不判低风险'
        : ''),
    disclaimer: '本工具不判定赛事真假，仅提示风险与核验路径，请以主办方官方信息为准。',
    verification: verification.items,
    verification_summary: verification.summary,
    checked_at: verification.checked_at,
    score_breakdown: risk.score_breakdown,
    evidence_coverage: risk.evidence_coverage,
  }
}
