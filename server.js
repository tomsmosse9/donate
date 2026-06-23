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

  if (["success", "successful", "completed", "paid"].includes(s)) return "success";
  if (["failed", "cancelled", "canceled", "timeout"].includes(s)) return "failed";

  return "pending";
}

function pickFirst(...vals) {
  return vals.find(v => v !== undefined && v !== null && v !== "");
}

const ADMIN_COOKIE_NAME = "admin_session";
const ADMIN_SESSION_MS = 1000 * 60 * 60 * 8;

function getCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map((cookie) => {
        const [name, ...value] = cookie.trim().split("=");
        return [name, decodeURIComponent(value.join("="))];
      })
  );
}

function signAdminToken(username, expiresAt) {
  return crypto
    .createHmac("sha256", process.env.ADMIN_SESSION_SECRET)
    .update(`${username}.${expiresAt}`)
    .digest("hex");
}

function createAdminToken(username) {
  const expiresAt = Date.now() + ADMIN_SESSION_MS;
  const signature = signAdminToken(username, expiresAt);
  return Buffer.from(`${username}.${expiresAt}.${signature}`).toString("base64url");
}

function verifyAdminToken(token) {
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
    return false;
  }

  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [username, expiresAt, signature] = decoded.split(".");

    if (!username || !expiresAt || !signature) return false;
    if (username !== process.env.ADMIN_USERNAME) return false;
    if (Number(expiresAt) < Date.now()) return false;

    const expected = signAdminToken(username, expiresAt);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  const token = getCookies(req)[ADMIN_COOKIE_NAME];

  if (verifyAdminToken(token)) {
    return next();
  }

  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Admin login required" });
  }

  return res.redirect("/admin-login.html");
}

function setAdminCookie(res, token) {
  const secure = process.env.NODE_ENV === "production";
  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: ADMIN_SESSION_MS
  });
}

// =====================
// LIPANA INIT
// =====================
const lipana = new Lipana({
  apiKey: process.env.LIPANA_API_KEY,
  environment: process.env.LIPANA_ENV || "sandbox"
});

// =====================
// ADMIN AUTH
// =====================
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
    return res.status(503).json({ error: "Admin login is not configured" });
  }

  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid login details" });
  }

  setAdminCookie(res, createAdminToken(username));
  res.json({ success: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME);
  res.json({ success: true });
});

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin.html', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.use(express.static(path.join(__dirname), {
  index: 'index.html'
}));

// =====================
// INITIATE PAYMENT
// =====================
app.post('/api/pay', async (req, res) => {
  const { phone, amount, reference } = req.body;

  if (!phone || !amount || !reference) {
    return res.status(400).json({ error: "Missing fields" });
  }

  if (Number(amount) < 10) {
    return res.status(400).json({ error: "Minimum donation is KES 10" });
  }

  try {
    const transaction = await lipana.transactions.initiateStkPush({
      phone,
      amount: Number(amount),
      accountReference: reference,
      transactionDesc: "Donation"
    });

    await pool.query(
      `INSERT INTO donations(reference, phone, amount, status, tx_id, checkout_request_id, raw_payload)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (reference) DO NOTHING`,
      [
        reference,
        phone,
        Number(amount),
        "pending",
        transaction.transactionId || null,
        transaction.checkoutRequestID || null,
        JSON.stringify(transaction)
      ]
    );

    return res.json({
      success: true,
      reference
    });

  } catch (err) {
    console.error("PAY ERROR:", err);
    return res.status(500).json({ error: "Payment failed" });
  }
});

// =====================
// STATUS CHECK
// =====================
app.get('/api/status/:reference', async (req, res) => {
  const ref = req.params.reference;

  const result = await pool.query(
    `SELECT * FROM donations WHERE reference = $1`,
    [ref]
  );

  const payment = result.rows[0];

  if (!payment) {
    return res.json({ status: "pending" });
  }

  // fallback Lipana check
  if (payment.status === "pending" && payment.tx_id) {
    try {
      const tx = await lipana.transactions.retrieve(payment.tx_id);
      const newStatus = normalizeStatus(tx.status);

      if (newStatus && newStatus !== "pending") {
        await pool.query(
          `UPDATE donations SET status = $1, raw_payload = $2 WHERE reference = $3`,
          [newStatus, JSON.stringify(tx), ref]
        );

        payment.status = newStatus;
      }
    } catch (err) {
      console.log("Status check error:", err.message);
    }
  }

  return res.json({
    status: payment.status
  });
});

// =====================
// WEBHOOK
// =====================
app.post('/api/webhook', async (req, res) => {
  console.log("========== WEBHOOK ==========");
  console.log(JSON.stringify(req.body, null, 2));

  const body = req.body;

  const reference = pickFirst(
    body.reference,
    body.accountReference,
    body.account_reference,
    body.transaction_id,
    body.checkout_request_id
  );

  const event = body.event || body.type;
  const status = normalizeStatus(body.status);

  let finalStatus = status;

  if (!finalStatus || finalStatus === "pending") {
    if (event?.includes("success")) finalStatus = "success";
    if (event?.includes("fail") || event?.includes("cancel")) finalStatus = "failed";
  }

  if (reference && finalStatus) {
    await pool.query(
      `UPDATE donations SET status = $1, raw_payload = $2 WHERE reference = $3`,
      [finalStatus, JSON.stringify(body), reference]
    );

    console.log("UPDATED:", reference, finalStatus);
  }

  res.status(200).json({ received: true });
});

// =====================
// ADMIN API (LIVE DASHBOARD)
// =====================
app.get('/api/admin/donations', requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM donations ORDER BY created_at DESC LIMIT 100`
  );

  res.json(result.rows);
});

// =====================
// ADMIN SUMMARY (BONUS)
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
// HEALTH CHECK
// =====================
app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

// =====================
// START SERVER
// =====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
