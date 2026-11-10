import type { ProfileFormValue } from '../lib/profile'

const GRADES = ['大一', '大二', '大三', '大四', '研一', '研二', '研三']
const GOALS = ['求职', '保研', '加分', '攒作品集', '纯兴趣']

interface Props {
  value: ProfileFormValue
  onChange: (next: ProfileFormValue) => void
}

const fieldClass =
  'w-full rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1 text-xs text-slate-200 outline-none focus:border-sky-600'

export function ProfileForm({ value, onChange }: Props) {
  const update = (patch: Partial<ProfileFormValue>) => onChange({ ...value, ...patch })

  return (
    <details className="group rounded-xl border border-slate-800 bg-slate-900/40">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs text-slate-400">
        <span>
          我的画像
          <span className="ml-2 text-slate-600">
            {value.major ? `${value.major} · ${value.grade}` : '未填写（影响匹配准确度）'}
          </span>
        </span>
        <span className="text-slate-600 transition group-open:rotate-180">▾</span>
      </summary>

      <div className="grid grid-cols-2 gap-2 border-t border-slate-800 p-3">
        <label className="col-span-1 space-y-1">
          <span className="text-[11px] text-slate-500">专业</span>
          <input
            value={value.major}
            onChange={(e) => update({ major: e.target.value })}
            placeholder="计算机科学与技术"
            className={fieldClass}
          />
        </label>

        <label className="col-span-1 space-y-1">
          <span className="text-[11px] text-slate-500">年级</span>
          <select
            value={value.grade}
            onChange={(e) => update({ grade: e.target.value })}
            className={fieldClass}
          >
            {GRADES.map((grade) => (
              <option key={grade}>{grade}</option>
            ))}
          </select>
        </label>

        <label className="col-span-2 space-y-1">
          <span className="text-[11px] text-slate-500">技能栈（逗号分隔）</span>
          <input
            value={value.skills}
            onChange={(e) => update({ skills: e.target.value })}
            placeholder="React, TypeScript, Python"
            className={fieldClass}
          />
        </label>

        <label className="col-span-1 space-y-1">
          <span className="text-[11px] text-slate-500">目标</span>
          <select
            value={value.goal}
            onChange={(e) => update({ goal: e.target.value })}
            className={fieldClass}
          >
            {GOALS.map((goal) => (
              <option key={goal}>{goal}</option>
            ))}
          </select>
        </label>

        <label className="col-span-1 space-y-1">
          <span className="text-[11px] text-slate-500">每周可投入(小时)</span>
          <input
            type="number"
            min={1}
            max={80}
            value={value.hours}
            onChange={(e) => update({ hours: Number(e.target.value) || 0 })}
            className={fieldClass}
          />
        </label>
      </div>
    </details>
  )
}