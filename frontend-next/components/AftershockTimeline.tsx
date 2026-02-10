'use client'

type AftershockEvent = {
  id?: string
  magnitude?: number | string
  place?: string
  time?: number | string
}

function formatTime(ts?: number | string) {
  if (!ts) return ''
  const num = typeof ts === 'string' ? parseInt(ts) : ts
  const d = new Date(num)
  return d.toLocaleString()
}

export default function AftershockTimeline({ events }: { events: AftershockEvent[] }) {
  if (!events || events.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6">
        <h2 className="text-lg font-semibold mb-2">Aftershocks</h2>
        <div className="text-sm text-slate-500">No aftershock data available.</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6">
      <h2 className="text-lg font-semibold mb-4">Aftershocks</h2>
      <ul className="space-y-3">
        {events.map((ev, idx) => (
          <li key={`${ev.id || 'aftershock'}-${idx}`} className="border-l-2 border-slate-200 pl-3">
            <div className="text-sm font-medium">M{ev.magnitude ?? 'N/A'}</div>
            <div className="text-xs text-slate-600">{ev.place || 'Unknown location'}</div>
            <div className="text-xs text-slate-500">{formatTime(ev.time)}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
