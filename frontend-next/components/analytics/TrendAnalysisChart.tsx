'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

export type TrendPoint = {
  label: string
  count: number
}

export default function TrendAnalysisChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6">
      <h3 className="text-lg font-semibold mb-4">Trend Analysis</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#14b8a6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
