
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * Database Integration Module
 * Uses SQLite for development, can be easily switched to PostgreSQL/MySQL
 */
class PaymentDatabase {
    constructor(dbPath = null) {
        let dataDir;

        const isServerless = !!(
            process.env.NETLIFY ||
            process.env.VERCEL ||
            process.env.AWS_LAMBDA_FUNCTION_NAME
        );

        if (process.env.DATA_DIR) {
            // Explicit persistent location (recommended for production).
            dataDir = process.env.DATA_DIR;
        } else if (isServerless) {
            // Serverless filesystems are ephemeral — data does NOT survive restarts.
            // Point DATA_DIR at a persistent mount (or use an external DB) in production.
            dataDir = path.join('/tmp', 'payment-processor');
            console.warn('[DATABASE] ⚠️  Using ephemeral /tmp storage (serverless). Data will NOT persist across restarts. Set DATA_DIR to a persistent path.');
        } else {
            dataDir = path.join(__dirname, '..', 'data');
        }
        
        // Ensure data directory exists
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Initialize database
        this.dbPath = dbPath || path.join(dataDir, 'payments.db');
        this.db = new Database(this.dbPath);
        
        // Enable foreign keys and WAL mode for better performance
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('journal_mode = WAL');
        
        console.log(`[DATABASE] Connected to: ${this.dbPath}`);
        
        // Initialize tables
        this._initializeTables();
    }

    /**
     * Create database tables if they don't exist
     * @private
     */
    _initializeTables() {
        // Transactions table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                card_type TEXT NOT NULL,
                last_four TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'USD',
                status TEXT NOT NULL,
                response_code TEXT,
                settlement_status TEXT DEFAULT 'N/A',
                merchant_account TEXT,
                payment_intent_id TEXT,
                gateway_provider TEXT DEFAULT 'mock',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                processing_time_ms INTEGER,
                gpu_processed BOOLEAN DEFAULT 0,
                encrypted BOOLEAN DEFAULT 0
            )
        `);

        // Merchants table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS merchants (
                id TEXT PRIMARY KEY,
                account_number TEXT NOT NULL UNIQUE,
                iban TEXT,
                swift TEXT,
                bank_name TEXT,
                account_holder TEXT,
                merchant_name TEXT NOT NULL,
                auto_payout BOOLEAN DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // API Keys table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS api_keys (
                id TEXT PRIMARY KEY,
                key_hash TEXT NOT NULL UNIQUE,
                user_id TEXT NOT NULL,
                metadata TEXT,
                active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP
            )
        `);

        // Sessions table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                roles TEXT,
                mfa_verified BOOLEAN DEFAULT 0,
                ip TEXT,
                user_agent TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL
            )
        `);

        // Payouts table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS payouts (
                id TEXT PRIMARY KEY,
                merchant_account TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'USD',
                status TEXT NOT NULL DEFAULT 'Pending',
                bank_name TEXT,
                iban TEXT,
                swift TEXT,
                account_holder TEXT,
                transaction_ids TEXT,
                stripe_payout_id TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Audit Log table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                user_id TEXT,
                action TEXT,
                details TEXT,
                severity TEXT NOT NULL DEFAULT 'info',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for performance
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at)`);
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant_account)`);
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status)`);
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)`);
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_payouts_merchant ON payouts(merchant_account)`);
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_payouts_created ON payouts(created_at)`);
        
        console.log('[DATABASE] Tables initialized successfully');
    }

    /**
     * Insert a new transaction
     * @param {Object} transaction - Transaction data
     * @returns {Object} Inserted transaction
     */
    insertTransaction(transaction) {
        // Try inserting with entry_mode; fall back gracefully if the column doesn't exist yet
        // (the migration adds it at startup, but tests may run against a fresh DB)
        let stmt;
        try {
            stmt = this.db.prepare(`
                INSERT INTO transactions (
                    id, card_type, last_four, amount, currency, status,
                    response_code, settlement_status, merchant_account,
                    payment_intent_id, gateway_provider, processing_time_ms,
                    gpu_processed, encrypted, entry_mode
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                transaction.id,
                transaction.cardType,
                transaction.lastFour,
                transaction.amount,
                transaction.currency || 'USD',
                transaction.status,
                transaction.responseCode || null,
                transaction.settlementStatus || 'N/A',
                transaction.merchantAccount || null,
                transaction.paymentIntentId || null,
                transaction.gatewayProvider || 'mock',
                transaction.processingTimeMs || null,
                transaction.gpuProcessed ? 1 : 0,
                transaction.encrypted ? 1 : 0,
                transaction.entryMode || 'manual'
            );
        } catch (_) {
            // Column may not exist on first boot before migrations run — insert without it
            stmt = this.db.prepare(`
                INSERT INTO transactions (
                    id, card_type, last_four, amount, currency, status,
                    response_code, settlement_status, merchant_account,
                    payment_intent_id, gateway_provider, processing_time_ms,
                    gpu_processed, encrypted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                transaction.id,
                transaction.cardType,
                transaction.lastFour,
                transaction.amount,
                transaction.currency || 'USD',
                transaction.status,
                transaction.responseCode || null,
                transaction.settlementStatus || 'N/A',
                transaction.merchantAccount || null,
                transaction.paymentIntentId || null,
                transaction.gatewayProvider || 'mock',
                transaction.processingTimeMs || null,
                transaction.gpuProcessed ? 1 : 0,
                transaction.encrypted ? 1 : 0
            );
        }

        return this.getTransaction(transaction.id);
    }

    /**
     * Get a transaction by ID
     * @param {string} id - Transaction ID
     * @returns {Object|null} Transaction or null
     */
    getTransaction(id) {
        const stmt = this.db.prepare('SELECT * FROM transactions WHERE id = ?');
        const row = stmt.get(id);
        
        if (!row) return null;
        
        return this._formatTransaction(row);
    }

    /**
     * Get all transactions with optional filters
     * @param {Object} filters - Filter options
     * @returns {Array<Object>} List of transactions
     */
    getTransactions(filters = {}) {
        let query = 'SELECT * FROM transactions WHERE 1=1';
        const params = [];

        if (filters.merchantAccount) {
            query += ' AND merchant_account = ?';
            params.push(filters.merchantAccount);
        }

        if (filters.status) {
            query += ' AND status = ?';
            params.push(filters.status);
        }

        if (filters.startDate) {
            query += ' AND created_at >= ?';
            params.push(filters.startDate);
        }

        if (filters.endDate) {
            query += ' AND created_at <= ?';
            params.push(filters.endDate);
        }

        query += ' ORDER BY created_at DESC';

        if (filters.limit) {
            query += ' LIMIT ?';
            params.push(filters.limit);
        }

        const stmt = this.db.prepare(query);
        const rows = stmt.all(...params);

        return rows.map(row => this._formatTransaction(row));
    }

    /**
     * Update transaction status
     * @param {string} id - Transaction ID
     * @param {Object} updates - Fields to update
     * @returns {boolean} Success
     */
    updateTransaction(id, updates) {
        const fields = [];
        const params = [];

        if (updates.status !== undefined) {
            fields.push('status = ?');
            params.push(updates.status);
        }
        if (updates.settlementStatus !== undefined) {
            fields.push('settlement_status = ?');
            params.push(updates.settlementStatus);
        }
        if (updates.responseCode !== undefined) {
            fields.push('response_code = ?');
            params.push(updates.responseCode);
        }
        if (updates.paymentIntentId !== undefined) {
            fields.push('payment_intent_id = ?');
            params.push(updates.paymentIntentId);
        }

        if (fields.length === 0) return false;

        fields.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id);

        const stmt = this.db.prepare(`
            UPDATE transactions 
            SET ${fields.join(', ')} 
            WHERE id = ?
        `);

        const result = stmt.run(...params);
        return result.changes > 0;
    }

    /**
     * Format database row to transaction object
     * @private
     */
    _formatTransaction(row) {
        return {
            id: row.id,
            cardType: row.card_type,
            lastFour: row.last_four,
            amount: row.amount,
            currency: row.currency,
            status: row.status,
            responseCode: row.response_code,
            settlementStatus: row.settlement_status,
            merchantAccount: row.merchant_account,
            paymentIntentId: row.payment_intent_id,
            gatewayProvider: row.gateway_provider,
            timestamp: row.created_at,
            processingTimeMs: row.processing_time_ms,
            gpuProcessed: row.gpu_processed === 1,
            encrypted: row.encrypted === 1,
            entryMode: row.entry_mode || 'manual',
            isContactless: ['07', '91', '10'].includes(row.entry_mode)
        };
    }

    /**
     * Get merchant by account number
     * @param {string} accountNumber - Merchant account number
     * @returns {Object|null} Merchant or null
     */
    getMerchant(accountNumber) {
        const stmt = this.db.prepare('SELECT * FROM merchants WHERE account_number = ?');
        return stmt.get(accountNumber);
    }

    /**
     * Insert or update merchant
     * @param {Object} merchant - Merchant data
     * @returns {Object} Merchant
     */
    upsertMerchant(merchant) {
        const existing = this.getMerchant(merchant.accountNumber);
        
        if (existing) {
            const stmt = this.db.prepare(`
                UPDATE merchants 
                SET iban = ?, swift = ?, bank_name = ?, account_holder = ?, 
                    merchant_name = ?, auto_payout = ?, updated_at = CURRENT_TIMESTAMP
                WHERE account_number = ?
            `);
            stmt.run(
                merchant.iban || null,
                merchant.swift || null,
                merchant.bankName || null,
                merchant.accountHolder || null,
                merchant.merchantName,
                merchant.autoPayout ? 1 : 0,
                merchant.accountNumber
            );
        } else {
            const stmt = this.db.prepare(`
                INSERT INTO merchants (
                    id, account_number, iban, swift, bank_name, 
                    account_holder, merchant_name, auto_payout
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
                `MERCH_${Date.now()}`,
                merchant.accountNumber,
                merchant.iban || null,
                merchant.swift || null,
                merchant.bankName || null,
                merchant.accountHolder || null,
                merchant.merchantName,
                merchant.autoPayout ? 1 : 0
            );
        }

        return this.getMerchant(merchant.accountNumber);
    }

    /**
     * Log an audit event
     * @param {Object} event - Audit event data
     */
    logAuditEvent(event) {
        const stmt = this.db.prepare(`
            INSERT INTO audit_log (id, event_type, user_id, action, details, severity)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            `AUDIT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            event.eventType,
            event.userId || null,
            event.action || null,
            event.details ? JSON.stringify(event.details) : null,
            event.severity || 'info'
        );
    }

    /**
     * Create a new payout
     * @param {Object} payout - Payout data
     * @returns {Object} Created payout
     */
    createPayout(payout) {
        const stmt = this.db.prepare(`
            INSERT INTO payouts (
                id, merchant_account, amount, currency, status,
                bank_name, iban, swift, account_holder, transaction_ids,
                stripe_payout_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const payoutId = `PAYOUT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        stmt.run(
            payoutId,
            payout.merchantAccount,
            payout.amount,
            payout.currency || 'USD',
            payout.status || 'Pending',
            payout.bankName || null,
            payout.iban || null,
            payout.swift || null,
            payout.accountHolder || null,
            payout.transactionIds ? JSON.stringify(payout.transactionIds) : null,
            payout.stripePayoutId || null
        );
        
        return this.getPayout(payoutId);
    }

    /**
     * Get a payout by ID
     * @param {string} id - Payout ID
     * @returns {Object|null} Payout or null
     */
    getPayout(id) {
        const stmt = this.db.prepare('SELECT * FROM payouts WHERE id = ?');
        const row = stmt.get(id);
        
        if (!row) return null;
        
        return this._formatPayout(row);
    }

    /**
     * Get all payouts with optional filters
     * @param {Object} filters - Filter options
     * @returns {Array<Object>} List of payouts
     */
    getPayouts(filters = {}) {
        let query = 'SELECT * FROM payouts WHERE 1=1';
        const params = [];

        if (filters.merchantAccount) {
            query += ' AND merchant_account = ?';
            params.push(filters.merchantAccount);
        }

        if (filters.status) {
            query += ' AND status = ?';
            params.push(filters.status);
        }

        if (filters.startDate) {
            query += ' AND created_at >= ?';
            params.push(filters.startDate);
        }

        if (filters.endDate) {
            query += ' AND created_at <= ?';
            params.push(filters.endDate);
        }

        query += ' ORDER BY created_at DESC';

        if (filters.limit) {
            query += ' LIMIT ?';
            params.push(filters.limit);
        }

        const stmt = this.db.prepare(query);
        const rows = stmt.all(...params);

        return rows.map(row => this._formatPayout(row));
    }

    /**
     * Update payout status
     * @param {string} id - Payout ID
     * @param {string} status - New status
     * @returns {boolean} Success
     */
    updatePayoutStatus(id, status) {
        const stmt = this.db.prepare(`
            UPDATE payouts 
            SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        const result = stmt.run(status, id);
        return result.changes > 0;
    }

    /**
     * Format database row to payout object
     * @private
     */
    _formatPayout(row) {
        return {
            id: row.id,
            merchantAccount: row.merchant_account,
            amount: row.amount,
            currency: row.currency,
            status: row.status,
            bankName: row.bank_name,
            iban: row.iban,
            swift: row.swift,
            accountHolder: row.account_holder,
            transactionIds: row.transaction_ids ? JSON.parse(row.transaction_ids) : [],
            stripePayoutId: row.stripe_payout_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    /**
     * Close database connection
     */
    close() {
        this.db.close();
        console.log('[DATABASE] Connection closed');
    }
}

module.exports = new PaymentDatabase();
