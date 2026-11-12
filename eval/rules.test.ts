/**
 * 规则层单元测试：截止时间边界、匹配分重算、冲突不判低风险、五项核验。
 * 跑法：npm run test:rules（或 npm test 一次跑全部）
 */
import { evaluateRisk } from '../server/rules/risk'
import { evaluateDeadline } from '../server/rules/time'
import { computeWeightedScore } from '../server/rules/score'
import { buildVerification } from '../server/rules/verification'
import { detectParticipation } from '../server/rules/participation'
import { match } from '../server/agents/matchmaker'
import { buildPlanCalendar } from '../src/lib/calendar'

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1
    console.log(`  ✅ ${name}`)
  } else {
    failed += 1
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// 1. 截止时间前后 1 分钟的边界
{
  const now = new Date('2026-11-11T12:00:00Z').getTime()
  const before = new Date(now + 60_000).toISOString()
  const after = new Date(now - 60_000).toISOString()
  console.log('1. 截止时间边界（前 1 分钟 / 后 1 分钟）')
  check('截止前 1 分钟未过期', evaluateDeadline(before, now).expired === false)
  check('截止后 1 分钟已过期', evaluateDeadline(after, now).expired === true)
  check('截止后剩余周数为 0', evaluateDeadline(after, now).weeksLeft === 0)
}

// 2. 匹配总分按 40/30/20/10 重算
{
  const result = computeWeightedScore({
    skill_fit: { score: 80 },
    time_fit: { score: 70 },
    goal_value: { score: 60 },
    access_fit: { score: 50 },
  })
  console.log('2. 匹配分重算')
  check('总分 = 70', result.total === 70, `实际 ${result.total}`)
  check('技能贡献 = 32', result.contributions.skill_fit === 32)
  check('门槛贡献 = 5', result.contributions.access_fit === 5)
  check(
    '非法分项按 0 计',
    computeWeightedScore({ skill_fit: { score: 120 }, time_fit: { score: 'x' } }).total === 40,
  )
}

// 3. 白名单命中但有来源冲突：不得判低风险
{
  const extraction = {
    is_event: true,
    event: {
      name: '传智杯',
      organizer: ['传智教育'],
      registration: { deadline: '2026-12-01', url: 'https://www.itcast.cn/' },
      submission: { deadline: '2026-12-15' },
    },
    conflicts: [
      {
        field: 'registration.deadline',
        values: [
          { value: '2026-12-01', source_type: 'official_site' },
          { value: '2026-11-20', source_type: 'wechat' },
        ],
      },
    ],
    evidence: {
      name: '传智杯',
      'registration.deadline': '报名截止 2026-12-01',
      'registration.url': 'https://www.itcast.cn/',
    },
  }
  const risk = evaluateRisk(extraction, '传智杯 报名截止 2026-12-01 官网 https://www.itcast.cn/', 'wechat')
  console.log('3. 白名单 + 冲突')
  check('不是低风险', risk.verdict !== 'green', risk.verdict)
  check('权威度被压到 79', risk.authority_score === 79, `实际 ${risk.authority_score}`)
  check('有规则上限说明', risk.score_breakdown.some((item) => item.label === '规则上限'))
  check('有冲突标记', risk.risk_flags.some((flag) => flag.code === 'source_conflict'))
}

// 4. 五项核验：冲突项要单独标出来
{
  const extraction = {
    is_event: true,
    event: {
      name: '传智杯',
      organizer: ['传智教育'],
      registration: { deadline: '2026-12-01', url: 'https://www.itcast.cn/' },
      submission: { deadline: '2026-12-15' },
      eligibility: '全国大学生',
    },
    conflicts: [
      {
        field: 'registration.deadline',
        values: [
          { value: '2026-12-01', source_type: 'official_site' },
          { value: '2026-11-20', source_type: 'wechat' },
        ],
      },
    ],
    evidence: {
      name: '传智杯',
      organizer: '主办单位：传智教育',
      'registration.deadline': '报名截止 2026-12-01',
      'registration.url': 'https://www.itcast.cn/',
      eligibility: '全国大学生',
    },
  }
  const risk = evaluateRisk(extraction, '传智杯 报名截止 2026-12-01', 'wechat')
  const verification = buildVerification(extraction, risk)
  console.log('4. 五项核验清单')
  check('共 5 项', verification.items.length === 5)
  check(
    '截止时间标为冲突',
    verification.items.find((item) => item.key === 'deadline')?.status === 'conflict',
  )
  check(
    '截止行同时列出报名与提交',
    /报名/.test(verification.items.find((item) => item.key === 'deadline')?.value ?? '') &&
      /提交/.test(verification.items.find((item) => item.key === 'deadline')?.value ?? ''),
  )
  check('冲突计数 >= 1', verification.summary.conflict >= 1)
  check('有核验时间', !Number.isNaN(new Date(verification.checked_at).getTime()))
}

// 5. 已截止：直接判高风险
{
  const extraction = {
    is_event: true,
    event: {
      name: '传智杯',
      organizer: ['传智教育'],
      registration: { deadline: '2020-01-01', url: 'https://www.itcast.cn/' },
      submission: { deadline: '2020-01-02' },
    },
    evidence: {},
  }
  const risk = evaluateRisk(extraction, '传智杯', 'official_site')
  console.log('5. 已截止赛事')
  check('判为高风险', risk.verdict === 'red', risk.verdict)
  check('权威度 <= 59', risk.authority_score <= 59, `实际 ${risk.authority_score}`)
}

// 6. 空画像：不得输出匹配分与推荐档位
{
  const result = await match({ name: '测试赛事' }, {}, 'individual')
  console.log('6. 空画像匹配')
  check('匹配分为 null', result.fit_score === null)
  check('推荐为待补充', result.recommendation === '待补充')
  check('标记画像不完整', result.profile_incomplete === true)
  check('四个维度都不给分', Object.values(result.breakdown).every((item: any) => item.score === null))
}

// 7. 个人赛 / 团队赛识别
{
  console.log('7. 参赛形式识别')
  check('个人赛', detectParticipation('本次比赛为个人赛，单人提交作品') === 'individual')
  check('团队赛', detectParticipation('每队 3 人，可跨专业组队') === 'team')
  check('没有线索时为 unknown', detectParticipation('报名截止下周三') === 'unknown')
}

// 8. 日历导出：任务与里程碑都生成 VEVENT
{
  const ics = buildPlanCalendar(
    {
      phases: [
        {
          week_range: 'W1',
          tasks: [
            {
              task: '做原型',
              owner: '我',
              due: 'W1',
              output: '可演示页面',
              acceptance: '能完成一次完整流程',
            },
          ],
        },
      ],
      milestones: [{ label: '演示', due: 'W2' }],
    },
    '测试赛事',
    new Date('2026-11-12T00:00:00+08:00'),
  )
  console.log('8. 日历导出')
  check('包含 VCALENDAR', ics.startsWith('BEGIN:VCALENDAR') && ics.endsWith('END:VCALENDAR'))
  check('生成 2 个事件', (ics.match(/BEGIN:VEVENT/g) || []).length === 2)
  check('任务落在周一', ics.includes('DTSTART;VALUE=DATE:20261109'))
  check('包含任务摘要', ics.includes('SUMMARY:备赛：做原型'))
  check('空计划返回空串', buildPlanCalendar({ phases: [] }) === '')
}

console.log(`\n通过 ${passed}，失败 ${failed}`)
process.exit(failed === 0 ? 0 : 1)