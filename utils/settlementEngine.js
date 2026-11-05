/**
 * Settlement Engine
 * Tracks what each merchant is owed after platform fees.
 * Manages settlement batches and payout scheduling.
 *
 * Money flow:
 * Customer pays → YOUR Stripe account receives full amount
 * Settlement engine calculates: gross − platform_fee = merchant_owes
 * You pay merchants via bank transfer (manual or scheduled)
 */

const crypto = require('crypto');
const database = require('./database');

class SettlementEngine {

    /**
     * Get unsettled balance for a merchant (what you owe them)
     * Returns per-currency breakdown
     */
    getMerchantUnsettledBalance(merchantId) {
        const rows = database.db.prepare(`
            SELECT 
                t.currency,
                COUNT(*) as transaction_count,
                SUM(t.amount) as gross_amount,
                COALESCE(SUM(pf.fee_amount), 0) as total_fees,
                SUM(t.amount) - COALESCE(SUM(pf.fee_amount), 0) as net_payable
            FROM transactions t
            LEFT JOIN platform_fees pf ON pf.transaction_id = t.payment_intent_id
            WHERE t.merchant_account = ?
              AND t.status = 'Approved'
              AND t.settlement_status = 'Settled'
            GROUP BY t.currency
        `).all(merchantId);

        return rows;
    }

    /**
     * Get full settlement summary for a merchant
     */
    getMerchantSettlementSummary(merchantId) {
        const unsettled = this.getMerchantUnsettledBalance(merchantId);

        const paidOut = database.db.prepare(`
            SELECT currency, SUM(amount) as total_paid
            FROM payouts
            WHERE merchant_account = ? AND status IN ('Completed', 'Paid Out', 'in_transit', 'paid')
            GROUP BY currency
        `).all(merchantId);

        const pending = database.db.prepare(`
            SELECT currency, SUM(amount) as total_pending
            FROM payouts
            WHERE merchant_account = ? AND status IN ('Pending', 'pending')
            GROUP BY currency
        `).all(merchantId);

        const totalFees = database.db.prepare(`
            SELECT currency, SUM(fee_amount) as total_fees
            FROM platform_fees
            WHERE merchant_id = ?
            GROUP BY currency
        `).all(merchantId);

        return {
            merchantId,
            unsettledBalance: unsettled,
            paidOut,
            pendingPayouts: pending,
            feesCollected: totalFees
        };
    }

    /**
     * Get settlement overview for ALL merchants (processor owner view)
     */
    getAllMerchantsSettlementOverview() {
        const merchants = database.db.prepare(`
            SELECT id, business_name, email, currency FROM ps_merchants WHERE status = 'active'
        `).all();

        const overview = [];
        for (const m of merchants) {
            const balance = this.getMerchantUnsettledBalance(m.id);
            overview.push({
                merchantId: m.id,
                businessName: m.business_name,
                email: m.email,
                defaultCurrency: m.currency,
                unsettledBalance: balance
            });
        }

        return overview;
    }

    /**
     * Get total platform fee revenue (what YOU earned)
     */
    getPlatformFeeRevenue(filters = {}) {
        let query = `
            SELECT 
                currency,
                COUNT(*) as transactions,
                SUM(gross_amount) as total_gross,
                SUM(fee_amount) as total_fees,
                SUM(merchant_amount) as total_merchant_payable,
                AVG(fee_percent) as avg_fee_percent
            FROM platform_fees
            WHERE 1=1
        `;
        const params = [];

        if (filters.startDate) {
            query += ' AND created_at >= ?';
            params.push(filters.startDate);
        }
        if (filters.endDate) {
            query += ' AND created_at <= ?';
            params.push(filters.endDate);
        }
        if (filters.merchantId) {
            query += ' AND merchant_id = ?';
            params.push(filters.merchantId);
        }

        query += ' GROUP BY currency';

        return database.db.prepare(query).all(...params);
    }

    /**
     * Create a settlement payout record for a merchant
     * Call this when you're about to pay the merchant
     */
    createSettlementPayout(merchantId, currency, options = {}) {
        const { notes = '', processedBy = 'admin' } = options;

        // Get all settled, unpaid transactions for this merchant + currency
        const transactions = database.db.prepare(`
            SELECT t.id, t.amount, t.payment_intent_id,
                   COALESCE(pf.fee_amount, 0) as fee,
                   t.amount - COALESCE(pf.fee_amount, 0) as net
            FROM transactions t
            LEFT JOIN platform_fees pf ON pf.transaction_id = t.payment_intent_id
            WHERE t.merchant_account = ?
              AND t.currency = ?
              AND t.status = 'Approved'
              AND t.settlement_status = 'Settled'
        `).all(merchantId, currency);

        if (transactions.length === 0) {
            throw new Error(`No settled transactions found for merchant ${merchantId} in ${currency}`);
        }

        const grossAmount = transactions.reduce((s, t) => s + t.amount, 0);
        const totalFees = transactions.reduce((s, t) => s + t.fee, 0);
        const netPayable = grossAmount - totalFees;
        const transactionIds = transactions.map(t => t.id);

        // Create payout record
        const payout = database.createPayout({
            merchantAccount: merchantId,
            amount: netPayable,
            currency,
            status: 'Pending',
            transactionIds
        });

        // Mark transactions as Paid Out
        const updateStmt = database.db.prepare(`
            UPDATE transactions SET settlement_status = 'Paid Out', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        for (const txn of transactions) {
            updateStmt.run(txn.id);
        }

        // Log settlement batch
        database.db.prepare(`
            INSERT INTO settlement_batches (
                id, merchant_id, payout_id, currency,
                transaction_count, gross_amount, fee_amount, net_amount,
                status, notes, processed_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?, CURRENT_TIMESTAMP)
        `).run(
            `BATCH_${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
            merchantId,
            payout.id,
            currency,
            transactions.length,
            grossAmount,
            totalFees,
            netPayable,
            notes,
            processedBy
        );

        return {
            payoutId: payout.id,
            merchantId,
            currency,
            grossAmount: Math.round(grossAmount * 100) / 100,
            platformFees: Math.round(totalFees * 100) / 100,
            netPayable: Math.round(netPayable * 100) / 100,
            transactionCount: transactions.length,
            status: 'Pending',
            message: `Settlement created. Pay ${netPayable.toFixed(2)} ${currency} to merchant.`
        };
    }

    /**
     * Mark a settlement payout as completed (after you actually send the money)
     */
    markSettlementPaid(payoutId, reference = '') {
        const updated = database.updatePayoutStatus(payoutId, 'Completed');

        if (updated) {
            database.db.prepare(`
                UPDATE settlement_batches
                SET status = 'paid', payment_reference = ?, paid_at = CURRENT_TIMESTAMP
                WHERE payout_id = ?
            `).run(reference, payoutId);
        }

        return updated;
    }

    /**
     * Get settlement batch history
     */
    getSettlementBatches(filters = {}) {
        let query = `
            SELECT sb.*, m.business_name, m.email
            FROM settlement_batches sb
            LEFT JOIN ps_merchants m ON m.id = sb.merchant_id
            WHERE 1=1
        `;
        const params = [];

        if (filters.merchantId) {
            query += ' AND sb.merchant_id = ?';
            params.push(filters.merchantId);
        }
        if (filters.status) {
            query += ' AND sb.status = ?';
            params.push(filters.status);
        }
        if (filters.currency) {
            query += ' AND sb.currency = ?';
            params.push(filters.currency);
        }

        query += ' ORDER BY sb.created_at DESC';

        if (filters.limit) {
            query += ' LIMIT ?';
            params.push(filters.limit);
        }

        return database.db.prepare(query).all(...params);
    }

    /**
     * Get settlement batches for a specific merchant
     */
    getMerchantSettlementBatches(merchantId) {
        return database.db.prepare(`
            SELECT * FROM settlement_batches
            WHERE merchant_id = ?
            ORDER BY created_at DESC
        `).all(merchantId);
    }
}

module.exports = new SettlementEngine();
