/**
 * Database Migrations
 * Adds new tables for multi-merchant and offline queue support.
 * Safe to run multiple times — uses IF NOT EXISTS.
 */

function runMigrations(db) {

    // ── ps_merchants — one row per merchant you onboard ──────────────────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS ps_merchants (
            id                      TEXT PRIMARY KEY,
            business_name           TEXT NOT NULL,
            email                   TEXT NOT NULL UNIQUE,
            country                 TEXT,
            currency                TEXT NOT NULL DEFAULT 'USD',
            platform_fee_percent    REAL NOT NULL DEFAULT 1.0,
            offline_enabled         BOOLEAN DEFAULT 1,
            offline_limit           REAL DEFAULT 500,
            offline_daily_limit     REAL DEFAULT 2000,
            contact_name            TEXT,
            phone                   TEXT,
            publishable_key_hash    TEXT NOT NULL UNIQUE,
            secret_key_hash         TEXT NOT NULL UNIQUE,
            publishable_key_preview TEXT,
            secret_key_preview      TEXT,
            status                  TEXT NOT NULL DEFAULT 'active',
            suspend_reason          TEXT,
            created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // ── offline_queue — transactions captured offline by Android/POS ─────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS offline_queue (
            id              TEXT PRIMARY KEY,
            merchant_id     TEXT NOT NULL,
            amount          REAL NOT NULL,
            currency        TEXT NOT NULL DEFAULT 'USD',
            card_last4      TEXT NOT NULL,
            card_brand      TEXT,
            card_expiry     TEXT,
            terminal_id     TEXT,
            offline_ref     TEXT NOT NULL UNIQUE,
            captured_at     TIMESTAMP NOT NULL,
            offline_token   TEXT,
            metadata        TEXT,
            sync_status     TEXT NOT NULL DEFAULT 'pending',
            risk_score      REAL DEFAULT 0,
            transaction_id  TEXT,
            error_message   TEXT,
            synced_at       TIMESTAMP,
            created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (merchant_id) REFERENCES ps_merchants(id)
        )
    `);

    // ── platform_fees — fee record per transaction ────────────────────────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS platform_fees (
            id              TEXT PRIMARY KEY,
            transaction_id  TEXT NOT NULL,
            merchant_id     TEXT NOT NULL,
            gross_amount    REAL NOT NULL,
            fee_percent     REAL NOT NULL,
            fee_amount      REAL NOT NULL,
            merchant_amount REAL NOT NULL,
            currency        TEXT NOT NULL,
            created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // ── settlement_batches — tracks each payout batch to merchants ───────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS settlement_batches (
            id                  TEXT PRIMARY KEY,
            merchant_id         TEXT NOT NULL,
            payout_id           TEXT NOT NULL,
            currency            TEXT NOT NULL,
            transaction_count   INTEGER NOT NULL DEFAULT 0,
            gross_amount        REAL NOT NULL,
            fee_amount          REAL NOT NULL,
            net_amount          REAL NOT NULL,
            status              TEXT NOT NULL DEFAULT 'created',
            notes               TEXT,
            processed_by        TEXT,
            payment_reference   TEXT,
            paid_at             TIMESTAMP,
            created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // ── NFC / Tap payment support ─────────────────────────────────────────────
    // Add entry_mode to the core transactions table (safe if column already exists)
    try {
        db.exec(`ALTER TABLE transactions ADD COLUMN entry_mode TEXT DEFAULT 'manual'`);
        console.log('[MIGRATIONS] Added entry_mode column to transactions');
    } catch (_) { /* column already exists — ignore */ }

    // Add entry_mode to the multi-merchant offline queue as well
    try {
        db.exec(`ALTER TABLE offline_queue ADD COLUMN entry_mode TEXT DEFAULT 'manual'`);
        console.log('[MIGRATIONS] Added entry_mode column to offline_queue');
    } catch (_) { /* column already exists — ignore */ }

    // NFC tap sessions table — tracks active tap interactions from POS terminals
    db.exec(`
        CREATE TABLE IF NOT EXISTS nfc_tap_sessions (
            id              TEXT PRIMARY KEY,
            terminal_id     TEXT,
            device_id       TEXT,
            merchant_id     TEXT,
            entry_mode      TEXT NOT NULL DEFAULT '07',
            card_last4      TEXT,
            card_brand      TEXT,
            amount          REAL,
            currency        TEXT DEFAULT 'USD',
            cryptogram      TEXT,
            transaction_id  TEXT,
            status          TEXT NOT NULL DEFAULT 'pending',
            error_message   TEXT,
            created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at    TIMESTAMP
        )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_nfc_tap_sessions_terminal ON nfc_tap_sessions(terminal_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_nfc_tap_sessions_status ON nfc_tap_sessions(status)`);

    // ── Indexes ───────────────────────────────────────────────────────────────
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ps_merchants_email ON ps_merchants(email)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ps_merchants_status ON ps_merchants(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_offline_queue_merchant ON offline_queue(merchant_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_offline_queue_status ON offline_queue(sync_status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_offline_queue_ref ON offline_queue(offline_ref)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_platform_fees_merchant ON platform_fees(merchant_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_platform_fees_txn ON platform_fees(transaction_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_settlement_batches_merchant ON settlement_batches(merchant_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_settlement_batches_status ON settlement_batches(status)`);

    console.log('[MIGRATIONS] Multi-merchant and offline tables ready');
}

module.exports = { runMigrations };
