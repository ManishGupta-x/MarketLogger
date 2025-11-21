'use client'

import { format } from 'date-fns'

export default function OrdersTable({ orders, loading }) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-700 rounded"></div>
        ))}
      </div>
    )
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No orders found
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-700">
            <th className="pb-3 font-medium">Time</th>
            <th className="pb-3 font-medium">Symbol</th>
            <th className="pb-3 font-medium">Type</th>
            <th className="pb-3 font-medium text-right">Qty</th>
            <th className="pb-3 font-medium text-right">Price</th>
            <th className="pb-3 font-medium text-right">Value</th>
            <th className="pb-3 font-medium text-right">P&L</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order, index) => {
            const orderType = order.order_type || order.type
            const isBuy = orderType?.toUpperCase() === 'BUY'
            const typeColor = isBuy ? 'text-green-400' : 'text-red-400'
            const pnl = order.pnl || 0
            const pnlColor = pnl >= 0 ? 'text-green-400' : 'text-red-400'

            return (
              <tr key={`${order.id || index}`} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                <td className="py-3 text-gray-400">
                  {order.timestamp ? format(new Date(order.timestamp), 'MMM dd, HH:mm') : '-'}
                </td>
                <td className="py-3 font-medium text-white">{order.symbol}</td>
                <td className={`py-3 font-medium ${typeColor}`}>
                  {orderType?.toUpperCase()}
                </td>
                <td className="py-3 text-right text-gray-300">{order.qty}</td>
                <td className="py-3 text-right text-gray-300">₹{Number(order.price).toFixed(2)}</td>
                <td className="py-3 text-right text-gray-300">
                  ₹{(order.qty * order.price).toFixed(2)}
                </td>
                <td className={`py-3 text-right font-medium ${pnlColor}`}>
                  {pnl !== 0 ? `${pnl >= 0 ? '+' : ''}₹${pnl.toFixed(2)}` : '-'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
