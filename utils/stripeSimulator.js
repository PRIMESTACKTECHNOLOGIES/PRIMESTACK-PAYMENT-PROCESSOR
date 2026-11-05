/**
 * Stripe API Simulator
 * Simulates Stripe payment processing for testing
 * Integrates with the payment processor's existing infrastructure
 */

const http = require('http');

class StripeSimulator {
    constructor(apiKey = 'sk_test_xxx', baseUrl = 'http://localhost:6001') {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.testCards = {
            'Visa': '4024007100000002',
            'Mastercard': '5454545454545454',
            'Amex': '372552054769013',
            'Discover': '6011000000000004'
        };
    }

    /**
     * Simulate Stripe charge creation
     * @param {Object} options - Charge options
     * @returns {Promise<Object>} Stripe-like response
     */
    async createCharge(options = {}) {
        const cardNumber = options.cardNumber || this.testCards['Visa'];
        const amountCents = options.amount || 2500; // $25.00 in cents
        const currency = options.currency || 'usd';
        const description = options.description || 'Test transaction with educational card';

        console.log(`[Stripe] Creating charge: $${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`);
        console.log(`[Stripe] Card: ****${cardNumber.slice(-4)}`);

        // Map card number to payment processor format
        const paymentPayload = {
            cardNumber: cardNumber,
            amount: (amountCents / 100).toFixed(2),
            currency: currency.toUpperCase(),
            expiryDate: options.expMonth && options.expYear 
                ? `${options.expMonth.toString().padStart(2, '0')}/${options.expYear.toString().slice(-2)}`
                : '12/25',
            cvv: options.cvc || '123',
            description: description
        };

        // Add Stripe-specific headers
        const headers = {
            'Authorization': `Bearer ${this.apiKey}`,
            'Stripe-Version': '2023-10-16',
            'Idempotency-Key': options.idempotencyKey || 'stripe_test_' + Date.now(),
            'Content-Type': 'application/json',
            'User-Agent': 'Stripe/v1 NodeBindings/13.0.0',
            'X-Stripe-Client-User-Agent': JSON.stringify({
                bindings_version: '13.0.0',
                lang: 'node',
                publisher: 'stripe',
                uname: 'test-simulator'
            })
        };

        try {
            // Send to payment processor
            const response = await this.sendRequest('/api/process-payment', 'POST', headers, paymentPayload);

            // Transform to Stripe-like response
            const stripeResponse = this.transformToStripeResponse(response, {
                cardNumber,
                amount: amountCents,
                currency,
                description
            });

            return stripeResponse;
        } catch (error) {
            throw this.createStripeError(error);
        }
    }

    /**
     * Simulate Stripe payment intent
     */
    async createPaymentIntent(options = {}) {
        const amountCents = options.amount || 2500;
        const currency = options.currency || 'usd';

        console.log(`[Stripe] Creating payment intent: $${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`);

        const headers = {
            'Authorization': `Bearer ${this.apiKey}`,
            'Stripe-Version': '2023-10-16',
            'Content-Type': 'application/json'
        };

        const payload = {
            amount: amountCents,
            currency: currency,
            payment_method_types: ['card'],
            description: options.description || 'Test payment intent'
        };

        try {
            const response = await this.sendRequest('/api/process-payment', 'POST', headers, {
                cardNumber: options.cardNumber || this.testCards['Visa'],
                amount: (amountCents / 100).toFixed(2),
                currency: currency.toUpperCase(),
                expiryDate: '12/25',
                cvv: '123'
            });

            return {
                id: 'pi_' + Date.now(),
                object: 'payment_intent',
                amount: amountCents,
                currency: currency,
                status: response.body.success ? 'succeeded' : 'requires_payment_method',
                client_secret: 'pi_' + Date.now() + '_secret_' + Math.random().toString(36).substr(2, 9),
                created: Math.floor(Date.now() / 1000),
                description: options.description || 'Test payment intent'
            };
        } catch (error) {
            throw this.createStripeError(error);
        }
    }

    /**
     * Simulate Stripe customer creation
     */
    async createCustomer(options = {}) {
        console.log(`[Stripe] Creating customer: ${options.email || 'test@example.com'}`);

        return {
            id: 'cus_' + Date.now(),
            object: 'customer',
            email: options.email || 'test@example.com',
            name: options.name || 'Test Customer',
            description: options.description || 'Test customer for payment processor',
            created: Math.floor(Date.now() / 1000),
            livemode: false
        };
    }

    /**
     * Test all sample card numbers
     */
    async testAllCards() {
        console.log('=== Testing All Stripe Card Types ===\n');

        const results = [];

        for (const [cardType, cardNumber] of Object.entries(this.testCards)) {
            console.log(`\nTesting ${cardType}: ${cardNumber}`);
            try {
                const charge = await this.createCharge({
                    cardNumber: cardNumber,
                    amount: 2500, // $25.00
                    currency: 'usd',
                    expMonth: 12,
                    expYear: 2025,
                    cvc: '123'
                });

                console.log(`  ✓ Status: ${charge.status}`);
                console.log(`  ✓ Charge ID: ${charge.id}`);
                console.log(`  ✓ Amount: $${(charge.amount / 100).toFixed(2)}`);
                console.log(`  ✓ Card: ${charge.card.brand} ****${charge.card.last4}`);

                results.push({
                    cardType,
                    cardNumber,
                    success: true,
                    charge
                });
            } catch (error) {
                console.log(`  ✗ Error: ${error.message}`);
                results.push({
                    cardType,
                    cardNumber,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Transform payment processor response to Stripe-like format
     */
    transformToStripeResponse(response, options) {
        const isSuccess = response.body && response.body.success;

        return {
            id: 'ch_' + Date.now(),
            object: 'charge',
            amount: options.amount,
            amount_captured: options.amount,
            amount_refunded: 0,
            application: null,
            application_fee: null,
            application_fee_amount: null,
            balance_transaction: isSuccess ? 'txn_' + Date.now() : null,
            billing_details: {
                address: null,
                email: null,
                name: null,
                phone: null
            },
            calculated_statement_descriptor: 'PAYMENT PROCESSOR',
            captured: isSuccess,
            created: Math.floor(Date.now() / 1000),
            currency: options.currency,
            customer: null,
            description: options.description,
            destination: null,
            dispute: null,
            disputed: false,
            failure_code: isSuccess ? null : 'card_declined',
            failure_message: isSuccess ? null : 'Your card was declined.',
            fraud_details: {},
            invoice: null,
            livemode: false,
            metadata: {},
            on_behalf_of: null,
            order: null,
            outcome: {
                network_status: 'approved_by_network',
                reason: null,
                risk_level: 'normal',
                risk_score: 15,
                seller_message: isSuccess ? 'Payment complete.' : 'Payment declined.',
                type: isSuccess ? 'authorized' : 'issuer_declined'
            },
            paid: isSuccess,
            payment_intent: null,
            payment_method: 'card',
            payment_method_details: {
                card: {
                    brand: this.detectCardBrand(options.cardNumber),
                    checks: {
                        address_line1_check: null,
                        address_postal_code_check: null,
                        cvc_check: 'pass'
                    },
                    country: 'US',
                    exp_month: 12,
                    exp_year: 2025,
                    fingerprint: 'test_' + Math.random().toString(36).substr(2, 9),
                    funding: 'credit',
                    installments: null,
                    last4: options.cardNumber.slice(-4),
                    mandate: null,
                    network: 'visa',
                    three_d_secure: null,
                    wallet: null
                },
                type: 'card'
            },
            receipt_email: null,
            receipt_number: isSuccess ? '1234-5678' : null,
            receipt_url: isSuccess ? 'https://pay.stripe.com/receipts/test' : null,
            refunded: false,
            refunds: {
                object: 'list',
                data: [],
                has_more: false,
                total_count: 0,
                url: '/v1/charges/ch_' + Date.now() + '/refunds'
            },
            review: null,
            shipping: null,
            source: {
                id: 'card_' + Date.now(),
                object: 'card',
                address_city: null,
                address_country: null,
                address_line1: null,
                address_line1_check: null,
                address_line2: null,
                address_state: null,
                address_zip: null,
                address_zip_check: null,
                brand: this.detectCardBrand(options.cardNumber),
                country: 'US',
                customer: null,
                cvc_check: 'pass',
                dynamic_last4: null,
                exp_month: 12,
                exp_year: 2025,
                fingerprint: 'test_' + Math.random().toString(36).substr(2, 9),
                funding: 'credit',
                last4: options.cardNumber.slice(-4),
                metadata: {},
                name: null,
                tokenization_method: null
            },
            source_transfer: null,
            statement_descriptor: null,
            statement_descriptor_suffix: null,
            status: isSuccess ? 'succeeded' : 'failed',
            transfer_data: null,
            transfer_group: null
        };
    }

    /**
     * Detect card brand from number
     */
    detectCardBrand(cardNumber) {
        if (cardNumber.startsWith('4')) return 'visa';
        if (cardNumber.startsWith('5')) return 'mastercard';
        if (cardNumber.startsWith('3')) return 'amex';
        if (cardNumber.startsWith('6')) return 'discover';
        return 'unknown';
    }

    /**
     * Create Stripe-like error
     */
    createStripeError(error) {
        return {
            type: 'StripeCardError',
            message: error.message || 'Your card was declined.',
            code: 'card_declined',
            decline_code: 'generic_decline',
            param: 'number',
            detail: error
        };
    }

    /**
     * Send HTTP request
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
                res.on('data', (chunk) => data += chunk);
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

            req.on('error', reject);
            req.write(JSON.stringify(payload));
            req.end();
        });
    }
}

// Export for use
module.exports = { StripeSimulator };

// Run if executed directly
if (require.main === module) {
    async function main() {
        const stripe = new StripeSimulator('sk_test_xxx');
        await stripe.testAllCards();
    }

    main().catch(console.error);
}
