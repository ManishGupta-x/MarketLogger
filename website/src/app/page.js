'use client'

import { useState, useMemo } from 'react'
import { useTicksSSE } from '@/lib/useSSE'
import StocksTable from '@/components/StocksTable'

export default function StocksPage() {
  const { stocks, connected } = useTicksSSE()
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('symbol')
  const [sortDir, setSortDir] = useState('asc')

  const filteredStocks = useMemo(() => {
    let filtered = stocks

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(s =>
        s.symbol?.toLowerCase().includes(searchLower)
      )
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase()
        bVal = bVal?.toLowerCase() || ''
      }

      if (sortDir === 'asc') {
        return aVal > bVal ? 1 : -1
      }
      return aVal < bVal ? 1 : -1
    })

    return filtered
  }, [stocks, search, sortField, sortDir])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Live Stocks</h1>
          <p className="text-gray-500 mt-1">
            {connected ? (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Connected - {stocks.length} stocks
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Disconnected
              </span>
            )}
          </p>
        </div>

        <input
          type="text"
          placeholder="Search symbol..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-full sm:w-64"
        />
      </div>

      {/* Table */}
      <div className="dashboard-card overflow-hidden">
        <StocksTable
          stocks={filteredStocks}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
        />
      </div>
    </div>
  )
}
