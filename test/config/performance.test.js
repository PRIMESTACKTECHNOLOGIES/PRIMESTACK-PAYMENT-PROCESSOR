const performanceConfig = require('../../config/performance');

describe('Performance Configuration', () => {
    describe('GPU Configuration', () => {
        test('should have GPU processing enabled', () => {
            expect(performanceConfig.gpu.enabled).toBe(true);
        });

        test('should have reasonable cluster size', () => {
            expect(performanceConfig.gpu.clusterSize).toBe(4);
        });

        test('should have max cluster size configured', () => {
            expect(performanceConfig.gpu.maxClusterSize).toBe(16);
        });

        test('should have min cluster size configured', () => {
            expect(performanceConfig.gpu.minClusterSize).toBe(1);
        });

        test('should have auto-scaling enabled', () => {
            expect(performanceConfig.gpu.autoScale).toBe(true);
        });

        test('should have CPU fallback enabled', () => {
            expect(performanceConfig.gpu.cpuFallback).toBe(true);
        });

        test('should have scale-up threshold configured', () => {
            expect(performanceConfig.gpu.scaleUpThreshold).toBe(0.8);
        });

        test('should have scale-down threshold configured', () => {
            expect(performanceConfig.gpu.scaleDownThreshold).toBe(0.3);
        });

        test('should have reasonable scale-up cooldown', () => {
            expect(performanceConfig.gpu.scaleUpCooldown).toBe(30000);
        });

        test('should have reasonable scale-down cooldown', () => {
            expect(performanceConfig.gpu.scaleDownCooldown).toBe(60000);
        });

        test('should have distribution strategy configured', () => {
            expect(['round-robin', 'least-loaded', 'random']).toContain(performanceConfig.gpu.distributionStrategy);
        });

        test('should have max tasks per node configured', () => {
            expect(performanceConfig.gpu.maxTasksPerNode).toBe(10);
        });

        test('should have GPU processing timeout configured', () => {
            expect(performanceConfig.gpu.timeoutMs).toBe(5000);
        });

        test('should have metrics interval configured', () => {
            expect(performanceConfig.gpu.metricsInterval).toBe(10000);
        });
    });

    describe('Caching Configuration', () => {
        test('should have caching enabled', () => {
            expect(performanceConfig.caching.enabled).toBe(true);
        });

        test('should have reasonable default TTL', () => {
            expect(performanceConfig.caching.defaultTtl).toBe(300000); // 5 minutes
        });

        test('should have max cache size configured', () => {
            expect(performanceConfig.caching.maxCacheSize).toBe(10000);
        });

        test('should have card rules TTL configured', () => {
            expect(performanceConfig.caching.ttl.cardRules).toBe(3600000); // 1 hour
        });

        test('should have merchant settings TTL configured', () => {
            expect(performanceConfig.caching.ttl.merchantSettings).toBe(300000); // 5 minutes
        });

        test('should have transaction templates TTL configured', () => {
            expect(performanceConfig.caching.ttl.transactionTemplates).toBe(600000); // 10 minutes
        });

        test('should have transaction data TTL configured', () => {
            expect(performanceConfig.caching.ttl.transactionData).toBe(120000); // 2 minutes
        });

        test('should have API response TTL configured', () => {
            expect(performanceConfig.caching.ttl.apiResponse).toBe(60000); // 1 minute
        });

        test('should have invalidation on transaction create', () => {
            expect(performanceConfig.caching.invalidation.onTransactionCreate).toBe(true);
        });

        test('should have invalidation on transaction update', () => {
            expect(performanceConfig.caching.invalidation.onTransactionUpdate).toBe(true);
        });

        test('should have invalidation on settings change', () => {
            expect(performanceConfig.caching.invalidation.onSettingsChange).toBe(true);
        });
    });

    describe('Threshold Configuration', () => {
        test('should have transaction time threshold configured', () => {
            expect(performanceConfig.thresholds.transactionTimeMs).toBe(500);
        });

        test('should have batch processing time threshold configured', () => {
            expect(performanceConfig.thresholds.batchProcessingTimeMs).toBe(5000);
        });

        test('should have throughput target configured', () => {
            expect(performanceConfig.thresholds.throughput).toBe(1000);
        });

        test('should have GPU processing time target configured', () => {
            expect(performanceConfig.thresholds.gpuProcessingTimeMs).toBe(100);
        });

        test('should have CPU fallback time target configured', () => {
            expect(performanceConfig.thresholds.cpuFallbackTimeMs).toBe(500);
        });

        test('should have DB query time limit configured', () => {
            expect(performanceConfig.thresholds.dbQueryTimeMs).toBe(200);
        });

        test('should have external API time limit configured', () => {
            expect(performanceConfig.thresholds.externalApiTimeMs).toBe(1000);
        });

        test('should have memory warning threshold configured', () => {
            expect(performanceConfig.thresholds.memoryWarningThreshold).toBe(80);
        });

        test('should have CPU warning threshold configured', () => {
            expect(performanceConfig.thresholds.cpuWarningThreshold).toBe(85);
        });
    });

    describe('Monitoring Configuration', () => {
        test('should have monitoring enabled', () => {
            expect(performanceConfig.monitoring.enabled).toBe(true);
        });

        test('should have reasonable monitoring interval', () => {
            expect(performanceConfig.monitoring.interval).toBe(10000);
        });

        test('should have reasonable retention period', () => {
            expect(performanceConfig.monitoring.retentionDays).toBe(30);
        });

        test('should log slow operations', () => {
            expect(performanceConfig.monitoring.logSlowOperations).toBe(true);
        });

        test('should have slow operation multiplier configured', () => {
            expect(performanceConfig.monitoring.slowOperationMultiplier).toBe(2);
        });

        test('should alert on performance degradation', () => {
            expect(performanceConfig.monitoring.alertOnDegradation).toBe(true);
        });

        test('should have degradation threshold configured', () => {
            expect(performanceConfig.monitoring.degradationThreshold).toBe(50);
        });

        test('should collect transaction times', () => {
            expect(performanceConfig.monitoring.metrics.transactionTimes).toBe(true);
        });

        test('should collect GPU utilization', () => {
            expect(performanceConfig.monitoring.metrics.gpuUtilization).toBe(true);
        });

        test('should collect cache stats', () => {
            expect(performanceConfig.monitoring.metrics.cacheStats).toBe(true);
        });

        test('should collect memory usage', () => {
            expect(performanceConfig.monitoring.metrics.memoryUsage).toBe(true);
        });

        test('should collect throughput', () => {
            expect(performanceConfig.monitoring.metrics.throughput).toBe(true);
        });
    });

    describe('Throughput Configuration', () => {
        test('should enable request batching', () => {
            expect(performanceConfig.throughput.enableBatching).toBe(true);
        });

        test('should have max batch size configured', () => {
            expect(performanceConfig.throughput.maxBatchSize).toBe(100);
        });

        test('should have batch timeout configured', () => {
            expect(performanceConfig.throughput.batchTimeoutMs).toBe(100);
        });

        test('should enable connection pooling', () => {
            expect(performanceConfig.throughput.enableConnectionPooling).toBe(true);
        });

        test('should have pool size configured', () => {
            expect(performanceConfig.throughput.poolSize).toBe(10);
        });

        test('should enable parallel processing', () => {
            expect(performanceConfig.throughput.enableParallelProcessing).toBe(true);
        });

        test('should have max parallel operations configured', () => {
            expect(performanceConfig.throughput.maxParallelOperations).toBe(10);
        });
    });

    describe('Feature Flags', () => {
        test('should have GPU processing feature flag', () => {
            expect(performanceConfig.featureFlags.gpuProcessing).toBeDefined();
            expect(performanceConfig.featureFlags.gpuProcessing.enabled).toBe(true);
        });

        test('should have caching feature flag', () => {
            expect(performanceConfig.featureFlags.caching).toBeDefined();
            expect(performanceConfig.featureFlags.caching.enabled).toBe(true);
        });

        test('should have batching feature flag', () => {
            expect(performanceConfig.featureFlags.batching).toBeDefined();
            expect(performanceConfig.featureFlags.batching.enabled).toBe(true);
        });

        test('should have parallel processing feature flag', () => {
            expect(performanceConfig.featureFlags.parallelProcessing).toBeDefined();
            expect(performanceConfig.featureFlags.parallelProcessing.enabled).toBe(true);
        });

        test('should have monitoring feature flag', () => {
            expect(performanceConfig.featureFlags.monitoring).toBeDefined();
            expect(performanceConfig.featureFlags.monitoring.enabled).toBe(true);
        });
    });
});
