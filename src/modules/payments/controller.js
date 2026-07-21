const { z } = require('zod');
const { prisma } = require('../../config/db');
const { ApiError } = require('../../middleware/errorHandler');
const { initializePayment, verifyWebhookSignature, verifyTransaction } = require('../../utils/chapaClient');
const crypto = require('crypto');
const { sendEmail } = require('../../config/mailer');
const logger = require('../../utils/logger');

// Valid promotion tiers (SRS Section 8.3)
const PROMOTION_TIERS = {
  HOMEPAGE_FEATURED: 2500,
  SEARCH_BOOST: 1500,
  PREMIUM_BADGE: 800,
};

const initiatePaymentSchema = z.object({
  property_id: z.string().uuid(),
  promotion_tier: z.enum(['HOMEPAGE_FEATURED', 'SEARCH_BOOST', 'PREMIUM_BADGE']),
  currency: z.enum(['ETB', 'USD']).default('ETB'),
});

/**
 * POST /api/v1/payments/initiate
 * Creates a pending invoice and returns Chapa checkout URL
 */
const initiatePayment = async (req, res, next) => {
  try {
    const { property_id, promotion_tier, currency } = initiatePaymentSchema.parse(req.body);

    const property = await prisma.property.findUnique({ where: { id: property_id } });
    if (!property) throw new ApiError('Property not found.', 404);
    if (property.owner_id !== req.user.id && req.user.role !== 'ADMIN') {
      throw new ApiError('You do not own this property.', 403);
    }

    const amount = PROMOTION_TIERS[promotion_tier];
    const txRef = `ethred_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

    // Create invoice record in PENDING state
    const invoice = await prisma.billingInvoice.create({
      data: {
        user_id: req.user.id,
        amount,
        currency,
        tx_ref: txRef,
        payment_processor: 'CHAPA',
        status: 'PENDING',
        metadata: { property_id, promotion_tier },
      },
    });

    // Initialize with Chapa API
    const chapaResponse = await initializePayment({
      amount,
      currency,
      email: req.user.email,
      txRef,
      metadata: { property_id, promotion_tier, invoice_id: invoice.id },
    });

    res.json({
      success: true,
      checkout_url: chapaResponse.data?.checkout_url,
      tx_ref: txRef,
      invoice_id: invoice.id,
    });
  } catch (err) { next(err); }
};

const listInvoices = async (req, res, next) => {
  try {
    const { page = '1', limit = '20', status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 50);

    const where = {
      user_id: req.user.id,
      ...(status && { status }),
    };

    const [count, results] = await Promise.all([
      prisma.billingInvoice.count({ where }),
      prisma.billingInvoice.findMany({ where, skip, take, orderBy: { created_at: 'desc' } }),
    ]);

    res.json({ success: true, count, results });
  } catch (err) { next(err); }
};

const getInvoice = async (req, res, next) => {
  try {
    const invoice = await prisma.billingInvoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) throw new ApiError('Invoice not found.', 404);
    if (invoice.user_id !== req.user.id && req.user.role !== 'ADMIN') throw new ApiError('Forbidden.', 403);
    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
};

/**
 * POST /api/v1/payments/chapa-webhook
 * SRS REQ-PAY-03, Section 4.2 & 4.3
 * Validates HMAC, transitions invoice to COMPLETED, activates listing promotion
 */
const chapaWebhook = async (req, res, next) => {
  try {
    // Verify HMAC-SHA256 signature (SRS Section 4.3)
    const signature = req.headers['x-chapa-signature'];
    const rawBody = req.body; // Buffer (set in app.js)

    if (!verifyWebhookSignature(rawBody, signature)) {
      logger.warn('Chapa webhook: invalid signature');
      return res.status(401).json({ received: false, error: 'Invalid signature' });
    }

    // Parse body after verification
    const payload = JSON.parse(rawBody.toString());
    const { event, data } = payload;

    logger.info(`Chapa webhook received: ${event}`, { tx_ref: data?.tx_ref });

    if (event !== 'charge.success') {
      return res.json({ received: true }); // Acknowledge non-success events silently
    }

    const { tx_ref, status, metadata } = data;

    // Verify with Chapa API to prevent replay attacks
    const verification = await verifyTransaction(tx_ref);
    if (verification?.data?.status !== 'success') {
      logger.warn(`Chapa webhook: verification failed for ${tx_ref}`);
      return res.status(400).json({ received: false, error: 'Verification failed' });
    }

    // Update invoice status (SRS Section 8.3 state machine)
    const invoice = await prisma.billingInvoice.findFirst({ where: { tx_ref } });
    if (!invoice) {
      logger.warn(`Chapa webhook: invoice not found for tx_ref ${tx_ref}`);
      return res.json({ received: true });
    }

    if (invoice.status === 'COMPLETED') {
      return res.json({ received: true }); // Idempotent
    }

    await prisma.$transaction(async (tx) => {
      // Mark invoice COMPLETED
      await tx.billingInvoice.update({
        where: { id: invoice.id },
        data: { status: 'COMPLETED', updated_at: new Date() },
      });

      // Activate property promotion (SRS Section 8.3: PENDING → FEATURED)
      const propertyId = metadata?.property_id || invoice.metadata?.property_id;
      const promotionTier = metadata?.promotion_tier || invoice.metadata?.promotion_tier;

      if (propertyId) {
        await tx.property.update({
          where: { id: propertyId },
          data: {
            is_featured: true,
            featured_tier: promotionTier,
            featured_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            updated_at: new Date(),
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          actor_id: invoice.user_id,
          action: 'PAYMENT_COMPLETED',
          target_table: 'billing_invoices',
          target_id: invoice.id,
          new_values: { tx_ref, promotion_tier: promotionTier, property_id: propertyId },
        },
      });
    });

    // Send confirmation email (SRS REQ-COMM-03)
    const user = await prisma.user.findUnique({ where: { id: invoice.user_id }, select: { email: true } });
    if (user?.email) {
      await sendEmail({
        to: user.email,
        subject: 'Payment Confirmed — Ethred',
        html: `
          <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #121212; color: #fff; border-radius: 12px;">
            <h2 style="color: #D4AF37;">Payment Confirmed ✓</h2>
            <p>Your payment of <strong>${invoice.amount} ${invoice.currency}</strong> has been received.</p>
            <p>Reference: <code style="color: #D4AF37;">${tx_ref}</code></p>
            <p>Your listing has been promoted successfully.</p>
          </div>
        `,
      }).catch(() => {});
    }

    // Must respond quickly to Chapa (SRS REQ-PAY-03)
    res.json({ received: true });
  } catch (err) {
    logger.error('Chapa webhook error:', err);
    next(err);
  }
};

module.exports = { initiatePayment, listInvoices, getInvoice, chapaWebhook };
