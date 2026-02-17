'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchEventSource } from '@microsoft/fetch-event-source'

const SSE_BASE_URL = process.env.NEXT_PUBLIC_SSE_URL || 'http://localhost:8080'

// Headers to bypass ngrok browser warning
const NGROK_HEADERS = {
  'ngrok-skip-browser-warning': 'true'
}

export function useTicksSSE() {
  const [stocks, setStocks] = useState(new Map())
  const [connected, setConnected] = useState(false)
  const controllerRef = useRef(null)

  useEffect(() => {
    // Fetch initial data
    fetch(`${SSE_BASE_URL}/api/ticks/latest`, { headers: NGROK_HEADERS })
      .then(res => res.json())
      .then(ticks => {
        const stockMap = new Map()
        ticks.forEach(tick => {
          stockMap.set(tick.instrument_token, tick)
        })
        setStocks(stockMap)
        setConnected(true)
      })
      .catch(err => console.error('Failed to fetch initial ticks:', err))

    // Connect to SSE with custom headers (works with ngrok)
    const controller = new AbortController()
    controllerRef.current = controller

    fetchEventSource(`${SSE_BASE_URL}/api/ticks/stream`, {
      headers: NGROK_HEADERS,
      signal: controller.signal,
      onopen(response) {
        if (response.ok) {
          setConnected(true)
        }
      },
      onmessage(event) {
        if (event.event === 'snapshot' || event.event === 'ticks') {
          const ticks = JSON.parse(event.data)
          setStocks(prev => {
            const newMap = new Map(prev)
            ticks.forEach(tick => {
              newMap.set(tick.instrument_token, tick)
            })
            return newMap
          })
        }
      },
      onerror(err) {
        setConnected(false)
        console.error('SSE error:', err)
      },
      openWhenHidden: true
    })

    return () => {
      controller.abort()
    }
  }, [])

  return { stocks: Array.from(stocks.values()), connected }
}

export function useLogsSSE() {
  const [logs, setLogs] = useState([])
  const [connected, setConnected] = useState(false)
  const controllerRef = useRef(null)
  const maxLogs = 500

  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller

    fetchEventSource(`${SSE_BASE_URL}/api/logs/stream`, {
      headers: NGROK_HEADERS,
      signal: controller.signal,
      onopen(response) {
        if (response.ok) {
          setConnected(true)
        }
      },
      onmessage(event) {
        if (event.event === 'history') {
          const history = JSON.parse(event.data)
          setLogs(history.slice(-maxLogs))
        } else if (event.event === 'log') {
          const logEntry = JSON.parse(event.data)
          setLogs(prev => {
            const newLogs = [...prev, logEntry]
            if (newLogs.length > maxLogs) {
              return newLogs.slice(-maxLogs)
            }
            return newLogs
          })
        }
      },
      onerror(err) {
        setConnected(false)
        console.error('Logs SSE error:', err)
      },
      openWhenHidden: true
    })

    return () => {
      controller.abort()
    }
  }, [])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  return { logs, connected, clearLogs }
}
