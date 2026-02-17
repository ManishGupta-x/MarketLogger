'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Nav() {
  const pathname = usePathname()

  return (
    <nav className="fixed top-0 left-0 right-0 bg-black/90 backdrop-blur-sm border-b border-gray-800 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-white">MarketLogger</span>
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">LIVE</span>
          </div>

          <div className="flex gap-1">
            <Link
              href="/"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === '/'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              Stocks
            </Link>
            <Link
              href="/logs"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === '/logs'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              Logs
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
