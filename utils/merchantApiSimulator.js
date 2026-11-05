/**
 * Fake Merchant API Simulator
 * Simulates various merchant gateway requests for testing
 * Includes Amex, Visa, Mastercard, and generic payment gateway patterns
 */

const http = require('http');
const https = require('https');

class MerchantAPISimulator {
    constructor(baseUrl = 'http://localhost:6001') {
        this.baseUrl = baseUrl;
    }

    /**
     * Simulate Amex merchant API request
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Response
     */
    async simulateAmexMerchantRequest(options = {}) {
        const headers = {
            'X-merchant-id': options.merchantId || 'AMX9876543210',
            'X-merchant-secret': options.merchantSecret || '0xdeadbeefcafe',
            'X-Amex-Client-ID': options.clientId || 'FAKE_CLIENT_01',
            'X-Authorization': options.authorization || 'MAC id="1234", nonce="abcd1234", signature="xyz123"',
            'API-Key': options.apiKey || 'AMERICA_1234567890',
            'Host': 'mchnt-test.authorize.net',
            'Connection': 'close',
            'User-Agent': 'AmexTerminalSimulator/3.2.1',
            'Content-Type': 'application/json'
        };

        const payload = {
            amount: options.amount || '1000.00',
            type: options.type || 'visa',
            merchantId: options.merchantId || 'FAKE_MERCHANT_01',
            transactionId: options.transactionId || Date.now().toString(),
            paymentMethod: options.paymentMethod || 'credit-card',
            cardNumber: options.cardNumber || '340000000000009',
            expiryDate: options.expiryDate || '12/25',
            cvv: options.cvv || '1234'
        };

        return this.sendRequest('/api/process-payment', 'POST', headers, payload);
    }

    /**
     * Simulate Visa merchant API request
     */
    async simulateVisaMerchantRequest(options = {}) {
        const headers = {
            'X-Visa-Merchant-ID': options.merchantId || 'VISA_MCHNT_12345',
            'X-Visa-API-Key': options.apiKey || 'visa_api_key_1234567890',
            'X-Request-ID': options.requestId || 'REQ_' + Date.now(),
            'Authorization': `Bearer ${options.token || 'visa_bearer_token_fake'}`,
            'Content-Type': 'application/json',
            'User-Agent': 'VisaMerchantGateway/2.1.0'
        };

        const payload = {
            amount: options.amount || '500.00',
            currency: options.currency || 'USD',
            cardNumber: options.cardNumber || '4111111111111111',
            expiryDate: options.expiryDate || '12/25',
            cvv: options.cvv || '123',
            description: options.description || 'Visa merchant transaction'
        };

        return this.sendRequest('/api/process-payment', 'POST', headers, payload);
    }

    /**
     * Simulate Mastercard merchant API request
     */
    async simulateMastercardMerchantRequest(options = {}) {
        const headers = {
            'X-Mastercard-Merchant-ID': options.merchantId || 'MC_MCHNT_67890',
            'X-Mastercard-API-Key': options.apiKey || 'mc_api_key_0987654321',
            'X-Transaction-ID': options.transactionId || 'MC_TXN_' + Date.now(),
            'Authorization': `Bearer ${options.token || 'mc_bearer_token_fake'}`,
            'Content-Type': 'application/json',
            'User-Agent': 'MastercardGateway/4.0.1'
        };

        const payload = {
            amount: options.amount || '750.00',
            currency: options.currency || 'USD',
            cardNumber: options.cardNumber || '5500000000000004',
            expiryDate: options.expiryDate || '12/25',
            cvv: options.cvv || '456',
            description: options.description || 'Mastercard merchant transaction'
        };

        return this.sendRequest('/api/process-payment', 'POST', headers, payload);
    }

    /**
     * Simulate generic payment gateway request
     */
    async simulateGenericGatewayRequest(options = {}) {
        const headers = {
            'X-Gateway-Merchant-ID': options.merchantId || 'GENERIC_MCHNT_001',
            'X-Gateway-API-Key': options.apiKey || 'generic_gateway_key',
            'X-Request-Timestamp': new Date().toISOString(),
            'Authorization': `Bearer ${options.token || 'generic_token'}`,
            'Content-Type': 'application/json',
            'User-Agent': 'PaymentGateway/1.0.0'
        };

        const payload = {
            amount: options.amount || '100.00',
            currency: options.currency || 'USD',
            cardNumber: options.cardNumber || '4111111111111111',
            expiryDate: options.expiryDate || '12/25',
            cvv: options.cvv || '123',
            description: options.description || 'Generic gateway transaction',
            metadata: options.metadata || {
                orderId: 'ORD_' + Date.now(),
                customerId: 'CUST_12345'
            }
        };

        return this.sendRequest('/api/process-payment', 'POST', headers, payload);
    }

    /**
     * Send HTTP request to payment processor
     */
    sendRequest(path, method, headers, payload) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl);
            
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: method,
                headers: headers
            };

            const req = http.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            body: JSON.parse(data)
                        });
                    } catch (e) {
                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            body: data
                        });
                    }
                });
            });

            req.on('error', (err) => {
                reject(new Error(`Request failed: ${err.message}`));
            });

            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (payload) {
                req.write(JSON.stringify(payload));
            }
            
            req.end();
        });
    }

    /**
     * Test all merchant gateway types
     */
    async testAllGateways() {
        console.log('=== Testing All Merchant Gateways ===\n');

        const gateways = [
            { name: 'Amex', fn: () => this.simulateAmexMerchantRequest() },
            { name: 'Visa', fn: () => this.simulateVisaMerchantRequest() },
            { name: 'Mastercard', fn: () => this.simulateMastercardMerchantRequest() },
            { name: 'Generic', fn: () => this.simulateGenericGatewayRequest() }
        ];

        const results = [];

        for (const gateway of gateways) {
            console.log(`Testing ${gateway.name} Gateway...`);
            try {
                const result = await gateway.fn();
                console.log(`  ✓ Status: ${result.status}`);
                console.log(`  ✓ Success: ${result.body.success}`);
                if (result.body.transactionId) {
                    console.log(`  ✓ Transaction ID: ${result.body.transactionId}`);
                }
                results.push({ gateway: gateway.name, success: true, status: result.status });
            } catch (error) {
                console.log(`  ✗ Error: ${error.message}`);
                results.push({ gateway: gateway.name, success: false, error: error.message });
            }
            console.log('');
        }

        return results;
    }
}

// Export for use in other modules
module.exports = { MerchantAPISimulator };

// Run if executed directly
if (require.main === module) {
    async function main() {
        const simulator = new MerchantAPISimulator('http://localhost:6001');
        await simulator.testAllGateways();
    }

    main().catch(console.error);
}
