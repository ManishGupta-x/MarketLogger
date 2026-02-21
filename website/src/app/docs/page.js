'use client'

import { useState, useEffect } from 'react'

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('zerodha-api')

  const sections = [
    {
      id: 'zerodha-api',
      title: 'Zerodha API',
      icon: '📡',
      subsections: [
        { id: 'raw-data', label: 'Raw Data' },
        { id: 'websocket', label: 'WebSocket Fields' },
        { id: 'data-frequency', label: 'Data Frequency' }
      ]
    },
    {
      id: 'indicators',
      title: 'Technical Indicators',
      icon: '📊',
      subsections: [
        { id: 'calc-overview', label: 'Calculation Overview' },
        { id: 'ema', label: 'EMA' },
        { id: 'rsi', label: 'RSI' },
        { id: 'atr', label: 'ATR' },
        { id: 'adx', label: 'ADX' },
        { id: 'roc', label: 'ROC' },
        { id: 'beta', label: 'Beta' },
        { id: 'volatility', label: 'Volatility' },
        { id: 'relative-strength', label: 'Relative Strength' }
      ]
    },
    {
      id: 'bot-algo',
      title: 'Bot Algorithm',
      icon: '🤖',
      subsections: [
        { id: 'regime-detection', label: 'Market Regime' },
        { id: 'stock-selection', label: 'Stock Selection' },
        { id: 'exit-logic', label: 'Exit Logic' }
      ]
    },
    {
      id: 'api-endpoints',
      title: 'API Endpoints',
      icon: '🔌'
    },
    {
      id: 'configuration',
      title: 'Configuration',
      icon: '⚙️'
    }
  ]

  // Handle scroll-based active section detection
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 100

      // Find all section elements and determine which one is in view
      const allIds = sections.flatMap(s => [s.id, ...(s.subsections?.map(sub => sub.id) || [])])

      for (const id of allIds.reverse()) {
        const element = document.getElementById(id)
        if (element && element.offsetTop <= scrollPosition) {
          setActiveSection(id)
          break
        }
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToSection = (id) => {
    setActiveSection(id)
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden lg:block fixed left-0 top-16 w-64 h-[calc(100vh-4rem)] bg-black border-r border-gray-800 overflow-y-auto">
        <div className="p-4">
          <h2 className="text-lg font-bold text-white mb-4">Documentation</h2>

          {sections.map((section) => (
            <div key={section.id} className="mb-4">
              <button
                onClick={() => scrollToSection(section.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  activeSection === section.id
                    ? 'bg-blue-600/20 text-blue-400 border-l-2 border-blue-400'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                <span>{section.icon}</span>
                {section.title}
              </button>

              {section.subsections && (
                <div className="ml-6 mt-1 space-y-1">
                  {section.subsections.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => scrollToSection(sub.id)}
                      className={`w-full text-left px-3 py-1.5 rounded text-xs transition-all ${
                        activeSection === sub.id
                          ? 'text-blue-400 bg-blue-600/10'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Technical Documentation</h1>
          <p className="text-gray-400">
            Complete reference for the adaptive trading system - from raw data to trading decisions
          </p>
        </div>

        {/* Mobile Section Selector */}
        <div className="lg:hidden mb-6">
          <select
            value={activeSection}
            onChange={(e) => scrollToSection(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white"
          >
            {sections.map((section) => (
              <optgroup key={section.id} label={`${section.icon} ${section.title}`}>
                <option value={section.id}>{section.title}</option>
                {section.subsections?.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    └ {sub.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* ==================== ZERODHA API SECTION ==================== */}
        <section id="zerodha-api" className="mb-12 scroll-mt-20">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
            <span className="text-3xl">📡</span> 1. Zerodha API - Raw Data
          </h2>

          <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-4 mb-6">
            <p className="text-yellow-300">
              <strong>Important:</strong> Zerodha does NOT provide RSI, EMA, ADX, etc. directly!
              You only receive raw price data, and the bot calculates all indicators.
            </p>
          </div>

          <div id="raw-data" className="scroll-mt-20">
            <h3 className="text-xl font-semibold text-white mb-3">Raw Data Structure</h3>
            <p className="text-gray-400 mb-4">
              Every ~1 second, for each subscribed stock, you receive:
            </p>

            <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
              <pre className="text-sm text-gray-300 whitespace-pre">{`{
  instrument_token: 256265,        // Stock ID (e.g., NIFTY 50)
  last_price: 22450.50,            // Current trading price

  ohlc: {
    open: 22380.00,                // Today's opening price
    high: 22520.00,                // Today's highest price
    low: 22350.00,                 // Today's lowest price
    close: 22400.00                // Yesterday's closing price
  },

  volume_traded: 1250000,          // Total shares traded today
  last_traded_quantity: 150,       // Last trade size
  total_buy_quantity: 500000,      // Pending buy orders
  total_sell_quantity: 450000      // Pending sell orders
}`}</pre>
            </div>
          </div>

          <div id="websocket" className="scroll-mt-20 mb-6">
            <h3 className="text-xl font-semibold text-white mb-3">WebSocket Fields</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 text-gray-400">Field</th>
                    <th className="text-left py-3 text-gray-400">Description</th>
                    <th className="text-left py-3 text-gray-400">Update Frequency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  <tr><td className="py-3 text-blue-400 font-mono">last_price</td><td className="text-gray-300">Current market price</td><td className="text-gray-400">Every tick (~1s)</td></tr>
                  <tr><td className="py-3 text-blue-400 font-mono">ohlc.open</td><td className="text-gray-300">Day's opening price</td><td className="text-gray-400">Once at market open</td></tr>
                  <tr><td className="py-3 text-blue-400 font-mono">ohlc.high</td><td className="text-gray-300">Day's highest price</td><td className="text-gray-400">Updates throughout day</td></tr>
                  <tr><td className="py-3 text-blue-400 font-mono">ohlc.low</td><td className="text-gray-300">Day's lowest price</td><td className="text-gray-400">Updates throughout day</td></tr>
                  <tr><td className="py-3 text-blue-400 font-mono">ohlc.close</td><td className="text-gray-300">Previous day's close</td><td className="text-gray-400">Static</td></tr>
                  <tr><td className="py-3 text-blue-400 font-mono">volume_traded</td><td className="text-gray-300">Total volume today</td><td className="text-gray-400">Every tick</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div id="data-frequency" className="scroll-mt-20">
            <h3 className="text-xl font-semibold text-white mb-3">Data Frequency & Latency</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                <div className="text-3xl font-bold text-blue-400">~1/sec</div>
                <div className="text-gray-400 text-sm">Tick Frequency per stock</div>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                <div className="text-3xl font-bold text-green-400">10-50ms</div>
                <div className="text-gray-400 text-sm">WebSocket Latency</div>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                <div className="text-3xl font-bold text-purple-400">200</div>
                <div className="text-gray-400 text-sm">Data Points Stored per stock</div>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
                <div className="text-3xl font-bold text-orange-400">~500B</div>
                <div className="text-gray-400 text-sm">Buffer Memory per stock</div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== INDICATORS SECTION ==================== */}
        <section id="indicators" className="mb-12 scroll-mt-20">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
            <span className="text-3xl">📊</span> 2. Technical Indicators
          </h2>

          <p className="text-gray-400 mb-6">
            All indicators are calculated from raw price data. Here's each indicator with calculation time and complexity.
          </p>

          <div id="calc-overview" className="scroll-mt-20 mb-8">
            <h3 className="text-xl font-semibold text-white mb-3">Calculation Overview</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 text-gray-400">Indicator</th>
                    <th className="text-center py-3 text-gray-400">Min Data Points</th>
                    <th className="text-center py-3 text-gray-400">Calc Time</th>
                    <th className="text-center py-3 text-gray-400">Complexity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  <tr><td className="py-3 text-white">SMA</td><td className="text-center text-gray-300">20 or 50</td><td className="text-center"><span className="text-green-400">&lt;1ms</span></td><td className="text-center text-gray-400">O(n)</td></tr>
                  <tr><td className="py-3 text-white">EMA</td><td className="text-center text-gray-300">20 or 50</td><td className="text-center"><span className="text-green-400">&lt;1ms</span></td><td className="text-center text-gray-400">O(n)</td></tr>
                  <tr><td className="py-3 text-white">RSI</td><td className="text-center text-gray-300">15</td><td className="text-center"><span className="text-green-400">&lt;1ms</span></td><td className="text-center text-gray-400">O(n)</td></tr>
                  <tr><td className="py-3 text-white">ATR</td><td className="text-center text-gray-300">15</td><td className="text-center"><span className="text-green-400">&lt;1ms</span></td><td className="text-center text-gray-400">O(n)</td></tr>
                  <tr><td className="py-3 text-white">ADX</td><td className="text-center text-gray-300">28</td><td className="text-center"><span className="text-yellow-400">1-2ms</span></td><td className="text-center text-gray-400">O(n)</td></tr>
                  <tr><td className="py-3 text-white">ROC</td><td className="text-center text-gray-300">11</td><td className="text-center"><span className="text-green-400">&lt;1ms</span></td><td className="text-center text-gray-400">O(1)</td></tr>
                  <tr><td className="py-3 text-white">Beta</td><td className="text-center text-gray-300">21</td><td className="text-center"><span className="text-yellow-400">2-3ms</span></td><td className="text-center text-gray-400">O(n)</td></tr>
                  <tr><td className="py-3 text-white">Volatility</td><td className="text-center text-gray-300">21</td><td className="text-center"><span className="text-yellow-400">1-2ms</span></td><td className="text-center text-gray-400">O(n)</td></tr>
                  <tr><td className="py-3 text-white">Relative Strength</td><td className="text-center text-gray-300">20</td><td className="text-center"><span className="text-green-400">&lt;1ms</span></td><td className="text-center text-gray-400">O(1)</td></tr>
                  <tr className="bg-blue-900/20"><td className="py-3 text-blue-400 font-bold">All Indicators</td><td className="text-center text-gray-300">50</td><td className="text-center"><span className="text-blue-400 font-bold">5-10ms</span></td><td className="text-center text-gray-400">Combined</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* EMA */}
          <div id="ema" className="scroll-mt-20 mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-xl font-semibold text-white">EMA (Exponential Moving Average)</h3>
              <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">&lt;1ms</span>
            </div>
            <p className="text-gray-400 mb-4">Weighted average giving more importance to recent prices.</p>

            <div className="bg-gray-900 rounded-lg p-4 mb-4 overflow-x-auto">
              <pre className="text-sm text-gray-300">{`Multiplier = 2 / (period + 1)
EMA = (Current Price - Previous EMA) × Multiplier + Previous EMA

Example:
EMA-20 Multiplier = 2/21 = 0.095
If previous EMA = 100, current price = 105:
New EMA = (105 - 100) × 0.095 + 100 = 100.475`}</pre>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-green-900/20 rounded-lg p-4 border border-green-800">
                <div className="text-green-400 font-medium mb-2">BULLISH Signal</div>
                <div className="text-gray-300 text-sm">Price &gt; EMA-20 &gt; EMA-50</div>
              </div>
              <div className="bg-red-900/20 rounded-lg p-4 border border-red-800">
                <div className="text-red-400 font-medium mb-2">BEARISH Signal</div>
                <div className="text-gray-300 text-sm">Price &lt; EMA-20 &lt; EMA-50</div>
              </div>
            </div>
          </div>

          {/* RSI */}
          <div id="rsi" className="scroll-mt-20 mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-xl font-semibold text-white">RSI (Relative Strength Index)</h3>
              <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">&lt;1ms</span>
            </div>
            <p className="text-gray-400 mb-4">A speedometer for stocks (0 to 100) measuring overbought/oversold conditions.</p>

            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 text-gray-400">RSI Value</th>
                    <th className="text-left py-3 text-gray-400">Interpretation</th>
                    <th className="text-left py-3 text-gray-400">Bot Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  <tr><td className="py-3 text-red-400 font-bold">&gt; 80</td><td className="text-gray-300">Overbought - no buyers left</td><td className="text-orange-400">EXIT (Momentum Exhaustion)</td></tr>
                  <tr><td className="py-3 text-green-400">60-70</td><td className="text-gray-300">Good momentum</td><td className="text-green-400">BULLISH signal</td></tr>
                  <tr><td className="py-3 text-yellow-400">40-60</td><td className="text-gray-300">Normal/Neutral</td><td className="text-yellow-400">SIDEWAYS signal</td></tr>
                  <tr><td className="py-3 text-orange-400">30-40</td><td className="text-gray-300">Weak momentum</td><td className="text-red-400">BEARISH signal</td></tr>
                  <tr><td className="py-3 text-cyan-400">&lt; 30</td><td className="text-gray-300">Oversold - might bounce</td><td className="text-cyan-400">Mean reversion buy</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ATR */}
          <div id="atr" className="scroll-mt-20 mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-xl font-semibold text-white">ATR (Average True Range)</h3>
              <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">&lt;1ms</span>
            </div>
            <p className="text-gray-400 mb-4">Measures how much a stock moves up and down daily (volatility).</p>

            <div className="bg-gray-900 rounded-lg p-4 mb-4 overflow-x-auto">
              <pre className="text-sm text-gray-300">{`True Range = MAX of:
  1. Current High - Current Low
  2. |Current High - Previous Close|
  3. |Current Low - Previous Close|

ATR = Average of last 14 True Ranges

Example: If ATR = ₹5, the stock typically moves ₹5 per day`}</pre>
            </div>
          </div>

          {/* ADX */}
          <div id="adx" className="scroll-mt-20 mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-xl font-semibold text-white">ADX (Average Directional Index)</h3>
              <span className="px-2 py-1 bg-yellow-600 text-white text-xs rounded">1-2ms</span>
            </div>
            <p className="text-gray-400 mb-4">Measures HOW STRONG the trend is (not direction, just strength).</p>

            <div className="grid md:grid-cols-4 gap-3 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-500">0-20</div>
                <div className="text-xs text-gray-400">WEAK trend</div>
              </div>
              <div className="bg-yellow-900/20 rounded-lg p-3 text-center border border-yellow-800">
                <div className="text-2xl font-bold text-yellow-400">20-25</div>
                <div className="text-xs text-gray-400">MODERATE</div>
              </div>
              <div className="bg-green-900/20 rounded-lg p-3 text-center border border-green-800">
                <div className="text-2xl font-bold text-green-400">25-50</div>
                <div className="text-xs text-gray-400">STRONG trend</div>
              </div>
              <div className="bg-blue-900/20 rounded-lg p-3 text-center border border-blue-800">
                <div className="text-2xl font-bold text-blue-400">50+</div>
                <div className="text-xs text-gray-400">VERY STRONG</div>
              </div>
            </div>

            <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
              <span className="text-blue-400 font-medium">Analogy:</span>
              <span className="text-gray-300 ml-2">ADX is like a car's speedometer - it tells you HOW FAST the car is moving, not WHERE it's going (North or South)!</span>
            </div>
          </div>

          {/* ROC */}
          <div id="roc" className="scroll-mt-20 mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-xl font-semibold text-white">ROC (Rate of Change)</h3>
              <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">&lt;1ms</span>
            </div>
            <p className="text-gray-400 mb-4">How much the price changed in the last X days (as percentage).</p>

            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-gray-300">{`ROC = ((Current Price - Price N days ago) / Price N days ago) × 100

Example:
Current Price = ₹105
Price 10 days ago = ₹100
ROC = ((105 - 100) / 100) × 100 = +5%`}</pre>
            </div>
          </div>

          {/* Beta */}
          <div id="beta" className="scroll-mt-20 mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-xl font-semibold text-white">Beta</h3>
              <span className="px-2 py-1 bg-yellow-600 text-white text-xs rounded">2-3ms</span>
            </div>
            <p className="text-gray-400 mb-4">How much a stock moves compared to NIFTY.</p>

            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 text-center">
                <div className="text-3xl font-bold text-green-400">1.5</div>
                <div className="text-gray-300 text-sm">Moves 50% MORE than market</div>
                <div className="text-xs text-gray-500 mt-1">Good for BULLISH</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 text-center">
                <div className="text-3xl font-bold text-yellow-400">1.0</div>
                <div className="text-gray-300 text-sm">Moves SAME as market</div>
                <div className="text-xs text-gray-500 mt-1">Balanced</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 text-center">
                <div className="text-3xl font-bold text-blue-400">0.5</div>
                <div className="text-gray-300 text-sm">Moves 50% LESS than market</div>
                <div className="text-xs text-gray-500 mt-1">Good for BEARISH</div>
              </div>
            </div>
          </div>

          {/* Volatility */}
          <div id="volatility" className="scroll-mt-20 mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-xl font-semibold text-white">Volatility</h3>
              <span className="px-2 py-1 bg-yellow-600 text-white text-xs rounded">1-2ms</span>
            </div>
            <p className="text-gray-400 mb-4">Standard deviation of returns, annualized.</p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-red-900/20 rounded-lg p-4 border border-red-800">
                <div className="text-red-400 font-medium">High Volatility (40%)</div>
                <div className="text-gray-300 text-sm">Stock moves ±2.5% daily on average</div>
              </div>
              <div className="bg-green-900/20 rounded-lg p-4 border border-green-800">
                <div className="text-green-400 font-medium">Low Volatility (15%)</div>
                <div className="text-gray-300 text-sm">Stock moves ±0.9% daily on average</div>
              </div>
            </div>
          </div>

          {/* Relative Strength */}
          <div id="relative-strength" className="scroll-mt-20 mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-xl font-semibold text-white">Relative Strength (RS)</h3>
              <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">&lt;1ms</span>
            </div>
            <p className="text-gray-400 mb-4">How a stock performs compared to NIFTY (not same as RSI!).</p>

            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-gray-300">{`RS = (1 + Stock Return) / (1 + Market Return)

RS > 1.0 = Stock is OUTPERFORMING the market
RS = 1.0 = Stock is performing SAME as market
RS < 1.0 = Stock is UNDERPERFORMING the market

Example:
  NIFTY up 2% this month
  Stock A up 3% → RS = 1.03/1.02 = 1.01 (outperforming)
  Stock B up 1% → RS = 1.01/1.02 = 0.99 (underperforming)`}</pre>
            </div>
          </div>
        </section>

        {/* ==================== BOT ALGORITHM SECTION ==================== */}
        <section id="bot-algo" className="mb-12 scroll-mt-20">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
            <span className="text-3xl">🤖</span> 3. Bot Algorithm
          </h2>

          {/* Regime Detection */}
          <div id="regime-detection" className="scroll-mt-20 mb-8">
            <h3 className="text-xl font-semibold text-white mb-3">Market Regime Detection</h3>
            <p className="text-gray-400 mb-4">
              Watches <span className="text-blue-400 font-medium">NIFTY 50 (60%)</span> and <span className="text-purple-400 font-medium">NIFTY Bank (40%)</span> to determine market mood.
            </p>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="bg-green-900/20 rounded-xl p-4 border border-green-800">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">📈</span>
                  <span className="text-xl font-bold text-green-400">BULLISH</span>
                </div>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• Price &gt; EMA-20 &gt; EMA-50</li>
                  <li>• ADX &gt; 25</li>
                  <li>• RSI &gt; 60</li>
                </ul>
                <div className="mt-3 p-2 bg-green-900/30 rounded text-xs text-green-300">
                  Picks high-momentum stocks
                </div>
              </div>

              <div className="bg-red-900/20 rounded-xl p-4 border border-red-800">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">📉</span>
                  <span className="text-xl font-bold text-red-400">BEARISH</span>
                </div>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• Price &lt; EMA-20 &lt; EMA-50</li>
                  <li>• ADX &gt; 25</li>
                  <li>• RSI &lt; 40</li>
                </ul>
                <div className="mt-3 p-2 bg-red-900/30 rounded text-xs text-red-300">
                  Picks defensive stocks
                </div>
              </div>

              <div className="bg-yellow-900/20 rounded-xl p-4 border border-yellow-800">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">↔️</span>
                  <span className="text-xl font-bold text-yellow-400">SIDEWAYS</span>
                </div>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• No clear direction</li>
                  <li>• ADX &lt; 25</li>
                  <li>• RSI 40-60</li>
                </ul>
                <div className="mt-3 p-2 bg-yellow-900/30 rounded text-xs text-yellow-300">
                  Picks mean-reversion stocks
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 text-gray-400">Operation</th>
                    <th className="text-center py-3 text-gray-400">Frequency</th>
                    <th className="text-center py-3 text-gray-400">Time Taken</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  <tr><td className="py-3 text-gray-300">Tick Processing</td><td className="text-center text-gray-400">Every ~1s</td><td className="text-center text-green-400">&lt;1ms</td></tr>
                  <tr><td className="py-3 text-gray-300">Indicator Update</td><td className="text-center text-gray-400">Every tick</td><td className="text-center text-yellow-400">5-10ms</td></tr>
                  <tr><td className="py-3 text-gray-300">Regime Calculation</td><td className="text-center text-gray-400">Every 60s</td><td className="text-center text-yellow-400">10-20ms</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Stock Selection */}
          <div id="stock-selection" className="scroll-mt-20 mb-8">
            <h3 className="text-xl font-semibold text-white mb-3">Stock Selection</h3>
            <p className="text-gray-400 mb-4">
              Every <span className="text-blue-400 font-medium">5 minutes</span>, screens all 678 stocks and picks the <span className="text-green-400 font-medium">top 10</span>.
            </p>

            <div className="bg-gray-900 rounded-lg p-4 mb-4">
              <div className="text-sm text-gray-300 space-y-2">
                <div className="flex justify-between"><span>Step 1: Get all 678 stocks</span><span className="text-green-400">~1ms</span></div>
                <div className="flex justify-between"><span>Step 2: Calculate indicators for each</span><span className="text-yellow-400">~5-10ms ea</span></div>
                <div className="flex justify-between"><span>Step 3: Score based on current regime</span><span className="text-green-400">~1ms ea</span></div>
                <div className="flex justify-between"><span>Step 4: Apply sector diversification</span><span className="text-green-400">~10ms</span></div>
                <div className="flex justify-between"><span>Step 5: Pick top 10</span><span className="text-green-400">~1ms</span></div>
                <div className="flex justify-between pt-2 border-t border-gray-700 font-bold"><span>Total Time</span><span className="text-blue-400">~3-5 seconds</span></div>
              </div>
            </div>
          </div>

          {/* Exit Logic */}
          <div id="exit-logic" className="scroll-mt-20 mb-8">
            <h3 className="text-xl font-semibold text-white mb-3">Exit Logic</h3>

            <div className="space-y-4">
              <div className="bg-cyan-900/20 rounded-lg p-4 border border-cyan-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">📈</span>
                  <span className="font-bold text-cyan-400">Trailing Stop</span>
                  <span className="px-2 py-0.5 bg-green-600 text-white text-xs rounded">&lt;1ms</span>
                </div>
                <p className="text-gray-300 text-sm mb-3">When stock goes up, exit price follows it up. Activates at +0.5%, trails 0.3% behind.</p>
                <div className="bg-gray-900/50 rounded p-3 text-xs text-gray-400">
                  Buy at ₹100 → Price ₹102 → Stop at ₹101.70 → Price drops → SELL at ₹101.70 (+1.7% profit)
                </div>
              </div>

              <div className="bg-orange-900/20 rounded-lg p-4 border border-orange-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">⚡</span>
                  <span className="font-bold text-orange-400">Rapid Decline</span>
                  <span className="px-2 py-0.5 bg-green-600 text-white text-xs rounded">&lt;1ms</span>
                </div>
                <p className="text-gray-300 text-sm">If price drops <span className="text-orange-400 font-bold">0.3% within 5 seconds</span>, exit immediately!</p>
              </div>

              <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🔥</span>
                  <span className="font-bold text-purple-400">Momentum Exhaustion</span>
                  <span className="px-2 py-0.5 bg-green-600 text-white text-xs rounded">&lt;1ms</span>
                </div>
                <p className="text-gray-300 text-sm">When RSI goes above <span className="text-purple-400 font-bold">80</span>, stock is overbought - exit before reversal.</p>
              </div>

              <div className="bg-red-900/20 rounded-lg p-4 border border-red-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🛑</span>
                  <span className="font-bold text-red-400">Backstop Stop Loss</span>
                  <span className="px-2 py-0.5 bg-green-600 text-white text-xs rounded">&lt;1ms</span>
                </div>
                <p className="text-gray-300 text-sm">If price drops <span className="text-red-400 font-bold">2%</span> from buy price, exit no matter what. Safety net.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== API ENDPOINTS SECTION ==================== */}
        <section id="api-endpoints" className="mb-12 scroll-mt-20">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
            <span className="text-3xl">🔌</span> 4. API Endpoints
          </h2>

          <div className="space-y-6">
            <div>
              <h4 className="text-lg font-semibold text-white mb-3">Market Regime</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg">
                  <span className="px-2 py-1 bg-green-600 text-white text-xs rounded font-mono">GET</span>
                  <code className="text-blue-400">/api/regime</code>
                  <span className="text-gray-400 text-sm flex-1">Current market mood</span>
                  <span className="text-green-400 text-sm">&lt;10ms</span>
                </div>
                <div className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg">
                  <span className="px-2 py-1 bg-green-600 text-white text-xs rounded font-mono">GET</span>
                  <code className="text-blue-400">/api/regime/stream</code>
                  <span className="text-gray-400 text-sm flex-1">SSE stream for changes</span>
                  <span className="text-yellow-400 text-sm">Stream</span>
                </div>
                <div className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg">
                  <span className="px-2 py-1 bg-green-600 text-white text-xs rounded font-mono">GET</span>
                  <code className="text-blue-400">/api/regime/history</code>
                  <span className="text-gray-400 text-sm flex-1">History of changes</span>
                  <span className="text-green-400 text-sm">&lt;20ms</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-lg font-semibold text-white mb-3">Stock Data</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg">
                  <span className="px-2 py-1 bg-green-600 text-white text-xs rounded font-mono">GET</span>
                  <code className="text-blue-400">/api/active-stocks</code>
                  <span className="text-gray-400 text-sm flex-1">Current top 10 stocks</span>
                  <span className="text-green-400 text-sm">&lt;10ms</span>
                </div>
                <div className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg">
                  <span className="px-2 py-1 bg-green-600 text-white text-xs rounded font-mono">GET</span>
                  <code className="text-blue-400">/api/stock-rankings</code>
                  <span className="text-gray-400 text-sm flex-1">Rankings for all regimes</span>
                  <span className="text-yellow-400 text-sm">&lt;50ms</span>
                </div>
                <div className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg">
                  <span className="px-2 py-1 bg-green-600 text-white text-xs rounded font-mono">GET</span>
                  <code className="text-blue-400">/api/adaptive-info</code>
                  <span className="text-gray-400 text-sm flex-1">Full adaptive status</span>
                  <span className="text-green-400 text-sm">&lt;10ms</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-lg font-semibold text-white mb-3">Portfolio & Risk</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg">
                  <span className="px-2 py-1 bg-green-600 text-white text-xs rounded font-mono">GET</span>
                  <code className="text-blue-400">/api/portfolio</code>
                  <span className="text-gray-400 text-sm flex-1">Current portfolio state</span>
                  <span className="text-green-400 text-sm">&lt;10ms</span>
                </div>
                <div className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg">
                  <span className="px-2 py-1 bg-green-600 text-white text-xs rounded font-mono">GET</span>
                  <code className="text-blue-400">/api/risk-status</code>
                  <span className="text-gray-400 text-sm flex-1">Current risk metrics</span>
                  <span className="text-green-400 text-sm">&lt;10ms</span>
                </div>
                <div className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg">
                  <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded font-mono">POST</span>
                  <code className="text-blue-400">/api/risk-resume</code>
                  <span className="text-gray-400 text-sm flex-1">Resume after halt</span>
                  <span className="text-green-400 text-sm">&lt;10ms</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== CONFIGURATION SECTION ==================== */}
        <section id="configuration" className="mb-12 scroll-mt-20">
          <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
            <span className="text-3xl">⚙️</span> 5. Configuration
          </h2>

          <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-gray-300">{`# ADAPTIVE TRADING
ADAPTIVE_MODE=true
REGIME_CHECK_FREQUENCY=60000        # Check regime every 60s

# REGIME DETECTION
NIFTY_50_WEIGHT=60                  # NIFTY 50 contributes 60%
NIFTY_BANK_WEIGHT=40                # NIFTY Bank contributes 40%
REGIME_EMA_SHORT=20                 # Short EMA period
REGIME_EMA_LONG=50                  # Long EMA period
REGIME_ADX_THRESHOLD=25             # ADX threshold for trend

# STOCK SCREENING
TOP_STOCKS_COUNT=10                 # Number of stocks to trade
SCREEN_FREQUENCY=300000             # Screen every 5 minutes

# ADAPTIVE EXITS
TRAILING_STOP_ACTIVATION=0.5        # Activate after 0.5% profit
TRAILING_STOP_DISTANCE=0.3          # Trail 0.3% behind peak
RAPID_DECLINE_THRESHOLD=0.3         # Exit if 0.3% drop in 5s
MOMENTUM_EXIT_RSI=80                # Exit when RSI > 80

# PORTFOLIO RISK
MAX_DAILY_DRAWDOWN=3.0              # Stop at 3% daily loss
MAX_PORTFOLIO_HEAT=80               # Max 80% invested

# SECTOR DIVERSIFICATION
SECTOR_DIVERSIFICATION=true
SECTOR_LIMIT_BANKING=2
SECTOR_LIMIT_IT=2`}</pre>
          </div>
        </section>

        {/* Quick Reference Card */}
        <section className="mb-8">
          <div className="dashboard-card p-4">
            <h3 className="text-white font-semibold mb-3">⚡ Quick Reference</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 text-gray-400">Indicator</th>
                    <th className="text-left py-2 text-gray-400">What It Measures</th>
                    <th className="text-center py-2 text-green-400">Bullish</th>
                    <th className="text-center py-2 text-red-400">Bearish</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  <tr><td className="py-2 text-white">RSI</td><td className="text-gray-400">Overbought/Oversold</td><td className="text-center text-gray-300">50-70</td><td className="text-center text-gray-300">Avoid &gt;70</td></tr>
                  <tr><td className="py-2 text-white">EMA</td><td className="text-gray-400">Trend direction</td><td className="text-center text-gray-300">P &gt; E20 &gt; E50</td><td className="text-center text-gray-300">P &lt; E20 &lt; E50</td></tr>
                  <tr><td className="py-2 text-white">ADX</td><td className="text-gray-400">Trend strength</td><td className="text-center text-gray-300">&gt;25</td><td className="text-center text-gray-300">&gt;25 or &lt;20</td></tr>
                  <tr><td className="py-2 text-white">Beta</td><td className="text-gray-400">Market sensitivity</td><td className="text-center text-gray-300">&gt;1.0</td><td className="text-center text-gray-300">&lt;1.0</td></tr>
                  <tr><td className="py-2 text-white">ROC</td><td className="text-gray-400">Momentum</td><td className="text-center text-gray-300">High +ve</td><td className="text-center text-gray-300">Near 0</td></tr>
                  <tr><td className="py-2 text-white">RS</td><td className="text-gray-400">vs Market</td><td className="text-center text-gray-300">&gt;1.0</td><td className="text-center text-gray-300">~1.0</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
