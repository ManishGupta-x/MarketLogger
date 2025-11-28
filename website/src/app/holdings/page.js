'use client'

import { useState, useEffect } from 'react'
import { getHoldings, getPortfolio, getConfig, getOrders } from '@/lib/supabase'
import { CHANNEL_CONFIG } from '@/lib/channels'
import ChannelSelector from '@/components/ChannelSelector'
import HoldingsTable from '@/components/HoldingsTable'

export default function HoldingsPage() {
  const [channelId, setChannelId] = useState('')
  const [holdings, setHoldings] = useState([])
  const [portfolio, setPortfolio] = useState(null)
  const [channelConfig, setChannelConfig] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!channelId) return

    async function fetchData() {
      setLoading(true)
      try {
        const [holdingsData, portfolioData, configData, ordersData] = await Promise.all([
          getHoldings(channelId),
          getPortfolio(channelId),
          getConfig(channelId),
          getOrders(channelId)
        ])
        setHoldings(holdingsData)
        setPortfolio(portfolioData)
        setChannelConfig(configData)
        setOrders(ordersData)
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [channelId])

  const channelInfo = CHANNEL_CONFIG[channelId]
  const channelName = channelInfo?.name || 'Select Channel'

  // Calculate totals
  const totalInvested = holdings.reduce((sum, h) => sum + (h.qty * h.avg_price), 0)
  const totalCurrent = holdings.reduce((sum, h) => sum + (h.qty * h.current_price), 0)
  const totalPnl = totalCurrent - totalInvested
  const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0

  // Portfolio metrics
  const cashBalance = portfolio?.cash_balance || 0

  // Calculate realized P&L from SELL orders (source of truth)
  const sellOrders = orders.filter(o => o.type === 'SELL')
  const realizedPnl = sellOrders.reduce((sum, o) => sum + (parseFloat(o.pnl) || 0), 0)

  const totalValue = cashBalance + totalCurrent + realizedPnl
  const unrealizedPnl = totalPnl
  const overallPnl = realizedPnl + unrealizedPnl
  const overallPnlPercent = channelConfig?.capital > 0 ? (overallPnl / channelConfig.capital) * 100 : 0

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Portfolio</h1>
          <p className="text-gray-500 mt-1">{channelName}</p>
        </div>
        <ChannelSelector
          selectedChannel={channelId}
          onChannelChange={setChannelId}
        />
      </div>

      {/* Channel Config */}
      {channelConfig && (
        <div className="dashboard-card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Channel Configuration</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Initial Capital</p>
              <p className="text-lg font-bold text-white mt-1 tabular-nums">₹{channelConfig.capital?.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Per Order Amount</p>
              <p className="text-lg font-bold text-blue-400 mt-1 tabular-nums">₹{channelConfig.amount_per_trade?.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Grid %</p>
              <p className="text-lg font-bold text-purple-400 mt-1 tabular-nums">{channelConfig.grid_percentage}%</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Positions</p>
              <p className="text-lg font-bold text-cyan-400 mt-1 tabular-nums">{holdings.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Portfolio Overview */}
      <div className="dashboard-card p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Portfolio Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Cash Balance</p>
            <p className="text-xl font-bold text-white mt-1 tabular-nums">₹{cashBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
            <p className="text-xs text-gray-600 mt-1">
              {totalValue > 0 ? ((cashBalance / totalValue) * 100).toFixed(1) : '0'}% of portfolio
            </p>
          </div>
          <div>
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Holdings Value</p>
            <p className="text-xl font-bold text-white mt-1 tabular-nums">₹{totalCurrent.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
            <p className="text-xs text-gray-600 mt-1">
              {totalValue > 0 ? ((totalCurrent / totalValue) * 100).toFixed(1) : '0'}% of portfolio
            </p>
          </div>
          <div>
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Total Value</p>
            <p className="text-xl font-bold text-white mt-1 tabular-nums">₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
            <p className={`text-xs mt-1 ${overallPnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
              {overallPnl >= 0 ? '+' : ''}₹{overallPnl.toFixed(2)} ({overallPnl >= 0 ? '+' : ''}{overallPnlPercent.toFixed(2)}%)
            </p>
          </div>
          <div>
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Invested Amount</p>
            <p className="text-xl font-bold text-white mt-1 tabular-nums">₹{totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
            <p className="text-xs text-gray-600 mt-1">
              Across {holdings.length} stocks
            </p>
          </div>
        </div>
      </div>

      {/* P&L Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className={`dashboard-card p-6 ${realizedPnl >= 0 ? 'glow-green' : 'glow-red'}`}>
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Realized P&L</p>
          <p className={`text-2xl font-bold mt-2 tabular-nums ${realizedPnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
            {realizedPnl >= 0 ? '+' : ''}₹{realizedPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 mt-2">From closed positions</p>
        </div>
        <div className={`dashboard-card p-6 ${unrealizedPnl >= 0 ? 'glow-green' : 'glow-red'}`}>
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Unrealized P&L</p>
          <p className={`text-2xl font-bold mt-2 tabular-nums ${unrealizedPnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
            {unrealizedPnl >= 0 ? '+' : ''}₹{unrealizedPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </p>
          <p className={`text-xs mt-2 ${totalPnlPercent >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
            {totalPnlPercent >= 0 ? '+' : ''}{totalPnlPercent.toFixed(2)}% on holdings
          </p>
        </div>
        <div className={`dashboard-card p-6 ${overallPnl >= 0 ? 'glow-green' : 'glow-red'}`}>
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Total P&L</p>
          <p className={`text-2xl font-bold mt-2 tabular-nums ${overallPnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
            {overallPnl >= 0 ? '+' : ''}₹{overallPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </p>
          <p className={`text-xs mt-2 ${overallPnlPercent >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
            {overallPnlPercent >= 0 ? '+' : ''}{overallPnlPercent.toFixed(2)}% ROI
          </p>
        </div>
      </div>

      {/* Holdings Table */}
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
