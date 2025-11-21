'use client'

import { useState, useEffect } from 'react'
import { getHoldings, getGridLevels } from '@/lib/supabase'
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

  // Calculate totals
  const totalInvested = holdings.reduce((sum, h) => sum + (h.qty * h.avg_price), 0)
  const totalCurrent = holdings.reduce((sum, h) => sum + (h.qty * h.current_price), 0)
  const totalPnl = totalCurrent - totalInvested

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Holdings</h1>
        <ChannelSelector
          selectedChannel={channelId}
          onChannelChange={setChannelId}
        />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Invested Value</p>
          <p className="text-xl font-bold">₹{totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Current Value</p>
          <p className="text-xl font-bold">₹{totalCurrent.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Unrealized P&L</p>
          <p className={`text-xl font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold mb-4">All Holdings ({holdings.length})</h2>
        <HoldingsTable holdings={holdings} loading={loading} />
      </div>

      {/* Grid Levels */}
      {gridLevels.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4">Grid Levels Performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="pb-3 font-medium">Symbol</th>
                  <th className="pb-3 font-medium text-right">Buy Count</th>
                  <th className="pb-3 font-medium text-right">Sell Count</th>
                  <th className="pb-3 font-medium text-right">Total P&L</th>
                </tr>
              </thead>
              <tbody>
                {gridLevels.slice(0, 20).map((grid) => (
                  <tr key={grid.symbol} className="border-b border-gray-700/50">
                    <td className="py-3 font-medium text-white">{grid.symbol}</td>
                    <td className="py-3 text-right text-gray-300">{grid.buy_count || 0}</td>
                    <td className="py-3 text-right text-gray-300">{grid.sell_count || 0}</td>
                    <td className={`py-3 text-right font-medium ${grid.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {grid.total_pnl >= 0 ? '+' : ''}₹{Number(grid.total_pnl || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
