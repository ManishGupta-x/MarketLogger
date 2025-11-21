'use client'

export default function HoldingsTable({ holdings, loading }) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-[#1a1a1a] rounded"></div>
        ))}
      </div>
    )
  }

  if (!holdings || holdings.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No holdings found
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-[#1a1a1a]">
            <th className="pb-4 font-medium uppercase tracking-wider text-xs">Symbol</th>
            <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Qty</th>
            <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Avg Price</th>
            <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Current</th>
            <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">Value</th>
            <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">P&L</th>
            <th className="pb-4 font-medium text-right uppercase tracking-wider text-xs">%</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding) => {
            const currentValue = holding.qty * holding.current_price
            const investedValue = holding.qty * holding.avg_price
            const pnl = currentValue - investedValue
            const pnlPercent = investedValue > 0 ? ((pnl / investedValue) * 100).toFixed(2) : 0
            const pnlColor = pnl >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'

            return (
              <tr key={holding.symbol} className="border-b border-[#1a1a1a]/50 table-row-hover">
                <td className="py-4 font-semibold text-white">{holding.symbol}</td>
                <td className="py-4 text-right text-gray-300 tabular-nums">{holding.qty}</td>
                <td className="py-4 text-right text-gray-300 tabular-nums">₹{holding.avg_price?.toFixed(2)}</td>
                <td className="py-4 text-right text-gray-300 tabular-nums">₹{holding.current_price?.toFixed(2)}</td>
                <td className="py-4 text-right text-gray-300 tabular-nums">₹{currentValue.toFixed(2)}</td>
                <td className={`py-4 text-right font-semibold tabular-nums ${pnlColor}`}>
                  {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)}
                </td>
                <td className={`py-4 text-right font-medium tabular-nums ${pnlColor}`}>
                  {pnl >= 0 ? '+' : ''}{pnlPercent}%
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
