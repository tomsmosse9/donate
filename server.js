const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const crypto = require('crypto');
const session = require('express-session');
const { Lipana } = require('@lipana/sdk');

dotenv.config();

const pool = require('./db');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.ADMIN_SESSION_SECRET || 'default_secret',
  resave: false,
  saveUninitialized: false
}));

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// =====================
// STATUS NORMALIZER (FIXED)
// =====================
function normalizeStatus(status) {
  if (!status) return "pending";

  const s = String(status).toLowerCase();

  if (s.includes("success") || s === "0") return "success";
  if (s === "failed" || s === "fail" || s === "1") return "failed";

  return "pending";
}

// =====================
// PICK VALUE HELPERS
// =====================
function pickFirst(...vals) {
  return vals.find(v => v !== undefined && v !== null && v !== "");
}

// =====================
// LIPANA INIT
// =====================
const lipana = new Lipana({
  apiKey: process.env.LIPANA_API_KEY,
  environment: process.env.LIPANA_ENV || "sandbox"
});

// =====================
// PAYMENT INIT
// =====================
app.post('/api/pay', async (req, res) => {
  const { phone, amount, reference } = req.body;

  try {
    const tx = await lipana.transactions.initiateStkPush({
      phone,
      amount: Number(amount),
      accountReference: reference,
      transactionDesc: "Donation"
    });

    await pool.query(
      `INSERT INTO donations(reference, phone, amount, status, tx_id, raw_payload)
       VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT (reference) DO NOTHING`,
      [
        reference,
        phone,
        amount,
        "pending",
        tx.transactionId || null,
        JSON.stringify(tx)
      ]
    );

    res.json({ success: true, reference });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Payment failed" });
  }
});

// =====================
// STATUS CHECK (IMPORTANT FIX)
// =====================
app.get('/api/status/:reference', async (req, res) => {
  const { reference } = req.params;

  const result = await pool.query(
    `SELECT status FROM donations WHERE reference=$1`,
    [reference]
  );

  res.json({
    status: result.rows[0]?.status || "pending"
  });
});

// =====================
// 🔥 FIXED WEBHOOK (THIS IS THE MAIN BUG FIX)
// =====================
app.post('/api/webhook', async (req, res) => {
  console.log("WEBHOOK RECEIVED:", JSON.stringify(req.body, null, 2));

  try {
    const data = req.body.data || req.body;

    const reference =
      data.reference ||
      data.accountReference ||
      data.transaction_id;

    const status = normalizeStatus(
      data.status || req.body.event
    );

    console.log("PARSED:", { reference, status });

    if (!reference) {
      console.log("❌ NO REFERENCE FOUND");
      return res.json({ ok: false });
    }

    await pool.query(
      `UPDATE donations
       SET status=$1,
           raw_payload=$2,
           updated_at=NOW()
       WHERE reference=$3`,
      [status, JSON.stringify(req.body), reference]
    );

    console.log(`✅ UPDATED ${reference} → ${status}`);

    res.json({ ok: true });

  } catch (err) {
    console.error("WEBHOOK ERROR:", err);
    res.status(500).json({ error: "webhook failed" });
  }
});

// =====================
// ADMIN LOGIN
// =====================
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;

  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }

  res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.isAdmin = false;
  res.json({ success: true });
});

// =====================
// ADMIN DATA
// =====================
app.get('/api/admin/donations', requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM donations ORDER BY created_at DESC LIMIT 100`
  );

  res.json(result.rows);
});

// =====================
// SUMMARY
// =====================
app.get('/api/admin/summary', requireAdmin, async (req, res) => {
  const total = await pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM donations`);
  const success = await pool.query(`SELECT COUNT(*) as count FROM donations WHERE status='success'`);
  const failed = await pool.query(`SELECT COUNT(*) as count FROM donations WHERE status='failed'`);

  res.json({
    total: total.rows[0].total,
    success: success.rows[0].count,
    failed: failed.rows[0].count
  });
});

// =====================
app.use(express.static(path.join(__dirname)));

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});