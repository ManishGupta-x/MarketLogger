'use client'

import { useState, useEffect } from 'react'
import { getHoldings } from '@/lib/supabase'
import { CHANNEL_CONFIG } from '@/lib/channels'
import ChannelSelector from '@/components/ChannelSelector'
import HoldingsTable from '@/components/HoldingsTable'

export default function HoldingsPage() {
  const [channelId, setChannelId] = useState('')
  const [holdings, setHoldings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!channelId) return

    async function fetchData() {
      setLoading(true)
      try {
        const holdingsData = await getHoldings(channelId)
        setHoldings(holdingsData)
      } catch (error) {
        console.error('Error fetching holdings:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [channelId])

  const channelConfig = CHANNEL_CONFIG[channelId]
  const channelName = channelConfig?.name || 'Select Channel'

  // Calculate totals
  const totalInvested = holdings.reduce((sum, h) => sum + (h.qty * h.avg_price), 0)
  const totalCurrent = holdings.reduce((sum, h) => sum + (h.qty * h.current_price), 0)
  const totalPnl = totalCurrent - totalInvested

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Holdings</h1>
          <p className="text-gray-500 mt-1">{channelName}</p>
        </div>
        <ChannelSelector
          selectedChannel={channelId}
          onChannelChange={setChannelId}
        />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="dashboard-card p-6">
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Invested Value</p>
          <p className="text-2xl font-bold text-white mt-2 tabular-nums">₹{totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="dashboard-card p-6">
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Current Value</p>
          <p className="text-2xl font-bold text-white mt-2 tabular-nums">₹{totalCurrent.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
        </div>
        <div className={`dashboard-card p-6 ${totalPnl >= 0 ? 'glow-green' : 'glow-red'}`}>
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Unrealized P&L</p>
          <p className={`text-2xl font-bold mt-2 tabular-nums ${totalPnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
            {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="dashboard-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">All Holdings</h2>
          <span className="text-sm text-gray-500">{holdings.length} positions</span>
        </div>
        <HoldingsTable holdings={holdings} loading={loading} />
      </div>
    </div>
  )
}
