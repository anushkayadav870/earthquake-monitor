'use client'

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

export default function AlertsPanel() {
  const [alerts, setAlerts] = useState<AlertMessage[]>([])

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

      setAlerts((prev) => [alert, ...prev].slice(0, 20))
    } catch {
      // ignore non-alert messages
    }
  })

  const getSeverity = (mag?: number | string) => {
    const m = typeof mag === 'string' ? parseFloat(mag) : mag || 0
    if (m >= 6) return 'high'
    if (m >= 5) return 'medium'
    return 'low'
  }

  const getToastClasses = (severity: 'high' | 'medium' | 'low') => {
    if (severity === 'high') return 'border-red-200 bg-red-50 text-red-800'
    if (severity === 'medium') return 'border-orange-200 bg-orange-50 text-orange-800'
    return 'border-yellow-200 bg-yellow-50 text-yellow-800'
  }

  const dismiss = (idx: number) => {
    setAlerts((prev) => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 w-80">
      {alerts.length === 0 && null}

      {alerts.map((alert, idx) => {
        const severity = getSeverity(alert.event?.magnitude)
        return (
          <div
            key={`${alert.event?.id || 'alert'}-${idx}`}
            className={`border rounded-lg shadow-md p-3 ${getToastClasses(severity)}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-semibold">
                {alert.message || 'Earthquake alert'}
              </div>
              <button
                onClick={() => dismiss(idx)}
                className="text-sm font-bold opacity-70 hover:opacity-100"
                aria-label="Dismiss alert"
              >
                ✕
              </button>
            </div>
            <div className="text-xs mt-1">
              {alert.event?.place || 'Unknown location'}
            </div>
            <div className="text-xs opacity-80 mt-1">
              Mag: {alert.event?.magnitude ?? 'N/A'} · {formatTime(alert.event?.time)}
            </div>
          </div>
        )
      })}
    </div>
  )
}