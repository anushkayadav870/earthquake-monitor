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
    <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6 space-y-4">
      <h2 className="text-lg font-bold text-slate-800">Seismic Context</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="rounded-xl bg-rose-50 border border-rose-100 p-4">
          <div className="text-[10px] uppercase text-rose-500 font-black mb-1">Fault lines</div>
          <div className="font-bold text-rose-900">
            {faultLines.length > 0 ? faultLines.join(', ') : 'No fault zones detected'}
          </div>
        </div>
        <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4">
          <div className="text-[10px] uppercase text-indigo-500 font-black mb-1">Regions</div>
          <div className="font-bold text-indigo-900">
            {regions.length > 0 ? regions.join(', ') : 'Global/Uncategorized'}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
          <div className="text-[10px] uppercase text-slate-500 font-black mb-1">Related events</div>
          <div className="font-bold text-slate-700 text-lg">{relatedEvents}</div>
        </div>
      </div>
    </div>
  )
}
