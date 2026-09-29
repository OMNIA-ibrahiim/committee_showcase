const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { z }  = require('zod');
const pool   = require('../db');
const { firstError } = require('../validate');
const { sendVerificationEmail } = require('../email');

const SALT_ROUNDS       = 12;
const CODE_TTL_MIN      = 15;
const MAX_ATTEMPTS      = 5;
const RESEND_COOLDOWN_S = 60;

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const codeHash = (userId, code) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${userId}:${code}`).digest('hex');
const safeEqual = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// optional: ALLOWED_EMAIL_DOMAINS=university.edu,committee.org
const domains = (process.env.ALLOWED_EMAIL_DOMAINS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const emailAllowed = email => !domains.length || domains.includes(email.split('@')[1]);

function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m', algorithm: 'HS256' }
  );
}

async function createRefreshToken(userId) {
  const raw     = crypto.randomBytes(64).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
    [userId, sha256(raw), expires]
  );
  return raw;
}

const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });

async function sessionFor(user) {
  return {
    user: publicUser(user),
    accessToken:  signAccessToken(user),
    refreshToken: await createRefreshToken(user.id),
  };
}

// Creates + emails a fresh 6-digit code. Returns false if asked again too soon.
async function issueCode(user) {
  const recent = await pool.query(
    `SELECT 1 FROM email_verifications
     WHERE user_id = $1 AND created_at > NOW() - make_interval(secs => $2)`,
    [user.id, RESEND_COOLDOWN_S]
  );
  if (recent.rows.length) return false;

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await pool.query(
    `INSERT INTO email_verifications (user_id, code_hash, expires_at, attempts, created_at)
     VALUES ($1, $2, NOW() + make_interval(mins => $3), 0, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at,
           attempts = 0, created_at = NOW()`,
    [user.id, codeHash(user.id, code), CODE_TTL_MIN]
  );
  try {
    await sendVerificationEmail(user.email, user.name, code);
  } catch (err) {
    await pool.query('DELETE FROM email_verifications WHERE user_id = $1', [user.id]);
    throw err;
  }
  return true;
}

const emailField = z.string().trim().toLowerCase().email('is invalid').max(255);
const signupSchema = z.object({
  name:     z.string().trim().min(1, 'is required').max(100),
  email:    emailField,
  password: z.string().min(8, 'must be at least 8 characters').max(72, 'must be at most 72 characters'),
});
const loginSchema = z.object({
  email:    z.string().trim().toLowerCase().max(255),
  password: z.string().min(1).max(200),
});
const verifySchema = z.object({ email: emailField, code: z.string().trim().regex(/^\d{6}$/, 'must be 6 digits') });
const resendSchema = z.object({ email: emailField });
const tokenSchema  = z.object({ refreshToken: z.string().min(1).max(300) });

const TOO_SOON = { error: 'Please wait a minute before requesting another code.' };

router.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed.error) });
  const { name, email, password } = parsed.data;

  if (!emailAllowed(email))
    return res.status(403).json({ error: 'Signups are limited to approved email domains.' });

  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    // An UNVERIFIED account with this email can be re-registered; a verified one cannot.
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO UPDATE
         SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
         WHERE users.email_verified = false
       RETURNING id, name, email, role`,
      [name, email, hash]
    );
    if (!result.rows.length)
      return res.status(409).json({ error: 'An account with this email already exists.' });

    if (!(await issueCode(result.rows[0]))) return res.status(429).json(TOO_SOON);

    res.status(201).json({
      message: 'Account created. We sent a 6-digit code to your email.',
      needsVerification: true,
      email,
    });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'An account with this email already exists.' });
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/verify-email', async (req, res) => {
  const parsed = verifySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed.error) });
  const { email, code } = parsed.data;

  try {
    const u = await pool.query(
      'SELECT id, name, email, role, email_verified FROM users WHERE email = $1', [email]);
    const user = u.rows[0];
    if (!user) return res.status(400).json({ error: 'Incorrect or expired code.' });
    if (user.email_verified)
      return res.status(400).json({ error: 'Email already verified. Please log in.' });

    // count the attempt atomically, only while the code is valid and attempts remain
    const upd = await pool.query(
      `UPDATE email_verifications SET attempts = attempts + 1
       WHERE user_id = $1 AND expires_at > NOW() AND attempts < $2
       RETURNING code_hash`,
      [user.id, MAX_ATTEMPTS]
    );
    if (!upd.rows.length)
      return res.status(400).json({ error: 'Code expired or too many attempts. Request a new code.' });
    if (!safeEqual(upd.rows[0].code_hash, codeHash(user.id, code)))
      return res.status(400).json({ error: 'Incorrect code.' });

    await pool.query('UPDATE users SET email_verified = true WHERE id = $1', [user.id]);
    await pool.query('DELETE FROM email_verifications WHERE user_id = $1', [user.id]);

    res.json({ message: 'Email verified.', ...(await sessionFor(user)) });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/resend-code', async (req, res) => {
  const parsed = resendSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed.error) });

  try {
    const u = await pool.query(
      'SELECT id, name, email, email_verified FROM users WHERE email = $1', [parsed.data.email]);
    const user = u.rows[0];
    if (user && !user.email_verified && !(await issueCode(user)))
      return res.status(429).json(TOO_SOON);
    res.json({ message: 'If this account needs verification, a new code was sent.' });
  } catch (err) {
    console.error('Resend error:', err);
    res.status(500).json({ error: 'Could not send the code. Please try again.' });
  }
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Email and password are required.' });
  const { email, password } = parsed.data;

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      await bcrypt.hash(password, SALT_ROUNDS); // same cost as a real check (hides which emails exist)
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (!(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid email or password.' });

    if (!user.email_verified)
      return res.status(403).json({ error: 'Please verify your email first.', code: 'EMAIL_NOT_VERIFIED' });

    pool.query('DELETE FROM refresh_tokens WHERE expires_at < NOW()').catch(() => {}); // cleanup

    res.json({ message: 'Logged in successfully.', ...(await sessionFor(user)) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/logout', async (req, res) => {
  const parsed = tokenSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Refresh token is required.' });
  try {
    await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [sha256(parsed.data.refreshToken)]);
    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

router.post('/refresh', async (req, res) => {
  const parsed = tokenSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Refresh token is required.' });
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
      [sha256(parsed.data.refreshToken)]
    );
    if (!result.rows.length)
      return res.status(401).json({ error: 'Invalid or expired refresh token. Please log in again.' });
    res.json({ accessToken: signAccessToken(result.rows[0]) });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;