'use client'

import { useState, useEffect } from 'react'
import { getPortfolioHistory, getOrders, getStrategyComparison } from '@/lib/supabase'
import { CHANNEL_CONFIG } from '@/lib/channels'
import ChannelSelector from '@/components/ChannelSelector'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts'
import { format } from 'date-fns'

export default function AnalyticsPage() {
  const [channelId, setChannelId] = useState('')
  const [portfolioHistory, setPortfolioHistory] = useState([])
  const [orders, setOrders] = useState([])
  const [strategyComparison, setStrategyComparison] = useState([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    // Load strategy comparison on mount
    async function loadComparison() {
      try {
        const comparison = await getStrategyComparison()
        setStrategyComparison(comparison)
      } catch (error) {
        console.error('Error fetching strategy comparison:', error)
      }
    }
    loadComparison()
  }, [])

  useEffect(() => {
    if (!channelId) return

    async function fetchData() {
      setLoading(true)
      try {
        const [historyData, ordersData] = await Promise.all([
          getPortfolioHistory(channelId, days),
          getOrders(channelId, 500)
        ])
        setPortfolioHistory(historyData)
        setOrders(ordersData)
      } catch (error) {
        console.error('Error fetching analytics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [channelId, days])

  const channelConfig = CHANNEL_CONFIG[channelId]
  const channelName = channelConfig?.name || 'Select Channel'

  // Format portfolio history for chart
  const chartData = portfolioHistory.map(p => ({
    date: format(new Date(p.timestamp), 'MMM dd'),
    value: p.total_value,
    pnl: p.total_value - (portfolioHistory[0]?.total_value || 0)
  }))

  // Calculate top/worst performers from orders
  const stockPnl = {}
  orders.filter(o => o.type === 'SELL').forEach(o => {
    stockPnl[o.symbol] = (stockPnl[o.symbol] || 0) + (o.pnl || 0)
  })

  const sortedStocks = Object.entries(stockPnl)
    .map(([symbol, pnl]) => ({ symbol, total_pnl: pnl }))
    .sort((a, b) => b.total_pnl - a.total_pnl)

  const topPerformers = sortedStocks.filter(s => s.total_pnl > 0).slice(0, 10)
  const worstPerformers = sortedStocks.filter(s => s.total_pnl < 0).slice(-10).reverse()

  // Daily P&L
  const dailyPnl = orders.reduce((acc, order) => {
    if (!order.pnl) return acc
    const date = format(new Date(order.timestamp), 'MMM dd')
    acc[date] = (acc[date] || 0) + order.pnl
    return acc
  }, {})

  const dailyPnlData = Object.entries(dailyPnl)
    .map(([date, pnl]) => ({ date, pnl }))
    .reverse()
    .slice(-30)

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Strategy Comparison */}
      <div className="dashboard-card p-6">
        <h2 className="text-xl font-semibold text-white mb-6">All Channels Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-[#1a1a1a]">
                <th className="pb-4 font-medium uppercase tracking-wider text-xs">Rank</th>
                <th className="pb-4 font-medium uppercase tracking-wider text-xs">Channel</th>
                <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Grid %</th>
                <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Per Order</th>
                <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Initial</th>
                <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Current</th>
                <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">P&L</th>
                <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">ROI %</th>
                <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Win Rate</th>
                <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Trades</th>
                <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Best Stock</th>
              </tr>
            </thead>
            <tbody>
              {strategyComparison.map((strategy, i) => {
                const pnl = (strategy.current_value || 0) - (strategy.initial_capital || 0)
                return (
                  <tr key={strategy.channel_id} className="border-b border-[#1a1a1a]/50 table-row-hover">
                    <td className="py-4 text-gray-400">{i + 1}</td>
                    <td className="py-4 font-semibold text-white">{strategy.name}</td>
                    <td className="py-4 text-right text-purple-400 font-semibold tabular-nums">
                      {strategy.grid_percentage?.toFixed(1)}%
                    </td>
                    <td className="py-4 text-right text-blue-400 font-semibold tabular-nums">
                      ₹{strategy.amount_per_trade?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-4 text-right text-gray-300 tabular-nums">
                      ₹{strategy.initial_capital?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-4 text-right text-white font-semibold tabular-nums">
                      ₹{strategy.current_value?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    <td className={`py-4 text-right font-bold tabular-nums ${pnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                      {pnl >= 0 ? '+' : ''}₹{pnl?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className={`py-4 text-right font-semibold tabular-nums ${strategy.roi_percent >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                      {strategy.roi_percent >= 0 ? '+' : ''}{strategy.roi_percent?.toFixed(2)}%
                    </td>
                    <td className="py-4 text-right text-gray-300 tabular-nums">{strategy.win_rate?.toFixed(1)}%</td>
                    <td className="py-4 text-right text-gray-300 tabular-nums">{strategy.total_trades}</td>
                    <td className="py-4 text-right text-gray-300">
                      {strategy.best_stock && (
                        <span className="text-[#00ff88]">{strategy.best_stock}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {strategyComparison.length === 0 && (
                <tr>
                  <td colSpan="11" className="py-8 text-center text-gray-500">
                    No strategy data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Header for channel-specific analytics */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Channel Analytics</h1>
          <p className="text-gray-500 mt-1">{channelName}</p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-[#0a0a0a] border border-[#1a1a1a] text-white rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <ChannelSelector
            selectedChannel={channelId}
            onChannelChange={setChannelId}
          />
        </div>
      </div>

      {/* Portfolio Value Chart */}
      <div className="dashboard-card p-6">
        <h2 className="text-xl font-semibold text-white mb-6">Portfolio Value Over Time</h2>
        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis dataKey="date" stroke="#666" fontSize={12} />
              <YAxis stroke="#666" fontSize={12} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '8px' }}
                labelStyle={{ color: '#888' }}
                formatter={(value) => [`₹${value.toLocaleString()}`, 'Value']}
              />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-500">
            No data available
          </div>
        )}
      </div>

      {/* Daily P&L Chart */}
      <div className="dashboard-card p-6">
        <h2 className="text-xl font-semibold text-white mb-6">Daily Realized P&L</h2>
        {dailyPnlData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyPnlData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis dataKey="date" stroke="#666" fontSize={12} />
              <YAxis stroke="#666" fontSize={12} tickFormatter={(v) => `₹${v.toFixed(0)}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '8px' }}
                formatter={(value) => [`₹${value.toFixed(2)}`, 'P&L']}
              />
              <Bar dataKey="pnl" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-500">
            No P&L data available
          </div>
        )}
      </div>

      {/* Top/Worst Performers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="dashboard-card p-6">
          <h2 className="text-xl font-semibold text-[#00ff88] mb-6">Top Performers</h2>
          <div className="space-y-3">
            {topPerformers.map((stock, i) => (
              <div key={stock.symbol} className="flex items-center justify-between py-2 border-b border-[#1a1a1a]/50">
                <div className="flex items-center gap-3">
                  <span className="text-gray-600 text-sm w-6">{i + 1}.</span>
                  <span className="font-semibold text-white">{stock.symbol}</span>
                </div>
                <span className="text-[#00ff88] font-semibold tabular-nums">
                  +₹{Number(stock.total_pnl || 0).toFixed(2)}
                </span>
              </div>
            ))}
            {topPerformers.length === 0 && (
              <p className="text-gray-500 text-center py-4">No winning trades</p>
            )}
          </div>
        </div>

        <div className="dashboard-card p-6">
          <h2 className="text-xl font-semibold text-[#ff4444] mb-6">Worst Performers</h2>
          <div className="space-y-3">
            {worstPerformers.map((stock, i) => (
              <div key={stock.symbol} className="flex items-center justify-between py-2 border-b border-[#1a1a1a]/50">
                <div className="flex items-center gap-3">
                  <span className="text-gray-600 text-sm w-6">{i + 1}.</span>
                  <span className="font-semibold text-white">{stock.symbol}</span>
                </div>
                <span className="text-[#ff4444] font-semibold tabular-nums">
                  ₹{Number(stock.total_pnl || 0).toFixed(2)}
                </span>
              </div>
            ))}
            {worstPerformers.length === 0 && (
              <p className="text-gray-500 text-center py-4">No losing trades</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
