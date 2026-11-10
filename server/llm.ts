import 'dotenv/config'

/** 模型调用层：provider 无关，统一走 OpenAI 兼容协议 */

export class LLMError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'LLMError'
  }
}

interface CallOptions {
  temperature?: number
  maxTokens?: number
  retries?: number
  timeoutMs?: number
}

function readConfig() {
  const apiKey = process.env.LLM_API_KEY?.trim() ?? ''
  const baseUrl = (process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1').replace(/\/$/, '')
  const model = process.env.LLM_MODEL ?? 'deepseek-chat'

  if (!apiKey || apiKey.includes('在这里填')) {
    throw new LLMError('未配置 LLM_API_KEY，请在 .env 中填入真实的 API Key')
  }

  return { apiKey, baseUrl, model }
}

/** 模型偶尔会用 ```json 包裹，或前后带说明文字，这里做一次宽松解析 */
function parseLooseJson(content: string): unknown {
  const trimmed = content.trim()
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  try {
    return JSON.parse(withoutFence)
  } catch {
    const start = withoutFence.indexOf('{')
    const end = withoutFence.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(withoutFence.slice(start, end + 1))
    }
    throw new LLMError('模型输出不是合法 JSON')
  }
}

/** 调用模型并返回解析后的 JSON 对象；失败时把错误回灌重试一次 */
export async function callJSON<T>(system: string, user: string, options: CallOptions = {}): Promise<T> {
  const { apiKey, baseUrl, model } = readConfig()
  const retries = options.retries ?? 1
  const timeoutMs = options.timeoutMs ?? 45_000

  let lastError: unknown
  let prompt = user

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const startedAt = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
          temperature: options.temperature ?? 0.1,
          max_tokens: options.maxTokens ?? 2048,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const text = (await response.text()).slice(0, 300)
        throw new LLMError(`模型接口返回 HTTP ${response.status}：${text}`)
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
        usage?: { total_tokens?: number }
      }

      const content = payload.choices?.[0]?.message?.content ?? ''
      if (!content) throw new LLMError('模型返回内容为空')

      const parsed = parseLooseJson(content)
      console.log(
        `[llm] model=${model} attempt=${attempt + 1} tokens=${payload.usage?.total_tokens ?? '?'} 耗时=${Date.now() - startedAt}ms`,
      )
      return parsed as T
    } catch (error) {
      lastError = error
      console.warn(`[llm] 第 ${attempt + 1} 次调用失败：${(error as Error).message}`)
      if (attempt < retries) {
        // 把失败原因回灌，要求模型重来
        prompt = `${user}\n\n【重要】上一次你的输出无法解析为合法 JSON，错误信息：${
          (error as Error).message
        }。请只输出一个合法的 JSON 对象，不要任何解释文字。`
      }
    } finally {
      clearTimeout(timer)
    }
  }

  throw new LLMError('模型调用失败', lastError)
}