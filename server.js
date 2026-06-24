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
// ADMIN COOKIE
// =====================
const ADMIN_COOKIE_NAME = "admin_session";
const ADMIN_SESSION_MS = 1000 * 60 * 60 * 8;

// simple cookie parser
function getCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map(c => {
        const [k, ...v] = c.trim().split("=");
        return [k, decodeURIComponent(v.join("="))];
      })
  );
}

function sign(username, exp) {
  return crypto
    .createHmac("sha256", process.env.ADMIN_SESSION_SECRET)
    .update(`${username}.${exp}`)
    .digest("hex");
}

function createToken(username) {
  const exp = Date.now() + ADMIN_SESSION_MS;
  const sig = sign(username, exp);
  return Buffer.from(`${username}.${exp}.${sig}`).toString("base64url");
}

function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const [u, exp, sig] = decoded.split(".");

    if (u !== process.env.ADMIN_USERNAME) return false;
    if (Number(exp) < Date.now()) return false;

    const expected = sign(u, exp);
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  const token = getCookies(req)[ADMIN_COOKIE_NAME];

  if (token && verifyToken(token)) return next();

  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Admin login required" });
  }

  return res.redirect("/admin-login.html");
}

// =====================
// LIPANA
// =====================
const lipana = new Lipana({
  apiKey: process.env.LIPANA_API_KEY,
  environment: process.env.LIPANA_ENV || "sandbox"
});

// =====================
// ADMIN LOGIN
// =====================
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = createToken(username);

    res.cookie(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    });

    return res.json({ success: true });
  }

  res.status(401).json({ error: "Invalid login" });
});

// =====================
// PAYMENT
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
    `SELECT * FROM donations WHERE reference=$1`,
    [reference]
  );

  res.json({
    status: result.rows[0]?.status || "pending"
  });
});

// =====================
// 🔥 FIXED WEBHOOK (IMPORTANT)
// =====================
app.post('/api/webhook', async (req, res) => {
  console.log("WEBHOOK:", JSON.stringify(req.body, null, 2));

  try {
    const data = req.body.data || req.body;

    const reference = data.reference;
    const status = normalizeStatus(data.status || req.body.event);

    if (reference && status) {
      await pool.query(
        `UPDATE donations
         SET status=$1, raw_payload=$2, updated_at=NOW()
         WHERE reference=$3`,
        [status, JSON.stringify(req.body), reference]
      );

      console.log("UPDATED:", reference, status);
    } else {
      console.log("NO MATCH:", data);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "webhook failed" });
  }
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
// SUMMARY FIX
// =====================
app.get('/api/admin/summary', requireAdmin, async (req, res) => {
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
app.use(express.static(path.join(__dirname)));

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});