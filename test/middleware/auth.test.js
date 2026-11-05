const authService = require('../../utils/authService');
const { authenticateAdmin } = require('../../middleware/auth');

// Mock request, response, and next function
const createMockRequest = (headers = {}) => ({
    headers,
    user: null
});

const createMockResponse = () => {
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
    return res;
};

const createMockNext = () => jest.fn();

describe('Authentication Middleware', () => {
    beforeEach(() => {
        // Clear all data before each test
        authService.clearAll();
    });

    describe('authenticateAdmin', () => {
        test('should allow request with valid API key', () => {
            // Generate and store a valid API key
            const apiKey = authService.generateAPIKey();
            authService.storeAPIKey(apiKey, 'test-user', { roles: ['admin'] });

            const req = createMockRequest({ 'x-api-key': apiKey });
            const res = createMockResponse();
            const next = createMockNext();

            authenticateAdmin(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(req.user).toEqual({
                id: 'test-user',
                roles: ['admin']
            });
            expect(res.status).not.toHaveBeenCalled();
            expect(res.json).not.toHaveBeenCalled();
        });

        test('should reject request with missing API key', () => {
            const req = createMockRequest({});
            const res = createMockResponse();
            const next = createMockNext();

            authenticateAdmin(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Invalid API key format'
            });
        });

        test('should reject request with empty API key', () => {
            const req = createMockRequest({ 'x-api-key': '' });
            const res = createMockResponse();
            const next = createMockNext();

            authenticateAdmin(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Invalid API key format'
            });
        });

        test('should reject request with invalid API key', () => {
            const req = createMockRequest({ 'x-api-key': 'invalid-key-12345' });
            const res = createMockResponse();
            const next = createMockNext();

            authenticateAdmin(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Authentication failed',
                reason: 'Key not found'
            });
        });

        test('should reject request with inactive API key', () => {
            const apiKey = authService.generateAPIKey();
            authService.storeAPIKey(apiKey, 'test-user');
            authService.deactivateAPIKey(apiKey);

            const req = createMockRequest({ 'x-api-key': apiKey });
            const res = createMockResponse();
            const next = createMockNext();

            authenticateAdmin(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Authentication failed',
                reason: 'Key is inactive'
            });
        });

        test('should handle null API key', () => {
            const req = createMockRequest({ 'x-api-key': null });
            const res = createMockResponse();
            const next = createMockNext();

            authenticateAdmin(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Invalid API key format'
            });
        });

        test('should handle undefined API key', () => {
            const req = createMockRequest({ 'x-api-key': undefined });
            const res = createMockResponse();
            const next = createMockNext();

            authenticateAdmin(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                message: 'Invalid API key format'
            });
        });

        test('should store user info on request object', () => {
            const apiKey = authService.generateAPIKey();
            const metadata = { roles: ['merchant'], scopes: ['read', 'write'] };
            authService.storeAPIKey(apiKey, 'merchant-user', metadata);

            const req = createMockRequest({ 'x-api-key': apiKey });
            const res = createMockResponse();
            const next = createMockNext();

            authenticateAdmin(req, res, next);

            expect(req.user).toEqual({
                id: 'merchant-user',
                roles: ['merchant']
            });
        });

        test('should work with default roles when metadata has no roles', () => {
            const apiKey = authService.generateAPIKey();
            authService.storeAPIKey(apiKey, 'test-user', {});

            const req = createMockRequest({ 'x-api-key': apiKey });
            const res = createMockResponse();
            const next = createMockNext();

            authenticateAdmin(req, res, next);

            expect(req.user).toEqual({
                id: 'test-user',
                roles: ['user']
            });
        });
    });
});