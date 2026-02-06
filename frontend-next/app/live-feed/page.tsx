'use client'

import LiveFeed from '../../components/LiveFeed'

export default function LiveFeedPage() {
  return (
    <div className="space-y-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Live Feed</h1>
        <p className="text-slate-600 text-lg">Real-time earthquake updates</p>
      </header>
      <LiveFeed />
    </div>
  )
}
