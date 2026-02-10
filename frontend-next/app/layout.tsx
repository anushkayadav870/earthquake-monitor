import './globals.css'
<<<<<<< HEAD
import './globals.css'
=======
>>>>>>> ff17395 (1)

export const metadata = {
  title: 'Earthquake Monitor',
  description: 'Real-time earthquake monitoring dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900">
<<<<<<< HEAD
        <main className="w-full h-screen">
=======
        <main className="max-w-6xl mx-auto p-6">
>>>>>>> ff17395 (1)
          {children}
        </main>
      </body>
    </html>
  )
}
