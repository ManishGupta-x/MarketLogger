const express = require('express');
const multer = require('multer');
const candleStore = require('../../marketdata/candle-store');
const csvImport = require('../../marketdata/csv-import');
const yahoo = require('../../marketdata/yahoo');
const kiteHistorical = require('../../marketdata/kite-historical');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = express.Router();

router.get('/', (req, res) => {
  res.json(candleStore.listSymbols());
});

router.get('/:symbol', (req, res) => {
  const { source, start, end } = req.query;
  res.json(candleStore.getCandles(req.params.symbol, { source, start, end }));
});

router.delete('/:symbol', (req, res) => {
  const { source } = req.query;
  if (!source) return res.status(400).json({ error: 'source query param is required' });
  const deleted = candleStore.deleteCandles(req.params.symbol, source);
  res.json({ deleted });
});

router.post('/import/csv', upload.single('file'), (req, res) => {
  const { symbol } = req.body;
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  const text = req.file ? req.file.buffer.toString('utf8') : req.body.csv;
  if (!text) return res.status(400).json({ error: 'file upload or csv text body is required' });

  try {
    const candles = csvImport.parseCsv(text);
    const count = candleStore.upsertCandles(symbol, 'csv', candles);
    res.json({ symbol: symbol.toUpperCase(), source: 'csv', imported: count });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/import/yahoo', async (req, res) => {
  const { symbol, exchange, range } = req.body;
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  try {
    const candles = await yahoo.fetchDailyCandles(symbol, { exchange, range });
    const count = candleStore.upsertCandles(symbol, 'yahoo', candles);
    res.json({ symbol: symbol.toUpperCase(), source: 'yahoo', imported: count });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post('/import/kite', async (req, res) => {
  const { symbol, instrumentToken, range } = req.body;
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  try {
    const candles = await kiteHistorical.fetchDailyCandles(symbol, { instrumentToken, range });
    const count = candleStore.upsertCandles(symbol, 'kite', candles);
    res.json({ symbol: symbol.toUpperCase(), source: 'kite', imported: count });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
