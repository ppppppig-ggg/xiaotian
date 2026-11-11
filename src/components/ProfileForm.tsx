import type { ProfileFormValue } from '../lib/profile'

const GRADES = ['大一', '大二', '大三', '大四', '研一', '研二', '研三']
const GOALS = ['求职', '保研', '加分', '攒作品集', '纯兴趣']

interface Props {
  value: ProfileFormValue
  onChange: (next: ProfileFormValue) => void
}

export function ProfileForm({ value, onChange }: Props) {
  const update = (patch: Partial<ProfileFormValue>) => onChange({ ...value, ...patch })

  return (
    <details className="profile">
      <summary>
        <span className="profile-id">
          <span className="profile-label">参赛画像</span>
          <span className="profile-value">
            {value.major ? `${value.major} · ${value.grade}` : '未填写，匹配会偏保守'}
          </span>
        </span>
        <svg className="profile-caret" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>

      <div className="profile-body">
        <label className="field">
          <span>专业</span>
          <input
            value={value.major}
            onChange={(event) => update({ major: event.target.value })}
            placeholder="计算机科学与技术"
          />
        </label>

        <label className="field">
          <span>年级</span>
          <select value={value.grade} onChange={(event) => update({ grade: event.target.value })}>
            {GRADES.map((grade) => (
              <option key={grade}>{grade}</option>
            ))}
          </select>
        </label>

        <label className="field field-wide">
          <span>技能栈</span>
          <input
            value={value.skills}
            onChange={(event) => update({ skills: event.target.value })}
            placeholder="React, TypeScript, Python（逗号分隔）"
          />
        </label>

        <label className="field">
          <span>目标</span>
          <select value={value.goal} onChange={(event) => update({ goal: event.target.value })}>
            {GOALS.map((goal) => (
              <option key={goal}>{goal}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>每周投入 / 小时</span>
          <input
            type="number"
            min={1}
            max={80}
            value={value.hours}
            onChange={(event) => update({ hours: Number(event.target.value) || 0 })}
          />
        </label>

        <p className="profile-note">只保存在本机浏览器，不上传。</p>
      </div>
    </details>
  )
}