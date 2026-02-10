'use client'

import { useEffect, useState } from 'react'
import { fetchEarthquakes } from '../lib/api'

type Earthquake = {
  id?: string
  magnitude?: number | string
  place?: string
  time?: number | string
  depth?: number | string
}

function formatTime(ts?: number | string) {
  if (!ts) return ''
  const num = typeof ts === 'string' ? parseInt(ts) : ts
  const d = new Date(num)
  return d.toLocaleString()
}

function normalizeMag(mag?: number | string) {
  return typeof mag === 'string' ? parseFloat(mag) : mag || 0
}

export default function SignificantEarthquakes() {
  const [events, setEvents] = useState<Earthquake[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchEarthquakes({ limit: 200, mag_min: 5 })
        const list = Array.isArray(data) ? data : []
        setEvents(list)
      } catch (e) {
        console.error('Failed to load significant earthquakes', e)
      }
    }
    load()
  }, [])

  const major = events.filter((e) => normalizeMag(e.magnitude) >= 7)
  const strong = events.filter((e) => normalizeMag(e.magnitude) >= 6 && normalizeMag(e.magnitude) < 7)
  const moderate = events.filter((e) => normalizeMag(e.magnitude) >= 5 && normalizeMag(e.magnitude) < 6)

  const renderList = (list: Earthquake[]) => {
    if (list.length === 0) {
      return <div className="text-xs text-slate-500">No events</div>
    }

    return (
      <ul className="space-y-2">
        {list.slice(0, 8).map((ev, idx) => (
          <li key={`${ev.id || 'ev'}-${idx}`} className="text-xs">
            <div className="font-semibold">M{normalizeMag(ev.magnitude).toFixed(1)}</div>
            <div className="text-slate-700 truncate">{ev.place || 'Unknown location'}</div>
            <div className="text-slate-500">{formatTime(ev.time)}</div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-rose-800">Major (M7+)</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-200 text-rose-800">
            {major.length}
          </span>
        </div>
        {renderList(major)}
      </div>

      <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-orange-800">Strong (M6–6.9)</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-200 text-orange-800">
            {strong.length}
          </span>
        </div>
        {renderList(strong)}
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-amber-800">Moderate (M5–5.9)</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">
            {moderate.length}
          </span>
        </div>
        {renderList(moderate)}
      </div>
    </div>
  )
}
