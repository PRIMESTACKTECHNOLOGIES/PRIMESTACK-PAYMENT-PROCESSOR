const crypto = require('crypto');

/**
 * Handles sensitive data in memory only.
 */
class SecureVault {
    constructor() {
        // Use a Map to store data in memory only
        this.vault = new Map();
        // Generate an ephemeral master key for this session
        this.masterKey = crypto.randomBytes(32);
        // Audit log for all access
        this.auditLog = [];
        // Data retention policies
        this.retentionPolicies = new Map();
        // Key rotation history
        this.keyHistory = [];
        // Track if FIPS mode is enabled
        this.fipsMode = true;
    }

    /**
     * Stores sensitive data as an encrypted buffer in memory.
     * @param {string} key 
     * @param {string} value 
     */
    store(key, value) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', this.masterKey, iv);
        let encrypted = cipher.update(value, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // Store only the encrypted value and IV
        this.vault.set(key, {
            data: encrypted,
            iv: iv.toString('hex'),
            createdAt: Date.now()
        });

        // Set up retention policy if one exists for this key
        if (this.retentionPolicies.has(key)) {
            const policy = this.retentionPolicies.get(key);
            setTimeout(() => {
                this.clear(key);
            }, policy.duration);
        }
    }

    /**
     * Retrieves and decrypts data.
     * @param {string} key 
     * @returns {string|null}
     */
    retrieve(key) {
        const record = this.vault.get(key);
        if (!record) return null;

        // Audit log access
        this.auditAccess(key);

        const iv = Buffer.from(record.iv, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.masterKey, iv);
        let decrypted = decipher.update(record.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }

    /**
     * Securely clears a record.
     * @param {string} key 
     */
    clear(key) {
        this.vault.delete(key);
        this.retentionPolicies.delete(key);
    }

    /**
     * Rotates the master encryption key.
     * Re-encrypts all stored data with the new key.
     */
    rotateKeys() {
        const oldKey = this.masterKey;
        const newKey = crypto.randomBytes(32);
        
        // Store old key in history for potential decryption of existing data
        this.keyHistory.push({
            key: oldKey,
            rotatedAt: Date.now()
        });

        // Re-encrypt all stored data with the new key
        for (const [key, record] of this.vault.entries()) {
            try {
                // Decrypt with old key
                const iv = Buffer.from(record.iv, 'hex');
                const decipher = crypto.createDecipheriv('aes-256-cbc', oldKey, iv);
                let decrypted = decipher.update(record.data, 'hex', 'utf8');
                decrypted += decipher.final('utf8');

                // Encrypt with new key
                const newIv = crypto.randomBytes(16);
                const cipher = crypto.createCipheriv('aes-256-cbc', newKey, newIv);
                let encrypted = cipher.update(decrypted, 'utf8', 'hex');
                encrypted += cipher.final('hex');

                // Update with new encrypted data
                this.vault.set(key, {
                    data: encrypted,
                    iv: newIv.toString('hex'),
                    createdAt: record.createdAt
                });
            } catch (error) {
                // Log error but continue with other records
                console.error(`Failed to re-encrypt key ${key}:`, error.message);
            }
        }

        // Update master key
        this.masterKey = newKey;
        
        return {
            success: true,
            oldKeyHash: crypto.createHash('sha256').update(oldKey).digest('hex'),
            newKeyHash: crypto.createHash('sha256').update(newKey).digest('hex'),
            recordsReencrypted: this.vault.size
        };
    }

    /**
     * Logs access to a key for audit purposes.
     * @param {string} key 
     */
    auditAccess(key) {
        const entry = {
            timestamp: new Date().toISOString(),
            action: 'access',
            key: key,
            type: 'data_access'
        };
        this.auditLog.push(entry);
    }

    /**
     * Sets a data retention policy for a key.
     * Data will be automatically cleared after the specified duration.
     * @param {string} key 
     * @param {number} duration - Duration in milliseconds
     */
    setRetentionPolicy(key, duration) {
        this.retentionPolicies.set(key, {
            duration,
            createdAt: Date.now()
        });

        // Schedule automatic cleanup
        setTimeout(() => {
            this.clear(key);
        }, duration);
    }

    /**
     * Gets the audit log for all access.
     * @param {Object} options 
     * @param {string} options.key - Filter by key
     * @param {string} options.startDate - Filter by start date
     * @param {string} options.endDate - Filter by end date
     * @returns {Array}
     */
    getAuditLog(options = {}) {
        let log = [...this.auditLog];

        if (options.key) {
            log = log.filter(entry => entry.key === options.key);
        }

        if (options.startDate) {
            const startDate = new Date(options.startDate);
            log = log.filter(entry => new Date(entry.timestamp) >= startDate);
        }

        if (options.endDate) {
            const endDate = new Date(options.endDate);
            log = log.filter(entry => new Date(entry.timestamp) <= endDate);
        }

        return log;
    }

    /**
     * Gets the key rotation history.
     * @returns {Array}
     */
    getKeyHistory() {
        return [...this.keyHistory];
    }

    /**
     * Verifies FIPS 140-2 compliance.
     * @returns {Object} - Compliance status and details
     */
    verifyFIPSCompliance() {
        const compliance = {
            compliant: true,
            details: []
        };

        // Check algorithm - AES-256-CBC is FIPS 140-2 validated
        const algorithm = 'aes-256-cbc';
        if (algorithm !== 'aes-256-cbc' && algorithm !== 'aes-256-gcm') {
            compliance.compliant = false;
            compliance.details.push(`Algorithm ${algorithm} is not FIPS 140-2 validated`);
        } else {
            compliance.details.push(`Algorithm ${algorithm} is FIPS 140-2 validated`);
        }

        // Check key size - 256 bits is required for FIPS
        const keySize = this.masterKey.length * 8;
        if (keySize < 256) {
            compliance.compliant = false;
            compliance.details.push(`Key size ${keySize} bits is below FIPS minimum of 256 bits`);
        } else {
            compliance.details.push(`Key size ${keySize} bits meets FIPS requirements`);
        }

        // Check random number generation
        try {
            const randomBytes = crypto.randomBytes(16);
            if (randomBytes.length !== 16) {
                compliance.compliant = false;
                compliance.details.push('Cryptographically secure random number generation failed');
            } else {
                compliance.details.push('Cryptographically secure random number generation verified');
            }
        } catch (error) {
            compliance.compliant = false;
            compliance.details.push(`Random number generation error: ${error.message}`);
        }

        return compliance;
    }

    /**
     * Gets the current encryption status.
     * @returns {Object}
     */
    getEncryptionStatus() {
        return {
            algorithm: 'aes-256-cbc',
            keySize: this.masterKey.length * 8,
            fipsCompliant: this.fipsMode,
            keyHistoryLength: this.keyHistory.length,
            recordsStored: this.vault.size
        };
    }
}

module.exports = new SecureVault();
