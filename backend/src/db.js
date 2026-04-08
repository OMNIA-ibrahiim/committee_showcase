const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,                // serverless: only 1 connection per function
  idleTimeoutMillis: 0,
  connectionTimeoutMillis: 10000,
});



/*pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1); 
  }
  release();
  console.log('Database connected');
});*/

module.exports = pool;