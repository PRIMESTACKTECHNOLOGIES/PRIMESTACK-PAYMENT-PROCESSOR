const { validateCard } = require('./utils/cardValidator');

const testCards = [
    { number: '4111111111111111', expected: 'Visa' },
    { number: '5105105105105100', expected: 'Mastercard' },
    { number: '378282246310005', expected: 'American Express' },
    { number: '6011111111111117', expected: 'Discover' },
    { number: '1234567890123456', expected: null } // Invalid
];

testCards.forEach(card => {
    const result = validateCard(card.number);
    if (result.isValid) {
        console.log(`Card ${card.number}: Valid - Type: ${result.cardType}`);
    } else {
        console.log(`Card ${card.number}: Invalid - Error: ${result.error}`);
    }
});
