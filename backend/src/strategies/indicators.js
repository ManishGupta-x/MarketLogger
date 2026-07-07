function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// Wilder's smoothed RSI.
function rsi(closes, period) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gainSum += change; else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = rsiFromAvg(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFromAvg(avgGain, avgLoss);
  }
  return out;
}

function rsiFromAvg(avgGain, avgLoss) {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function highest(values, period, endIndex) {
  const start = Math.max(0, endIndex - period + 1);
  let max = -Infinity;
  for (let i = start; i <= endIndex; i++) max = Math.max(max, values[i]);
  return max;
}

function lowest(values, period, endIndex) {
  const start = Math.max(0, endIndex - period + 1);
  let min = Infinity;
  for (let i = start; i <= endIndex; i++) min = Math.min(min, values[i]);
  return min;
}

module.exports = { sma, rsi, highest, lowest };
