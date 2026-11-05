/**
 * Performance Optimizer for transaction processing.
 * Implements caching layer, metrics collection, and throttling.
 */

/**
 * Performance Optimizer class for performance monitoring and optimization.
 */
class PerformanceOptimizer {
    constructor() {
        // Cache storage: Map<key, { value, expiresAt }>
        this.cache = new Map();
        
        // Metrics storage: Map<operationName, { count, totalTimeMs, minTimeMs, maxTimeMs }>
        this.metrics = new Map();
        
        // Throttling state: Map<requestId, { count, windowStart }>
        this.throttleState = new Map();
        
        // Throttling configuration
        this.throttleConfig = {
            maxRequests: 100,
            windowMs: 60000 // 1 minute
        };
        
        // Performance threshold in milliseconds
        this.performanceThresholdMs = 500;
        
        // Cache TTL defaults (in milliseconds)
        this.defaultTtl = 300000; // 5 minutes
    }

    /**
     * Get a value from the cache.
     * @param {string} key - Cache key
     * @returns {any|null} Cached value or null if not found or expired
     */
    cacheGet(key) {
        const record = this.cache.get(key);
        
        if (!record) {
            return null;
        }
        
        // Check if expired
        if (Date.now() > record.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        
        return record.value;
    }

    /**
     * Set a value in the cache with optional TTL.
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttl - Time to live in milliseconds (default: 5 minutes)
     */
    cacheSet(key, value, ttl = this.defaultTtl) {
        const expiresAt = Date.now() + ttl;
        
        this.cache.set(key, {
            value,
            expiresAt
        });
    }

    /**
     * Invalidate cache entries matching a pattern.
     * @param {string} pattern - Pattern to match (supports * wildcard)
     */
    cacheInvalidate(pattern) {
        if (!pattern || pattern === '*') {
            // Clear all cache
            this.cache.clear();
            return;
        }
        
        // Convert pattern to regex (convert * to .*)
        const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*');
        const regex = new RegExp(`^${regexPattern}$`);
        
        // Find and delete matching keys
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Measure the execution time of an operation.
     * @param {string} name - Operation name for metrics
     * @param {Function} fn - Function to measure
     * @returns {any} Result of the function
     */
    measureOperation(name, fn) {
        const startTime = Date.now();
        let result;
        let error = null;
        
        try {
            result = fn();
        } catch (err) {
            error = err;
        }
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Update metrics
        this.updateMetrics(name, duration);
        
        // Log performance warning if threshold exceeded
        if (duration > this.performanceThresholdMs) {
            console.warn(`[PERFORMANCE] Operation '${name}' took ${duration}ms (threshold: ${this.performanceThresholdMs}ms)`);
        }
        
        // Re-throw error if occurred
        if (error) {
            throw error;
        }
        
        return result;
    }

    /**
     * Update metrics for an operation.
     * @param {string} name - Operation name
     * @param {number} duration - Execution time in milliseconds
     */
    updateMetrics(name, duration) {
        if (!this.metrics.has(name)) {
            this.metrics.set(name, {
                count: 0,
                totalTimeMs: 0,
                minTimeMs: Infinity,
                maxTimeMs: 0
            });
        }
        
        const metric = this.metrics.get(name);
        metric.count++;
        metric.totalTimeMs += duration;
        metric.minTimeMs = Math.min(metric.minTimeMs, duration);
        metric.maxTimeMs = Math.max(metric.maxTimeMs, duration);
    }

    /**
     * Get metrics for all operations.
     * @returns {Object} Metrics object
     */
    getMetrics() {
        const result = {};
        
        for (const [name, metric] of this.metrics.entries()) {
            result[name] = {
                count: metric.count,
                totalTimeMs: metric.totalTimeMs,
                avgTimeMs: metric.count > 0 ? metric.totalTimeMs / metric.count : 0,
                minTimeMs: metric.minTimeMs === Infinity ? 0 : metric.minTimeMs,
                maxTimeMs: metric.maxTimeMs
            };
        }
        
        return result;
    }

    /**
     * Get metrics for a specific operation.
     * @param {string} name - Operation name
     * @returns {Object|null} Metrics or null if not found
     */
    getOperationMetrics(name) {
        const metric = this.metrics.get(name);
        
        if (!metric) {
            return null;
        }
        
        return {
            count: metric.count,
            totalTimeMs: metric.totalTimeMs,
            avgTimeMs: metric.count > 0 ? metric.totalTimeMs / metric.count : 0,
            minTimeMs: metric.minTimeMs === Infinity ? 0 : metric.minTimeMs,
            maxTimeMs: metric.maxTimeMs
        };
    }

    /**
     * Get list of bottleneck operations (avg time > threshold).
     * @returns {Array} Array of bottleneck operation names
     */
    getBottlenecks() {
        const bottlenecks = [];
        
        for (const [name, metric] of this.metrics.entries()) {
            const avgTime = metric.count > 0 ? metric.totalTimeMs / metric.count : 0;
            
            if (avgTime > this.performanceThresholdMs) {
                bottlenecks.push({
                    name,
                    avgTimeMs: avgTime,
                    count: metric.count
                });
            }
        }
        
        return bottlenecks;
    }

    /**
     * Throttle a request.
     * @param {Object} request - Request object with optional id
     * @returns {Object} Throttle result
     */
    throttle(request) {
        const requestId = request.id || 'default';
        const now = Date.now();
        
        // Get or create throttle state for this request
        let state = this.throttleState.get(requestId);
        
        if (!state) {
            state = {
                count: 0,
                windowStart: now
            };
            this.throttleState.set(requestId, state);
        }
        
        // Check if window has expired
        if (now - state.windowStart > this.throttleConfig.windowMs) {
            state.count = 0;
            state.windowStart = now;
        }
        
        // Check if under limit
        if (state.count < this.throttleConfig.maxRequests) {
            state.count++;
            return {
                allowed: true,
                remaining: this.throttleConfig.maxRequests - state.count,
                resetAt: state.windowStart + this.throttleConfig.windowMs
            };
        }
        
        return {
            allowed: false,
            remaining: 0,
            resetAt: state.windowStart + this.throttleConfig.windowMs
        };
    }

    /**
     * Check if a request is throttled.
     * @param {Object} request - Request object with optional id
     * @returns {boolean} True if throttled
     */
    isThrottled(request) {
        const result = this.throttle(request);
        return !result.allowed;
    }

    /**
     * Set throttling configuration.
     * @param {Object} config - Throttling configuration
     * @param {number} config.maxRequests - Maximum requests per window
     * @param {number} config.windowMs - Window size in milliseconds
     */
    setThrottleConfig(config) {
        if (config.maxRequests !== undefined) {
            this.throttleConfig.maxRequests = config.maxRequests;
        }
        if (config.windowMs !== undefined) {
            this.throttleConfig.windowMs = config.windowMs;
        }
    }

    /**
     * Get throttling configuration.
     * @returns {Object} Current throttling configuration
     */
    getThrottleConfig() {
        return { ...this.throttleConfig };
    }

    /**
     * Set performance threshold.
     * @param {number} thresholdMs - Threshold in milliseconds
     */
    setPerformanceThreshold(thresholdMs) {
        this.performanceThresholdMs = thresholdMs;
    }

    /**
     * Get performance threshold.
     * @returns {number} Threshold in milliseconds
     */
    getPerformanceThreshold() {
        return this.performanceThresholdMs;
    }

    /**
     * Clear all cache entries.
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Clear metrics for all operations.
     */
    clearMetrics() {
        this.metrics.clear();
    }

    /**
     * Clear throttle state.
     */
    clearThrottleState() {
        this.throttleState.clear();
    }

    /**
     * Reset all state (useful for testing).
     */
    reset() {
        this.cache.clear();
        this.metrics.clear();
        this.throttleState.clear();
    }

    /**
     * Get cache statistics.
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        let totalSize = 0;
        let expiredCount = 0;
        
        for (const [key, record] of this.cache.entries()) {
            totalSize += JSON.stringify(record.value).length;
            
            if (Date.now() > record.expiresAt) {
                expiredCount++;
            }
        }
        
        return {
            totalEntries: this.cache.size,
            totalSizeBytes: totalSize,
            expiredCount,
            remainingEntries: this.cache.size - expiredCount
        };
    }

    /**
     * Get performance optimizer configuration.
     * @returns {Object} Configuration
     */
    getConfig() {
        return {
            defaultTtl: this.defaultTtl,
            performanceThresholdMs: this.performanceThresholdMs,
            throttleConfig: this.throttleConfig
        };
    }

    /**
     * Update performance optimizer configuration.
     * @param {Object} config - Configuration to update
     */
    updateConfig(config) {
        if (config.defaultTtl !== undefined) {
            this.defaultTtl = config.defaultTtl;
        }
        if (config.performanceThresholdMs !== undefined) {
            this.performanceThresholdMs = config.performanceThresholdMs;
        }
        if (config.throttleConfig !== undefined) {
            this.throttleConfig = { ...this.throttleConfig, ...config.throttleConfig };
        }
    }
}

module.exports = new PerformanceOptimizer();
