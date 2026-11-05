const securityConfig = require('../../config/security');

describe('Security Configuration', () => {
    describe('Encryption Configuration', () => {
        test('should have FIPS 140-2 compliant algorithm', () => {
            expect(securityConfig.encryption.fipsCompliant).toBe(true);
            expect(['aes-256-cbc', 'aes-256-gcm']).toContain(securityConfig.encryption.algorithm);
        });

        test('should have 256-bit key size', () => {
            expect(securityConfig.encryption.keySize).toBe(256);
        });

        test('should have key rotation enabled', () => {
            expect(securityConfig.encryption.keyRotation).toBe(true);
        });

        test('should have reasonable key rotation interval', () => {
            expect(securityConfig.encryption.rotationInterval).toBe(90);
        });

        test('should have proper IV size', () => {
            expect(securityConfig.encryption.ivSize).toBe(16);
        });
    });

    describe('Authentication Configuration', () => {
        test('should have API key header configured', () => {
            expect(securityConfig.authentication.apiKeyHeader).toBe('x-api-key');
        });

        test('should have reasonable session timeout', () => {
            expect(securityConfig.authentication.sessionTimeout).toBe(3600000); // 1 hour
        });

        test('should have MFA enabled', () => {
            expect(securityConfig.authentication.mfaEnabled).toBe(true);
        });

        test('should have reasonable MFA code validity', () => {
            expect(securityConfig.authentication.mfaCodeValidity).toBe(600000); // 10 minutes
        });

        test('should have max MFA attempts configured', () => {
            expect(securityConfig.authentication.maxMfaAttempts).toBe(3);
        });
    });

    describe('Audit Configuration', () => {
        test('should have audit logging enabled', () => {
            expect(securityConfig.audit.enabled).toBe(true);
        });

        test('should have reasonable retention period', () => {
            expect(securityConfig.audit.retentionDays).toBe(365);
        });

        test('should log all access events', () => {
            expect(securityConfig.audit.logAllAccess).toBe(true);
        });

        test('should log security events', () => {
            expect(securityConfig.audit.logSecurityEvents).toBe(true);
        });

        test('should log transactions', () => {
            expect(securityConfig.audit.logTransactions).toBe(true);
        });
    });

    describe('Feature Flags', () => {
        test('should have GPU processing feature flag', () => {
            expect(securityConfig.featureFlags.gpuProcessing).toBeDefined();
            expect(securityConfig.featureFlags.gpuProcessing.enabled).toBe(true);
        });

        test('should have enhanced card validation feature flag', () => {
            expect(securityConfig.featureFlags.enhancedCardValidation).toBeDefined();
            expect(securityConfig.featureFlags.enhancedCardValidation.enabled).toBe(true);
        });

        test('should have secure vault feature flag', () => {
            expect(securityConfig.featureFlags.secureVault).toBeDefined();
            expect(securityConfig.featureFlags.secureVault.enabled).toBe(true);
        });

        test('should have audit logging feature flag', () => {
            expect(securityConfig.featureFlags.auditLogging).toBeDefined();
            expect(securityConfig.featureFlags.auditLogging.enabled).toBe(true);
        });

        test('should have rate limiting feature flag', () => {
            expect(securityConfig.featureFlags.rateLimiting).toBeDefined();
            expect(securityConfig.featureFlags.rateLimiting.enabled).toBe(true);
        });

        test('should have TLS 1.3 feature flag', () => {
            expect(securityConfig.featureFlags.tls13).toBeDefined();
            expect(securityConfig.featureFlags.tls13.enabled).toBe(true);
        });

        test('should have MFA feature flag', () => {
            expect(securityConfig.featureFlags.mfa).toBeDefined();
            expect(securityConfig.featureFlags.mfa.enabled).toBe(true);
        });

        test('should have key rotation feature flag', () => {
            expect(securityConfig.featureFlags.keyRotation).toBeDefined();
            expect(securityConfig.featureFlags.keyRotation.enabled).toBe(true);
        });
    });

    describe('Access Control Configuration', () => {
        test('should have RBAC enabled', () => {
            expect(securityConfig.accessControl.rbacEnabled).toBe(true);
        });

        test('should have default roles defined', () => {
            expect(securityConfig.accessControl.roles).toBeDefined();
            expect(securityConfig.accessControl.roles.admin).toBeDefined();
            expect(securityConfig.accessControl.roles.merchant).toBeDefined();
            expect(securityConfig.accessControl.roles.user).toBeDefined();
            expect(securityConfig.accessControl.roles.support).toBeDefined();
        });

        test('should have default role configured', () => {
            expect(securityConfig.accessControl.defaultRole).toBe('user');
        });
    });

    describe('Security Events Configuration', () => {
        test('should log auth failures', () => {
            expect(securityConfig.securityEvents.logAuthFailures).toBe(true);
        });

        test('should log unauthorized access', () => {
            expect(securityConfig.securityEvents.logUnauthorizedAccess).toBe(true);
        });

        test('should have failed auth alert threshold', () => {
            expect(securityConfig.securityEvents.failedAuthAlertThreshold).toBe(5);
        });

        test('should have IP block duration', () => {
            expect(securityConfig.securityEvents.ipBlockDuration).toBe(900000); // 15 minutes
        });
    });

    describe('PCI-DSS Configuration', () => {
        test('should mask card numbers in logs', () => {
            expect(securityConfig.pciDss.maskCardNumbers).toBe(true);
        });

        test('should have visible digits configured', () => {
            expect(securityConfig.pciDss.visibleDigits).toBe(4);
        });

        test('should encrypt cardholder data', () => {
            expect(securityConfig.pciDss.encryptCardholderData).toBe(true);
        });

        test('should use unique IV per encryption', () => {
            expect(securityConfig.pciDss.uniqueIvPerEncryption).toBe(true);
        });

        test('should log cardholder access', () => {
            expect(securityConfig.pciDss.logCardholderAccess).toBe(true);
        });
    });

    describe('FIPS 140-2 Configuration', () => {
        test('should have FIPS 140-2 enabled', () => {
            expect(securityConfig.fips1402.enabled).toBe(true);
        });

        test('should have validated algorithms', () => {
            expect(securityConfig.fips1402.algorithms).toContain('aes-256-cbc');
            expect(securityConfig.fips1402.algorithms).toContain('sha-256');
        });

        test('should use CSPRNG', () => {
            expect(securityConfig.fips1402.useCSPRNG).toBe(true);
        });

        test('should audit crypto operations', () => {
            expect(securityConfig.fips1402.auditCryptoOps).toBe(true);
        });
    });
});
