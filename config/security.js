/**
 * Security Configuration
 * 
 * This module provides security settings for the payment processor,
 * including encryption, authentication, audit logging, and feature flags
 * for incremental rollout.
 * 
 * PCI-DSS and FIPS 140-2 compliance settings.
 */

/**
 * Encryption configuration
 * @type {Object}
 */
const encryption = {
    /**
     * Encryption algorithm
     * FIPS 140-2 validated algorithms: 'aes-256-cbc', 'aes-256-gcm'
     */
    algorithm: 'aes-256-cbc',
    
    /**
     * Key size in bits
     * FIPS 140-2 requires minimum 256 bits for AES
     */
    keySize: 256,
    
    /**
     * Whether to use FIPS 140-2 validated algorithms only
     */
    fipsCompliant: true,
    
    /**
     * Whether to enable key rotation
     */
    keyRotation: true,
    
    /**
     * Key rotation interval in days
     * FIPS 140-2 recommends periodic key rotation
     */
    rotationInterval: 90,
    
    /**
     * Number of key versions to retain for decryption
     */
    keyHistorySize: 5,
    
    /**
     * Initialization vector size in bytes
     * AES uses 16-byte IVs
     */
    ivSize: 16
};

/**
 * Authentication configuration
 * @type {Object}
 */
const authentication = {
    /**
     * API key header name
     */
    apiKeyHeader: 'x-api-key',
    
    /**
     * API key length in bytes
     */
    apiKeyLength: 32,
    
    /**
     * Session timeout in milliseconds (default: 1 hour)
     */
    sessionTimeout: 3600000,
    
    /**
     * Whether to require multi-factor authentication
     */
    mfaEnabled: true,
    
    /**
     * MFA code validity in milliseconds (default: 10 minutes)
     */
    mfaCodeValidity: 600000,
    
    /**
     * Maximum MFA attempts before lockout
     */
    maxMfaAttempts: 3,
    
    /**
     * API key validation enabled
     */
    apiKeyValidation: true,
    
    /**
     * Session validation enabled
     */
    sessionValidation: true
};

/**
 * Audit logging configuration
 * @type {Object}
 */
const audit = {
    /**
     * Whether audit logging is enabled
     */
    enabled: true,
    
    /**
     * Log retention period in days
     * PCI-DSS requires minimum 1 year retention
     */
    retentionDays: 365,
    
    /**
     * Log all access events
     */
    logAllAccess: true,
    
    /**
     * Log security events
     */
    logSecurityEvents: true,
    
    /**
     * Log transaction events
     */
    logTransactions: true,
    
    /**
     * Log level for audit events
     */
    logLevel: 'info',
    
    /**
     * Audit log format
     */
    format: 'structured'
};

/**
 * Feature flags for incremental rollout
 * @type {Object}
 */
const featureFlags = {
    /**
     * Enable GPU processing for transaction parsing
     */
    gpuProcessing: {
        enabled: true,
        rolloutPercentage: 100,
        fallbackToCpu: true
    },
    
    /**
     * Enable enhanced card validation with masking
     */
    enhancedCardValidation: {
        enabled: true,
        maskInLogs: true
    },
    
    /**
     * Enable secure vault for sensitive data storage
     */
    secureVault: {
        enabled: true,
        fipsCompliant: true
    },
    
    /**
     * Enable audit logging
     */
    auditLogging: {
        enabled: true,
        logAllAccess: true
    },
    
    /**
     * Enable rate limiting on admin API
     */
    rateLimiting: {
        enabled: true,
        maxRequests: 100,
        windowMs: 60000
    },
    
    /**
     * Enable TLS 1.3 with quantum-resistant algorithms
     */
    tls13: {
        enabled: true,
        quantumResistant: true
    },
    
    /**
     * Enable MFA for admin access
     */
    mfa: {
        enabled: true,
        requiredForAdmin: true
    },
    
    /**
     * Enable key rotation
     */
    keyRotation: {
        enabled: true,
        autoRotate: true
    }
};

/**
 * Simulation configuration.
 *
 * Simulated processing paths (mock acquirer, simulated GPU cluster, mock
 * ISO8583 pipeline) must NEVER silently handle real payments in production.
 * Gate is fail-closed: simulation is refused in production unless it is
 * explicitly opted into via ALLOW_SIMULATION=true.
 */
const simulation = {
    /**
     * Human-readable reason surfaced when a simulated path is refused
     */
    disabledMessage: 'Simulated payment processing is disabled in this environment. Configure a real acquirer/gateway (e.g. Stripe) to process payments.',

    /**
     * Simulated components that are gated
     */
    components: ['mock_acquirer', 'gpu_manager', 'iso8583']
};

/**
 * Determine whether simulated (mock) processing paths are permitted.
 * Non-production environments (development/test) allow simulation so the
 * test suite and local tooling keep working. Production is fail-closed.
 *
 * @returns {boolean} True when simulation may be used
 */
function isSimulationAllowed() {
    if (process.env.ALLOW_SIMULATION === 'true') return true;
    return process.env.NODE_ENV !== 'production';
}

/**
 * Access control configuration
 * @type {Object}
 */
const accessControl = {
    /**
     * Enable role-based access control
     */
    rbacEnabled: true,
    
    /**
     * Default roles
     */
    roles: {
        admin: {
            resources: ['transactions', 'users', 'settings', 'audit', 'gpu'],
            permissions: ['read', 'write', 'delete', 'approve', 'settle', 'manage']
        },
        merchant: {
            resources: ['transactions', 'settings', 'audit'],
            permissions: ['read', 'write']
        },
        user: {
            resources: ['transactions'],
            permissions: ['read']
        },
        support: {
            resources: ['users', 'transactions', 'audit'],
            permissions: ['read']
        }
    },
    
    /**
     * Default role for new users
     */
    defaultRole: 'user',
    
    /**
     * Enable IP-based access restrictions
     */
    ipRestrictions: {
        enabled: false,
        allowedIps: []
    },
    
    /**
     * Enable geographic restrictions
     */
    geoRestrictions: {
        enabled: false,
        allowedCountries: []
    }
};

/**
 * Security event configuration
 * @type {Object}
 */
const securityEvents = {
    /**
     * Log failed authentication attempts
     */
    logAuthFailures: true,
    
    /**
     * Log unauthorized access attempts
     */
    logUnauthorizedAccess: true,
    
    /**
     * Log data access events
     */
    logDataAccess: true,
    
    /**
     * Log encryption operations
     */
    logEncryptionOps: true,
    
    /**
     * Log key rotation events
     */
    logKeyRotation: true,
    
    /**
     * Alert threshold for failed auth attempts (per minute)
     */
    failedAuthAlertThreshold: 5,
    
    /**
     * IP block duration in milliseconds after threshold exceeded
     */
    ipBlockDuration: 900000 // 15 minutes
};

/**
 * PCI-DSS compliance settings
 * @type {Object}
 */
const pciDss = {
    /**
     * Mask card numbers in logs
     */
    maskCardNumbers: true,
    
    /**
     * Number of visible digits from the end
     */
    visibleDigits: 4,
    
    /**
     * Encrypt cardholder data at rest
     */
    encryptCardholderData: true,
    
    /**
     * Use unique IV for each encryption operation
     */
    uniqueIvPerEncryption: true,
    
    /**
     * Log all cardholder data access
     */
    logCardholderAccess: true,
    
    /**
     * Cardholder data retention period in days
     */
    retentionDays: 365,
    
    /**
     * Securely erase data after retention
     */
    secureErase: true
};

/**
 * FIPS 140-2 compliance settings
 * @type {Object}
 */
const fips1402 = {
    /**
     * Use only FIPS 140-2 validated algorithms
     */
    enabled: true,
    
    /**
     * Validated algorithms
     */
    algorithms: ['aes-256-cbc', 'aes-256-gcm', 'sha-256', 'sha-384', 'sha-512'],
    
    /**
     * Use cryptographically secure random number generation
     */
    useCSPRNG: true,
    
    /**
     * Audit all cryptographic operations
     */
    auditCryptoOps: true,
    
    /**
     * Validate algorithm implementation
     */
    validateImplementation: true
};

/**
 * Export all configuration
 */
module.exports = {
    encryption,
    authentication,
    audit,
    featureFlags,
    simulation,
    isSimulationAllowed,
    accessControl,
    securityEvents,
    pciDss,
    fips1402
};
