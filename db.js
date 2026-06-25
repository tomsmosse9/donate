const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Only use SSL for production (Render)
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false
});

// Create the donations table automatically
async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.log("⚠️ No DATABASE_URL found - Running without database");
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS donations (
        id SERIAL PRIMARY KEY,
        reference TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        tx_id TEXT,
        checkout_request_id TEXT,
        raw_payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_donations_reference ON donations(reference)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_donations_created_at ON donations(created_at DESC)
    `);

    console.log("✅ PostgreSQL connected & 'donations' table is ready");
  } catch (err) {
    console.error("❌ Database initialization failed:", err.message);
    console.log("💡 Tip: Make sure PostgreSQL is running and your password is correct in .env");
  }
}

// Run initialization
initDb().catch(console.error);

module.exports = pool;