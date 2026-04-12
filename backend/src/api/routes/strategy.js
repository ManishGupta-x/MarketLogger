const express = require('express');
const router = express.Router();
const orchestrator = require('../../strategy/orchestrator');
const screener     = require('../../strategy/screener');
const costs        = require('../../portfolio/costs');
const db           = require('../../database');

// GET /api/strategies   — history of daily strategies
router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit) || 30;
  res.json(db.getAllDailyStrategies(limit));
});

// GET /api/adaptive-info
router.get('/adaptive-info', (req, res) => res.json(orchestrator.getAdaptiveInfo()));

// GET /api/active-stocks
router.get('/active-stocks', (req, res) => res.json(screener.getActive()));

// GET /api/rankings
router.get('/rankings', (req, res) => res.json(screener.getAllRankings()));

// GET /api/exit-stats
router.get('/exit-stats', (req, res) => {
  const days = parseInt(req.query.days) || 30;
  res.json({
    exitReasons:     db.getExitReasonStats(days),
    regimePerformance: db.getRegimePerformanceStats(days),
    openPositions:   db.getOpenPositions()
  });
});

// GET /api/cost-info
router.get('/cost-info', (req, res) => res.json(costs.getChargeRates()));

// POST /api/estimate-costs
router.post('/estimate-costs', (req, res) => {
  const { price, qty, targetPercent } = req.body;
  if (!price || !qty) return res.status(400).json({ error: 'price and qty required' });
  res.json(costs.estimateTrade(Number(price), Number(qty), Number(targetPercent) || 0.25));
});

module.exports = router;
