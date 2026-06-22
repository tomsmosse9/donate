app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

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
  }

  if (event === 'transaction.failed') {
    console.log('❌ PAYMENT FAILED');
  }

  res.status(200).json({ received: true });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Donation site running on http://localhost:${PORT}`);
});