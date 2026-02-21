'use client'

import { useCallback, useState } from 'react'

export default function StocksTable({ stocks, sortField, sortDir, onSort }) {
  const [expandedCards, setExpandedCards] = useState({})

  const toggleCard = (token) => {
    setExpandedCards(prev => ({ ...prev, [token]: !prev[token] }))
  }

  const logStock = useCallback((stock) => {
    console.log('='.repeat(50))
    console.log(`Stock: ${stock.symbol}`)
    console.log('='.repeat(50))
    console.log(JSON.stringify(stock, null, 2))
    console.log('='.repeat(50))
    alert(`Logged ${stock.symbol} to console. Press F12 to view.`)
  }, [])

  const formatPrice = (price) => {
    if (!price) return '-'
    return price.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  const formatChange = (change, price) => {
    if (!change || !price) return { text: '-', color: 'text-gray-500' }
    const percent = ((change / (price - change)) * 100).toFixed(2)
    const isPositive = change >= 0
    return {
      text: `${isPositive ? '+' : ''}${formatPrice(change)} (${isPositive ? '+' : ''}${percent}%)`,
      color: isPositive ? 'text-green-400' : 'text-red-400'
    }
  }

  const formatVolume = (vol) => {
    if (!vol) return '-'
    if (vol >= 10000000) return `${(vol / 10000000).toFixed(2)}Cr`
    if (vol >= 100000) return `${(vol / 100000).toFixed(2)}L`
    if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`
    return vol.toString()
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="text-gray-600 ml-1">↕</span>
    return <span className="text-blue-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const columns = [
    { key: 'symbol', label: 'Symbol' },
    { key: 'last_price', label: 'Price' },
    { key: 'change', label: 'Change' },
    { key: 'volume_traded', label: 'Volume' },
    { key: 'ohlc.open', label: 'Open' },
    { key: 'ohlc.high', label: 'High' },
    { key: 'ohlc.low', label: 'Low' },
    { key: 'ohlc.close', label: 'Prev Close' },
  ]

  return (
    <div>
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => onSort(col.key)}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                >
                  {col.label}
                  <SortIcon field={col.key} />
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {stocks.map((stock) => {
              const changeInfo = formatChange(stock.change, stock.last_price)
              return (
                <tr
                  key={stock.instrument_token}
                  className="table-row-hover transition-colors"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-medium text-white">{stock.symbol || `Token-${stock.instrument_token}`}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                    <span className="text-white font-medium">{formatPrice(stock.last_price)}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                    <span className={changeInfo.color}>{changeInfo.text}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-gray-400">
                    {formatVolume(stock.volume_traded)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-gray-400">
                    {formatPrice(stock.ohlc?.open)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-green-400">
                    {formatPrice(stock.ohlc?.high)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-red-400">
                    {formatPrice(stock.ohlc?.low)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-gray-400">
                    {formatPrice(stock.ohlc?.close)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      onClick={() => logStock(stock)}
                      className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
                    >
                      Log
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {/* Mobile Sort Options */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
          {columns.slice(0, 4).map(col => (
            <button
              key={col.key}
              onClick={() => onSort(col.key)}
              className={`flex-shrink-0 px-3 py-1.5 text-xs rounded-full transition-colors ${
                sortField === col.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400'
              }`}
            >
              {col.label}
              {sortField === col.key && (
                <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
              )}
            </button>
          ))}
        </div>

        {stocks.map((stock) => {
          const changeInfo = formatChange(stock.change, stock.last_price)
          const isExpanded = expandedCards[stock.instrument_token]

          return (
            <div
              key={stock.instrument_token}
              className="mobile-card"
            >
              {/* Main Stock Info - Always Visible */}
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleCard(stock.instrument_token)}
              >
                <div>
                  <div className="font-semibold text-white text-lg">
                    {stock.symbol || `Token-${stock.instrument_token}`}
                  </div>
                  <div className={`text-sm ${changeInfo.color}`}>
                    {changeInfo.text}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-white text-xl tabular-nums">
                    {formatPrice(stock.last_price)}
                  </div>
                  <div className="text-xs text-gray-500">
                    Vol: {formatVolume(stock.volume_traded)}
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-gray-800 animate-fade-in">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Open</span>
                      <span className="mobile-card-value text-gray-400">{formatPrice(stock.ohlc?.open)}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Prev Close</span>
                      <span className="mobile-card-value text-gray-400">{formatPrice(stock.ohlc?.close)}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">High</span>
                      <span className="mobile-card-value text-green-400">{formatPrice(stock.ohlc?.high)}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Low</span>
                      <span className="mobile-card-value text-red-400">{formatPrice(stock.ohlc?.low)}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      logStock(stock)
                    }}
                    className="mt-3 w-full px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
                  >
                    Log to Console
                  </button>
                </div>
              )}

              {/* Expand Indicator */}
              <div className="flex justify-center mt-2">
                <svg
                  className={`w-5 h-5 text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )
        })}
      </div>

      {stocks.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No stocks to display. Waiting for data...
        </div>
      )}
    </div>
  )
}
