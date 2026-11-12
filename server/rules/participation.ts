export type ParticipationType = 'individual' | 'team' | 'unknown'

/**
 * 从原文和抽取结果里判断个人赛 / 团队赛。
 * 只做关键词兜底，拿不准时返回 unknown，不让模型猜。
 */
export function detectParticipation(rawText: string, event?: any): ParticipationType {
  const tracks = Array.isArray(event?.tracks)
    ? event.tracks.map((track: any) => `${track?.name ?? ''} ${track?.requirement ?? ''}`).join(' ')
    : ''
  const text = [rawText, event?.eligibility, event?.name, tracks].filter(Boolean).join(' ')

  if (/个人赛|个人参赛|单人参赛|以个人名义|个人项目|个人组/.test(text)) return 'individual'
  if (/团队赛|组队|每队|队伍|队长|小组成员|团体|三人|3\s*人|2\s*[-–—至]\s*[345]\s*人/.test(text)) {
    return 'team'
  }
  return 'unknown'
}