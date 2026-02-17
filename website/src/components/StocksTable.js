'use client'

import { useCallback } from 'react'

export default function StocksTable({ stocks, sortField, sortDir, onSort }) {
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
    <div className="overflow-x-auto">
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

      {stocks.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No stocks to display. Waiting for data...
        </div>
      )}
    </div>
  )
}
