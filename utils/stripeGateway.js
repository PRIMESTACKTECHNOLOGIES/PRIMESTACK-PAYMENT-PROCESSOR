
const stripePackage = require('stripe');

/**
 * Stripe Payment Gateway Integration
 *
 * SECURITY RULE: Raw card numbers (PAN, CVV, expiry) MUST NEVER be passed
 * to any Stripe API from this server. All card data is collected exclusively
 * via Stripe Elements on the frontend, which tokenises it before it ever
 * reaches our backend.
 *
 * Safe server-side operations:
 *   - Create a Payment Intent (amount + currency only)
 *   - Retrieve a Payment Intent (to verify status)
 *   - Retrieve a Charge (to get masked card details after payment)
 *
 * Forbidden server-side operations (removed):
 *   - stripe.paymentMethods.create({ card: { number, cvc, ... } })
 *   - Any call that accepts a raw card number, CVV, or expiry date
 */
class StripeGateway {
    constructor() {
        this.enabled = !!process.env.STRIPE_SECRET_KEY;
        if (this.enabled) {
            const key = process.env.STRIPE_SECRET_KEY;
            this.stripe = stripePackage(key);
            console.log('[STRIPE] Stripe integration enabled');
        } else {
            console.log('[STRIPE] Stripe integration disabled (no secret key found)');
        }
    }

    /**
     * Create a Payment Intent.
     * Passes full business identity and customer context to Stripe so the
     * issuing bank sees a trusted, verified merchant — reduces declines.
     *
     * @param {number|string} amount          - Dollar amount (e.g. 99.99)
     * @param {string}        currency        - ISO 4217 code (e.g. 'USD')
     * @param {string}        merchantAccount - Internal merchant reference
     * @param {object}        customerContext - Optional: { ip, email, name, description }
     * @returns {Promise<{id: string, client_secret: string}>}
     */
    async createPaymentIntent(amount, currency, merchantAccount, customerContext = {}) {
        if (!this.enabled) {
            throw new Error('Stripe integration is not enabled');
        }

        const amountNum = parseFloat(amount);
        if (!amountNum || amountNum <= 0) {
            throw new Error('Invalid amount: must be a positive number');
        }

        // Business identity — tells the bank exactly who is charging
        const businessName       = process.env.BUSINESS_NAME        || 'PRIMESTACK';
        const statementDescriptorSuffix = (process.env.STATEMENT_DESCRIPTOR_SUFFIX || 'PAYMENT')
            .toUpperCase()
            .replace(/[^A-Z0-9 ]/g, '')   // Stripe only allows letters, numbers, spaces
            .substring(0, 10);             // Max 10 chars for suffix

        const intentParams = {
            amount:               Math.round(amountNum * 100),
            currency:             currency.toLowerCase(),
            payment_method_types: ['card'],

            // ── Trust signals for the issuing bank ──────────────────────────
            // What appears on the customer's bank statement
            statement_descriptor_suffix: statementDescriptorSuffix,

            // Description of what is being purchased — shown in Stripe dashboard
            description: customerContext.description
                || `Payment to ${businessName}`,

            // No 3DS requested from our side — US/UK/Canada cards go straight through.
            // If the customer's bank mandates it, Stripe handles it automatically.

            // ── Metadata — visible in your Stripe dashboard ─────────────────
            metadata: {
                merchant_account: merchantAccount || 'default',
                business_name:    businessName,
                integration:      'primestack-v1'
            }
        };

        // ── Customer context — Stripe Radar uses this for fraud scoring ──────
        // More context = lower fraud score = fewer declines from banks
        if (customerContext.ip) {
            intentParams.radar_options = {
                // Passes customer IP to Stripe Radar — proves a real person is paying
                session: customerContext.radarSession || undefined
            };
        }

        // Attach customer email if provided — increases bank trust
        if (customerContext.email) {
            intentParams.receipt_email = customerContext.email;
            intentParams.metadata.customer_email = customerContext.email;
        }

        if (customerContext.name) {
            intentParams.metadata.customer_name = customerContext.name;
        }

        const paymentIntent = await this.stripe.paymentIntents.create(intentParams);

        console.log(`[STRIPE] Payment Intent created: ${paymentIntent.id} | ${businessName} | ${amountNum} ${currency}`);
        return paymentIntent;
    }

    /**
     * Retrieve a Payment Intent from Stripe to verify its status.
     * Used by /api/record-payment-result to confirm the payment server-side.
     *
     * @param {string} paymentIntentId
     * @returns {Promise<Object>} Stripe PaymentIntent object
     */
    async retrievePaymentIntent(paymentIntentId) {
        if (!this.enabled) {
            throw new Error('Stripe integration is not enabled');
        }

        const paymentIntent = await this.stripe.paymentIntents.retrieve(
            paymentIntentId,
            { expand: ['latest_charge'] }   // expand so we can read masked card details
        );

        return paymentIntent;
    }

    /**
     * Extract safe, masked card details from a retrieved PaymentIntent.
     * Returns only last4 and brand — never the full PAN.
     *
     * @param {Object} paymentIntent - Result of retrievePaymentIntent()
     * @returns {{ last4: string, brand: string }}
     */
    extractCardDetails(paymentIntent) {
        // Try latest_charge (expanded)
        const charge = paymentIntent.latest_charge;
        if (charge && typeof charge === 'object') {
            const card = charge.payment_method_details?.card;
            if (card) {
                return {
                    last4: card.last4 || '****',
                    brand: card.brand || 'card'
                };
            }
        }

        // Fallback: payment_method object if already attached
        const pm = paymentIntent.payment_method;
        if (pm && typeof pm === 'object' && pm.card) {
            return {
                last4: pm.card.last4 || '****',
                brand: pm.card.brand || 'card'
            };
        }

        return { last4: '****', brand: 'card' };
    }

    /**
     * Check if Stripe integration is enabled.
     * @returns {boolean}
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * Verify and parse a Stripe webhook event.
     * @param {string} payload - Raw request body (as string or Buffer)
     * @param {string} signature - Stripe-Signature header value
     * @param {string} webhookSecret - Stripe webhook secret
     * @returns {Object} Stripe event object
     */
    verifyWebhookEvent(payload, signature, webhookSecret) {
        if (!this.enabled) {
            throw new Error('Stripe integration is not enabled');
        }
        return this.stripe.webhooks.constructEvent(
            payload,
            signature,
            webhookSecret
        );
    }

    /**
     * Create a refund for a charge.
     * @param {string} chargeId - Stripe charge ID
     * @param {number} amount - Amount to refund (in dollars, will be converted to cents)
     * @returns {Promise<Object>} Stripe refund object
     */
    async createRefund(chargeId, amount) {
        if (!this.enabled) {
            throw new Error('Stripe integration is not enabled');
        }
        const refund = await this.stripe.refunds.create({
            charge: chargeId,
            amount: Math.round(amount * 100),
        });
        console.log(`[STRIPE] Refund created: ${refund.id} for charge ${chargeId}`);
        return refund;
    }

    /**
     * Create a Payout to a bank account or card.
     * @param {number} amount - Amount to payout in dollars
     * @param {string} currency - Currency code (e.g., 'usd', 'eur')
     * @param {Object} bankDetails - Bank account details
     * @param {string} description - Optional description
     * @returns {Promise<Object>} Stripe payout object
     */
    async createPayout(amount, currency, bankDetails = {}, description = '') {
        if (!this.enabled) {
            throw new Error('Stripe integration is not enabled');
        }

        const amountNum = parseFloat(amount);
        if (!amountNum || amountNum <= 0) {
            throw new Error('Invalid payout amount: must be a positive number');
        }

        const payout = await this.stripe.payouts.create({
            amount: Math.round(amountNum * 100), // Stripe expects cents
            currency: currency.toLowerCase(),
            description: description || `Payout to merchant`,
            metadata: {
                merchant_account: bankDetails.accountHolder || 'default',
                bank_name: bankDetails.bankName || '',
                iban: bankDetails.iban || '',
                swift: bankDetails.swift || ''
            }
        });

        console.log(`[STRIPE] Payout created: ${payout.id} for ${amount} ${currency}`);
        return payout;
    }

    /**
     * Retrieve a payout by ID to check its status.
     * @param {string} payoutId - Stripe payout ID
     * @returns {Promise<Object>} Stripe payout object
     */
    async retrievePayout(payoutId) {
        if (!this.enabled) {
            throw new Error('Stripe integration is not enabled');
        }
        return this.stripe.payouts.retrieve(payoutId);
    }

    /**
     * List all payouts (optionally filtered by status).
     * @param {Object} filters - Optional filters { status, limit, starting_after }
     * @returns {Promise<Array>} Array of Stripe payout objects
     */
    async listPayouts(filters = {}) {
        if (!this.enabled) {
            throw new Error('Stripe integration is not enabled');
        }
        const params = { limit: filters.limit || 10 };
        if (filters.status) params.status = filters.status;
        if (filters.starting_after) params.starting_after = filters.starting_after;
        
        const result = await this.stripe.payouts.list(params);
        return result.data;
    }

    /**
     * Get Stripe account balance (available for payout).
     * @returns {Promise<Object>} Balance object with available and pending amounts
     */
    async getBalance() {
        if (!this.enabled) {
            throw new Error('Stripe integration is not enabled');
        }
        return this.stripe.balance.retrieve();
    }
}

module.exports = new StripeGateway();
