/**
 * Performance Configuration
 * 
 * This module provides performance settings for the payment processor,
 * including GPU cluster configuration, caching settings, and performance
 * thresholds.
 * 
 * Targets: <500ms transaction processing, 1000+ transactions/second
 */

/**
 * GPU cluster configuration
 * @type {Object}
 */
const gpu = {
    /**
     * Whether GPU processing is enabled
     */
    enabled: true,
    
    /**
     * Initial cluster size (number of GPU nodes)
     */
    clusterSize: 4,
    
    /**
     * Maximum cluster size
     */
    maxClusterSize: 16,
    
    /**
     * Minimum cluster size
     */
    minClusterSize: 1,
    
    /**
     * Whether to enable auto-scaling
     */
    autoScale: true,
    
    /**
     * Enable CPU fallback when GPU processing fails
     */
    cpuFallback: true,
    
    /**
     * GPU utilization threshold for scaling up (0.0 - 1.0)
     */
    scaleUpThreshold: 0.8,
    
    /**
     * GPU utilization threshold for scaling down (0.0 - 1.0)
     */
    scaleDownThreshold: 0.3,
    
    /**
     * Cooldown period after scale-up before another scale-up (ms)
     */
    scaleUpCooldown: 30000,
    
    /**
     * Cooldown period after scale-down before another scale-down (ms)
     */
    scaleDownCooldown: 60000,
    
    /**
     * GPU task distribution strategy
     * Options: 'round-robin', 'least-loaded', 'random'
     */
    distributionStrategy: 'least-loaded',
    
    /**
     * Maximum tasks per GPU node
     */
    maxTasksPerNode: 10,
    
    /**
     * GPU processing timeout in milliseconds
     */
    timeoutMs: 5000,
    
    /**
     * Metrics collection interval in milliseconds
     */
    metricsInterval: 10000
};

/**
 * Caching configuration
 * @type {Object}
 */
const caching = {
    /**
     * Whether caching is enabled
     */
    enabled: true,
    
    /**
     * Default TTL in milliseconds (5 minutes)
     */
    defaultTtl: 300000,
    
    /**
     * Maximum cache size (number of entries)
     */
    maxCacheSize: 10000,
    
    /**
     * Cache entry types and their TTLs
     */
    ttl: {
        /**
         * Card validation rules
         */
        cardRules: 3600000, // 1 hour
        
        /**
         * Merchant settings
         */
        merchantSettings: 300000, // 5 minutes
        
        /**
         * Transaction templates
         */
        transactionTemplates: 600000, // 10 minutes
        
        /**
         * frequently accessed transaction data
         */
        transactionData: 120000, // 2 minutes
        
        /**
         * API response cache
         */
        apiResponse: 60000 // 1 minute
    },
    
    /**
     * Cache invalidation patterns
     */
    invalidation: {
        /**
         * Invalidate on transaction creation
         */
        onTransactionCreate: true,
        
        /**
         * Invalidate on transaction update
         */
        onTransactionUpdate: true,
        
        /**
         * Invalidate on settings change
         */
        onSettingsChange: true,
        
        /**
         * Pattern for bulk invalidation
         */
        bulkPattern: 'transactions:*'
    },
    
    /**
     * Cache statistics collection
     */
    stats: {
        /**
         * Collect cache hit/miss statistics
         */
        collectStats: true,
        
        /**
         * Log cache performance warnings
         */
        logWarnings: true
    }
};

/**
 * Performance thresholds
 * @type {Object}
 */
const thresholds = {
    /**
     * Standard transaction processing time limit in milliseconds
     * Target: <500ms for standard transactions
     */
    transactionTimeMs: 500,
    
    /**
     * High-volume batch processing time limit in milliseconds
     */
    batchProcessingTimeMs: 5000,
    
    /**
     * Minimum throughput target (transactions per second)
     * Target: 1000+ transactions/second
     */
    throughput: 1000,
    
    /**
     * GPU processing time target in milliseconds
     */
    gpuProcessingTimeMs: 100,
    
    /**
     * CPU fallback processing time target in milliseconds
     */
    cpuFallbackTimeMs: 500,
    
    /**
     * Database query time limit in milliseconds
     */
    dbQueryTimeMs: 200,
    
    /**
     * External API call time limit in milliseconds
     */
    externalApiTimeMs: 1000,
    
    /**
     * Memory usage warning threshold (percentage)
     */
    memoryWarningThreshold: 80,
    
    /**
     * CPU usage warning threshold (percentage)
     */
    cpuWarningThreshold: 85
};

/**
 * Performance monitoring configuration
 * @type {Object}
 */
const monitoring = {
    /**
     * Enable performance monitoring
     */
    enabled: true,
    
    /**
     * Metrics collection interval in milliseconds
     */
    interval: 10000,
    
    /**
     * Metrics retention period in days
     */
    retentionDays: 30,
    
    /**
     * Log slow operations
     */
    logSlowOperations: true,
    
    /**
     * Slow operation threshold (multiple of target time)
     */
    slowOperationMultiplier: 2,
    
    /**
     * Alert on performance degradation
     */
    alertOnDegradation: true,
    
    /**
     * Performance degradation threshold (percentage increase)
     */
    degradationThreshold: 50,
    
    /**
     * Metrics to collect
     */
    metrics: {
        /**
         * Transaction processing times
         */
        transactionTimes: true,
        
        /**
         * GPU utilization
         */
        gpuUtilization: true,
        
        /**
         * Cache hit/miss rates
         */
        cacheStats: true,
        
        /**
         * Memory usage
         */
        memoryUsage: true,
        
        /**
         * CPU usage
         */
        cpuUsage: true,
        
        /**
         * Throughput (transactions per second)
         */
        throughput: true,
        
        /**
         * Error rates
         */
        errorRates: true
    }
};

/**
 * Throughput optimization configuration
 * @type {Object}
 */
const throughput = {
    /**
     * Enable request batching
     */
    enableBatching: true,
    
    /**
     * Maximum batch size
     */
    maxBatchSize: 100,
    
    /**
     * Batch processing timeout in milliseconds
     */
    batchTimeoutMs: 100,
    
    /**
     * Enable connection pooling
     */
    enableConnectionPooling: true,
    
    /**
     * Pool size
     */
    poolSize: 10,
    
    /**
     * Enable parallel processing
     */
    enableParallelProcessing: true,
    
    /**
     * Maximum parallel operations
     */
    maxParallelOperations: 10
};

/**
 * Feature flags for performance enhancements
 * @type {Object}
 */
const featureFlags = {
    /**
     * Enable GPU processing
     */
    gpuProcessing: {
        enabled: true,
        rolloutPercentage: 100
    },
    
    /**
     * Enable caching
     */
    caching: {
        enabled: true,
        ttl: 300000
    },
    
    /**
     * Enable request batching
     */
    batching: {
        enabled: true,
        maxSize: 100
    },
    
    /**
     * Enable parallel processing
     */
    parallelProcessing: {
        enabled: true,
        maxOperations: 10
    },
    
    /**
     * Enable performance monitoring
     */
    monitoring: {
        enabled: true,
        interval: 10000
    }
};

/**
 * Export all configuration
 */
module.exports = {
    gpu,
    caching,
    thresholds,
    monitoring,
    throughput,
    featureFlags
};
