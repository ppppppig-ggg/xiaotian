/**
 * 把 SSE 响应流的分片解析成事件对象。
 * 返回一个「喂分片」的函数，保持纯逻辑、方便单测。
 */
export function createSseParser(onEvent: (event: unknown) => void) {
  let buffer = ''

  return (chunk: string) => {
    buffer += chunk

    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const rawEvent = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)

      for (const line of rawEvent.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue

        const data = trimmed.slice(5).trim()
        if (!data) continue

        try {
          onEvent(JSON.parse(data))
        } catch {
          // 单个坏事件不应该打断整条流
        }
      }

      boundary = buffer.indexOf('\n\n')
    }
  }
}