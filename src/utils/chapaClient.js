const axios = require('axios');
const crypto = require('crypto');
const logger = require('./logger');

const CHAPA_BASE_URL = process.env.CHAPA_BASE_URL || 'https://api.chapa.co/v1';
const CHAPA_SECRET_KEY = process.env.CHAPA_SECRET_KEY;

const chapaClient = axios.create({
  baseURL: CHAPA_BASE_URL,
  headers: {
    Authorization: `Bearer ${CHAPA_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
});

/**
 * Initialize a Chapa payment
 */
const initializePayment = async ({ amount, currency = 'ETB', email, txRef, callbackUrl, returnUrl, metadata }) => {
  const { data } = await chapaClient.post('/transaction/initialize', {
    amount,
    currency,
    email,
    tx_ref: txRef,
    callback_url: callbackUrl || `${process.env.APP_BASE_URL}/api/v1/payments/chapa-webhook`,
    return_url: returnUrl || `${process.env.FRONTEND_URL}/payment/success`,
    customization: {
      title: 'Ethred Payment',
      description: 'Property listing promotion',
    },
    meta: metadata,
  });
  return data;
};

/**
 * Verify Chapa HMAC-SHA256 webhook signature
 * SRS Section 4.3: x-chapa-signature header
 */
const verifyWebhookSignature = (rawBody, signatureHeader) => {
  if (!CHAPA_SECRET_KEY || !signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', process.env.CHAPA_WEBHOOK_SECRET || CHAPA_SECRET_KEY)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
};

/**
 * Verify a transaction with Chapa
 */
const verifyTransaction = async (txRef) => {
  try {
    const { data } = await chapaClient.get(`/transaction/verify/${txRef}`);
    return data;
  } catch (err) {
    logger.error('Chapa verify failed:', err.response?.data || err.message);
    throw err;
  }
};

module.exports = { initializePayment, verifyWebhookSignature, verifyTransaction };
