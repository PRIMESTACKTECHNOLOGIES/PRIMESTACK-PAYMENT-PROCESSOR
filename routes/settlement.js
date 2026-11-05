/**
 * Settlement Routes — Admin Only
 * Manage how you pay your merchants their earned funds.
 *
 * GET  /api/settlement/overview          — all merchants balances
 * GET  /api/settlement/revenue           — your platform fee revenue
 * GET  /api/settlement/:merchantId       — single merchant settlement summary
 * POST /api/settlement/:merchantId/pay   — create payout for merchant
 * POST /api/settlement/batches/:id/mark-paid — mark batch as paid
 * GET  /api/settlement/batches           — all settlement batch history
 */

const express = require('express');
const router = express.Router();

const settlementEngine = require('../utils/settlementEngine');
const auditLogger = require('../utils/auditLogger');
const { authenticateAdmin, requireRole } = require('../middleware/auth');
const { defaultRateLimiter } = require('../middleware/rateLimiter');

router.use(authenticateAdmin);
router.use(requireRole('admin'));
router.use(defaultRateLimiter);

// ── GET /api/settlement/overview ──────────────────────────────────────────────
router.get('/overview', (req, res) => {
    const overview = settlementEngine.getAllMerchantsSettlementOverview();
    const revenue = settlementEngine.getPlatformFeeRevenue();

    return res.json({
        success: true,
        merchantCount: overview.length,
        merchants: overview,
        yourRevenue: revenue,
        note: 'netPayable = what you owe each merchant. yourRevenue = what YOU keep.'
    });
});

// ── GET /api/settlement/revenue ───────────────────────────────────────────────
router.get('/revenue', (req, res) => {
    const { startDate, endDate, merchantId } = req.query;
    const revenue = settlementEngine.getPlatformFeeRevenue({ startDate, endDate, merchantId });

    return res.json({
        success: true,
        revenue,
        period: { startDate: startDate || 'all time', endDate: endDate || 'now' }
    });
});

// ── GET /api/settlement/batches ───────────────────────────────────────────────
router.get('/batches', (req, res) => {
    const { status, currency, merchantId, limit } = req.query;
    const batches = settlementEngine.getSettlementBatches({
        status, currency, merchantId,
        limit: limit ? parseInt(limit) : 100
    });

    return res.json({ success: true, total: batches.length, batches });
});

// ── GET /api/settlement/:merchantId ───────────────────────────────────────────
router.get('/:merchantId', (req, res) => {
    const summary = settlementEngine.getMerchantSettlementSummary(req.params.merchantId);
    const batches = settlementEngine.getMerchantSettlementBatches(req.params.merchantId);

    return res.json({ success: true, summary, settlementHistory: batches });
});

// ── POST /api/settlement/:merchantId/pay ──────────────────────────────────────
router.post('/:merchantId/pay', async (req, res) => {
    const { currency, notes } = req.body;

    if (!currency) {
        return res.status(400).json({ success: false, message: 'currency is required' });
    }

    try {
        const result = settlementEngine.createSettlementPayout(
            req.params.merchantId,
            currency.toUpperCase(),
            { notes, processedBy: req.user?.id || 'admin' }
        );

        auditLogger.logSecurityEvent({
            type: 'settlement_payout_created',
            user: req.user?.id,
            description: `Settlement payout created for merchant ${req.params.merchantId}: ${result.netPayable} ${currency}`,
            severity: 'info',
            ip: req.ip,
            metadata: result
        });

        return res.json({ success: true, ...result });

    } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
});

// ── POST /api/settlement/batches/:id/mark-paid ────────────────────────────────
router.post('/batches/:id/mark-paid', (req, res) => {
    const { paymentReference } = req.body;
    const updated = settlementEngine.markSettlementPaid(req.params.id, paymentReference || '');

    if (!updated) {
        return res.status(404).json({ success: false, message: 'Payout not found' });
    }

    auditLogger.logSecurityEvent({
        type: 'settlement_marked_paid',
        user: req.user?.id,
        description: `Payout ${req.params.id} marked as paid. Reference: ${paymentReference || 'none'}`,
        severity: 'info',
        ip: req.ip,
        metadata: { payoutId: req.params.id, paymentReference }
    });

    return res.json({ success: true, message: 'Settlement marked as paid', payoutId: req.params.id });
});

module.exports = router;
