"use client"

import { useEffect, useState } from 'react'
import AlertsPanel from '../components/AlertsPanel'
import AlertsHistory from '../components/AlertsHistory'
import SignificantEarthquakes from '../components/SignificantEarthquakes'
import MagnitudeDistributionChart from '../components/analytics/MagnitudeDistributionChart'
import TrendAnalysisChart from '../components/analytics/TrendAnalysisChart'
import DepthVsMagnitudeChart from '../components/analytics/DepthVsMagnitudeChart'
import TopRegionsChart from '../components/analytics/TopRegionsChart'
import { fetchAnalytics } from '../lib/api'

import dynamic from 'next/dynamic'

// Dynamic import to avoid Leaflet SSR issues
const EarthquakeMap = dynamic(() => import('../components/EarthquakeMap'), {
  ssr: false,
  loading: () => <div className="w-full h-[40rem] bg-slate-100 rounded-lg animate-pulse" />,
})

export default function Home() {
  const [magnitudeBuckets, setMagnitudeBuckets] = useState<any[]>([])
  const [trends, setTrends] = useState<any[]>([])
  const [depthMagnitude, setDepthMagnitude] = useState<any[]>([])
  const [regions, setRegions] = useState<any[]>([])
  const [analyticsLoading, setAnalyticsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [mag, trend, depth, region] = await Promise.all([
          fetchAnalytics('magnitude-distribution'),
          fetchAnalytics('trends'),
          fetchAnalytics('depth-magnitude'),
          fetchAnalytics('top-regions'),
        ])

        setMagnitudeBuckets(mag?.buckets || mag || [])
        setTrends(trend?.points || trend || [])
        setDepthMagnitude(depth?.points || depth || [])
        setRegions(region?.regions || region || [])
      } catch (e) {
        console.error('Failed to load analytics', e)
      } finally {
        setAnalyticsLoading(false)
      }
    }
    load()
  }, [])

  const fallbackMagnitude = [
    { bucket: '0-1', count: 4 },
    { bucket: '1-2', count: 12 },
    { bucket: '2-3', count: 22 },
    { bucket: '3-4', count: 15 },
    { bucket: '4-5', count: 9 },
    { bucket: '5-6', count: 4 },
    { bucket: '6+', count: 2 },
  ]

  const fallbackTrends = [
    { label: 'Mon', count: 6 },
    { label: 'Tue', count: 9 },
    { label: 'Wed', count: 4 },
    { label: 'Thu', count: 11 },
    { label: 'Fri', count: 7 },
    { label: 'Sat', count: 5 },
    { label: 'Sun', count: 8 },
  ]

  const fallbackDepth = [
    { magnitude: 2.4, depth: 8 },
    { magnitude: 3.1, depth: 14 },
    { magnitude: 4.2, depth: 22 },
    { magnitude: 5.0, depth: 35 },
    { magnitude: 5.6, depth: 18 },
    { magnitude: 6.3, depth: 52 },
  ]

  const fallbackRegions = [
    { region: 'California', count: 12 },
    { region: 'Alaska', count: 9 },
    { region: 'Japan', count: 7 },
    { region: 'Chile', count: 5 },
  ]
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)_20rem] gap-6">
      <aside className="hidden lg:block" />

      <div className="space-y-6">

        <section id="map" className="scroll-mt-24">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-2xl font-semibold">Map</h2>
            <span className="text-xs text-slate-500">Live view</span>
          </div>
          <EarthquakeMap />
        </section>

        <section className="scroll-mt-24">
          <h2 className="text-2xl font-semibold mb-3">Significant Earthquakes</h2>
          <SignificantEarthquakes />
        </section>


        <section id="analytics" className="scroll-mt-24">
          <h2 className="text-2xl font-semibold mb-3">Analytics</h2>
          {analyticsLoading && (
            <div className="w-full h-64 bg-slate-100 rounded-lg animate-pulse" />
          )}
          {!analyticsLoading && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <MagnitudeDistributionChart
                data={magnitudeBuckets.length ? magnitudeBuckets : fallbackMagnitude}
              />
              <TrendAnalysisChart data={trends.length ? trends : fallbackTrends} />
              <DepthVsMagnitudeChart
                data={depthMagnitude.length ? depthMagnitude : fallbackDepth}
              />
              <TopRegionsChart data={regions.length ? regions : fallbackRegions} />
            </div>
          )}
          {!analyticsLoading &&
            !magnitudeBuckets.length &&
            !trends.length &&
            !depthMagnitude.length &&
            !regions.length && (
              <div className="text-xs text-slate-500 mt-2">
                Showing sample analytics data (backend endpoints not returning data yet).
              </div>
            )}
        </section>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-24">
          <AlertsHistory />
        </div>
      </aside>
    </div>
  )
}
