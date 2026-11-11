import { Brand } from './Brand'
import '../cover.css'

interface Props {
  busy: boolean
  onEnter: () => void
}

export function Cover({ busy, onEnter }: Props) {
  return (
    <section className="cover" aria-label="校园赛事雷达封面">
      <header className="cover-top">
        <Brand />
      </header>

      <div className="cover-main">
        <div className="cover-copy">
          <p className="cover-kicker">赛事情报研判</p>
          <h1>
            别急着报名。
            <br />
            先看清这场赛事。
          </h1>
          <p className="cover-sub">
            群聊、推文、海报里的赛事通知，常常缺时间、缺主办方，口径还互相打架。
            交给四个 Agent，换回一份能核验、能执行的决策报告。
          </p>

          <button
            type="button"
            className="enter-btn"
            onClick={onEnter}
            aria-busy={busy}
            disabled={busy}
          >
            <span>{busy ? '正在进入' : '进入研判台'}</span>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="4.1" stroke="currentColor" strokeWidth="1.2" />
              <path
                d="M8 0.9v2.3M8 12.8v2.3M0.9 8h2.3M12.8 8h2.3"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinecap="round"
              />
              <circle cx="8" cy="8" r="1.1" fill="currentColor" />
            </svg>
          </button>
          <p className="cover-note">无需账户 · 数据不落库 · 结论由你复核</p>
        </div>
      </div>

      <footer className="cover-foot">
        <span>不判定赛事真伪，只提示风险与核验路径。</span>
        <span>CampusRace Radar</span>
      </footer>
    </section>
  )
}