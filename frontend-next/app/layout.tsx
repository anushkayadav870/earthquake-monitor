import './globals.css'
import Navbar from '../components/Navbar'

export const metadata = {
  title: 'Earthquake Monitor',
  description: 'Real-time earthquake monitoring dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900">
        <Navbar />
        <main className="w-full px-6 py-6">
          {children}
        </main>
      </body>
    </html>
  )
}
