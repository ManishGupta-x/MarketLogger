// Minimal dependency-free CSV parser for OHLCV daily candle files.
// Expects a header row containing date,open,high,low,close,volume (any order, case-insensitive).
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const col = (name) => {
    const idx = header.indexOf(name);
    if (idx === -1) throw new Error(`CSV is missing required column: ${name}`);
    return idx;
  };
  const dateIdx = col('date');
  const openIdx = col('open');
  const highIdx = col('high');
  const lowIdx = col('low');
  const closeIdx = col('close');
  const volumeIdx = header.indexOf('volume');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim());
    if (cells.length < header.length - (volumeIdx === -1 ? 1 : 0)) continue;
    const date = normalizeDate(cells[dateIdx]);
    const open = parseFloat(cells[openIdx]);
    const high = parseFloat(cells[highIdx]);
    const low = parseFloat(cells[lowIdx]);
    const close = parseFloat(cells[closeIdx]);
    const volume = volumeIdx === -1 ? 0 : parseInt(cells[volumeIdx], 10) || 0;
    if (!date || [open, high, low, close].some(Number.isNaN)) continue;
    rows.push({ date, open, high, low, close, volume });
  }
  return rows;
}

function normalizeDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

module.exports = { parseCsv };
