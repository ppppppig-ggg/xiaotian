function App() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-slate-950 text-slate-100">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-10 py-8 text-center shadow-2xl shadow-black/40">
        <h1 className="text-4xl font-semibold tracking-tight">赛博赛事雷达</h1>
        <p className="mt-2 text-sm text-slate-400">
          CampusRace Radar · 多 Agent 赛事情报解析
        </p>
        <span className="mt-5 inline-block rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">
          v0.0 骨架就绪
        </span>
      </div>
      <p className="text-xs text-slate-600">
        下一步：接上 SSE 假数据，让四张节点卡片依次亮起
      </p>
    </div>
  )
}

export default App