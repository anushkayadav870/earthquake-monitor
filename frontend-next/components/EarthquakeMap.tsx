'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchEarthquakes } from '../lib/api'
import useWebSocket from '../hooks/useWebSocket'
import FilterPanel from './FilterPanel'

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
  time?: number | string
  latitude?: number | string
  longitude?: number | string
  depth?: number | string
}

type SelectedEvent = Earthquake & { index: number }

type MapFilters = {
  magMin: number
  magMax: number
  timeRangeHours: number
}

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
            <div className="text-xs text-slate-500">{formatTime(event.time)}</div>
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

        {event.id && (
          <div className="mt-3">
            <a
              href={`/earthquake/${event.id}`}
              className="text-xs text-indigo-600 hover:underline"
            >
              View details →
            </a>
          </div>
        )}
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
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
      return
    }

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

    if (layerRef.current) {
      map.removeLayer(layerRef.current)
    }

    try {
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
          })
          group.addLayer(circle)
        })
        layerRef.current = group
      }
      layerRef.current.addTo(map)
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
}) {
  const map = useMap()
  const groupRef = useRef<L.FeatureGroup | null>(null)

  useEffect(() => {
    console.debug('ClusteringLayer useEffect', { isEnabled, eventCount: events.length })
    
    if (!isEnabled) {
      if (groupRef.current) {
        console.debug('Removing cluster layer')
        map.removeLayer(groupRef.current)
        groupRef.current = null
      }
      return
    }

    if (groupRef.current) {
      map.removeLayer(groupRef.current)
    }

    groupRef.current = L.featureGroup()

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

  return null
}

export default function EarthquakeMap() {
  const [filters, setFilters] = useState<MapFilters>({
    magMin: 3,
    magMax: 8,
    timeRangeHours: 24,
  })
  const [events, setEvents] = useState<Earthquake[]>([])
  const [selectedEvent, setSelectedEvent] = useState<SelectedEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showClusters, setShowClusters] = useState(false)
  const [showMarkers, setShowMarkers] = useState(true)
  const mapRef = useRef<L.Map | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [playIndex, setPlayIndex] = useState(0)
  const [speedMs, setSpeedMs] = useState(500)

  const { magMin, magMax, timeRangeHours } = filters

  const passesFilters = (ev: Earthquake) => {
    const mag = typeof ev.magnitude === 'string' ? parseFloat(ev.magnitude) : ev.magnitude || 0
    let time = typeof ev.time === 'string' ? parseInt(ev.time) : ev.time || 0
    // normalize seconds to milliseconds if needed
    if (time > 0 && time < 1_000_000_000_000) {
      time = time * 1000
    }
    const now = Date.now()
    const withinTime = timeRangeHours
      ? time >= now - timeRangeHours * 60 * 60 * 1000
      : true
    const withinMag = mag >= magMin && mag <= magMax
    return withinTime && withinMag
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

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchEarthquakes({
          limit: 200,
          mag_min: magMin,
          mag_max: magMax,
        })
        const list = Array.isArray(data) ? data : []
        setEvents(list.filter(passesFilters))
        setLoading(false)
      } catch (e) {
        console.error('Failed to load earthquakes', e)
        setLoading(false)
      }
    }
    load()
  }, [magMin, magMax, timeRangeHours])

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
      }
      if (!passesFilters(ev)) return
      setEvents((prev) => [ev, ...prev].slice(0, 150))
    } catch (e) {
      console.warn('Non-JSON ws message', msg)
    }
  })

  useEffect(() => {
    if (!isPlaying) {
      setPlayIndex(sortedEvents.length)
    }
  }, [isPlaying, sortedEvents.length])

  useEffect(() => {
    if (!isPlaying) return
    if (sortedEvents.length === 0) return

    const interval = window.setInterval(() => {
      setPlayIndex((prev) => {
        const next = prev + 1
        if (next >= sortedEvents.length) {
          setIsPlaying(false)
          return sortedEvents.length
        }
        return next
      })
    }, speedMs)

    return () => window.clearInterval(interval)
  }, [isPlaying, sortedEvents.length, speedMs])

  useEffect(() => {
    // debug selected event changes
    // eslint-disable-next-line no-console
    console.debug('selectedEvent changed', selectedEvent)
  }, [selectedEvent])

  const getMagnitudeColor = (mag?: number | string) => {
    const m = typeof mag === 'string' ? parseFloat(mag) : mag || 0
    if (m >= 6) return '#d32f2f'
    if (m >= 5) return '#f57c00'
    if (m >= 4) return '#fbc02d'
    if (m >= 3) return '#388e3c'
    return '#1976d2'
  }

  

  if (loading) {
    return <div className="w-full h-96 flex items-center justify-center bg-slate-100">Loading map...</div>
  }

  return (
    <div className="w-full">
      {/* Map Container */}
      <div className="relative w-full bg-slate-200 rounded-lg overflow-hidden shadow-md">
        <MapContainer
          center={[37.8, -95.5] as [number, number]}
          zoom={4}
          style={{ width: '100%', height: '40rem' }}
          ref={mapRef as any}
          zoomControl={false}
        >
          <ZoomControl position="bottomright" />
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />

          <HeatmapLayer events={visibleEvents} isVisible={showHeatmap} />
          <ClusteringLayer events={visibleEvents} isEnabled={showClusters} onClusterClick={setSelectedEvent} />

          {showMarkers &&
            visibleEvents.map((ev, idx) => {
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

        {/* Filters overlay inside the map */}
        <div className="absolute top-4 right-4 w-80 max-w-[90vw] pointer-events-auto z-[9999]">
          <FilterPanel initial={filters} onApply={setFilters} />
        </div>

        {/* Map layers overlay inside the map */}
        <div className="absolute top-4 left-4 bg-white/95 backdrop-blur rounded-lg shadow-md px-3 py-2 space-y-2 text-sm pointer-events-auto z-[9999]">
          <div className="font-semibold text-xs uppercase tracking-wide text-slate-500">Layers</div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showMarkers}
              onChange={(e) => setShowMarkers(e.target.checked)}
            />
            Markers
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={(e) => setShowHeatmap(e.target.checked)}
            />
            Heatmap
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showClusters}
              onChange={(e) => setShowClusters(e.target.checked)}
            />
            Clusters
          </label>
        </div>

        {/* Timelapse controls overlay */}
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur rounded-lg shadow-md px-3 py-2 space-y-2 text-sm pointer-events-auto z-[9999] w-72">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-xs uppercase tracking-wide text-slate-500">Timelapse</div>
            <button
              onClick={() => {
                if (!isPlaying && playIndex >= sortedEvents.length) {
                  setPlayIndex(0)
                }
                setIsPlaying((v) => !v)
              }}
              className="text-xs px-2 py-1 rounded-md bg-slate-900 text-white hover:bg-slate-700"
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
          </div>
          <div className="text-xs text-slate-500">{playIndex}/{sortedEvents.length} events</div>
          <input
            type="range"
            min={0}
            max={sortedEvents.length}
            step={1}
            value={Math.min(playIndex, sortedEvents.length)}
            onChange={(e) => {
              setIsPlaying(false)
              setPlayIndex(parseInt(e.target.value))
            }}
            className="w-full accent-indigo-600"
          />
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">Speed</div>
            <select
              value={speedMs}
              onChange={(e) => setSpeedMs(parseInt(e.target.value))}
              className="text-xs border border-slate-200 rounded-md px-2 py-1"
            >
              <option value={1000}>1x</option>
              <option value={500}>2x</option>
              <option value={250}>4x</option>
              <option value={125}>8x</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
