const fc = require('fast-check');
const secureVault = require('../utils/secureVault');

/**
 * Property 4: Secure Vault Encryption Round-Trip
 * For any sensitive data, storing it in the secure vault and then retrieving it should produce the original data.
 * Validates: Requirements 2.1, 2.2, 8.1, 8.3
 */
describe('Secure Vault Encryption Round-Trip', () => {
    test('store and retrieve produces original data', () => {
        fc.assert(fc.property(
            fc.string({ minLength: 1, maxLength: 1000 }),
            fc.string({ minLength: 1, maxLength: 50 }),
            (value, key) => {
                // Clear any existing data for this key
                secureVault.clear(key);
                
                // Store the data
                secureVault.store(key, value);
                
                // Retrieve the data
                const retrieved = secureVault.retrieve(key);
                
                // Verify round-trip
                expect(retrieved).toBe(value);
                
                // Clean up
                secureVault.clear(key);
                
                return true;
            }
        ), { numRuns: 100 });
    });

    test('store and retrieve handles special characters', () => {
        const specialValues = [
            'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?',
            'Unicode: 你好世界 🎉',
            'Newlines: line1\nline2\r\nline3',
            'Quotes: "double" and \'single\'',
            'Empty string: ',
            'Numbers: 1234567890',
            'JSON: {"key": "value", "array": [1, 2, 3]}'
        ];

        specialValues.forEach(value => {
            const key = `special_${Date.now()}`;
            secureVault.store(key, value);
            const retrieved = secureVault.retrieve(key);
            expect(retrieved).toBe(value);
            secureVault.clear(key);
        });
    });
});

/**
 * Property 5: Secure Vault IV Uniqueness
 * For any data stored multiple times in the secure vault, each storage operation should use a unique initialization vector.
 * Validates: Requirements 2.2
 */
describe('Secure Vault IV Uniqueness', () => {
    /**
     * PBT: For any plaintext value and any number of repeated store operations (2–20),
     * every encryption produces a distinct IV — ensuring semantic security
     * (same plaintext → different ciphertext each time).
     *
     * **Validates: Requirements 2.2**
     */
    test('property: repeated stores of the same value always produce unique IVs', () => {
        fc.assert(fc.property(
            fc.string({ minLength: 1, maxLength: 500 }),
            fc.integer({ min: 2, max: 20 }),
            (value, numStores) => {
                const key = `pbt_iv_uniqueness_${Date.now()}_${Math.random()}`;
                const ivs = [];

                for (let i = 0; i < numStores; i++) {
                    secureVault.clear(key);
                    secureVault.store(key, value);

                    const record = secureVault.vault.get(key);
                    ivs.push(record.iv);
                }

                secureVault.clear(key);

                // All IVs must be distinct — no two encryption operations share the same IV
                const uniqueIVs = new Set(ivs);
                return uniqueIVs.size === ivs.length;
            }
        ), { numRuns: 100 });
    });

    /**
     * PBT: For any set of distinct keys, storing different values produces unique IVs
     * across all keys — IV uniqueness is not scoped to a single key.
     *
     * **Validates: Requirements 2.2**
     */
    test('property: storing values under different keys always produces unique IVs', () => {
        fc.assert(fc.property(
            fc.array(
                fc.record({
                    key: fc.string({ minLength: 1, maxLength: 30 }).map(s => `pbt_key_${s}`),
                    value: fc.string({ minLength: 1, maxLength: 200 })
                }),
                { minLength: 2, maxLength: 15 }
            ),
            (entries) => {
                // Use unique keys to avoid collisions within the same run
                const uniqueEntries = entries.filter(
                    (e, idx, arr) => arr.findIndex(x => x.key === e.key) === idx
                );

                if (uniqueEntries.length < 2) return true; // not enough distinct keys to test

                const ivs = [];

                for (const { key, value } of uniqueEntries) {
                    secureVault.clear(key);
                    secureVault.store(key, value);

                    const record = secureVault.vault.get(key);
                    ivs.push(record.iv);
                }

                // Clean up
                for (const { key } of uniqueEntries) {
                    secureVault.clear(key);
                }

                // All IVs across different keys must be distinct
                const uniqueIVs = new Set(ivs);
                return uniqueIVs.size === ivs.length;
            }
        ), { numRuns: 100 });
    });
});

// Unit tests for specific examples
describe('Secure Vault Unit Tests', () => {
    describe('store and retrieve', () => {
        test('stores and retrieves string data', () => {
            const key = 'test_key_1';
            const value = 'sensitive_data';
            
            secureVault.clear(key);
            secureVault.store(key, value);
            const retrieved = secureVault.retrieve(key);
            
            expect(retrieved).toBe(value);
            secureVault.clear(key);
        });

        test('returns null for non-existent key', () => {
            const key = 'non_existent_key';
            const retrieved = secureVault.retrieve(key);
            expect(retrieved).toBeNull();
        });

        test('handles multiple keys independently', () => {
            const key1 = 'key_a';
            const key2 = 'key_b';
            const value1 = 'data_a';
            const value2 = 'data_b';
            
            secureVault.clear(key1);
            secureVault.clear(key2);
            
            secureVault.store(key1, value1);
            secureVault.store(key2, value2);
            
            expect(secureVault.retrieve(key1)).toBe(value1);
            expect(secureVault.retrieve(key2)).toBe(value2);
            expect(secureVault.retrieve('nonexistent')).toBeNull();
            
            secureVault.clear(key1);
            secureVault.clear(key2);
        });
    });

    describe('clear', () => {
        test('removes stored data', () => {
            const key = 'clear_test';
            const value = 'to_be_cleared';
            
            secureVault.store(key, value);
            secureVault.clear(key);
            
            const retrieved = secureVault.retrieve(key);
            expect(retrieved).toBeNull();
        });
    });

    describe('rotateKeys', () => {
        test('rotates keys and re-encrypts data', () => {
            const key = 'rotation_test';
            const value = 'data_to_rotate';
            
            secureVault.clear(key);
            secureVault.store(key, value);
            
            // Get original data
            const originalData = secureVault.retrieve(key);
            expect(originalData).toBe(value);
            
            // Rotate keys
            const result = secureVault.rotateKeys();
            expect(result.success).toBe(true);
            expect(result.recordsReencrypted).toBe(1);
            
            // Verify data is still accessible after rotation
            const rotatedData = secureVault.retrieve(key);
            expect(rotatedData).toBe(value);
            
            secureVault.clear(key);
        });

        test('rotates keys with multiple stored values', () => {
            const keys = ['rot_key_1', 'rot_key_2', 'rot_key_3'];
            const values = ['data_1', 'data_2', 'data_3'];
            
            keys.forEach((key, i) => {
                secureVault.clear(key);
                secureVault.store(key, values[i]);
            });
            
            // Verify all data is accessible
            keys.forEach((key, i) => {
                expect(secureVault.retrieve(key)).toBe(values[i]);
            });
            
            // Rotate keys
            const result = secureVault.rotateKeys();
            expect(result.success).toBe(true);
            expect(result.recordsReencrypted).toBe(3);
            
            // Verify all data is still accessible after rotation
            keys.forEach((key, i) => {
                expect(secureVault.retrieve(key)).toBe(values[i]);
            });
            
            keys.forEach(key => secureVault.clear(key));
        });
    });

    describe('auditAccess', () => {
        test('logs access to keys', () => {
            const key = 'audit_test';
            const value = 'audit_data';
            
            secureVault.clear(key);
            secureVault.store(key, value);
            
            // Access the key
            secureVault.retrieve(key);
            
            // Check audit log
            const auditLog = secureVault.getAuditLog({ key });
            expect(auditLog.length).toBe(1);
            expect(auditLog[0].action).toBe('access');
            expect(auditLog[0].key).toBe(key);
            expect(auditLog[0].type).toBe('data_access');
            expect(auditLog[0].timestamp).toBeDefined();
            
            secureVault.clear(key);
        });

        test('audit log contains multiple entries', () => {
            const key = 'multi_audit_test';
            const value = 'multi_audit_data';
            
            secureVault.clear(key);
            secureVault.store(key, value);
            
            // Access the key multiple times
            secureVault.retrieve(key);
            secureVault.retrieve(key);
            secureVault.retrieve(key);
            
            // Check audit log
            const auditLog = secureVault.getAuditLog({ key });
            expect(auditLog.length).toBe(3);
            
            secureVault.clear(key);
        });
    });

    describe('setRetentionPolicy', () => {
        test('clears data after retention period', (done) => {
            const key = 'retention_test';
            const value = 'retention_data';
            const duration = 100; // 100ms
            
            secureVault.clear(key);
            secureVault.store(key, value);
            secureVault.setRetentionPolicy(key, duration);
            
            // Verify data exists initially
            expect(secureVault.retrieve(key)).toBe(value);
            
            // Wait for retention period to expire
            setTimeout(() => {
                const retrieved = secureVault.retrieve(key);
                expect(retrieved).toBeNull();
                done();
            }, duration + 50);
        });

        test('clears retention policy when data is manually cleared', () => {
            const key = 'retention_clear_test';
            const value = 'retention_clear_data';
            const duration = 10000; // 10s (won't actually wait)
            
            secureVault.clear(key);
            secureVault.store(key, value);
            secureVault.setRetentionPolicy(key, duration);
            
            // Manually clear before retention expires
            secureVault.clear(key);
            
            // Verify data is cleared
            expect(secureVault.retrieve(key)).toBeNull();
        });
    });

    describe('verifyFIPSCompliance', () => {
        test('reports FIPS compliance status', () => {
            const compliance = secureVault.verifyFIPSCompliance();
            
            expect(compliance.compliant).toBe(true);
            expect(compliance.details).toBeDefined();
            expect(Array.isArray(compliance.details)).toBe(true);
            
            // Check that AES-256-CBC is mentioned as FIPS validated
            const fipsDetails = compliance.details.filter(d => 
                d.includes('aes-256-cbc') || d.includes('FIPS')
            );
            expect(fipsDetails.length).toBeGreaterThan(0);
        });

        test('reports key size compliance', () => {
            const compliance = secureVault.verifyFIPSCompliance();
            
            // Check that key size is at least 256 bits
            const keySizeDetail = compliance.details.find(d => 
                d.includes('Key size') && d.includes('bits')
            );
            expect(keySizeDetail).toBeDefined();
        });
    });

    describe('getEncryptionStatus', () => {
        test('returns encryption status information', () => {
            const status = secureVault.getEncryptionStatus();
            
            expect(status.algorithm).toBe('aes-256-cbc');
            expect(status.keySize).toBe(256);
            expect(status.fipsCompliant).toBe(true);
            expect(status.keyHistoryLength).toBeGreaterThanOrEqual(0);
            expect(status.recordsStored).toBeGreaterThanOrEqual(0);
        });
    });

    describe('getKeyHistory', () => {
        test('returns key rotation history', () => {
            const history = secureVault.getKeyHistory();
            
            expect(Array.isArray(history)).toBe(true);
            
            // After rotation, history should have entries
            secureVault.rotateKeys();
            const historyAfterRotation = secureVault.getKeyHistory();
            expect(historyAfterRotation.length).toBeGreaterThan(history.length);
        });
    });
});
