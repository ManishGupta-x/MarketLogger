'use client'

import { useState, useEffect } from 'react'
import { getPortfolioHistory, getOrders, getGridLevels } from '@/lib/supabase'
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
  const [gridLevels, setGridLevels] = useState([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    if (!channelId) return

    async function fetchData() {
      setLoading(true)
      try {
        const [historyData, ordersData, gridData] = await Promise.all([
          getPortfolioHistory(channelId, days),
          getOrders(channelId, 500),
          getGridLevels(channelId)
        ])
        setPortfolioHistory(historyData)
        setOrders(ordersData)
        setGridLevels(gridData)
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

  // Top performers
  const topPerformers = [...gridLevels]
    .sort((a, b) => (b.total_pnl || 0) - (a.total_pnl || 0))
    .slice(0, 10)

  const worstPerformers = [...gridLevels]
    .sort((a, b) => (a.total_pnl || 0) - (b.total_pnl || 0))
    .slice(0, 10)

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Analytics</h1>
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
              <p className="text-gray-500 text-center py-4">No data</p>
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
              <p className="text-gray-500 text-center py-4">No data</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
