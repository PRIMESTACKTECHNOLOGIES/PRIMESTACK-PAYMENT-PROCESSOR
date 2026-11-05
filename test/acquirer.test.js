const fc = require('fast-check');
const MockAcquirer = require('../utils/acquirer');

/**
 * Property 7: Mock Acquirer Response Determinism
 * For any transaction request with specific card number and amount, the mock acquirer
 * should return the same response type (approved/declined with specific reason).
 * Validates: Requirements 11.1, 11.2
 */
describe('Mock Acquirer Response Determinism', () => {
    test('same card number and amount produce same response', () => {
        fc.assert(fc.property(
            fc.string({ minLength: 10, maxLength: 20 }),
            fc.integer({ min: 1, max: 100000 }),
            fc.boolean(),
            (cardNumber, amountCents, hasCvv) => {
                const request1 = {
                    cardNumber: cardNumber.replace(/\D/g, ''),
                    amount: (amountCents / 100).toFixed(2),
                    cvvStatus: hasCvv ? 'VALID' : 'MISSING'
                };
                
                const request2 = {
                    cardNumber: cardNumber.replace(/\D/g, ''),
                    amount: (amountCents / 100).toFixed(2),
                    cvvStatus: hasCvv ? 'VALID' : 'MISSING'
                };
                
                const response1 = MockAcquirer.processRequest(request1);
                const response2 = MockAcquirer.processRequest(request2);
                
                // Same inputs should produce same status
                expect(response1.status).toBe(response2.status);
                
                // Same inputs should produce same response code
                expect(response1.responseCode).toBe(response2.responseCode);
                
                return true;
            }
        ), { numRuns: 100 });
    });

    test('card patterns produce consistent responses', () => {
        const testCases = [
            { cardNumber: '5105105105105100', expectedStatus: 'Declined', expectedCode: '51' },
            { cardNumber: '4111111111111111', expectedStatus: 'Approved', expectedCode: '00' },
            { cardNumber: '378282246310005', expectedStatus: 'Approved', expectedCode: '00' }
        ];

        testCases.forEach(({ cardNumber, expectedStatus, expectedCode }) => {
            const request = {
                cardNumber,
                amount: '99.99',
                cvvStatus: 'VALID'
            };
            
            const response1 = MockAcquirer.processRequest(request);
            const response2 = MockAcquirer.processRequest(request);
            
            expect(response1.status).toBe(expectedStatus);
            expect(response1.responseCode).toBe(expectedCode);
            expect(response2.status).toBe(expectedStatus);
            expect(response2.responseCode).toBe(expectedCode);
        });
    });

    test('amount thresholds produce consistent responses', () => {
        const request = {
            cardNumber: '4111111111111111',
            cvvStatus: 'VALID'
        };

        // Below limit
        const belowLimit = { ...request, amount: '4999.99' };
        const responseBelow = MockAcquirer.processRequest(belowLimit);
        
        // At limit
        const atLimit = { ...request, amount: '5000.00' };
        const responseAtLimit = MockAcquirer.processRequest(atLimit);
        
        // Above limit
        const aboveLimit = { ...request, amount: '5000.01' };
        const responseAbove = MockAcquirer.processRequest(aboveLimit);

        // Below and at limit should be approved
        expect(responseBelow.status).toBe('Approved');
        expect(responseAtLimit.status).toBe('Approved');
        
        // Above limit should be declined
        expect(responseAbove.status).toBe('Declined');
        expect(responseAbove.responseCode).toBe(MockAcquirer.RESPONSE_CODES.EXCEEDS_WITHDRAWAL_LIMIT);
    });
});

/**
 * Property 8: Mock Acquirer Settlement
 * For any approved transaction, the mock acquirer should initiate settlement to the merchant account.
 * Validates: Requirements 11.4
 */
describe('Mock Acquirer Settlement Processing', () => {
    test('approved transactions have settlement status', () => {
        fc.assert(fc.property(
            fc.string({ minLength: 10, maxLength: 20 }),
            fc.integer({ min: 1, max: 499999 }),
            (cardNumber, amountCents) => {
                const request = {
                    cardNumber: cardNumber.replace(/\D/g, ''),
                    amount: (amountCents / 100).toFixed(2),
                    cvvStatus: 'VALID'
                };
                
                const response = MockAcquirer.processRequest(request, 'TEST_MERCHANT_123');
                
                // If approved, should have settlement status
                if (response.status === 'Approved') {
                    expect(response.settlementStatus).toBe('Settled');
                    expect(response.merchantAccount).toBe('TEST_MERCHANT_123');
                }
                
                return true;
            }
        ), { numRuns: 100 });
    });

    test('declined transactions do not have settlement status', () => {
        const declinedCards = [
            { cardNumber: '5105105105105100', reason: 'insufficient funds' },
            { cardNumber: '0505105105105100', reason: 'general decline' }
        ];

        declinedCards.forEach(({ cardNumber, reason }) => {
            const request = {
                cardNumber,
                amount: '99.99',
                cvvStatus: 'VALID'
            };
            
            const response = MockAcquirer.processRequest(request);
            
            expect(response.status).toBe('Declined');
            expect(response.settlementStatus).toBeUndefined();
            expect(response.merchantAccount).toBeUndefined();
        });
    });

    test('settlement includes transaction details', () => {
        const request = {
            cardNumber: '4111111111111111',
            amount: '123.45',
            cvvStatus: 'VALID'
        };
        
        const response = MockAcquirer.processRequest(request, 'MERCHANT_456');
        
        expect(response.status).toBe('Approved');
        expect(response.settlementStatus).toBe('Settled');
        expect(response.merchantAccount).toBe('MERCHANT_456');
        expect(response.approvalCode).toMatch(/^\d{6}$/);
        expect(response.mti).toBe('0210');
    });
});

// Unit tests for specific examples
describe('Mock Acquirer Unit Tests', () => {
    describe('processRequest', () => {
        test('approves valid Visa transaction', () => {
            const request = {
                cardNumber: '4111111111111111',
                amount: '99.99',
                cvvStatus: 'VALID'
            };
            
            const response = MockAcquirer.processRequest(request);
            
            expect(response.status).toBe('Approved');
            expect(response.responseCode).toBe('00');
            expect(response.approvalCode).toMatch(/^\d{6}$/);
            expect(response.mti).toBe('0210');
        });

        test('declines transaction for card starting with 51', () => {
            const request = {
                cardNumber: '5105105105105100',
                amount: '99.99',
                cvvStatus: 'VALID'
            };
            
            const response = MockAcquirer.processRequest(request);
            
            expect(response.status).toBe('Declined');
            expect(response.responseCode).toBe(MockAcquirer.RESPONSE_CODES.INSUFFICIENT_FUNDS);
            expect(response.approvalCode).toBe('000000');
        });

        test('declines transaction for card starting with 05', () => {
            const request = {
                cardNumber: '0505105105105100',
                amount: '99.99',
                cvvStatus: 'VALID'
            };
            
            const response = MockAcquirer.processRequest(request);
            
            expect(response.status).toBe('Declined');
            expect(response.responseCode).toBe(MockAcquirer.RESPONSE_CODES.DO_NOT_HONOR);
        });

        test('declines transaction for card starting with 54', () => {
            const request = {
                cardNumber: '5405105105105100',
                amount: '99.99',
                cvvStatus: 'VALID'
            };
            
            const response = MockAcquirer.processRequest(request);
            
            expect(response.status).toBe('Declined');
            expect(response.responseCode).toBe(MockAcquirer.RESPONSE_CODES.EXPIRED_CARD);
        });

        test('declines transaction with missing CVV', () => {
            const request = {
                cardNumber: '4111111111111111',
                amount: '99.99',
                cvvStatus: 'MISSING'
            };
            
            const response = MockAcquirer.processRequest(request);
            
            expect(response.status).toBe('Declined');
            expect(response.responseCode).toBe(MockAcquirer.RESPONSE_CODES.SECURITY_VIOLATION);
        });

        test('declines transaction exceeding $5000 limit', () => {
            const request = {
                cardNumber: '4111111111111111',
                amount: '5000.01',
                cvvStatus: 'VALID'
            };
            
            const response = MockAcquirer.processRequest(request);
            
            expect(response.status).toBe('Declined');
            expect(response.responseCode).toBe(MockAcquirer.RESPONSE_CODES.EXCEEDS_WITHDRAWAL_LIMIT);
        });

        test('includes settlement info for approved transaction', () => {
            const request = {
                cardNumber: '4111111111111111',
                amount: '99.99',
                cvvStatus: 'VALID'
            };
            
            const response = MockAcquirer.processRequest(request, 'ACT_9988776655');
            
            expect(response.settlementStatus).toBe('Settled');
            expect(response.merchantAccount).toBe('ACT_9988776655');
        });

        test('does not include settlement info for declined transaction', () => {
            const request = {
                cardNumber: '5105105105105100',
                amount: '99.99',
                cvvStatus: 'VALID'
            };
            
            const response = MockAcquirer.processRequest(request);
            
            expect(response.settlementStatus).toBeUndefined();
            expect(response.merchantAccount).toBeUndefined();
        });
    });

    describe('response codes', () => {
        test('all response codes are defined', () => {
            expect(MockAcquirer.RESPONSE_CODES.APPROVED).toBe('00');
            expect(MockAcquirer.RESPONSE_CODES.REFER_TO_ISSUER).toBe('01');
            expect(MockAcquirer.RESPONSE_CODES.INVALID_MERCHANT).toBe('03');
            expect(MockAcquirer.RESPONSE_CODES.PICK_UP_CARD).toBe('04');
            expect(MockAcquirer.RESPONSE_CODES.DO_NOT_HONOR).toBe('05');
            expect(MockAcquirer.RESPONSE_CODES.INVALID_TRANSACTION).toBe('12');
            expect(MockAcquirer.RESPONSE_CODES.INVALID_AMOUNT).toBe('13');
            expect(MockAcquirer.RESPONSE_CODES.INVALID_CARD_NUMBER).toBe('14');
            expect(MockAcquirer.RESPONSE_CODES.NO_SUCH_ISSUER).toBe('15');
            expect(MockAcquirer.RESPONSE_CODES.EXPIRED_CARD).toBe('54');
            expect(MockAcquirer.RESPONSE_CODES.INSUFFICIENT_FUNDS).toBe('51');
            expect(MockAcquirer.RESPONSE_CODES.SECURITY_VIOLATION).toBe('63');
            expect(MockAcquirer.RESPONSE_CODES.EXCEEDS_WITHDRAWAL_LIMIT).toBe('65');
            expect(MockAcquirer.RESPONSE_CODES.SYSTEM_ERROR).toBe('96');
        });
    });
});
