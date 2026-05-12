import { useEffect, useMemo, useState } from 'react'
import { Activity, BookOpen, Brain, Clock3, FileText, Network, Sparkles } from 'lucide-react'
import { fetchLibrary, fetchUsage, type LibraryFile, type Status, type UsageStats } from '../api'

interface Props {
  status: Status
}

function formatNum(n: number) {
  return n.toLocaleString()
}

function formatDate(ts: number | null) {
  if (!ts) return 'No questions yet'
  return new Date(ts * 1000).toLocaleString()
}

export default function InsightsPage({ status }: Props) {
  const [library, setLibrary] = useState<LibraryFile[]>([])
  const [usage, setUsage] = useState<UsageStats | null>(null)

  useEffect(() => {
    fetchLibrary().then(setLibrary).catch(() => {})
    fetchUsage().then(setUsage).catch(() => {})
  }, [status.files, status.chunks, status.graph_nodes, status.graph_edges])

  const topPapers = useMemo(
    () => [...library].sort((a, b) => b.chunks - a.chunks).slice(0, 5),
    [library],
  )

  const avgChunksPerPaper = status.files > 0 ? Math.round(status.chunks / status.files) : 0

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="max-w-6xl mx-auto space-y-5">
        <section
          className="rounded-2xl p-5"
          style={{
            background: 'linear-gradient(135deg, rgba(14,165,233,0.16), rgba(20,184,166,0.11))',
            border: '1px solid rgba(20,184,166,0.30)',
          }}
        >
          <div className="flex items-center gap-2 mb-2 text-indigo-200">
            <Activity size={15} />
            <h1 className="text-sm font-semibold text-white">Research Dashboard</h1>
          </div>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
            Live view of your current corpus and chat session usage.
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard icon={BookOpen} label="Papers Added" value={formatNum(status.files)} />
          <MetricCard icon={FileText} label="Chunks Indexed" value={formatNum(status.chunks)} hint={`${avgChunksPerPaper} avg chunks/paper`} />
          <MetricCard icon={Brain} label="Questions Asked" value={formatNum(usage?.questions_asked ?? 0)} hint="This backend session" />
          <MetricCard icon={Sparkles} label="Tokens Used" value={formatNum(usage?.total_tokens_est ?? 0)} hint="Estimated input + output" />
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div
            className="rounded-xl p-4 xl:col-span-2"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="flex items-center gap-2 mb-3 text-cyan-300">
              <FileText size={14} />
              <h2 className="text-sm font-semibold text-white">Top Papers By Chunks</h2>
            </div>
            {topPapers.length === 0 ? (
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>No papers uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {topPapers.map((paper, i) => (
                  <div key={paper.name} className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate" style={{ color: 'rgba(255,255,255,0.82)' }}>{i + 1}. {paper.name}</span>
                      <span className="text-cyan-300 font-medium">{paper.chunks} chunks</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            className="rounded-xl p-4"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="flex items-center gap-2 mb-3 text-indigo-300">
              <Network size={14} />
              <h2 className="text-sm font-semibold text-white">Graph Health</h2>
            </div>
            <div className="space-y-2 text-xs" style={{ color: 'rgba(255,255,255,0.72)' }}>
              <Row label="Nodes" value={formatNum(status.graph_nodes)} />
              <Row label="Edges" value={formatNum(status.graph_edges)} />
              <Row label="Last Question" value={formatDate(usage?.last_question_at ?? null)} />
              <Row label="Session Started" value={formatDate(usage?.session_started_at ?? null)} />
            </div>
          </div>
        </section>

        <section
          className="rounded-xl p-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center gap-2 mb-2 text-amber-300">
            <Clock3 size={14} />
            <h2 className="text-sm font-semibold text-white">Note</h2>
          </div>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Token usage is currently estimated from prompt/response length for a fast in-app dashboard view.
          </p>
        </section>
      </div>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint?: string }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center gap-2 mb-2" style={{ color: 'rgba(255,255,255,0.68)' }}>
        <Icon size={13} />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-white leading-none">{value}</p>
      {hint && <p className="text-[11px] mt-2" style={{ color: 'rgba(255,255,255,0.45)' }}>{hint}</p>}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.015)' }}>
      <span style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</span>
      <span className="text-right" style={{ color: 'rgba(255,255,255,0.85)' }}>{value}</span>
    </div>
  )
}
