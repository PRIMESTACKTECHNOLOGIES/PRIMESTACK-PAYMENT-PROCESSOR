/**
 * Mock Acquirer Service.
 * Simulates a bank's response to an ISO8583 request.
 *
 * This is a SIMULATED processing path and is gated to non-production
 * environments (see config/security.isSimulationAllowed). In production it
 * refuses to run unless ALLOW_SIMULATION=true is explicitly set.
 */

const securityConfig = require('../config/security');

class MockAcquirer {
    /**
     * ISO 8583 Response Codes
     */
    static RESPONSE_CODES = {
        APPROVED: '00',
        REFER_TO_ISSUER: '01',
        INVALID_MERCHANT: '03',
        PICK_UP_CARD: '04',
        DO_NOT_HONOR: '05',
        INVALID_TRANSACTION: '12',
        INVALID_AMOUNT: '13',
        INVALID_CARD_NUMBER: '14',
        NO_SUCH_ISSUER: '15',
        EXPIRED_CARD: '54',
        INSUFFICIENT_FUNDS: '51',
        SECURITY_VIOLATION: '63',
        EXCEEDS_WITHDRAWAL_LIMIT: '65',
        SYSTEM_ERROR: '96'
    };

    /**
     * Processes an ISO8583 request and returns a response message.
     * @param {object} parsedRequest 
     * @param {string} merchantAccount
     * @returns {object}
     */
    static processRequest(parsedRequest, merchantAccount = 'ACT_9988776655') {
        // Fail-closed: refuse simulated approvals outside permitted environments
        if (!securityConfig.isSimulationAllowed()) {
            throw new Error(securityConfig.simulation.disabledMessage);
        }

        const { cardNumber, amount, cvvStatus } = parsedRequest;
        
        // Determine amount in dollars for limit comparison.
        // Tests pass dollar amounts directly (e.g. '5000.01', '99.99').
        // The ISO8583 pipeline passes zero-padded cents strings (e.g. '000000600000').
        // Detect by presence of a decimal point: if no decimal, treat as cents.
        let amountDollars;
        if (amount.includes('.')) {
            amountDollars = parseFloat(amount);
        } else {
            amountDollars = parseInt(amount, 10) / 100;
        }
        console.log('[ACQUIRER] Amount:', amount, 'Amount dollars:', amountDollars);
        const limitDollars = 5000; // $5,000.00 limit
        
        // Default response: Approved
        const response = {
            mti: '0210',
            status: 'Approved',
            approvalCode: Math.floor(Math.random() * 900000 + 100000).toString(),
            responseCode: this.RESPONSE_CODES.APPROVED
        };

        // Simulated Real-World Testing Scenarios based on Card Numbers
        // (Using standard industry test patterns)
        
        // Check card number patterns - use startsWith for more precise matching
        if (cardNumber.startsWith('51')) { // Simulate Insufficient Funds
            response.status = 'Declined';
            response.responseCode = this.RESPONSE_CODES.INSUFFICIENT_FUNDS;
            response.approvalCode = '000000';
        } else if (cardNumber.startsWith('05')) { // Simulate "Do Not Honor" (General Decline)
            response.status = 'Declined';
            response.responseCode = this.RESPONSE_CODES.DO_NOT_HONOR;
            response.approvalCode = '000000';
        } else if (cardNumber.startsWith('54')) { // Simulate Expired Card
            response.status = 'Declined';
            response.responseCode = this.RESPONSE_CODES.EXPIRED_CARD;
            response.approvalCode = '000000';
        } else if (cvvStatus === 'MISSING') { // Simulate Security Violation
            response.status = 'Declined';
            response.responseCode = this.RESPONSE_CODES.SECURITY_VIOLATION;
            response.approvalCode = '000000';
        } else if (amountDollars > limitDollars) { // $5,000.00 limit for simulation
            response.status = 'Declined';
            response.responseCode = this.RESPONSE_CODES.EXCEEDS_WITHDRAWAL_LIMIT;
            response.approvalCode = '000000';
        }

        if (response.status === 'Approved') {
            // Simulate fund movement: Settlement to Merchant Account
            console.log(`[SETTLEMENT] Initiating transfer of ${parsedRequest.amount} to Merchant Account: ${merchantAccount}`);
            response.settlementStatus = 'Settled';
            response.merchantAccount = merchantAccount;
        }

        return response;
    }
}

module.exports = MockAcquirer;
