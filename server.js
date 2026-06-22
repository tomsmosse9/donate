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

const lipanaApiKey = process.env.LIPANA_API_KEY;

if (!lipanaApiKey) {
  console.warn('Warning: LIPANA_API_KEY is not set. Donation checkout will not work until it is configured.');
}

const lipana = new Lipana({
  apiKey: lipanaApiKey,
  environment: process.env.LIPANA_ENV || 'sandbox'
});

app.post('/api/pay', async (req, res) => {
  const { phone, amount, reference } = req.body;

  if (!phone || !amount || !reference) {
    return res.status(400).json({ error: 'phone, amount, and reference are required' });
  }

  try {
    const transaction = await lipana.transactions.initiateStkPush({
      phone,
      amount: Number(amount),
      accountReference: reference,
      transactionDesc: 'Donation to Tomsmosse engineering fund'
    });

    return res.json({ success: true, transaction });
  } catch (error) {
    console.error('Lipana payment error', error);
    return res.status(500).json({ error: 'Unable to initiate payment. Please try again later.' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Donation site running on http://localhost:${PORT}`);
});
