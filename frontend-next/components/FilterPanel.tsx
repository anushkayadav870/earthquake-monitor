'use client'

import { useState } from 'react'

export type MapFilters = {
  magMin: number
  magMax: number
  timeRangeHours: number
}

type FilterPanelProps = {
  initial?: MapFilters
  onApply: (filters: MapFilters) => void
}

export default function FilterPanel({ initial, onApply }: FilterPanelProps) {
  const [magMin, setMagMin] = useState(initial?.magMin ?? 3)
  const [magMax, setMagMax] = useState(initial?.magMax ?? 8)
  const [timeRangeHours, setTimeRangeHours] = useState(initial?.timeRangeHours ?? 24)
  const [collapsed, setCollapsed] = useState(false)

  const handleApply = () => {
    onApply({ magMin, magMax, timeRangeHours })
    setCollapsed(true)
  }

  const handleReset = () => {
    const resetValues = { magMin: 3, magMax: 8, timeRangeHours: 24 }
    setMagMin(resetValues.magMin)
    setMagMax(resetValues.magMax)
    setTimeRangeHours(resetValues.timeRangeHours)
    onApply(resetValues)
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Filters</h3>
          <p className="text-xs text-slate-500">Refine what shows on the map</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-indigo-50 text-indigo-700">
            Live
          </span>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label="Toggle filters"
          >
            {collapsed ? 'Show' : 'Hide'}
          </button>
        </div>
      </div>

      {collapsed ? (
        <div className="text-xs text-slate-500">Filters hidden</div>
      ) : (
        <>

      <div className="flex gap-2">
        <button
          onClick={handleApply}
          className="flex-1 px-3 py-2 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-700"
        >
          Apply
        </button>
        <button
          onClick={handleReset}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          Reset
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Magnitude range</div>
          <div className="text-xs text-slate-500">
            {magMin.toFixed(1)} – {magMax.toFixed(1)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-600 space-y-1">
            <span className="inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Min: {magMin.toFixed(1)}
            </span>
            <input
              type="range"
              min={0}
              max={9}
              step={0.1}
              value={magMin}
              onChange={(e) => setMagMin(parseFloat(e.target.value))}
              className="w-full accent-emerald-600"
            />
          </label>
          <label className="text-xs text-slate-600 space-y-1">
            <span className="inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              Max: {magMax.toFixed(1)}
            </span>
            <input
              type="range"
              min={0}
              max={9}
              step={0.1}
              value={magMax}
              onChange={(e) => setMagMax(parseFloat(e.target.value))}
              className="w-full accent-rose-600"
            />
          </label>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Time range</div>
          <div className="text-xs text-slate-500">Last {timeRangeHours} hours</div>
        </div>
        <label className="text-xs text-slate-600 space-y-1">
          <span className="inline-flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-500" />
            Time window
          </span>
          <input
            type="range"
            min={1}
            max={168}
            step={1}
            value={timeRangeHours}
            onChange={(e) => setTimeRangeHours(parseInt(e.target.value))}
            className="w-full accent-sky-600"
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
          <div className="text-slate-500">Min Mag</div>
          <div className="font-semibold text-slate-800">{magMin.toFixed(1)}</div>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
          <div className="text-slate-500">Max Mag</div>
          <div className="font-semibold text-slate-800">{magMax.toFixed(1)}</div>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
          <div className="text-slate-500">Window</div>
          <div className="font-semibold text-slate-800">{timeRangeHours}h</div>
        </div>
      </div>
        </>
      )}
    </div>
  )
}
