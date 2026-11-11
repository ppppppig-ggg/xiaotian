interface Props {
  compact?: boolean
}

export function Brand({ compact = false }: Props) {
  return (
    <span className="brand">
      <svg className="brand-glyph" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="12.4" stroke="currentColor" strokeOpacity="0.34" />
        <circle cx="16" cy="16" r="8" stroke="currentColor" strokeOpacity="0.6" strokeDasharray="1.4 3.6" />
        <path d="M16 16 23.8 7.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M16 16h11.2" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1" />
        <circle cx="16" cy="16" r="1.65" fill="currentColor" />
      </svg>
      <span className="brand-text">
        <span className="brand-name">校园赛事雷达</span>
        {!compact && <span className="brand-sub">CampusRace Radar</span>}
      </span>
    </span>
  )
}