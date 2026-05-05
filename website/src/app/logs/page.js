'use client'

import { useState, useRef, useEffect } from 'react'
import { useLogsSSE } from '@/lib/useSSE'

function parseLogLine(line) {
  // Format: [2026-04-13T07:39:16.093Z] [INFO] Message here
  const match = line.match(/^\[([^\]]+)\]\s*\[(\w+)\]\s*(.*)$/)
  if (match) {
    return { timestamp: match[1], level: match[2], message: match[3] }
  }
  return { timestamp: null, level: 'INFO', message: line }
}

function getLevelColor(level) {
  switch (level) {
    case 'ERROR': return 'text-red-400'
    case 'WARN': return 'text-yellow-400'
    case 'INFO': return 'text-blue-400'
    case 'DEBUG': return 'text-gray-500'
    default: return 'text-gray-400'
  }
}

export default function LogsPage() {
  const { logs, connected, clearLogs } = useLogsSSE()
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState('')
  const containerRef = useRef(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const parsedLogs = logs.map(line => typeof line === 'string' ? parseLogLine(line) : line)

  const filteredLogs = filter
    ? parsedLogs.filter(log =>
        log.message?.toLowerCase().includes(filter.toLowerCase())
      )
    : parsedLogs

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    try {
      return new Date(timestamp).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    } catch {
      return timestamp
    }
  }

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-80px)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Live Logs</h1>
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

        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            placeholder="Filter by symbol..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-full sm:w-48"
          />

          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                autoScroll
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <span className="hidden sm:inline">{autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}</span>
              <span className="sm:hidden">{autoScroll ? 'Auto ON' : 'Auto OFF'}</span>
            </button>

            <button
              onClick={clearLogs}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors"
            >
              Clear
            </button>
          </div>
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
          <div className="space-y-0.5">
            {filteredLogs.map((log, index) => (
              <div
                key={index}
                className="flex items-start gap-3 py-1 px-2 hover:bg-gray-900 rounded"
              >
                <span className="text-gray-600 text-xs whitespace-nowrap mt-0.5">
                  {formatTime(log.timestamp)}
                </span>
                <span className={`text-xs font-medium w-12 mt-0.5 ${getLevelColor(log.level)}`}>
                  {log.level}
                </span>
                <span className="text-gray-300 break-all">
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
