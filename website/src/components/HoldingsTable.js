'use client'

import { useState, useMemo } from 'react'

export default function HoldingsTable({ holdings, loading }) {
  const [sortField, setSortField] = useState('symbol')
  const [sortDirection, setSortDirection] = useState('asc')
  const [searchSymbol, setSearchSymbol] = useState('')
  const [filterPnL, setFilterPnL] = useState('all')

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const filteredAndSortedHoldings = useMemo(() => {
    if (!holdings) return []

    let filtered = [...holdings]

    // Apply symbol search filter
    if (searchSymbol) {
      filtered = filtered.filter(holding =>
        holding.symbol?.toLowerCase().includes(searchSymbol.toLowerCase())
      )
    }

    // Apply P&L filter
    if (filterPnL !== 'all') {
      filtered = filtered.filter(holding => {
        const currentValue = holding.qty * holding.current_price
        const investedValue = holding.qty * holding.avg_price
        const pnl = currentValue - investedValue

        if (filterPnL === 'profit') {
          return pnl > 0
        } else if (filterPnL === 'loss') {
          return pnl < 0
        }
        return true
      })
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal, bVal

      switch (sortField) {
        case 'symbol':
          aVal = a.symbol || ''
          bVal = b.symbol || ''
          return sortDirection === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        case 'qty':
          aVal = a.qty || 0
          bVal = b.qty || 0
          break
        case 'avgPrice':
          aVal = a.avg_price || 0
          bVal = b.avg_price || 0
          break
        case 'currentPrice':
          aVal = a.current_price || 0
          bVal = b.current_price || 0
          break
        case 'value':
          aVal = (a.qty || 0) * (a.current_price || 0)
          bVal = (b.qty || 0) * (b.current_price || 0)
          break
        case 'pnl':
          aVal = (a.qty * a.current_price) - (a.qty * a.avg_price)
          bVal = (b.qty * b.current_price) - (b.qty * b.avg_price)
          break
        case 'pnlPercent':
          const aInvested = a.qty * a.avg_price
          const bInvested = b.qty * b.avg_price
          const aPnl = (a.qty * a.current_price) - aInvested
          const bPnl = (b.qty * b.current_price) - bInvested
          aVal = aInvested > 0 ? (aPnl / aInvested) * 100 : 0
          bVal = bInvested > 0 ? (bPnl / bInvested) * 100 : 0
          break
        default:
          return 0
      }

      if (sortDirection === 'asc') {
        return aVal - bVal
      } else {
        return bVal - aVal
      }
    })

    return filtered
  }, [holdings, sortField, sortDirection, searchSymbol, filterPnL])

  const SortIcon = ({ field }) => {
    if (sortField !== field) {
      return <span className="ml-1 text-gray-600">↕</span>
    }
    return <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-[#1a1a1a] rounded"></div>
        ))}
      </div>
    )
  }

  if (!holdings || holdings.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No holdings found
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search by symbol..."
            value={searchSymbol}
            onChange={(e) => setSearchSymbol(e.target.value)}
            className="w-full px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#00ff88]/50"
          />
        </div>
        <select
          value={filterPnL}
          onChange={(e) => setFilterPnL(e.target.value)}
          className="px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-white focus:outline-none focus:border-[#00ff88]/50"
        >
          <option value="all">All Holdings</option>
          <option value="profit">Profitable Only</option>
          <option value="loss">Loss-making Only</option>
        </select>
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-500">
        Showing {filteredAndSortedHoldings.length} of {holdings.length} holdings
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-[#1a1a1a]">
              <th
                className="pb-4 font-medium uppercase tracking-wider text-xs cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('symbol')}
              >
                Symbol <SortIcon field="symbol" />
              </th>
              <th
                className="pb-4 font-medium text-right uppercase tracking-wider text-xs cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('qty')}
              >
                Qty <SortIcon field="qty" />
              </th>
              <th
                className="pb-4 font-medium text-right uppercase tracking-wider text-xs cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('avgPrice')}
              >
                Avg Price <SortIcon field="avgPrice" />
              </th>
              <th
                className="pb-4 font-medium text-right uppercase tracking-wider text-xs cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('currentPrice')}
              >
                Current <SortIcon field="currentPrice" />
              </th>
              <th
                className="pb-4 font-medium text-right uppercase tracking-wider text-xs cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('value')}
              >
                Value <SortIcon field="value" />
              </th>
              <th
                className="pb-4 font-medium text-right uppercase tracking-wider text-xs cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('pnl')}
              >
                P&L <SortIcon field="pnl" />
              </th>
              <th
                className="pb-4 font-medium text-right uppercase tracking-wider text-xs cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('pnlPercent')}
              >
                % <SortIcon field="pnlPercent" />
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedHoldings.map((holding) => {
              const currentValue = holding.qty * holding.current_price
              const investedValue = holding.qty * holding.avg_price
              const pnl = currentValue - investedValue
              const pnlPercent = investedValue > 0 ? ((pnl / investedValue) * 100).toFixed(2) : 0
              const pnlColor = pnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'

              return (
                <tr key={holding.symbol} className="border-b border-[#1a1a1a]/50 table-row-hover">
                  <td className="py-4 font-semibold text-white">{holding.symbol}</td>
                  <td className="py-4 text-right text-gray-300 tabular-nums">{holding.qty}</td>
                  <td className="py-4 text-right text-gray-300 tabular-nums">₹{holding.avg_price?.toFixed(2)}</td>
                  <td className="py-4 text-right text-gray-300 tabular-nums">₹{holding.current_price?.toFixed(2)}</td>
                  <td className="py-4 text-right text-gray-300 tabular-nums">₹{currentValue.toFixed(2)}</td>
                  <td className={`py-4 text-right font-semibold tabular-nums ${pnlColor}`}>
                    {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)}
                  </td>
                  <td className={`py-4 text-right font-medium tabular-nums ${pnlColor}`}>
                    {pnl >= 0 ? '+' : ''}{pnlPercent}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filteredAndSortedHoldings.length === 0 && holdings.length > 0 && (
        <div className="text-center py-12 text-gray-500">
          No holdings match the current filters
        </div>
      )}
    </div>
  )
}
