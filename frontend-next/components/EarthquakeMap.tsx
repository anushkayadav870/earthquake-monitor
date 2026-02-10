import { useEffect, useMemo, useState, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, ZoomControl, useMap, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchEarthquakes, fetchClusters, type HeatmapPoint } from '../lib/api'
import useWebSocket from '../hooks/useWebSocket'
import { type MapFilters } from './FilterPanel'
import GraphLayer from './GraphLayer'

// Fix Leaflet marker icons
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  })
}

type Earthquake = {
  id?: string
  magnitude?: number | string
  place?: string
  exact_address?: string  // Detailed address from geocoder
  time?: number | string
  latitude?: number | string
  longitude?: number | string
  depth?: number | string
  cluster_id?: string | null
}

type Cluster = {
  cluster_id: string
  centroid: {
    coordinates: [number, number] // lon, lat
  }
  event_count: number
  avg_magnitude: number
  start_time: number
  end_time: number
  region?: string
}

// Enhanced Heatmap layer using backend aggregation
function HeatmapLayer({
  isVisible,
  filters,
  visibleEventsCount
}: {
  isVisible: boolean
  filters: MapFilters
  visibleEventsCount: number
}) {
  const map = useMap()
  const layerRef = useRef<any>(null)
  const [heatPoints, setHeatPoints] = useState<HeatmapPoint[]>([])
  const [heatLayerData, setHeatLayerData] = useState<[number, number, number][]>([])

  // Fetch heatmap data from backend when filters change
  useEffect(() => {
    if (!isVisible) return

    const fetchData = async () => {
      try {
        const now = Date.now()
        const startTime = now - filters.timeRangeHours * 60 * 60 * 1000

        // Dynamically import to avoid issues
        const { fetchHeatmapData } = await import('../lib/api')
        const data = await fetchHeatmapData({
          start_time: startTime,
          end_time: now,
          mag_min: filters.magnitudeMin,
          mag_max: filters.magnitudeMax,
          weight_by: filters.heatmapWeightBy
        })

        if (data.length === 0) {
          setHeatPoints([])
          setHeatLayerData([])
          return
        }

        // Normalize weights to 0-1 range using min-max scaling
        const weights = data.map(p => p.weight)
        const minWeight = Math.min(...weights)
        const maxWeight = Math.max(...weights)
        const range = maxWeight - minWeight || 1

        const normalized: [number, number, number][] = data.map(point => [
          point.lat,
          point.lon,
          (point.weight - minWeight) / range
        ])

        setHeatPoints(data)
        setHeatLayerData(normalized)
      } catch (e) {
        console.error('Failed to fetch heatmap data', e)
      }
    }

    fetchData()
  }, [isVisible, filters.magnitudeMin, filters.magnitudeMax, filters.timeRangeHours, filters.heatmapWeightBy, visibleEventsCount])

  // Render heatmap layer
  useEffect(() => {
    if (!isVisible) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
      return
    }

    if (heatLayerData.length === 0) return

    if (layerRef.current) {
      map.removeLayer(layerRef.current)
    }

    try {
      if ((L as any).heatLayer) {
        layerRef.current = (L as any).heatLayer(heatLayerData, {
          radius: filters.heatmapRadius,
          blur: filters.heatmapBlur,
          max: 1.0,
          minOpacity: 0.3,
          gradient: {
            0.0: '#3b82f6',
            0.25: '#06b6d4',
            0.4: '#22c55e',
            0.6: '#eab308',
            0.8: '#f97316',
            1.0: '#ef4444'
          },
        })
      } else {
        const group = L.featureGroup()
        heatLayerData.forEach(([lat, lon, intensity]) => {
          const color = intensity > 0.8 ? '#ef4444' :
            intensity > 0.6 ? '#f97316' :
              intensity > 0.4 ? '#eab308' :
                intensity > 0.2 ? '#22c55e' : '#3b82f6'
          const circle = L.circle([lat, lon], {
            radius: 10000 + intensity * 40000,
            fillColor: color,
            color: '#fff',
            weight: 1,
            opacity: 0.4,
            fillOpacity: 0.2 + intensity * 0.4,
          })
          group.addLayer(circle)
        })
        layerRef.current = group
      }
      layerRef.current.addTo(map)
    } catch (e) {
      console.error('Heatmap render error', e)
    }
  }, [heatLayerData, isVisible, map, filters.heatmapRadius, filters.heatmapBlur])

  return (
    <>
      {isVisible && heatPoints.map((point, idx) => (
        <CircleMarker
          key={`heat-hover-${idx}`}
          center={[point.lat, point.lon]}
          radius={filters.heatmapRadius / 2}
          fillColor="transparent"
          color="transparent"
          weight={0}
        >
          <Tooltip direction="top" offset={[0, -10]} opacity={0.9}>
            <div className="p-2 space-y-1 min-w-[160px]">
              <div className="font-bold border-b border-slate-200 mb-1 pb-1">🔥 Heatmap Zone</div>
              <div className="text-xs space-y-0.5">
                {point.region && (
                  <div><span className="text-slate-500">Region:</span> <span className="font-medium">{point.region}</span></div>
                )}
                <div><span className="text-slate-500">Events:</span> {point.count}</div>
                <div><span className="text-slate-500">Avg Magnitude:</span> M{point.avg_mag}</div>
                <div><span className="text-slate-500">Intensity:</span> {point.weight.toFixed(2)}</div>
                <div className="text-[10px] text-slate-400 mt-1 pt-1 border-t border-slate-100 italic">
                  Weight: {filters.heatmapWeightBy}
                </div>
              </div>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  )
}

// Server-side Clusters Layer
function ServerClustersLayer({
  clusters,
  isEnabled,
  onClusterClick,
}: {
  clusters: Cluster[]
  isEnabled: boolean
  onClusterClick: (cluster: Cluster) => void
}) {
  const map = useMap()
  const groupRef = useRef<L.FeatureGroup | null>(null)

  useEffect(() => {
    if (!isEnabled) {
      if (groupRef.current) {
        map.removeLayer(groupRef.current)
        groupRef.current = null
      }
      return
    }

    if (groupRef.current) {
      map.removeLayer(groupRef.current)
    }

    groupRef.current = L.featureGroup()

    clusters.forEach((cluster) => {
      const lat = cluster.centroid.coordinates[1]
      const lon = cluster.centroid.coordinates[0]
      const count = cluster.event_count

      if (!lat || !lon) return

      const marker = L.circleMarker([lat, lon], {
        radius: Math.max(10, Math.min(30, count / 2)),
        fillColor: '#9333ea',
        color: '#fff',
        weight: 2,
        opacity: 0.9,
        fillOpacity: 0.8,
      })

      marker.bindPopup(`
        <div class="text-center">
          <div class="font-bold text-sm border-b pb-1 mb-1">${cluster.region || 'Cluster'}</div>
          <div class="text-xs space-y-1">
            <div>Events: <strong>${count}</strong></div>
            <div>Avg Mag: <strong>M${cluster.avg_magnitude.toFixed(1)}</strong></div>
          </div>
        </div>
      `, {
        className: 'custom-cluster-popup'
      })

      marker.on('click', () => {
        onClusterClick(cluster)
      })

      groupRef.current!.addLayer(marker)
    })

    groupRef.current.addTo(map)
  }, [clusters, isEnabled, map, onClusterClick])

  return null
}

interface EarthquakeMapProps {
  filters: MapFilters
  onEventSelect: (event: any) => void
  onStatsUpdate?: (stats: { totalClusters: number, totalEventsInClusters: number, noiseEvents: number }) => void
  selectedEventId?: string
}

export default function EarthquakeMap({ filters, onEventSelect, onStatsUpdate, selectedEventId }: EarthquakeMapProps) {
  const [events, setEvents] = useState<Earthquake[]>([])
  const [clusters, setClusters] = useState<Cluster[]>([])

  const [loading, setLoading] = useState(true)
  const mapRef = useRef<L.Map | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [playIndex, setPlayIndex] = useState(0)
  const [speedMs, setSpeedMs] = useState(500)

  const { magnitudeMode, magnitudeMin, magnitudeMax, magnitudeExact, timeRangeHours, showMarkers, showHeatmap, showClusters } = filters

  const passesFilters = (ev: Earthquake) => {
    const mag = typeof ev.magnitude === 'string' ? parseFloat(ev.magnitude) : ev.magnitude || 0
    let withinMag = false
    switch (magnitudeMode) {
      case 'minimum': withinMag = mag >= magnitudeMin; break
      case 'range': withinMag = mag >= magnitudeMin && mag <= magnitudeMax; break
      case 'exact': withinMag = Math.abs(mag - magnitudeExact) <= 0.1; break
    }
    return withinMag
  }

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const ta = typeof a.time === 'string' ? parseInt(a.time) : a.time || 0
      const tb = typeof b.time === 'string' ? parseInt(b.time) : b.time || 0
      return ta - tb
    })
  }, [events])

  const visibleEvents = useMemo(() => {
    if (!isPlaying) return sortedEvents
    return sortedEvents.slice(0, Math.max(0, Math.min(playIndex, sortedEvents.length)))
  }, [isPlaying, playIndex, sortedEvents])

  const visibleClusters = useMemo(() => {
    const now = Date.now()
    const startTime = now - (timeRangeHours * 3600 * 1000)
    return clusters.filter(c => c.end_time >= startTime)
  }, [clusters, timeRangeHours])

  useEffect(() => {
    if (!showClusters) return
    let attempts = 0
    const maxAttempts = 5
    let intervalId: NodeJS.Timeout

    // Initial fetch after short delay, then poll for updates
    const fetchAndCheck = () => {
      fetchClusters()
        .then(data => {
          const clusterData = Array.isArray(data) ? data : []
          setClusters(clusterData)
          attempts++
          // Stop polling after max attempts or if we got data
          if (attempts >= maxAttempts) {
            clearInterval(intervalId)
          }
        })
        .catch(e => {
          console.error('Failed to fetch clusters', e)
          clearInterval(intervalId)
        })
    }

    // Start with quick initial fetch
    const initialTimer = setTimeout(() => {
      fetchAndCheck()
      // Then poll every 1.5 seconds for updates
      intervalId = setInterval(fetchAndCheck, 1500)
    }, 1000)

    return () => {
      clearTimeout(initialTimer)
      clearInterval(intervalId)
    }
  }, [filters.clusteringConfig, showClusters])

  // Calculate and Report Stats
  useEffect(() => {
    if (onStatsUpdate && !loading) {
      const totalClusters = visibleClusters.length
      const totalEventsInClusters = visibleClusters.reduce((acc, c) => acc + c.event_count, 0)
      const noiseEvents = Math.max(0, visibleEvents.length - totalEventsInClusters)

      onStatsUpdate({
        totalClusters,
        totalEventsInClusters,
        noiseEvents
      })
    }
  }, [visibleClusters, visibleEvents.length, onStatsUpdate, loading])


  useEffect(() => {
    const load = async () => {
      try {
        const now = Date.now()
        const startTime = timeRangeHours ? Math.floor(now - timeRangeHours * 60 * 60 * 1000) : undefined
        const endTime = Math.floor(now)

        let mag_min, mag_max
        if (magnitudeMode === 'minimum') mag_min = magnitudeMin
        else if (magnitudeMode === 'range') { mag_min = magnitudeMin; mag_max = magnitudeMax }
        else if (magnitudeMode === 'exact') { mag_min = magnitudeExact - 0.1; mag_max = magnitudeExact + 0.1 }

        const [earthquakeData, clusterData] = await Promise.all([
          fetchEarthquakes({ limit: 500, mag_min: mag_min, mag_max: mag_max, start_time: startTime }),
          fetchClusters()
        ])

        setEvents((Array.isArray(earthquakeData) ? earthquakeData : []).filter(passesFilters))
        setClusters(Array.isArray(clusterData) ? clusterData : [])
        setLoading(false)
      } catch (e) {
        console.error('Failed to load data', e)
        setLoading(false)
      }
    }
    // Debounce slightly to avoid rapid refetch
    const t = setTimeout(load, 500)
    return () => clearTimeout(t)
  }, [magnitudeMode, magnitudeMin, magnitudeMax, magnitudeExact, timeRangeHours])

  useWebSocket((msg) => {
    try {
      const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg
      const ev: Earthquake = {
        id: parsed.id || parsed.properties?.id,
        magnitude: parsed.properties?.mag || parsed.magnitude,
        place: parsed.place || parsed.properties?.place,
        time: parsed.time || parsed.properties?.time,
        latitude: parsed.geometry?.coordinates?.[1] || parsed.latitude,
        longitude: parsed.geometry?.coordinates?.[0] || parsed.longitude,
        depth: parsed.geometry?.coordinates?.[2] || parsed.depth,
        cluster_id: parsed.cluster_id || null
      }
      if (!passesFilters(ev)) return
      setEvents((prev) => [ev, ...prev].slice(0, 150))
    } catch (e) {
      console.warn('Non-JSON ws message', msg)
    }
  })

  useEffect(() => {
    if (!isPlaying) setPlayIndex(sortedEvents.length)
  }, [isPlaying, sortedEvents.length])

  useEffect(() => {
    if (!isPlaying || sortedEvents.length === 0) return
    const interval = window.setInterval(() => {
      setPlayIndex((prev) => {
        const next = prev + 1
        if (next >= sortedEvents.length) { setIsPlaying(false); return sortedEvents.length }
        return next
      })
    }, speedMs)
    return () => window.clearInterval(interval)
  }, [isPlaying, sortedEvents.length, speedMs])

  const getMagnitudeColor = (mag?: number | string) => {
    const m = typeof mag === 'string' ? parseFloat(mag) : mag || 0
    if (m >= 6) return '#ef4444'
    if (m >= 5) return '#f97316'
    if (m >= 4) return '#fbc02d'
    if (m >= 3) return '#388e3c'
    return '#1976d2'
  }

  if (loading) {
    return <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-500">Loading Global Seismic Engine...</div>
  }

  return (
    <div className="w-full h-full relative font-sans">
      <MapContainer
        center={[37.7, -122.4]}
        zoom={3}
        style={{ width: '100%', height: '100%', background: '#f8fafc' }}
        zoomControl={false}
        ref={mapRef as any}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <ZoomControl position="bottomright" />

        <HeatmapLayer
          isVisible={showHeatmap}
          filters={filters}
          visibleEventsCount={visibleEvents.length}
        />

        {/* Integrated Graph Layer */}
        <GraphLayer
          filters={filters}
          onNodeSelect={onEventSelect}
          selectedEventId={selectedEventId}
        />

        {showMarkers && visibleEvents.map((ev, idx) => {
          const lat = typeof ev.latitude === 'string' ? parseFloat(ev.latitude) : ev.latitude
          const lon = typeof ev.longitude === 'string' ? parseFloat(ev.longitude) : ev.longitude
          if (!lat || !lon) return null
          const mag = typeof ev.magnitude === 'string' ? parseFloat(ev.magnitude) : ev.magnitude || 0
          return (
            <CircleMarker
              key={ev.id || idx}
              center={[lat, lon] as [number, number]}
              radius={Math.max(4, Math.min(15, mag * 3))}
              pathOptions={{
                fillColor: getMagnitudeColor(mag),
                color: '#fff',
                weight: 1,
                fillOpacity: 0.7,
              }}
              eventHandlers={{
                click: () => onEventSelect({ ...ev, index: idx })
              }}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                <div className="p-2 min-w-[150px]">
                  <div className="font-bold text-sm border-b border-slate-200 pb-1 mb-1">
                    🌍 M{mag.toFixed(1)}
                  </div>
                  <div className="text-xs space-y-0.5">
                    <div><span className="text-slate-500">Location:</span> {ev.exact_address || ev.place}</div>
                    <div><span className="text-slate-500">Depth:</span> {ev.depth ? `${ev.depth} km` : 'N/A'}</div>
                    <div><span className="text-slate-500">Time:</span> {new Date(typeof ev.time === 'string' ? parseInt(ev.time) : ev.time || 0).toLocaleString()}</div>
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          )
        })}

        <ServerClustersLayer
          clusters={visibleClusters}
          isEnabled={showClusters}
          onClusterClick={(c) => {
            if (mapRef.current) mapRef.current.setView([c.centroid.coordinates[1], c.centroid.coordinates[0]], 10)
          }}
        />
      </MapContainer>

      {/* Timeline Controls - Overlay */}
      {sortedEvents.length > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-[90%] max-w-xl bg-white/90 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-xs uppercase tracking-wide text-indigo-600">Timeline Analysis ({visibleEvents.length} events)</div>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="text-xs px-3 py-1 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-sm font-bold"
            >
              {isPlaying ? 'PAUSE' : 'PLAY SEQUENCE'}
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={sortedEvents.length}
            value={playIndex}
            onChange={(e) => { setIsPlaying(false); setPlayIndex(parseInt(e.target.value)) }}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
        </div>
      )}
    </div>
  )
}
