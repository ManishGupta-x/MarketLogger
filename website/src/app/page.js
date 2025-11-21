'use client'

import { useState, useEffect } from 'react'
import { getPortfolio, getHoldings, getConfig } from '@/lib/supabase'
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

  const totalValue = portfolio?.total_value || 0
  const cashBalance = portfolio?.cash_balance || 0
  const holdingsValue = portfolio?.holdings_value || 0
  const initialCapital = config?.capital || 0
  const totalPnl = totalValue - initialCapital
  const pnlPercent = initialCapital > 0 ? ((totalPnl / initialCapital) * 100).toFixed(2) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <ChannelSelector
          selectedChannel={channelId}
          onChannelChange={setChannelId}
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Value"
          value={`₹${totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
          subtitle={`${pnlPercent >= 0 ? '+' : ''}${pnlPercent}% overall`}
          trend={totalPnl}
          icon="💰"
        />
        <StatCard
          title="Cash Balance"
          value={`₹${cashBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
          icon="💵"
        />
        <StatCard
          title="Holdings Value"
          value={`₹${holdingsValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
          subtitle={`${holdings.length} positions`}
          icon="📊"
        />
        <StatCard
          title="Total P&L"
          value={`${totalPnl >= 0 ? '+' : ''}₹${totalPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
          subtitle={`${pnlPercent >= 0 ? '+' : ''}${pnlPercent}%`}
          trend={totalPnl}
          icon="📈"
        />
      </div>

      {/* Holdings */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold mb-4">Current Holdings</h2>
        <HoldingsTable holdings={holdings} loading={loading} />
      </div>
    </div>
  )
}
