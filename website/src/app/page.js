'use client'

import { useState, useEffect } from 'react'
import { getPortfolio, getHoldings, getConfig, getOrders } from '@/lib/supabase'
import { CHANNEL_CONFIG } from '@/lib/channels'
import ChannelSelector from '@/components/ChannelSelector'
import StatCard from '@/components/StatCard'
import HoldingsTable from '@/components/HoldingsTable'

export default function Dashboard() {
  const [channelId, setChannelId] = useState('')
  const [portfolio, setPortfolio] = useState(null)
  const [holdings, setHoldings] = useState([])
  const [config, setConfig] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!channelId) return

    async function fetchData() {
      setLoading(true)
      try {
        const [portfolioData, holdingsData, configData, ordersData] = await Promise.all([
          getPortfolio(channelId),
          getHoldings(channelId),
          getConfig(channelId),
          getOrders(channelId)
        ])
        setPortfolio(portfolioData)
        setHoldings(holdingsData)
        setConfig(configData)
        setOrders(ordersData)
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [channelId])

  const channelConfig = CHANNEL_CONFIG[channelId]
  const channelName = channelConfig?.name || 'Select Channel'

  // Calculate real-time values from holdings and cash
  const cashBalance = portfolio?.cash_balance || 0
  const initialCapital = config?.capital || 0

  // Calculate realized P&L from SELL orders (source of truth)
  const sellOrders = orders.filter(o => o.type === 'SELL')
  const realizedPnl = sellOrders.reduce((sum, o) => sum + (parseFloat(o.pnl) || 0), 0)

  // Calculate real-time holdings value and unrealized P&L
  let holdingsValue = 0
  let unrealizedPnl = 0

  holdings.forEach(h => {
    const qty = h.qty || 0
    const avgPrice = h.avg_price || 0
    const currentPrice = h.current_price || 0

    const invested = qty * avgPrice
    const current = qty * currentPrice

    holdingsValue += current
    unrealizedPnl += (current - invested)
  })

  // Calculate real-time current value = cash + holdings + realized profit (now separate)
  const totalValue = cashBalance + holdingsValue + realizedPnl

  // Calculate real-time total P&L = realized + unrealized
  const totalPnl = realizedPnl + unrealizedPnl
  const pnlPercent = initialCapital > 0 ? ((totalPnl / initialCapital) * 100).toFixed(2) : 0

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{channelName}</h1>
          <p className="text-gray-500 mt-1">Portfolio Overview</p>
        </div>
        <ChannelSelector
          selectedChannel={channelId}
          onChannelChange={setChannelId}
        />
      </div>

      {/* Channel Configuration */}
      {config && (
        <div className="dashboard-card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Strategy Configuration</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Initial Capital</p>
              <p className="text-lg font-bold text-white mt-1 tabular-nums">₹{config.capital?.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Per Order Amount</p>
              <p className="text-lg font-bold text-blue-400 mt-1 tabular-nums">₹{config.amount_per_trade?.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Grid Percentage</p>
              <p className="text-lg font-bold text-purple-400 mt-1 tabular-nums">{config.grid_percentage}%</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Max Positions</p>
              <p className="text-lg font-bold text-cyan-400 mt-1 tabular-nums">~{Math.floor(config.capital / config.amount_per_trade)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatCard
          title="Total Value"
          value={`₹${totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          subtitle={`${pnlPercent >= 0 ? '+' : ''}${pnlPercent}% overall`}
          trend={totalPnl}
          icon="💰"
        />
        <StatCard
          title="Cash Balance"
          value={`₹${cashBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          subtitle="Fixed capital"
          icon="💵"
        />
        <StatCard
          title="Realized P&L"
          value={`${realizedPnl >= 0 ? '+' : ''}₹${realizedPnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          subtitle="Profits (separate)"
          trend={realizedPnl}
          icon="💹"
        />
        <StatCard
          title="Holdings Value"
          value={`₹${holdingsValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          subtitle={`${holdings.length} positions`}
          icon="📊"
        />
        <StatCard
          title="Total P&L"
          value={`${totalPnl >= 0 ? '+' : ''}₹${totalPnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          subtitle={`${pnlPercent >= 0 ? '+' : ''}${pnlPercent}%`}
          trend={totalPnl}
          icon="📈"
        />
      </div>

      {/* Holdings */}
      <div className="dashboard-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Current Holdings</h2>
          <span className="text-sm text-gray-500">{holdings.length} positions</span>
        </div>
        <HoldingsTable holdings={holdings} loading={loading} />
      </div>
    </div>
  )
}
