const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const { Lipana } = require('@lipana/sdk');

dotenv.config();

const app = express();

// ======================
// MIDDLEWARE
// ======================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ======================
// MEMORY STORE
// ======================
const payments = {};

// ======================
// LIPANA SETUP
// ======================
const lipana = new Lipana({
  apiKey: process.env.LIPANA_API_KEY,
  environment: process.env.LIPANA_ENV || "sandbox"
});

// ======================
// PAYMENT ROUTE
// ======================
app.post('/api/pay', async (req, res) => {
  const { phone, amount, reference } = req.body;

  if (!phone || !amount || !reference) {
    return res.status(400).json({
      error: "phone, amount, reference required"
    });
  }

  if (Number(amount) < 10) {
    return res.status(400).json({
      error: "Minimum donation is KES 10"
    });
  }

  try {
    const transaction = await lipana.transactions.initiateStkPush({
      phone,
      amount: Number(amount),
      accountReference: reference,
      transactionDesc: "Donation"
    });

    payments[reference] = {
      status: "pending",
      phone,
      amount
    };

    return res.json({
      success: true,
      transaction
    });

  } catch (error) {
    console.error("Payment error:", error);
    return res.status(500).json({
      error: "Payment failed"
    });
  }
});

// ======================
// STATUS CHECK
// ======================
app.get('/api/status/:reference', (req, res) => {
  const ref = req.params.reference;

  if (!payments[ref]) {
    return res.json({ status: "pending" });
  }

  return res.json({
    status: payments[ref].status
  });
});

// ======================
// WEBHOOK (IMPORTANT FIX)
// ======================
app.post('/api/webhook', (req, res) => {
  console.log("========== WEBHOOK RECEIVED ==========");
  console.log(JSON.stringify(req.body, null, 2));

  const event = req.body.event;

  const reference =
    req.body.reference ||
    req.body.accountReference ||
    req.body.transaction_id;

  if (!reference) {
    return res.status(200).json({ received: true });
  }

  if (event === "transaction.success") {
    console.log("✅ PAYMENT SUCCESS");

    payments[reference] = {
      status: "success"
    };
  }

  if (event === "transaction.failed") {
    console.log("❌ PAYMENT FAILED");

    payments[reference] = {
      status: "failed"
    };
  }

  res.status(200).json({ received: true });
});

// ======================
// HEALTH CHECK
// ======================
app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});