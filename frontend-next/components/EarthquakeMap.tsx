<<<<<<< HEAD
import { useEffect, useMemo, useState, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, ZoomControl, useMap, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchEarthquakes, fetchClusters, type HeatmapPoint } from '../lib/api'
import useWebSocket from '../hooks/useWebSocket'
import { type MapFilters } from './FilterPanel'
import GraphLayer from './GraphLayer'
=======
'use client'

import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchEarthquakes } from '../lib/api'
import useWebSocket from '../hooks/useWebSocket'
>>>>>>> ff17395 (1)

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
<<<<<<< HEAD
  exact_address?: string  // Detailed address from geocoder
=======
>>>>>>> ff17395 (1)
  time?: number | string
  latitude?: number | string
  longitude?: number | string
  depth?: number | string
<<<<<<< HEAD
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
=======
}

type SelectedEvent = Earthquake & { index: number }

function formatTime(ts?: number | string) {
  if (!ts) return ''
  const num = typeof ts === 'string' ? parseInt(ts) : ts
  const d = new Date(num)
  return d.toLocaleString()
}

// Floating popup overlay component (renders outside MapContainer using DOM)
function FloatingPopupOverlay({
  event,
  map,
  onClose,
}: {
  event: SelectedEvent
  map: L.Map
  onClose: () => void
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!event) return
    const lat = typeof event.latitude === 'string' ? parseFloat(event.latitude) : event.latitude
    const lon = typeof event.longitude === 'string' ? parseFloat(event.longitude) : event.longitude
    if (!lat || !lon) {
      setPos(null)
      return
    }

    const update = () => {
      try {
        const p = map.latLngToContainerPoint([lat, lon] as [number, number])
        console.debug('FloatingPopup update', { lat, lon, x: p.x, y: p.y })
        setPos({ x: p.x, y: p.y })
      } catch (e) {
        console.error('FloatingPopup error', e)
      }
    }

    update()
    map.on('move zoom resize', update)
    return () => map.off('move zoom resize', update)
  }, [event, map])

  if (!pos) return null

  return (
    <div
      style={{
        position: 'absolute',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        transform: 'translate(-50%, -110%)',
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
    >
      <div className="bg-white p-3 rounded shadow-lg w-64">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm">
            <div className="font-semibold">{event.place}</div>
            <div className="text-xs text-slate-600">{formatTime(event.time)}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">
            ✕
          </button>
        </div>

        <div className="mt-2 text-xs text-slate-700 space-y-1">
          <div>
            <strong>Mag:</strong> {event.magnitude}
          </div>
          <div>
            <strong>Depth:</strong> {event.depth} km
          </div>
          <div className="truncate">
            <strong>Coords:</strong> {event.latitude}, {event.longitude}
          </div>
        </div>
      </div>
    </div>
  )
}

// Heatmap layer manager component
function HeatmapLayer({ events, isVisible }: { events: Earthquake[]; isVisible: boolean }) {
  const map = useMap()
  const layerRef = useRef<any>(null)

  useEffect(() => {
    console.debug('HeatmapLayer useEffect', { isVisible, eventCount: events.length })
    
    if (!isVisible) {
      if (layerRef.current) {
        console.debug('Removing heatmap layer')
>>>>>>> ff17395 (1)
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
      return
    }

<<<<<<< HEAD
    if (heatLayerData.length === 0) return
=======
    const heatmapData = events
      .map((ev) => {
        const lat = typeof ev.latitude === 'string' ? parseFloat(ev.latitude) : ev.latitude
        const lon = typeof ev.longitude === 'string' ? parseFloat(ev.longitude) : ev.longitude
        const mag = typeof ev.magnitude === 'string' ? parseFloat(ev.magnitude) : ev.magnitude || 1

        if (!lat || !lon) return null
        return [lat, lon, Math.min(mag / 7, 1)] as [number, number, number]
      })
      .filter(Boolean) as [number, number, number][]

    console.debug('Heatmap data ready', { dataPoints: heatmapData.length })

    if (heatmapData.length === 0) {
      console.debug('No heatmap data')
      return
    }
>>>>>>> ff17395 (1)

    if (layerRef.current) {
      map.removeLayer(layerRef.current)
    }

    try {
<<<<<<< HEAD
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
=======
      // Try native heatLayer first (requires leaflet-heat plugin)
      if ((L as any).heatLayer) {
        console.debug('Using L.heatLayer')
        layerRef.current = (L as any).heatLayer(heatmapData, {
          radius: 25,
          blur: 15,
          max: 1.0,
          minOpacity: 0.2,
          gradient: { 0.4: 'blue', 0.65: 'lime', 0.8: 'yellow', 1.0: 'red' },
        })
      } else {
        // Fallback: create circles as heatmap approximation
        console.debug('Using circle fallback for heatmap')
        const group = L.featureGroup()
        heatmapData.forEach(([lat, lon, intensity]) => {
          const circle = L.circle([lat, lon], {
            radius: 5000 + intensity * 20000,
            fillColor: intensity > 0.7 ? '#d32f2f' : intensity > 0.4 ? '#f57c00' : '#1976d2',
            color: '#fff',
            weight: 1,
            opacity: 0.3,
            fillOpacity: 0.1 + intensity * 0.3,
>>>>>>> ff17395 (1)
          })
          group.addLayer(circle)
        })
        layerRef.current = group
      }
      layerRef.current.addTo(map)
<<<<<<< HEAD
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
=======
      console.debug('Heatmap layer added')
    } catch (e) {
      console.error('Heatmap error', e)
    }
  }, [events, isVisible, map])

  return null
}

// Clustering manager component
function ClusteringLayer({
  events,
  isEnabled,
  onClusterClick,
}: {
  events: Earthquake[]
  isEnabled: boolean
  onClusterClick: (ev: SelectedEvent) => void
>>>>>>> ff17395 (1)
}) {
  const map = useMap()
  const groupRef = useRef<L.FeatureGroup | null>(null)

  useEffect(() => {
<<<<<<< HEAD
    if (!isEnabled) {
      if (groupRef.current) {
=======
    console.debug('ClusteringLayer useEffect', { isEnabled, eventCount: events.length })
    
    if (!isEnabled) {
      if (groupRef.current) {
        console.debug('Removing cluster layer')
>>>>>>> ff17395 (1)
        map.removeLayer(groupRef.current)
        groupRef.current = null
      }
      return
    }

    if (groupRef.current) {
      map.removeLayer(groupRef.current)
    }

    groupRef.current = L.featureGroup()

<<<<<<< HEAD
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
=======
    const clusterMap = new Map<string, Earthquake[]>()
    const clusterSize = 0.5

    events.forEach((ev) => {
      const lat = typeof ev.latitude === 'string' ? parseFloat(ev.latitude) : ev.latitude
      const lon = typeof ev.longitude === 'string' ? parseFloat(ev.longitude) : ev.longitude

      if (!lat || !lon) return

      const key = `${Math.floor(lat / clusterSize)},${Math.floor(lon / clusterSize)}`
      if (!clusterMap.has(key)) {
        clusterMap.set(key, [])
      }
      clusterMap.get(key)!.push(ev)
    })

    clusterMap.forEach((cluster) => {
      if (cluster.length === 0) return

      const firstEv = cluster[0]
      const lat = typeof firstEv.latitude === 'string' ? parseFloat(firstEv.latitude) : firstEv.latitude
      const lon = typeof firstEv.longitude === 'string' ? parseFloat(firstEv.longitude) : firstEv.longitude

      if (!lat || !lon) return

      if (cluster.length === 1) {
        const marker = L.circleMarker([lat, lon], {
          radius: 6,
          fillColor: '#1976d2',
          color: '#fff',
          weight: 1,
          opacity: 0.8,
          fillOpacity: 0.7,
        })

        marker.bindPopup(`<strong>${firstEv.place}</strong><br/>Mag: ${firstEv.magnitude}`)
        marker.on('click', () => onClusterClick({ ...firstEv, index: 0 }))
        groupRef.current!.addLayer(marker)
      } else {
        const avgMag =
          cluster.reduce((sum, e) => {
            const m = typeof e.magnitude === 'string' ? parseFloat(e.magnitude) : e.magnitude || 0
            return sum + m
          }, 0) / cluster.length

        const marker = L.circleMarker([lat, lon], {
          radius: Math.max(8, Math.min(20, cluster.length / 2)),
          fillColor: '#f57c00',
          color: '#fff',
          weight: 2,
          opacity: 0.9,
          fillOpacity: 0.8,
        })

        marker.bindPopup(`<strong>Cluster: ${cluster.length} events</strong><br/>Avg Mag: ${avgMag.toFixed(2)}`)
        marker.on('click', () => onClusterClick({ ...firstEv, index: 0 }))
        groupRef.current!.addLayer(marker)
      }
    })

    groupRef.current.addTo(map)
  }, [events, isEnabled, map, onClusterClick])
>>>>>>> ff17395 (1)

  return null
}

<<<<<<< HEAD
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
=======
export default function EarthquakeMap() {
  const [events, setEvents] = useState<Earthquake[]>([])
  const [selectedEvent, setSelectedEvent] = useState<SelectedEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showClusters, setShowClusters] = useState(false)
  const [showMarkers, setShowMarkers] = useState(true)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchEarthquakes({ limit: 100 })
        setEvents(Array.isArray(data) ? data : [])
        setLoading(false)
      } catch (e) {
        console.error('Failed to load earthquakes', e)
        setLoading(false)
      }
    }
    load()
  }, [])
>>>>>>> ff17395 (1)

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
<<<<<<< HEAD
        cluster_id: parsed.cluster_id || null
      }
      if (!passesFilters(ev)) return
=======
      }
>>>>>>> ff17395 (1)
      setEvents((prev) => [ev, ...prev].slice(0, 150))
    } catch (e) {
      console.warn('Non-JSON ws message', msg)
    }
  })

  useEffect(() => {
<<<<<<< HEAD
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
=======
    // debug selected event changes
    // eslint-disable-next-line no-console
    console.debug('selectedEvent changed', selectedEvent)
  }, [selectedEvent])

  const getMagnitudeColor = (mag?: number | string) => {
    const m = typeof mag === 'string' ? parseFloat(mag) : mag || 0
    if (m >= 6) return '#d32f2f'
    if (m >= 5) return '#f57c00'
>>>>>>> ff17395 (1)
    if (m >= 4) return '#fbc02d'
    if (m >= 3) return '#388e3c'
    return '#1976d2'
  }

<<<<<<< HEAD
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
=======
  

  if (loading) {
    return <div className="w-full h-96 flex items-center justify-center bg-slate-100">Loading map...</div>
  }

  return (
    <div className="w-full">
      {/* Controls Container (outside map, never clipped) */}
      <div className="bg-white p-3 rounded-lg shadow-md space-y-2 mb-2">
        <div className="font-semibold text-sm">Map Layers</div>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showMarkers}
              onChange={(e) => setShowMarkers(e.target.checked)}
            />
            Markers
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={(e) => setShowHeatmap(e.target.checked)}
            />
            Heatmap
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showClusters}
              onChange={(e) => setShowClusters(e.target.checked)}
            />
            Clusters
          </label>
        </div>
      </div>

      {/* Map Container */}
      <div className="relative w-full bg-slate-200 rounded-lg overflow-hidden shadow-md">
        <MapContainer
          center={[37.8, -95.5] as [number, number]}
          zoom={4}
          style={{ width: '100%', height: '24rem' }}
          ref={mapRef as any}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />

          <HeatmapLayer events={events} isVisible={showHeatmap} />
          <ClusteringLayer events={events} isEnabled={showClusters} onClusterClick={setSelectedEvent} />

          {showMarkers &&
            events.map((ev, idx) => {
              const lat = typeof ev.latitude === 'string' ? parseFloat(ev.latitude) : ev.latitude
              const lon = typeof ev.longitude === 'string' ? parseFloat(ev.longitude) : ev.longitude
              const mag = typeof ev.magnitude === 'string' ? parseFloat(ev.magnitude) : ev.magnitude

              if (!lat || !lon) return null

              return (
                <CircleMarker
                  key={ev.id || idx}
                  center={[lat, lon] as [number, number]}
                  pathOptions={{
                    fillColor: getMagnitudeColor(mag),
                    color: '#ffffff',
                    weight: 1,
                    opacity: 0.8,
                    fillOpacity: 0.7,
                  }}
                  radius={Math.max(4, Math.min(15, (mag || 0) * 2))}
                  interactive={true}
                  eventHandlers={{
                    click: () => {
                      console.debug('marker clicked', ev)
                      setSelectedEvent({ ...ev, index: idx })
                    },
                  }}
                />
              )
            })}

        </MapContainer>

        {/* Floating popup positioned near the selected event on the map */}
        {selectedEvent && mapRef.current && (
          <FloatingPopupOverlay
            event={selectedEvent}
            map={mapRef.current}
            onClose={() => setSelectedEvent(null)}
          />
        )}
      </div>
>>>>>>> ff17395 (1)
    </div>
  )
}
