const fc = require('fast-check');
const auditLogger = require('../utils/auditLogger');

beforeEach(() => {
    auditLogger.clearAllLogs();
});

/**
 * Property 1: Audit Log Entry Uniqueness
 * For any log entry, the generated ID should be unique across all entries.
 */
describe('Audit Log Entry Uniqueness', () => {
    test('each log entry has a unique ID', () => {
        const ids = new Set();

        // Generate multiple log entries and verify all IDs are unique
        for (let i = 0; i < 100; i++) {
            const entry = auditLogger.logAccess('test@example.com', 'test_action', {
                ip: '192.168.1.1',
                resource: 'test_resource'
            });
            ids.add(entry.id);
        }

        expect(ids.size).toBe(100);
    });

    test('IDs are unique across different log types', () => {
        const ids = new Set();

        // Create entries of different types
        for (let i = 0; i < 50; i++) {
            const accessEntry = auditLogger.logAccess('user@example.com', 'access_action', {
                ip: '192.168.1.1'
            });
            ids.add(accessEntry.id);

            const securityEntry = auditLogger.logSecurityEvent({
                type: 'security_event',
                user: 'user@example.com',
                description: 'Test security event'
            });
            ids.add(securityEntry.id);

            const transactionEntry = auditLogger.logTransaction({
                id: `TXN_${i}`,
                cardType: 'Visa',
                lastFour: '1234',
                amount: 99.99,
                currency: 'USD',
                status: 'Approved',
                responseCode: '00',
                merchantAccount: 'ACT_12345'
            });
            ids.add(transactionEntry.id);
        }

        expect(ids.size).toBe(150);
    });
});

/**
 * Property 2: Log Timestamp Ordering
 * For any sequence of log entries, timestamps should be in non-decreasing order.
 */
describe('Log Timestamp Ordering', () => {
    test('timestamps are in chronological order', () => {
        const timestamps = [];

        for (let i = 0; i < 10; i++) {
            const entry = auditLogger.logAccess('user@example.com', 'action', {
                ip: '192.168.1.1'
            });
            timestamps.push(new Date(entry.timestamp).getTime());
        }

        // Verify timestamps are in non-decreasing order
        for (let i = 1; i < timestamps.length; i++) {
            expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
        }
    });
});

/**
 * Property 3: Log Entry Completeness
 * For any log entry, all required fields should be present and properly formatted.
 */
describe('Log Entry Completeness', () => {
    test('access log entries have all required fields', () => {
        fc.assert(fc.property(
            fc.string({ minLength: 1, maxLength: 100 }),
            fc.string({ minLength: 1, maxLength: 100 }),
            fc.object({
                ip: fc.string(),
                userAgent: fc.string(),
                resource: fc.string(),
                success: fc.boolean(),
                severity: fc.oneof(fc.constant('info'), fc.constant('warning'), fc.constant('error'))
            }),
            (user, action, details) => {
                const entry = auditLogger.logAccess(user, action, details);

                expect(entry.id).toBeDefined();
                expect(entry.timestamp).toBeDefined();
                expect(entry.event).toBe('access');
                expect(entry.user).toBe(user);
                expect(entry.action).toBe(action);
                expect(entry.details).toBeDefined();
                expect(entry.severity).toBeDefined();

                return true;
            }
        ), { numRuns: 50 });
    });

    test('security event entries have all required fields', () => {
        fc.assert(fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.string({ minLength: 1, maxLength: 100 }),
            fc.string({ minLength: 1, maxLength: 500 }),
            fc.oneof(fc.constant('info'), fc.constant('warning'), fc.constant('error'), fc.constant('critical')),
            (type, user, description, severity) => {
                const entry = auditLogger.logSecurityEvent({
                    type,
                    user,
                    description,
                    severity
                });

                expect(entry.id).toBeDefined();
                expect(entry.timestamp).toBeDefined();
                expect(entry.event).toBe('security');
                expect(entry.type).toBe(type);
                expect(entry.user).toBe(user);
                expect(entry.description).toBe(description);
                expect(entry.severity).toBe(severity);

                return true;
            }
        ), { numRuns: 50 });
    });

    test('transaction log entries have all required fields', () => {
        fc.assert(fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.oneof(fc.constant('Visa'), fc.constant('Mastercard'), fc.constant('American Express'), fc.constant('Discover')),
            fc.string({ minLength: 4, maxLength: 4 }),
            fc.float({ min: 0, max: 100000 }),
            fc.string({ minLength: 3, maxLength: 3 }),
            fc.oneof(fc.constant('Approved'), fc.constant('Declined')),
            fc.string({ minLength: 2, maxLength: 2 }),
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.integer({ min: 0, max: 10000 }),
            fc.boolean(),
            (transactionId, cardType, lastFour, amount, currency, status, responseCode, merchantAccount, processingTimeMs, gpuProcessed) => {
                const entry = auditLogger.logTransaction({
                    id: transactionId,
                    cardType,
                    lastFour,
                    amount,
                    currency,
                    status,
                    responseCode,
                    merchantAccount,
                    processingTimeMs,
                    gpuProcessed
                });

                expect(entry.id).toBeDefined();
                expect(entry.timestamp).toBeDefined();
                expect(entry.event).toBe('transaction');
                expect(entry.transactionId).toBe(transactionId);
                expect(entry.cardType).toBe(cardType);
                expect(entry.lastFour).toBe(lastFour);
                expect(entry.amount).toBe(amount);
                expect(entry.currency).toBe(currency);
                expect(entry.status).toBe(status);
                expect(entry.responseCode).toBe(responseCode);
                expect(entry.merchantAccount).toBe(merchantAccount);

                return true;
            }
        ), { numRuns: 50 });
    });
});

// Unit tests for specific examples
describe('Audit Logger Unit Tests', () => {
    beforeEach(() => {
        // Clear all logs before each test to ensure test isolation
        auditLogger.clearAllLogs();
    });

    describe('logAccess', () => {
        test('creates access log entry with all details', () => {
            const entry = auditLogger.logAccess('admin@example.com', 'view_transactions', {
                ip: '192.168.1.100',
                userAgent: 'Mozilla/5.0',
                resource: 'transactions',
                success: true,
                severity: 'info'
            });

            expect(entry.id).toMatch(/^AUDIT_\d+_[a-f0-9]+$/);
            expect(entry.timestamp).toBeDefined();
            expect(entry.event).toBe('access');
            expect(entry.user).toBe('admin@example.com');
            expect(entry.action).toBe('view_transactions');
            expect(entry.details.ip).toBe('192.168.1.100');
            expect(entry.details.userAgent).toBe('Mozilla/5.0');
            expect(entry.details.resource).toBe('transactions');
            expect(entry.details.success).toBe(true);
            expect(entry.severity).toBe('info');
        });

        test('creates access log entry with minimal details', () => {
            const entry = auditLogger.logAccess('user@example.com', 'login');

            expect(entry.id).toBeDefined();
            expect(entry.timestamp).toBeDefined();
            expect(entry.event).toBe('access');
            expect(entry.user).toBe('user@example.com');
            expect(entry.action).toBe('login');
            expect(entry.details.ip).toBe('unknown');
            expect(entry.details.userAgent).toBe('unknown');
            expect(entry.details.resource).toBe('unknown');
            expect(entry.details.success).toBe(true);
            expect(entry.severity).toBe('info');
        });

        test('creates multiple access log entries', () => {
            auditLogger.logAccess('user1@example.com', 'action1');
            auditLogger.logAccess('user2@example.com', 'action2');
            auditLogger.logAccess('user3@example.com', 'action3');

            const trail = auditLogger.getAuditTrail();
            expect(trail.length).toBe(3);
        });
    });

    describe('logSecurityEvent', () => {
        test('creates security event with all details', () => {
            const entry = auditLogger.logSecurityEvent({
                type: 'unauthorized_access',
                user: 'attacker@example.com',
                description: 'Failed login attempt from unknown IP',
                severity: 'critical',
                metadata: { attempts: 5, ip: '10.0.0.1' },
                ip: '10.0.0.1',
                userAgent: 'curl/7.68.0'
            });

            expect(entry.id).toBeDefined();
            expect(entry.timestamp).toBeDefined();
            expect(entry.event).toBe('security');
            expect(entry.type).toBe('unauthorized_access');
            expect(entry.user).toBe('attacker@example.com');
            expect(entry.description).toBe('Failed login attempt from unknown IP');
            expect(entry.severity).toBe('critical');
            expect(entry.metadata.attempts).toBe(5);
            expect(entry.ip).toBe('10.0.0.1');
            expect(entry.userAgent).toBe('curl/7.68.0');
        });

        test('creates security event with minimal details', () => {
            const entry = auditLogger.logSecurityEvent({
                type: 'data_access',
                user: 'admin@example.com'
            });

            expect(entry.id).toBeDefined();
            expect(entry.timestamp).toBeDefined();
            expect(entry.event).toBe('security');
            expect(entry.type).toBe('data_access');
            expect(entry.user).toBe('admin@example.com');
            expect(entry.description).toBe('');
            expect(entry.severity).toBe('info');
            expect(entry.ip).toBe('unknown');
            expect(entry.userAgent).toBe('unknown');
        });

        test('creates multiple security events', () => {
            auditLogger.logSecurityEvent({ type: 'event1', user: 'user1' });
            auditLogger.logSecurityEvent({ type: 'event2', user: 'user2' });
            auditLogger.logSecurityEvent({ type: 'event3', user: 'user3' });

            const events = auditLogger.getSecurityEvents();
            expect(events.length).toBe(3);
        });
    });

    describe('logTransaction', () => {
        test('creates transaction log with all details', () => {
            const entry = auditLogger.logTransaction({
                id: 'TXN_1234567890123',
                cardType: 'Visa',
                lastFour: '1234',
                amount: 99.99,
                currency: 'USD',
                status: 'Approved',
                responseCode: '00',
                merchantAccount: 'ACT_9988776655',
                processingTimeMs: 450,
                gpuProcessed: true,
                securityFlags: {
                    cardMasked: true,
                    encrypted: true,
                    auditLogged: true
                }
            });

            expect(entry.id).toBeDefined();
            expect(entry.timestamp).toBeDefined();
            expect(entry.event).toBe('transaction');
            expect(entry.transactionId).toBe('TXN_1234567890123');
            expect(entry.cardType).toBe('Visa');
            expect(entry.lastFour).toBe('1234');
            expect(entry.amount).toBe(99.99);
            expect(entry.currency).toBe('USD');
            expect(entry.status).toBe('Approved');
            expect(entry.responseCode).toBe('00');
            expect(entry.merchantAccount).toBe('ACT_9988776655');
            expect(entry.processingTimeMs).toBe(450);
            expect(entry.gpuProcessed).toBe(true);
            expect(entry.securityFlags.cardMasked).toBe(true);
            expect(entry.securityFlags.encrypted).toBe(true);
            expect(entry.securityFlags.auditLogged).toBe(true);
        });

        test('creates transaction log with minimal details', () => {
            const entry = auditLogger.logTransaction({
                id: 'TXN_1234567890123',
                cardType: 'Mastercard',
                lastFour: '5678',
                amount: 50.00,
                currency: 'EUR',
                status: 'Declined',
                responseCode: '05',
                merchantAccount: 'ACT_1111111111'
            });

            expect(entry.id).toBeDefined();
            expect(entry.transactionId).toBe('TXN_1234567890123');
            expect(entry.cardType).toBe('Mastercard');
            expect(entry.lastFour).toBe('5678');
            expect(entry.amount).toBe(50.00);
            expect(entry.status).toBe('Declined');
            expect(entry.securityFlags.cardMasked).toBe(true);
            expect(entry.securityFlags.encrypted).toBe(true);
            expect(entry.securityFlags.auditLogged).toBe(true);
        });

        test('creates multiple transaction logs', () => {
            auditLogger.logTransaction({ id: 'TXN_1', cardType: 'Visa', lastFour: '1111', amount: 10, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_1' });
            auditLogger.logTransaction({ id: 'TXN_2', cardType: 'Mastercard', lastFour: '2222', amount: 20, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_2' });
            auditLogger.logTransaction({ id: 'TXN_3', cardType: 'Amex', lastFour: '3333', amount: 30, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_3' });

            const logs = auditLogger.getTransactionLogs();
            expect(logs.length).toBe(3);
        });
    });

    describe('getAuditTrail', () => {
        test('retrieves all access logs', () => {
            auditLogger.logAccess('user1@example.com', 'action1');
            auditLogger.logAccess('user2@example.com', 'action2');
            auditLogger.logAccess('user3@example.com', 'action3');

            const trail = auditLogger.getAuditTrail();
            expect(trail.length).toBe(3);
        });

        test('filters by user', () => {
            auditLogger.logAccess('user1@example.com', 'action1');
            auditLogger.logAccess('user2@example.com', 'action2');
            auditLogger.logAccess('user1@example.com', 'action3');

            const trail = auditLogger.getAuditTrail({ user: 'user1@example.com' });
            expect(trail.length).toBe(2);
            trail.forEach(entry => expect(entry.user).toBe('user1@example.com'));
        });

        test('filters by action', () => {
            auditLogger.logAccess('user@example.com', 'action1');
            auditLogger.logAccess('user@example.com', 'action2');
            auditLogger.logAccess('user@example.com', 'action1');

            const trail = auditLogger.getAuditTrail({ action: 'action1' });
            expect(trail.length).toBe(2);
            trail.forEach(entry => expect(entry.action).toBe('action1'));
        });

        test('filters by severity', () => {
            auditLogger.logAccess('user@example.com', 'action1', { severity: 'info' });
            auditLogger.logAccess('user@example.com', 'action2', { severity: 'warning' });
            auditLogger.logAccess('user@example.com', 'action3', { severity: 'error' });

            const trail = auditLogger.getAuditTrail({ severity: 'warning' });
            expect(trail.length).toBe(1);
            expect(trail[0].severity).toBe('warning');
        });

        test('applies pagination', () => {
            for (let i = 0; i < 10; i++) {
                auditLogger.logAccess(`user${i}@example.com`, `action${i}`);
            }

            const trail = auditLogger.getAuditTrail({ limit: 5, offset: 2 });
            expect(trail.length).toBe(5);
        });

        test('filters by date range', () => {
            const now = new Date();
            const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

            auditLogger.logAccess('user@example.com', 'action1');
            auditLogger.logAccess('user@example.com', 'action2');

            const trail = auditLogger.getAuditTrail({
                startDate: yesterday.toISOString(),
                endDate: tomorrow.toISOString()
            });
            expect(trail.length).toBe(2);
        });
    });

    describe('getSecurityEvents', () => {
        test('retrieves all security events', () => {
            auditLogger.logSecurityEvent({ type: 'event1', user: 'user1' });
            auditLogger.logSecurityEvent({ type: 'event2', user: 'user2' });
            auditLogger.logSecurityEvent({ type: 'event3', user: 'user3' });

            const events = auditLogger.getSecurityEvents();
            expect(events.length).toBe(3);
        });

        test('filters by event type', () => {
            auditLogger.logSecurityEvent({ type: 'auth_failure', user: 'user1' });
            auditLogger.logSecurityEvent({ type: 'unauthorized_access', user: 'user2' });
            auditLogger.logSecurityEvent({ type: 'auth_failure', user: 'user3' });

            const events = auditLogger.getSecurityEvents({ type: 'auth_failure' });
            expect(events.length).toBe(2);
        });

        test('filters by severity', () => {
            auditLogger.logSecurityEvent({ type: 'event1', user: 'user1', severity: 'info' });
            auditLogger.logSecurityEvent({ type: 'event2', user: 'user2', severity: 'critical' });
            auditLogger.logSecurityEvent({ type: 'event3', user: 'user3', severity: 'warning' });

            const events = auditLogger.getSecurityEvents({ severity: 'critical' });
            expect(events.length).toBe(1);
            expect(events[0].severity).toBe('critical');
        });
    });

    describe('getTransactionLogs', () => {
        test('retrieves all transaction logs', () => {
            auditLogger.logTransaction({ id: 'TXN_1', cardType: 'Visa', lastFour: '1111', amount: 10, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_1' });
            auditLogger.logTransaction({ id: 'TXN_2', cardType: 'Mastercard', lastFour: '2222', amount: 20, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_2' });
            auditLogger.logTransaction({ id: 'TXN_3', cardType: 'Amex', lastFour: '3333', amount: 30, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_3' });

            const logs = auditLogger.getTransactionLogs();
            expect(logs.length).toBe(3);
        });

        test('filters by card type', () => {
            auditLogger.logTransaction({ id: 'TXN_1', cardType: 'Visa', lastFour: '1111', amount: 10, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_1' });
            auditLogger.logTransaction({ id: 'TXN_2', cardType: 'Mastercard', lastFour: '2222', amount: 20, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_2' });
            auditLogger.logTransaction({ id: 'TXN_3', cardType: 'Visa', lastFour: '3333', amount: 30, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_3' });

            const logs = auditLogger.getTransactionLogs({ cardType: 'Visa' });
            expect(logs.length).toBe(2);
        });

        test('filters by transaction status', () => {
            auditLogger.logTransaction({ id: 'TXN_1', cardType: 'Visa', lastFour: '1111', amount: 10, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_1' });
            auditLogger.logTransaction({ id: 'TXN_2', cardType: 'Mastercard', lastFour: '2222', amount: 20, currency: 'USD', status: 'Declined', responseCode: '05', merchantAccount: 'ACT_2' });
            auditLogger.logTransaction({ id: 'TXN_3', cardType: 'Amex', lastFour: '3333', amount: 30, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_3' });

            const logs = auditLogger.getTransactionLogs({ status: 'Approved' });
            expect(logs.length).toBe(2);
        });

        test('filters by amount range', () => {
            auditLogger.logTransaction({ id: 'TXN_1', cardType: 'Visa', lastFour: '1111', amount: 10, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_1' });
            auditLogger.logTransaction({ id: 'TXN_2', cardType: 'Mastercard', lastFour: '2222', amount: 50, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_2' });
            auditLogger.logTransaction({ id: 'TXN_3', cardType: 'Amex', lastFour: '3333', amount: 100, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_3' });

            const logs = auditLogger.getTransactionLogs({ minAmount: 20, maxAmount: 80 });
            expect(logs.length).toBe(1);
            expect(logs[0].amount).toBe(50);
        });

        test('filters by transaction ID', () => {
            auditLogger.logTransaction({ id: 'TXN_1', cardType: 'Visa', lastFour: '1111', amount: 10, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_1' });
            auditLogger.logTransaction({ id: 'TXN_2', cardType: 'Mastercard', lastFour: '2222', amount: 20, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_2' });

            const logs = auditLogger.getTransactionLogs({ transactionId: 'TXN_1' });
            expect(logs.length).toBe(1);
            expect(logs[0].transactionId).toBe('TXN_1');
        });
    });

    describe('exportForAudit', () => {
        beforeEach(() => {
            auditLogger.clearAllLogs();
        });
        
        test('exports data in JSON format', () => {
            auditLogger.logAccess('user@example.com', 'action1');
            auditLogger.logSecurityEvent({ type: 'event1', user: 'user@example.com' });
            auditLogger.logTransaction({ id: 'TXN_1', cardType: 'Visa', lastFour: '1111', amount: 10, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_1' });

            const exportData = auditLogger.exportForAudit('json');

            expect(typeof exportData).toBe('string');
            const parsed = JSON.parse(exportData);
            expect(parsed.exportId).toBeDefined();
            expect(parsed.exportedAt).toBeDefined();
            expect(parsed.data).toBeDefined();
        });

        test('exports access logs in JSON format', () => {
            auditLogger.logAccess('user1@example.com', 'action1');
            auditLogger.logAccess('user2@example.com', 'action2');

            const exportData = auditLogger.exportForAudit('json', { exportType: 'access' });
            const parsed = JSON.parse(exportData);

            expect(parsed.data.access).toBeDefined();
            expect(parsed.data.access.length).toBe(2);
            expect(parsed.data.security).toBeUndefined();
            expect(parsed.data.transactions).toBeUndefined();
        });

        test('exports security events in JSON format', () => {
            auditLogger.logSecurityEvent({ type: 'event1', user: 'user1' });
            auditLogger.logSecurityEvent({ type: 'event2', user: 'user2' });

            const exportData = auditLogger.exportForAudit('json', { exportType: 'security' });
            const parsed = JSON.parse(exportData);

            expect(parsed.data.security).toBeDefined();
            expect(parsed.data.security.length).toBe(2);
            expect(parsed.data.access).toBeUndefined();
            expect(parsed.data.transactions).toBeUndefined();
        });

        test('exports transaction logs in JSON format', () => {
            auditLogger.logTransaction({ id: 'TXN_1', cardType: 'Visa', lastFour: '1111', amount: 10, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_1' });
            auditLogger.logTransaction({ id: 'TXN_2', cardType: 'Mastercard', lastFour: '2222', amount: 20, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_2' });

            const exportData = auditLogger.exportForAudit('json', { exportType: 'transactions' });
            const parsed = JSON.parse(exportData);

            expect(parsed.data.transactions).toBeDefined();
            expect(parsed.data.transactions.length).toBe(2);
            expect(parsed.data.access).toBeUndefined();
            expect(parsed.data.security).toBeUndefined();
        });

        test('exports data in CSV format', () => {
            auditLogger.logAccess('user@example.com', 'action1');
            auditLogger.logSecurityEvent({ type: 'event1', user: 'user@example.com' });
            auditLogger.logTransaction({ id: 'TXN_1', cardType: 'Visa', lastFour: '1111', amount: 10, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_1' });

            const exportData = auditLogger.exportForAudit('csv');

            expect(typeof exportData).toBe('string');
            expect(exportData).toContain('Export ID,Exported At,Data Type');
            expect(exportData).toContain('access');
            expect(exportData).toContain('security');
            expect(exportData).toContain('transaction');
        });

        test('exports data in XML format', () => {
            auditLogger.logAccess('user@example.com', 'action1');
            auditLogger.logSecurityEvent({ type: 'event1', user: 'user@example.com' });
            auditLogger.logTransaction({ id: 'TXN_1', cardType: 'Visa', lastFour: '1111', amount: 10, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_1' });

            const exportData = auditLogger.exportForAudit('xml');

            expect(typeof exportData).toBe('string');
            expect(exportData).toContain('<?xml version="1.0" encoding="UTF-8"?>');
            expect(exportData).toContain('<AuditExport>');
            expect(exportData).toContain('<AccessEntries>');
            expect(exportData).toContain('<SecurityEvents>');
            expect(exportData).toContain('<TransactionLogs>');
        });

        test('filters export by date range', () => {
            const now = new Date();
            const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

            auditLogger.logAccess('user@example.com', 'action1');
            auditLogger.logAccess('user@example.com', 'action2');

            const exportData = auditLogger.exportForAudit('json', {
                startDate: yesterday.toISOString(),
                endDate: tomorrow.toISOString()
            });
            const parsed = JSON.parse(exportData);

            expect(parsed.data.access.length).toBe(2);
        });
    });

    describe('getRetentionCompliance', () => {
        test('returns compliance status', () => {
            const compliance = auditLogger.getRetentionCompliance();

            expect(compliance.compliant).toBe(true);
            expect(compliance.retentionDays).toBe(365);
            expect(compliance.logCounts).toBeDefined();
            expect(compliance.logCounts.access).toBeGreaterThanOrEqual(0);
            expect(compliance.logCounts.security).toBeGreaterThanOrEqual(0);
            expect(compliance.logCounts.transactions).toBeGreaterThanOrEqual(0);
            expect(compliance.totalEntries).toBeGreaterThanOrEqual(0);
        });
    });

    describe('getSummary', () => {
        test('returns summary statistics', () => {
            auditLogger.logAccess('user1@example.com', 'action1');
            auditLogger.logAccess('user2@example.com', 'action2');
            auditLogger.logSecurityEvent({ type: 'event1', user: 'user1' });
            auditLogger.logTransaction({ id: 'TXN_1', cardType: 'Visa', lastFour: '1111', amount: 10, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_1' });

            const summary = auditLogger.getSummary();

            expect(summary.totalAccessLogs).toBe(2);
            expect(summary.totalSecurityEvents).toBe(1);
            expect(summary.totalTransactionLogs).toBe(1);
            expect(summary.retentionDays).toBe(365);
        });
    });

    describe('setRetentionPeriod', () => {
        test('updates retention period', () => {
            auditLogger.setRetentionPeriod(90);
            expect(auditLogger.getRetentionPeriod()).toBe(90);

            auditLogger.setRetentionPeriod(730);
            expect(auditLogger.getRetentionPeriod()).toBe(730);
        });
    });

    describe('clearAllLogs', () => {
        test('clears all log entries', () => {
            auditLogger.logAccess('user@example.com', 'action1');
            auditLogger.logSecurityEvent({ type: 'event1', user: 'user@example.com' });
            auditLogger.logTransaction({ id: 'TXN_1', cardType: 'Visa', lastFour: '1111', amount: 10, currency: 'USD', status: 'Approved', responseCode: '00', merchantAccount: 'ACT_1' });

            auditLogger.clearAllLogs();

            expect(auditLogger.getAuditTrail().length).toBe(0);
            expect(auditLogger.getSecurityEvents().length).toBe(0);
            expect(auditLogger.getTransactionLogs().length).toBe(0);
        });
    });
});
