/**
 * POST /api/v1/charge
 * Main charge endpoint for Android app and POS systems.
 * Supports both online and offline (queued) transactions.
 *
 * Authentication: x-api-key header with merchant's ps_pub_ or ps_sec_ key
 */

const express = require('express');
const router = express.Router();

const merchantManager = require('../../utils/merchantManager');
const offlineQueue = require('../../utils/offlineQueue');
const platformFee = require('../../utils/platformFee');
const database = require('../../utils/database');
const stripeGateway = require('../../utils/stripeGateway');
const auditLogger = require('../../utils/auditLogger');

/**
 * Middleware: validate merchant key from x-api-key header
 */
function requireMerchantKey(req, res, next) {
    const key = req.headers['x-api-key'] || req.headers['x-publishable-key'] || req.headers['x-secret-key'];

    if (!key) {
        return res.status(401).json({
            success: false,
            error: 'MISSING_KEY',
            message: 'Provide your PRIMESTACK key in the x-api-key header'
        });
    }

    const result = merchantManager.validateKey(key);

    if (!result.isValid) {
        auditLogger.logSecurityEvent({
            type: 'invalid_merchant_key',
            description: `Invalid merchant key attempt: ${result.reason}`,
            severity: 'warning',
            ip: req.ip
        });
        return res.status(401).json({
            success: false,
            error: 'INVALID_KEY',
            message: result.reason
        });
    }

    req.merchant = result;
    next();
}

// ── POST /api/v1/charge ───────────────────────────────────────────────────────
router.post('/', requireMerchantKey, async (req, res) => {
    const {
        amount,
        currency,
        description,
        metadata = {},
        // Offline fields — sent by Android when internet was unavailable at capture time
        offline = false,
        offlineRef,
        cardLast4,
        cardBrand,
        cardExpiry,
        terminalId,
        capturedAt,
        offlineToken
    } = req.body;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_AMOUNT',
            message: 'amount must be a positive number'
        });
    }

    const amountNum = parseFloat(amount);
    const currencyCode = (currency || req.merchant.currency || 'USD').toUpperCase();
    const merchantId = req.merchant.merchantId;

    // ── OFFLINE PATH ─────────────────────────────────────────────────────────
    if (offline === true || offline === 'true') {

        if (!req.merchant.offlineEnabled) {
            return res.status(403).json({
                success: false,
                error: 'OFFLINE_DISABLED',
                message: 'Offline payments are not enabled for your account'
            });
        }

        if (!offlineRef) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_OFFLINE_REF',
                message: 'offlineRef is required for offline transactions'
            });
        }

        if (!cardLast4) {
            return res.status(400).json({
                success: false,
                error: 'MISSING_CARD_DETAILS',
                message: 'cardLast4 is required for offline transactions'
            });
        }

        // Check single transaction limit
        if (amountNum > req.merchant.offlineLimit) {
            return res.status(400).json({
                success: false,
                error: 'OFFLINE_LIMIT_EXCEEDED',
                message: `Offline transaction limit is ${req.merchant.offlineLimit} ${currencyCode}`,
                limit: req.merchant.offlineLimit
            });
        }

        // Check daily limit
        const limitCheck = offlineQueue.checkDailyLimit(
            merchantId,
            amountNum,
            req.merchant.offlineDailyLimit
        );

        if (!limitCheck.allowed) {
            return res.status(400).json({
                success: false,
                error: 'OFFLINE_DAILY_LIMIT_EXCEEDED',
                message: `Daily offline limit of ${req.merchant.offlineDailyLimit} ${currencyCode} exceeded`,
                dailyLimit: req.merchant.offlineDailyLimit,
                currentTotal: limitCheck.currentTotal,
                remaining: limitCheck.remaining
            });
        }

        try {
            const queued = offlineQueue.queueTransaction(merchantId, {
                amount: amountNum,
                currency: currencyCode,
                cardLast4,
                cardBrand,
                cardExpiry,
                terminalId,
                offlineRef,
                capturedAt: capturedAt || new Date().toISOString(),
                offlineToken,
                metadata
            });

            return res.json({
                success: true,
                mode: 'offline',
                queued: true,
                queueId: queued.queueId,
                offlineRef,
                amount: amountNum,
                currency: currencyCode,
                message: 'Transaction queued. Will be processed when connection is restored.',
                syncWhen: 'Call POST /api/v1/offline/sync when online'
            });

        } catch (err) {
            return res.status(500).json({
                success: false,
                error: 'QUEUE_ERROR',
                message: err.message
            });
        }
    }

    // ── ONLINE PATH ───────────────────────────────────────────────────────────
    if (!stripeGateway.isEnabled()) {
        return res.status(503).json({
            success: false,
            error: 'PROCESSOR_UNAVAILABLE',
            message: 'Payment processor not configured. Contact your administrator.'
        });
    }

    try {
        // Calculate platform fee
        const feeBreakdown = platformFee.calculate(
            amountNum,
            req.merchant.platformFeePercent,
            currencyCode
        );

        // Create Stripe Payment Intent
        const paymentIntent = await stripeGateway.createPaymentIntent(
            amountNum,
            currencyCode,
            merchantId
        );

        // Record platform fee
        database.db.prepare(`
            INSERT INTO platform_fees (id, transaction_id, merchant_id, gross_amount, fee_percent, fee_amount, merchant_amount, currency)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            `FEE_${Date.now()}`,
            paymentIntent.id,
            merchantId,
            feeBreakdown.grossAmount,
            feeBreakdown.feePercent,
            feeBreakdown.feeAmount,
            feeBreakdown.merchantReceives,
            currencyCode
        );

        auditLogger.logSecurityEvent({
            type: 'v1_charge_intent_created',
            description: `Payment Intent ${paymentIntent.id} created for merchant ${merchantId}`,
            severity: 'info',
            ip: req.ip,
            metadata: {
                merchantId,
                amount: amountNum,
                currency: currencyCode,
                feeAmount: feeBreakdown.feeAmount,
                paymentIntentId: paymentIntent.id
            }
        });

        return res.json({
            success: true,
            mode: 'online',
            paymentIntentId: paymentIntent.id,
            clientSecret: paymentIntent.client_secret,
            amount: amountNum,
            currency: currencyCode,
            fee: {
                percent: feeBreakdown.feePercent,
                amount: feeBreakdown.feeAmount,
                youReceive: feeBreakdown.merchantReceives
            },
            instructions: 'Use clientSecret with Stripe SDK to confirm payment on device'
        });

    } catch (err) {
        console.error('[V1/CHARGE] Error:', err.message);
        return res.status(500).json({
            success: false,
            error: 'CHARGE_FAILED',
            message: err.message
        });
    }
});

module.exports = router;
