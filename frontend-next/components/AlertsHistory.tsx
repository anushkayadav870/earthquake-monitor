"use client"

import { useState } from 'react'
import useWebSocket from '../hooks/useWebSocket'

type AlertEvent = {
  id?: string
  magnitude?: number | string
  place?: string
  time?: number | string
}

type AlertMessage = {
  event?: AlertEvent
  message?: string
}

function formatTime(ts?: number | string) {
  if (!ts) return ''
  const num = typeof ts === 'string' ? parseInt(ts) : ts
  const d = new Date(num)
  return d.toLocaleString()
}

export default function AlertsHistory() {
  const [history, setHistory] = useState<AlertMessage[]>([])

  useWebSocket((msg) => {
    try {
      const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg
      if (!parsed?.event && !parsed?.message) return

      const alert: AlertMessage = {
        event: parsed.event || {
          id: parsed.id || parsed.properties?.id,
          magnitude: parsed.magnitude || parsed.properties?.mag,
          place: parsed.place || parsed.properties?.place,
          time: parsed.time || parsed.properties?.time,
        },
        message: parsed.message,
      }

      setHistory((prev) => [alert, ...prev].slice(0, 25))
    } catch {
      // ignore non-alert messages
    }
  })

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Recent Alerts</h3>
        <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-red-50 text-red-700">
          History
        </span>
      </div>

      {history.length === 0 ? (
        <div className="text-xs text-slate-500">No alerts yet.</div>
      ) : (
        <ul className="space-y-3 max-h-[32rem] overflow-y-auto">
          {history.map((alert, idx) => (
            <li key={`${alert.event?.id || 'alert'}-${idx}`} className="border-b pb-2">
              <div className="text-xs font-semibold text-slate-900">
                {alert.message || 'Earthquake alert'}
              </div>
              <div className="text-xs text-slate-600">
                {alert.event?.place || 'Unknown location'}
              </div>
              <div className="text-[11px] text-slate-500">
                Mag: {alert.event?.magnitude ?? 'N/A'} · {formatTime(alert.event?.time)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
