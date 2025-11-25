'use client'

import { useState, useMemo } from 'react'
import { format } from 'date-fns'

export default function OrdersTable({ orders, loading }) {
  const [sortField, setSortField] = useState('timestamp')
  const [sortDirection, setSortDirection] = useState('desc')
  const [searchSymbol, setSearchSymbol] = useState('')
  const [filterType, setFilterType] = useState('all')

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const filteredAndSortedOrders = useMemo(() => {
    if (!orders) return []

    let filtered = [...orders]

    // Apply symbol search filter
    if (searchSymbol) {
      filtered = filtered.filter(order =>
        order.symbol?.toLowerCase().includes(searchSymbol.toLowerCase())
      )
    }

    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(order => {
        const orderType = order.order_type || order.type
        return orderType?.toLowerCase() === filterType.toLowerCase()
      })
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal, bVal

      switch (sortField) {
        case 'timestamp':
          aVal = a.timestamp ? new Date(a.timestamp).getTime() : 0
          bVal = b.timestamp ? new Date(b.timestamp).getTime() : 0
          break
        case 'symbol':
          aVal = a.symbol || ''
          bVal = b.symbol || ''
          return sortDirection === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        case 'type':
          aVal = (a.order_type || a.type || '').toLowerCase()
          bVal = (b.order_type || b.type || '').toLowerCase()
          return sortDirection === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        case 'qty':
          aVal = a.qty || 0
          bVal = b.qty || 0
          break
        case 'price':
          aVal = a.price || 0
          bVal = b.price || 0
          break
        case 'value':
          aVal = (a.qty || 0) * (a.price || 0)
          bVal = (b.qty || 0) * (b.price || 0)
          break
        case 'pnl':
          aVal = a.pnl || 0
          bVal = b.pnl || 0
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
  }, [orders, sortField, sortDirection, searchSymbol, filterType])

  const SortIcon = ({ field }) => {
    if (sortField !== field) {
      return <span className="ml-1 text-gray-600">↕</span>
    }
    return <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-12 bg-[#1a1a1a] rounded"></div>
        ))}
      </div>
    )
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No orders found
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
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-white focus:outline-none focus:border-[#00ff88]/50"
        >
          <option value="all">All Types</option>
          <option value="buy">Buy Only</option>
          <option value="sell">Sell Only</option>
        </select>
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-500">
        Showing {filteredAndSortedOrders.length} of {orders.length} orders
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-[#1a1a1a]">
              <th
                className="pb-4 font-medium uppercase tracking-wider text-xs cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('timestamp')}
              >
                Time <SortIcon field="timestamp" />
              </th>
              <th
                className="pb-4 font-medium uppercase tracking-wider text-xs cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('symbol')}
              >
                Symbol <SortIcon field="symbol" />
              </th>
              <th
                className="pb-4 font-medium uppercase tracking-wider text-xs cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('type')}
              >
                Type <SortIcon field="type" />
              </th>
              <th
                className="pb-4 font-medium text-right uppercase tracking-wider text-xs cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('qty')}
              >
                Qty <SortIcon field="qty" />
              </th>
              <th
                className="pb-4 font-medium text-right uppercase tracking-wider text-xs cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('price')}
              >
                Price <SortIcon field="price" />
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
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedOrders.map((order, index) => {
              const orderType = order.order_type || order.type
              const isBuy = orderType?.toUpperCase() === 'BUY'
              const typeColor = isBuy ? 'text-[#00ff88]' : 'text-[#ff4444]'
              const typeBg = isBuy ? 'bg-[#00ff88]/10' : 'bg-[#ff4444]/10'
              const pnl = order.pnl || 0
              const pnlColor = pnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'

              return (
                <tr key={`${order.id || index}`} className="border-b border-[#1a1a1a]/50 table-row-hover">
                  <td className="py-4 text-gray-400 tabular-nums">
                    {order.timestamp ? format(new Date(order.timestamp), 'MMM dd, HH:mm') : '-'}
                  </td>
                  <td className="py-4 font-semibold text-white">{order.symbol}</td>
                  <td className="py-4">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${typeColor} ${typeBg}`}>
                      {orderType?.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-4 text-right text-gray-300 tabular-nums">{order.qty}</td>
                  <td className="py-4 text-right text-gray-300 tabular-nums">₹{Number(order.price).toFixed(2)}</td>
                  <td className="py-4 text-right text-gray-300 tabular-nums">
                    ₹{(order.qty * order.price).toFixed(2)}
                  </td>
                  <td className={`py-4 text-right font-semibold tabular-nums ${pnlColor}`}>
                    {pnl !== 0 ? `${pnl >= 0 ? '+' : ''}₹${pnl.toFixed(2)}` : '-'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filteredAndSortedOrders.length === 0 && orders.length > 0 && (
        <div className="text-center py-12 text-gray-500">
          No orders match the current filters
        </div>
      )}
    </div>
  )
}
