'use client'

import { useState, useEffect } from 'react'
import { getStrategyComparison, getAllChannelsPortfolioHistory, getAllChannelsDailyPnl, getChannelPnlBreakdown } from '@/lib/supabase'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  ComposedChart,
  Area
} from 'recharts'
import { format } from 'date-fns'

// Color palette for different channels
const CHANNEL_COLORS = [
  '#3b82f6', // blue
  '#00ff88', // green
  '#ff4444', // red
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
]

export default function AnalyticsPage() {
  const [strategyComparison, setStrategyComparison] = useState([])
  const [channelsHistory, setChannelsHistory] = useState([])
  const [channelsPnl, setChannelsPnl] = useState([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [viewMode, setViewMode] = useState('absolute') // 'absolute' or 'percentage'
  const [selectedChannelPnl, setSelectedChannelPnl] = useState(null)
  const [pnlDetailsLoading, setPnlDetailsLoading] = useState(false)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [comparison, history, pnl] = await Promise.all([
          getStrategyComparison(),
          getAllChannelsPortfolioHistory(days),
          getAllChannelsDailyPnl(days)
        ])
        setStrategyComparison(comparison)
        setChannelsHistory(history)
        setChannelsPnl(pnl)
      } catch (error) {
        console.error('Error fetching analytics:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [days])

  // Custom tooltip for portfolio chart
  const PortfolioTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null

    return (
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-3">
        <p className="text-gray-400 text-xs mb-2">{label}</p>
        {payload.map((entry, index) => {
          const channel = channelsHistory.find(ch => ch.name === entry.dataKey || ch.name + '_pct' === entry.dataKey)
          const channelName = entry.dataKey.replace('_pct', '')
          return (
            <div key={index} className="mb-1">
              <p style={{ color: entry.color }} className="text-sm font-semibold">
                {channelName}
              </p>
              <p className="text-white text-xs">
                {viewMode === 'percentage'
                  ? `${entry.value >= 0 ? '+' : ''}${entry.value?.toFixed(2)}%`
                  : `Value: ₹${entry.value?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                }
              </p>
              {channel && (
                <p className="text-gray-500 text-xs">
                  Grid: {channel.grid_percentage}% | Per Order: ₹{channel.amount_per_trade?.toLocaleString('en-IN')}
                </p>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Custom tooltip for P&L chart
  const PnlTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null

    return (
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-3">
        <p className="text-gray-400 text-xs mb-2">{label}</p>
        {payload.map((entry, index) => {
          const channel = channelsPnl.find(ch => ch.name === entry.dataKey)
          const pnl = entry.value || 0
          return (
            <div key={index} className="mb-1">
              <p style={{ color: entry.fill }} className="text-sm font-semibold">
                {entry.dataKey}
              </p>
              <p className={`text-xs font-semibold ${pnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                P&L: {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)}
              </p>
              {channel && (
                <p className="text-gray-500 text-xs">
                  Grid: {channel.grid_percentage}% | Per Order: ₹{channel.amount_per_trade?.toLocaleString('en-IN')}
                </p>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Format portfolio history for multi-channel chart
  const formatPortfolioChartData = () => {
    if (!channelsHistory.length) return []

    // Get all unique dates across all channels
    const allDates = new Set()
    channelsHistory.forEach(channel => {
      channel.history.forEach(point => {
        allDates.add(format(new Date(point.timestamp), 'MMM dd'))
      })
    })

    const dates = Array.from(allDates).sort()

    // Create data points with all channels
    return dates.map(date => {
      const dataPoint = { date }

      channelsHistory.forEach(channel => {
        const point = channel.history.find(p => format(new Date(p.timestamp), 'MMM dd') === date)

        if (viewMode === 'percentage') {
          // Calculate percentage change from first value
          const firstValue = channel.history[0]?.total_value || 0
          const currentValue = point?.total_value || null
          if (currentValue && firstValue) {
            dataPoint[channel.name + '_pct'] = ((currentValue - firstValue) / firstValue) * 100
          } else {
            dataPoint[channel.name + '_pct'] = null
          }
        } else {
          dataPoint[channel.name] = point?.total_value || null
        }
      })

      return dataPoint
    })
  }

  // Format daily P&L for multi-channel chart
  const formatDailyPnlChartData = () => {
    if (!channelsPnl.length) return []

    // Get all unique dates
    const allDates = new Set()
    channelsPnl.forEach(channel => {
      channel.orders.forEach(order => {
        if (order.pnl) {
          allDates.add(format(new Date(order.timestamp), 'MMM dd'))
        }
      })
    })

    const dates = Array.from(allDates).sort()

    // Create data points with aggregated P&L per channel
    return dates.map(date => {
      const dataPoint = { date }

      channelsPnl.forEach(channel => {
        const dayPnl = channel.orders
          .filter(o => o.pnl && format(new Date(o.timestamp), 'MMM dd') === date)
          .reduce((sum, o) => sum + (o.pnl || 0), 0)

        dataPoint[channel.name] = dayPnl
      })

      return dataPoint
    }).slice(-30) // Last 30 days
  }

  // Format order frequency data
  const formatOrderFrequencyData = () => {
    if (!channelsPnl.length) return []

    const allDates = new Set()
    channelsPnl.forEach(channel => {
      channel.orders.forEach(order => {
        allDates.add(format(new Date(order.timestamp), 'MMM dd'))
      })
    })

    const dates = Array.from(allDates).sort()

    return dates.map(date => {
      const dataPoint = { date }

      channelsPnl.forEach(channel => {
        const orderCount = channel.orders
          .filter(o => format(new Date(o.timestamp), 'MMM dd') === date)
          .length

        dataPoint[channel.name] = orderCount
      })

      return dataPoint
    }).slice(-30)
  }

  // Format profitable % trend
  const formatProfitableTrendData = () => {
    if (!channelsPnl.length) return []

    const allDates = new Set()
    channelsPnl.forEach(channel => {
      channel.orders.forEach(order => {
        if (order.type === 'SELL') {
          allDates.add(format(new Date(order.timestamp), 'MMM dd'))
        }
      })
    })

    const dates = Array.from(allDates).sort().slice(-30)

    return dates.map(date => {
      const dataPoint = { date }

      channelsPnl.forEach(channel => {
        const sellOrders = channel.orders
          .filter(o => o.type === 'SELL' && format(new Date(o.timestamp), 'MMM dd') === date)

        if (sellOrders.length > 0) {
          const profitableCount = sellOrders.filter(o => o.pnl > 0).length
          dataPoint[channel.name] = (profitableCount / sellOrders.length) * 100
        } else {
          dataPoint[channel.name] = null
        }
      })

      return dataPoint
    })
  }

  const portfolioChartData = formatPortfolioChartData()
  const dailyPnlChartData = formatDailyPnlChartData()
  const orderFrequencyData = formatOrderFrequencyData()
  const profitableTrendData = formatProfitableTrendData()

  // Handle clicking on P&L to show breakdown
  const handlePnlClick = async (channelId) => {
    setPnlDetailsLoading(true)
    try {
      const breakdown = await getChannelPnlBreakdown(channelId)
      setSelectedChannelPnl(breakdown)
    } catch (error) {
      console.error('Error fetching P&L breakdown:', error)
    } finally {
      setPnlDetailsLoading(false)
    }
  }

  // Calculate Y-axis domain for better scaling
  const calculateYAxisDomain = () => {
    if (!portfolioChartData.length || viewMode === 'percentage') return ['auto', 'auto']

    let allValues = []
    portfolioChartData.forEach(point => {
      channelsHistory.forEach(channel => {
        const value = point[channel.name]
        if (value != null) allValues.push(value)
      })
    })

    if (allValues.length === 0) return ['auto', 'auto']

    const minValue = Math.min(...allValues)
    const maxValue = Math.max(...allValues)
    const range = maxValue - minValue

    // Add 10% padding on both sides
    const padding = range * 0.1
    const yMin = Math.floor((minValue - padding) / 1000) * 1000
    const yMax = Math.ceil((maxValue + padding) / 1000) * 1000

    return [yMin, yMax]
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Analytics Dashboard</h1>
          <p className="text-gray-500 mt-1">Cross-Channel Performance Analysis</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="bg-[#0a0a0a] border border-[#1a1a1a] text-white rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Strategy Comparison Table */}
      <div className="dashboard-card p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold text-white mb-6">All Channels Comparison</h2>
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
                <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Realized P&L</th>
                <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Total P&L</th>
                <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">ROI %</th>
                <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Profitable %</th>
                <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Trades</th>
                <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Best Stock</th>
              </tr>
            </thead>
            <tbody>
              {strategyComparison.map((strategy, i) => {
                // Use stored total_pnl from database (already calculated correctly)
                const pnl = strategy.total_pnl || 0
                return (
                  <tr key={strategy.channel_id} className="border-b border-[#1a1a1a]/50 table-row-hover">
                    <td className="py-4 text-gray-400">{i + 1}</td>
                    <td className="py-4 font-semibold text-white">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }}
                        />
                        {strategy.name}
                      </div>
                    </td>
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
                    <td className={`py-4 text-right font-semibold tabular-nums ${strategy.realized_pnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                      {strategy.realized_pnl >= 0 ? '+' : ''}₹{strategy.realized_pnl?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td
                      className={`py-4 text-right font-bold tabular-nums cursor-pointer hover:underline ${pnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}
                      onClick={() => handlePnlClick(strategy.channel_id)}
                      title="Click to see P&L breakdown"
                    >
                      {pnl >= 0 ? '+' : ''}₹{pnl?.toLocaleString('en-IN', { maximumFractionDigits: 2 })} 📊
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
                  <td colSpan="12" className="py-8 text-center text-gray-500">
                    No strategy data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cross-Channel Portfolio Value Chart */}
      <div className="dashboard-card p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-white">Portfolio Value Comparison</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('absolute')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === 'absolute'
                  ? 'bg-blue-500 text-white'
                  : 'bg-[#1a1a1a] text-gray-400 hover:bg-[#2a2a2a]'
              }`}
            >
              Absolute
            </button>
            <button
              onClick={() => setViewMode('percentage')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === 'percentage'
                  ? 'bg-blue-500 text-white'
                  : 'bg-[#1a1a1a] text-gray-400 hover:bg-[#2a2a2a]'
              }`}
            >
              % Change
            </button>
          </div>
        </div>
        {loading ? (
          <div className="h-96 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : portfolioChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300} className="sm:h-[400px]">
            <LineChart data={portfolioChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis dataKey="date" stroke="#666" fontSize={12} />
              <YAxis
                stroke="#666"
                fontSize={12}
                domain={viewMode === 'percentage' ? ['auto', 'auto'] : calculateYAxisDomain()}
                tickFormatter={(v) => viewMode === 'percentage' ? `${v.toFixed(1)}%` : `₹${(v/1000).toFixed(0)}k`}
              />
              <Tooltip content={<PortfolioTooltip />} />
              <Legend />
              {channelsHistory.map((channel, idx) => (
                <Line
                  key={channel.channel_id}
                  type="monotone"
                  dataKey={viewMode === 'percentage' ? channel.name + '_pct' : channel.name}
                  stroke={CHANNEL_COLORS[idx % CHANNEL_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  name={channel.name}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-96 flex items-center justify-center text-gray-500">
            No portfolio data available
          </div>
        )}
      </div>

      {/* Order Frequency Chart */}
      <div className="dashboard-card p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold text-white mb-6">Order Frequency (Last 30 Days)</h2>
        {loading ? (
          <div className="h-80 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : orderFrequencyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={orderFrequencyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis dataKey="date" stroke="#666" fontSize={12} />
              <YAxis stroke="#666" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '8px' }}
              />
              <Legend />
              {channelsPnl.map((channel, idx) => (
                <Bar
                  key={channel.channel_id}
                  dataKey={channel.name}
                  fill={CHANNEL_COLORS[idx % CHANNEL_COLORS.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-80 flex items-center justify-center text-gray-500">
            No order data available
          </div>
        )}
      </div>

      {/* Profitable % Trend */}
      <div className="dashboard-card p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold text-white mb-6">Profitable % Trend (Last 30 Days)</h2>
        {loading ? (
          <div className="h-80 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : profitableTrendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={profitableTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis dataKey="date" stroke="#666" fontSize={12} />
              <YAxis stroke="#666" fontSize={12} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '8px' }}
                formatter={(value) => [`${value?.toFixed(1)}%`, 'Profitable %']}
              />
              <Legend />
              {channelsPnl.map((channel, idx) => (
                <Line
                  key={channel.channel_id}
                  type="monotone"
                  dataKey={channel.name}
                  stroke={CHANNEL_COLORS[idx % CHANNEL_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-80 flex items-center justify-center text-gray-500">
            No trade data available
          </div>
        )}
      </div>

      {/* Cross-Channel Daily P&L Chart */}
      <div className="dashboard-card p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold text-white mb-6">Daily P&L Comparison (Last 30 Days)</h2>
        {loading ? (
          <div className="h-96 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : dailyPnlChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={dailyPnlChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis dataKey="date" stroke="#666" fontSize={12} />
              <YAxis stroke="#666" fontSize={12} tickFormatter={(v) => `₹${v.toFixed(0)}`} />
              <Tooltip content={<PnlTooltip />} />
              <Legend />
              {channelsPnl.map((channel, idx) => (
                <Bar
                  key={channel.channel_id}
                  dataKey={channel.name}
                  fill={CHANNEL_COLORS[idx % CHANNEL_COLORS.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-96 flex items-center justify-center text-gray-500">
            No P&L data available
          </div>
        )}
      </div>

      {/* P&L Breakdown Modal */}
      {selectedChannelPnl && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 border-b border-[#1a1a1a] flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-2xl font-bold text-white truncate">{selectedChannelPnl.channel.name} - P&L Breakdown</h2>
                <p className="text-gray-500 text-xs sm:text-sm mt-1">Detailed view of profit & loss calculation</p>
              </div>
              <button
                onClick={() => setSelectedChannelPnl(null)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-6 overflow-y-auto">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-[#1a1a1a]/50 rounded-lg p-4">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Initial Capital</p>
                  <p className="text-white text-xl font-bold">₹{selectedChannelPnl.initialCapital?.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-[#1a1a1a]/50 rounded-lg p-4">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Current Value</p>
                  <p className="text-white text-xl font-bold">₹{selectedChannelPnl.currentValue?.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-[#1a1a1a]/50 rounded-lg p-4">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Realized P&L</p>
                  <p className={`text-xl font-bold ${selectedChannelPnl.realizedPnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                    {selectedChannelPnl.realizedPnl >= 0 ? '+' : ''}₹{selectedChannelPnl.realizedPnl?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-[#1a1a1a]/50 rounded-lg p-4">
                  <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Unrealized P&L</p>
                  <p className={`text-xl font-bold ${selectedChannelPnl.unrealizedPnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                    {selectedChannelPnl.unrealizedPnl >= 0 ? '+' : ''}₹{selectedChannelPnl.unrealizedPnl?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Total P&L Calculation */}
              <div className="bg-gradient-to-r from-[#1a1a1a]/30 to-[#1a1a1a]/10 rounded-lg p-6 mb-6 border border-[#1a1a1a]">
                <h3 className="text-lg font-semibold text-white mb-4">Total P&L Calculation</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Current Portfolio Value:</span>
                    <span className="text-white font-semibold">₹{selectedChannelPnl.currentValue?.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Initial Capital:</span>
                    <span className="text-white font-semibold">- ₹{selectedChannelPnl.initialCapital?.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="border-t border-[#1a1a1a] my-2"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-white font-bold">Total P&L:</span>
                    <span className={`font-bold text-lg ${selectedChannelPnl.totalPnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                      {selectedChannelPnl.totalPnl >= 0 ? '+' : ''}₹{selectedChannelPnl.totalPnl?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Verified: Realized P&L (₹{selectedChannelPnl.realizedPnl?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}) +
                    Unrealized P&L (₹{selectedChannelPnl.unrealizedPnl?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}) =
                    ₹{((selectedChannelPnl.realizedPnl || 0) + (selectedChannelPnl.unrealizedPnl || 0))?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Current Holdings */}
              {selectedChannelPnl.holdings.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white mb-3">Current Holdings (Unrealized P&L)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-[#1a1a1a]">
                          <th className="pb-3 font-medium">Symbol</th>
                          <th className="pb-3 font-medium text-right">Qty</th>
                          <th className="pb-3 font-medium text-right">Avg Price</th>
                          <th className="pb-3 font-medium text-right">Current Price</th>
                          <th className="pb-3 font-medium text-right">Cost</th>
                          <th className="pb-3 font-medium text-right">Value</th>
                          <th className="pb-3 font-medium text-right">P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedChannelPnl.holdings.map((holding) => {
                          const cost = holding.quantity * holding.avg_price
                          const value = holding.quantity * holding.current_price
                          const pnl = value - cost
                          return (
                            <tr key={holding.symbol} className="border-b border-[#1a1a1a]/30">
                              <td className="py-3 text-white font-medium">{holding.symbol}</td>
                              <td className="py-3 text-right text-gray-300">{holding.quantity}</td>
                              <td className="py-3 text-right text-gray-300">₹{holding.avg_price?.toFixed(2)}</td>
                              <td className="py-3 text-right text-gray-300">₹{holding.current_price?.toFixed(2)}</td>
                              <td className="py-3 text-right text-gray-300">₹{cost?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                              <td className="py-3 text-right text-white font-semibold">₹{value?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                              <td className={`py-3 text-right font-semibold ${pnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                                {pnl >= 0 ? '+' : ''}₹{pnl?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sell Orders (Realized P&L) */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">
                  Completed Trades (Realized P&L) - {selectedChannelPnl.sellOrders.length} trades
                </h3>
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[#0a0a0a] z-10">
                      <tr className="text-left text-gray-500 border-b border-[#1a1a1a]">
                        <th className="pb-3 font-medium">Date</th>
                        <th className="pb-3 font-medium">Symbol</th>
                        <th className="pb-3 font-medium text-right">Qty</th>
                        <th className="pb-3 font-medium text-right">Buy Price</th>
                        <th className="pb-3 font-medium text-right">Sell Price</th>
                        <th className="pb-3 font-medium text-right">P&L</th>
                        <th className="pb-3 font-medium text-right">P&L %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedChannelPnl.sellOrders.map((order, idx) => {
                        const pnlPercent = order.buy_price > 0 ? ((order.price - order.buy_price) / order.buy_price * 100) : 0
                        return (
                          <tr key={idx} className="border-b border-[#1a1a1a]/30 hover:bg-[#1a1a1a]/20">
                            <td className="py-3 text-gray-400">
                              {format(new Date(order.timestamp), 'MMM dd, HH:mm')}
                            </td>
                            <td className="py-3 text-white font-medium">{order.symbol}</td>
                            <td className="py-3 text-right text-gray-300">{order.quantity}</td>
                            <td className="py-3 text-right text-gray-300">₹{order.buy_price?.toFixed(2)}</td>
                            <td className="py-3 text-right text-gray-300">₹{order.price?.toFixed(2)}</td>
                            <td className={`py-3 text-right font-semibold ${order.pnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                              {order.pnl >= 0 ? '+' : ''}₹{order.pnl?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </td>
                            <td className={`py-3 text-right font-semibold ${pnlPercent >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                              {pnlPercent >= 0 ? '+' : ''}{pnlPercent?.toFixed(2)}%
                            </td>
                          </tr>
                        )
                      })}
                      {selectedChannelPnl.sellOrders.length === 0 && (
                        <tr>
                          <td colSpan="7" className="py-8 text-center text-gray-500">
                            No completed trades yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
