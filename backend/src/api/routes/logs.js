const express = require('express');
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../../logs');
const router = express.Router();

router.get('/dates', (req, res) => {
  if (!fs.existsSync(LOG_DIR)) return res.json([]);
  const dates = fs.readdirSync(LOG_DIR)
    .filter(f => f.endsWith('.log'))
    .map(f => f.replace('.log', ''))
    .sort((a, b) => b.localeCompare(a));
  res.json(dates);
});

router.get('/', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
  const filePath = path.join(LOG_DIR, `${date}.log`);
  if (!fs.existsSync(filePath)) return res.json({ date, lines: [] });

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  res.json({ date, lines: lines.slice(-limit) });
});

module.exports = router;
