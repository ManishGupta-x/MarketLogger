'use client'

import { useState, useEffect } from 'react'
import { getOrders, getOrdersCount, getConfig } from '@/lib/supabase'
import { CHANNEL_CONFIG } from '@/lib/channels'
import ChannelSelector from '@/components/ChannelSelector'
import OrdersTable from '@/components/OrdersTable'

export default function OrdersPage() {
  const [channelId, setChannelId] = useState('')
  const [orders, setOrders] = useState([])
  const [totalOrdersCount, setTotalOrdersCount] = useState(0)
  const [channelConfig, setChannelConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState(50)

  useEffect(() => {
    if (!channelId) return

    async function fetchData() {
      setLoading(true)
      try {
        const [ordersData, totalCount, configData] = await Promise.all([
          getOrders(channelId, limit),
          getOrdersCount(channelId),
          getConfig(channelId)
        ])
        setOrders(ordersData)
        setTotalOrdersCount(totalCount)
        setChannelConfig(configData)
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [channelId, limit])

  const channelInfo = CHANNEL_CONFIG[channelId]
  const channelName = channelInfo?.name || 'Select Channel'

  // Calculate stats from FILTERED orders only
  const buyOrders = orders.filter(o => (o.order_type || o.type)?.toUpperCase() === 'BUY')
  const sellOrders = orders.filter(o => (o.order_type || o.type)?.toUpperCase() === 'SELL')
  const totalPnl = orders.reduce((sum, o) => sum + (o.pnl || 0), 0)
  const totalValue = orders.reduce((sum, o) => sum + (o.qty * o.price), 0)

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Order History</h1>
          <p className="text-gray-500 mt-1">{channelName}</p>
        </div>
        <ChannelSelector
          selectedChannel={channelId}
          onChannelChange={setChannelId}
        />
      </div>

      {/* Channel Config Details */}
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
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Orders per Cycle</p>
              <p className="text-lg font-bold text-cyan-400 mt-1 tabular-nums">~{Math.floor(channelConfig.capital / channelConfig.amount_per_trade)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats for Filtered Orders */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            Statistics <span className="text-gray-500 text-sm font-normal">(Showing {orders.length} of {totalOrdersCount} Orders)</span>
          </h2>
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-500">Show:</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="bg-[#0a0a0a] border border-[#1a1a1a] text-white rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={25}>Last 25</option>
              <option value={50}>Last 50</option>
              <option value={100}>Last 100</option>
              <option value={500}>Last 500</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div className="dashboard-card p-6">
            <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Total Orders</p>
            <p className="text-2xl font-bold text-white mt-2 tabular-nums">{totalOrdersCount}</p>
            <p className="text-xs text-gray-500 mt-1">All time</p>
          </div>
          <div className="dashboard-card p-6">
            <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Buy Orders</p>
            <p className="text-2xl font-bold text-[#00ff88] mt-2 tabular-nums">{buyOrders.length}</p>
          </div>
          <div className="dashboard-card p-6">
            <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Sell Orders</p>
            <p className="text-2xl font-bold text-[#ff4444] mt-2 tabular-nums">{sellOrders.length}</p>
          </div>
          <div className="dashboard-card p-6">
            <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Total Value</p>
            <p className="text-2xl font-bold text-blue-400 mt-2 tabular-nums">₹{totalValue.toFixed(2)}</p>
          </div>
          <div className={`dashboard-card p-6 ${totalPnl >= 0 ? 'glow-green' : 'glow-red'}`}>
            <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Realized P&L</p>
            <p className={`text-2xl font-bold mt-2 tabular-nums ${totalPnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
              {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="dashboard-card p-6">
        <OrdersTable orders={orders} loading={loading} />
      </div>
    </div>
  )
}
