const crypto = require('crypto');
const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const { Lipana } = require('@lipana/sdk');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Environment variables
const lipanaApiKey = process.env.LIPANA_API_KEY;

if (!lipanaApiKey) {
  console.warn('Warning: LIPANA_API_KEY is not set.');
}

// Initialize Lipana
const lipana = new Lipana({
  apiKey: lipanaApiKey,
  environment: process.env.LIPANA_ENV || 'sandbox'
});

/**
 * =========================
 * PAYMENT ROUTE (STK PUSH)
 * =========================
 */
app.post('/api/pay', async (req, res) => {
  const { phone, amount, reference } = req.body;

  // Basic validation
  if (!phone || !amount || !reference) {
    return res.status(400).json({
      error: 'phone, amount, and reference are required'
    });
  }

  // Minimum donation rule
  if (Number(amount) < 10) {
    return res.status(400).json({
      error: 'Minimum donation is KES 10'
    });
  }

  try {
    const transaction = await lipana.transactions.initiateStkPush({
      phone,
      amount: Number(amount),
      accountReference: reference,
      transactionDesc: 'Donation to Tomsmosse engineering fund'
    });

    return res.json({
      success: true,
      transaction
    });
  } catch (error) {
    console.error('Lipana payment error', error);
    return res.status(500).json({
      error: 'Unable to initiate payment. Please try again later.'
    });
  }
});

/**
 * =========================
 * HEALTH CHECK
 * =========================
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * =========================
 * WEBHOOK (PAYMENT STATUS)
 * =========================
 */
app.post('/api/webhook', (req, res) => {
  console.log('========== WEBHOOK RECEIVED ==========');
  console.log(JSON.stringify(req.body, null, 2));

  const {
    event,
    transaction_id,
    amount,
    phone,
    reference,
    timestamp
  } = req.body;

  if (event === 'transaction.success') {
    console.log('✅ PAYMENT SUCCESSFUL');
    console.log(`Reference: ${reference}`);
    console.log(`Amount: ${amount}`);
    console.log(`Phone: ${phone}`);
  }

  if (event === 'transaction.failed') {
    console.log('❌ PAYMENT FAILED');
    console.log(`Reference: ${reference}`);
  }

  res.status(200).json({ received: true });
});

/**
 * =========================
 * START SERVER
 * =========================
 */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Donation site running on http://localhost:${PORT}`);
  console.log("LIPANA_API_KEY =", process.env.LIPANA_API_KEY ? "Loaded" : "Missing");
});