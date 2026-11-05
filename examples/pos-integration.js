/**
 * PRIMESTACK Payment Processor - POS Integration Example - JavaScript
 * Integrate your Point-of-Sale system with PRIMESTACK
 */

const PrimestackAPI = {
    baseUrl: 'http://localhost:6001',
    credentials: {
        clientId: '',
        clientSecret: '',
        apiKey: ''
    },

    // Initialize with your PRIMESTACK credentials (from Settings tab)
    init({ clientId, clientSecret, apiKey }) {
        this.credentials = { clientId, clientSecret, apiKey };
        console.log('✅ PRIMESTACK Payment Processor initialized');
    },

    // Get authorization headers
    _getHeaders() {
        return {
            'Content-Type': 'application/json',
            'x-client-id': this.credentials.clientId,
            'x-client-secret': this.credentials.clientSecret,
            'x-api-key': this.credentials.apiKey
        };
    },

    // Process a payment from your POS
    async processPayment(amount, cardDetails, currency = 'USD') {
        try {
            const response = await fetch(`${this.baseUrl}/api/process-payment`, {
                method: 'POST',
                headers: this._getHeaders(),
                body: JSON.stringify({
                    card: cardDetails,
                    amount: amount,
                    currency: currency
                })
            });

            const result = await response.json();
            
            if (result.success) {
                console.log('✅ Payment approved!', result.transaction);
                return result;
            } else {
                console.error('❌ Payment failed:', result.message);
                return result;
            }
        } catch (error) {
            console.error('💥 Error processing payment:', error.message);
            throw error;
        }
    },

    // Get transaction status (for verification)
    async getTransaction(transactionId) {
        try {
            const response = await fetch(`${this.baseUrl}/api/transactions/${transactionId}`, {
                headers: this._getHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Error getting transaction:', error);
            throw error;
        }
    },

    // Get transaction history
    async getTransactions(status = null, limit = 100) {
        try {
            let url = `${this.baseUrl}/api/transactions`;
            const params = new URLSearchParams();
            
            if (status) params.append('status', status);
            if (limit) params.append('limit', limit);
            
            if (params.toString()) {
                url += '?' + params.toString();
            }

            const response = await fetch(url, {
                headers: this._getHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Error getting transactions:', error);
            throw error;
        }
    },

    // Request a payout
    async requestPayout() {
        try {
            const response = await fetch(`${this.baseUrl}/api/request-payout`, {
                method: 'POST',
                headers: this._getHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Error requesting payout:', error);
            throw error;
        }
    },

    // Get account balance
    async getBalance() {
        try {
            const response = await fetch(`${this.baseUrl}/api/balance`, {
                headers: this._getHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('Error getting balance:', error);
            throw error;
        }
    }
};

// --- Example Usage ---

function examplePOSUsage() {
    // Initialize with your PRIMESTACK credentials (get from Settings tab!)
    PrimestackAPI.init({
        clientId: 'YOUR_CLIENT_ID',
        clientSecret: 'YOUR_CLIENT_SECRET',
        apiKey: 'YOUR_API_KEY'
    });

    // Example: Process a payment from your POS
    const orderTotal = 49.99;
    const customerCard = {
        cardNumber: '4111111111111111',
        expiryDate: '12/28',
        cvv: '123',
        cardHolder: 'Jane Smith'
    };

    console.log('💳 Processing payment for $', orderTotal);

    PrimestackAPI.processPayment(orderTotal, customerCard, 'USD')
        .then(result => {
            if (result.success) {
                // Update your POS order status here
                console.log('🎉 Payment successful! Transaction ID:', result.transaction.id);
                console.log('💾 Save transaction to your POS database');
                
                // Optionally, check status later
                // return PrimestackAPI.getTransaction(result.transaction.id);
            }
        })
        .catch(error => {
            console.error('💸 Payment failed');
        });
}

// Export for Node.js usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PrimestackAPI;
}
