import type { ProfileFormValue } from '../lib/profile'

const GRADES = ['大一', '大二', '大三', '大四', '研一', '研二', '研三']
const GOALS = ['求职', '保研', '加分', '攒作品集', '纯兴趣']

interface Props {
  value: ProfileFormValue
  onChange: (next: ProfileFormValue) => void
}

const fieldClass = 'field-control w-full px-2.5 py-2 text-xs'

export function ProfileForm({ value, onChange }: Props) {
  const update = (patch: Partial<ProfileFormValue>) => onChange({ ...value, ...patch })

  return (
    <details className="group overflow-hidden rounded-[15px] border border-white/[0.09] bg-[#071923]/45">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-xs text-[#c6d5d9] transition hover:bg-white/[0.025]">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[#76c4ed]/20 bg-[#76c4ed]/[0.07] text-[#83c9e9]" aria-hidden="true">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
              <circle cx="10" cy="6" r="3" stroke="currentColor" strokeWidth="1.3" />
              <path d="M4.5 16.5c.6-2.5 2.5-3.8 5.5-3.8s4.9 1.3 5.5 3.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block font-medium text-[#dce8eb]">我的参赛画像</span>
            <span className="mt-0.5 block truncate text-[10px] text-[#78919b]">
              {value.major ? `${value.major} · ${value.grade}` : '完善后可获得更贴合的匹配建议'}
            </span>
          </span>
        </span>
        <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-[#78919b] transition-transform group-open:rotate-180" fill="none" aria-hidden="true">
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>

      <div className="grid grid-cols-2 gap-2.5 border-t border-white/[0.07] bg-black/10 p-3.5">
        <label className="col-span-1 space-y-1.5">
          <span className="text-[11px] text-[#8ca2aa]">专业</span>
          <input
            value={value.major}
            onChange={(e) => update({ major: e.target.value })}
            placeholder="计算机科学与技术"
            className={fieldClass}
          />
        </label>

        <label className="col-span-1 space-y-1.5">
          <span className="text-[11px] text-[#8ca2aa]">年级</span>
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

        <label className="col-span-2 space-y-1.5">
          <span className="text-[11px] text-[#8ca2aa]">技能栈 <span className="text-[#607983]">· 逗号分隔</span></span>
          <input
            value={value.skills}
            onChange={(e) => update({ skills: e.target.value })}
            placeholder="React, TypeScript, Python"
            className={fieldClass}
          />
        </label>

        <label className="col-span-1 space-y-1.5">
          <span className="text-[11px] text-[#8ca2aa]">目标</span>
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

        <label className="col-span-1 space-y-1.5">
          <span className="text-[11px] text-[#8ca2aa]">每周投入 · 小时</span>
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
