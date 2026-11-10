// 把 Markdown 转成排版好的 HTML，再用 Edge 无头模式打印成 PDF。
// 不依赖任何 npm 包，中文用系统字体渲染。
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
}

/** 极简 Markdown 解析：标题、段落、列表、代码块、表格、引用、分隔线 */
function parse(markdown) {
  const lines = markdown.split(/\r?\n/)
  const out = []
  let index = 0

  const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line)
  const isTableSeparator = (line) => /^\s*\|[\s:|-]+\|\s*$/.test(line)

  while (index < lines.length) {
    const line = lines[index]

    // 代码块
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim()
      const buffer = []
      index += 1
      while (index < lines.length && !/^```/.test(lines[index])) {
        buffer.push(lines[index])
        index += 1
      }
      index += 1
      out.push(`<pre data-lang="${lang}"><code>${escapeHtml(buffer.join('\n'))}</code></pre>`)
      continue
    }

    // 分隔线
    if (/^\s*---\s*$/.test(line)) {
      out.push('<hr/>')
      index += 1
      continue
    }

    // 标题
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      index += 1
      continue
    }

    // 表格
    if (isTableRow(line)) {
      const rows = []
      while (index < lines.length && isTableRow(lines[index])) {
        if (!isTableSeparator(lines[index])) rows.push(lines[index])
        index += 1
      }
      const cells = (row) =>
        row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => inline(cell.trim()))

      const [head, ...body] = rows
      const thead = `<thead><tr>${cells(head)
        .map((cell) => `<th>${cell}</th>`)
        .join('')}</tr></thead>`
      const tbody = `<tbody>${body
        .map((row) => `<tr>${cells(row).map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
        .join('')}</tbody>`
      out.push(`<table>${thead}${tbody}</table>`)
      continue
    }

    // 引用
    if (/^\s*>/.test(line)) {
      const buffer = []
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        buffer.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      out.push(`<blockquote>${buffer.map((item) => `<p>${inline(item)}</p>`).join('')}</blockquote>`)
      continue
    }

    // 无序列表
    if (/^\s*[-*]\s+/.test(line)) {
      const items = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ''))
        index += 1
      }
      out.push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`)
      continue
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = []
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ''))
        index += 1
      }
      out.push(`<ol>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ol>`)
      continue
    }

    // 空行
    if (!line.trim()) {
      index += 1
      continue
    }

    // 段落
    const buffer = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,4})\s/.test(lines[index]) &&
      !/^```/.test(lines[index]) &&
      !isTableRow(lines[index]) &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index]) &&
      !/^\s*>/.test(lines[index]) &&
      !/^\s*---\s*$/.test(lines[index])
    ) {
      buffer.push(lines[index])
      index += 1
    }
    out.push(`<p>${inline(buffer.join(' '))}</p>`)
  }

  return out.join('\n')
}

const CSS = `
@page { size: A4; margin: 16mm 15mm 15mm 15mm; }
* { box-sizing: border-box; }
body {
  font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
  font-size: 10.5pt; line-height: 1.75; color: #1f2933; margin: 0;
}
h1 { font-size: 21pt; margin: 0 0 6pt; padding-bottom: 6pt; border-bottom: 2pt solid #2b6cb0; color: #12335c; }
h2 { font-size: 15pt; margin: 20pt 0 8pt; padding-left: 8pt; border-left: 4pt solid #2b6cb0; color: #12335c; page-break-after: avoid; }
h3 { font-size: 12pt; margin: 13pt 0 5pt; color: #1a4a7a; page-break-after: avoid; }
h4 { font-size: 11pt; margin: 10pt 0 4pt; color: #1a4a7a; page-break-after: avoid; }
p { margin: 5pt 0; text-align: justify; }
ul, ol { margin: 5pt 0 5pt 0; padding-left: 18pt; }
li { margin: 2pt 0; }
strong { color: #0f2c4a; }
code { font-family: Consolas, "Courier New", monospace; font-size: 9pt; background: #eef2f6; padding: 1pt 3pt; border-radius: 2pt; color: #b83280; }
pre { background: #f6f8fa; border: 0.6pt solid #d8dee4; border-radius: 3pt; padding: 7pt 9pt; margin: 7pt 0; page-break-inside: avoid; overflow-wrap: break-word; }
pre code { background: none; padding: 0; color: #24292f; font-size: 8.6pt; line-height: 1.55; white-space: pre-wrap; }
table { width: 100%; border-collapse: collapse; margin: 7pt 0; font-size: 9.2pt; page-break-inside: auto; }
th, td { border: 0.6pt solid #cbd5e0; padding: 3.5pt 5pt; vertical-align: top; text-align: left; }
thead th { background: #e8eef5; font-weight: 600; color: #12335c; }
tbody tr:nth-child(even) { background: #fafbfc; }
tr { page-break-inside: avoid; }
blockquote { margin: 7pt 0; padding: 5pt 10pt; background: #f7f9fb; border-left: 3pt solid #a0aec0; color: #4a5568; }
blockquote p { margin: 2pt 0; }
hr { border: none; border-top: 0.6pt solid #e2e8f0; margin: 12pt 0; }
a { color: #2b6cb0; text-decoration: none; word-break: break-all; }
`

function buildHtml(markdown, title) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
${parse(markdown)}
</body>
</html>`
}

// ---- 主流程 ----
const [, , inputArg, outputArg] = process.argv
if (!inputArg || !outputArg) {
  console.error('用法: node tools/docs/md2pdf.mjs <input.md> <output.pdf>')
  process.exit(1)
}

const inputPath = resolve(inputArg)
const outputPath = resolve(outputArg)
const markdown = readFileSync(inputPath, 'utf-8')

const title = (markdown.match(/^#\s+(.*)$/m)?.[1] ?? '文档').trim()
const html = buildHtml(markdown, title)

const htmlPath = outputPath.replace(/\.pdf$/i, '.html')
writeFileSync(htmlPath, html, 'utf-8')
console.log(`HTML 已生成：${htmlPath}`)

const edge = EDGE_CANDIDATES.find((candidate) => existsSync(candidate))
if (!edge) {
  console.error('未找到 Edge，可用浏览器手动打开 HTML 打印为 PDF')
  process.exit(1)
}

execFileSync(edge, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--no-pdf-header-footer',
  `--print-to-pdf=${outputPath}`,
  pathToFileURL(htmlPath).href,
], { stdio: 'inherit' })

console.log(`PDF 已生成：${outputPath}`)