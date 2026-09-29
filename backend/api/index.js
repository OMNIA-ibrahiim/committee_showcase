if (process.env.NODE_ENV !== 'production') require('dotenv').config({ quiet: true });

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const pool      = require('../src/db');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
  throw new Error('JWT_SECRET must be set and at least 32 characters');

if (isProdEnv() && !process.env.SMTP_USER) console.warn('WARNING: SMTP_USER/SMTP_PASS not set - verification emails will fail');
function isProdEnv() { return process.env.NODE_ENV === 'production'; }

const authRoutes    = require('../src/routes/auth');
const projectRoutes = require('../src/routes/projects');
const adminRoutes   = require('../src/routes/admin');

const app    = express();
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());

const origins = (process.env.FRONTEND_URL || '')
  .split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);

app.use(cors({
  origin: origins.length ? origins : (isProd ? false : true),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '20kb' }));

const mk = (windowMs, limit) => rateLimit({
  windowMs, limit, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use(mk(60 * 1000, 120));                       // general
app.use('/auth/login',   mk(15 * 60 * 1000, 10));  // brute-force protection
app.use('/auth/signup',  mk(60 * 60 * 1000, 10));
app.use('/auth/refresh', mk(15 * 60 * 1000, 60));
app.use('/auth/verify-email', mk(15 * 60 * 1000, 10));
app.use('/auth/resend-code',  mk(60 * 60 * 1000, 5));

app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); }
  catch (e) { console.error(e); res.status(503).json({ status: 'db_unavailable' }); }
});

app.use('/auth',     authRoutes);
app.use('/projects', projectRoutes);
app.use('/admin',    adminRoutes);

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  if (err.type === 'entity.too.large')    return res.status(413).json({ error: 'Request too large.' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`API running on http://localhost:${port}`));
}

module.exports = app;