const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const { Lipana } = require('@lipana/sdk');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const payments = {};

const lipana = new Lipana({
  apiKey: process.env.LIPANA_API_KEY,
  environment: process.env.LIPANA_ENV || "sandbox"
});

// ======================
// NORMALIZE FUNCTION
// ======================
function getReference(body) {
  return (
    body.reference ||
    body.accountReference ||
    body.data?.reference ||
    body.data?.transaction_id ||
    body.data?.payoutId
  );
}

// ======================
// PAY
// ======================
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

    // store using BOTH references for safety
    payments[reference] = { status: "pending" };

    if (transaction?.transactionId) {
      payments[transaction.transactionId] = { status: "pending" };
    }

    return res.json({ success: true, transaction });

  } catch (err) {
    console.error("PAY ERROR:", err);
    return res.status(500).json({ error: "Payment failed" });
  }
});

// ======================
// STATUS
// ======================
app.get('/api/status/:reference', (req, res) => {
  const ref = req.params.reference;

  const record = payments[ref];

  if (!record) {
    return res.json({ status: "pending" });
  }

  return res.json({ status: record.status });
});

// ======================
// WEBHOOK (FINAL FIX)
// ======================
app.post('/api/webhook', (req, res) => {
  console.log("========== WEBHOOK RECEIVED ==========");
  console.log(JSON.stringify(req.body, null, 2));

  const event = req.body.event;
  const reference = getReference(req.body);

  if (!reference) {
    return res.status(200).json({ received: true });
  }

  if (event === "transaction.success") {
    console.log("✅ PAYMENT SUCCESS");

    payments[reference] = { status: "success" };
  }

  if (event === "transaction.failed") {
    console.log("❌ PAYMENT FAILED");

    payments[reference] = { status: "failed" };
  }

  res.status(200).json({ received: true });
});

// ======================
app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

// ======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});