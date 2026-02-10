'use client'

import { useMemo } from 'react'

type EarthquakeDetail = {
  id?: string
  magnitude?: number | string
  place?: string
  time?: number | string
  latitude?: number | string
  longitude?: number | string
  depth?: number | string
  url?: string
  readable_time?: string
  exact_address?: string
}

function formatTime(ts?: number | string) {
  if (!ts) return ''
  const num = typeof ts === 'string' ? parseInt(ts) : ts
  const d = new Date(num)
  return d.toLocaleString()
}

function toNumber(value?: number | string) {
  if (value === undefined || value === null) return undefined
  return typeof value === 'string' ? parseFloat(value) : value
}

export default function EarthquakeDetailCard({ detail }: { detail: EarthquakeDetail }) {
  const mag = useMemo(() => toNumber(detail.magnitude), [detail.magnitude])
  const depth = useMemo(() => toNumber(detail.depth), [detail.depth])
  const lat = useMemo(() => toNumber(detail.latitude), [detail.latitude])
  const lon = useMemo(() => toNumber(detail.longitude), [detail.longitude])
  const time = detail.readable_time || formatTime(detail.time)

  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{detail.place || 'Unknown location'}</h1>
          <div className="text-sm text-slate-500 mt-1">{time}</div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-rose-600">M{mag?.toFixed(1) ?? 'N/A'}</div>
          <div className="text-xs text-slate-500">Magnitude</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Depth</div>
          <div className="text-lg font-semibold">{depth?.toFixed(1) ?? 'N/A'} km</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Coordinates</div>
          <div className="text-sm font-semibold">
            {lat?.toFixed(3) ?? 'N/A'}, {lon?.toFixed(3) ?? 'N/A'}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Event ID</div>
          <div className="text-sm font-semibold truncate">{detail.id || 'N/A'}</div>
        </div>
      </div>

      {detail.exact_address && (
        <div className="mt-4 text-sm text-slate-600">
          <span className="font-medium">Exact address:</span> {detail.exact_address}
        </div>
      )}

      {detail.url && (
        <div className="mt-4">
          <a
            href={detail.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-indigo-600 hover:underline"
          >
            View USGS source
          </a>
        </div>
      )}
    </div>
  )
}
