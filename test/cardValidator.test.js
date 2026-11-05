const fc = require('fast-check');
const {
    validateCard,
    detectCardType,
    maskCardNumber,
    validateLuhn
} = require('../utils/cardValidator');

/**
 * Property 1: Card Validation Round-Trip
 * For any valid card number, validating it and then re-validating the result should produce the same outcome.
 * Validates: Requirements 1.1, 1.4, 1.5
 */
describe('Card Validation Round-Trip', () => {
    test('valid card validation is consistent', () => {
        fc.assert(fc.property(fc.string(), (cardNumber) => {
            const firstResult = validateCard(cardNumber);
            
            // If first validation returned a result with errorCode, re-validation should return same
            if (!firstResult.isValid && firstResult.errorCode) {
                const secondResult = validateCard(cardNumber);
                expect(secondResult.isValid).toBe(firstResult.isValid);
                expect(secondResult.errorCode).toBe(firstResult.errorCode);
            }
            
            return true;
        }), { numRuns: 100 });
    });

    test('invalid card validation is consistent', () => {
        fc.assert(fc.property(fc.string(), (cardNumber) => {
            const firstResult = validateCard(cardNumber);
            
            if (!firstResult.isValid) {
                const secondResult = validateCard(cardNumber);
                expect(secondResult.isValid).toBe(false);
                expect(secondResult.errorCode).toBe(firstResult.errorCode);
            }
            
            return true;
        }), { numRuns: 100 });
    });
});

/**
 * Property 2: Card Type Detection Consistency
 * For any card number, detecting its type should consistently return the same card type across multiple detections.
 * Validates: Requirements 1.2
 */
describe('Card Type Detection Consistency', () => {
    test('detectCardType returns consistent results', () => {
        fc.assert(fc.property(fc.string(), (cardNumber) => {
            const firstDetection = detectCardType(cardNumber);
            const secondDetection = detectCardType(cardNumber);
            
            expect(firstDetection).toBe(secondDetection);
            return true;
        }), { numRuns: 100 });
    });

    test('known valid card types are detected consistently', () => {
        const validCards = [
            { number: '4111111111111111', type: 'Visa' },
            { number: '5105105105105100', type: 'Mastercard' },
            { number: '378282246310005', type: 'American Express' },
            { number: '6011111111111117', type: 'Discover' }
        ];

        validCards.forEach(card => {
            const first = detectCardType(card.number);
            const second = detectCardType(card.number);
            expect(first).toBe(card.type);
            expect(second).toBe(card.type);
        });
    });
});

/**
 * Property 3: Card Number Masking
 * For any card number, masking it should preserve the last N digits while replacing all others with asterisks.
 * Validates: Requirements 1.3
 */
describe('Card Number Masking', () => {
    test('maskCardNumber preserves last N digits', () => {
        fc.assert(fc.property(
            fc.string({ minLength: 10, maxLength: 20 }),
            fc.integer({ min: 1, max: 10 }),
            (cardNumber, visibleDigits) => {
                const masked = maskCardNumber(cardNumber, visibleDigits);
                const cleaned = cardNumber.replace(/\D/g, '');
                
                if (cleaned.length <= visibleDigits) {
                    expect(masked).toBe(cleaned);
                } else {
                    const expectedLastDigits = cleaned.slice(-visibleDigits);
                    const expectedMaskedPart = '*'.repeat(cleaned.length - visibleDigits);
                    expect(masked).toBe(expectedMaskedPart + expectedLastDigits);
                }
                
                return true;
            }
        ), { numRuns: 100 });
    });

    test('maskCardNumber with default visibleDigits (4)', () => {
        fc.assert(fc.property(
            fc.string({ minLength: 10, maxLength: 20 }),
            (cardNumber) => {
                const masked = maskCardNumber(cardNumber);
                const cleaned = cardNumber.replace(/\D/g, '');
                
                if (cleaned.length <= 4) {
                    expect(masked).toBe(cleaned);
                } else {
                    const lastFour = cleaned.slice(-4);
                    const maskedLength = cleaned.length - 4;
                    const maskedPart = '*'.repeat(maskedLength);
                    expect(masked).toBe(maskedPart + lastFour);
                }
                
                return true;
            }
        ), { numRuns: 100 });
    });

    test('maskCardNumber handles known card numbers correctly', () => {
        const testCards = [
            { number: '4111111111111111', expected: '************1111' },
            { number: '5105105105105100', expected: '************5100' },
            { number: '378282246310005', expected: '***********0005' }
        ];

        testCards.forEach(card => {
            const masked = maskCardNumber(card.number);
            expect(masked).toBe(card.expected);
        });
    });
});

// Unit tests for specific examples
describe('Card Validator Unit Tests', () => {
    describe('validateCard', () => {
        test('returns valid result for Visa card', () => {
            const result = validateCard('4111111111111111');
            expect(result.isValid).toBe(true);
            expect(result.cardType).toBe('Visa');
            expect(result.lastFour).toBe('1111');
        });

        test('returns valid result for Mastercard', () => {
            const result = validateCard('5105105105105100');
            expect(result.isValid).toBe(true);
            expect(result.cardType).toBe('Mastercard');
            expect(result.lastFour).toBe('5100');
        });

        test('returns valid result for American Express', () => {
            const result = validateCard('378282246310005');
            expect(result.isValid).toBe(true);
            expect(result.cardType).toBe('American Express');
            expect(result.lastFour).toBe('0005');
        });

        test('returns valid result for Discover', () => {
            const result = validateCard('6011111111111117');
            expect(result.isValid).toBe(true);
            expect(result.cardType).toBe('Discover');
            expect(result.lastFour).toBe('1117');
        });

        test('returns E001 error for invalid Luhn', () => {
            const result = validateCard('4111111111111112');
            expect(result.isValid).toBe(false);
            expect(result.errorCode).toBe('E001');
            expect(result.error).toContain('Luhn check failed');
        });

        test('returns E002 error for unknown card type', () => {
            const result = validateCard('1234567890123456');
            expect(result.isValid).toBe(false);
            expect(result.errorCode).toBe('E002');
            expect(result.error).toContain('Unknown card type');
        });

        test('returns E003 error for empty card number', () => {
            const result = validateCard('');
            expect(result.isValid).toBe(false);
            expect(result.errorCode).toBe('E003');
            expect(result.error).toContain('Empty card number');
        });

        test('returns E003 error for whitespace-only card number', () => {
            const result = validateCard('   ');
            expect(result.isValid).toBe(false);
            expect(result.errorCode).toBe('E003');
        });
    });

    describe('detectCardType', () => {
        test('detects Visa', () => {
            expect(detectCardType('4111111111111111')).toBe('Visa');
        });

        test('detects Mastercard', () => {
            expect(detectCardType('5105105105105100')).toBe('Mastercard');
        });

        test('detects American Express', () => {
            expect(detectCardType('378282246310005')).toBe('American Express');
        });

        test('detects Discover', () => {
            expect(detectCardType('6011111111111117')).toBe('Discover');
        });

        test('returns null for invalid card', () => {
            expect(detectCardType('1234567890123456')).toBeNull();
        });
    });

    describe('maskCardNumber', () => {
        test('masks Visa card with default 4 digits', () => {
            expect(maskCardNumber('4111111111111111')).toBe('************1111');
        });

        test('masks card with custom visible digits', () => {
            expect(maskCardNumber('4111111111111111', 6)).toBe('**********111111');
        });

        test('handles short card numbers', () => {
            expect(maskCardNumber('123', 4)).toBe('123');
        });
    });
});
