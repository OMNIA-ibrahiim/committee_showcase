//  POST /auth/signup   → create account
//  POST /auth/login    → get tokens
//  POST /auth/logout   → invalidate refresh token
//  POST /auth/refresh  → get a new access token using refresh token

const router    = require('express').Router();
const bcrypt    = require('bcrypt');
const jwt       = require('jsonwebtoken');
const crypto    = require('crypto');
const pool      = require('../db');

const SALT_ROUNDS = 12; 

function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN } 
  );
}

async function createRefreshToken(userId) {
  const raw   = crypto.randomBytes(64).toString('hex');
  const hash  = crypto.createHash('sha256').update(raw).digest('hex');
  const expires = new Date();
  expires.setDate(expires.getDate() + 7); 

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hash, expires]
  );

  return raw; 
}

router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;


  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {

    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, role, created_at`,
      [name.trim(), email.toLowerCase().trim(), password_hash]
    );

    const user = result.rows[0];

    const accessToken  = signAccessToken(user);
    const refreshToken = await createRefreshToken(user.id);

    res.status(201).json({
      message: 'Account created successfully.',
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const accessToken  = signAccessToken(user);
    const refreshToken = await createRefreshToken(user.id);

    res.json({
      message: 'Logged in successfully.',
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required.' });
  }

  try {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hash]);

    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required.' });
  }

  try {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const result = await pool.query(
      `SELECT rt.*, u.id as uid, u.name, u.email, u.role
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
      [hash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired refresh token. Please log in again.' });
    }

    const row = result.rows[0];

    const accessToken = signAccessToken({
      id: row.uid, email: row.email, role: row.role
    });

    res.json({ accessToken });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;