import { MAX_TEXT_CHARS } from '../types'

export interface PdfExtractResult {
  text: string
  pages: number
  truncated: boolean
  chars: number
}

const MAX_PAGES = 40

/**
 * 在浏览器里解析 PDF 文本，文件不会上传到服务端。
 * 只抽取可读文字；扫描件（纯图片）提取不到内容，会得到空字符串。
 */
export async function extractPdfText(file: File): Promise<PdfExtractResult> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data })
  const doc = await loadingTask.promise
  const pageCount = doc.numPages
  const limit = Math.min(pageCount, MAX_PAGES)

  const chunks: string[] = []
  let total = 0

  try {
    for (let index = 1; index <= limit; index += 1) {
      const page = await doc.getPage(index)
      const content = await page.getTextContent()
      let pageText = ''

      for (const item of content.items) {
        if (!('str' in item)) continue
        pageText += item.str
        pageText += (item as { hasEOL?: boolean }).hasEOL ? '\n' : ' '
      }

      pageText = pageText
        .replace(/[ \t]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

      if (pageText) {
        chunks.push(pageText)
        total += pageText.length
      }

      page.cleanup()

      if (total > MAX_TEXT_CHARS + 1200) break
    }
  } finally {
    await loadingTask.destroy()
  }

  const joined = chunks.join('\n\n').trim()
  return {
    text: joined.slice(0, MAX_TEXT_CHARS).trim(),
    pages: pageCount,
    truncated: joined.length > MAX_TEXT_CHARS,
    chars: joined.length,
  }
}