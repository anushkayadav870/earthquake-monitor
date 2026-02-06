'use client'

type RelationshipSummaryProps = {
  faultLines?: string[]
  regions?: string[]
  relatedEvents?: number
}

export default function RelationshipSummary({
  faultLines = [],
  regions = [],
  relatedEvents = 0,
}: RelationshipSummaryProps) {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6">
      <h2 className="text-lg font-semibold mb-4">Relationships</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Fault lines</div>
          <div className="font-semibold">
            {faultLines.length > 0 ? faultLines.join(', ') : 'N/A'}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Regions</div>
          <div className="font-semibold">
            {regions.length > 0 ? regions.join(', ') : 'N/A'}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs text-slate-500">Related events</div>
          <div className="font-semibold">{relatedEvents}</div>
        </div>
      </div>
    </div>
  )
}
