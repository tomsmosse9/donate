const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const crypto = require('crypto');
const { Lipana } = require('@lipana/sdk');

dotenv.config();

const pool = require('./db');
const app = express();

// =====================
// MIDDLEWARE
// =====================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================
// HELPERS
// =====================
function normalizeStatus(status) {
  if (!status) return "pending";

  const s = String(status).toLowerCase();

  if (["success", "successful", "completed", "paid", "0"].includes(s)) return "success";
  if (["failed", "cancelled", "canceled", "timeout", "1"].includes(s)) return "failed";

  return "pending";
}

function pickFirst(...vals) {
  return vals.find(v => v !== undefined && v !== null && v !== "");
}

// =====================
// LIPANA
// =====================
const lipana = new Lipana({
  apiKey: process.env.LIPANA_API_KEY,
  environment: process.env.LIPANA_ENV || "sandbox"
});

// =====================
// PAY
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

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Payment failed" });
  }
});

// =====================
// STATUS
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
// FIXED WEBHOOK (IMPORTANT)
// =====================
app.post('/api/webhook', async (req, res) => {
  console.log("WEBHOOK RECEIVED:", JSON.stringify(req.body, null, 2));

  try {
    const payload = req.body;
    const data = payload.data || payload;

    const reference = data.reference || data.transaction_id;
    const status = normalizeStatus(data.status || payload.event);

    if (!reference) return res.json({ ok: true });

    await pool.query(
      `UPDATE donations
       SET status=$1, raw_payload=$2, updated_at=NOW()
       WHERE reference=$3`,
      [status, JSON.stringify(payload), reference]
    );

    console.log(`UPDATED ${reference} → ${status}`);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "webhook failed" });
  }
});

// =====================
// ADMIN
// =====================
app.get('/api/admin/donations', async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM donations ORDER BY created_at DESC LIMIT 100`
  );
  res.json(result.rows);
});

app.get('/api/admin/summary', async (req, res) => {
  const total = await pool.query(`SELECT COALESCE(SUM(amount),0) FROM donations`);
  const success = await pool.query(`SELECT COUNT(*) FROM donations WHERE status='success'`);
  const failed = await pool.query(`SELECT COUNT(*) FROM donations WHERE status='failed'`);

  res.json({
    total: total.rows[0].coalesce,
    success: success.rows[0].count,
    failed: failed.rows[0].count
  });
});

// =====================
// STATIC
// =====================
app.use(express.static(path.join(__dirname)));

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running...");
});