'use client'

import { format } from 'date-fns'

export default function OrdersTable({ orders, loading }) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-12 bg-[#1a1a1a] rounded"></div>
        ))}
      </div>
    )
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No orders found
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-[#1a1a1a]">
            <th className="pb-4 font-medium uppercase tracking-wider text-xs">Time</th>
            <th className="pb-4 font-medium uppercase tracking-wider text-xs">Symbol</th>
            <th className="pb-4 font-medium uppercase tracking-wider text-xs">Type</th>
            <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Qty</th>
            <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Price</th>
            <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Value</th>
            <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">P&L</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order, index) => {
            const orderType = order.order_type || order.type
            const isBuy = orderType?.toUpperCase() === 'BUY'
            const typeColor = isBuy ? 'text-[#00ff88]' : 'text-[#ff4444]'
            const typeBg = isBuy ? 'bg-[#00ff88]/10' : 'bg-[#ff4444]/10'
            const pnl = order.pnl || 0
            const pnlColor = pnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'

            return (
              <tr key={`${order.id || index}`} className="border-b border-[#1a1a1a]/50 table-row-hover">
                <td className="py-4 text-gray-400 tabular-nums">
                  {order.timestamp ? format(new Date(order.timestamp), 'MMM dd, HH:mm') : '-'}
                </td>
                <td className="py-4 font-semibold text-white">{order.symbol}</td>
                <td className="py-4">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${typeColor} ${typeBg}`}>
                    {orderType?.toUpperCase()}
                  </span>
                </td>
                <td className="py-4 text-right text-gray-300 tabular-nums">{order.qty}</td>
                <td className="py-4 text-right text-gray-300 tabular-nums">₹{Number(order.price).toFixed(2)}</td>
                <td className="py-4 text-right text-gray-300 tabular-nums">
                  ₹{(order.qty * order.price).toFixed(2)}
                </td>
                <td className={`py-4 text-right font-semibold tabular-nums ${pnlColor}`}>
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
