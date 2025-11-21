'use client'

import { useState, useEffect } from 'react'
import { getHoldings, getGridLevels } from '@/lib/supabase'
import { CHANNEL_CONFIG } from '@/lib/channels'
import ChannelSelector from '@/components/ChannelSelector'
import HoldingsTable from '@/components/HoldingsTable'

export default function HoldingsPage() {
  const [channelId, setChannelId] = useState('')
  const [holdings, setHoldings] = useState([])
  const [gridLevels, setGridLevels] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!channelId) return

    async function fetchData() {
      setLoading(true)
      try {
        const [holdingsData, gridData] = await Promise.all([
          getHoldings(channelId),
          getGridLevels(channelId)
        ])
        setHoldings(holdingsData)
        setGridLevels(gridData)
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

      {/* Grid Levels */}
      {gridLevels.length > 0 && (
        <div className="dashboard-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">Grid Levels Performance</h2>
            <span className="text-sm text-gray-500">Top 20</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-[#1a1a1a]">
                  <th className="pb-4 font-medium uppercase tracking-wider text-xs">Symbol</th>
                  <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Buy Count</th>
                  <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Sell Count</th>
                  <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Total P&L</th>
                </tr>
              </thead>
              <tbody>
                {gridLevels.slice(0, 20).map((grid) => {
                  const pnl = Number(grid.total_pnl || 0)
                  return (
                    <tr key={grid.symbol} className="border-b border-[#1a1a1a]/50 table-row-hover">
                      <td className="py-4 font-semibold text-white">{grid.symbol}</td>
                      <td className="py-4 text-right text-gray-300 tabular-nums">{grid.buy_count || 0}</td>
                      <td className="py-4 text-right text-gray-300 tabular-nums">{grid.sell_count || 0}</td>
                      <td className={`py-4 text-right font-semibold tabular-nums ${pnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                        {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
