'use client'

import { useState } from 'react'

export default function HelpPage() {
  const [activeSection, setActiveSection] = useState('overview')

  const sections = [
    { id: 'overview', label: 'Overview', icon: '🎯' },
    { id: 'regime', label: 'Market Detection', icon: '📊' },
    { id: 'stocks', label: 'Stock Selection', icon: '🔍' },
    { id: 'entries', label: 'Buying Stocks', icon: '🛒' },
    { id: 'exits', label: 'Selling Stocks', icon: '💰' },
    { id: 'risk', label: 'Risk Management', icon: '🛡️' },
    { id: 'costs', label: 'Costs & Fees', icon: '💸' }
  ]

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">How It Works</h1>
        <p className="text-gray-400">
          A simple guide to understanding the adaptive trading strategy
        </p>
      </div>

      {/* Section Navigation */}
      <div className="flex flex-wrap gap-2 mb-8">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeSection === section.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            <span className="mr-2">{section.icon}</span>
            {section.label}
          </button>
        ))}
      </div>

      {/* Content Sections */}
      <div className="dashboard-card p-6">

        {/* Overview Section */}
        {activeSection === 'overview' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="text-3xl">🎯</span> What Does This System Do?
              </h2>
              <p className="text-gray-300 text-lg leading-relaxed">
                Think of this as a <span className="text-blue-400 font-semibold">smart shopping assistant</span> for the stock market.
                Instead of randomly buying stocks, it watches the entire market to understand if conditions are good or bad,
                then picks the best stocks to buy and knows exactly when to sell them.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mt-6">
              <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
                <div className="text-3xl mb-3">👀</div>
                <h3 className="text-white font-semibold mb-2">Watches the Market</h3>
                <p className="text-gray-400 text-sm">
                  Monitors NIFTY 50 and Bank NIFTY to understand if the market is going up, down, or sideways
                </p>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
                <div className="text-3xl mb-3">🎯</div>
                <h3 className="text-white font-semibold mb-2">Picks Best Stocks</h3>
                <p className="text-gray-400 text-sm">
                  Selects top 10 stocks that match the current market mood from 600+ available stocks
                </p>
              </div>
              <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
                <div className="text-3xl mb-3">⚡</div>
                <h3 className="text-white font-semibold mb-2">Smart Exits</h3>
                <p className="text-gray-400 text-sm">
                  Uses trailing stops to ride winners up and quick exits to cut losers fast
                </p>
              </div>
            </div>

            <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-5 mt-6">
              <h3 className="text-blue-400 font-semibold mb-2">📌 The Key Idea</h3>
              <p className="text-gray-300">
                <strong className="text-green-400">"Let winners run, cut losers quick"</strong> — When a stock goes up,
                the system follows it higher. When a stock suddenly drops, it exits immediately instead of hoping for a recovery.
              </p>
            </div>
          </div>
        )}

        {/* Market Regime Section */}
        {activeSection === 'regime' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="text-3xl">📊</span> Understanding Market Mood
              </h2>
              <p className="text-gray-300 text-lg leading-relaxed">
                Just like weather affects what clothes you wear, <span className="text-blue-400 font-semibold">market mood</span> affects
                which stocks perform best. The system detects three market moods:
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mt-6">
              <div className="bg-green-900/20 rounded-xl p-5 border border-green-800">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">📈</span>
                  <span className="text-xl font-bold text-green-400">BULLISH</span>
                </div>
                <p className="text-gray-300 mb-3">Market is going UP strongly</p>
                <ul className="text-sm text-gray-400 space-y-1">
                  <li>• Prices above moving averages</li>
                  <li>• Strong upward momentum</li>
                  <li>• Buyers are in control</li>
                </ul>
                <div className="mt-4 p-3 bg-green-900/30 rounded-lg">
                  <span className="text-green-400 text-sm font-medium">Strategy:</span>
                  <span className="text-gray-300 text-sm ml-2">Buy high-momentum stocks</span>
                </div>
              </div>

              <div className="bg-red-900/20 rounded-xl p-5 border border-red-800">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">📉</span>
                  <span className="text-xl font-bold text-red-400">BEARISH</span>
                </div>
                <p className="text-gray-300 mb-3">Market is going DOWN strongly</p>
                <ul className="text-sm text-gray-400 space-y-1">
                  <li>• Prices below moving averages</li>
                  <li>• Strong downward momentum</li>
                  <li>• Sellers are in control</li>
                </ul>
                <div className="mt-4 p-3 bg-red-900/30 rounded-lg">
                  <span className="text-red-400 text-sm font-medium">Strategy:</span>
                  <span className="text-gray-300 text-sm ml-2">Buy defensive, stable stocks</span>
                </div>
              </div>

              <div className="bg-yellow-900/20 rounded-xl p-5 border border-yellow-800">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">↔️</span>
                  <span className="text-xl font-bold text-yellow-400">SIDEWAYS</span>
                </div>
                <p className="text-gray-300 mb-3">Market is moving in a RANGE</p>
                <ul className="text-sm text-gray-400 space-y-1">
                  <li>• No clear direction</li>
                  <li>• Low momentum</li>
                  <li>• Good for mean reversion</li>
                </ul>
                <div className="mt-4 p-3 bg-yellow-900/30 rounded-lg">
                  <span className="text-yellow-400 text-sm font-medium">Strategy:</span>
                  <span className="text-gray-300 text-sm ml-2">Buy oversold stocks near support</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-5 mt-6">
              <h3 className="text-white font-semibold mb-3">🔬 How Detection Works</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="text-gray-400 mb-3">The system uses a <span className="text-blue-400">combined signal</span> from two major indices:</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded">60%</span>
                      <span className="text-gray-300">NIFTY 50 (broad market)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded">40%</span>
                      <span className="text-gray-300">NIFTY Bank (banking sector)</span>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-gray-400 mb-3">Technical indicators used:</p>
                  <ul className="text-sm text-gray-400 space-y-1">
                    <li>• <span className="text-white">EMA</span> - Direction of trend</li>
                    <li>• <span className="text-white">ADX</span> - Strength of trend</li>
                    <li>• <span className="text-white">RSI</span> - Overbought/Oversold</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stock Selection Section */}
        {activeSection === 'stocks' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="text-3xl">🔍</span> How Stocks Are Picked
              </h2>
              <p className="text-gray-300 text-lg leading-relaxed">
                From <span className="text-blue-400 font-semibold">600+ stocks</span>, the system picks the
                <span className="text-green-400 font-semibold"> top 10</span> that are best suited for the current market mood.
              </p>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4">📊 Scoring Criteria by Market Mood</h3>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-3 text-gray-400">Factor</th>
                      <th className="text-center py-3 text-green-400">Bullish</th>
                      <th className="text-center py-3 text-red-400">Bearish</th>
                      <th className="text-center py-3 text-yellow-400">Sideways</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    <tr>
                      <td className="py-3 text-gray-300">Momentum (speed of rise)</td>
                      <td className="text-center text-green-400 font-bold">30%</td>
                      <td className="text-center text-gray-500">5%</td>
                      <td className="text-center text-gray-500">10%</td>
                    </tr>
                    <tr>
                      <td className="py-3 text-gray-300">Relative Strength (vs market)</td>
                      <td className="text-center text-green-400 font-bold">25%</td>
                      <td className="text-center text-gray-500">15%</td>
                      <td className="text-center text-gray-500">10%</td>
                    </tr>
                    <tr>
                      <td className="py-3 text-gray-300">Low Volatility (stability)</td>
                      <td className="text-center text-gray-500">10%</td>
                      <td className="text-center text-red-400 font-bold">30%</td>
                      <td className="text-center text-yellow-400 font-bold">20%</td>
                    </tr>
                    <tr>
                      <td className="py-3 text-gray-300">Low Beta (defensive)</td>
                      <td className="text-center text-gray-500">10%</td>
                      <td className="text-center text-red-400 font-bold">30%</td>
                      <td className="text-center text-gray-500">15%</td>
                    </tr>
                    <tr>
                      <td className="py-3 text-gray-300">RSI (momentum indicator)</td>
                      <td className="text-center text-gray-500">20%</td>
                      <td className="text-center text-gray-500">10%</td>
                      <td className="text-center text-yellow-400 font-bold">25%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-5">
              <h3 className="text-blue-400 font-semibold mb-3">🏭 Sector Diversification</h3>
              <p className="text-gray-300 mb-3">
                To avoid putting all eggs in one basket, the system limits stocks from each sector:
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">Banking: Max 2</span>
                <span className="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">IT: Max 2</span>
                <span className="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">Pharma: Max 2</span>
                <span className="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">Auto: Max 2</span>
                <span className="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">Energy: Max 2</span>
                <span className="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">...and more</span>
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-3">🔄 Re-screening</h3>
              <p className="text-gray-400">
                The top 10 list is <span className="text-blue-400">refreshed every 5 minutes</span> during market hours.
                If market mood changes, the entire stock selection strategy changes with it.
              </p>
            </div>
          </div>
        )}

        {/* Buying Section */}
        {activeSection === 'entries' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="text-3xl">🛒</span> When Does It Buy?
              </h2>
              <p className="text-gray-300 text-lg leading-relaxed">
                The system uses a <span className="text-blue-400 font-semibold">Grid Strategy</span> to decide when to buy.
                Think of it like setting up automatic "buy orders" at different price levels.
              </p>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4">📐 How Grid Buying Works</h3>

              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                  <div className="relative bg-gray-900 rounded-lg p-4 h-64">
                    {/* Visual representation */}
                    <div className="absolute left-4 top-4 bottom-4 w-px bg-gray-700"></div>

                    <div className="absolute left-6 top-8 right-4 flex items-center">
                      <div className="h-px flex-1 bg-blue-500"></div>
                      <span className="ml-2 text-xs text-blue-400">Reference: ₹100</span>
                    </div>

                    <div className="absolute left-6 top-20 right-4 flex items-center">
                      <div className="h-px flex-1 bg-green-500 border-dashed"></div>
                      <span className="ml-2 text-xs text-green-400">Grid -0.25%: ₹99.75</span>
                    </div>

                    <div className="absolute left-6 top-32 right-4 flex items-center">
                      <div className="h-px flex-1 bg-green-500 border-dashed"></div>
                      <span className="ml-2 text-xs text-green-400">Grid -0.50%: ₹99.50</span>
                    </div>

                    <div className="absolute left-6 top-44 right-4 flex items-center">
                      <div className="h-px flex-1 bg-green-500 border-dashed"></div>
                      <span className="ml-2 text-xs text-green-400">Grid -0.75%: ₹99.25</span>
                    </div>

                    <div className="absolute left-6 bottom-8 right-4 flex items-center">
                      <div className="h-px flex-1 bg-green-500 border-dashed"></div>
                      <span className="ml-2 text-xs text-green-400">Grid -1.00%: ₹99.00</span>
                    </div>
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-800">
                    <span className="text-blue-400 font-medium">1. Reference Price</span>
                    <p className="text-gray-400 text-sm mt-1">Starting point (usually market open price)</p>
                  </div>
                  <div className="p-3 bg-green-900/20 rounded-lg border border-green-800">
                    <span className="text-green-400 font-medium">2. Grid Levels</span>
                    <p className="text-gray-400 text-sm mt-1">Buy when price drops by 0.25% from last buy</p>
                  </div>
                  <div className="p-3 bg-purple-900/20 rounded-lg border border-purple-800">
                    <span className="text-purple-400 font-medium">3. Amount Per Trade</span>
                    <p className="text-gray-400 text-sm mt-1">Fixed amount (e.g., ₹5,000) per buy</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-green-900/20 rounded-xl p-5 border border-green-800">
                <h3 className="text-green-400 font-semibold mb-2">✅ Will Buy If</h3>
                <ul className="text-gray-300 text-sm space-y-2">
                  <li>• Stock is in the "Top 10" active list</li>
                  <li>• Price drops to a grid level</li>
                  <li>• Sufficient cash balance available</li>
                  <li>• Portfolio not overheated (under 80%)</li>
                  <li>• No daily drawdown limit hit</li>
                </ul>
              </div>
              <div className="bg-red-900/20 rounded-xl p-5 border border-red-800">
                <h3 className="text-red-400 font-semibold mb-2">❌ Won't Buy If</h3>
                <ul className="text-gray-300 text-sm space-y-2">
                  <li>• Stock not in top 10 list</li>
                  <li>• Sector limit reached (max 2/sector)</li>
                  <li>• Daily loss exceeds 3% of capital</li>
                  <li>• Already holding too many positions</li>
                  <li>• Market just opened (gap handling)</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Exit Section */}
        {activeSection === 'exits' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="text-3xl">💰</span> When Does It Sell?
              </h2>
              <p className="text-gray-300 text-lg leading-relaxed">
                This is where the magic happens! The system has <span className="text-blue-400 font-semibold">multiple smart exit strategies</span> that
                work together to maximize profits and minimize losses.
              </p>
            </div>

            {/* Trailing Stop */}
            <div className="bg-cyan-900/20 rounded-xl p-5 border border-cyan-800">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">📈</span>
                <h3 className="text-xl font-bold text-cyan-400">Trailing Stop (Let Winners Run)</h3>
              </div>

              <p className="text-gray-300 mb-4">
                When a stock goes up, the exit price <span className="text-cyan-400">follows it up</span>.
                If the stock drops from its high, it triggers a sell.
              </p>

              <div className="bg-gray-900 rounded-lg p-4 mb-4">
                <div className="text-sm text-gray-400 mb-3">Example: Bought at ₹100</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Price rises to ₹100.50 (+0.5%)</span>
                    <span className="text-cyan-400">→ Trailing stop activates at ₹100.20</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Price rises to ₹101.00 (+1%)</span>
                    <span className="text-cyan-400">→ Trailing stop moves to ₹100.70</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Price rises to ₹102.00 (+2%)</span>
                    <span className="text-cyan-400">→ Trailing stop moves to ₹101.70</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Price drops to ₹101.70</span>
                    <span className="text-green-400 font-bold">→ SOLD! Profit: +1.7%</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Activates at:</span>
                  <span className="text-cyan-400 font-medium">+0.5% gain</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Trail distance:</span>
                  <span className="text-cyan-400 font-medium">0.3%</span>
                </div>
              </div>
            </div>

            {/* Rapid Decline */}
            <div className="bg-orange-900/20 rounded-xl p-5 border border-orange-800">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">⚡</span>
                <h3 className="text-xl font-bold text-orange-400">Rapid Decline (Cut Losers Quick)</h3>
              </div>

              <p className="text-gray-300 mb-4">
                If a stock drops <span className="text-orange-400">too fast</span>, exit immediately!
                Don't wait for the regular stop loss.
              </p>

              <div className="bg-gray-900 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">If price drops 0.3% within 5 seconds</span>
                  <span className="text-orange-400 font-bold">→ EXIT IMMEDIATELY</span>
                </div>
              </div>

              <p className="text-gray-400 text-sm">
                This catches sudden crashes, news-driven drops, or when big sellers enter the market.
              </p>
            </div>

            {/* Momentum Exit */}
            <div className="bg-purple-900/20 rounded-xl p-5 border border-purple-800">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">🔥</span>
                <h3 className="text-xl font-bold text-purple-400">Momentum Exit (Overbought)</h3>
              </div>

              <p className="text-gray-300 mb-4">
                When a stock rises too fast and becomes <span className="text-purple-400">overbought</span> (RSI > 80),
                exit before the pullback.
              </p>
            </div>

            {/* Backstop */}
            <div className="bg-red-900/20 rounded-xl p-5 border border-red-800">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">🛑</span>
                <h3 className="text-xl font-bold text-red-400">Backstop Stop Loss (Safety Net)</h3>
              </div>

              <p className="text-gray-300 mb-4">
                No matter what, if a stock drops <span className="text-red-400">2% from buy price</span>, exit.
                This is the absolute maximum loss allowed per trade.
              </p>
            </div>

            {/* Summary */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-3">📊 Exit Types Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-cyan-900/30 rounded-lg">
                  <div className="text-cyan-400 font-bold">TRAILING</div>
                  <div className="text-gray-400 text-xs">Profit taking</div>
                </div>
                <div className="p-3 bg-orange-900/30 rounded-lg">
                  <div className="text-orange-400 font-bold">RAPID</div>
                  <div className="text-gray-400 text-xs">Quick exit on crash</div>
                </div>
                <div className="p-3 bg-purple-900/30 rounded-lg">
                  <div className="text-purple-400 font-bold">MOMENTUM</div>
                  <div className="text-gray-400 text-xs">Overbought exit</div>
                </div>
                <div className="p-3 bg-red-900/30 rounded-lg">
                  <div className="text-red-400 font-bold">BACKSTOP</div>
                  <div className="text-gray-400 text-xs">Max loss safety</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Risk Management Section */}
        {activeSection === 'risk' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="text-3xl">🛡️</span> Risk Management
              </h2>
              <p className="text-gray-300 text-lg leading-relaxed">
                Multiple layers of protection to prevent big losses. Think of it as having
                <span className="text-blue-400 font-semibold"> multiple safety nets</span>.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Daily Drawdown */}
              <div className="bg-red-900/20 rounded-xl p-5 border border-red-800">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">📉</span>
                  <h3 className="text-lg font-bold text-red-400">Daily Drawdown Limit</h3>
                </div>
                <p className="text-gray-300 mb-3">
                  If portfolio loses <span className="text-red-400 font-bold">3%</span> in a single day,
                  <span className="text-red-400"> ALL trading stops</span> for the day.
                </p>
                <div className="text-sm text-gray-400">
                  Prevents revenge trading after a bad day.
                </div>
              </div>

              {/* Portfolio Heat */}
              <div className="bg-orange-900/20 rounded-xl p-5 border border-orange-800">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">🔥</span>
                  <h3 className="text-lg font-bold text-orange-400">Portfolio Heat Limit</h3>
                </div>
                <p className="text-gray-300 mb-3">
                  Maximum <span className="text-orange-400 font-bold">80%</span> of capital can be invested at once.
                </p>
                <div className="text-sm text-gray-400">
                  Always keeps 20% cash for opportunities or safety.
                </div>
              </div>

              {/* Sector Diversification */}
              <div className="bg-blue-900/20 rounded-xl p-5 border border-blue-800">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">🏭</span>
                  <h3 className="text-lg font-bold text-blue-400">Sector Limits</h3>
                </div>
                <p className="text-gray-300 mb-3">
                  Maximum <span className="text-blue-400 font-bold">2 stocks per sector</span>.
                </p>
                <div className="text-sm text-gray-400">
                  Prevents all holdings being in one sector that crashes together.
                </div>
              </div>

              {/* Gap Handling */}
              <div className="bg-yellow-900/20 rounded-xl p-5 border border-yellow-800">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">🌅</span>
                  <h3 className="text-lg font-bold text-yellow-400">Gap Opening Protection</h3>
                </div>
                <p className="text-gray-300 mb-3">
                  If market opens with a <span className="text-yellow-400 font-bold">1%+ gap</span>,
                  trailing stops pause for 2 minutes.
                </p>
                <div className="text-sm text-gray-400">
                  Prevents false triggers from overnight news gaps.
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4">🎯 Risk Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-red-400">-2%</div>
                  <div className="text-sm text-gray-400">Max loss per trade</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-orange-400">-3%</div>
                  <div className="text-sm text-gray-400">Max daily drawdown</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-400">80%</div>
                  <div className="text-sm text-gray-400">Max invested</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-400">2</div>
                  <div className="text-sm text-gray-400">Max per sector</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Costs Section */}
        {activeSection === 'costs' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="text-3xl">💸</span> Costs & Fees
              </h2>
              <p className="text-gray-300 text-lg leading-relaxed">
                Every trade has costs that eat into your profits. The system
                <span className="text-blue-400 font-semibold"> simulates all real Zerodha charges</span>.
              </p>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4">💰 Zerodha Charges (Per Trade)</h3>

              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-gray-900 rounded-lg">
                  <span className="text-gray-300">Brokerage</span>
                  <span className="text-white font-medium">₹20 or 0.03% (whichever is lower)</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-900 rounded-lg">
                  <span className="text-gray-300">STT (Securities Transaction Tax)</span>
                  <span className="text-white font-medium">0.1% on sell value</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-900 rounded-lg">
                  <span className="text-gray-300">Exchange Transaction Charges</span>
                  <span className="text-white font-medium">0.00345% (NSE)</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-900 rounded-lg">
                  <span className="text-gray-300">GST</span>
                  <span className="text-white font-medium">18% on brokerage + exchange charges</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-900 rounded-lg">
                  <span className="text-gray-300">SEBI Charges</span>
                  <span className="text-white font-medium">₹10 per crore</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-900 rounded-lg">
                  <span className="text-gray-300">Stamp Duty</span>
                  <span className="text-white font-medium">0.015% on buy value</span>
                </div>
              </div>
            </div>

            <div className="bg-yellow-900/20 rounded-xl p-5 border border-yellow-800">
              <h3 className="text-yellow-400 font-semibold mb-3">⚠️ Slippage Simulation</h3>
              <p className="text-gray-300 mb-3">
                In real trading, you rarely get the exact price you want. The system simulates this:
              </p>
              <ul className="text-gray-400 text-sm space-y-2">
                <li>• <span className="text-white">Base slippage:</span> 0.05% on all orders</li>
                <li>• <span className="text-white">Impact cost:</span> 0.02% per lakh of order size</li>
                <li>• <span className="text-white">Volatility multiplier:</span> 1.5x during high volatility</li>
                <li>• <span className="text-white">Maximum slippage:</span> Capped at 0.3%</li>
              </ul>
            </div>

            <div className="bg-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-3">📊 Example: ₹5,000 Trade</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-gray-400 mb-2">Buy Side</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Brokerage</span>
                      <span className="text-white">₹1.50</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Stamp Duty</span>
                      <span className="text-white">₹0.75</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Exchange + GST</span>
                      <span className="text-white">₹0.44</span>
                    </div>
                    <div className="flex justify-between font-medium pt-1 border-t border-gray-700">
                      <span className="text-gray-300">Total Buy Cost</span>
                      <span className="text-red-400">₹2.69</span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 mb-2">Sell Side</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Brokerage</span>
                      <span className="text-white">₹1.50</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">STT</span>
                      <span className="text-white">₹5.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Exchange + GST</span>
                      <span className="text-white">₹0.44</span>
                    </div>
                    <div className="flex justify-between font-medium pt-1 border-t border-gray-700">
                      <span className="text-gray-300">Total Sell Cost</span>
                      <span className="text-red-400">₹6.94</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 p-3 bg-red-900/20 rounded-lg text-center">
                <span className="text-gray-400">Round Trip Cost (Buy + Sell):</span>
                <span className="text-red-400 font-bold ml-2">₹9.63 (~0.19%)</span>
              </div>
            </div>

            <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-5">
              <h3 className="text-blue-400 font-semibold mb-2">📌 Break-Even Point</h3>
              <p className="text-gray-300">
                With all costs + slippage, a trade needs to make at least
                <span className="text-blue-400 font-bold"> ~0.25%</span> profit just to break even.
                This is why the target percentage is set higher.
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Quick Reference Footer */}
      <div className="mt-8 dashboard-card p-4">
        <h3 className="text-white font-semibold mb-3">⚡ Quick Reference</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center text-sm">
          <div className="p-3 bg-gray-800 rounded-lg">
            <div className="text-blue-400 font-bold">Grid</div>
            <div className="text-gray-400">-0.25%</div>
          </div>
          <div className="p-3 bg-gray-800 rounded-lg">
            <div className="text-cyan-400 font-bold">Trail</div>
            <div className="text-gray-400">0.3%</div>
          </div>
          <div className="p-3 bg-gray-800 rounded-lg">
            <div className="text-orange-400 font-bold">Rapid</div>
            <div className="text-gray-400">0.3% in 5s</div>
          </div>
          <div className="p-3 bg-gray-800 rounded-lg">
            <div className="text-red-400 font-bold">Backstop</div>
            <div className="text-gray-400">-2%</div>
          </div>
          <div className="p-3 bg-gray-800 rounded-lg">
            <div className="text-purple-400 font-bold">Drawdown</div>
            <div className="text-gray-400">-3%/day</div>
          </div>
        </div>
      </div>
    </div>
  )
}
