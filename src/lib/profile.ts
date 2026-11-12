/** 个人画像：匹配评估的输入，存在 localStorage 里 */
export interface ProfileFormValue {
  major: string
  grade: string
  skills: string
  goal: string
  hours: number
}

export const EMPTY_PROFILE: ProfileFormValue = {
  major: '',
  grade: '',
  skills: '',
  goal: '',
  hours: 0,
}

export const PROFILE_STORAGE_KEY = 'campusrace-radar:profile'

/** 把逗号/顿号/空格分隔的技能串转成数组 */
export function parseSkills(input: string): string[] {
  return input
    .split(/[,，、\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}