'use client'

import { useState, useEffect } from 'react'
import { getOrders } from '@/lib/supabase'
import { CHANNEL_CONFIG } from '@/lib/channels'
import ChannelSelector from '@/components/ChannelSelector'
import OrdersTable from '@/components/OrdersTable'

export default function OrdersPage() {
  const [channelId, setChannelId] = useState('')
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState(50)

  useEffect(() => {
    if (!channelId) return

    async function fetchOrders() {
      setLoading(true)
      try {
        const data = await getOrders(channelId, limit)
        setOrders(data)
      } catch (error) {
        console.error('Error fetching orders:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchOrders()
  }, [channelId, limit])

  const channelConfig = CHANNEL_CONFIG[channelId]
  const channelName = channelConfig?.name || 'Select Channel'

  // Calculate stats
  const buyOrders = orders.filter(o => (o.order_type || o.type)?.toUpperCase() === 'BUY')
  const sellOrders = orders.filter(o => (o.order_type || o.type)?.toUpperCase() === 'SELL')
  const totalPnl = orders.reduce((sum, o) => sum + (o.pnl || 0), 0)

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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="dashboard-card p-6">
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Total Orders</p>
          <p className="text-2xl font-bold text-white mt-2 tabular-nums">{orders.length}</p>
        </div>
        <div className="dashboard-card p-6">
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Buy Orders</p>
          <p className="text-2xl font-bold text-[#00ff88] mt-2 tabular-nums">{buyOrders.length}</p>
        </div>
        <div className="dashboard-card p-6">
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Sell Orders</p>
          <p className="text-2xl font-bold text-[#ff4444] mt-2 tabular-nums">{sellOrders.length}</p>
        </div>
        <div className={`dashboard-card p-6 ${totalPnl >= 0 ? 'glow-green' : 'glow-red'}`}>
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Realized P&L</p>
          <p className={`text-2xl font-bold mt-2 tabular-nums ${totalPnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
            {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Filters */}
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

      {/* Orders Table */}
      <div className="dashboard-card p-6">
        <OrdersTable orders={orders} loading={loading} />
      </div>
    </div>
  )
}
