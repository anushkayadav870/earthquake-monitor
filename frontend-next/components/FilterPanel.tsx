'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchClusteringConfig, updateClusteringConfig, type ClusteringConfig } from '../lib/api'

export type MapFilters = {
  magnitudeMode: 'minimum' | 'range' | 'exact'
  magnitudeMin: number
  magnitudeMax: number
  magnitudeExact: number
  timeRangeHours: number
  showMarkers: boolean
  showHeatmap: boolean
  showClusters: boolean
  clusteringConfig: ClusteringConfig
  heatmapWeightBy: 'magnitude' | 'count' | 'energy' | 'depth'
  heatmapRadius: number
  heatmapBlur: number
  showGraph: boolean
  // Graph Relationship Filters
  showEpicenters: boolean
  showAftershocks: boolean
  showForeshocks: boolean
  showTriggered: boolean
  showNear: boolean
  selectedEventId?: string
}

type FilterPanelProps = {
  initial?: Partial<MapFilters>
  onApply: (filters: MapFilters) => void
}

const DEFAULT_CLUSTERING_CONFIG: ClusteringConfig = {
  eps_km: 50,
  time_window_hours: 48,
  min_samples: 3,
}

export default function FilterPanel({ initial, onApply }: FilterPanelProps) {
  const [magnitudeMode, setMagnitudeMode] = useState<'minimum' | 'range' | 'exact'>(initial?.magnitudeMode ?? 'minimum')
  const [magnitudeMin, setMagnitudeMin] = useState(initial?.magnitudeMin ?? 3)
  const [magnitudeMax, setMagnitudeMax] = useState(initial?.magnitudeMax ?? 8)
  const [magnitudeExact, setMagnitudeExact] = useState(initial?.magnitudeExact ?? 5)
  const [timeRangeHours, setTimeRangeHours] = useState(initial?.timeRangeHours ?? 24)

  const [showMarkers, setShowMarkers] = useState(initial?.showMarkers ?? true)
  const [showHeatmap, setShowHeatmap] = useState(initial?.showHeatmap ?? false)
  const [showClusters, setShowClusters] = useState(initial?.showClusters ?? true)

  const [clusteringConfig, setClusteringConfig] = useState<ClusteringConfig>(
    initial?.clusteringConfig ?? DEFAULT_CLUSTERING_CONFIG
  )
  const [heatmapWeightBy, setHeatmapWeightBy] = useState<'magnitude' | 'count' | 'energy' | 'depth'>(initial?.heatmapWeightBy ?? 'magnitude')
  const [heatmapRadius, setHeatmapRadius] = useState(initial?.heatmapRadius ?? 30)
  const [heatmapBlur, setHeatmapBlur] = useState(initial?.heatmapBlur ?? 20)
  const [showGraph, setShowGraph] = useState(initial?.showGraph ?? false)

  // Graph Relationship State
  const [showEpicenters, setShowEpicenters] = useState(initial?.showEpicenters ?? true)
  const [showAftershocks, setShowAftershocks] = useState(initial?.showAftershocks ?? true)
  const [showForeshocks, setShowForeshocks] = useState(initial?.showForeshocks ?? true)
  const [showTriggered, setShowTriggered] = useState(initial?.showTriggered ?? true)
  const [showNear, setShowNear] = useState(initial?.showNear ?? true)

  const [isReClustering, setIsReClustering] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Fetch current clustering config on mount
  useEffect(() => {
    fetchClusteringConfig()
      .then(setClusteringConfig)
      .catch((e) => console.warn('Failed to fetch clustering config', e))
  }, [])

  // Auto-recluster when clustering config changes (reduced debounce for faster response)
  useEffect(() => {
    if (!showClusters) return
    const timer = setTimeout(async () => {
      try {
        setIsReClustering(true)
        await updateClusteringConfig(clusteringConfig)
      } catch (e) {
        console.error('Failed to update clustering config', e)
      } finally {
        // Keep indicator visible while backend processes
        setTimeout(() => setIsReClustering(false), 4000)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [clusteringConfig, showClusters])

  const buildFilters = useCallback((): MapFilters => ({
    magnitudeMode, magnitudeMin, magnitudeMax, magnitudeExact, timeRangeHours,
    showMarkers, showHeatmap, showClusters, clusteringConfig,
    heatmapWeightBy, heatmapRadius, heatmapBlur, showGraph,
    showEpicenters, showAftershocks, showForeshocks, showTriggered, showNear
  }), [magnitudeMode, magnitudeMin, magnitudeMax, magnitudeExact, timeRangeHours, showMarkers, showHeatmap, showClusters, clusteringConfig, heatmapWeightBy, heatmapRadius, heatmapBlur, showGraph, showEpicenters, showAftershocks, showForeshocks, showTriggered, showNear])

  // Auto-apply on any filter change
  useEffect(() => {
    onApply(buildFilters())
  }, [magnitudeMode, magnitudeMin, magnitudeMax, magnitudeExact, timeRangeHours, showMarkers, showHeatmap, showClusters, heatmapWeightBy, heatmapRadius, heatmapBlur, showGraph, showEpicenters, showAftershocks, showForeshocks, showTriggered, showNear])

  const handleReset = () => {
    setMagnitudeMode('minimum')
    setMagnitudeMin(3)
    setMagnitudeMax(8)
    setMagnitudeExact(5)
    setTimeRangeHours(24)
    setShowMarkers(true)
    setShowHeatmap(false)
    setShowClusters(true)
    setClusteringConfig(DEFAULT_CLUSTERING_CONFIG)
    setHeatmapWeightBy('magnitude')
    setHeatmapRadius(30)
    setHeatmapBlur(20)
    setHeatmapBlur(20)
    setShowGraph(false)
    setShowEpicenters(true)
    setShowAftershocks(true)
    setShowForeshocks(true)
    setShowTriggered(true)
    setShowNear(true)
  }

  return (
    <div className="bg-white/95 backdrop-blur rounded-2xl shadow-lg border border-slate-100 p-4 space-y-3 max-h-[85vh] overflow-y-auto text-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Filters</h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-green-50 text-green-700">Live</span>
          <button
            onClick={() => setCollapsed(v => !v)}
            className="text-xs px-2 py-0.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            {collapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* SECTION 1: Visualization Layers */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Visualization</div>
            <div className="flex flex-wrap gap-1.5">
              <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-all ${showMarkers ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-slate-50 text-slate-600 border border-slate-100'}`}>
                <input type="checkbox" checked={showMarkers} onChange={e => setShowMarkers(e.target.checked)} className="sr-only" />
                <span className={`w-2 h-2 rounded-full ${showMarkers ? 'bg-blue-500' : 'bg-slate-300'}`}></span>
                Markers
              </label>
              <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-all ${showHeatmap ? 'bg-orange-100 text-orange-800 border border-orange-200' : 'bg-slate-50 text-slate-600 border border-slate-100'}`}>
                <input type="checkbox" checked={showHeatmap} onChange={e => setShowHeatmap(e.target.checked)} className="sr-only" />
                <span className={`w-2 h-2 rounded-full ${showHeatmap ? 'bg-orange-500' : 'bg-slate-300'}`}></span>
                Heatmap
              </label>
              <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-all ${showClusters ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-slate-50 text-slate-600 border border-slate-100'}`}>
                <input type="checkbox" checked={showClusters} onChange={e => setShowClusters(e.target.checked)} className="sr-only" />
                <span className={`w-2 h-2 rounded-full ${showClusters ? 'bg-purple-500' : 'bg-slate-300'}`}></span>
                Clusters
                {isReClustering && <span className="ml-1 text-[10px] animate-pulse">⏳</span>}
              </label>
              <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-all ${showGraph ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' : 'bg-slate-50 text-slate-600 border border-slate-100'}`}>
                <input type="checkbox" checked={showGraph} onChange={e => setShowGraph(e.target.checked)} className="sr-only" />
                <span className={`w-2 h-2 rounded-full ${showGraph ? 'bg-indigo-500' : 'bg-slate-300'}`}></span>
                Graph
              </label>
            </div>
          </div>


          {/* SECTION 1c: Graph Relationship Filters (Conditional on Show Graph) */}
          {showGraph && (
            <div className="space-y-2 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100/50">
              <div className="text-xs font-medium text-indigo-700 uppercase tracking-wide flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                Graph Relationships
              </div>
              <div className="flex flex-wrap gap-1.5">
                <label className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer text-[10px] font-bold transition-all border ${showEpicenters ? 'bg-indigo-100 text-indigo-800 border-indigo-200' : 'bg-white text-slate-500 border-slate-200'}`}>
                  <input type="checkbox" checked={showEpicenters} onChange={e => setShowEpicenters(e.target.checked)} className="sr-only" />
                  Epicenters
                </label>
                <label className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer text-[10px] font-bold transition-all border ${showAftershocks ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-white text-slate-500 border-slate-200'}`}>
                  <input type="checkbox" checked={showAftershocks} onChange={e => setShowAftershocks(e.target.checked)} className="sr-only" />
                  Aftershocks
                </label>
                <label className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer text-[10px] font-bold transition-all border ${showForeshocks ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-white text-slate-500 border-slate-200'}`}>
                  <input type="checkbox" checked={showForeshocks} onChange={e => setShowForeshocks(e.target.checked)} className="sr-only" />
                  Foreshocks
                </label>
                <label className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer text-[10px] font-bold transition-all border ${showTriggered ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-white text-slate-500 border-slate-200'}`}>
                  <input type="checkbox" checked={showTriggered} onChange={e => setShowTriggered(e.target.checked)} className="sr-only" />
                  Triggered
                </label>
                <label className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer text-[10px] font-bold transition-all border ${showNear ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-white text-slate-500 border-slate-200'}`}>
                  <input type="checkbox" checked={showNear} onChange={e => setShowNear(e.target.checked)} className="sr-only" />
                  Nearby
                </label>
              </div>
            </div>
          )}

          {/* SECTION 1b: Heatmap Options (Conditional) */}
          {showHeatmap && (
            <div className="space-y-3 bg-orange-50/50 p-3 rounded-xl border border-orange-100/50">
              <div className="text-xs font-medium text-orange-700 uppercase tracking-wide flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                Heatmap Settings
              </div>

              {/* Weight By */}
              <div className="space-y-1.5">
                <div className="text-[11px] text-orange-800 font-medium">Weight Intensity By</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['magnitude', 'count', 'energy', 'depth'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setHeatmapWeightBy(mode)}
                      className={`px-2 py-1.5 text-[10px] rounded-md border capitalize transition-all ${heatmapWeightBy === mode ? 'bg-white border-orange-300 text-orange-800 shadow-sm' : 'bg-transparent border-orange-100 text-orange-600 hover:bg-white/50'}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Radius & Blur */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-orange-800">
                    <span>Radius</span>
                    <span className="font-mono">{heatmapRadius}px</span>
                  </div>
                  <input type="range" min={5} max={100} step={1} value={heatmapRadius}
                    onChange={e => setHeatmapRadius(parseInt(e.target.value))}
                    className="w-full accent-orange-500 h-1" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-orange-800">
                    <span>Blur</span>
                    <span className="font-mono">{heatmapBlur}px</span>
                  </div>
                  <input type="range" min={1} max={50} step={1} value={heatmapBlur}
                    onChange={e => setHeatmapBlur(parseInt(e.target.value))}
                    className="w-full accent-orange-500 h-1" />
                </div>
              </div>
            </div>
          )}

          <hr className="border-slate-100" />

          {/* SECTION 2: Data Filters */}
          <div className="space-y-3">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Data Filters</div>

            {/* Magnitude */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Magnitude</span>
                <span className="text-xs font-mono text-slate-500">
                  {magnitudeMode === 'minimum' && `≥${magnitudeMin.toFixed(1)}`}
                  {magnitudeMode === 'range' && `${magnitudeMin.toFixed(1)}-${magnitudeMax.toFixed(1)}`}
                  {magnitudeMode === 'exact' && `=${magnitudeExact.toFixed(1)}`}
                </span>
              </div>

              {/* Mode tabs */}
              <div className="flex rounded-lg bg-slate-100 p-0.5">
                {(['minimum', 'range', 'exact'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setMagnitudeMode(mode)}
                    className={`flex-1 px-2 py-1 text-xs rounded-md transition-all ${magnitudeMode === mode ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {mode === 'minimum' ? 'Min' : mode === 'range' ? 'Range' : 'Exact'}
                  </button>
                ))}
              </div>

              {/* Sliders based on mode */}
              {magnitudeMode === 'minimum' && (
                <input type="range" min={0} max={9} step={0.1} value={magnitudeMin}
                  onChange={e => setMagnitudeMin(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600 h-1.5" />
              )}
              {magnitudeMode === 'range' && (
                <div className="space-y-1">
                  <input type="range" min={0} max={9} step={0.1} value={magnitudeMin}
                    onChange={e => setMagnitudeMin(Math.min(parseFloat(e.target.value), magnitudeMax - 0.1))}
                    className="w-full accent-emerald-500 h-1.5" />
                  <input type="range" min={0} max={9} step={0.1} value={magnitudeMax}
                    onChange={e => setMagnitudeMax(Math.max(parseFloat(e.target.value), magnitudeMin + 0.1))}
                    className="w-full accent-rose-500 h-1.5" />
                </div>
              )}
              {magnitudeMode === 'exact' && (
                <input type="range" min={0} max={9} step={0.1} value={magnitudeExact}
                  onChange={e => setMagnitudeExact(parseFloat(e.target.value))}
                  className="w-full accent-purple-600 h-1.5" />
              )}
            </div>

            {/* Time Range (for data fetch) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Show events from</span>
                <span className="text-xs font-mono text-slate-500">Last {timeRangeHours}h</span>
              </div>
              <input type="range" min={1} max={168} step={1} value={timeRangeHours}
                onChange={e => setTimeRangeHours(parseInt(e.target.value))}
                className="w-full accent-sky-600 h-1.5" />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>1h</span><span>84h</span><span>7 days</span>
              </div>
            </div>
          </div>

          {/* SECTION 3: Clustering Algorithm (only when clusters enabled) */}
          {showClusters && (
            <>
              <hr className="border-slate-100" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Clustering Algorithm</div>
                  {isReClustering && <span className="text-[10px] text-purple-600 animate-pulse">Processing...</span>}
                </div>

                {/* Distance */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">Max Distance</span>
                    <span className="text-xs font-mono text-purple-600">{clusteringConfig.eps_km} km</span>
                  </div>
                  <input type="range" min={10} max={200} step={5} value={clusteringConfig.eps_km}
                    onChange={e => setClusteringConfig(prev => ({ ...prev, eps_km: parseInt(e.target.value) }))}
                    className="w-full accent-purple-600 h-1.5" />
                </div>

                {/* Cluster Time Window */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">Max Time Gap</span>
                    <span className="text-xs font-mono text-purple-600">{clusteringConfig.time_window_hours}h</span>
                  </div>
                  <input type="range" min={1} max={168} step={1} value={clusteringConfig.time_window_hours}
                    onChange={e => setClusteringConfig(prev => ({ ...prev, time_window_hours: parseInt(e.target.value) }))}
                    className="w-full accent-purple-600 h-1.5" />
                </div>

                {/* Min Events */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">Min Events per Cluster</span>
                    <span className="text-xs font-mono text-purple-600">{clusteringConfig.min_samples}</span>
                  </div>
                  <input type="range" min={2} max={10} step={1} value={clusteringConfig.min_samples}
                    onChange={e => setClusteringConfig(prev => ({ ...prev, min_samples: parseInt(e.target.value) }))}
                    className="w-full accent-purple-600 h-1.5" />
                </div>
              </div>
            </>
          )}

          {/* Reset button only */}
          <button
            onClick={handleReset}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Reset All
          </button>
        </>
      )}
    </div>
  )
}
