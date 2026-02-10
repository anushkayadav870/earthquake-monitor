"use client"

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import DashboardLayout from '../components/DashboardLayout'
import { MapFilters } from '../components/FilterPanel'

// Dynamic import to avoid Leaflet SSR issues
const EarthquakeMap = dynamic(() => import('../components/EarthquakeMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-slate-900 flex items-center justify-center text-slate-500">Loading Map Engine...</div>,
})

const DEFAULT_FILTERS: MapFilters = {
  magnitudeMode: 'minimum',
  magnitudeMin: 3,
  magnitudeMax: 8,
  magnitudeExact: 5,
  timeRangeHours: 24,
  showMarkers: true,
  showHeatmap: false,
  showClusters: true,
  clusteringConfig: {
    eps_km: 50,
    time_window_hours: 48,
    min_samples: 3,
  },
  heatmapWeightBy: 'magnitude',
  heatmapRadius: 30,
  heatmapBlur: 20,
  showGraph: false,

  // Graph-specific filters
  showEpicenters: true,
  showAftershocks: true,
  showForeshocks: true,
  showTriggered: true,
  showNear: false
}

export default function Home() {
  const [filters, setFilters] = useState<MapFilters>(DEFAULT_FILTERS)
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)

  const [clusterStats, setClusterStats] = useState<{
    totalClusters: number
    totalEventsInClusters: number
    noiseEvents: number
  } | undefined>(undefined)

  return (
    <DashboardLayout
      filters={filters}
      onFilterChange={setFilters}
      selectedEvent={selectedEvent}
      onCloseSelected={() => setSelectedEvent(null)}
      clusterStats={clusterStats}
    >
      <EarthquakeMap
        filters={filters}
        onEventSelect={setSelectedEvent}
        onStatsUpdate={setClusterStats}
        selectedEventId={selectedEvent?.id}
      />
    </DashboardLayout>
  )
}
