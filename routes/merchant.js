/**
 * Merchant Management Routes
 * Used by YOU (the processor owner) to onboard and manage your merchant customers.
 * Protected by your admin API key.
 *
 * POST   /api/merchants/register     — onboard a new merchant
 * GET    /api/merchants              — list all merchants
 * GET    /api/merchants/:id          — get merchant details
 * PUT    /api/merchants/:id          — update merchant settings
 * POST   /api/merchants/:id/rotate-keys  — issue new keys
 * POST   /api/merchants/:id/suspend  — suspend merchant
 * POST   /api/merchants/:id/reactivate — reactivate merchant
 * GET    /api/merchants/:id/stats    — merchant stats
 */

const express = require('express');
const router = express.Router();

const merchantManager = require('../utils/merchantManager');
const auditLogger = require('../utils/auditLogger');
const { authenticateAdmin, requireRole } = require('../middleware/auth');
const { defaultRateLimiter } = require('../middleware/rateLimiter');

// All merchant management routes require your admin key (admin role only)
router.use(authenticateAdmin);
router.use(requireRole('admin'));
router.use(defaultRateLimiter);

// ── POST /api/merchants/register ──────────────────────────────────────────────
router.post('/register', (req, res) => {
    const {
        businessName, email, country, currency,
        platformFeePercent, offlineEnabled, offlineLimit,
        offlineDailyLimit, contactName, phone
    } = req.body;

    if (!businessName || !email) {
        return res.status(400).json({
            success: false,
            message: 'businessName and email are required'
        });
    }

    try {
        const merchant = merchantManager.registerMerchant({
            businessName, email, country, currency,
            platformFeePercent, offlineEnabled, offlineLimit,
            offlineDailyLimit, contactName, phone
        });

        auditLogger.logSecurityEvent({
            type: 'merchant_registered',
            user: req.user?.id,
            description: `New merchant registered: ${businessName} (${email})`,
            severity: 'info',
            ip: req.ip,
            metadata: { merchantId: merchant.merchantId, businessName, email }
        });

        return res.status(201).json({
            success: true,
            message: `Merchant ${businessName} registered successfully`,
            merchant
        });

    } catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
});

// ── GET /api/merchants ────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    const { status, limit } = req.query;
    const merchants = merchantManager.listMerchants({
        status,
        limit: limit ? parseInt(limit) : 100
    });

    return res.json({
        success: true,
        total: merchants.length,
        merchants
    });
});

// ── GET /api/merchants/:id ────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
    const merchant = merchantManager.getMerchantById(req.params.id);

    if (!merchant) {
        return res.status(404).json({ success: false, message: 'Merchant not found' });
    }

    return res.json({ success: true, merchant });
});

// ── PUT /api/merchants/:id ────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
    const allowed = [
        'business_name', 'country', 'currency', 'platform_fee_percent',
        'offline_enabled', 'offline_limit', 'offline_daily_limit',
        'contact_name', 'phone'
    ];

    const updates = {};
    for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const success = merchantManager.updateMerchant(req.params.id, updates);

    if (!success) {
        return res.status(404).json({ success: false, message: 'Merchant not found or no changes made' });
    }

    auditLogger.logSecurityEvent({
        type: 'merchant_updated',
        user: req.user?.id,
        description: `Merchant ${req.params.id} updated`,
        severity: 'info',
        ip: req.ip,
        metadata: { merchantId: req.params.id, updates }
    });

    return res.json({ success: true, message: 'Merchant updated' });
});

// ── POST /api/merchants/:id/rotate-keys ───────────────────────────────────────
router.post('/:id/rotate-keys', (req, res) => {
    try {
        const result = merchantManager.rotateKeys(req.params.id);

        auditLogger.logSecurityEvent({
            type: 'merchant_keys_rotated',
            user: req.user?.id,
            description: `Keys rotated for merchant ${req.params.id}`,
            severity: 'info',
            ip: req.ip,
            metadata: { merchantId: req.params.id }
        });

        return res.json({
            success: true,
            message: 'Keys rotated. Provide new keys to the merchant immediately.',
            ...result
        });

    } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
});

// ── POST /api/merchants/:id/suspend ───────────────────────────────────────────
router.post('/:id/suspend', (req, res) => {
    const { reason } = req.body;
    const result = merchantManager.suspendMerchant(req.params.id, reason);

    auditLogger.logSecurityEvent({
        type: 'merchant_suspended',
        user: req.user?.id,
        description: `Merchant ${req.params.id} suspended. Reason: ${reason || 'not specified'}`,
        severity: 'warning',
        ip: req.ip,
        metadata: { merchantId: req.params.id, reason }
    });

    return res.json({ success: true, ...result });
});

// ── POST /api/merchants/:id/reactivate ────────────────────────────────────────
router.post('/:id/reactivate', (req, res) => {
    const result = merchantManager.reactivateMerchant(req.params.id);

    auditLogger.logSecurityEvent({
        type: 'merchant_reactivated',
        user: req.user?.id,
        description: `Merchant ${req.params.id} reactivated`,
        severity: 'info',
        ip: req.ip,
        metadata: { merchantId: req.params.id }
    });

    return res.json({ success: true, ...result });
});

// ── GET /api/merchants/:id/stats ──────────────────────────────────────────────
router.get('/:id/stats', (req, res) => {
    const stats = merchantManager.getMerchantStats(req.params.id);
    return res.json({ success: true, ...stats });
});

module.exports = router;
