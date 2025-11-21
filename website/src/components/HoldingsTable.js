'use client'

export default function HoldingsTable({ holdings, loading }) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-700 rounded"></div>
        ))}
      </div>
    )
  }

  if (!holdings || holdings.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No holdings found
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-700">
            <th className="pb-3 font-medium">Symbol</th>
            <th className="pb-3 font-medium text-right">Qty</th>
            <th className="pb-3 font-medium text-right">Avg Price</th>
            <th className="pb-3 font-medium text-right">Current</th>
            <th className="pb-3 font-medium text-right">Value</th>
            <th className="pb-3 font-medium text-right">P&L</th>
            <th className="pb-3 font-medium text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding) => {
            const currentValue = holding.qty * holding.current_price
            const investedValue = holding.qty * holding.avg_price
            const pnl = currentValue - investedValue
            const pnlPercent = investedValue > 0 ? ((pnl / investedValue) * 100).toFixed(2) : 0
            const pnlColor = pnl >= 0 ? 'text-green-400' : 'text-red-400'

            return (
              <tr key={holding.symbol} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                <td className="py-3 font-medium text-white">{holding.symbol}</td>
                <td className="py-3 text-right text-gray-300">{holding.qty}</td>
                <td className="py-3 text-right text-gray-300">₹{holding.avg_price?.toFixed(2)}</td>
                <td className="py-3 text-right text-gray-300">₹{holding.current_price?.toFixed(2)}</td>
                <td className="py-3 text-right text-gray-300">₹{currentValue.toFixed(2)}</td>
                <td className={`py-3 text-right font-medium ${pnlColor}`}>
                  {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)}
                </td>
                <td className={`py-3 text-right ${pnlColor}`}>
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
