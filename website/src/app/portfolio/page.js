'use client'

import { useState, useMemo, useEffect } from 'react'
import { usePortfolioSSE, useOrders, useRegimeSSE, useAdaptiveInfo } from '@/lib/useSSE'

export default function PortfolioPage() {
  const { portfolio, connected } = usePortfolioSSE()
  const { orders, loading: ordersLoading, fetchOrders } = useOrders()
  const { regime } = useRegimeSSE()
  const { adaptiveInfo } = useAdaptiveInfo()
  const [activeTab, setActiveTab] = useState('holdings')
  const [showTodayOnly, setShowTodayOnly] = useState(false)
  const [todayOrders, setTodayOrders] = useState([])

  const regimeColors = {
    BULLISH: { bg: 'bg-green-900/30', text: 'text-green-400', border: 'border-green-500' },
    BEARISH: { bg: 'bg-red-900/30', text: 'text-red-400', border: 'border-red-500' },
    SIDEWAYS: { bg: 'bg-yellow-900/30', text: 'text-yellow-400', border: 'border-yellow-500' }
  }
  const currentRegimeStyle = regimeColors[regime.current] || regimeColors.SIDEWAYS

  // Fetch today's orders for win rate calculation
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_SSE_URL || 'http://localhost:8080'}/api/orders/today`)
      .then(res => res.json())
      .then(data => setTodayOrders(data))
      .catch(err => console.error('Failed to fetch today orders:', err))
  }, [])

  // Calculate today's win rate from today's sell orders
  const todayStats = useMemo(() => {
    const sells = todayOrders.filter(o => o.type === 'SELL')
    const wins = sells.filter(o => o.pnl > 0).length
    const losses = sells.filter(o => o.pnl < 0).length
    const winRate = sells.length > 0 ? ((wins / sells.length) * 100).toFixed(1) : 0
    return { wins, losses, winRate, totalSells: sells.length }
  }, [todayOrders])

  const formatPrice = (price) => {
    if (price === undefined || price === null) return '-'
    return Number(price).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  const formatPnl = (pnl, percent) => {
    if (pnl === undefined || pnl === null) return { text: '-', color: 'text-gray-500' }
    const isPositive = pnl >= 0
    const pnlText = `${isPositive ? '+' : ''}${formatPrice(pnl)}`
    const percentText = percent !== undefined ? ` (${isPositive ? '+' : ''}${percent.toFixed(2)}%)` : ''
    return {
      text: pnlText + percentText,
      color: isPositive ? 'text-green-400' : 'text-red-400'
    }
  }

  const holdings = useMemo(() => {
    const h = portfolio.holdings || []
    // Sort by minimum distance (closest to target or stop loss at top)
    return [...h].sort((a, b) => (a.minDistance || 999) - (b.minDistance || 999))
  }, [portfolio.holdings])

  const filteredOrders = useMemo(() => {
    return orders
  }, [orders])

  const handleFetchOrders = () => {
    fetchOrders(showTodayOnly)
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Strategy Info Banner - Adaptive Mode */}
      <div className={`dashboard-card p-4 mb-6 border-l-4 ${currentRegimeStyle.border}`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-blue-400 text-lg font-bold">Adaptive Trading</span>
              <span className="px-2 py-0.5 text-xs bg-blue-900/50 text-blue-400 rounded">PAPER</span>
              <span className={`px-2 py-0.5 text-xs rounded ${currentRegimeStyle.bg} ${currentRegimeStyle.text}`}>
                {regime.current || 'DETECTING'}
              </span>
              {regime.confidence && (
                <span className="text-xs text-gray-500">{regime.confidence}% conf</span>
              )}
            </div>
            <p className="text-gray-400 text-sm">
              Market-adaptive strategy with intelligent exits • Trailing stops & rapid decline detection
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Trail:</span>
              <span className="text-green-400 font-medium">{adaptiveInfo.trailingStopDistance || 0.3}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Backstop:</span>
              <span className="text-red-400 font-medium">-{adaptiveInfo.backstopStopLoss || 2}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Per Trade:</span>
              <span className="text-white font-medium">₹{formatPrice(portfolio.amountPerTrade || 5000)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Capital:</span>
              <span className="text-white font-medium">₹{formatPrice(portfolio.initialCapital)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Portfolio Summary Header - Zerodha Style */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Portfolio</h1>
            <p className="text-gray-500 mt-1">
              {connected ? (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  Live Updates
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                  Disconnected
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Summary Cards - Zerodha Kite Style */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {/* Total Investment */}
          <div className="dashboard-card p-4">
            <div className="text-gray-500 text-sm mb-1">Invested</div>
            <div className="text-xl font-bold text-white tabular-nums">
              {formatPrice(portfolio.investedValue)}
            </div>
          </div>

          {/* Current Value */}
          <div className="dashboard-card p-4">
            <div className="text-gray-500 text-sm mb-1">Current</div>
            <div className="text-xl font-bold text-white tabular-nums">
              {formatPrice(portfolio.holdingsValue)}
            </div>
          </div>

          {/* Day's P&L */}
          <div className="dashboard-card p-4">
            <div className="text-gray-500 text-sm mb-1">Day's P&L</div>
            <div className={`text-xl font-bold tabular-nums ${portfolio.dayPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {portfolio.dayPnl >= 0 ? '+' : ''}{formatPrice(portfolio.dayPnl)}
            </div>
            <div className="text-xs text-gray-500 mt-1">{portfolio.dayTrades || 0} trades</div>
          </div>

          {/* Total P&L */}
          <div className={`dashboard-card p-4 ${portfolio.totalPnl >= 0 ? 'glow-green' : 'glow-red'}`}>
            <div className="text-gray-500 text-sm mb-1">Total P&L</div>
            <div className={`text-xl font-bold tabular-nums ${portfolio.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {portfolio.totalPnl >= 0 ? '+' : ''}{formatPrice(portfolio.totalPnl)}
            </div>
            <div className={`text-xs mt-1 ${portfolio.pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {portfolio.pnlPercent >= 0 ? '+' : ''}{portfolio.pnlPercent?.toFixed(2) || '0.00'}%
            </div>
          </div>
        </div>

        {/* Additional Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="dashboard-card p-3">
            <div className="text-gray-500 text-xs mb-1">Cash Balance</div>
            <div className="text-lg font-semibold text-white tabular-nums">{formatPrice(portfolio.cash)}</div>
          </div>
          <div className="dashboard-card p-3">
            <div className="text-gray-500 text-xs mb-1">Holdings</div>
            <div className="text-lg font-semibold text-white">{portfolio.holdingsCount || 0}</div>
          </div>
          <div className="dashboard-card p-3">
            <div className="text-gray-500 text-xs mb-1">Realized P&L</div>
            <div className={`text-lg font-semibold tabular-nums ${portfolio.realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatPrice(portfolio.realizedPnl)}
            </div>
          </div>
          <div className="dashboard-card p-3">
            <div className="text-gray-500 text-xs mb-1">Unrealized P&L</div>
            <div className={`text-lg font-semibold tabular-nums ${portfolio.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatPrice(portfolio.unrealizedPnl)}
            </div>
          </div>
          <div className="dashboard-card p-3">
            <div className="text-gray-500 text-xs mb-1">Today's Win Rate</div>
            <div className="text-lg font-semibold text-white">{todayStats.winRate}%</div>
            <div className="text-xs text-gray-500 mt-1">{todayStats.wins}W / {todayStats.losses}L</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-800 pb-2">
        <button
          onClick={() => setActiveTab('holdings')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeTab === 'holdings'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          Holdings ({holdings.length})
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            activeTab === 'orders'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          Orders
        </button>
      </div>

      {/* Holdings Tab */}
      {activeTab === 'holdings' && (
        <div className="dashboard-card overflow-hidden">
          {holdings.length > 0 ? (
            <>
              {/* Desktop Table */}
              <div className="overflow-x-auto mobile-hide-table">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Instrument
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Qty
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Avg. Price
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        LTP
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Invested
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Current
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        P&L
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Trailing Stop
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Backstop
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Exit Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {holdings.map((holding) => {
                      const pnlInfo = formatPnl(holding.unrealizedPnl, holding.unrealizedPnlPercent)
                      const isProfit = holding.unrealizedPnl >= 0
                      return (
                        <tr key={holding.token} className="table-row-hover transition-colors">
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="font-medium text-white">{holding.symbol}</div>
                            <div className="text-xs text-gray-500">NSE</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-white">
                            {holding.qty}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-gray-400">
                            {formatPrice(holding.avgPrice)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-white font-medium">
                            {formatPrice(holding.currentPrice)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-gray-400">
                            {formatPrice(holding.investedValue)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-white">
                            {formatPrice(holding.currentValue)}
                          </td>
                          <td className={`px-4 py-4 whitespace-nowrap text-right tabular-nums font-medium ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                            {isProfit ? '+' : ''}{formatPrice(holding.unrealizedPnl)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right">
                            {holding.trailingStop ? (
                              <>
                                <div className="tabular-nums text-cyan-400 font-medium">{formatPrice(holding.trailingStop)}</div>
                                <div className="text-xs text-gray-500">
                                  {holding.highestPrice && `High: ${formatPrice(holding.highestPrice)}`}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="tabular-nums text-gray-500">Not active</div>
                                <div className="text-xs text-gray-600">
                                  Need +{adaptiveInfo.trailingStopActivation || 0.5}%
                                </div>
                                <div className="text-xs text-cyan-500">
                                  ₹{formatPrice(holding.avgPrice * (1 + (adaptiveInfo.trailingStopActivation || 0.5) / 100))}
                                </div>
                              </>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right">
                            <div className="tabular-nums text-red-400 font-medium">{formatPrice(holding.stopLossPrice)}</div>
                            <div className="text-xs text-gray-500">{holding.distanceToStopLoss?.toFixed(2)}% away</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right">
                            {holding.trailingStop && holding.currentPrice <= holding.trailingStop ? (
                              <span className="px-2 py-1 text-xs font-bold bg-cyan-900/50 text-cyan-400 rounded animate-pulse">TRAILING!</span>
                            ) : holding.distanceToStopLoss <= 0 ? (
                              <span className="px-2 py-1 text-xs font-bold bg-red-900/50 text-red-400 rounded animate-pulse">BACKSTOP!</span>
                            ) : holding.unrealizedPnlPercent >= (adaptiveInfo.trailingStopActivation || 0.5) ? (
                              <span className="px-2 py-1 text-xs font-medium bg-green-900/50 text-green-400 rounded">TRAILING</span>
                            ) : (
                              <span className="text-gray-500 text-sm">{holding.unrealizedPnlPercent?.toFixed(2) || '0.00'}%</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="mobile-show p-4 space-y-3">
                {holdings.map((holding) => {
                  const isProfit = holding.unrealizedPnl >= 0
                  return (
                    <div key={holding.token} className="mobile-card">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-medium text-white text-lg">{holding.symbol}</div>
                          <div className="text-xs text-gray-500">NSE · {holding.qty} shares</div>
                        </div>
                        <div className="text-right">
                          <div className={`font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                            {isProfit ? '+' : ''}{formatPrice(holding.unrealizedPnl)}
                          </div>
                          <div className={`text-sm ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                            {isProfit ? '+' : ''}{holding.unrealizedPnlPercent?.toFixed(2)}%
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-500">Avg:</span>
                          <span className="ml-2 text-white tabular-nums">{formatPrice(holding.avgPrice)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">LTP:</span>
                          <span className="ml-2 text-white tabular-nums">{formatPrice(holding.currentPrice)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Trail:</span>
                          <span className="ml-2 text-cyan-400 tabular-nums">
                            {holding.trailingStop ? formatPrice(holding.trailingStop) : 'Inactive'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Backstop:</span>
                          <span className="ml-2 text-red-400 tabular-nums">{formatPrice(holding.stopLossPrice)}</span>
                        </div>
                      </div>
                      <div className="mt-2 text-center">
                        {holding.trailingStop && holding.currentPrice <= holding.trailingStop ? (
                          <span className="px-3 py-1 text-xs font-bold bg-cyan-900/50 text-cyan-400 rounded animate-pulse">TRAILING STOP HIT!</span>
                        ) : holding.distanceToStopLoss <= 0 ? (
                          <span className="px-3 py-1 text-xs font-bold bg-red-900/50 text-red-400 rounded animate-pulse">BACKSTOP HIT!</span>
                        ) : holding.trailingStop ? (
                          <span className="text-cyan-400 text-xs">
                            Trailing active • High: {formatPrice(holding.highestPrice)}
                          </span>
                        ) : (
                          <span className="text-gray-500 text-xs">
                            Need +{adaptiveInfo.trailingStopActivation || 0.5}% (₹{formatPrice(holding.avgPrice * (1 + (adaptiveInfo.trailingStopActivation || 0.5) / 100))}) to activate
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-gray-500">
              <div className="text-4xl mb-4">📊</div>
              <div className="text-lg">No holdings yet</div>
              <div className="text-sm mt-2">Your portfolio will appear here once you make trades</div>
            </div>
          )}
        </div>
      )}

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <div className="dashboard-card overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex justify-between items-center">
            <div className="flex gap-2">
              <button
                onClick={() => { setShowTodayOnly(false); fetchOrders(false) }}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  !showTodayOnly ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                All Orders
              </button>
              <button
                onClick={() => { setShowTodayOnly(true); fetchOrders(true) }}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  showTodayOnly ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                Today
              </button>
            </div>
            <button
              onClick={handleFetchOrders}
              className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
            >
              Refresh
            </button>
          </div>

          {ordersLoading ? (
            <div className="text-center py-12 text-gray-500">Loading orders...</div>
          ) : filteredOrders.length > 0 ? (
            <>
              {/* Desktop Table */}
              <div className="overflow-x-auto mobile-hide-table">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Time
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Instrument
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Qty
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Price
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Value
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        P&L
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Exit Reason
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {filteredOrders.map((order) => {
                      const isBuy = order.type === 'BUY'
                      const hasPnl = order.type === 'SELL' && order.pnl !== 0
                      const exitReasonStyles = {
                        TARGET: { bg: 'bg-green-900/50', text: 'text-green-400' },
                        TRAILING_STOP: { bg: 'bg-cyan-900/50', text: 'text-cyan-400' },
                        RAPID_DECLINE: { bg: 'bg-orange-900/50', text: 'text-orange-400' },
                        MOMENTUM_EXIT: { bg: 'bg-purple-900/50', text: 'text-purple-400' },
                        STOPLOSS: { bg: 'bg-red-900/50', text: 'text-red-400' },
                        BACKSTOP: { bg: 'bg-red-900/50', text: 'text-red-400' }
                      }
                      const exitStyle = exitReasonStyles[order.exitReason] || { bg: 'bg-gray-800', text: 'text-gray-400' }
                      return (
                        <tr key={order.id} className="table-row-hover transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-gray-400 text-sm">
                            {new Date(order.timestamp).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-medium rounded ${
                              isBuy ? 'bg-blue-900/50 text-blue-400' : 'bg-orange-900/50 text-orange-400'
                            }`}>
                              {order.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-white">
                            {order.symbol}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-white">
                            {order.qty}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-400">
                            {formatPrice(order.price)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-white">
                            {formatPrice(order.value)}
                          </td>
                          <td className={`px-4 py-3 whitespace-nowrap text-right tabular-nums font-medium ${
                            hasPnl ? (order.pnl >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-500'
                          }`}>
                            {hasPnl ? (
                              <>
                                {order.pnl >= 0 ? '+' : ''}{formatPrice(order.pnl)}
                                <div className="text-xs text-gray-500">
                                  {order.pnlPercent >= 0 ? '+' : ''}{order.pnlPercent?.toFixed(2)}%
                                </div>
                              </>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            {order.type === 'SELL' && order.exitReason ? (
                              <span className={`px-2 py-1 text-xs font-medium rounded ${exitStyle.bg} ${exitStyle.text}`}>
                                {order.exitReason.replace('_', ' ')}
                              </span>
                            ) : order.type === 'BUY' ? (
                              <span className="text-gray-600 text-xs">-</span>
                            ) : (
                              <span className="text-gray-600 text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="mobile-show p-4 space-y-3">
                {filteredOrders.map((order) => {
                  const isBuy = order.type === 'BUY'
                  const hasPnl = order.type === 'SELL' && order.pnl !== 0
                  const exitReasonStyles = {
                    TARGET: { bg: 'bg-green-900/50', text: 'text-green-400' },
                    TRAILING_STOP: { bg: 'bg-cyan-900/50', text: 'text-cyan-400' },
                    RAPID_DECLINE: { bg: 'bg-orange-900/50', text: 'text-orange-400' },
                    MOMENTUM_EXIT: { bg: 'bg-purple-900/50', text: 'text-purple-400' },
                    STOPLOSS: { bg: 'bg-red-900/50', text: 'text-red-400' },
                    BACKSTOP: { bg: 'bg-red-900/50', text: 'text-red-400' }
                  }
                  const exitStyle = exitReasonStyles[order.exitReason] || { bg: 'bg-gray-800', text: 'text-gray-400' }
                  return (
                    <div key={order.id} className="mobile-card">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${
                            isBuy ? 'bg-blue-900/50 text-blue-400' : 'bg-orange-900/50 text-orange-400'
                          }`}>
                            {order.type}
                          </span>
                          <span className="font-medium text-white">{order.symbol}</span>
                          {order.type === 'SELL' && order.exitReason && (
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${exitStyle.bg} ${exitStyle.text}`}>
                              {order.exitReason.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(order.timestamp).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="text-sm">
                          <span className="text-gray-500">{order.qty} × </span>
                          <span className="text-white tabular-nums">{formatPrice(order.price)}</span>
                          <span className="text-gray-500"> = </span>
                          <span className="text-white tabular-nums">{formatPrice(order.value)}</span>
                        </div>
                        {hasPnl && (
                          <div className={`text-right ${order.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            <div className="font-medium">
                              {order.pnl >= 0 ? '+' : ''}{formatPrice(order.pnl)}
                            </div>
                            <div className="text-xs">
                              {order.pnlPercent >= 0 ? '+' : ''}{order.pnlPercent?.toFixed(2)}%
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-gray-500">
              <div className="text-4xl mb-4">📋</div>
              <div className="text-lg">No orders yet</div>
              <div className="text-sm mt-2">Your transaction history will appear here</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
