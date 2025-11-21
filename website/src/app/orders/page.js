'use client'

import { useState, useEffect } from 'react'
import { getOrders } from '@/lib/supabase'
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

  // Calculate stats
  const buyOrders = orders.filter(o => (o.order_type || o.type)?.toUpperCase() === 'BUY')
  const sellOrders = orders.filter(o => (o.order_type || o.type)?.toUpperCase() === 'SELL')
  const totalPnl = orders.reduce((sum, o) => sum + (o.pnl || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Order History</h1>
        <ChannelSelector
          selectedChannel={channelId}
          onChannelChange={setChannelId}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Total Orders</p>
          <p className="text-xl font-bold">{orders.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Buy Orders</p>
          <p className="text-xl font-bold text-green-400">{buyOrders.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Sell Orders</p>
          <p className="text-xl font-bold text-red-400">{sellOrders.length}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Realized P&L</p>
          <p className={`text-xl font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <label className="text-sm text-gray-400">Show:</label>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-1 text-sm"
        >
          <option value={25}>Last 25</option>
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={500}>Last 500</option>
        </select>
      </div>

      {/* Orders Table */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <OrdersTable orders={orders} loading={loading} />
      </div>
    </div>
  )
}
