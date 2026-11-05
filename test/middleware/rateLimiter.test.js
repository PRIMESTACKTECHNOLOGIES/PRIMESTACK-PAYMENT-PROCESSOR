const performanceOptimizer = require('../../utils/performanceOptimizer');
const { 
    createRateLimiter, 
    defaultRateLimiter, 
    strictRateLimiter, 
    permissiveRateLimiter 
} = require('../../middleware/rateLimiter');

// Mock request, response, and next function
const createMockRequest = (ip = '127.0.0.1', path = '/api/test', method = 'GET') => ({
    ip,
    path,
    method,
    headers: {}
});

const createMockResponse = () => {
    const res = {
        setHeader: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
    return res;
};

const createMockNext = () => jest.fn();

describe('Rate Limiter Middleware', () => {
    beforeEach(() => {
        // Reset performance optimizer before each test
        performanceOptimizer.reset();
    });

    describe('createRateLimiter', () => {
        beforeEach(() => {
            performanceOptimizer.reset();
        });

        test('should allow requests under limit', () => {
            const rateLimiter = createRateLimiter({
                maxRequests: 5,
                windowMs: 60000
            });

            for (let i = 0; i < 5; i++) {
                const req = createMockRequest('127.0.0.1');
                const res = createMockResponse();
                const next = createMockNext();

                rateLimiter(req, res, next);

                expect(next).toHaveBeenCalled();
                expect(res.status).not.toHaveBeenCalledWith(429);
            }
        });

        test('should reject requests over limit', () => {
            const rateLimiter = createRateLimiter({
                maxRequests: 3,
                windowMs: 60000
            });

            // Use up all requests
            for (let i = 0; i < 3; i++) {
                const req = createMockRequest('127.0.0.1');
                const res = createMockResponse();
                const next = createMockNext();

                rateLimiter(req, res, next);
            }

            // Next request should be rejected
            const req = createMockRequest('127.0.0.1');
            const res = createMockResponse();
            const next = createMockNext();

            rateLimiter(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(429);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Rate limit exceeded',
                retryAfter: expect.any(Number)
            });
        });

        test('should set rate limit headers', () => {
            const rateLimiter = createRateLimiter({
                maxRequests: 10,
                windowMs: 60000
            });

            const req = createMockRequest('127.0.0.1');
            const res = createMockResponse();
            const next = createMockNext();

            rateLimiter(req, res, next);

            expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
            expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '9');
            expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
        });

        test('should use custom key generator', () => {
            performanceOptimizer.reset();
            const rateLimiter = createRateLimiter({
                maxRequests: 1,
                windowMs: 60000,
                keyGenerator: (req) => req.headers['x-api-key'] || 'anonymous'
            });

            const apiKey1 = 'key-1';
            const apiKey2 = 'key-2';

            // First key uses its quota
            const req1 = createMockRequest('127.0.0.1');
            req1.headers['x-api-key'] = apiKey1;
            const res1 = createMockResponse();
            const next1 = createMockNext();

            rateLimiter(req1, res1, next1);
            expect(next1).toHaveBeenCalled();

            // Second key uses separate quota
            const req2 = createMockRequest('127.0.0.1');
            req2.headers['x-api-key'] = apiKey2;
            const res2 = createMockResponse();
            const next2 = createMockNext();

            rateLimiter(req2, res2, next2);
            expect(next2).toHaveBeenCalled();

            // Third request with first key should be rejected
            const req3 = createMockRequest('127.0.0.1');
            req3.headers['x-api-key'] = apiKey1;
            const res3 = createMockResponse();
            const next3 = createMockNext();

            rateLimiter(req3, res3, next3);

            expect(next3).not.toHaveBeenCalled();
            expect(res3.status).toHaveBeenCalledWith(429);
        });

        test('should handle requests without IP', () => {
            performanceOptimizer.reset();
            const rateLimiter = createRateLimiter({
                maxRequests: 1,
                windowMs: 60000
            });

            const req = createMockRequest();
            delete req.ip;
            const res = createMockResponse();
            const next = createMockNext();

            rateLimiter(req, res, next);

            expect(next).toHaveBeenCalled();
        });
    });

    describe('defaultRateLimiter', () => {
        beforeEach(() => {
            performanceOptimizer.reset();
            performanceOptimizer.setThrottleConfig({
                maxRequests: 100,
                windowMs: 60000
            });
        });

        test('should allow 100 requests per minute', () => {
            for (let i = 0; i < 100; i++) {
                const req = createMockRequest('127.0.0.1');
                const res = createMockResponse();
                const next = createMockNext();

                defaultRateLimiter(req, res, next);

                expect(next).toHaveBeenCalled();
                expect(res.status).not.toHaveBeenCalledWith(429);
            }
        });

        test('should reject 101st request', () => {
            // Use up all requests
            for (let i = 0; i < 100; i++) {
                const req = createMockRequest('127.0.0.1');
                const res = createMockResponse();
                const next = createMockNext();

                defaultRateLimiter(req, res, next);
            }

            // 101st request should be rejected
            const req = createMockRequest('127.0.0.1');
            const res = createMockResponse();
            const next = createMockNext();

            defaultRateLimiter(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(429);
        });
    });

    describe('strictRateLimiter', () => {
        beforeEach(() => {
            performanceOptimizer.reset();
            performanceOptimizer.setThrottleConfig({
                maxRequests: 20,
                windowMs: 60000
            });
        });

        test('should allow 20 requests per minute', () => {
            for (let i = 0; i < 20; i++) {
                const req = createMockRequest('127.0.0.1');
                const res = createMockResponse();
                const next = createMockNext();

                strictRateLimiter(req, res, next);

                expect(next).toHaveBeenCalled();
            }
        });

        test('should reject 21st request', () => {
            // Use up all requests
            for (let i = 0; i < 20; i++) {
                const req = createMockRequest('127.0.0.1');
                const res = createMockResponse();
                const next = createMockNext();

                strictRateLimiter(req, res, next);
            }

            // 21st request should be rejected
            const req = createMockRequest('127.0.0.1');
            const res = createMockResponse();
            const next = createMockNext();

            strictRateLimiter(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(429);
        });
    });

    describe('permissiveRateLimiter', () => {
        beforeEach(() => {
            performanceOptimizer.reset();
            performanceOptimizer.setThrottleConfig({
                maxRequests: 500,
                windowMs: 60000
            });
        });

        test('should allow 500 requests per minute', () => {
            for (let i = 0; i < 500; i++) {
                const req = createMockRequest('127.0.0.1');
                const res = createMockResponse();
                const next = createMockNext();

                permissiveRateLimiter(req, res, next);

                expect(next).toHaveBeenCalled();
            }
        });

        test('should reject 501st request', () => {
            // Use up all requests
            for (let i = 0; i < 500; i++) {
                const req = createMockRequest('127.0.0.1');
                const res = createMockResponse();
                const next = createMockNext();

                permissiveRateLimiter(req, res, next);
            }

            // 501st request should be rejected
            const req = createMockRequest('127.0.0.1');
            const res = createMockResponse();
            const next = createMockNext();

            permissiveRateLimiter(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(429);
        });
    });

    describe('rate limit header values', () => {
        beforeEach(() => {
            performanceOptimizer.reset();
        });

        test('should show correct remaining count', () => {
            const rateLimiter = createRateLimiter({
                maxRequests: 5,
                windowMs: 60000
            });

            const req = createMockRequest('127.0.0.1');
            const res = createMockResponse();
            const next = createMockNext();

            rateLimiter(req, res, next);

            expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
        });

        test('should show 0 remaining when at limit', () => {
            const rateLimiter = createRateLimiter({
                maxRequests: 1,
                windowMs: 60000
            });

            // First request
            const req1 = createMockRequest('127.0.0.1');
            const res1 = createMockResponse();
            const next1 = createMockNext();

            rateLimiter(req1, res1, next1);
            expect(res1.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');

            // Second request should be rejected
            const req2 = createMockRequest('127.0.0.1');
            const res2 = createMockResponse();
            const next2 = createMockNext();

            rateLimiter(req2, res2, next2);
            expect(res2.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
        });
    });

    describe('integration with performance optimizer', () => {
        beforeEach(() => {
            performanceOptimizer.reset();
        });

        test('should use performance optimizer throttle functionality', () => {
            const rateLimiter = createRateLimiter({
                maxRequests: 3,
                windowMs: 60000
            });

            // Verify performance optimizer was configured
            const config = performanceOptimizer.getThrottleConfig();
            expect(config.maxRequests).toBe(3);
            expect(config.windowMs).toBe(60000);
        });

        test('should maintain separate rate limits for different IPs', () => {
            const rateLimiter = createRateLimiter({
                maxRequests: 2,
                windowMs: 60000
            });

            // IP 1 uses its quota
            for (let i = 0; i < 2; i++) {
                const req = createMockRequest('192.168.1.1');
                const res = createMockResponse();
                const next = createMockNext();

                rateLimiter(req, res, next);
                expect(next).toHaveBeenCalled();
            }

            // IP 2 should still have quota available
            const req = createMockRequest('192.168.1.2');
            const res = createMockResponse();
            const next = createMockNext();

            rateLimiter(req, res, next);

            expect(next).toHaveBeenCalled();
        });
    });
});