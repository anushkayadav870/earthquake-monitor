"use client"

import { useEffect, useState, useRef } from 'react'
import useWebSocket from '../hooks/useWebSocket'

type EventItem = {
  id?: string
  magnitude?: number
  place?: string
  time?: number
}

export default function LiveFeed() {
  const [events, setEvents] = useState<EventItem[]>([])
  const wsRef = useRef<any>(null)

  // Fetch recent events on mount
  useEffect(() => {
    const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    fetch(`${api}/earthquakes/latest?limit=20`)
      .then((r) => r.json())
      .then((data) => {
        setEvents(data as EventItem[])
      })
      .catch((e) => console.error('Failed to fetch latest events', e))
  }, [])

  // WebSocket hook to receive live events
  useWebSocket((msg) => {
    // msg may be a raw JSON string or object
    try {
      const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg
      // The producer publishes raw_json string; sometimes the shape differs
      const ev: EventItem = {
        id: parsed.id || parsed.properties?.id || parsed.event?.id || undefined,
        magnitude:
          parsed.properties?.mag || parsed.magnitude || parsed.event?.magnitude || undefined,
        place: parsed.place || parsed.properties?.place || parsed.event?.place || undefined,
        time: parsed.time || parsed.properties?.time || parsed.event?.time || undefined,
      }
      setEvents((prev) => [ev, ...prev].slice(0, 50))
    } catch (e) {
      console.warn('Non-json ws message', msg)
    }
  })

  const fmtTime = (ts?: number) => {
    if (!ts) return ''
    const d = new Date(Number(ts))
    return d.toISOString()
  }

  return (
    <div className="bg-white rounded-md shadow p-4">
      {events.length === 0 ? (
        <div className="text-sm text-slate-500">No events yet</div>
      ) : (
        <ul className="space-y-3">
<<<<<<< HEAD
            {events.map((ev, idx) => (
              <li
                key={ev.id || idx}
                className="bg-white rounded-lg shadow p-3 border border-slate-100"
              >
                <div className="flex justify-between items-center">
                  <div className="font-semibold">M{ev.magnitude}</div>
                  <div className="text-xs text-slate-500">{fmtTime(ev.time)}</div>
                </div>
                <div className="text-sm text-slate-700 mt-1">{ev.place}</div>
                {ev.id && (
                  <div className="mt-2">
                    <a href={`/earthquake/${ev.id}`} className="text-xs text-indigo-600 hover:underline">
                      View details →
                    </a>
                  </div>
                )}
              </li>
            ))}
=======
          {events.map((e, idx) => (
            <li key={e.id || idx} className="flex justify-between items-start">
              <div>
                <div className="text-sm font-medium">{e.place || 'Unknown location'}</div>
                <div className="text-xs text-slate-500">{fmtTime(e.time)}</div>
              </div>
              <div className="ml-4 text-right">
                <div className="text-lg font-semibold">{e.magnitude ?? '-'}</div>
              </div>
            </li>
          ))}
>>>>>>> ff17395 (1)
        </ul>
      )}
    </div>
  )
}
