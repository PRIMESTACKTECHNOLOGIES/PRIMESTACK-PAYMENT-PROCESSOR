/**
 * GET /api/v1/status
 * Health check for Android app — tells the app if processor is reachable.
 * Android app should call this every 30 seconds to detect offline state.
 *
 * GET /api/v1/balance  — merchant balance
 * GET /api/v1/account  — merchant account info
 */

const express = require('express');
const router = express.Router();

const merchantManager = require('../../utils/merchantManager');
const offlineQueue = require('../../utils/offlineQueue');
const database = require('../../utils/database');
const stripeGateway = require('../../utils/stripeGateway');

function optionalMerchantKey(req, res, next) {
    const key = req.headers['x-api-key'];
    if (key) {
        const result = merchantManager.validateKey(key);
        if (result.isValid) req.merchant = result;
    }
    next();
}

function requireMerchantKey(req, res, next) {
    const key = req.headers['x-api-key'];
    if (!key) return res.status(401).json({ success: false, error: 'MISSING_KEY' });
    const result = merchantManager.validateKey(key);
    if (!result.isValid) return res.status(401).json({ success: false, error: 'INVALID_KEY', message: result.reason });
    req.merchant = result;
    next();
}

// ── GET /api/v1/status ────────────────────────────────────────────────────────
// Public endpoint — Android app pings this to check connectivity
router.get('/', optionalMerchantKey, (req, res) => {
    const response = {
        success: true,
        processor: 'PRIMESTACK',
        version: '1.0.0',
        status: 'online',
        timestamp: new Date().toISOString(),
        stripeEnabled: stripeGateway.isEnabled(),
        supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'HKD', 'JPY', 'MYR', 'INR', 'AED', 'SAR'],
        offlineSupported: true
    };

    // If authenticated, add merchant-specific info
    if (req.merchant) {
        response.merchant = {
            merchantId: req.merchant.merchantId,
            businessName: req.merchant.businessName,
            currency: req.merchant.currency,
            offlineEnabled: req.merchant.offlineEnabled,
            offlineLimit: req.merchant.offlineLimit,
            offlineDailyLimit: req.merchant.offlineDailyLimit
        };

        // Show pending offline count
        const pending = offlineQueue.getPendingByMerchant(req.merchant.merchantId);
        response.pendingOfflineCount = pending.length;
    }

    return res.json(response);
});

// ── GET /api/v1/account ───────────────────────────────────────────────────────
router.get('/account', requireMerchantKey, (req, res) => {
    const merchant = merchantManager.getMerchantById(req.merchant.merchantId);
    if (!merchant) return res.status(404).json({ success: false, error: 'MERCHANT_NOT_FOUND' });

    const stats = merchantManager.getMerchantStats(req.merchant.merchantId);

    return res.json({
        success: true,
        merchantId: merchant.id,
        businessName: merchant.business_name,
        email: merchant.email,
        country: merchant.country,
        currency: merchant.currency,
        status: merchant.status,
        offlineEnabled: merchant.offline_enabled === 1,
        offlineLimit: merchant.offline_limit,
        offlineDailyLimit: merchant.offline_daily_limit,
        platformFeePercent: merchant.platform_fee_percent,
        publishableKeyPreview: merchant.publishable_key_preview,
        stats: stats.transactions,
        offlineStats: stats.offline
    });
});

// ── GET /api/v1/balance ───────────────────────────────────────────────────────
router.get('/balance', requireMerchantKey, async (req, res) => {
    const merchantId = req.merchant.merchantId;

    // Get from local DB
    const localStats = database.db.prepare(`
        SELECT 
            SUM(CASE WHEN status = 'Approved' THEN amount ELSE 0 END) as total_approved,
            SUM(CASE WHEN status = 'Approved' AND settlement_status = 'Settled' THEN amount ELSE 0 END) as settled,
            SUM(CASE WHEN status = 'Approved' AND settlement_status = 'Paid Out' THEN amount ELSE 0 END) as paid_out,
            currency
        FROM transactions
        WHERE merchant_account = ?
        GROUP BY currency
    `).all(merchantId);

    // Get platform fees charged
    const feesCharged = database.db.prepare(`
        SELECT SUM(fee_amount) as total_fees, currency
        FROM platform_fees
        WHERE merchant_id = ?
        GROUP BY currency
    `).all(merchantId);

    let stripeBalance = null;
    if (stripeGateway.isEnabled()) {
        try {
            const balance = await stripeGateway.getBalance();
            stripeBalance = {
                available: balance.available,
                pending: balance.pending
            };
        } catch (e) {
            // Non-fatal
        }
    }

    return res.json({
        success: true,
        merchantId,
        localBalance: localStats,
        feesCharged,
        stripeBalance,
        note: 'localBalance reflects transactions processed through PRIMESTACK'
    });
});

// ── GET /api/v1/transactions ──────────────────────────────────────────────────
router.get('/transactions', requireMerchantKey, (req, res) => {
    const { limit = 50, status, startDate, endDate } = req.query;

    const txns = database.getTransactions({
        merchantAccount: req.merchant.merchantId,
        status,
        startDate,
        endDate,
        limit: parseInt(limit)
    });

    return res.json({
        success: true,
        total: txns.length,
        transactions: txns
    });
});

module.exports = router;
