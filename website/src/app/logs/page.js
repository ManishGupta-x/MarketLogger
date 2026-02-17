'use client'

import { useState, useRef, useEffect } from 'react'
import { useLogsSSE } from '@/lib/useSSE'

export default function LogsPage() {
  const { logs, connected, clearLogs } = useLogsSSE()
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState('')
  const [expandedLog, setExpandedLog] = useState(null)
  const containerRef = useRef(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const filteredLogs = filter
    ? logs.filter(log =>
        log.ticks?.some(t =>
          t.symbol?.toLowerCase().includes(filter.toLowerCase())
        )
      )
    : logs

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    })
  }

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-80px)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Live Logs</h1>
          <p className="text-gray-500 mt-1">
            {connected ? (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Connected - {logs.length} log entries
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                Disconnected
              </span>
            )}
          </p>
        </div>

        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="Filter by symbol..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-48"
          />

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              autoScroll
                ? 'bg-green-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
          </button>

          <button
            onClick={clearLogs}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Logs Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto dashboard-card p-4 font-mono text-sm"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Waiting for log data...
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((log, index) => (
              <div
                key={`${log.timestamp}-${index}`}
                className="border-b border-gray-800 pb-2"
              >
                <div
                  className="flex items-center gap-4 cursor-pointer hover:bg-gray-900 p-2 rounded"
                  onClick={() => setExpandedLog(expandedLog === index ? null : index)}
                >
                  <span className="text-gray-500 text-xs">{formatTime(log.timestamp)}</span>
                  <span className="text-blue-400">
                    {log.count} tick{log.count > 1 ? 's' : ''}
                  </span>
                  <span className="text-gray-400 text-xs truncate flex-1">
                    {log.ticks?.slice(0, 5).map(t => t.symbol).join(', ')}
                    {log.ticks?.length > 5 ? ` +${log.ticks.length - 5} more` : ''}
                  </span>
                  <span className="text-gray-600 text-xs">
                    {expandedLog === index ? '▼' : '▶'}
                  </span>
                </div>

                {expandedLog === index && (
                  <div className="mt-2 pl-4 space-y-1">
                    {log.ticks?.map((tick, tickIdx) => (
                      <div key={tickIdx} className="flex items-center gap-2 text-xs">
                        <span className="text-white font-medium w-24">{tick.symbol}</span>
                        <span className="text-gray-400">Price:</span>
                        <span className="text-white tabular-nums">{tick.last_price?.toFixed(2)}</span>
                        <span className={tick.change >= 0 ? 'text-green-400' : 'text-red-400'}>
                          ({tick.change >= 0 ? '+' : ''}{tick.change?.toFixed(2)})
                        </span>
                        <span className="text-gray-600">Vol: {tick.volume_traded}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            console.log('Full tick data:', JSON.stringify(tick, null, 2))
                            alert(`Logged ${tick.symbol} to console`)
                          }}
                          className="ml-auto text-gray-500 hover:text-white"
                        >
                          [log]
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
