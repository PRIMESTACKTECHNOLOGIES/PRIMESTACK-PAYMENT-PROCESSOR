const performanceOptimizer = require('../utils/performanceOptimizer');

/**
 * Rate limiting middleware for API endpoints.
 * Enforces rate limits on requests using a sliding window algorithm.
 * 
 * Usage: Apply to any endpoint that needs rate limiting.
 */

/**
 * Create a rate limiter middleware with custom configuration.
 * @param {Object} options - Rate limiter options
 * @param {number} options.maxRequests - Maximum requests allowed in window (default: 100)
 * @param {number} options.windowMs - Time window in milliseconds (default: 60000)
 * @param {string} options.keyGenerator - Function to generate request key (default: uses IP)
 * @returns {Function} Express middleware function
 */
const createRateLimiter = (options = {}) => {
    const {
        maxRequests = 100,
        windowMs = 60000,
        keyGenerator = (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown'
    } = options;

    // Configure performance optimizer throttle
    performanceOptimizer.setThrottleConfig({ maxRequests, windowMs });

    // Create local throttle state for this rate limiter instance
    const throttleState = new Map();
    const throttleConfig = { maxRequests, windowMs };

    return (req, res, next) => {
        const requestId = keyGenerator(req);
        const now = Date.now();
        
        // Get or create throttle state for this request
        let state = throttleState.get(requestId);
        
        if (!state) {
            state = {
                count: 0,
                windowStart: now
            };
            throttleState.set(requestId, state);
        }
        
        // Check if window has expired
        if (now - state.windowStart > throttleConfig.windowMs) {
            state.count = 0;
            state.windowStart = now;
        }
        
        // Check if under limit
        if (state.count < throttleConfig.maxRequests) {
            state.count++;
            const remaining = throttleConfig.maxRequests - state.count;
            const resetAt = state.windowStart + throttleConfig.windowMs;
            
            // Store rate limit info on response for logging
            res.setHeader('X-RateLimit-Limit', throttleConfig.maxRequests.toString());
            res.setHeader('X-RateLimit-Remaining', remaining.toString());
            res.setHeader('X-RateLimit-Reset', new Date(resetAt).toISOString());
            
            next();
        } else {
            // Rate limit exceeded
            const remaining = 0;
            const resetAt = state.windowStart + throttleConfig.windowMs;
            
            // Store rate limit info on response for logging
            res.setHeader('X-RateLimit-Limit', throttleConfig.maxRequests.toString());
            res.setHeader('X-RateLimit-Remaining', '0');
            res.setHeader('X-RateLimit-Reset', new Date(resetAt).toISOString());
            
            return res.status(429).json({
                success: false,
                message: 'Rate limit exceeded',
                retryAfter: Math.ceil((resetAt - now) / 1000)
            });
        }
    };
};

/**
 * Default rate limiter with standard configuration.
 * Allows 100 requests per minute per IP address.
 */
const defaultRateLimiter = createRateLimiter({
    maxRequests: 100,
    windowMs: 60000
});

/**
 * Strict rate limiter for sensitive endpoints.
 * Allows 20 requests per minute per IP address.
 */
const strictRateLimiter = createRateLimiter({
    maxRequests: 20,
    windowMs: 60000
});

/**
 * Permissive rate limiter for public endpoints.
 * Allows 500 requests per minute per IP address.
 */
const permissiveRateLimiter = createRateLimiter({
    maxRequests: 500,
    windowMs: 60000
});

module.exports = {
    createRateLimiter,
    defaultRateLimiter,
    strictRateLimiter,
    permissiveRateLimiter
};