/**
 * Card validation and type detection logic.
 */

const cardTypes = [
    {
        name: 'Visa',
        pattern: /^4/,
        lengths: [13, 16, 19]          // EMV contactless can return 19-digit Visa PANs
    },
    {
        name: 'Mastercard',
        pattern: /^(5[1-5]|2[2-7])/,
        lengths: [16]
    },
    {
        name: 'American Express',
        pattern: /^3[47]/,
        lengths: [15]
    },
    {
        name: 'Discover',
        pattern: /^(6011|622(12[6-9]|1[3-9][0-9]|[2-8][0-9]{2}|9[0-1][0-9]|92[0-5])|64[4-9]|65)/,
        lengths: [16, 19]
    },
    {
        name: 'Mastercard',            // Mastercard contactless can return 17-19 digit PANs
        pattern: /^(5[1-5]|2[2-7])/,
        lengths: [17, 18, 19]
    },
    {
        name: 'Visa',
        pattern: /^4/,
        lengths: [17, 18]
    },
    {
        name: 'UnionPay',
        pattern: /^(62|81)/,
        lengths: [16, 17, 18, 19]
    },
    {
        name: 'Maestro',
        pattern: /^(6304|6759|6761|6762|6763)/,
        lengths: [12, 13, 14, 15, 16, 17, 18, 19]
    }
];

/**
 * Validates a card number using the Luhn algorithm.
 * @param {string} cardNumber 
 * @returns {boolean}
 */
function validateLuhn(cardNumber) {
    let sum = 0;
    let shouldDouble = false;
    
    // Loop through the card number from right to left
    for (let i = cardNumber.length - 1; i >= 0; i--) {
        let digit = parseInt(cardNumber.charAt(i));

        if (shouldDouble) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }

        sum += digit;
        shouldDouble = !shouldDouble;
    }

    return (sum % 10) === 0;
}

/**
 * Detects the card type based on the pattern and length.
 * @param {string} cardNumber 
 * @returns {string|null}
 */
function detectCardType(cardNumber) {
    const cleaned = cardNumber.replace(/\D/g, '');
    for (const type of cardTypes) {
        if (type.pattern.test(cleaned) && type.lengths.includes(cleaned.length)) {
            return type.name;
        }
    }
    return null;
}

/**
 * Masks a card number, preserving only the last N digits.
 * @param {string} cardNumber - The card number to mask
 * @param {number} visibleDigits - Number of digits to keep visible at the end (default: 4)
 * @returns {string} The masked card number
 */
function maskCardNumber(cardNumber, visibleDigits = 4) {
    const cleaned = cardNumber.replace(/\D/g, '');
    if (cleaned.length <= visibleDigits) {
        return cleaned;
    }
    
    const visiblePart = cleaned.slice(-visibleDigits);
    const maskedLength = cleaned.length - visibleDigits;
    const maskedPart = '*'.repeat(maskedLength);
    
    return maskedPart + visiblePart;
}

/**
 * Full validation of a card with structured error reporting.
 * @param {string} cardNumber 
 * @returns {object}
 */
function validateCard(cardNumber) {
    const cleaned = cardNumber.replace(/\D/g, '');
    
    if (!cleaned) {
        return {
            isValid: false,
            error: 'Empty card number',
            errorCode: 'E003'
        };
    }

    const cardType = detectCardType(cleaned);
    if (!cardType) {
        return {
            isValid: false,
            error: 'Unknown card type or invalid length',
            errorCode: 'E002'
        };
    }

    const isLuhnValid = validateLuhn(cleaned);
    if (!isLuhnValid) {
        return {
            isValid: false,
            error: 'Invalid card number (Luhn check failed)',
            errorCode: 'E001'
        };
    }

    return {
        isValid: true,
        cardType,
        lastFour: cleaned.slice(-4)
    };
}

module.exports = {
    validateCard,
    detectCardType,
    validateLuhn,
    maskCardNumber
};
