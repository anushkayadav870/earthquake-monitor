'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import FilterPanel, { type MapFilters } from './FilterPanel'

const EarthquakeMap = dynamic(() => import('./EarthquakeMap'), {
  ssr: false,
  loading: () => <div className="w-full h-[32rem] bg-slate-100 rounded-lg animate-pulse" />,
})

export default function MapWithFilters() {
  const [filters, setFilters] = useState<MapFilters>({
    magMin: 3,
    magMax: 8,
    timeRangeHours: 24,
  })

  return (
    <div className="relative">
      <EarthquakeMap filters={filters} />
      <div className="absolute top-4 right-4 w-80 max-w-[90vw]">
        <FilterPanel initial={filters} onApply={setFilters} />
      </div>
    </div>
  )
}