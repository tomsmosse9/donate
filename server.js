const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const { Lipana } = require('@lipana/sdk');
const {
  initPaymentStore,
  savePayment,
  getPaymentByReference,
  updatePaymentStatus
} = require('./paymentStore');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

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
    mpesaReceiptNumber: pickFirst(
      data.mpesaReceiptNumber,
      data.mpesa_receipt_number,
      result.mpesaReceiptNumber,
      result.mpesa_receipt_number,
      body.mpesaReceiptNumber,
      body.mpesa_receipt_number
    ),
    status: normalizeStatus(pickFirst(data.status, result.status, body.status))
  };
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

    const payment = await savePayment({
      reference,
      phone,
      amount: Number(amount),
      status: "pending",
      txId: transaction.transactionId || null,
      checkoutRequestID: transaction.checkoutRequestID || null,
      rawPayload: transaction
    });

    console.log("PAYMENT INITIATED:", payment);

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

  const payment = await getPaymentByReference(ref);

  if (!payment) {
    return res.json({ status: "pending" });
  }

  if (payment.status === "pending" && payment.txId) {
    try {
      const transaction = await lipana.transactions.retrieve(payment.txId);
      const latestStatus = normalizeStatus(transaction.status);

      if (latestStatus && latestStatus !== "pending") {
        payment.status = latestStatus;
        await updatePaymentStatus({
          reference: ref,
          status: latestStatus,
          rawPayload: transaction
        });
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
app.post('/api/webhook', async (req, res) => {
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

  if (status === "success") {
    console.log("PAYMENT SUCCESS", details);

    await updatePaymentStatus({
      ...details,
      status: "success",
      rawPayload: req.body
    });
  }

  if (status === "failed") {
    console.log("PAYMENT FAILED", details);

    await updatePaymentStatus({
      ...details,
      status: "failed",
      rawPayload: req.body
    });
  }

  res.status(200).json({ received: true });
});

// =====================
app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

// =====================
const PORT = process.env.PORT || 3000;

async function startServer() {
  await initPaymentStore();

  return app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error("Failed to initialize payment database:", err);
    process.exit(1);
  });
}

module.exports = { app, startServer };
