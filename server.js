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

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeStatus(status) {
  if (!status) return null;

  const normalized = String(status).toLowerCase();

  if (["success", "successful", "completed", "complete", "paid"].includes(normalized)) {
    return "success";
  }

  if (["failed", "cancelled", "canceled", "timeout", "timed_out", "expired"].includes(normalized)) {
    return "failed";
  }

  return "pending";
}

function extractPaymentDetails(body = {}) {
  const data = body.data || body.payload || body.transaction || body.payment || {};
  const result = data.result || data.callback || {};

  return {
    event: body.event || body.type || body.eventType,
    reference: pickFirst(
      data.reference,
      data.accountReference,
      data.account_reference,
      result.reference,
      result.accountReference,
      result.account_reference,
      body.reference,
      body.accountReference,
      body.account_reference
    ),
    txId: pickFirst(
      data.transaction_id,
      data.transactionId,
      data.transactionID,
      data.id,
      result.transaction_id,
      result.transactionId,
      result.transactionID,
      body.transaction_id,
      body.transactionId,
      body.transactionID,
      body.id
    ),
    checkoutRequestID: pickFirst(
      data.checkoutRequestID,
      data.checkout_request_id,
      result.checkoutRequestID,
      result.checkout_request_id,
      body.checkoutRequestID,
      body.checkout_request_id
    ),
    status: normalizeStatus(pickFirst(data.status, result.status, body.status))
  };
}

function findPaymentKey({ reference, txId, checkoutRequestID }) {
  if (reference && payments[reference]) {
    return reference;
  }

  return Object.keys(payments).find((key) => {
    const payment = payments[key];
    return (
      (txId && payment.txId === txId) ||
      (checkoutRequestID && payment.checkoutRequestID === checkoutRequestID)
    );
  });
}

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
      txId: transaction.transactionId || null,
      checkoutRequestID: transaction.checkoutRequestID || null
    };

    console.log("PAYMENT INITIATED:", payments[reference]);

    return res.json({
      success: true,
      reference,
      transactionId: transaction.transactionId || null
    });

  } catch (err) {
    console.error("PAY ERROR:", err);
    return res.status(500).json({ error: "Payment failed" });
  }
});

// =====================
// STEP 2: STATUS CHECK
// =====================
app.get('/api/status/:reference', async (req, res) => {
  const ref = req.params.reference;

  const payment = payments[ref];

  if (!payment) {
    return res.json({ status: "pending" });
  }

  if (payment.status === "pending" && payment.txId) {
    try {
      const transaction = await lipana.transactions.retrieve(payment.txId);
      const latestStatus = normalizeStatus(transaction.status);

      if (latestStatus && latestStatus !== "pending") {
        payment.status = latestStatus;
      }
    } catch (err) {
      console.error("STATUS LOOKUP ERROR:", err.message || err);
    }
  }

  return res.json({
    status: payment.status
  });
});

// =====================
// STEP 3: WEBHOOK
// =====================
app.post('/api/webhook', (req, res) => {
  console.log("========== WEBHOOK ==========");
  console.log(JSON.stringify(req.body, null, 2));

  const details = extractPaymentDetails(req.body);
  const event = details.event;
  let status = details.status;

  if (!status || status === "pending") {
    if (event === "transaction.success" || event === "payment.success" || event === "stk.success") {
      status = "success";
    }

    if (event === "transaction.failed" || event === "transaction.cancelled" || event === "payment.failed" || event === "stk.failed") {
      status = "failed";
    }
  }

  const matchingKey = findPaymentKey(details);

  if (status === "success") {
    console.log("PAYMENT SUCCESS", details);

    if (matchingKey) {
      payments[matchingKey].status = "success";
    }
  }

  if (status === "failed") {
    console.log("PAYMENT FAILED", details);

    if (matchingKey) {
      payments[matchingKey].status = "failed";
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
