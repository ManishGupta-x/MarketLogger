'use client'

import { useState, useMemo } from 'react'
import { useStrategies, useCalendar } from '@/lib/useSSE'

export default function StrategiesPage() {
  const { strategies, loading, fetchStrategies } = useStrategies()
  const { calendar, loading: calendarLoading, fetchCalendar, addStrategy } = useCalendar()
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    date: '',
    gridPercentage: 0.25,
    targetPercentage: 0.5,
    stopLossPercentage: 1,
    perTradeAmount: 5000,
    capital: 100000,
    isHoliday: false,
    notes: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('history')

  const formatPrice = (price) => {
    if (price === undefined || price === null) return '-'
    return Number(price).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    const result = await addStrategy(formData)
    setSubmitting(false)

    if (result.success) {
      setShowModal(false)
      setFormData({
        date: '',
        gridPercentage: 0.25,
        targetPercentage: 0.5,
        stopLossPercentage: 1,
        perTradeAmount: 5000,
        capital: 100000,
        isHoliday: false,
        notes: ''
      })
    } else {
      alert(result.message)
    }
  }

  // Summary statistics
  const summary = useMemo(() => {
    const completed = strategies.filter(s => s.status === 'completed')
    const totalPnl = completed.reduce((sum, s) => sum + (s.realized_pnl || 0), 0)
    const profitableDays = completed.filter(s => s.realized_pnl > 0).length
    const totalTrades = completed.reduce((sum, s) => sum + (s.total_trades || 0), 0)
    const avgWinRate = completed.length > 0
      ? completed.reduce((sum, s) => sum + (s.win_rate || 0), 0) / completed.length
      : 0

    return {
      totalDays: completed.length,
      totalPnl,
      avgPnl: completed.length > 0 ? totalPnl / completed.length : 0,
      avgWinRate,
      profitableDays,
      lossDays: completed.length - profitableDays,
      totalTrades,
      successRate: completed.length > 0 ? (profitableDays / completed.length * 100) : 0
    }
  }, [strategies])

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Strategies</h1>
            <p className="text-gray-500 mt-1">Schedule and track trading strategies</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium"
            >
              + Schedule Strategy
            </button>
            <button
              onClick={() => { fetchStrategies(); fetchCalendar(); }}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-sm"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            History ({strategies.length})
          </button>
          <button
            onClick={() => setActiveTab('scheduled')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'scheduled'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Scheduled ({calendar.length})
          </button>
        </div>

        {/* Summary Cards - Only show for history tab */}
        {activeTab === 'history' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="dashboard-card p-4">
                <div className="text-gray-500 text-sm mb-1">Total Days</div>
                <div className="text-xl font-bold text-white">{summary.totalDays}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {summary.profitableDays} profitable, {summary.lossDays} loss
                </div>
              </div>

              <div className={`dashboard-card p-4 ${summary.totalPnl >= 0 ? 'glow-green' : 'glow-red'}`}>
                <div className="text-gray-500 text-sm mb-1">Total P&L</div>
                <div className={`text-xl font-bold tabular-nums ${summary.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {summary.totalPnl >= 0 ? '+' : ''}{formatPrice(summary.totalPnl)}
                </div>
              </div>

              <div className="dashboard-card p-4">
                <div className="text-gray-500 text-sm mb-1">Avg P&L/Day</div>
                <div className={`text-xl font-bold tabular-nums ${summary.avgPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {summary.avgPnl >= 0 ? '+' : ''}{formatPrice(summary.avgPnl)}
                </div>
              </div>

              <div className="dashboard-card p-4">
                <div className="text-gray-500 text-sm mb-1">Avg Win Rate</div>
                <div className="text-xl font-bold text-white">{summary.avgWinRate.toFixed(1)}%</div>
                <div className="text-xs text-gray-500 mt-1">{summary.totalTrades} total trades</div>
              </div>
            </div>

            {/* Success Rate Bar */}
            <div className="dashboard-card p-4 mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-500 text-sm">Day Success Rate</span>
                <span className="text-white font-medium">{summary.successRate.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
                  style={{ width: `${summary.successRate}%` }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Content based on tab */}
      {activeTab === 'history' ? (
        <div className="dashboard-card overflow-hidden">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading strategies...</div>
          ) : strategies.length > 0 ? (
            <>
              {/* Desktop Table */}
              <div className="overflow-x-auto mobile-hide-table">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Grid %</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Target %</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">SL %</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Per Trade</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Capital</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Trades</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Win Rate</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">P&L</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {strategies.map((strategy) => {
                      const isProfit = strategy.realized_pnl >= 0
                      return (
                        <tr key={strategy.id} className="table-row-hover transition-colors">
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="font-medium text-white">{formatDate(strategy.date)}</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-blue-400">
                            {strategy.grid_percentage}%
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-green-400">
                            {strategy.target_percentage}%
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-red-400">
                            {strategy.stop_loss_percentage}%
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-gray-400">
                            {formatPrice(strategy.per_trade_amount)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-white">
                            {formatPrice(strategy.capital)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-white">
                            {strategy.total_trades}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-white">
                            {strategy.win_rate?.toFixed(1)}%
                          </td>
                          <td className={`px-4 py-4 whitespace-nowrap text-right tabular-nums font-medium ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                            {isProfit ? '+' : ''}{formatPrice(strategy.realized_pnl)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center">
                            <span className={`px-2 py-1 text-xs font-medium rounded ${
                              strategy.status === 'completed'
                                ? 'bg-green-900/50 text-green-400'
                                : 'bg-yellow-900/50 text-yellow-400'
                            }`}>
                              {strategy.status?.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="mobile-show p-4 space-y-3">
                {strategies.map((strategy) => {
                  const isProfit = strategy.realized_pnl >= 0
                  return (
                    <div key={strategy.id} className="mobile-card">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-medium text-white text-lg">{formatDate(strategy.date)}</div>
                          <div className="text-xs text-gray-500">
                            Grid: {strategy.grid_percentage}% | Target: {strategy.target_percentage}%
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                            {isProfit ? '+' : ''}{formatPrice(strategy.realized_pnl)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-gray-500">
              <div className="text-4xl mb-4">📊</div>
              <div className="text-lg">No strategies recorded yet</div>
            </div>
          )}
        </div>
      ) : (
        /* Scheduled Strategies */
        <div className="dashboard-card overflow-hidden">
          {calendarLoading ? (
            <div className="text-center py-12 text-gray-500">Loading calendar...</div>
          ) : calendar.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Grid %</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Target %</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">SL %</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Per Trade</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Capital</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {calendar.map((entry) => (
                    <tr key={entry.id} className="table-row-hover transition-colors">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="font-medium text-white">{formatDate(entry.date)}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-blue-400">
                        {entry.is_holiday ? '-' : `${entry.grid_percentage}%`}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-green-400">
                        {entry.is_holiday ? '-' : `${entry.target_percentage}%`}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-red-400">
                        {entry.is_holiday ? '-' : `${entry.stop_loss_percentage}%`}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-gray-400">
                        {entry.is_holiday ? '-' : formatPrice(entry.per_trade_amount)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right tabular-nums text-white">
                        {entry.is_holiday ? '-' : formatPrice(entry.capital)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-gray-400 text-sm">
                        {entry.notes || '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          entry.is_holiday
                            ? 'bg-red-900/50 text-red-400'
                            : 'bg-blue-900/50 text-blue-400'
                        }`}>
                          {entry.is_holiday ? 'HOLIDAY' : 'SCHEDULED'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16 text-gray-500">
              <div className="text-4xl mb-4">📅</div>
              <div className="text-lg">No scheduled strategies</div>
              <button
                onClick={() => setShowModal(true)}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm"
              >
                Schedule Now
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl max-w-md w-full p-6 border border-gray-800">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Schedule Strategy</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-white text-2xl"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  id="isHoliday"
                  checked={formData.isHoliday}
                  onChange={(e) => setFormData({ ...formData, isHoliday: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="isHoliday" className="text-sm text-gray-400">Mark as Market Holiday</label>
              </div>

              {!formData.isHoliday && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Grid %</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={formData.gridPercentage}
                        onChange={(e) => setFormData({ ...formData, gridPercentage: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Target %</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={formData.targetPercentage}
                        onChange={(e) => setFormData({ ...formData, targetPercentage: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Stop Loss %</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={formData.stopLossPercentage}
                        onChange={(e) => setFormData({ ...formData, stopLossPercentage: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Per Trade (Rs)</label>
                      <input
                        type="number"
                        required
                        value={formData.perTradeAmount}
                        onChange={(e) => setFormData({ ...formData, perTradeAmount: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Capital (Rs)</label>
                    <input
                      type="number"
                      required
                      value={formData.capital}
                      onChange={(e) => setFormData({ ...formData, capital: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm text-gray-400 mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={formData.isHoliday ? "e.g., Holi" : "e.g., Expiry day"}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
