/**
 * POST /api/v1/offline/sync
 * Called by Android app when internet connection is restored.
 * Processes all queued offline transactions through Stripe.
 *
 * Also handles single-transaction queue via POST /api/v1/offline/queue
 */

const express = require('express');
const router = express.Router();

const merchantManager = require('../../utils/merchantManager');
const offlineQueue = require('../../utils/offlineQueue');
const database = require('../../utils/database');
const stripeGateway = require('../../utils/stripeGateway');
const auditLogger = require('../../utils/auditLogger');

/**
 * Middleware: validate merchant key
 */
function requireMerchantKey(req, res, next) {
    const key = req.headers['x-api-key'];

    if (!key) {
        return res.status(401).json({ success: false, error: 'MISSING_KEY', message: 'x-api-key header required' });
    }

    const result = merchantManager.validateKey(key);
    if (!result.isValid) {
        return res.status(401).json({ success: false, error: 'INVALID_KEY', message: result.reason });
    }

    if (!result.offlineEnabled) {
        return res.status(403).json({ success: false, error: 'OFFLINE_DISABLED', message: 'Offline payments not enabled for this account' });
    }

    req.merchant = result;
    next();
}

// ── POST /api/v1/offline/queue ────────────────────────────────────────────────
// Queue a single offline transaction (called immediately when offline)
router.post('/queue', requireMerchantKey, (req, res) => {
    const {
        amount, currency, cardLast4, cardBrand,
        cardExpiry, terminalId, offlineRef, capturedAt,
        offlineToken, metadata
    } = req.body;

    if (!amount || !cardLast4 || !offlineRef) {
        return res.status(400).json({
            success: false,
            error: 'MISSING_FIELDS',
            message: 'amount, cardLast4 and offlineRef are required'
        });
    }

    const amountNum = parseFloat(amount);

    // Check single transaction limit
    if (amountNum > req.merchant.offlineLimit) {
        return res.status(400).json({
            success: false,
            error: 'OFFLINE_LIMIT_EXCEEDED',
            message: `Single offline transaction limit is ${req.merchant.offlineLimit}`,
            limit: req.merchant.offlineLimit
        });
    }

    // Check daily limit
    const limitCheck = offlineQueue.checkDailyLimit(
        req.merchant.merchantId,
        amountNum,
        req.merchant.offlineDailyLimit
    );

    if (!limitCheck.allowed) {
        return res.status(400).json({
            success: false,
            error: 'DAILY_LIMIT_EXCEEDED',
            message: `Daily offline limit exceeded. Remaining: ${limitCheck.remaining}`,
            remaining: limitCheck.remaining
        });
    }

    try {
        const result = offlineQueue.queueTransaction(req.merchant.merchantId, {
            amount: amountNum,
            currency: (currency || req.merchant.currency || 'USD').toUpperCase(),
            cardLast4,
            cardBrand,
            cardExpiry,
            terminalId,
            offlineRef,
            capturedAt: capturedAt || new Date().toISOString(),
            offlineToken,
            metadata: metadata || {}
        });

        return res.json({
            success: true,
            ...result
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            error: 'QUEUE_FAILED',
            message: err.message
        });
    }
});

// ── POST /api/v1/offline/sync ─────────────────────────────────────────────────
// Sync all pending offline transactions (called when back online)
router.post('/sync', requireMerchantKey, async (req, res) => {
    const merchantId = req.merchant.merchantId;

    try {
        // Check how many are pending first
        const pending = offlineQueue.getPendingByMerchant(merchantId);

        if (pending.length === 0) {
            return res.json({
                success: true,
                message: 'No pending transactions to sync',
                processed: 0
            });
        }

        auditLogger.logSecurityEvent({
            type: 'offline_sync_started',
            description: `Merchant ${merchantId} syncing ${pending.length} offline transactions`,
            severity: 'info',
            ip: req.ip,
            metadata: { merchantId, pendingCount: pending.length }
        });

        const results = await offlineQueue.processPendingForMerchant(
            merchantId,
            stripeGateway,
            database,
            auditLogger
        );

        auditLogger.logSecurityEvent({
            type: 'offline_sync_complete',
            description: `Merchant ${merchantId} sync complete: ${results.approved} approved, ${results.declined} declined`,
            severity: 'info',
            ip: req.ip,
            metadata: { merchantId, ...results }
        });

        return res.json({
            success: true,
            message: `Sync complete. ${results.approved} approved, ${results.declined} declined.`,
            ...results
        });

    } catch (err) {
        console.error('[SYNC] Error:', err.message);
        return res.status(500).json({
            success: false,
            error: 'SYNC_FAILED',
            message: err.message
        });
    }
});

// ── GET /api/v1/offline/pending ───────────────────────────────────────────────
// Check pending queue (Android app can show this to merchant)
router.get('/pending', requireMerchantKey, (req, res) => {
    const pending = offlineQueue.getPendingByMerchant(req.merchant.merchantId);
    const exposure = offlineQueue.getPendingExposure(req.merchant.merchantId);

    return res.json({
        success: true,
        merchantId: req.merchant.merchantId,
        pendingCount: pending.length,
        exposure,
        transactions: pending.map(p => ({
            queueId: p.id,
            offlineRef: p.offline_ref,
            amount: p.amount,
            currency: p.currency,
            cardLast4: p.card_last4,
            cardBrand: p.card_brand,
            capturedAt: p.captured_at,
            terminalId: p.terminal_id
        }))
    });
});

// ── GET /api/v1/offline/history ───────────────────────────────────────────────
// Full sync history
router.get('/history', requireMerchantKey, (req, res) => {
    const { status, limit } = req.query;

    const history = offlineQueue.getQueueHistory(
        req.merchant.merchantId,
        { status, limit: limit ? parseInt(limit) : 50 }
    );

    return res.json({
        success: true,
        total: history.length,
        transactions: history
    });
});

module.exports = router;
