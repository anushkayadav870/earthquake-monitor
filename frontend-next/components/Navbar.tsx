"use client"

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <a href="/" className="font-semibold text-lg tracking-tight">
          🌍 Earthquake Monitor
        </a>
        <div className="flex items-center gap-4 text-sm font-medium">
          <a href="/" className="text-slate-600 hover:text-indigo-600 transition-colors">Map</a>
          <a href="/analytics" className="text-slate-600 hover:text-indigo-600 transition-colors">Analytics</a>
          <a href="/live-feed" className="text-indigo-600 font-bold hover:underline">Live Feed</a>
        </div>
      </div>
    </nav>
  )
}
