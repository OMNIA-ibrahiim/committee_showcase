const jwt  = require('jsonwebtoken');
const pool = require('../db');

function readToken(req) {
  const h = req.headers.authorization;
  return h && h.startsWith('Bearer ') ? h.split(' ')[1] : null;
}
const verify = t => jwt.verify(t, process.env.JWT_SECRET, { algorithms: ['HS256'] });

function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'No token provided. Please log in.' });
  try { req.user = verify(token); next(); }
  catch (e) { res.status(401).json({ error: 'Invalid or expired token. Please log in again.' }); }
}

function optionalAuth(req, res, next) {
  req.user = null;
  const token = readToken(req);
  if (token) { try { req.user = verify(token); } catch (e) { /* ignore */ } }
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, async () => {
    try {
      const r = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
      if (!r.rows[0] || r.rows[0].role !== 'admin')
        return res.status(403).json({ error: 'Access denied. Admins only.' });
      next();
    } catch (err) {
      console.error('requireAdmin error:', err);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  });
}

module.exports = { requireAuth, optionalAuth, requireAdmin };