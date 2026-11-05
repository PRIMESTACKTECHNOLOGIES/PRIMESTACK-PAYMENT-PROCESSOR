/**
 * Merchant Manager
 * Handles multi-tenant merchant onboarding, key issuance, and management.
 * Each merchant gets their own publishable key and secret key issued by PRIMESTACK.
 */

const crypto = require('crypto');
const database = require('./database');

class MerchantManager {

    /**
     * Generate a PRIMESTACK publishable key
     * Safe to use in Android app / frontend
     */
    generatePublishableKey() {
        return 'ps_pub_' + crypto.randomBytes(24).toString('hex');
    }

    /**
     * Generate a PRIMESTACK secret key
     * Server-side only — never expose in app
     */
    generateSecretKey() {
        return 'ps_sec_' + crypto.randomBytes(32).toString('hex');
    }

    /**
     * Hash a key for secure database storage
     */
    _hashKey(key) {
        return crypto.createHash('sha256').update(key).digest('hex');
    }

    /**
     * Register a new merchant
     * Called by processor owner when onboarding a new customer
     */
    registerMerchant(data) {
        const {
            businessName,
            email,
            country,
            currency = 'USD',
            platformFeePercent = 1.0,
            offlineEnabled = true,
            offlineLimit = 500,        // max single offline transaction
            offlineDailyLimit = 2000,  // max total offline per day
            contactName,
            phone
        } = data;

        if (!businessName || !email) {
            throw new Error('businessName and email are required');
        }

        // Check for duplicate email
        const existing = this.getMerchantByEmail(email);
        if (existing) {
            throw new Error(`Merchant with email ${email} already exists`);
        }

        const merchantId = 'MERCH_' + crypto.randomBytes(8).toString('hex').toUpperCase();
        const publishableKey = this.generatePublishableKey();
        const secretKey = this.generateSecretKey();

        const stmt = database.db.prepare(`
            INSERT INTO ps_merchants (
                id, business_name, email, country, currency,
                platform_fee_percent, offline_enabled, offline_limit,
                offline_daily_limit, contact_name, phone,
                publishable_key_hash, secret_key_hash,
                publishable_key_preview, secret_key_preview,
                status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);

        stmt.run(
            merchantId,
            businessName,
            email,
            country || null,
            currency,
            platformFeePercent,
            offlineEnabled ? 1 : 0,
            offlineLimit,
            offlineDailyLimit,
            contactName || null,
            phone || null,
            this._hashKey(publishableKey),
            this._hashKey(secretKey),
            publishableKey.substring(0, 14) + '...',  // preview only
            secretKey.substring(0, 14) + '...',        // preview only
            'active'
        );

        // Return full keys ONCE — they are never stored in plaintext
        return {
            merchantId,
            businessName,
            email,
            currency,
            platformFeePercent,
            offlineEnabled,
            offlineLimit,
            offlineDailyLimit,
            status: 'active',
            keys: {
                publishableKey,   // ps_pub_xxxx  — give this to merchant for their app
                secretKey,        // ps_sec_xxxx  — give this to merchant for their server
                note: 'Save these keys securely. Secret key will never be shown again.'
            }
        };
    }

    /**
     * Validate a publishable key — used by Android app / frontend
     */
    validatePublishableKey(key) {
        if (!key || !key.startsWith('ps_pub_')) {
            return { isValid: false, reason: 'Invalid publishable key format' };
        }

        const hash = this._hashKey(key);
        const stmt = database.db.prepare(`
            SELECT * FROM ps_merchants 
            WHERE publishable_key_hash = ? AND status = 'active'
        `);
        const merchant = stmt.get(hash);

        if (!merchant) {
            return { isValid: false, reason: 'Key not found or merchant inactive' };
        }

        return {
            isValid: true,
            merchantId: merchant.id,
            businessName: merchant.business_name,
            currency: merchant.currency,
            offlineEnabled: merchant.offline_enabled === 1,
            offlineLimit: merchant.offline_limit,
            offlineDailyLimit: merchant.offline_daily_limit,
            platformFeePercent: merchant.platform_fee_percent
        };
    }

    /**
     * Validate a secret key — used by merchant's server / POS backend
     */
    validateSecretKey(key) {
        if (!key || !key.startsWith('ps_sec_')) {
            return { isValid: false, reason: 'Invalid secret key format' };
        }

        const hash = this._hashKey(key);
        const stmt = database.db.prepare(`
            SELECT * FROM ps_merchants 
            WHERE secret_key_hash = ? AND status = 'active'
        `);
        const merchant = stmt.get(hash);

        if (!merchant) {
            return { isValid: false, reason: 'Key not found or merchant inactive' };
        }

        return {
            isValid: true,
            merchantId: merchant.id,
            businessName: merchant.business_name,
            currency: merchant.currency,
            offlineEnabled: merchant.offline_enabled === 1,
            offlineLimit: merchant.offline_limit,
            offlineDailyLimit: merchant.offline_daily_limit,
            platformFeePercent: merchant.platform_fee_percent
        };
    }

    /**
     * Validate either key type — auto-detects
     */
    validateKey(key) {
        if (!key) return { isValid: false, reason: 'No key provided' };
        if (key.startsWith('ps_pub_')) return this.validatePublishableKey(key);
        if (key.startsWith('ps_sec_')) return this.validateSecretKey(key);
        return { isValid: false, reason: 'Unrecognised key format (must start with ps_pub_ or ps_sec_)' };
    }

    /**
     * Rotate keys for a merchant (generates new pair, invalidates old)
     */
    rotateKeys(merchantId) {
        const merchant = this.getMerchantById(merchantId);
        if (!merchant) throw new Error('Merchant not found');

        const newPublishableKey = this.generatePublishableKey();
        const newSecretKey = this.generateSecretKey();

        const stmt = database.db.prepare(`
            UPDATE ps_merchants
            SET publishable_key_hash = ?,
                secret_key_hash = ?,
                publishable_key_preview = ?,
                secret_key_preview = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        stmt.run(
            this._hashKey(newPublishableKey),
            this._hashKey(newSecretKey),
            newPublishableKey.substring(0, 14) + '...',
            newSecretKey.substring(0, 14) + '...',
            merchantId
        );

        return {
            merchantId,
            keys: {
                publishableKey: newPublishableKey,
                secretKey: newSecretKey,
                note: 'Old keys are now invalid. Update your app and server immediately.'
            }
        };
    }

    /**
     * Get merchant by ID
     */
    getMerchantById(merchantId) {
        const stmt = database.db.prepare('SELECT * FROM ps_merchants WHERE id = ?');
        return stmt.get(merchantId);
    }

    /**
     * Get merchant by email
     */
    getMerchantByEmail(email) {
        const stmt = database.db.prepare('SELECT * FROM ps_merchants WHERE email = ?');
        return stmt.get(email);
    }

    /**
     * List all merchants (admin view — no keys shown)
     */
    listMerchants(filters = {}) {
        let query = `
            SELECT id, business_name, email, country, currency, status,
                   platform_fee_percent, offline_enabled, offline_limit,
                   publishable_key_preview, secret_key_preview,
                   created_at, updated_at
            FROM ps_merchants WHERE 1=1
        `;
        const params = [];

        if (filters.status) {
            query += ' AND status = ?';
            params.push(filters.status);
        }

        query += ' ORDER BY created_at DESC';

        if (filters.limit) {
            query += ' LIMIT ?';
            params.push(filters.limit);
        }

        const stmt = database.db.prepare(query);
        return stmt.all(...params);
    }

    /**
     * Update merchant settings
     */
    updateMerchant(merchantId, updates) {
        const allowed = [
            'business_name', 'country', 'currency', 'platform_fee_percent',
            'offline_enabled', 'offline_limit', 'offline_daily_limit',
            'contact_name', 'phone', 'status'
        ];

        const fields = [];
        const params = [];

        for (const [key, value] of Object.entries(updates)) {
            if (allowed.includes(key)) {
                fields.push(`${key} = ?`);
                params.push(value);
            }
        }

        if (fields.length === 0) return false;

        fields.push('updated_at = CURRENT_TIMESTAMP');
        params.push(merchantId);

        const stmt = database.db.prepare(`
            UPDATE ps_merchants SET ${fields.join(', ')} WHERE id = ?
        `);

        const result = stmt.run(...params);
        return result.changes > 0;
    }

    /**
     * Suspend a merchant (blocks all their transactions)
     */
    suspendMerchant(merchantId, reason = '') {
        const stmt = database.db.prepare(`
            UPDATE ps_merchants 
            SET status = 'suspended', suspend_reason = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        stmt.run(reason, merchantId);
        return { merchantId, status: 'suspended', reason };
    }

    /**
     * Reactivate a suspended merchant
     */
    reactivateMerchant(merchantId) {
        const stmt = database.db.prepare(`
            UPDATE ps_merchants 
            SET status = 'active', suspend_reason = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        stmt.run(merchantId);
        return { merchantId, status: 'active' };
    }

    /**
     * Get merchant stats (transaction counts, volumes)
     */
    getMerchantStats(merchantId) {
        const txnStats = database.db.prepare(`
            SELECT 
                COUNT(*) as total_transactions,
                SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN status = 'Declined' THEN 1 ELSE 0 END) as declined,
                SUM(CASE WHEN status = 'Approved' THEN amount ELSE 0 END) as total_volume,
                SUM(CASE WHEN status = 'Approved' AND settlement_status = 'Settled' 
                    THEN amount ELSE 0 END) as settled_volume,
                AVG(CASE WHEN status = 'Approved' THEN amount END) as avg_transaction
            FROM transactions
            WHERE merchant_account = ?
        `).get(merchantId);

        const offlineStats = database.db.prepare(`
            SELECT 
                COUNT(*) as total_queued,
                SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END) as synced,
                SUM(CASE WHEN sync_status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN sync_status = 'failed' THEN 1 ELSE 0 END) as failed
            FROM offline_queue
            WHERE merchant_id = ?
        `).get(merchantId);

        return {
            merchantId,
            transactions: txnStats,
            offline: offlineStats
        };
    }
}

module.exports = new MerchantManager();
