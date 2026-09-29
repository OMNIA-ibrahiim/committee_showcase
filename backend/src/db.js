const { Pool } = require('pg');

let ssl;
if (process.env.DB_SSL === 'false') ssl = false;
else if (process.env.DB_CA_CERT)    ssl = { rejectUnauthorized: true, ca: process.env.DB_CA_CERT };
else                                ssl = { rejectUnauthorized: false };

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // use your provider's POOLED connection string
  ssl,
  max: 1,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', err => console.error('Postgres pool error:', err.message));

module.exports = pool;