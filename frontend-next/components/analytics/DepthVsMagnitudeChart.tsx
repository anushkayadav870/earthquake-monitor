'use client'

import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

export type DepthMagnitudePoint = {
  magnitude: number
  depth: number
}

export default function DepthVsMagnitudeChart({ data }: { data: DepthMagnitudePoint[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6">
      <h3 className="text-lg font-semibold mb-4">Depth vs Magnitude</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" dataKey="magnitude" name="Magnitude" />
            <YAxis type="number" dataKey="depth" name="Depth" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={data} fill="#f97316" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
