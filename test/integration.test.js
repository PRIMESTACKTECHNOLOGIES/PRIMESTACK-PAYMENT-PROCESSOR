/**
 * Integration Tests - End-to-End Transaction Flow
 *
 * Tests the complete payment processing flow at the component layer
 * (no HTTP server required). Covers:
 *   1. Full transaction flow
 *   2. Approved transaction flow
 *   3. Declined transaction flow
 *   4. Invalid card flow
 *   5. GPU processing flow
 *   6. Secure vault flow
 *   7. Audit logging flow
 *   8. Performance monitoring
 */

// ─── Component imports ───────────────────────────────────────────────────────
const { validateCard, maskCardNumber } = require('../utils/cardValidator');
const ISO8583Sim = require('../utils/isoSim');
const MockAcquirer = require('../utils/acquirer');
const secureVault = require('../utils/secureVault');
const auditLogger = require('../utils/auditLogger');
const gpuManager = require('../utils/gpuManager');
const performanceOptimizer = require('../utils/performanceOptimizer');

// ─── HTTP helper (kept for legacy HTTP tests below) ──────────────────────────
const http = require('http');

const makeRequest = (options, body = null) => {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, headers: res.headers, body: data });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
};

// ─── Shared test helper: simulate the core transaction pipeline ───────────────
/**
 * Runs the component-layer transaction pipeline.
 * Returns a result object describing every stage.
 */
function runTransactionPipeline({ cardNumber, amount, cvv, currency = 'USD', merchantAccount = 'ACT_TEST' }) {
    const startTime = Date.now();
    const result = {
        stages: {},
        errors: [],
        gpuProcessed: false,
        auditEvents: [],
        processingTimeMs: 0,
    };

    // Stage 1 – Card validation
    const validation = validateCard(cardNumber);
    result.stages.validation = validation;

    if (!validation.isValid) {
        result.errors.push({ stage: 'validation', ...validation });
        result.processingTimeMs = Date.now() - startTime;
        return result;
    }

    // Stage 2 – Secure vault storage
    const vaultKey = `card_test_${Date.now()}`;
    secureVault.store(`${vaultKey}_pan`, cardNumber);
    if (cvv) secureVault.store(`${vaultKey}_cvv`, cvv);
    result.stages.vaultStored = true;

    // Verify PAN is retrievable
    const retrievedPan = secureVault.retrieve(`${vaultKey}_pan`);
    result.stages.vaultRetrievable = retrievedPan === cardNumber;

    // Stage 3 – ISO8583 message building
    const isoMessage = ISO8583Sim.buildMessage({
        mti: '0200',
        cardNumber,
        amount: (parseFloat(amount) * 100).toString(),
        currencyCode: '840',
        transmissionDate: new Date().toISOString(),
        cvv: cvv || '123',
        expiry: '1225',
    });
    result.stages.isoMessage = isoMessage;

    // Stage 4 – GPU processing (distribute ISO8583 parsing task)
    const gpuAvailable = gpuManager.isGPUAvailable();
    let parsedMessage;
    if (gpuAvailable) {
        const gpuResult = gpuManager.distributeTasks([{ id: `parse_${Date.now()}`, message: isoMessage }]);
        result.gpuProcessed = gpuResult.success && gpuResult.distributed.length > 0;
        parsedMessage = ISO8583Sim.parseMessage(isoMessage);
    } else {
        const cpuResult = gpuManager.fallbackToCPU({ id: `parse_${Date.now()}`, message: isoMessage });
        result.gpuProcessed = false;
        result.stages.cpuFallback = cpuResult;
        parsedMessage = ISO8583Sim.parseMessage(isoMessage);
    }
    result.stages.parsedMessage = parsedMessage;

    // Stage 5 – Mock acquirer processing
    const acquirerResponse = MockAcquirer.processRequest(parsedMessage, merchantAccount);
    result.stages.acquirerResponse = acquirerResponse;

    // Stage 6 – Audit logging
    const txId = `TXN_TEST_${Date.now()}`;
    auditLogger.logSecurityEvent({
        type: 'transaction_start',
        description: `Test transaction started for card ${maskCardNumber(cardNumber)}`,
        severity: 'info',
        metadata: { maskedCard: maskCardNumber(cardNumber), amount, currency },
    });

    auditLogger.logTransaction({
        id: txId,
        cardType: validation.cardType,
        lastFour: validation.lastFour,
        amount: parseFloat(amount),
        currency,
        status: acquirerResponse.status,
        responseCode: acquirerResponse.responseCode,
        merchantAccount,
        processingTimeMs: Date.now() - startTime,
        gpuProcessed: result.gpuProcessed,
        securityFlags: { cardMasked: true, encrypted: true, auditLogged: true },
    });

    auditLogger.logSecurityEvent({
        type: 'transaction_complete',
        description: `Test transaction ${txId} completed: ${acquirerResponse.status}`,
        severity: 'info',
        metadata: { transactionId: txId, status: acquirerResponse.status },
    });

    result.stages.auditLogged = true;
    result.transactionId = txId;

    // Stage 7 – Performance monitoring
    const processingTimeMs = Date.now() - startTime;
    performanceOptimizer.updateMetrics('integration-test-transaction', processingTimeMs);
    result.processingTimeMs = processingTimeMs;

    // Stage 8 – Clear vault after transaction
    secureVault.clear(`${vaultKey}_pan`);
    if (cvv) secureVault.clear(`${vaultKey}_cvv`);
    result.stages.vaultCleared = secureVault.retrieve(`${vaultKey}_pan`) === null;

    return result;
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENT-LAYER INTEGRATION TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('Component-Layer Integration Tests - End-to-End Transaction Flow', () => {

    beforeEach(() => {
        // Reset shared singletons so tests are independent
        gpuManager.reset();
        performanceOptimizer.reset();
        auditLogger.clearAllLogs();
    });

    // ─── 1. Full transaction flow ─────────────────────────────────────────────
    describe('1. Full transaction flow', () => {
        test('all pipeline stages execute in order for a valid Visa card', () => {
            const result = runTransactionPipeline({
                cardNumber: '4111111111111111',
                amount: 99.99,
                cvv: '123',
            });

            // Validation stage
            expect(result.stages.validation.isValid).toBe(true);
            expect(result.stages.validation.cardType).toBe('Visa');

            // Vault stage
            expect(result.stages.vaultStored).toBe(true);
            expect(result.stages.vaultRetrievable).toBe(true);

            // ISO8583 stage
            expect(result.stages.isoMessage).toContain('MTI:0200');
            expect(result.stages.isoMessage).toContain('F02:4111111111111111');

            // Parsed message stage
            expect(result.stages.parsedMessage.cardNumber).toBe('4111111111111111');
            expect(result.stages.parsedMessage.mti).toBe('0200');

            // Acquirer stage
            expect(result.stages.acquirerResponse).toBeDefined();
            expect(result.stages.acquirerResponse.responseCode).toBeDefined();

            // Audit stage
            expect(result.stages.auditLogged).toBe(true);

            // Vault cleared after completion
            expect(result.stages.vaultCleared).toBe(true);

            // Processing time tracked
            expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
        });
    });

    // ─── 2. Approved transaction flow ────────────────────────────────────────
    describe('2. Approved transaction flow', () => {
        test('valid Visa card with valid amount is approved', () => {
            const result = runTransactionPipeline({
                cardNumber: '4111111111111111',
                amount: 100.00,
                cvv: '123',
            });

            expect(result.errors).toHaveLength(0);
            expect(result.stages.acquirerResponse.status).toBe('Approved');
            expect(result.stages.acquirerResponse.responseCode).toBe('00');
            expect(result.stages.acquirerResponse.settlementStatus).toBe('Settled');
        });

        test('valid Mastercard with valid amount is approved', () => {
            const result = runTransactionPipeline({
                cardNumber: '5500000000000004',
                amount: 250.00,
                cvv: '456',
            });

            expect(result.errors).toHaveLength(0);
            expect(result.stages.acquirerResponse.status).toBe('Approved');
            expect(result.stages.acquirerResponse.responseCode).toBe('00');
        });

        test('approved transaction has settlement status set', () => {
            const result = runTransactionPipeline({
                cardNumber: '4111111111111111',
                amount: 50.00,
                cvv: '123',
            });

            expect(result.stages.acquirerResponse.status).toBe('Approved');
            expect(result.stages.acquirerResponse.settlementStatus).toBe('Settled');
            expect(result.stages.acquirerResponse.merchantAccount).toBe('ACT_TEST');
        });
    });

    // ─── 3. Declined transaction flow ────────────────────────────────────────
    describe('3. Declined transaction flow', () => {
        test('card starting with 51 triggers insufficient funds decline', () => {
            // 5100000000000040 starts with 51 → INSUFFICIENT_FUNDS
            const result = runTransactionPipeline({
                cardNumber: '5100000000000040',
                amount: 100.00,
                cvv: '123',
            });

            expect(result.errors).toHaveLength(0); // card is valid
            expect(result.stages.acquirerResponse.status).toBe('Declined');
            expect(result.stages.acquirerResponse.responseCode).toBe('51');
        });

        test('amount exceeding $5000 triggers withdrawal limit decline', () => {
            const result = runTransactionPipeline({
                cardNumber: '4111111111111111',
                amount: 6000.00,
                cvv: '123',
            });

            expect(result.stages.acquirerResponse.status).toBe('Declined');
            expect(result.stages.acquirerResponse.responseCode).toBe('65');
        });

        test('declined transaction does not have settlement status', () => {
            const result = runTransactionPipeline({
                cardNumber: '5100000000000040',
                amount: 100.00,
                cvv: '123',
            });

            expect(result.stages.acquirerResponse.status).toBe('Declined');
            expect(result.stages.acquirerResponse.settlementStatus).toBeUndefined();
        });
    });

    // ─── 4. Invalid card flow ─────────────────────────────────────────────────
    describe('4. Invalid card flow', () => {
        test('card failing Luhn check returns E001 error code', () => {
            // 4111111111111112 fails Luhn
            const result = runTransactionPipeline({
                cardNumber: '4111111111111112',
                amount: 50.00,
                cvv: '123',
            });

            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].stage).toBe('validation');
            expect(result.errors[0].errorCode).toBe('E001');
            expect(result.errors[0].isValid).toBe(false);
        });

        test('pipeline stops after validation failure - no vault or acquirer stages', () => {
            const result = runTransactionPipeline({
                cardNumber: '4111111111111112',
                amount: 50.00,
                cvv: '123',
            });

            expect(result.stages.vaultStored).toBeUndefined();
            expect(result.stages.acquirerResponse).toBeUndefined();
        });

        test('unknown card type returns E002 error code', () => {
            // 9999999999999999 - unknown card type
            const result = runTransactionPipeline({
                cardNumber: '9999999999999999',
                amount: 50.00,
                cvv: '123',
            });

            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].errorCode).toBe('E002');
        });
    });

    // ─── 5. GPU processing flow ───────────────────────────────────────────────
    describe('5. GPU processing flow', () => {
        test('GPU manager is called for ISO8583 parsing when GPU is available', () => {
            gpuManager.reset(); // ensure GPU is available
            expect(gpuManager.isGPUAvailable()).toBe(true);

            const metricsBefore = gpuManager.getMetrics();
            const tasksBefore = metricsBefore.tasksProcessed;

            const result = runTransactionPipeline({
                cardNumber: '4111111111111111',
                amount: 100.00,
                cvv: '123',
            });

            const metricsAfter = gpuManager.getMetrics();
            expect(metricsAfter.tasksProcessed).toBeGreaterThan(tasksBefore);
            expect(result.gpuProcessed).toBe(true);
        });

        test('CPU fallback is used when GPU is unavailable', () => {
            gpuManager.gpuAvailable = false;
            expect(gpuManager.isGPUAvailable()).toBe(false);

            const result = runTransactionPipeline({
                cardNumber: '4111111111111111',
                amount: 100.00,
                cvv: '123',
            });

            expect(result.gpuProcessed).toBe(false);
            expect(result.stages.cpuFallback).toBeDefined();
            expect(result.stages.cpuFallback.success).toBe(true);
            expect(result.stages.cpuFallback.method).toBe('cpu');
        });

        test('transaction still completes successfully with CPU fallback', () => {
            gpuManager.gpuAvailable = false;

            const result = runTransactionPipeline({
                cardNumber: '4111111111111111',
                amount: 100.00,
                cvv: '123',
            });

            expect(result.errors).toHaveLength(0);
            expect(result.stages.acquirerResponse.status).toBe('Approved');
        });
    });

    // ─── 6. Secure vault flow ─────────────────────────────────────────────────
    describe('6. Secure vault flow', () => {
        test('PAN is stored and retrievable during transaction', () => {
            const cardNumber = '4111111111111111';
            const vaultKey = `vault_test_${Date.now()}`;

            secureVault.store(`${vaultKey}_pan`, cardNumber);
            const retrieved = secureVault.retrieve(`${vaultKey}_pan`);

            expect(retrieved).toBe(cardNumber);

            // Cleanup
            secureVault.clear(`${vaultKey}_pan`);
        });

        test('PAN is cleared from vault after transaction completes', () => {
            const result = runTransactionPipeline({
                cardNumber: '4111111111111111',
                amount: 100.00,
                cvv: '123',
            });

            expect(result.stages.vaultCleared).toBe(true);
        });

        test('vault stores data encrypted (raw vault entry is not plaintext)', () => {
            const cardNumber = '4111111111111111';
            const vaultKey = `vault_enc_test_${Date.now()}`;

            secureVault.store(`${vaultKey}_pan`, cardNumber);

            // Access internal vault map to verify data is not stored as plaintext
            const rawRecord = secureVault.vault.get(`${vaultKey}_pan`);
            expect(rawRecord).toBeDefined();
            expect(rawRecord.data).not.toBe(cardNumber);
            expect(rawRecord.iv).toBeDefined();

            secureVault.clear(`${vaultKey}_pan`);
        });

        test('vault audit log records access on retrieve', () => {
            const vaultKey = `vault_audit_test_${Date.now()}`;
            secureVault.store(`${vaultKey}_pan`, '4111111111111111');

            const logBefore = secureVault.getAuditLog({ key: `${vaultKey}_pan` }).length;
            secureVault.retrieve(`${vaultKey}_pan`);
            const logAfter = secureVault.getAuditLog({ key: `${vaultKey}_pan` }).length;

            expect(logAfter).toBe(logBefore + 1);

            secureVault.clear(`${vaultKey}_pan`);
        });
    });

    // ─── 7. Audit logging flow ────────────────────────────────────────────────
    describe('7. Audit logging flow', () => {
        test('transaction_start event is logged', () => {
            auditLogger.clearAllLogs();

            runTransactionPipeline({
                cardNumber: '4111111111111111',
                amount: 100.00,
                cvv: '123',
            });

            const events = auditLogger.getSecurityEvents({ type: 'transaction_start' });
            expect(events.length).toBeGreaterThanOrEqual(1);
        });

        test('transaction completion event is logged', () => {
            auditLogger.clearAllLogs();

            runTransactionPipeline({
                cardNumber: '4111111111111111',
                amount: 100.00,
                cvv: '123',
            });

            const events = auditLogger.getSecurityEvents({ type: 'transaction_complete' });
            expect(events.length).toBeGreaterThanOrEqual(1);
        });

        test('transaction log entry is created with correct fields', () => {
            auditLogger.clearAllLogs();

            runTransactionPipeline({
                cardNumber: '4111111111111111',
                amount: 99.99,
                cvv: '123',
            });

            const txLogs = auditLogger.getTransactionLogs();
            expect(txLogs.length).toBeGreaterThanOrEqual(1);

            const entry = txLogs[txLogs.length - 1];
            expect(entry.cardType).toBe('Visa');
            expect(entry.lastFour).toBe('1111');
            expect(entry.amount).toBe(99.99);
            expect(entry.status).toBeDefined();
            expect(entry.securityFlags.cardMasked).toBe(true);
            expect(entry.securityFlags.encrypted).toBe(true);
            expect(entry.securityFlags.auditLogged).toBe(true);
        });

        test('gateway response event is logged for approved transaction', () => {
            auditLogger.clearAllLogs();

            runTransactionPipeline({
                cardNumber: '4111111111111111',
                amount: 100.00,
                cvv: '123',
            });

            // transaction_complete event carries the status
            const events = auditLogger.getSecurityEvents({ type: 'transaction_complete' });
            expect(events.length).toBeGreaterThanOrEqual(1);
            expect(events[0].metadata.status).toBe('Approved');
        });

        test('all expected audit events are present for a full transaction', () => {
            auditLogger.clearAllLogs();

            runTransactionPipeline({
                cardNumber: '4111111111111111',
                amount: 100.00,
                cvv: '123',
            });

            const allEvents = auditLogger.getSecurityEvents();
            const eventTypes = allEvents.map(e => e.type);

            expect(eventTypes).toContain('transaction_start');
            expect(eventTypes).toContain('transaction_complete');

            const txLogs = auditLogger.getTransactionLogs();
            expect(txLogs.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ─── 8. Performance monitoring ────────────────────────────────────────────
    describe('8. Performance monitoring', () => {
        test('processing time is tracked via performanceOptimizer', () => {
            performanceOptimizer.reset();

            runTransactionPipeline({
                cardNumber: '4111111111111111',
                amount: 100.00,
                cvv: '123',
            });

            const metrics = performanceOptimizer.getMetrics();
            expect(metrics['integration-test-transaction']).toBeDefined();
            expect(metrics['integration-test-transaction'].count).toBe(1);
            expect(metrics['integration-test-transaction'].totalTimeMs).toBeGreaterThanOrEqual(0);
        });

        test('processing time accumulates across multiple transactions', () => {
            performanceOptimizer.reset();

            runTransactionPipeline({ cardNumber: '4111111111111111', amount: 10.00, cvv: '123' });
            runTransactionPipeline({ cardNumber: '5500000000000004', amount: 20.00, cvv: '456' });

            const metrics = performanceOptimizer.getMetrics();
            expect(metrics['integration-test-transaction'].count).toBe(2);
        });

        test('transaction processing time is within 500ms', () => {
            const result = runTransactionPipeline({
                cardNumber: '4111111111111111',
                amount: 100.00,
                cvv: '123',
            });

            expect(result.processingTimeMs).toBeLessThan(500);
        });

        test('measureOperation correctly tracks a named operation', () => {
            performanceOptimizer.reset();

            const value = performanceOptimizer.measureOperation('test-op', () => {
                return 42;
            });

            expect(value).toBe(42);
            const metrics = performanceOptimizer.getMetrics();
            expect(metrics['test-op']).toBeDefined();
            expect(metrics['test-op'].count).toBe(1);
        });
    });

});

// ═════════════════════════════════════════════════════════════════════════════
// LEGACY HTTP INTEGRATION TESTS (require a running server on port 6001)
// ═════════════════════════════════════════════════════════════════════════════

describe.skip('Integration Tests - End-to-End Transaction Flow', () => {
    const BASE_URL = 'http://localhost:6001';
    const ADMIN_API_KEY = 'secret-admin-key-2026';

    describe('Payment Processing Flow', () => {
        test('should process a valid payment transaction', async () => {
            const response = await makeRequest({
                hostname: 'localhost',
                port: 6001,
                path: '/api/process-payment',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, {
                cardNumber: '4111111111111111',
                expiryDate: '12/25',
                cvv: '123',
                amount: 99.99,
                currency: 'USD'
            });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.transactionId).toBeDefined();
            expect(response.body.status).toBe('Approved');
            expect(response.body.processingTimeMs).toBeLessThan(500);
        });

        test('should reject invalid card number', async () => {
            const response = await makeRequest({
                hostname: 'localhost',
                port: 6001,
                path: '/api/process-payment',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, {
                cardNumber: '1234567890123456',
                expiryDate: '12/25',
                cvv: '123',
                amount: 50.00,
                currency: 'USD'
            });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBeDefined();
        });

        test('should require MFA for cards ending in 333', async () => {
            const response = await makeRequest({
                hostname: 'localhost',
                port: 6001,
                path: '/api/process-payment',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, {
                cardNumber: '4111111111111111',
                expiryDate: '12/25',
                cvv: '123',
                amount: 75.00,
                currency: 'USD',
                mfaVerified: false
            });

            expect(response.status).toBe(200); // Should process as normal
        });

        test('should process MFA-verified transaction', async () => {
            const response = await makeRequest({
                hostname: 'localhost',
                port: 6001,
                path: '/api/process-payment',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, {
                cardNumber: '4111111111111111',
                expiryDate: '12/25',
                cvv: '123',
                amount: 75.00,
                currency: 'USD',
                mfaVerified: true
            });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });

        test('should handle different card types', async () => {
            const testCards = [
                { number: '4111111111111111', type: 'Visa' },
                { number: '5500000000000004', type: 'Mastercard' },
                { number: '340000000000009', type: 'American Express' }
            ];

            for (const card of testCards) {
                const response = await makeRequest({
                    hostname: 'localhost',
                    port: 6001,
                    path: '/api/process-payment',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                }, {
                    cardNumber: card.number,
                    expiryDate: '12/25',
                    cvv: '123',
                    amount: 100.00,
                    currency: 'USD'
                });

                expect(response.status).toBe(200);
                expect(response.body.success).toBeDefined();
            }
        });
    });

    describe('Admin API Security', () => {
        test('should reject admin API without API key', async () => {
            const response = await makeRequest({
                hostname: 'localhost',
                port: 6001,
                path: '/api/transactions',
                method: 'GET'
            });

            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
        });

        test('should reject admin API with invalid API key', async () => {
            const response = await makeRequest({
                hostname: 'localhost',
                port: 6001,
                path: '/api/transactions',
                method: 'GET',
                headers: { 'x-api-key': 'invalid-key' }
            });

            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
        });

        test('should allow admin API with valid API key', async () => {
            const response = await makeRequest({
                hostname: 'localhost',
                port: 6001,
                path: '/api/transactions',
                method: 'GET',
                headers: { 'x-api-key': ADMIN_API_KEY }
            });

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('should retrieve merchant settings', async () => {
            const response = await makeRequest({
                hostname: 'localhost',
                port: 6001,
                path: '/api/settings',
                method: 'GET',
                headers: { 'x-api-key': ADMIN_API_KEY }
            });

            expect(response.status).toBe(200);
            expect(response.body.accountNumber).toBeDefined();
            expect(response.body.iban).toBeDefined();
        });

        test('should update merchant settings', async () => {
            const newSettings = {
                merchantName: 'Updated Merchant Name',
                autoPayout: true
            };

            const response = await makeRequest({
                hostname: 'localhost',
                port: 6001,
                path: '/api/settings',
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-api-key': ADMIN_API_KEY 
                }
            }, newSettings);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.settings.merchantName).toBe('Updated Merchant Name');
        });
    });

    describe('Transaction Data Integrity', () => {
        test('should maintain transaction history', async () => {
            // Process a transaction
            await makeRequest({
                hostname: 'localhost',
                port: 6001,
                path: '/api/process-payment',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, {
                cardNumber: '4111111111111111',
                expiryDate: '12/25',
                cvv: '123',
                amount: 150.00,
                currency: 'USD'
            });

            // Retrieve transactions
            const response = await makeRequest({
                hostname: 'localhost',
                port: 6001,
                path: '/api/transactions',
                method: 'GET',
                headers: { 'x-api-key': ADMIN_API_KEY }
            });

            expect(response.status).toBe(200);
            expect(response.body.length).toBeGreaterThan(0);
            
            // Verify transaction structure
            const txn = response.body[response.body.length - 1];
            expect(txn.id).toBeDefined();
            expect(txn.cardType).toBeDefined();
            expect(txn.lastFour).toBeDefined();
            expect(txn.amount).toBeDefined();
            expect(txn.status).toBeDefined();
            expect(txn.timestamp).toBeDefined();
        });

        test('should mask card numbers in stored transactions', async () => {
            const response = await makeRequest({
                hostname: 'localhost',
                port: 6001,
                path: '/api/transactions',
                method: 'GET',
                headers: { 'x-api-key': ADMIN_API_KEY }
            });

            // All transactions should have lastFour, not full card number
            response.body.forEach(txn => {
                expect(txn.lastFour).toBeDefined();
                expect(txn.lastFour).toHaveLength(4);
                // Should not have full cardNumber field
                expect(txn.cardNumber).toBeUndefined();
            });
        });
    });

    describe('Performance Requirements', () => {
        test('should process transactions within 500ms', async () => {
            const startTime = Date.now();
            
            const response = await makeRequest({
                hostname: 'localhost',
                port: 6001,
                path: '/api/process-payment',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, {
                cardNumber: '4111111111111111',
                expiryDate: '12/25',
                cvv: '123',
                amount: 50.00,
                currency: 'USD'
            });

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            expect(response.status).toBe(200);
            expect(response.body.processingTimeMs).toBeLessThan(500);
            expect(totalTime).toBeLessThan(1000); // Allow some network overhead
        });
    });

    describe('Payout Processing', () => {
        test('should request payout for settled transactions', async () => {
            const response = await makeRequest({
                hostname: 'localhost',
                port: 6001,
                path: '/api/request-payout',
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-api-key': ADMIN_API_KEY 
                }
            });

            // May succeed or fail depending on available settled transactions
            expect(response.status).toBeDefined();
            expect([200, 400]).toContain(response.status);
        });
    });
});
