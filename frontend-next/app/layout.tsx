import './globals.css'
import './globals.css'

export const metadata = {
  title: 'Earthquake Monitor',
  description: 'Real-time earthquake monitoring dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900">
        <main className="w-full h-screen">
          {children}
        </main>
      </body>
    </html>
  )
}
