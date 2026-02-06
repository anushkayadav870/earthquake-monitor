'use client'

import { useEffect, useState } from 'react'
import { fetchAnalytics } from '../../lib/api'
import MagnitudeDistributionChart, { type MagnitudeBucket } from '../../components/analytics/MagnitudeDistributionChart'
import TrendAnalysisChart, { type TrendPoint } from '../../components/analytics/TrendAnalysisChart'
import DepthVsMagnitudeChart, { type DepthMagnitudePoint } from '../../components/analytics/DepthVsMagnitudeChart'
import TopRegionsChart, { type RegionCount } from '../../components/analytics/TopRegionsChart'

export default function AnalyticsPage() {
  const [magnitudeBuckets, setMagnitudeBuckets] = useState<MagnitudeBucket[]>([])
  const [trends, setTrends] = useState<TrendPoint[]>([])
  const [depthMagnitude, setDepthMagnitude] = useState<DepthMagnitudePoint[]>([])
  const [regions, setRegions] = useState<RegionCount[]>([])
  const [loading, setLoading] = useState(true)

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
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="space-y-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
        <p className="text-slate-600 text-lg">Trends, distributions, and regional insights</p>
      </header>

      {loading && (
        <div className="w-full h-64 bg-slate-100 rounded-lg animate-pulse" />
      )}

      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MagnitudeDistributionChart data={magnitudeBuckets} />
          <TrendAnalysisChart data={trends} />
          <DepthVsMagnitudeChart data={depthMagnitude} />
          <TopRegionsChart data={regions} />
        </div>
      )}
    </div>
  )
}
