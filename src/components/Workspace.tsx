import { useRef, useState } from 'react'
import { Brand } from './Brand'
import { NodeCard } from './NodeCard'
import { ProfileForm } from './ProfileForm'
import { ReportPanel } from './ReportPanel'
import type { ProfileFormValue } from '../lib/profile'
import { extractPdfText } from '../lib/pdf'
import {
  MAX_TEXT_CHARS,
  NODES,
  SAMPLES,
  SOURCE_OPTIONS,
  type AnalysisState,
  type AppMode,
  type NodeId,
  type Sample,
  type SourceType,
} from '../types'
import './workspace.css'

interface Props {
  revealed: boolean
  mode: AppMode
  text: string
  sourceType: SourceType
  sampleId: string | null
  profile: ProfileFormValue
  state: AnalysisState
  running: boolean
  doneCount: number
  onText: (value: string) => void
  onSource: (value: SourceType) => void
  onSample: (sample: Sample) => void
  onClear: () => void
  onProfile: (value: ProfileFormValue) => void
  onAnalyze: () => void
  onReturn: () => void
}

const MODE_LABEL: Record<AppMode, string> = {
  checking: '正在连接',
  mock: '安全演示',
  live: '实时模型',
  offline: '服务未连接',
}

const MODE_TITLE: Record<AppMode, string> = {
  checking: '正在检查本地服务状态。',
  mock: '演示模式只回放预置样例，不调用外部模型。',
  live: '实时模式会把原文发送给 .env 中配置的模型服务。',
  offline: '未连接后端服务，请先运行 npm run dev。',
}

const MODE_NOTE: Record<AppMode, string> = {
  checking: '正在检查服务状态，确认后即可开始研判。',
  mock: '演示模式只回放四个预置样例，不消耗模型额度。',
  live: '原文仅用于本次研判，不做持久化存储。',
  offline: '后端未连接，先启动 npm run dev 再试。',
}

export function Workspace({
  revealed,
  mode,
  text,
  sourceType,
  sampleId,
  profile,
  state,
  running,
  doneCount,
  onText,
  onSource,
  onSample,
  onClear,
  onProfile,
  onAnalyze,
  onReturn,
}: Props) {
  const canAnalyze =
    Boolean(text.trim()) &&
    !running &&
    mode !== 'offline' &&
    mode !== 'checking' &&
    (mode !== 'mock' || Boolean(sampleId))

  const inputNote =
    mode === 'mock' && text.trim() && !sampleId
      ? '演示模式只回放预置样例；导入或手写的内容需要切到实时模式才能分析。'
      : MODE_NOTE[mode]

  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importNote, setImportNote] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  const [dragging, setDragging] = useState(false)

  const importFile = async (file?: File) => {
    if (!file || importing) return

    setImportNote(null)
    if (file.size > 20 * 1024 * 1024) {
      setImportNote({ text: '文件超过 20MB，换一个小一点的再试。', tone: 'error' })
      return
    }

    setImporting(true)
    try {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        const result = await extractPdfText(file).catch((error) => {
          if (import.meta.env.DEV) console.error('[pdf]', error)
          throw new Error('PDF 读取失败：文件可能损坏、加密，或不是标准 PDF。')
        })
        if (!result.text) {
          throw new Error('没有提取到可读文字，可能是扫描版 PDF。请粘贴 OCR 文本。')
        }
        onText(result.text)
        setImportNote({
          text: `已从 ${result.pages} 页 PDF 提取 ${result.chars.toLocaleString()} 字${
            result.truncated ? '，已截取前 6000 字' : ''
          }`,
          tone: 'ok',
        })
      } else if (file.type.startsWith('text/') || /\.(txt|md|markdown)$/i.test(file.name)) {
        const cleaned = (await file.text()).slice(0, MAX_TEXT_CHARS).trim()
        if (!cleaned) throw new Error('这个文件是空的。')
        onText(cleaned)
        setImportNote({ text: `已导入 ${cleaned.length.toLocaleString()} 字`, tone: 'ok' })
      } else {
        throw new Error('只支持 PDF、TXT、Markdown。')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取失败，请重试。'
      setImportNote({
        text: message.length > 120 ? `${message.slice(0, 120)}…` : message,
        tone: 'error',
      })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className={`workspace${revealed ? ' is-revealed' : ''}`} inert={!revealed}>
      <header className="appbar">
        <Brand compact />
        <div className="appbar-right">
          <span className="mode" data-mode={mode} title={MODE_TITLE[mode]}>
            <i aria-hidden="true" />
            {MODE_LABEL[mode]}
          </span>
          <button type="button" className="ghost" onClick={onReturn}>
            返回封面
          </button>
        </div>
      </header>

      <div className="workspace-body">
        <section className="zone input-zone" aria-labelledby="input-title">
          <div className="zone-head">
            <p className="zone-kicker">你的输入</p>
            <h2 id="input-title" className="zone-title">
              赛事原文
            </h2>
            <p className="zone-sub">粘贴公众号推文、群聊记录或海报识别文本。</p>
          </div>

          <ProfileForm value={profile} onChange={onProfile} />

          <div className="source-row">
            <label htmlFor="source-type">信息来源</label>
            <select
              id="source-type"
              className="select"
              value={sourceType}
              onChange={(event) => onSource(event.target.value as SourceType)}
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="import-row">
            <button
              type="button"
              className="import-btn"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
            >
              <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M7 9V2.2M4.4 4.6 7 2l2.6 2.6M2 9.4v1.8c0 .6.4 1 1 1h8c.6 0 1-.4 1-1V9.4"
                  stroke="currentColor"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {importing ? '正在读取…' : '导入 PDF'}
            </button>
            <span className="import-hint">PDF / TXT / MD，本机解析，不上传</span>
            <input
              ref={fileRef}
              type="file"
              className="file-input"
              accept=".pdf,application/pdf,.txt,.md,text/plain,text/markdown"
              onChange={(event) => {
                void importFile(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </div>

          {importNote && (
            <p className="import-note" data-tone={importNote.tone} role="status">
              {importNote.text}
            </p>
          )}

          <div
            className={`source-field${dragging ? ' is-dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              if (!importing) setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              void importFile(event.dataTransfer.files?.[0])
            }}
          >
            <textarea
              id="event-text"
              value={text}
              onChange={(event) => {
                setImportNote(null)
                onText(event.target.value)
              }}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') onAnalyze()
              }}
              maxLength={MAX_TEXT_CHARS}
              aria-label="赛事资讯原文"
              aria-describedby="event-text-help"
              placeholder={'把赛事通知粘贴到这里…\n\n主办方、报名截止、赛道要求、报名链接，有多少写多少。'}
              className="source-input"
            />
            {dragging && <div className="drop-overlay">松开导入 PDF / TXT</div>}
            <div className="source-meta">
              <span id="event-text-help">Ctrl / ⌘ + Enter 直接研判</span>
              <span>
                {text.length.toLocaleString()} / {MAX_TEXT_CHARS.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="samples">
            <div className="samples-head">
              <span>预置样例</span>
              {text.length > 0 && (
                <button type="button" className="text-btn" onClick={() => {
                    setImportNote(null)
                    onClear()
                  }}>
                  清空
                </button>
              )}
            </div>
            <div className="sample-list">
              {SAMPLES.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  className="sample"
                  aria-pressed={sampleId === sample.id}
                  onClick={() => {
                    setImportNote(null)
                    onSample(sample)
                  }}
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          <div className="input-actions">
            <button
              type="button"
              className="primary"
              onClick={onAnalyze}
              disabled={!canAnalyze}
              aria-busy={running}
            >
              <span>{running ? `研判中 ${doneCount} / 4` : '开始研判'}</span>
              <span className="primary-hint" aria-hidden="true">
                {running ? '···' : 'Ctrl ↵'}
              </span>
            </button>

            {state.error && (
              <div className="error-row" role="alert">
                <span>{state.error}</span>
                <button type="button" onClick={onAnalyze}>
                  重试
                </button>
              </div>
            )}

            <p className="input-note">{inputNote}</p>
          </div>
        </section>

        <section className="zone output-zone" aria-labelledby="output-title">
          <div className="output-head">
            <div>
              <p className="zone-kicker">AI 研判</p>
              <h2 id="output-title" className="zone-title">
                从原文到决策
              </h2>
            </div>
            <p className="output-count" aria-hidden="true">
              {String(doneCount).padStart(2, '0')}
              <span> / {String(NODES.length).padStart(2, '0')}</span>
            </p>
          </div>

          <div
            className="pipeline"
            role="progressbar"
            aria-label="研判进度"
            aria-valuemin={0}
            aria-valuemax={NODES.length}
            aria-valuenow={doneCount}
          >
            {NODES.map((meta) => (
              <NodeCard
                key={meta.id}
                meta={meta}
                status={state.statuses[meta.id]}
                payload={state.payloads[meta.id]}
                startedAt={state.timings[meta.id]?.start}
                endedAt={state.timings[meta.id]?.end}
                onRetry={onAnalyze}
              />
            ))}
          </div>

          <ReportPanel
            finished={state.finished && !state.error}
            running={running}
            error={state.error}
            doneCount={doneCount}
            payloads={state.payloads as Record<NodeId, any>}
            sourceType={sourceType}
          />

          <p className="sr-only" aria-live="polite">
            {running
              ? `研判进行中，已完成 ${doneCount} 个节点`
              : state.error
                ? `研判失败：${state.error}`
                : state.finished
                  ? '研判完成'
                  : ''}
          </p>
        </section>
      </div>
    </div>
  )
}