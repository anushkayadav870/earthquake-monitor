'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { fetchEarthquakeDetail, fetchNodeNeighbors } from '../../../lib/api'
import EarthquakeDetailCard from '../../../components/EarthquakeDetailCard'
import AftershockTimeline from '../../../components/AftershockTimeline'
import RelationshipSummary from '../../../components/RelationshipSummary'

export default function EarthquakeDetailPage() {
  const params = useParams()
  const eventId = Array.isArray(params?.id) ? params?.id[0] : params?.id

  const [detail, setDetail] = useState<any>(null)
  const [neighbors, setNeighbors] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!eventId) return
      try {
        const [earthquake, neighborhood] = await Promise.all([
          fetchEarthquakeDetail(eventId),
          fetchNodeNeighbors(eventId)
        ])
        setDetail(earthquake)
        setNeighbors(neighborhood)
      } catch (e: any) {
        setError(e?.message || 'Failed to load detail')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [eventId])

  if (loading) {
    return <div className="w-full h-96 flex items-center justify-center bg-slate-100">Loading…</div>
  }

  if (error) {
    return <div className="text-red-600">{error}</div>
  }

  return (
    <div className="space-y-6">
      <EarthquakeDetailCard detail={detail} />

      {neighbors && (
        <RelationshipSummary
          faultLines={neighbors.neighbors?.filter((n: any) => n.node.labels?.includes('FaultZone')).map((n: any) => n.node.name)}
          regions={neighbors.neighbors?.filter((n: any) => n.node.labels?.includes('Region') || n.node.labels?.includes('State')).map((n: any) => n.node.name)}
          relatedEvents={neighbors.neighbors?.filter((n: any) => ['AFTERSHOCK_OF', 'FORESHOCK_OF', 'TRIGGERED', 'NEAR'].includes(n.relationship?.type)).length}
        />
      )}
    </div>
  )
}
