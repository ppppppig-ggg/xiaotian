import { callJSON } from '../llm.js'
import { EXTRACTOR_SYSTEM_PROMPT } from '../prompts/extractor.js'
import { validateExtraction } from '../validate.js'

export interface ExtractInput {
  text: string
  sourceType?: string
  publishDate?: string | null
}

function buildUserPrompt(input: ExtractInput): string {
  return `请解析以下赛事资讯，按 Schema 输出 JSON。

【来源类型】${input.sourceType ?? 'unknown'}
【发布时间】${input.publishDate ?? 'null'}
【原文】
"""
${input.text.slice(0, 6000)}
"""`
}

/**
 * 信息提取：调用模型 → 硬校验 → 不通过则带着错误重试一次 → 仍不通过就抛错。
 * 校验失败的内容绝不直接返回给前端，避免把编造数据当事实展示。
 */
export async function extract(input: ExtractInput) {
  const basePrompt = buildUserPrompt(input)
  let lastErrors: string[] = []

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const correction =
      attempt === 0
        ? ''
        : `\n\n【上一轮输出未通过校验，请修正以下问题后重新输出完整 JSON】\n${lastErrors
            .map((error) => `- ${error}`)
            .join('\n')}`

    const raw = await callJSON<Record<string, unknown>>(
      EXTRACTOR_SYSTEM_PROMPT,
      basePrompt + correction,
      { temperature: 0.1, maxTokens: 2500, retries: 0 },
    )

    const result = validateExtraction(raw, input.text)
    if (result.ok) {
      return result.data
    }

    lastErrors = result.errors
    console.warn(`[extractor] 第 ${attempt + 1} 轮校验未通过：${result.errors.join('；')}`)
  }

  throw new Error(`信息提取未通过校验：${lastErrors.join('；')}`)
}
