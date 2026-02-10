const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function fetchEarthquakes(params?: {
  mag_min?: number
  mag_max?: number
  depth_min?: number
  depth_max?: number
  start_time?: number
  end_time?: number
  limit?: number
}) {
  const searchParams = new URLSearchParams()
  if (params?.mag_min) searchParams.append('mag_min', String(params.mag_min))
  if (params?.mag_max) searchParams.append('mag_max', String(params.mag_max))
  if (params?.depth_min) searchParams.append('depth_min', String(params.depth_min))
  if (params?.depth_max) searchParams.append('depth_max', String(params.depth_max))
  if (params?.start_time) searchParams.append('start_time', String(params.start_time))
  if (params?.end_time) searchParams.append('end_time', String(params.end_time))
  if (params?.limit) searchParams.append('limit', String(params.limit))

  const res = await fetch(`${API_BASE}/earthquakes?${searchParams.toString()}`)
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

export async function fetchClusters() {
  const res = await fetch(`${API_BASE}/clusters`)
  if (!res.ok) throw new Error(`Failed to fetch clusters: ${res.statusText}`)
  return res.json()
}

export type ClusteringConfig = {
  eps_km: number
  time_window_hours: number
  min_samples: number
}

export async function fetchClusteringConfig(): Promise<ClusteringConfig> {
  const res = await fetch(`${API_BASE}/clustering/config`)
  if (!res.ok) throw new Error(`Failed to fetch clustering config: ${res.statusText}`)
  return res.json()
}

export async function updateClusteringConfig(config: Partial<ClusteringConfig>): Promise<{ status: string; config: ClusteringConfig; message: string }> {
  const res = await fetch(`${API_BASE}/clustering/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) throw new Error(`Failed to update clustering config: ${res.statusText}`)
  return res.json()
}

export type HeatmapPoint = {
  lat: number
  lon: number
  weight: number
  count: number
  avg_mag: number
  region?: string  // Representative location for this grid point
}

export async function fetchHeatmapData(params?: {
  start_time?: number
  end_time?: number
  mag_min?: number
  mag_max?: number
  depth_min?: number
  depth_max?: number
  weight_by?: 'magnitude' | 'count' | 'energy' | 'depth'
}): Promise<HeatmapPoint[]> {
  const searchParams = new URLSearchParams()
  if (params?.start_time) searchParams.append('start_time', String(params.start_time))
  if (params?.end_time) searchParams.append('end_time', String(params.end_time))
  if (params?.mag_min) searchParams.append('mag_min', String(params.mag_min))
  if (params?.mag_max) searchParams.append('mag_max', String(params.mag_max))
  if (params?.depth_min) searchParams.append('depth_min', String(params.depth_min))
  if (params?.depth_max) searchParams.append('depth_max', String(params.depth_max))
  if (params?.weight_by) searchParams.append('weight_by', params.weight_by)

  const res = await fetch(`${API_BASE}/earthquakes/heatmap?${searchParams.toString()}`)
  if (!res.ok) throw new Error(`Failed to fetch heatmap data: ${res.statusText}`)
  return res.json()
}

export type GraphNode = {
  id: string
  label: string
  mag?: number
  time?: number
  place?: string
  depth?: number
  degree?: number
  name?: string
  event_count?: number
  avg_mag?: number
  lat?: number
  lon?: number
}

export type GraphEdge = {
  id?: string
  source: string
  target: string
  type: string
  dist_km?: number
}

export async function fetchNeo4jGraph(params?: {
  min_mag?: number
  max_mag?: number
  start_time?: number
  end_time?: number
  cluster_id?: string
  relationship_types?: string[]
}): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const searchParams = new URLSearchParams()
  if (params?.min_mag !== undefined) searchParams.append('min_mag', String(params.min_mag))
  if (params?.max_mag !== undefined) searchParams.append('max_mag', String(params.max_mag))
  if (params?.start_time) searchParams.append('start_time', String(params.start_time))
  if (params?.end_time) searchParams.append('end_time', String(params.end_time))
  if (params?.cluster_id) searchParams.append('cluster_id', params.cluster_id)
  if (params?.relationship_types && params.relationship_types.length > 0) {
    searchParams.append('relationship_types', params.relationship_types.join(','))
  }

  const res = await fetch(`${API_BASE}/neo4j/graph?${searchParams.toString()}`)
  if (!res.ok) throw new Error(`Failed to fetch Neo4j graph: ${res.statusText}`)
  return res.json()
}

export async function fetchNodeNeighbors(nodeId: string) {
  const res = await fetch(`${API_BASE}/neo4j/neighbors/${nodeId}`)
  if (!res.ok) throw new Error(`Failed to fetch node neighbors: ${res.statusText}`)
  return res.json()
}

export async function fetchTopCentralQuakes(limit: number = 10): Promise<{ id: string; mag: number; degree: number }[]> {
  const res = await fetch(`${API_BASE}/neo4j/top-central?limit=${limit}`)
  if (!res.ok) throw new Error(`Failed to fetch top central quakes: ${res.statusText}`)
  return res.json()
}
