const authService = require('../utils/authService');
const securityConfig = require('../config/security');

/**
 * Resolve a stable identifier for lockout tracking.
 * Prefers the client IP; falls back to a generic bucket so failures are
 * still throttled when no IP is available.
 *
 * @param {Object} req - Express request
 * @returns {string} Lockout identifier
 */
const getClientIdentifier = (req) => {
    const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;
    return ip ? `ip:${ip}` : 'unknown';
};

/**
 * Authentication middleware for admin API endpoints.
 * Validates the API key from the x-api-key header, enforces lockout on
 * repeated failures, and attaches the authenticated user to the request.
 *
 * Usage: Apply to admin routes to require authentication.
 */
const authenticateAdmin = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const identifier = getClientIdentifier(req);

    // Refuse requests from locked-out clients before doing any work
    const lockout = authService.getLockoutInfo(identifier);
    if (lockout.locked) {
        return res.status(429).json({
            success: false,
            message: 'Too many authentication attempts. Try again later.',
            retryAfterMs: lockout.retryAfterMs
        });
    }

    // Validate API key presence and format
    if (!apiKey || typeof apiKey !== 'string') {
        return res.status(403).json({
            success: false,
            message: 'Invalid API key format'
        });
    }

    // Validate API key against auth service
    const result = authService.validateAPIKey(apiKey);
    if (!result.isValid) {
        // Count the failure and lock the client out after the threshold
        const info = authService.recordAuthFailure(identifier);
        if (info.locked) {
            return res.status(429).json({
                success: false,
                message: 'Too many authentication attempts. Try again later.',
                retryAfterMs: info.retryAfterMs
            });
        }

        return res.status(403).json({
            success: false,
            message: 'Authentication failed',
            reason: result.reason
        });
    }

    // Successful authentication resets the failure counter
    authService.clearAuthFailures(identifier);

    // Store user info on request object for downstream handlers
    req.user = {
        id: result.userId,
        roles: result.metadata?.roles || ['user']
    };

    next();
};

/**
 * Role-based access control middleware.
 * Ensures the authenticated user holds one of the permitted roles.
 *
 * Usage: router.get('/x', authenticateAdmin, requireRole('admin'), handler)
 *
 * @param {...string} allowedRoles - Roles permitted to proceed
 * @returns {Function} Express middleware
 */
const requireRole = (...allowedRoles) => (req, res, next) => {
    if (!req.user) {
        return res.status(403).json({
            success: false,
            message: 'Authentication required'
        });
    }

    const roles = req.user.roles || [];
    const allowed = roles.some((role) => allowedRoles.includes(role));
    if (!allowed) {
        return res.status(403).json({
            success: false,
            message: 'Access denied',
            reason: 'Required role not held',
            requiredRoles: allowedRoles
        });
    }

    next();
};

/**
 * Enforce MFA step-up for admin access when enabled.
 * Expects a valid grant token (issued after a successful MFA challenge or
 * TOTP verification) in the x-mfa-token header.
 *
 * Enforcement is only active once an authenticator secret has been enrolled
 * (ADMIN_MFA_SECRET). Without an enrolled secret the challenge cannot be
 * completed, so requests are allowed through to avoid locking the operator out
 * — a startup warning is emitted instead (see index.js).
 *
 * Usage: router.post('/sensitive', authenticateAdmin, requireMFA, handler)
 */
const requireMFA = (req, res, next) => {
    // Allow bypass when MFA is not required for admin access
    if (!securityConfig.authentication?.mfaEnabled ||
        !securityConfig.featureFlags?.mfa?.requiredForAdmin) {
        return next();
    }

    // Not enrolled yet — do not lock the operator out of their own system
    if (!process.env.ADMIN_MFA_SECRET) {
        return next();
    }

    if (!req.user) {
        return res.status(403).json({
            success: false,
            message: 'Authentication required'
        });
    }

    const grantToken = req.headers['x-mfa-token'];
    const grant = authService.validateMfaGrant(grantToken, req.user.id);

    if (!grant.isValid) {
        return res.status(403).json({
            success: false,
            message: 'MFA verification required',
            reason: grant.reason
        });
    }

    req.mfaVerified = true;
    next();
};

module.exports = {
    authenticateAdmin,
    requireRole,
    requireMFA
};
