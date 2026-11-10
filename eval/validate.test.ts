/**
 * 防幻觉校验的单元测试。
 * 跑法：npm run test:validate
 *
 * 重点覆盖一类「看起来对、其实置空打错位置」的 bug —— 这类问题
 * 端到端跑的时候是看不出来的，因为没有报错，只是防线空转。
 */
import { validateExtraction } from '../server/validate'

const SOURCE =
  '【传智杯】第十届传智杯全国大学生计算机应用能力大赛正式启动！报名截止 2026-11-20，作品提交截止 2026-12-15。主办单位：传智教育。报名请登录官网 https://www.itcast.cn/'

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

// 1. evidence 命中：字段保留
{
  const result = validateExtraction(
    {
      is_event: true,
      event: { name: '传智杯', registration: { deadline: '2026-11-20' } },
      evidence: { name: '第十届传智杯全国大学生计算机应用能力大赛', 'registration.deadline': '报名截止 2026-11-20' },
    },
    SOURCE,
  )
  console.log('1. evidence 全部命中')
  check('校验通过', result.ok, result.errors.join('；'))
  check('日期保留', result.data.event.registration.deadline === '2026-11-20')
}

// 2. evidence 在原文找不到：字段必须被置空，且打在正确路径上
{
  const result = validateExtraction(
    {
      is_event: true,
      event: { name: '传智杯', registration: { deadline: '2026-12-31' } },
      evidence: { 'registration.deadline': '报名截止 2026-12-31' },
    },
    SOURCE,
  )
  console.log('2. evidence 编造（原文没有这个日期）')
  check('校验不通过', !result.ok)
  check(
    'event.registration.deadline 被置空',
    result.data.event.registration.deadline === null,
    `实际为 ${JSON.stringify(result.data.event.registration.deadline)}`,
  )
  check(
    '没有在错误路径上创建多余字段',
    result.data.registration === undefined,
    `实际为 ${JSON.stringify(result.data.registration)}`,
  )
}

// 3. 过短的 evidence 不具证明力
{
  const result = validateExtraction(
    {
      is_event: true,
      event: { name: '某某大赛' },
      evidence: { name: '大赛' },
    },
    SOURCE,
  )
  console.log('3. evidence 过短（两个字）')
  check('校验不通过', !result.ok)
  check('字段被置空', result.data.event.name === null)
}

// 4. 日期字段的 evidence 必须包含该日期
{
  const result = validateExtraction(
    {
      is_event: true,
      event: { name: '传智杯', submission: { deadline: '2026-12-20' } },
      evidence: { 'submission.deadline': '作品提交截止 2026-12-15' },
    },
    SOURCE,
  )
  console.log('4. 日期值不在 evidence 里（摘了别的句子）')
  check('校验不通过', !result.ok)
  check('字段被置空', result.data.event.submission.deadline === null)
}

// 5. conflicts 只有一个值
{
  const result = validateExtraction(
    {
      is_event: true,
      event: { name: '传智杯' },
      conflicts: [{ field: 'registration.deadline', values: [{ value: '2026-11-20', source_type: 'wechat' }] }],
    },
    SOURCE,
  )
  console.log('5. conflicts 只给了一个来源')
  check('校验不通过', !result.ok)
}

// 6. 日期越界
{
  const result = validateExtraction(
    {
      is_event: true,
      event: { name: '传智杯', registration: { deadline: '2010-01-01' } },
      evidence: {},
    },
    SOURCE,
  )
  console.log('6. 日期超出合理年份区间')
  check('校验不通过', !result.ok)
}

// 7. 非赛事内容
{
  const result = validateExtraction({ is_event: false, event: null, evidence: {} }, '今天食堂涨价了')
  console.log('7. 非赛事内容不报错')
  check('校验通过', result.ok, result.errors.join('；'))
}

console.log(`\n通过 ${passed}，失败 ${failed}`)
process.exit(failed === 0 ? 0 : 1)