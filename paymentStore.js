const { Pool } = require('pg');

const memoryPayments = {};
let pool = null;

function shouldUseSsl(connectionString) {
  if (process.env.DATABASE_SSL === "false") return false;
  if (process.env.DATABASE_SSL === "true") return true;
  return !/localhost|127\.0\.0\.1/i.test(connectionString);
}

function mapPayment(row) {
  if (!row) return null;

  return {
    reference: row.reference,
    phone: row.phone,
    amount: Number(row.amount),
    status: row.status,
    txId: row.transaction_id,
    checkoutRequestID: row.checkout_request_id,
    mpesaReceiptNumber: row.mpesa_receipt_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function initPaymentStore() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not set. Payments will use temporary memory storage.");
    return;
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      reference TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      transaction_id TEXT,
      checkout_request_id TEXT,
      mpesa_receipt_number TEXT,
      raw_payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_payments_transaction_id
    ON payments (transaction_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_payments_checkout_request_id
    ON payments (checkout_request_id)
  `);

  console.log("Payment database ready");
}

async function savePayment(payment) {
  if (!pool) {
    memoryPayments[payment.reference] = {
      ...payment,
      updatedAt: new Date()
    };
    return memoryPayments[payment.reference];
  }

  const result = await pool.query(
    `
      INSERT INTO payments (
        reference,
        phone,
        amount,
        status,
        transaction_id,
        checkout_request_id,
        raw_payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (reference) DO UPDATE SET
        phone = EXCLUDED.phone,
        amount = EXCLUDED.amount,
        status = EXCLUDED.status,
        transaction_id = EXCLUDED.transaction_id,
        checkout_request_id = EXCLUDED.checkout_request_id,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
      RETURNING *
    `,
    [
      payment.reference,
      payment.phone,
      payment.amount,
      payment.status || "pending",
      payment.txId || null,
      payment.checkoutRequestID || null,
      payment.rawPayload || null
    ]
  );

  return mapPayment(result.rows[0]);
}

async function getPaymentByReference(reference) {
  if (!pool) {
    return memoryPayments[reference] || null;
  }

  const result = await pool.query(
    "SELECT * FROM payments WHERE reference = $1",
    [reference]
  );

  return mapPayment(result.rows[0]);
}

async function findPaymentByIdentifiers({ reference, txId, checkoutRequestID }) {
  if (reference) {
    const payment = await getPaymentByReference(reference);
    if (payment) return payment;
  }

  if (!txId && !checkoutRequestID) {
    return null;
  }

  if (!pool) {
    return Object.values(memoryPayments).find((payment) => (
      (txId && payment.txId === txId) ||
      (checkoutRequestID && payment.checkoutRequestID === checkoutRequestID)
    )) || null;
  }

  const result = await pool.query(
    `
      SELECT *
      FROM payments
      WHERE ($1::text IS NOT NULL AND transaction_id = $1)
         OR ($2::text IS NOT NULL AND checkout_request_id = $2)
      LIMIT 1
    `,
    [txId || null, checkoutRequestID || null]
  );

  return mapPayment(result.rows[0]);
}

async function updatePaymentStatus({ reference, txId, checkoutRequestID, status, mpesaReceiptNumber, rawPayload }) {
  const payment = await findPaymentByIdentifiers({ reference, txId, checkoutRequestID });

  if (!payment) {
    return null;
  }

  if (!pool) {
    const stored = memoryPayments[payment.reference];
    stored.status = status;
    stored.mpesaReceiptNumber = mpesaReceiptNumber || stored.mpesaReceiptNumber || null;
    stored.rawPayload = rawPayload || stored.rawPayload || null;
    stored.updatedAt = new Date();
    return stored;
  }

  const result = await pool.query(
    `
      UPDATE payments
      SET
        status = $2,
        transaction_id = COALESCE($3, transaction_id),
        checkout_request_id = COALESCE($4, checkout_request_id),
        mpesa_receipt_number = COALESCE($5, mpesa_receipt_number),
        raw_payload = COALESCE($6, raw_payload),
        updated_at = NOW()
      WHERE reference = $1
      RETURNING *
    `,
    [
      payment.reference,
      status,
      txId || null,
      checkoutRequestID || null,
      mpesaReceiptNumber || null,
      rawPayload || null
    ]
  );

  return mapPayment(result.rows[0]);
}

module.exports = {
  initPaymentStore,
  savePayment,
  getPaymentByReference,
  findPaymentByIdentifiers,
  updatePaymentStatus
};
