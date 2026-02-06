const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function fetchEarthquakes(params?: {
  mag_min?: number
  mag_max?: number
  depth_min?: number
  depth_max?: number
  limit?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.mag_min) searchParams.append('mag_min', String(params.mag_min))
  if (params?.mag_max) searchParams.append('mag_max', String(params.mag_max))
  if (params?.depth_min) searchParams.append('depth_min', String(params.depth_min))
  if (params?.depth_max) searchParams.append('depth_max', String(params.depth_max))
  if (params?.limit) searchParams.append('limit', String(params.limit))

  const res = await fetch(`${API_BASE}/earthquakes/latest?${searchParams.toString()}`)
  if (!res.ok) throw new Error(`Failed to fetch earthquakes: ${res.statusText}`)
  return res.json()
}

export async function fetchEarthquakeDetail(eventId: string) {
  const res = await fetch(`${API_BASE}/earthquakes/${eventId}`)
  if (!res.ok) throw new Error(`Failed to fetch earthquake detail: ${res.statusText}`)
  return res.json()
}

export async function fetchAnalytics(endpoint: string) {
  const res = await fetch(`${API_BASE}/analytics/${endpoint}`)
  if (!res.ok) throw new Error(`Failed to fetch analytics: ${res.statusText}`)
  return res.json()
}
