const crypto = require('crypto');
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
// MEMORY STORE (IMPORTANT)
// ======================
const payments = {};

// ======================
// LIPANA SETUP
// ======================
const lipanaApiKey = process.env.LIPANA_API_KEY;

if (!lipanaApiKey) {
  console.warn("LIPANA_API_KEY is missing!");
}

const lipana = new Lipana({
  apiKey: lipanaApiKey,
  environment: process.env.LIPANA_ENV || "sandbox"
});

// ======================
// PAYMENT ROUTE
// ======================
app.post('/api/pay', async (req, res) => {
  const { phone, amount, reference } = req.body;

  if (!phone || !amount || !reference) {
    return res.status(400).json({
      error: "phone, amount, and reference are required"
    });
  }

  // MINIMUM DONATION
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
      transactionDesc: "Donation to Tomsmosse engineering fund"
    });

    // Store pending payment
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
// STATUS CHECK API
// ======================
app.get('/api/status/:reference', (req, res) => {
  const ref = req.params.reference;

  if (!payments[ref]) {
    return res.json({ status: "not_found" });
  }

  return res.json(payments[ref]);
});

// ======================
// HEALTH CHECK
// ======================
app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

// ======================
// WEBHOOK
// ======================
app.post('/api/webhook', (req, res) => {
  console.log("========== WEBHOOK RECEIVED ==========");
  console.log(JSON.stringify(req.body, null, 2));

  const { event, reference } = req.body;

  if (event === "transaction.success") {
    console.log("✅ PAYMENT SUCCESS");

    if (payments[reference]) {
      payments[reference].status = "success";
    }
  }

  if (event === "transaction.failed") {
    console.log("❌ PAYMENT FAILED");

    if (payments[reference]) {
      payments[reference].status = "failed";
    }
  }

  res.status(200).json({ received: true });
});

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});