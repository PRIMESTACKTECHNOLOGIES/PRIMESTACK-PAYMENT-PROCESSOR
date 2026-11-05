const crypto = require('crypto');
const db = require('./database');

/**
 * Authentication service with API key validation, session management,
 * MFA support, lockout protection, and role-based access control.
 *
 * API keys are NEVER stored or compared in plaintext: only SHA-256 hashes
 * are retained in memory and in the database.
 */
class AuthService {
    constructor() {
        // API keys storage: Map<keyHash, { keyHash, keyPreview, userId, createdAt, expiresAt, metadata, active }>
        this.apiKeys = new Map();

        // Sessions storage: Map<sessionId, { userId, createdAt, expiresAt, mfaVerified, metadata }>
        this.sessions = new Map();

        // MFA codes storage: Map<userId, { code, createdAt, expiresAt, attempts }>
        this.mfaCodes = new Map();

        // Verified MFA grants: Map<grantToken, { userId, expiresAt }>
        this.mfaGrants = new Map();

        // Failed authentication attempts / lockout state: Map<identifier, { count, lockedUntil }>
        this.authFailures = new Map();

        // Access control roles: Map<role, { resources: Map<resource, Set<actions>> }>
        this.roles = new Map();

        // Session timeout in milliseconds (default: 1 hour)
        this.sessionTimeout = 3600000;

        // MFA code validity in milliseconds (default: 10 minutes)
        this.mfaCodeValidity = 600000;

        // Lockout: block an identifier after N failed attempts for a cooldown period
        this.lockoutThreshold = parseInt(process.env.AUTH_LOCKOUT_THRESHOLD || '5', 10);
        this.lockoutDuration = parseInt(process.env.AUTH_LOCKOUT_DURATION_MS || '900000', 10);

        // Initialize default roles
        this.initializeRoles();

        // Initialize default API keys
        this.initializeDefaultAPIKeys();
    }

    /**
     * Initialize default API keys for admin and merchant.
     */
    initializeDefaultAPIKeys() {
        const adminApiKey = process.env.ADMIN_API_KEY;
        if (adminApiKey) {
            this.storeAPIKey(adminApiKey, 'admin', {
                roles: ['admin'],
                username: 'Admin'
            });
        }
    }

    /**
     * Initialize default roles for access control.
     */
    initializeRoles() {
        // Admin role - full access
        this.roles.set('admin', {
            resources: new Map([
                ['transactions', new Set(['read', 'write', 'delete', 'approve', 'settle'])],
                ['users', new Set(['read', 'write', 'delete', 'manage'])],
                ['settings', new Set(['read', 'write'])],
                ['audit', new Set(['read'])],
                ['gpu', new Set(['read', 'write', 'manage'])],
                ['security', new Set(['read', 'write', 'manage'])]
            ])
        });

        // Merchant role - limited access to own transactions
        this.roles.set('merchant', {
            resources: new Map([
                ['transactions', new Set(['read', 'write'])],
                ['settings', new Set(['read'])],
                ['audit', new Set(['read'])]
            ])
        });

        // User role - basic access
        this.roles.set('user', {
            resources: new Map([
                ['transactions', new Set(['read'])]
            ])
        });

        // Support role - limited support access
        this.roles.set('support', {
            resources: new Map([
                ['users', new Set(['read'])],
                ['transactions', new Set(['read'])],
                ['audit', new Set(['read'])]
            ])
        });
    }

    /**
     * Set session timeout in milliseconds.
     * @param {number} timeout - Session timeout in milliseconds
     */
    setSessionTimeout(timeout) {
        this.sessionTimeout = timeout;
    }

    /**
     * Set MFA code validity in milliseconds.
     * @param {number} validity - MFA code validity in milliseconds
     */
    setMFAValidity(validity) {
        this.mfaCodeValidity = validity;
    }

    /**
     * Generate a cryptographically secure API key.
     * @returns {string} The generated API key
     */
    generateAPIKey() {
        const key = crypto.randomBytes(32).toString('hex');
        return key;
    }

    /**
     * Hash an API key for secure storage
     * @param {string} key - The API key to hash
     * @returns {string} Hashed key
     */
    _hashKey(key) {
        return crypto.createHash('sha256').update(key).digest('hex');
    }

    /**
     * Build a non-sensitive preview of a key (for display only).
     * @param {string} key - The plaintext key
     * @returns {string} Masked preview
     */
    _previewKey(key) {
        if (typeof key !== 'string' || key.length <= 12) return '••••';
        return `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
    }

    /**
     * Constant-time comparison of two hex-encoded hashes.
     * @param {string} a - First hash
     * @param {string} b - Second hash
     * @returns {boolean} True when both hashes match
     */
    _hashesEqual(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
            return false;
        }
        try {
            return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
        } catch (err) {
            return false;
        }
    }

    /**
     * Store an API key with associated metadata.
     * The plaintext key is returned once to the caller but never persisted.
     * @param {string} key - The API key to store
     * @param {string} userId - The user ID associated with this key
     * @param {Object} metadata - Additional metadata (optional)
     * @param {number|null} expiresIn - Optional validity in milliseconds
     * @returns {Object} The stored key record (includes plaintext `key` for one-time display)
     */
    storeAPIKey(key, userId, metadata = {}, expiresIn = null) {
        if (!key || typeof key !== 'string') {
            throw new Error('API key must be a non-empty string');
        }

        const keyHash = this._hashKey(key);
        const keyPreview = this._previewKey(key);
        const record = {
            keyHash,
            keyPreview,
            userId,
            createdAt: Date.now(),
            expiresAt: expiresIn ? Date.now() + expiresIn : null,
            metadata,
            active: true
        };

        // Index by hash — plaintext is never retained
        this.apiKeys.set(keyHash, record);

        // Persist only the hash + non-sensitive preview
        try {
            const stmt = db.db.prepare(`
                INSERT OR IGNORE INTO api_keys (id, key_hash, user_id, metadata, active, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
                `KEY_${keyHash.substring(0, 24)}`,
                keyHash,
                userId,
                JSON.stringify({ ...metadata, keyPreview }),
                1,
                new Date(record.createdAt).toISOString(),
                record.expiresAt ? new Date(record.expiresAt).toISOString() : null
            );
        } catch (error) {
            console.error('[AUTH] Failed to persist API key to database:', error);
        }

        // Return the plaintext ONCE so the caller can display it to the user
        return {
            key,
            keyHash,
            keyPreview,
            userId,
            createdAt: record.createdAt,
            expiresAt: record.expiresAt,
            metadata,
            active: true
        };
    }

    rotateAPIKey(oldKey, userId, metadata = {}, expiresIn = null) {
        // Deactivate old key
        this.deactivateAPIKey(oldKey);

        // Generate and store new key
        const newKey = this.generateAPIKey();
        return this.storeAPIKey(newKey, userId, metadata, expiresIn);
    }

    /**
     * Load API keys from database on startup.
     * Only hashes are stored, so we rebuild the lookup index from hashes —
     * previously issued keys keep working across restarts without plaintext at rest.
     */
    loadAPIKeysFromDatabase() {
        try {
            const stmt = db.db.prepare('SELECT * FROM api_keys WHERE active = 1');
            const rows = stmt.all();

            for (const row of rows) {
                let metadata = {};
                try {
                    metadata = row.metadata ? JSON.parse(row.metadata) : {};
                } catch (error) {
                    metadata = {};
                }

                const { keyPreview, ...cleanMetadata } = metadata;

                this.apiKeys.set(row.key_hash, {
                    keyHash: row.key_hash,
                    keyPreview: keyPreview || null,
                    userId: row.user_id,
                    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
                    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
                    metadata: cleanMetadata,
                    active: true
                });
            }

            console.log(`[AUTH] Loaded ${rows.length} active API key hash(es) from database`);
        } catch (error) {
            console.error('[AUTH] Failed to load API keys from database:', error);
        }

        // Ensure the environment-provided admin key is indexed
        this.initializeDefaultAPIKeys();
    }

    /**
     * Validate an API key.
     * @param {string} key - The API key to validate
     * @returns {Object} Validation result with isValid flag and optional userId
     */
    validateAPIKey(key) {
        if (!key || typeof key !== 'string') {
            return {
                isValid: false,
                reason: 'Invalid key format'
            };
        }

        const keyHash = this._hashKey(key);
        const record = this.apiKeys.get(keyHash);

        // Require an exact constant-time hash match before trusting the record
        if (!record || typeof record !== 'object' || !this._hashesEqual(record.keyHash, keyHash)) {
            return {
                isValid: false,
                reason: 'Key not found'
            };
        }

        if (!record.active) {
            return {
                isValid: false,
                reason: 'Key is inactive'
            };
        }

        if (record.expiresAt && Date.now() > record.expiresAt) {
            record.active = false;
            return {
                isValid: false,
                reason: 'Key has expired'
            };
        }

        return {
            isValid: true,
            userId: record.userId,
            metadata: record.metadata,
            record: record
        };
    }

    /**
     * Deactivate an API key.
     * @param {string} key - The API key to deactivate
     * @returns {boolean} True if key was deactivated, false if not found
     */
    deactivateAPIKey(key) {
        if (!key || typeof key !== 'string') return false;

        const keyHash = this._hashKey(key);
        const record = this.apiKeys.get(keyHash);
        if (!record) return false;

        record.active = false;

        // Update database
        try {
            const stmt = db.db.prepare('UPDATE api_keys SET active = 0 WHERE key_hash = ?');
            stmt.run(keyHash);
        } catch (error) {
            console.error('[AUTH] Failed to deactivate API key in database:', error);
        }

        return true;
    }

    // ── Lockout ───────────────────────────────────────────────────────────────

    /**
     * Record a failed authentication attempt for an identifier (e.g. client IP).
     * Once the threshold is reached the identifier is locked out for the cooldown period.
     * @param {string} identifier - Client identifier
     * @returns {Object} Lockout info
     */
    recordAuthFailure(identifier) {
        const id = identifier || 'unknown';
        const entry = this.authFailures.get(id) || { count: 0, lockedUntil: 0 };
        entry.count += 1;

        if (entry.count >= this.lockoutThreshold) {
            entry.lockedUntil = Date.now() + this.lockoutDuration;
            entry.count = 0;
        }

        this.authFailures.set(id, entry);
        return this.getLockoutInfo(id);
    }

    /**
     * Get lockout status for an identifier.
     * @param {string} identifier - Client identifier
     * @returns {Object} { locked, retryAfterMs }
     */
    getLockoutInfo(identifier) {
        const id = identifier || 'unknown';
        const entry = this.authFailures.get(id);

        if (!entry || !entry.lockedUntil) {
            return { locked: false };
        }

        if (Date.now() >= entry.lockedUntil) {
            this.authFailures.delete(id);
            return { locked: false };
        }

        return { locked: true, retryAfterMs: entry.lockedUntil - Date.now() };
    }

    /**
     * @param {string} identifier - Client identifier
     * @returns {boolean} True when the identifier is locked out
     */
    isLockedOut(identifier) {
        return this.getLockoutInfo(identifier).locked;
    }

    /**
     * Clear failed-attempt state for an identifier (e.g. after a successful login).
     * @param {string} identifier - Client identifier
     */
    clearAuthFailures(identifier) {
        this.authFailures.delete(identifier || 'unknown');
    }

    // ── MFA grants (step-up verification) ─────────────────────────────────────

    /**
     * Issue a short-lived MFA grant token after a successful MFA challenge.
     * @param {string} userId - The verified user
     * @returns {Object} { token, expiresAt }
     */
    issueMfaGrant(userId) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + this.sessionTimeout;
        this.mfaGrants.set(token, { userId, expiresAt });
        return { token, expiresAt: new Date(expiresAt).toISOString() };
    }

    /**
     * Validate an MFA grant token for a specific user.
     * @param {string} token - Grant token
     * @param {string} userId - Expected user
     * @returns {Object} Validation result
     */
    validateMfaGrant(token, userId) {
        if (!token || typeof token !== 'string') {
            return { isValid: false, reason: 'Missing MFA token' };
        }

        const grant = this.mfaGrants.get(token);
        if (!grant) {
            return { isValid: false, reason: 'MFA token not found' };
        }

        if (userId && grant.userId !== userId) {
            return { isValid: false, reason: 'MFA token user mismatch' };
        }

        if (Date.now() > grant.expiresAt) {
            this.mfaGrants.delete(token);
            return { isValid: false, reason: 'MFA token expired' };
        }

        return { isValid: true, userId: grant.userId };
    }

    /**
     * Revoke an MFA grant token.
     * @param {string} token - Grant token
     * @returns {boolean} True when a token was removed
     */
    revokeMfaGrant(token) {
        return this.mfaGrants.delete(token);
    }

    /**
     * Create a new session for a user.
     * @param {Object} user - User object with id and optional roles
     * @param {Object|number} metadata - Additional session metadata (optional) or timeout in ms
     * @returns {Object} Session object with token and expiration
     */
    createSession(user, metadata = {}) {
        if (!user || !user.id) {
            throw new Error('User must have an id');
        }

        let timeout = this.sessionTimeout;
        let sessionMetadata = {};

        if (typeof metadata === 'number') {
            timeout = metadata;
        } else {
            sessionMetadata = metadata;
        }

        const token = crypto.randomBytes(16).toString('hex');
        const createdAt = Date.now();
        const expiresAt = createdAt + timeout;

        const session = {
            sessionId: token,
            userId: user.id,
            roles: user.roles || ['user'],
            createdAt,
            expiresAt,
            mfaVerified: false,
            metadata: sessionMetadata,
            ip: sessionMetadata.ip || null,
            userAgent: sessionMetadata.userAgent || null
        };

        this.sessions.set(token, session);

        // Set up automatic session cleanup
        if (timeout === this.sessionTimeout) {
            setTimeout(() => {
                this.invalidateSession(token);
            }, timeout);
        }

        return {
            token,
            sessionId: token,
            userId: user.id,
            expiresAt: new Date(expiresAt).toISOString(),
            mfaRequired: user.mfaEnabled || false
        };
    }

    /**
     * Validate a session.
     * @param {string} sessionId - The session ID to validate
     * @returns {Object} Validation result with isValid flag and session data if valid
     */
    validateSession(sessionId) {
        if (!sessionId || typeof sessionId !== 'string') {
            return {
                isValid: false,
                reason: 'Invalid session ID format'
            };
        }

        const session = this.sessions.get(sessionId);

        if (!session) {
            return {
                isValid: false,
                reason: 'Session not found'
            };
        }

        const now = Date.now();
        if (now > session.expiresAt) {
            this.sessions.delete(sessionId);
            return {
                isValid: false,
                reason: 'Session expired'
            };
        }

        return {
            isValid: true,
            session: {
                sessionId: session.sessionId,
                userId: session.userId,
                roles: session.roles,
                mfaVerified: session.mfaVerified,
                metadata: session.metadata
            }
        };
    }

    /**
     * Invalidate a session.
     * @param {string} sessionId - The session ID to invalidate
     * @returns {boolean} True if session was invalidated, false if not found
     */
    invalidateSession(sessionId) {
        return this.sessions.delete(sessionId);
    }

    /**
     * Initiate MFA for a user.
     * @param {Object} user - User object with id
     * @returns {Object} MFA initiation result
     */
    initiateMFA(user) {
        if (!user || !user.id) {
            throw new Error('User must have an id');
        }

        // Generate a 6-digit numeric code and mfaToken
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const mfaToken = crypto.randomBytes(16).toString('hex');
        const createdAt = Date.now();
        const expiresAt = createdAt + this.mfaCodeValidity;

        const mfaRecord = {
            code,
            mfaToken,
            createdAt,
            expiresAt,
            attempts: 0,
            userId: user.id
        };

        this.mfaCodes.set(user.id, mfaRecord);
        this.mfaCodes.set(mfaToken, mfaRecord);

        // Set up automatic code expiration
        setTimeout(() => {
            this.mfaCodes.delete(user.id);
            this.mfaCodes.delete(mfaToken);
        }, this.mfaCodeValidity);

        return {
            success: true,
            mfaToken,
            code: code, // In production, this would be sent via email/SMS
            expiresAt: new Date(expiresAt).toISOString()
        };
    }

    /**
     * Verify MFA code for a user.
     * @param {Object} user - User object with id
     * @param {string} mfaTokenOrCode - The MFA token or code to verify
     * @returns {Object} Verification result
     */
    verifyMFA(user, mfaTokenOrCode) {
        if (!user || !user.id) {
            return {
                isValid: false,
                success: false,
                reason: 'User must have an id'
            };
        }

        if (!mfaTokenOrCode || typeof mfaTokenOrCode !== 'string') {
            return {
                isValid: false,
                success: false,
                reason: 'Invalid token format'
            };
        }

        // Look up by mfaToken or userId
        let mfaRecord = this.mfaCodes.get(mfaTokenOrCode);
        if (!mfaRecord) {
            mfaRecord = this.mfaCodes.get(user.id);
        }

        if (!mfaRecord) {
            return {
                isValid: false,
                success: false,
                reason: 'MFA code not found or expired'
            };
        }

        const now = Date.now();
        if (now > mfaRecord.expiresAt) {
            this.mfaCodes.delete(user.id);
            if (mfaRecord.mfaToken) {
                this.mfaCodes.delete(mfaRecord.mfaToken);
            }
            return {
                isValid: false,
                success: false,
                reason: 'MFA code expired'
            };
        }

        if (mfaRecord.attempts >= 3) {
            this.mfaCodes.delete(user.id);
            if (mfaRecord.mfaToken) {
                this.mfaCodes.delete(mfaRecord.mfaToken);
            }
            return {
                isValid: false,
                success: false,
                reason: 'Too many failed attempts'
            };
        }

        // Check if it's the code or just using the token
        let codeMatched = true;
        if (mfaTokenOrCode.length === 6) { // If it's a 6-digit code
            codeMatched = mfaTokenOrCode === mfaRecord.code;
        }

        if (!codeMatched) {
            mfaRecord.attempts++;
            return {
                isValid: false,
                success: false,
                reason: 'Invalid MFA code',
                attemptsRemaining: 3 - mfaRecord.attempts
            };
        }

        // Valid MFA - clear the record and return success
        this.mfaCodes.delete(user.id);
        if (mfaRecord.mfaToken) {
            this.mfaCodes.delete(mfaRecord.mfaToken);
        }

        // Update session to mark MFA as verified
        if (mfaRecord.sessionId) {
            const session = this.sessions.get(mfaRecord.sessionId);
            if (session) {
                session.mfaVerified = true;
            }
        }

        return {
            isValid: true,
            success: true,
            mfaVerified: true
        };
    }

    /**
     * Link a session to an MFA record for verification.
     * @param {string} userId - User ID
     * @param {string} sessionId - Session ID
     */
    linkMFASession(userId, sessionId) {
        const mfaRecord = this.mfaCodes.get(userId);
        if (mfaRecord) {
            mfaRecord.sessionId = sessionId;
        }
    }

    // ── TOTP (RFC 6238) ───────────────────────────────────────────────────────

    /**
     * Generate a base32-encoded TOTP secret compatible with authenticator apps.
     * @returns {string} Base32 secret
     */
    generateMFASecret() {
        return this._base32Encode(crypto.randomBytes(20));
    }

    /**
     * Verify a 6-digit TOTP code against a base32 secret.
     * @param {string} secret - Base32 secret
     * @param {string} code - 6-digit code
     * @param {number} window - Number of 30-second steps to tolerate on each side
     * @returns {boolean} True when the code is valid
     */
    verifyTOTP(secret, code, window = 1) {
        if (!secret || !code || !/^\d{6}$/.test(String(code))) {
            return false;
        }

        const step = 30;
        const counter = Math.floor(Date.now() / 1000 / step);
        let matched = false;

        for (let i = -window; i <= window; i++) {
            const candidate = this._hotp(secret, counter + i);
            if (candidate.length === String(code).length &&
                crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(String(code)))) {
                matched = true;
            }
        }

        return matched;
    }

    /**
     * Compute an HOTP value (RFC 4226).
     * @param {string} secret - Base32 secret
     * @param {number} counter - Counter value
     * @returns {string} 6-digit code
     */
    _hotp(secret, counter) {
        const key = this._base32Decode(secret);
        const buf = Buffer.alloc(8);
        buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
        buf.writeUInt32BE(counter >>> 0, 4);

        const hmac = crypto.createHmac('sha1', key).update(buf).digest();
        const offset = hmac[hmac.length - 1] & 0x0f;
        const binary =
            ((hmac[offset] & 0x7f) << 24) |
            ((hmac[offset + 1] & 0xff) << 16) |
            ((hmac[offset + 2] & 0xff) << 8) |
            (hmac[offset + 3] & 0xff);

        return (binary % 1000000).toString().padStart(6, '0');
    }

    _base32Decode(input) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        const clean = String(input).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
        let bits = 0;
        let value = 0;
        const bytes = [];

        for (const char of clean) {
            const idx = alphabet.indexOf(char);
            if (idx === -1) continue;
            value = (value << 5) | idx;
            bits += 5;
            if (bits >= 8) {
                bytes.push((value >>> (bits - 8)) & 0xff);
                bits -= 8;
            }
        }

        return Buffer.from(bytes);
    }

    _base32Encode(buffer) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let bits = 0;
        let value = 0;
        let output = '';

        for (const byte of buffer) {
            value = (value << 8) | byte;
            bits += 8;
            while (bits >= 5) {
                output += alphabet[(value >>> (bits - 5)) & 31];
                bits -= 5;
            }
        }

        if (bits > 0) {
            output += alphabet[(value << (5 - bits)) & 31];
        }

        return output;
    }

    /**
     * Check if a user has access to a resource with a specific action.
     * @param {Object} user - User object with id and roles
     * @param {string} resource - The resource to check access for
     * @param {string} action - The action to check access for
     * @returns {Object} Access check result
     */
    checkAccess(user, resource, action) {
        if (!user || !user.roles || !Array.isArray(user.roles)) {
            return {
                allowed: false,
                reason: 'User must have roles'
            };
        }

        // Check each of the user's roles
        for (const role of user.roles) {
            const roleData = this.roles.get(role);

            if (roleData) {
                const resources = roleData.resources;
                if (resources.has(resource)) {
                    const allowedActions = resources.get(resource);
                    if (allowedActions.has(action)) {
                        return {
                            allowed: true,
                            role
                        };
                    }
                }
            }
        }

        return {
            allowed: false,
            reason: 'Access denied',
            requestedResource: resource,
            requestedAction: action
        };
    }

    /**
     * Get all roles for a user.
     * @param {Object} user - User object with id
     * @returns {Array} Array of role names
     */
    getRoles(user) {
        if (!user || !user.id) {
            return [];
        }

        // In a real implementation, this would fetch from a database
        // For now, return a default role
        return user.roles || ['user'];
    }

    getAPIKeyRecord(key) {
        if (!key || typeof key !== 'string') return undefined;
        return this.apiKeys.get(this._hashKey(key));
    }

    listAPIKeys() {
        return Array.from(this.apiKeys.values());
    }

    listActiveAPIKeys() {
        return Array.from(this.apiKeys.values()).filter(k => k.active && (!k.expiresAt || Date.now() < k.expiresAt));
    }

    /**
     * Add a new role with custom permissions.
     * @param {string} roleName - Name of the role
     * @param {Object} permissions - Resource-action mappings
     */
    addRole(roleName, permissions) {
        const resources = new Map();

        for (const [resource, actions] of Object.entries(permissions)) {
            resources.set(resource, new Set(actions));
        }

        this.roles.set(roleName, { resources });
    }

    /**
     * Get audit log for authentication events.
     * @returns {Array} Array of authentication events
     */
    getAuditLog() {
        // In a real implementation, this would return from a persistent store
        return [];
    }

    /**
     * Clear all stored data (useful for testing).
     */
    clearAll() {
        this.apiKeys.clear();
        this.sessions.clear();
        this.mfaCodes.clear();
        this.mfaGrants.clear();
        this.authFailures.clear();
    }
}

module.exports = new AuthService();
