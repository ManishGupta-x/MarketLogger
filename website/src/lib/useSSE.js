'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const SSE_BASE_URL = process.env.NEXT_PUBLIC_SSE_URL || 'http://localhost:8080'

export function useTicksSSE() {
  const [stocks, setStocks] = useState(new Map())
  const [connected, setConnected] = useState(false)
  const eventSourceRef = useRef(null)

  useEffect(() => {
    // Fetch initial data
    fetch(`${SSE_BASE_URL}/api/ticks/latest`, {
      headers: { 'ngrok-skip-browser-warning': 'true' }
    })
      .then(res => res.json())
      .then(ticks => {
        const stockMap = new Map()
        ticks.forEach(tick => {
          stockMap.set(tick.instrument_token, tick)
        })
        setStocks(stockMap)
      })
      .catch(err => console.error('Failed to fetch initial ticks:', err))

    // Connect to SSE
    const eventSource = new EventSource(`${SSE_BASE_URL}/api/ticks/stream`)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      setConnected(true)
    }

    eventSource.addEventListener('snapshot', (e) => {
      const ticks = JSON.parse(e.data)
      setStocks(prev => {
        const newMap = new Map(prev)
        ticks.forEach(tick => {
          newMap.set(tick.instrument_token, tick)
        })
        return newMap
      })
    })

    eventSource.addEventListener('ticks', (e) => {
      const ticks = JSON.parse(e.data)
      setStocks(prev => {
        const newMap = new Map(prev)
        ticks.forEach(tick => {
          newMap.set(tick.instrument_token, tick)
        })
        return newMap
      })
    })

    eventSource.onerror = () => {
      setConnected(false)
    }

    return () => {
      eventSource.close()
    }
  }, [])

  return { stocks: Array.from(stocks.values()), connected }
}

export function useLogsSSE() {
  const [logs, setLogs] = useState([])
  const [connected, setConnected] = useState(false)
  const eventSourceRef = useRef(null)
  const maxLogs = 500

  useEffect(() => {
    const eventSource = new EventSource(`${SSE_BASE_URL}/api/logs/stream`)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      setConnected(true)
    }

    eventSource.addEventListener('history', (e) => {
      const history = JSON.parse(e.data)
      setLogs(history.slice(-maxLogs))
    })

    eventSource.addEventListener('log', (e) => {
      const logEntry = JSON.parse(e.data)
      setLogs(prev => {
        const newLogs = [...prev, logEntry]
        if (newLogs.length > maxLogs) {
          return newLogs.slice(-maxLogs)
        }
        return newLogs
      })
    })

    eventSource.onerror = () => {
      setConnected(false)
    }

    return () => {
      eventSource.close()
    }
  }, [])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  return { logs, connected, clearLogs }
}
