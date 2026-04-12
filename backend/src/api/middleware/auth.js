const config = require('../../../config');

/**
 * Verifies Authorization: Bearer <INTERNAL_API_KEY> header.
 * Skip auth for GET /health.
 */
module.exports = function authMiddleware(req, res, next) {
  // Health check is always public
  if (req.path === '/health' || req.path === '/') return next();

  const key = config.server.internalApiKey;
  if (!key) return next(); // No key configured → open (dev mode)

  const header = req.headers['authorization'] || '';
  if (header === `Bearer ${key}`) return next();

  res.status(401).json({ error: 'Unauthorized' });
};
