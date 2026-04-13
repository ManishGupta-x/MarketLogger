'use client'

import { useMemo } from 'react'
import { useAdaptiveInfo, useRiskStatus, useExitStats, useRegimeSSE } from '@/lib/useSSE'

export default function DashboardPage() {
  const { adaptiveInfo, loading, fetchAdaptiveInfo } = useAdaptiveInfo()
  const { riskStatus, resumeTrading } = useRiskStatus()
  const { exitStats } = useExitStats()
  const { regime, connected } = useRegimeSSE()

  const regimeColors = {
    BULLISH: { bg: 'bg-green-900/30', text: 'text-green-400', border: 'border-green-500' },
    BEARISH: { bg: 'bg-red-900/30', text: 'text-red-400', border: 'border-red-500' },
    SIDEWAYS: { bg: 'bg-yellow-900/30', text: 'text-yellow-400', border: 'border-yellow-500' }
  }

  const currentRegimeStyle = regimeColors[regime.current] || regimeColors.SIDEWAYS

  const formatPrice = (price) => {
    if (price === undefined || price === null) return '-'
    return Number(price).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  // Group active stocks by sector
  const stocksBySector = useMemo(() => {
    const grouped = {}
    const stocks = adaptiveInfo.activeStocks || []
    stocks.forEach(stock => {
      const sector = stock.sector || 'OTHER'
      if (!grouped[sector]) grouped[sector] = []
      grouped[sector].push(stock)
    })
    return grouped
  }, [adaptiveInfo.activeStocks])

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Adaptive Trading Dashboard</h1>
          <p className="text-gray-500 mt-1">
            {connected ? (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Adaptive Mode Active
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Disconnected
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchAdaptiveInfo}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-sm"
        >
          Refresh
        </button>
      </div>

      {/* Top Row - Regime & Risk */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Market Regime Card */}
            <div className={`dashboard-card p-6 border-l-4 ${currentRegimeStyle.border}`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Market Regime</h2>
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${currentRegimeStyle.bg} ${currentRegimeStyle.text}`}>
                  {regime.current}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-gray-500 text-sm">Confidence</div>
                  <div className="text-xl font-bold text-white">{(regime.confidence || 0).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-gray-500 text-sm">Active Stocks</div>
                  <div className="text-xl font-bold text-white">{(adaptiveInfo.activeStocks || []).length}</div>
                </div>
              </div>

              {/* Regime Indicators */}
              {adaptiveInfo.regime && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <div className="text-xs text-gray-500 mb-2">Indicators (NIFTY 50 + Bank)</div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">ADX:</span>
                      <span className="ml-1 text-white">{adaptiveInfo.dataStatus?.nifty50?.adx?.toFixed(1) || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">RSI:</span>
                      <span className="ml-1 text-white">{adaptiveInfo.dataStatus?.nifty50?.rsi?.toFixed(1) || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Trend:</span>
                      <span className={`ml-1 ${adaptiveInfo.dataStatus?.nifty50?.trend === 'UP' ? 'text-green-400' : adaptiveInfo.dataStatus?.nifty50?.trend === 'DOWN' ? 'text-red-400' : 'text-yellow-400'}`}>
                        {adaptiveInfo.dataStatus?.nifty50?.trend || '-'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Portfolio Risk Card */}
            <div className={`dashboard-card p-6 ${riskStatus.tradingHalted ? 'border-l-4 border-red-500' : ''}`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Portfolio Risk</h2>
                {riskStatus.tradingHalted ? (
                  <span className="px-3 py-1 rounded-full text-sm font-bold bg-red-900/50 text-red-400 animate-pulse">
                    HALTED
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-sm font-bold bg-green-900/50 text-green-400">
                    ACTIVE
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-gray-500 text-sm">Day P&L</div>
                  <div className={`text-xl font-bold ${(riskStatus.dailyPnL || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {(riskStatus.dailyPnL || 0) >= 0 ? '+' : ''}{formatPrice(riskStatus.dailyPnL)}
                  </div>
                  <div className={`text-sm ${(riskStatus.dailyPnLPercent || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {(riskStatus.dailyPnLPercent || 0) >= 0 ? '+' : ''}{(riskStatus.dailyPnLPercent || 0).toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-sm">Drawdown</div>
                  <div className="text-xl font-bold text-white">{(riskStatus.currentDrawdown || 0).toFixed(2)}%</div>
                  <div className="text-sm text-gray-500">
                    Limit: {riskStatus.limits?.maxDailyDrawdown || 3}%
                  </div>
                </div>
              </div>

              {/* Drawdown Progress Bar */}
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Drawdown Progress</span>
                  <span>{(riskStatus.currentDrawdown || 0).toFixed(2)}% / {riskStatus.limits?.maxDailyDrawdown || 3}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      (riskStatus.currentDrawdown || 0) > (riskStatus.limits?.maxDailyDrawdown || 3) * 0.8
                        ? 'bg-red-500'
                        : (riskStatus.currentDrawdown || 0) > (riskStatus.limits?.maxDailyDrawdown || 3) * 0.5
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, ((riskStatus.currentDrawdown || 0) / (riskStatus.limits?.maxDailyDrawdown || 3)) * 100)}%` }}
                  />
                </div>
              </div>

              {riskStatus.tradingHalted && (
                <button
                  onClick={resumeTrading}
                  className="mt-4 w-full px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  Force Resume Trading
                </button>
              )}
            </div>
          </div>

          {/* Active Stocks */}
          <div className="dashboard-card p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Active Stocks for {regime.current} Market
            </h2>

            {(adaptiveInfo.activeStocks || []).length > 0 ? (
              <>
                {/* Sector Distribution */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {Object.entries(stocksBySector).map(([sector, stocks]) => (
                    <span key={sector} className="px-2 py-1 text-xs bg-gray-800 text-gray-400 rounded">
                      {sector}: {stocks.length}
                    </span>
                  ))}
                </div>

                {/* Desktop Stocks Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sector</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Score</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">RSI</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">ROC%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {(adaptiveInfo.activeStocks || []).map((stock, idx) => (
                        <tr key={stock.symbol} className="hover:bg-gray-800/50">
                          <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                          <td className="px-4 py-2 font-medium text-white">{stock.symbol}</td>
                          <td className="px-4 py-2">
                            <span className="px-2 py-0.5 text-xs bg-gray-800 text-gray-400 rounded">
                              {stock.sector || 'OTHER'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-blue-400 font-medium">
                            {typeof stock.score === 'number' ? stock.score.toFixed(1) : stock.score}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-400">
                            {stock.rsi?.toFixed(1) || '-'}
                          </td>
                          <td className={`px-4 py-2 text-right ${(stock.roc || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {stock.roc?.toFixed(2) || '-'}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-2">
                  {(adaptiveInfo.activeStocks || []).map((stock, idx) => (
                    <div key={stock.symbol} className="mobile-card">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 text-sm">#{idx + 1}</span>
                          <span className="font-medium text-white">{stock.symbol}</span>
                          <span className="px-2 py-0.5 text-xs bg-gray-800 text-gray-400 rounded">
                            {stock.sector || 'OTHER'}
                          </span>
                        </div>
                        <span className="text-blue-400 font-bold">
                          {typeof stock.score === 'number' ? stock.score.toFixed(1) : stock.score}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">RSI: <span className="text-white">{stock.rsi?.toFixed(1) || '-'}</span></span>
                        <span className={`${(stock.roc || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ROC: {stock.roc?.toFixed(2) || '-'}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <div className="text-2xl mb-2">⏳</div>
                <div>Waiting for stock screening...</div>
                <div className="text-sm mt-1">First screening runs after 1 minute of market data</div>
              </div>
            )}
          </div>

          {/* Bottom Row - Exit Stats & Positions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Exit Statistics */}
            <div className="dashboard-card p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Exit Statistics (30 days)</h2>

              {(exitStats.exitStats || []).length > 0 ? (
                <div className="space-y-3">
                  {(exitStats.exitStats || []).map(stat => {
                    const exitColors = {
                      'TRAILING_STOP': 'bg-green-900/50 text-green-400',
                      'RAPID_DECLINE': 'bg-orange-900/50 text-orange-400',
                      'MOMENTUM_EXHAUSTION': 'bg-blue-900/50 text-blue-400',
                      'BACKSTOP_STOPLOSS': 'bg-red-900/50 text-red-400',
                      'TARGET': 'bg-green-900/50 text-green-400',
                      'STOPLOSS': 'bg-red-900/50 text-red-400'
                    }
                    return (
                      <div key={stat.exit_reason} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${exitColors[stat.exit_reason] || 'bg-gray-800 text-gray-400'}`}>
                            {stat.exit_reason?.replace(/_/g, ' ') || 'UNKNOWN'}
                          </span>
                          <span className="text-white">{stat.count} trades</span>
                        </div>
                        <span className={`font-medium ${(stat.avg_pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {(stat.avg_pnl || 0) >= 0 ? '+' : ''}{(stat.avg_pnl || 0).toFixed(2)}% avg
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <div>No exit data yet</div>
                </div>
              )}
            </div>

            {/* Regime Performance */}
            <div className="dashboard-card p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Performance by Regime (30 days)</h2>

              {(exitStats.regimeStats || []).length > 0 ? (
                <div className="space-y-3">
                  {(exitStats.regimeStats || []).map(stat => (
                    <div key={stat.market_regime} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${regimeColors[stat.market_regime]?.bg || 'bg-gray-800'} ${regimeColors[stat.market_regime]?.text || 'text-gray-400'}`}>
                          {stat.market_regime}
                        </span>
                        <span className="text-white">{stat.trades} trades</span>
                      </div>
                      <div className="text-right">
                        <div className={`font-medium ${(stat.total_pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {(stat.total_pnl || 0) >= 0 ? '+' : ''}₹{formatPrice(stat.total_pnl)}
                        </div>
                        <div className="text-xs text-gray-500">
                          Avg: {(stat.avg_pnl || 0) >= 0 ? '+' : ''}₹{formatPrice(stat.avg_pnl)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <div>No regime performance data yet</div>
                </div>
              )}
            </div>
          </div>

          {/* Cost Info */}
          {adaptiveInfo.costInfo && (
            <div className="dashboard-card p-6 mt-6">
              <h2 className="text-lg font-semibold text-white mb-4">Trading Costs (Per Trade)</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-gray-500">Brokerage</div>
                  <div className="text-white">{adaptiveInfo.costInfo.brokerage}</div>
                </div>
                <div>
                  <div className="text-gray-500">STT</div>
                  <div className="text-white">{adaptiveInfo.costInfo.stt}</div>
                </div>
                <div>
                  <div className="text-gray-500">Slippage (Base)</div>
                  <div className="text-white">{adaptiveInfo.costInfo.slippage?.base}</div>
                </div>
                <div>
                  <div className="text-gray-500">Max Slippage</div>
                  <div className="text-white">{adaptiveInfo.costInfo.slippage?.max}</div>
                </div>
              </div>
            </div>
          )}
    </div>
  )
}
