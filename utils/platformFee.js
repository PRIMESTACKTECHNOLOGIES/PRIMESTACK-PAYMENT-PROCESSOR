/**
 * Platform Fee Calculator
 * Calculates PRIMESTACK's fee on each transaction.
 * You (the processor owner) keep this fee.
 */

class PlatformFee {

    /**
     * Calculate fee for a transaction
     * @param {number} amount - Transaction amount
     * @param {number} feePercent - Merchant's fee rate (e.g. 1.5 = 1.5%)
     * @param {string} currency - Currency code
     * @returns {Object} Fee breakdown
     */
    calculate(amount, feePercent, currency = 'USD') {
        const rate = parseFloat(feePercent) / 100;
        const fee = Math.round(amount * rate * 100) / 100;       // round to 2 decimal places
        const merchantReceives = Math.round((amount - fee) * 100) / 100;

        return {
            grossAmount: amount,
            feePercent: feePercent,
            feeAmount: fee,
            merchantReceives,
            currency
        };
    }

    /**
     * Calculate fee in cents (for Stripe)
     */
    calculateInCents(amountCents, feePercent) {
        const rate = parseFloat(feePercent) / 100;
        return Math.round(amountCents * rate);
    }

    /**
     * Get default platform fee percent from environment
     */
    getDefaultFeePercent() {
        return parseFloat(process.env.PLATFORM_FEE_PERCENT || '1.0');
    }
}

module.exports = new PlatformFee();
