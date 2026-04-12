const express = require('express');
const router = express.Router();
const orchestrator = require('../../strategy/orchestrator');

// GET /api/risk-status
router.get('/', (req, res) => res.json(orchestrator.getRiskStatus()));

// POST /api/risk-resume
router.post('/resume', (req, res) => res.json(orchestrator.forceResume()));

module.exports = router;
