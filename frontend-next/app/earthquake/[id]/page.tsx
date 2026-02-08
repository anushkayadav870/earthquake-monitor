'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { fetchEarthquakeDetail } from '../../../lib/api'
import EarthquakeDetailCard from '../../../components/EarthquakeDetailCard'
import AftershockTimeline from '../../../components/AftershockTimeline'
import RelationshipSummary from '../../../components/RelationshipSummary'

export default function EarthquakeDetailPage() {
  const params = useParams()
  const eventId = Array.isArray(params?.id) ? params?.id[0] : params?.id

  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!eventId) return
      try {
        const data = await fetchEarthquakeDetail(eventId)
        setDetail(data)
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
    </div>
  )
}
