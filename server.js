const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const { Lipana } = require('@lipana/sdk');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// =====================
// SIMPLE MEMORY STORE
// =====================
const payments = {};

// =====================
// LIPANA SETUP
// =====================
const lipana = new Lipana({
  apiKey: process.env.LIPANA_API_KEY,
  environment: process.env.LIPANA_ENV || "sandbox"
});

// =====================
// STEP 1: INITIATE PAYMENT
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

    // IMPORTANT: store using frontend reference
    payments[reference] = {
      status: "pending",
      txId: transaction.transactionId || null
    };

    console.log("PAYMENT INITIATED:", payments[reference]);

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
// STEP 2: STATUS CHECK
// =====================
app.get('/api/status/:reference', (req, res) => {
  const ref = req.params.reference;

  const payment = payments[ref];

  if (!payment) {
    return res.json({ status: "pending" });
  }

  return res.json({
    status: payment.status
  });
});

// =====================
// STEP 3: WEBHOOK (CRITICAL FIX)
// =====================
app.post('/api/webhook', (req, res) => {
  console.log("========== WEBHOOK ==========");
  console.log(JSON.stringify(req.body, null, 2));

  const event = req.body.event;
  const data = req.body.data || req.body.payload || {};

  const reference = data.reference || data.accountReference || data.account_reference || req.body.reference || req.body.accountReference || req.body.account_reference;
  const txId = data.transaction_id || data.transactionId || data.transactionID || req.body.transaction_id || req.body.transactionId || req.body.transactionID;

  // SUCCESS
  if (event === "transaction.success" || event === "payment.success" || event === "stk.success") {
    console.log("✅ PAYMENT SUCCESS", { reference, txId });

    if (reference && payments[reference]) {
      payments[reference].status = "success";
    }

    if (!reference && txId) {
      const matchingKey = Object.keys(payments).find((key) => payments[key].txId === txId);
      if (matchingKey) {
        payments[matchingKey].status = "success";
      }
    }
  }

  // FAILED / CANCELLED
  if (event === "transaction.failed" || event === "transaction.cancelled" || event === "payment.failed" || event === "stk.failed") {
    console.log("❌ PAYMENT FAILED", { reference, txId });

    if (reference && payments[reference]) {
      payments[reference].status = "failed";
    }

    if (!reference && txId) {
      const matchingKey = Object.keys(payments).find((key) => payments[key].txId === txId);
      if (matchingKey) {
        payments[matchingKey].status = "failed";
      }
    }
  }

  res.status(200).json({ received: true });
});

// =====================
app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

// =====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});