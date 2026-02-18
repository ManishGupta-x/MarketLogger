'use client'

import { useMemo } from 'react'
import { useStrategies } from '@/lib/useSSE'

export default function StrategiesPage() {
  const { strategies, loading, fetchStrategies } = useStrategies()

  const formatPrice = (price) => {
    if (price === undefined || price === null) return '-'
    return Number(price).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  // Summary statistics
  const summary = useMemo(() => {
    const completed = strategies.filter(s => s.status === 'completed')
    const totalPnl = completed.reduce((sum, s) => sum + (s.realized_pnl || 0), 0)
    const profitableDays = completed.filter(s => s.realized_pnl > 0).length
    const totalTrades = completed.reduce((sum, s) => sum + (s.total_trades || 0), 0)
    const avgWinRate = completed.length > 0
      ? completed.reduce((sum, s) => sum + (s.win_rate || 0), 0) / completed.length
      : 0

    return {
      totalDays: completed.length,
      totalPnl,
      avgPnl: completed.length > 0 ? totalPnl / completed.length : 0,
      avgWinRate,
      profitableDays,
      lossDays: completed.length - profitableDays,
      totalTrades,
      successRate: completed.length > 0 ? (profitableDays / completed.length * 100) : 0
    }
  }, [strategies])

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Strategy History</h1>
            <p className="text-gray-500 mt-1">Daily strategy performance analysis</p>
          </div>
          <button
            onClick={fetchStrategies}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-sm"
          >
            Refresh
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="dashboard-card p-4">
            <div className="text-gray-500 text-sm mb-1">Total Days</div>
            <div className="text-xl font-bold text-white">{summary.totalDays}</div>
            <div className="text-xs text-gray-500 mt-1">
              {summary.profitableDays} profitable, {summary.lossDays} loss
            </div>
          </div>

          <div className={`dashboard-card p-4 ${summary.totalPnl >= 0 ? 'glow-green' : 'glow-red'}`}>
            <div className="text-gray-500 text-sm mb-1">Total P&L</div>
            <div className={`text-xl font-bold tabular-nums ${summary.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {summary.totalPnl >= 0 ? '+' : ''}{formatPrice(summary.totalPnl)}
            </div>
          </div>

          <div className="dashboard-card p-4">
            <div className="text-gray-500 text-sm mb-1">Avg P&L/Day</div>
            <div className={`text-xl font-bold tabular-nums ${summary.avgPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {summary.avgPnl >= 0 ? '+' : ''}{formatPrice(summary.avgPnl)}
            </div>
          </div>

          <div className="dashboard-card p-4">
            <div className="text-gray-500 text-sm mb-1">Avg Win Rate</div>
            <div className="text-xl font-bold text-white">{summary.avgWinRate.toFixed(1)}%</div>
            <div className="text-xs text-gray-500 mt-1">{summary.totalTrades} total trades</div>
          </div>
        </div>

        {/* Success Rate Bar */}
        <div className="dashboard-card p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-500 text-sm">Day Success Rate</span>
            <span className="text-white font-medium">{summary.successRate.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
              style={{ width: `${summary.successRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* Strategies Table */}
      <div className="dashboard-card overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading strategies...</div>
        ) : strategies.length > 0 ? (
          <>
            {/* Desktop Table */}
            <div className="overflow-x-auto mobile-hide-table">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Grid %
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      SL %
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Per Trade
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Capital
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Trades
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      W/L
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Win Rate
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      P&L
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {strategies.map((strategy) => {
                    const isProfit = strategy.realized_pnl >= 0
                    return (
                      <tr key={strategy.id} className="table-row-hover transition-colors">
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="font-medium text-white">{formatDate(strategy.date)}</div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-green-400">
                          {strategy.grid_percentage}%
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-red-400">
                          {strategy.stop_loss_percentage}%
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-gray-400">
                          {formatPrice(strategy.per_trade_amount)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-white">
                          {formatPrice(strategy.capital)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-white">
                          {strategy.total_trades}
                          <div className="text-xs text-gray-500">
                            {strategy.buy_count}B / {strategy.sell_count}S
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right">
                          <span className="text-green-400">{strategy.winning_trades}</span>
                          <span className="text-gray-500">/</span>
                          <span className="text-red-400">{strategy.losing_trades}</span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-white">
                          {strategy.win_rate?.toFixed(1)}%
                        </td>
                        <td className={`px-4 py-4 whitespace-nowrap text-right tabular-nums font-medium ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                          {isProfit ? '+' : ''}{formatPrice(strategy.realized_pnl)}
                          <div className="text-xs text-gray-500">
                            {strategy.pnl_percent >= 0 ? '+' : ''}{strategy.pnl_percent?.toFixed(2)}%
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${
                            strategy.status === 'completed'
                              ? 'bg-green-900/50 text-green-400'
                              : 'bg-yellow-900/50 text-yellow-400'
                          }`}>
                            {strategy.status?.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="mobile-show p-4 space-y-3">
              {strategies.map((strategy) => {
                const isProfit = strategy.realized_pnl >= 0
                return (
                  <div key={strategy.id} className="mobile-card">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-medium text-white text-lg">{formatDate(strategy.date)}</div>
                        <div className="text-xs text-gray-500">
                          Grid: {strategy.grid_percentage}% | SL: {strategy.stop_loss_percentage}%
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                          {isProfit ? '+' : ''}{formatPrice(strategy.realized_pnl)}
                        </div>
                        <div className={`text-sm ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                          {strategy.pnl_percent >= 0 ? '+' : ''}{strategy.pnl_percent?.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500">Per Trade:</span>
                        <span className="ml-2 text-white tabular-nums">{formatPrice(strategy.per_trade_amount)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Capital:</span>
                        <span className="ml-2 text-white tabular-nums">{formatPrice(strategy.capital)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Trades:</span>
                        <span className="ml-2 text-white">{strategy.total_trades}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Win Rate:</span>
                        <span className="ml-2 text-white">{strategy.win_rate?.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-between items-center">
                      <div>
                        <span className="text-green-400">{strategy.winning_trades} wins</span>
                        <span className="text-gray-500"> / </span>
                        <span className="text-red-400">{strategy.losing_trades} losses</span>
                      </div>
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        strategy.status === 'completed'
                          ? 'bg-green-900/50 text-green-400'
                          : 'bg-yellow-900/50 text-yellow-400'
                      }`}>
                        {strategy.status?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="text-center py-16 text-gray-500">
            <div className="text-4xl mb-4">📊</div>
            <div className="text-lg">No strategies recorded yet</div>
            <div className="text-sm mt-2">
              Use <code className="bg-gray-800 px-2 py-1 rounded">node src/scripts/set-strategy.js</code> to set your first strategy
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
