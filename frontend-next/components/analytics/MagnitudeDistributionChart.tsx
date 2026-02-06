'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

export type MagnitudeBucket = {
  bucket: string
  count: number
}

export default function MagnitudeDistributionChart({ data }: { data: MagnitudeBucket[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6">
      <h3 className="text-lg font-semibold mb-4">Magnitude Distribution</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucket" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
