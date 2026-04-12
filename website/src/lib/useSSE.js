'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { toast } from 'react-toastify'

const SSE_BASE_URL = ''  // All requests go to /api/* on same origin (Vercel proxy)

export function useTicksSSE() {
  const [stocks, setStocks] = useState(new Map())
  const [connected, setConnected] = useState(false)
  const controllerRef = useRef(null)

  useEffect(() => {
    // Fetch initial data
    fetch(`${SSE_BASE_URL}/api/ticks/latest`)
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

    // Connect to SSE for real-time updates
    const controller = new AbortController()
    controllerRef.current = controller

    fetchEventSource(`${SSE_BASE_URL}/api/ticks/stream`, {
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

export function usePortfolioSSE() {
  const [portfolio, setPortfolio] = useState({
    cash: 0,
    holdingsValue: 0,
    investedValue: 0,
    totalValue: 0,
    totalPnl: 0,
    pnlPercent: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    holdingsCount: 0,
    initialCapital: 0,
    dayPnl: 0,
    dayTrades: 0,
    holdings: [],
    gridPercentage: 0.25,
    amountPerTrade: 5000,
    stopLossPercentage: 1
  })
  const [connected, setConnected] = useState(false)
  const controllerRef = useRef(null)

  useEffect(() => {
    // Fetch initial portfolio data
    fetch(`${SSE_BASE_URL}/api/portfolio`)
      .then(res => res.json())
      .then(data => {
        setPortfolio(prev => ({ ...prev, ...data }))
        setConnected(true)
      })
      .catch(err => console.error('Failed to fetch portfolio:', err))

    // Connect to SSE for real-time updates
    const controller = new AbortController()
    controllerRef.current = controller

    fetchEventSource(`${SSE_BASE_URL}/api/portfolio/stream`, {
      signal: controller.signal,
      onopen(response) {
        if (response.ok) {
          setConnected(true)
        }
      },
      onmessage(event) {
        if (event.event === 'portfolio') {
          const data = JSON.parse(event.data)
          setPortfolio(prev => ({ ...prev, ...data }))
        }
      },
      onerror(err) {
        setConnected(false)
        console.error('Portfolio SSE error:', err)
      },
      openWhenHidden: true
    })

    return () => {
      controller.abort()
    }
  }, [])

  return { portfolio, connected }
}

export function useOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchOrders = useCallback(async (today = false) => {
    setLoading(true)
    try {
      const endpoint = today ? '/api/orders/today' : '/api/orders'
      const res = await fetch(`${SSE_BASE_URL}${endpoint}`)
      const data = await res.json()
      setOrders(data)
    } catch (err) {
      console.error('Failed to fetch orders:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  return { orders, loading, fetchOrders }
}

export function useStats() {
  const [stats, setStats] = useState({
    totalTrades: 0,
    totalBuys: 0,
    totalSells: 0,
    profitableTrades: 0,
    lossTrades: 0,
    winRate: 0,
    totalPnl: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${SSE_BASE_URL}/api/stats`)
      .then(res => res.json())
      .then(data => {
        setStats(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch stats:', err)
        setLoading(false)
      })
  }, [])

  return { stats, loading }
}

export function useStrategies() {
  const [strategies, setStrategies] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchStrategies = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${SSE_BASE_URL}/api/strategies`)
      const data = await res.json()
      setStrategies(data)
    } catch (err) {
      console.error('Failed to fetch strategies:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStrategies()
  }, [fetchStrategies])

  return { strategies, loading, fetchStrategies }
}

export function useCalendar() {
  const [calendar, setCalendar] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchCalendar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${SSE_BASE_URL}/api/calendar`)
      const data = await res.json()
      setCalendar(data)
    } catch (err) {
      console.error('Failed to fetch calendar:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const addStrategy = useCallback(async (strategyData) => {
    try {
      const res = await fetch(`${SSE_BASE_URL}/api/calendar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(strategyData)
      })
      const data = await res.json()
      if (data.success) {
        await fetchCalendar()
        return { success: true, message: data.message }
      }
      return { success: false, message: data.error }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }, [fetchCalendar])

  useEffect(() => {
    fetchCalendar()
  }, [fetchCalendar])

  return { calendar, loading, fetchCalendar, addStrategy }
}

export function useOrderNotifications() {
  const controllerRef = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller

    fetchEventSource(`${SSE_BASE_URL}/api/orders/stream`, {
      signal: controller.signal,
      onmessage(event) {
        if (event.event === 'order') {
          const order = JSON.parse(event.data)

          const formatPrice = (p) => Number(p).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

          if (order.type === 'BUY') {
            toast.info(
              `BUY ${order.symbol} @ ₹${formatPrice(order.price)} × ${order.qty}`,
              {
                icon: '📈',
                style: { background: '#1e3a5f', color: '#60a5fa' }
              }
            )
          } else if (order.type === 'SELL') {
            const isProfit = order.pnl >= 0
            const pnlText = isProfit ? `+₹${formatPrice(order.pnl)}` : `-₹${formatPrice(Math.abs(order.pnl))}`
            const reason = order.reason === 'STOP LOSS' ? ' [SL]' : ''

            if (isProfit) {
              toast.success(
                `SELL${reason} ${order.symbol} @ ₹${formatPrice(order.price)} | P&L: ${pnlText}`,
                {
                  icon: '💰',
                  style: { background: '#14532d', color: '#4ade80' }
                }
              )
            } else {
              toast.error(
                `SELL${reason} ${order.symbol} @ ₹${formatPrice(order.price)} | P&L: ${pnlText}`,
                {
                  icon: '📉',
                  style: { background: '#450a0a', color: '#f87171' }
                }
              )
            }
          }
        }
      },
      onerror(err) {
        console.error('Order notifications error:', err)
      },
      openWhenHidden: true
    })

    return () => {
      controller.abort()
    }
  }, [])
}

// Adaptive Trading Hooks
export function useAdaptiveInfo() {
  const [adaptiveInfo, setAdaptiveInfo] = useState({
    enabled: false,
    regime: null,
    activeStocks: [],
    rankings: {},
    positions: [],
    riskMetrics: {},
    gapStatus: {},
    costInfo: {}
  })
  const [loading, setLoading] = useState(true)

  const fetchAdaptiveInfo = useCallback(async () => {
    try {
      const res = await fetch(`${SSE_BASE_URL}/api/adaptive-info`)
      const data = await res.json()
      setAdaptiveInfo(data)
    } catch (err) {
      console.error('Failed to fetch adaptive info:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAdaptiveInfo()
    // Refresh every 30 seconds
    const interval = setInterval(fetchAdaptiveInfo, 30000)
    return () => clearInterval(interval)
  }, [fetchAdaptiveInfo])

  return { adaptiveInfo, loading, fetchAdaptiveInfo }
}

export function useRiskStatus() {
  const [riskStatus, setRiskStatus] = useState({
    initialized: false,
    tradingHalted: false,
    dailyPnL: 0,
    dailyPnLPercent: 0,
    currentDrawdown: 0,
    recentEvents: []
  })
  const [loading, setLoading] = useState(true)

  const fetchRiskStatus = useCallback(async () => {
    try {
      const res = await fetch(`${SSE_BASE_URL}/api/risk-status`)
      const data = await res.json()
      setRiskStatus(data)
    } catch (err) {
      console.error('Failed to fetch risk status:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const resumeTrading = useCallback(async () => {
    try {
      const res = await fetch(`${SSE_BASE_URL}/api/risk-resume`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        await fetchRiskStatus()
        toast.success('Trading resumed')
      }
      return data
    } catch (err) {
      toast.error('Failed to resume trading')
      return { success: false, message: err.message }
    }
  }, [fetchRiskStatus])

  useEffect(() => {
    fetchRiskStatus()
    const interval = setInterval(fetchRiskStatus, 10000)
    return () => clearInterval(interval)
  }, [fetchRiskStatus])

  return { riskStatus, loading, fetchRiskStatus, resumeTrading }
}

export function useExitStats() {
  const [exitStats, setExitStats] = useState({ exitStats: [], regimeStats: [] })
  const [loading, setLoading] = useState(true)

  const fetchExitStats = useCallback(async () => {
    try {
      const res = await fetch(`${SSE_BASE_URL}/api/exit-stats`)
      const data = await res.json()
      setExitStats(data)
    } catch (err) {
      console.error('Failed to fetch exit stats:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchExitStats()
  }, [fetchExitStats])

  return { exitStats, loading, fetchExitStats }
}

export function useRegimeSSE() {
  const [regime, setRegime] = useState({
    current: 'SIDEWAYS',
    confidence: 0,
    lastChange: null
  })
  const [connected, setConnected] = useState(false)
  const controllerRef = useRef(null)

  useEffect(() => {
    // Fetch initial regime
    fetch(`${SSE_BASE_URL}/api/regime`)
      .then(res => res.json())
      .then(data => {
        setRegime({
          current: data.regime || 'SIDEWAYS',
          confidence: data.confidence || 0,
          lastChange: data.lastChange
        })
        setConnected(true)
      })
      .catch(err => console.error('Failed to fetch regime:', err))

    // Connect to SSE for regime changes
    const controller = new AbortController()
    controllerRef.current = controller

    fetchEventSource(`${SSE_BASE_URL}/api/regime/stream`, {
      signal: controller.signal,
      onopen(response) {
        if (response.ok) {
          setConnected(true)
        }
      },
      onmessage(event) {
        if (event.event === 'regime_change') {
          const data = JSON.parse(event.data)
          setRegime({
            current: data.newRegime,
            confidence: data.confidence,
            lastChange: data.timestamp
          })
          // Show toast for regime change
          const regimeColors = {
            BULLISH: '#22c55e',
            BEARISH: '#ef4444',
            SIDEWAYS: '#f59e0b'
          }
          toast.info(`Market regime changed to ${data.newRegime}`, {
            style: { background: '#1f2937', color: regimeColors[data.newRegime] }
          })
        }
      },
      onerror(err) {
        setConnected(false)
        console.error('Regime SSE error:', err)
      },
      openWhenHidden: true
    })

    return () => {
      controller.abort()
    }
  }, [])

  return { regime, connected }
}
