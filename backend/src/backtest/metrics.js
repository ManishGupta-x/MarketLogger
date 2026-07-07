function computeMetrics({ trades, equityCurve, initialCapital, startDate, endDate }) {
  const finalEquity = equityCurve.length ? equityCurve[equityCurve.length - 1].equity : initialCapital;
  const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100;

  const days = Math.max(1, (new Date(endDate) - new Date(startDate)) / 86400000);
  const years = days / 365.25;
  const cagr = years > 0 && finalEquity > 0
    ? (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100
    : 0;

  const closedTrades = trades.filter(t => t.exit_date != null);
  const wins = closedTrades.filter(t => t.pnl > 0);
  const losses = closedTrades.filter(t => t.pnl <= 0);
  const winRate = closedTrades.length ? (wins.length / closedTrades.length) * 100 : 0;
  const totalPnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);
  const totalCosts = closedTrades.reduce((sum, t) => sum + (t.costs || 0), 0);
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  const riskReward = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : null;

  let peak = initialCapital;
  let maxDrawdown = 0;
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    const drawdown = ((peak - point.equity) / peak) * 100;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }

  return {
    startCapital: initialCapital,
    endCapital: finalEquity,
    totalReturnPct: round(totalReturn),
    cagrPct: round(cagr),
    winRatePct: round(winRate),
    totalPnl: round(totalPnl),
    totalCosts: round(totalCosts),
    maxDrawdownPct: round(maxDrawdown),
    tradeCount: closedTrades.length,
    avgWin: round(avgWin),
    avgLoss: round(avgLoss),
    riskReward: riskReward != null ? round(riskReward) : null,
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { computeMetrics };
