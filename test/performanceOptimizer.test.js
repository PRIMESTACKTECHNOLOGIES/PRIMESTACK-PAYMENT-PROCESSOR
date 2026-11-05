const fc = require('fast-check');
const performanceOptimizer = require('../utils/performanceOptimizer');

/**
 * Property: Cache Get/Set Round-Trip
 * For any key-value pair with TTL, setting and then getting should return the original value.
 * Validates: Requirements 7.4
 */
describe('Cache Get/Set Round-Trip', () => {
    beforeEach(() => {
        performanceOptimizer.reset();
    });

    test('cacheSet and cacheGet return original value', () => {
        fc.assert(fc.property(
            fc.string({ minLength: 1, maxLength: 100 }),
            fc.anything(),
            fc.integer({ min: 100, max: 10000 }),
            (key, value, ttl) => {
                performanceOptimizer.cacheSet(key, value, ttl);
                const retrieved = performanceOptimizer.cacheGet(key);
                
                expect(retrieved).toEqual(value);
                return true;
            }
        ), { numRuns: 100 });
    });

    test('cacheGet returns null for non-existent key', () => {
        const result = performanceOptimizer.cacheGet('non-existent-key');
        expect(result).toBeNull();
    });

    test('cacheGet returns null for expired entry', (done) => {
        const key = 'test-key';
        const value = { data: 'test' };
        
        // Set with very short TTL
        performanceOptimizer.cacheSet(key, value, 10);
        
        // Wait for expiration
        setTimeout(() => {
            const result = performanceOptimizer.cacheGet(key);
            expect(result).toBeNull();
            done();
        }, 50);
    }, 100);
});

/**
 * Property: Cache Invalidation Pattern Matching
 * For any cache entry, cacheInvalidate with matching pattern should remove it.
 * Validates: Requirements 7.4
 */
describe('Cache Invalidation', () => {
    beforeEach(() => {
        performanceOptimizer.reset();
    });

    test('cacheInvalidate with * clears all cache', () => {
        performanceOptimizer.cacheSet('key1', 'value1');
        performanceOptimizer.cacheSet('key2', 'value2');
        performanceOptimizer.cacheSet('key3', 'value3');
        
        performanceOptimizer.cacheInvalidate('*');
        
        expect(performanceOptimizer.cacheGet('key1')).toBeNull();
        expect(performanceOptimizer.cacheGet('key2')).toBeNull();
        expect(performanceOptimizer.cacheGet('key3')).toBeNull();
    });

    test('cacheInvalidate with specific pattern matches keys', () => {
        performanceOptimizer.cacheSet('user:1:profile', { name: 'John' });
        performanceOptimizer.cacheSet('user:2:profile', { name: 'Jane' });
        performanceOptimizer.cacheSet('order:123', { id: 123 });
        
        // Invalidate all user profiles
        performanceOptimizer.cacheInvalidate('user:*:profile');
        
        expect(performanceOptimizer.cacheGet('user:1:profile')).toBeNull();
        expect(performanceOptimizer.cacheGet('user:2:profile')).toBeNull();
        expect(performanceOptimizer.cacheGet('order:123')).not.toBeNull();
    });

    test('cacheInvalidate with exact key pattern', () => {
        performanceOptimizer.cacheSet('exact-key', 'value1');
        performanceOptimizer.cacheSet('exact-key-extended', 'value2');
        
        // Invalidate exact key only
        performanceOptimizer.cacheInvalidate('exact-key');
        
        expect(performanceOptimizer.cacheGet('exact-key')).toBeNull();
        expect(performanceOptimizer.cacheGet('exact-key-extended')).not.toBeNull();
    });
});

/**
 * Property: Metrics Collection Accuracy
 * For any operation, measured execution time should be recorded correctly.
 * Validates: Requirements 7.5
 */
describe('Metrics Collection', () => {
    beforeEach(() => {
        performanceOptimizer.reset();
    });

    test('measureOperation records execution time', () => {
        const operationName = 'test-operation';
        
        const result = performanceOptimizer.measureOperation(operationName, () => {
            return 42;
        });
        
        expect(result).toBe(42);
        
        const metrics = performanceOptimizer.getOperationMetrics(operationName);
        expect(metrics).not.toBeNull();
        expect(metrics.count).toBe(1);
        expect(metrics.totalTimeMs).toBeGreaterThanOrEqual(0);
    });

    test('measureOperation handles synchronous errors', () => {
        const operationName = 'error-operation';
        
        expect(() => {
            performanceOptimizer.measureOperation(operationName, () => {
                throw new Error('Test error');
            });
        }).toThrow('Test error');
        
        const metrics = performanceOptimizer.getOperationMetrics(operationName);
        expect(metrics).not.toBeNull();
        expect(metrics.count).toBe(1);
    });

    test('measureOperation handles async operations', async () => {
        const operationName = 'async-operation';
        
        const result = await performanceOptimizer.measureOperation(operationName, async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return 'async-result';
        });
        
        expect(result).toBe('async-result');
        
        const metrics = performanceOptimizer.getOperationMetrics(operationName);
        expect(metrics).not.toBeNull();
        expect(metrics.count).toBe(1);
    });

    test('getMetrics returns all operation metrics', () => {
        performanceOptimizer.measureOperation('op1', () => {});
        performanceOptimizer.measureOperation('op2', () => {});
        performanceOptimizer.measureOperation('op3', () => {});
        
        const allMetrics = performanceOptimizer.getMetrics();
        
        expect(allMetrics.op1).toBeDefined();
        expect(allMetrics.op2).toBeDefined();
        expect(allMetrics.op3).toBeDefined();
    });

    test('metrics track multiple executions', () => {
        const operationName = 'multi-execution';
        
        for (let i = 0; i < 5; i++) {
            performanceOptimizer.measureOperation(operationName, () => {});
        }
        
        const metrics = performanceOptimizer.getOperationMetrics(operationName);
        expect(metrics.count).toBe(5);
        expect(metrics.totalTimeMs).toBeGreaterThanOrEqual(0);
    });
});

/**
 * Property: Bottleneck Detection
 * Operations exceeding threshold should be identified as bottlenecks.
 * Validates: Requirements 7.5
 */
describe('Bottleneck Detection', () => {
    beforeEach(() => {
        performanceOptimizer.reset();
        performanceOptimizer.setPerformanceThreshold(10); // 10ms threshold for testing
    });

    test('getBottlenecks identifies slow operations', () => {
        // Simulate slow operation
        performanceOptimizer.measureOperation('slow-op', () => {
            const start = Date.now();
            while (Date.now() - start < 20) {} // 20ms delay
        });
        
        const bottlenecks = performanceOptimizer.getBottlenecks();
        
        expect(bottlenecks.length).toBeGreaterThan(0);
        expect(bottlenecks.find(b => b.name === 'slow-op')).toBeDefined();
    });

    test('getBottlenecks does not flag fast operations', () => {
        performanceOptimizer.measureOperation('fast-op', () => {
            // Very fast operation
        });
        
        const bottlenecks = performanceOptimizer.getBottlenecks();
        
        expect(bottlenecks.find(b => b.name === 'fast-op')).toBeUndefined();
    });
});

/**
 * Property: Throttling Rate Limiting
 * Requests should be allowed up to the limit, then rejected.
 * Validates: Requirements 9.4
 */
describe('Throttling', () => {
    beforeEach(() => {
        performanceOptimizer.reset();
        performanceOptimizer.setThrottleConfig({
            maxRequests: 5,
            windowMs: 1000
        });
    });

    test('throttle allows requests under limit', () => {
        for (let i = 0; i < 5; i++) {
            const result = performanceOptimizer.throttle({ id: 'test-client' });
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(4 - i);
        }
    });

    test('throttle rejects requests over limit', () => {
        // Use up all requests
        for (let i = 0; i < 5; i++) {
            performanceOptimizer.throttle({ id: 'test-client' });
        }
        
        // Next request should be rejected
        const result = performanceOptimizer.throttle({ id: 'test-client' });
        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
    });

    test('isThrottled returns true when over limit', () => {
        // Use up all requests
        for (let i = 0; i < 5; i++) {
            performanceOptimizer.throttle({ id: 'test-client-2' });
        }
        
        expect(performanceOptimizer.isThrottled({ id: 'test-client-2' })).toBe(true);
    });

    test('isThrottled returns false when under limit', () => {
        expect(performanceOptimizer.isThrottled({ id: 'test-client-3' })).toBe(false);
    });

    test('throttle window resets after timeout', (done) => {
        performanceOptimizer.setThrottleConfig({
            maxRequests: 2,
            windowMs: 50
        });
        
        // Use up requests
        performanceOptimizer.throttle({ id: 'test-client-4' });
        performanceOptimizer.throttle({ id: 'test-client-4' });
        
        expect(performanceOptimizer.isThrottled({ id: 'test-client-4' })).toBe(true);
        
        // Wait for window to reset
        setTimeout(() => {
            expect(performanceOptimizer.isThrottled({ id: 'test-client-4' })).toBe(false);
            done();
        }, 100);
    }, 200);
});

// Unit tests for specific examples
describe('Performance Optimizer Unit Tests', () => {
    beforeEach(() => {
        performanceOptimizer.reset();
    });

    describe('cacheGet', () => {
        test('returns cached value', () => {
            performanceOptimizer.cacheSet('test-key', { data: 'test' });
            const result = performanceOptimizer.cacheGet('test-key');
            
            expect(result).toEqual({ data: 'test' });
        });

        test('returns null for expired cache', (done) => {
            performanceOptimizer.cacheSet('expiring-key', 'value', 10);
            
            setTimeout(() => {
                const result = performanceOptimizer.cacheGet('expiring-key');
                expect(result).toBeNull();
                done();
            }, 50);
        }, 100);
    });

    describe('cacheSet', () => {
        test('sets value with default TTL', () => {
            performanceOptimizer.cacheSet('default-ttl-key', 'value');
            const result = performanceOptimizer.cacheGet('default-ttl-key');
            
            expect(result).toBe('value');
        });

        test('sets value with custom TTL', () => {
            performanceOptimizer.cacheSet('custom-ttl-key', 'value', 10000);
            const result = performanceOptimizer.cacheGet('custom-ttl-key');
            
            expect(result).toBe('value');
        });
    });

    describe('cacheInvalidate', () => {
        test('invalidates specific key', () => {
            performanceOptimizer.cacheSet('key-to-invalidate', 'value');
            performanceOptimizer.cacheSet('key-to-keep', 'value');
            
            performanceOptimizer.cacheInvalidate('key-to-invalidate');
            
            expect(performanceOptimizer.cacheGet('key-to-invalidate')).toBeNull();
            expect(performanceOptimizer.cacheGet('key-to-keep')).not.toBeNull();
        });

        test('invalidates pattern with wildcard', () => {
            performanceOptimizer.cacheSet('api:users:1', 'user1');
            performanceOptimizer.cacheSet('api:users:2', 'user2');
            performanceOptimizer.cacheSet('api:orders:1', 'order1');
            
            performanceOptimizer.cacheInvalidate('api:users:*');
            
            expect(performanceOptimizer.cacheGet('api:users:1')).toBeNull();
            expect(performanceOptimizer.cacheGet('api:users:2')).toBeNull();
            expect(performanceOptimizer.cacheGet('api:orders:1')).not.toBeNull();
        });
    });

    describe('measureOperation', () => {
        test('measures simple function', () => {
            const result = performanceOptimizer.measureOperation('simple', () => {
                return 'result';
            });
            
            expect(result).toBe('result');
        });

        test('measures function with side effects', () => {
            let sideEffectValue = 0;
            
            performanceOptimizer.measureOperation('side-effect', () => {
                sideEffectValue = 42;
            });
            
            expect(sideEffectValue).toBe(42);
        });

        test('logs performance warning for slow operations', () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
            performanceOptimizer.setPerformanceThreshold(5);
            
            performanceOptimizer.measureOperation('slow', () => {
                const start = Date.now();
                while (Date.now() - start < 10) {}
            });
            
            expect(warnSpy).toHaveBeenCalled();
            warnSpy.mockRestore();
        });
    });

    describe('getMetrics', () => {
        test('returns empty object when no metrics', () => {
            const metrics = performanceOptimizer.getMetrics();
            expect(metrics).toEqual({});
        });

        test('returns metrics after operations', () => {
            performanceOptimizer.measureOperation('test-op', () => {});
            
            const metrics = performanceOptimizer.getMetrics();
            expect(metrics['test-op']).toBeDefined();
            expect(metrics['test-op'].count).toBe(1);
        });
    });

    describe('getBottlenecks', () => {
        test('returns empty array when no bottlenecks', () => {
            performanceOptimizer.setPerformanceThreshold(1000);
            performanceOptimizer.measureOperation('fast', () => {});
            
            const bottlenecks = performanceOptimizer.getBottlenecks();
            expect(bottlenecks).toEqual([]);
        });

        test('returns bottleneck operations', () => {
            performanceOptimizer.setPerformanceThreshold(1);
            
            performanceOptimizer.measureOperation('slow', () => {
                const start = Date.now();
                while (Date.now() - start < 10) {}
            });
            
            const bottlenecks = performanceOptimizer.getBottlenecks();
            expect(bottlenecks.length).toBeGreaterThan(0);
            expect(bottlenecks[0].name).toBe('slow');
        });
    });

    describe('throttle', () => {
        test('returns throttle result with remaining count', () => {
            performanceOptimizer.setThrottleConfig({
                maxRequests: 10,
                windowMs: 60000
            });
            
            const result = performanceOptimizer.throttle({ id: 'client-1' });
            
            expect(result).toEqual({
                allowed: true,
                remaining: 9,
                resetAt: expect.any(Number)
            });
        });

        test('handles requests without id', () => {
            const result = performanceOptimizer.throttle({});
            
            expect(result.allowed).toBe(true);
        });
    });

    describe('isThrottled', () => {
        test('returns false when not throttled', () => {
            expect(performanceOptimizer.isThrottled({ id: 'client-2' })).toBe(false);
        });

        test('returns true when throttled', () => {
            performanceOptimizer.setThrottleConfig({
                maxRequests: 1,
                windowMs: 60000
            });
            
            performanceOptimizer.throttle({ id: 'client-2' });
            expect(performanceOptimizer.isThrottled({ id: 'client-2' })).toBe(true);
        });
    });

    describe('getCacheStats', () => {
        test('returns cache statistics', () => {
            performanceOptimizer.cacheSet('key1', 'value1');
            performanceOptimizer.cacheSet('key2', 'value2');
            
            const stats = performanceOptimizer.getCacheStats();
            
            expect(stats.totalEntries).toBe(2);
            expect(stats.totalSizeBytes).toBeGreaterThan(0);
            expect(stats.remainingEntries).toBe(2);
        });
    });

    describe('getConfig and updateConfig', () => {
        test('returns current configuration', () => {
            // Reset to clear any state from previous tests
            performanceOptimizer.reset();
            performanceOptimizer.updateConfig({
                defaultTtl: 300000,
                performanceThresholdMs: 500,
                throttleConfig: {
                    maxRequests: 100,
                    windowMs: 60000
                }
            });
            
            const config = performanceOptimizer.getConfig();
            
            expect(config).toEqual({
                defaultTtl: 300000,
                performanceThresholdMs: 500,
                throttleConfig: {
                    maxRequests: 100,
                    windowMs: 60000
                }
            });
        });

        test('updates configuration', () => {
            performanceOptimizer.updateConfig({
                defaultTtl: 600000,
                performanceThresholdMs: 250,
                throttleConfig: {
                    maxRequests: 50,
                    windowMs: 30000
                }
            });
            
            const config = performanceOptimizer.getConfig();
            
            expect(config.defaultTtl).toBe(600000);
            expect(config.performanceThresholdMs).toBe(250);
            expect(config.throttleConfig.maxRequests).toBe(50);
        });
    });

    describe('reset', () => {
        test('clears all state', () => {
            performanceOptimizer.cacheSet('key', 'value');
            performanceOptimizer.measureOperation('op', () => {});
            performanceOptimizer.throttle({ id: 'client' });
            
            performanceOptimizer.reset();
            
            expect(performanceOptimizer.cacheGet('key')).toBeNull();
            expect(performanceOptimizer.getMetrics()).toEqual({});
            expect(performanceOptimizer.isThrottled({ id: 'client' })).toBe(false);
        });
    });
});

// Integration tests
describe('Performance Optimizer Integration', () => {
    beforeEach(() => {
        performanceOptimizer.reset();
    });

    test('full transaction processing flow with performance monitoring', () => {
        // Simulate transaction processing with performance monitoring
        const transactionId = 'TXN_12345';
        
        // Step 1: Validate card (measure performance)
        const cardValidationResult = performanceOptimizer.measureOperation('validateCard', () => {
            return { isValid: true, cardType: 'Visa', lastFour: '1234' };
        });
        
        expect(cardValidationResult.isValid).toBe(true);
        
        // Step 2: Process payment (measure performance)
        const paymentResult = performanceOptimizer.measureOperation('processPayment', () => {
            return { status: 'Approved', transactionId };
        });
        
        expect(paymentResult.status).toBe('Approved');
        
        // Step 3: Cache transaction result
        performanceOptimizer.cacheSet(`transaction:${transactionId}`, paymentResult);
        const cachedResult = performanceOptimizer.cacheGet(`transaction:${transactionId}`);
        
        expect(cachedResult).toEqual(paymentResult);
        
        // Step 4: Check throttling for admin API
        const throttleResult = performanceOptimizer.throttle({ 
            id: 'admin-api',
            path: '/api/transactions' 
        });
        
        expect(throttleResult.allowed).toBe(true);
        
        // Step 5: Verify metrics were collected
        const metrics = performanceOptimizer.getMetrics();
        expect(metrics.validateCard).toBeDefined();
        expect(metrics.processPayment).toBeDefined();
    });

    test('cache invalidation with pattern matching in transaction flow', () => {
        // Cache various transaction-related data
        performanceOptimizer.cacheSet('transaction:TXN_001', { status: 'Approved' });
        performanceOptimizer.cacheSet('transaction:TXN_002', { status: 'Pending' });
        performanceOptimizer.cacheSet('user:123:transactions', [{ id: 'TXN_001' }]);
        performanceOptimizer.cacheSet('merchant:456:summary', { total: 1000 });
        
        // Invalidate all transaction-related data
        performanceOptimizer.cacheInvalidate('transaction:*');
        
        // Verify transaction data is invalidated
        expect(performanceOptimizer.cacheGet('transaction:TXN_001')).toBeNull();
        expect(performanceOptimizer.cacheGet('transaction:TXN_002')).toBeNull();
        
        // Verify other data is preserved
        expect(performanceOptimizer.cacheGet('user:123:transactions')).not.toBeNull();
        expect(performanceOptimizer.cacheGet('merchant:456:summary')).not.toBeNull();
    });
});
