import type { NodeId } from '../types'

interface Props {
  finished: boolean
  payloads: Record<NodeId, any>
}

export function ReportPanel({ finished, payloads }: Props) {
  const extractor = payloads.extractor
  const checker = payloads.fact_checker
  const matcher = payloads.matchmaker
  const planner = payloads.planner

  if (!finished) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
        粘贴一段赛事资讯，点击「开始分析」
      </div>
    )
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div>
        <p className="text-xs uppercase tracking-widest text-slate-500">决策报告</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-100">
          {extractor?.event?.name ?? '未识别出赛事'}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-slate-800 p-3">
          <p className="text-slate-500">风险结论</p>
          <p className="mt-1 font-medium text-emerald-300">{checker?.verdict ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-slate-800 p-3">
          <p className="text-slate-500">匹配分</p>
          <p className="mt-1 font-medium text-sky-300">{matcher?.fit_score ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-slate-800 p-3">
          <p className="text-slate-500">建议</p>
          <p className="mt-1 font-medium text-slate-200">{matcher?.recommendation ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-slate-800 p-3">
          <p className="text-slate-500">剩余工期</p>
          <p className="mt-1 font-medium text-slate-200">{planner?.total_weeks ?? '—'} 周</p>
        </div>
      </div>

      {checker?.verify_steps?.length > 0 && (
        <div>
          <p className="text-sm font-medium text-slate-300">需要你手动核验</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-400">
            {checker.verify_steps.map((step: any, i: number) => (
              <li key={i}>
                · {step.action}（{step.where}）：{step.pass_criteria}
              </li>
            ))}
          </ul>
        </div>
      )}

      {matcher?.next_actions?.length > 0 && (
        <div>
          <p className="text-sm font-medium text-slate-300">下一步动作</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-400">
            {matcher.next_actions.map((action: string, i: number) => (
              <li key={i}>· {action}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="border-t border-slate-800 pt-3 text-xs text-slate-600">
        本工具不判定赛事真伪，仅提示风险与核验路径，请以主办方官方信息为准。
      </p>
    </div>
  )
}