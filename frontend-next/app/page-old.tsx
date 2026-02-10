import LiveFeed from '../components/LiveFeed'

export default function Home() {
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Earthquake Monitor</h1>
        <p className="text-slate-600">Live seismic events and analytics</p>
      </header>

      <section>
        <h2 className="text-xl font-semibold mb-2">Live Feed</h2>
        <LiveFeed />
      </section>
    </div>
  )
}
