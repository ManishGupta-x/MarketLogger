'use client'

import { useState, useEffect } from 'react'
import { getPortfolio, getHoldings, getConfig } from '@/lib/supabase'
import { CHANNEL_CONFIG } from '@/lib/channels'
import ChannelSelector from '@/components/ChannelSelector'
import StatCard from '@/components/StatCard'
import HoldingsTable from '@/components/HoldingsTable'

export default function Dashboard() {
  const [channelId, setChannelId] = useState('')
  const [portfolio, setPortfolio] = useState(null)
  const [holdings, setHoldings] = useState([])
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!channelId) return

    async function fetchData() {
      setLoading(true)
      try {
        const [portfolioData, holdingsData, configData] = await Promise.all([
          getPortfolio(channelId),
          getHoldings(channelId),
          getConfig(channelId)
        ])
        setPortfolio(portfolioData)
        setHoldings(holdingsData)
        setConfig(configData)
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

  const totalValue = portfolio?.total_value || 0
  const cashBalance = portfolio?.cash_balance || 0
  const holdingsValue = portfolio?.holdings_value || 0
  const initialCapital = config?.capital || 0
  const totalPnl = totalValue - initialCapital
  const pnlPercent = initialCapital > 0 ? ((totalPnl / initialCapital) * 100).toFixed(2) : 0

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{channelName}</h1>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
          subtitle={totalValue > 0 ? `${((cashBalance / totalValue) * 100).toFixed(1)}% of portfolio` : ''}
          icon="💵"
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
