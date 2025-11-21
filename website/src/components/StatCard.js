export default function StatCard({ title, value, subtitle, trend, icon }) {
  const isPositive = trend > 0
  const isNegative = trend < 0
  const trendColor = isPositive ? 'text-[#00ff88]' : isNegative ? 'text-[#ff4444]' : 'text-gray-400'
  const glowClass = isPositive ? 'glow-green' : isNegative ? 'glow-red' : ''

  return (
    <div className={`dashboard-card p-6 ${glowClass} animate-fade-in`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-white mt-2 tabular-nums">{value}</p>
          {subtitle && (
            <p className={`text-sm mt-2 font-medium ${trendColor}`}>
              {trend > 0 && '↑ '}{trend < 0 && '↓ '}{subtitle}
            </p>
          )}
        </div>
        {icon && (
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
            isPositive ? 'bg-[#00ff88]/10' : isNegative ? 'bg-[#ff4444]/10' : 'bg-blue-500/10'
          }`}>
            <span className="text-2xl">{icon}</span>
          </div>
        )}
      </div>
    </div>
  )
}
