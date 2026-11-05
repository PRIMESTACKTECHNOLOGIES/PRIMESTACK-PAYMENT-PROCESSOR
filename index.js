
const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '.env');

// Load .env file if it exists
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && !key.startsWith('#')) {
            envVars[key.trim()] = valueParts.join('=').trim();
        }
    });
    Object.assign(process.env, envVars);
} else {
    console.log('[SERVER] No .env file found — using environment variables');
}

// --- Startup environment validation ---
const requiredEnvChecks = [
    {
        key: 'ADMIN_API_KEY',
        warn: process.env.ADMIN_API_KEY === 'Admin123' || !process.env.ADMIN_API_KEY,
        message: '⚠️  ADMIN_API_KEY is using the default weak password. Set a strong value in .env before going live!'
    },
    {
        key: 'STRIPE_SECRET_KEY',
        warn: !process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_your'),
        message: '⚠️  STRIPE_SECRET_KEY is not configured. Payments will use mock mode.'
    },
    {
        key: 'STRIPE_WEBHOOK_SECRET',
        warn: !process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_your') || process.env.STRIPE_WEBHOOK_SECRET === 'PENDING_SETUP',
        message: '⚠️  STRIPE_WEBHOOK_SECRET is not set. Webhook signature verification is disabled — configure in Stripe Dashboard.'
    },
    {
        key: 'STRIPE_RETURN_URL',
        warn: !process.env.STRIPE_RETURN_URL || process.env.STRIPE_RETURN_URL.includes('localhost'),
        message: '⚠️  STRIPE_RETURN_URL is set to localhost. Update to your public HTTPS domain for production.'
    },
    {
        key: 'ENCRYPTION_KEY',
        warn: !process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.includes('your_'),
        message: '⚠️  ENCRYPTION_KEY is not set. Set a 64-char hex value (openssl rand -hex 32) in .env.'
    },
    {
        key: 'ADMIN_MFA_SECRET',
        warn: !process.env.ADMIN_MFA_SECRET,
        message: '⚠️  ADMIN_MFA_SECRET is not set. Admin MFA is not enforced — set a base32 TOTP secret to require step-up MFA on sensitive operations.'
    },
    {
        key: 'ALLOW_SIMULATION',
        warn: process.env.NODE_ENV === 'production' && process.env.ALLOW_SIMULATION !== 'true',
        message: 'ℹ️  Simulated payment paths (mock acquirer / GPU / ISO8583) are disabled in production. Configure a real acquirer/gateway (e.g. Stripe).'
    }
];
requiredEnvChecks.forEach(({ warn, message }) => {
    if (warn) console.warn(message);
});

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');

// Collision-resistant transaction identifiers (UUIDv4).
// Timestamp-only IDs collide under concurrent load and are unsafe for a ledger.
const generateTransactionId = (suffix = '') =>
    `TXN_${crypto.randomUUID()}${suffix ? `_${suffix}` : ''}`;

// --- Core utilities ---
const { validateCard, maskCardNumber } = require('./utils/cardValidator');
const ISO8583Sim = require('./utils/isoSim');
const MockAcquirer = require('./utils/acquirer');
const database = require('./utils/database');
const stripeGateway = require('./utils/stripeGateway');
const nfcHandler = require('./utils/nfcHandler');

// --- New security & performance components ---
const secureVault = require('./utils/secureVault');
const authService = require('./utils/authService');
const auditLogger = require('./utils/auditLogger');
const gpuManager = require('./utils/gpuManager');
const performanceOptimizer = require('./utils/performanceOptimizer');

// --- Multi-merchant & offline ---
const { runMigrations } = require('./utils/migrations');
const merchantManager = require('./utils/merchantManager');

// --- Middleware ---
const { authenticateAdmin, requireRole, requireMFA } = require('./middleware/auth');
const { defaultRateLimiter, strictRateLimiter } = require('./middleware/rateLimiter');

// Admin-only route guards: authenticate, enforce RBAC (admin role), then rate limit
const adminOnly = [authenticateAdmin, requireRole('admin'), defaultRateLimiter];
const adminStrict = [authenticateAdmin, requireRole('admin'), strictRateLimiter];
// High-risk credential routes additionally require a valid MFA step-up grant
// (enforced once ADMIN_MFA_SECRET is enrolled — see middleware/auth.js)
const adminMfaOnly = [authenticateAdmin, requireRole('admin'), requireMFA, defaultRateLimiter];
const adminMfaStrict = [authenticateAdmin, requireRole('admin'), requireMFA, strictRateLimiter];

// --- Configuration ---
const securityConfig = require('./config/security');
const performanceConfig = require('./config/performance');

// --- Run database migrations (adds new tables if not exist) ---
runMigrations(database.db);

const app = express();
const PORT = process.env.PORT || 6001;

// Raw body parser for Stripe webhooks — must be registered BEFORE bodyParser.json()
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

// --- Security headers ---
// CSP is disabled because the bundled SPAs (admin/portal) rely on inline scripts
// and styles; a strict CSP requires externalizing those assets first.
// crossOriginResourcePolicy is relaxed so the separately-hosted customer portal
// (e.g. Netlify) can consume this API.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false
}));

// --- CORS ---
// In production, only explicitly allowlisted origins are permitted (fail-closed).
// Requests without an Origin header (same-origin, curl, server-to-server) pass.
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

if (isProduction && allowedOrigins.length === 0) {
    console.warn('⚠️  CORS_ORIGINS is empty in production — all cross-origin browser requests will be rejected.');
}

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        if (!isProduction) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use(bodyParser.json());

// Serve static files from public folder — no caching so changes take effect immediately
app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store');
    }
}));

// Serve integration examples
app.use('/examples', express.static(path.join(__dirname, 'examples'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store');
    }
}));

// Root route to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin panel — processor owner dashboard
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Merchant portal — each merchant's own dashboard
app.get('/portal', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'portal.html'));
});

// API Documentation endpoint
app.get('/api-docs', (req, res) => {
    res.sendFile(path.join(__dirname, 'API_DOCUMENTATION.md'));
});

/**
 * GET /api/config
 * Returns public client-side configuration (publishable key only — never the secret key).
 */
app.get('/api/config', (req, res) => {
    res.json({
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        stripeEnabled: !!process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.startsWith('sk_test_your')
    });
});

// ── Multi-merchant & Offline Payment Routes (v1 API) ────────────────────────
const chargeRouter   = require('./routes/v1/charge');
const syncRouter     = require('./routes/v1/sync');
const statusRouter   = require('./routes/v1/status');
const merchantRouter = require('./routes/merchant');

// Merchant key-authenticated endpoints (used by Android app / POS)
app.use('/api/v1/charge',        chargeRouter);
app.use('/api/v1/offline',       syncRouter);
app.use('/api/v1/status',        statusRouter);
app.use('/api/v1/account',       statusRouter);  // same router handles /account and /balance
app.use('/api/v1/transactions',  statusRouter);
app.use('/api/v1/balance',       statusRouter);

// Admin-only merchant management (your dashboard to manage customers)
app.use('/api/merchants', merchantRouter);

// Settlement engine (pay your merchants)
const settlementRouter = require('./routes/settlement');
app.use('/api/settlement', settlementRouter);

// API info endpoint - quick reference for integrations
app.get('/api/info', (req, res) => {
    res.json({
        success: true,
        name: 'Payment Processor API',
        version: '1.0.0',
        baseUrl: 'http://localhost:6001',
        endpoints: {
            processPayment: {
                method: 'POST',
                path: '/api/process-payment',
                description: 'Process a payment',
                authRequired: true
            },
            getTransaction: {
                method: 'GET',
                path: '/api/transactions/:id',
                description: 'Get transaction by ID',
                authRequired: true
            },
            getTransactions: {
                method: 'GET',
                path: '/api/transactions',
                description: 'Get transaction history',
                authRequired: true
            },
            getStats: {
                method: 'GET',
                path: '/api/stats',
                description: 'Get dashboard statistics',
                authRequired: true
            },
            requestPayout: {
                method: 'POST',
                path: '/api/request-payout',
                description: 'Request a payout',
                authRequired: true
            },
            getPayouts: {
                method: 'GET',
                path: '/api/payouts',
                description: 'Get payout history',
                authRequired: true
            },
            getBalance: {
                method: 'GET',
                path: '/api/balance',
                description: 'Get Stripe balance (if enabled)',
                authRequired: true
            }
        },
        authentication: {
            type: 'API Key',
            header: 'x-api-key',
            description: 'Use your dashboard password as the API key'
        }
    });
});

// --- Initialize Merchant Settings ---
let merchantSettings = {
    accountNumber: 'ACT_9988776655',
    iban: 'GB29 WEST 0123 4567 8901 23',
    swift: 'WESTGB2L',
    bankName: 'Global Reserve Bank',
    accountHolder: 'Professional Services Ltd',
    merchantName: 'Professional Services Ltd',
    autoPayout: false
};

// --- Current API Key Storage ---
const currentApiKeyPath = path.join(__dirname, 'data', 'current-api-key.json');
let currentApiKey = null;

// Load current API key from file if it exists
function loadCurrentApiKey() {
    try {
        if (fs.existsSync(currentApiKeyPath)) {
            const data = JSON.parse(fs.readFileSync(currentApiKeyPath, 'utf8'));
            currentApiKey = data.key;
            console.log(`[SERVER] Loaded current API key from file`);
        }
    } catch (error) {
        console.error('[SERVER] Failed to load current API key:', error);
    }
}

// Save current API key to file
function saveCurrentApiKey(key) {
    try {
        fs.writeFileSync(currentApiKeyPath, JSON.stringify({ key }, null, 2));
        currentApiKey = key;
        console.log('[SERVER] Current API key saved to file');
    } catch (error) {
        console.error('[SERVER] Failed to save current API key:', error);
    }
}

// --- OAuth Credentials Storage ---
const oauthCredentialsPath = path.join(__dirname, 'data', 'oauth-credentials.json');
let oauthCredentials = {
    clientId: '',
    clientSecret: ''
};

// Load OAuth credentials from file if it exists
function loadOAuthCredentials() {
    try {
        if (fs.existsSync(oauthCredentialsPath)) {
            const data = JSON.parse(fs.readFileSync(oauthCredentialsPath, 'utf8'));
            oauthCredentials = data;
            console.log('[SERVER] Loaded OAuth credentials from file');
        }
    } catch (error) {
        console.error('[SERVER] Failed to load OAuth credentials:', error);
    }
}

// Make sure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('[SERVER] Data directory created');
}

// Save OAuth credentials to file
function saveOAuthCredentials(credentials) {
    try {
        // Make sure data directory exists
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        oauthCredentials = credentials;
        fs.writeFileSync(oauthCredentialsPath, JSON.stringify(credentials, null, 2));
        console.log('[SERVER] OAuth credentials saved to file');
        return { success: true };
    } catch (error) {
        console.error('[SERVER] Failed to save OAuth credentials:', error);
        return { success: false, message: error.message };
    }
}

// Load API keys, current API key, and OAuth credentials
loadCurrentApiKey();
loadOAuthCredentials();
authService.loadAPIKeysFromDatabase();

// Ensure merchant exists in database
const existingMerchant = database.getMerchant(merchantSettings.accountNumber);
if (!existingMerchant) {
    database.upsertMerchant(merchantSettings);
} else {
    merchantSettings = existingMerchant;
}

// --- Helpers ---
const processWithGPU = async (task) => {
    const isGPUAvailable = gpuManager.isGPUAvailable();
    if (isGPUAvailable) {
        const result = gpuManager.distributeTasks([task]);
        if (result.success && result.distributed.length > 0) {
            return { gpuProcessed: true, result };
        }
    }
    const cpuResult = gpuManager.fallbackToCPU(task);
    return { gpuProcessed: false, result: cpuResult };
};

// --- API Endpoints ---

/**
 * POST /api/cancel-payment-intent
 * Called by the frontend when a user closes the payment form without paying.
 * Cancels the PaymentIntent on Stripe so it doesn't stay as "Incomplete".
 */
app.post('/api/cancel-payment-intent', async (req, res) => {
    const { paymentIntentId } = req.body;
    if (!paymentIntentId) return res.status(400).json({ success: false });

    try {
        if (stripeGateway.isEnabled()) {
            await stripeGateway.stripe.paymentIntents.cancel(paymentIntentId);
            console.log(`[STRIPE] Cancelled incomplete PaymentIntent: ${paymentIntentId}`);
        }
        res.json({ success: true });
    } catch (err) {
        // If it's already succeeded/cancelled, ignore the error silently
        res.json({ success: false, message: err.message });
    }
});

/**
 * POST /api/create-payment-intent
 * Creates a Stripe Payment Intent and returns the clientSecret to the frontend.
 * The frontend uses this to confirm the payment via Stripe Elements (PCI-compliant).
 * No card data ever passes through our server.
 */
app.post('/api/create-payment-intent', strictRateLimiter, async (req, res) => {
    const { amount, currency, email, name, description } = req.body;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    try {
        if (!stripeGateway.isEnabled()) {
            return res.status(503).json({ success: false, message: 'Stripe is not configured. Add STRIPE_SECRET_KEY to .env' });
        }

        const amountNum = parseFloat(amount);

        // Pass customer context — builds trust with issuing banks
        const customerContext = {
            ip:          req.ip,
            email:       email   || null,
            name:        name    || null,
            description: description || null
        };

        const paymentIntent = await stripeGateway.createPaymentIntent(
            amountNum,
            (currency || 'USD'),
            merchantSettings.accountNumber,
            customerContext
        );

        auditLogger.logSecurityEvent({
            type: 'payment_intent_created',
            description: `Payment Intent ${paymentIntent.id} created for $${amountNum}`,
            severity: 'info',
            ip: req.ip,
            metadata: { paymentIntentId: paymentIntent.id, amount: amountNum, currency: currency || 'USD' }
        });

        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });
    } catch (err) {
        console.error('[STRIPE] Failed to create Payment Intent:', err.message);
        auditLogger.logSecurityEvent({
            type: 'payment_intent_error',
            description: `Failed to create Payment Intent: ${err.message}`,
            severity: 'error',
            ip: req.ip,
            metadata: { error: err.message }
        });
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/record-payment-result
 * Called by the frontend after Stripe confirms (or declines) a payment.
 * Verifies the payment status directly with Stripe (never trusts the client),
 * then records the transaction in our database and audit log.
 */
app.post('/api/record-payment-result', async (req, res) => {
    const { paymentIntentId, amount, currency, error: clientError } = req.body;

    if (!paymentIntentId || !amount) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    let verifiedStatus = 'Declined';
    let verifiedLast4 = '****';
    let verifiedBrand = 'Card';
    let stripeAmount = parseFloat(amount);

    // Always verify payment status directly with Stripe — never trust the client
    try {
        if (stripeGateway.isEnabled()) {
            const pi = await stripeGateway.retrievePaymentIntent(paymentIntentId);
            verifiedStatus = pi.status === 'succeeded' ? 'Approved' : 'Declined';
            stripeAmount = pi.amount / 100; // Stripe stores in cents

            // Extract masked card details safely (last4 + brand only — never full PAN)
            const cardDetails = stripeGateway.extractCardDetails(pi);
            verifiedLast4 = cardDetails.last4;
            verifiedBrand = cardDetails.brand;
        } else {
            // No Stripe — use client-reported status (mock mode only)
            verifiedStatus = req.body.status === 'Approved' ? 'Approved' : 'Declined';
            verifiedLast4 = req.body.last4 || '****';
            verifiedBrand = req.body.brand || 'Card';
        }
    } catch (err) {
        console.error('[STRIPE] Failed to verify payment intent:', err.message);
        // If we can't verify, treat as declined for safety
        verifiedStatus = 'Declined';
        auditLogger.logSecurityEvent({
            type: 'payment_verification_error',
            description: `Failed to verify Payment Intent ${paymentIntentId}: ${err.message}`,
            severity: 'error',
            ip: req.ip,
            metadata: { paymentIntentId, error: err.message }
        });
    }

    const brandFormatted = verifiedBrand.charAt(0).toUpperCase() + verifiedBrand.slice(1);

    const txnData = {
        id: generateTransactionId(),
        cardType: brandFormatted,
        lastFour: verifiedLast4,
        amount: stripeAmount,
        currency: (currency || 'USD').toUpperCase(),
        status: verifiedStatus,
        responseCode: verifiedStatus === 'Approved' ? '00' : '05',
        settlementStatus: verifiedStatus === 'Approved' ? 'Settled' : 'N/A',
        merchantAccount: merchantSettings.accountNumber,
        paymentIntentId,
        gatewayProvider: 'stripe',
        processingTimeMs: 0,
        gpuProcessed: false,
        mfaVerified: false,
        encrypted: true,
        securityFlags: { cardMasked: true, encrypted: true, auditLogged: true, gpuProcessed: false }
    };

    const savedTxn = database.insertTransaction(txnData);

    auditLogger.logTransaction({
        id: savedTxn.id,
        cardType: savedTxn.cardType,
        lastFour: savedTxn.lastFour,
        amount: savedTxn.amount,
        currency: savedTxn.currency,
        status: savedTxn.status,
        responseCode: savedTxn.responseCode,
        settlementStatus: savedTxn.settlementStatus,
        merchantAccount: savedTxn.merchantAccount,
        processingTimeMs: 0,
        gpuProcessed: false,
        securityFlags: txnData.securityFlags
    });

    auditLogger.logSecurityEvent({
        type: 'transaction_complete',
        description: `Stripe transaction ${savedTxn.id} (${paymentIntentId}): ${savedTxn.status} — verified with Stripe`,
        severity: 'info',
        ip: req.ip,
        metadata: {
            transactionId: savedTxn.id,
            paymentIntentId,
            status: savedTxn.status,
            amount: savedTxn.amount,
            verifiedWithStripe: stripeGateway.isEnabled(),
            clientError: clientError || null
        }
    });

    res.json({ success: true, transactionId: savedTxn.id, status: savedTxn.status });
});

/**
 * POST /api/process-nfc-payment
 * Process an NFC / contactless tap payment.
 *
 * Accepts card data emitted by a physical NFC reader (Web NFC API on Android Chrome,
 * a Stripe Terminal, or a custom POS device).  The entry mode is recorded in
 * ISO8583 Field 22 and stored in the transaction record.
 *
 * Request body (JSON):
 *   cardNumber   {string}  PAN from the NFC reader  (OR token for digital wallets)
 *   token        {string}  DPAN token (Apple Pay / Google Pay — use instead of cardNumber)
 *   lastFour     {string}  Last 4 digits (required when sending a token)
 *   cardBrand    {string}  Brand hint: "visa" | "mastercard" | ...
 *   amount       {number}  Charge amount in major units (e.g. 12.50)
 *   currency     {string}  ISO 4217 code (default "USD")
 *   expiry       {string}  MMYY or MM/YY
 *   cvv          {string}  Optional — not present on most NFC taps
 *   entryMethod  {string}  "nfc" | "tap" | "apple_pay" | "google_pay" | "msd" (default "nfc")
 *   terminalId   {string}  POS terminal identifier
 *   deviceId     {string}  POS device identifier
 *   cryptogram   {string}  EMV contactless application cryptogram (AC)
 *   transactionId{string}  Apple Pay / Google Pay transaction ID
 */
app.post('/api/process-nfc-payment', strictRateLimiter, async (req, res) => {
    const startTime = Date.now();

    // 1. Validate and normalise the NFC tap data
    const rawPan = req.body.cardNumber || req.body.token || '';
    console.log(`[NFC] Tap received — PAN length: ${rawPan.replace(/\D/g,'').length}, prefix: ${rawPan.substring(0,6)}, brand hint: ${req.body.cardBrand || 'none'}`);

    const { valid, error: nfcError, normalised } = nfcHandler.validateNFCData(req.body);
    if (!valid) {
        return res.status(400).json({ success: false, message: nfcError });
    }

    const {
        pan, lastFour, cardBrand, amount, currency, expiry, cvv,
        entryMode, entryModeLabel, isToken, terminalId, cryptogram
    } = normalised;

    const maskedPan = isToken ? `[token] ****${lastFour}` : maskCardNumber(pan);

    // Audit log: tap payment start
    auditLogger.logSecurityEvent({
        type: 'nfc_tap_start',
        description: `NFC tap payment started — ${entryModeLabel} — card ****${lastFour}, amount: ${amount} ${currency}`,
        severity: 'info',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { maskedPan, amount, currency, entryMode, entryModeLabel, terminalId, isToken }
    });

    // 2. Store a tap session record so the dashboard can track NFC interactions
    const tapSessionId = `NFC_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    try {
        database.db.prepare(`
            INSERT INTO nfc_tap_sessions
                (id, terminal_id, device_id, merchant_id, entry_mode, card_last4, card_brand, amount, currency, cryptogram, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(
            tapSessionId,
            terminalId || null,
            normalised.deviceId || null,
            merchantSettings.accountNumber,
            entryMode,
            lastFour,
            cardBrand,
            amount,
            currency,
            cryptogram || null
        );
    } catch (dbErr) {
        console.warn('[NFC] Could not insert tap session:', dbErr.message);
    }

    // 3. Store PAN in secure vault
    const vaultKey = `nfc_${tapSessionId}`;
    secureVault.store(`${vaultKey}_pan`, pan);
    secureVault.setRetentionPolicy(`${vaultKey}_pan`, 300000); // 5 min retention

    let gatewayResp;
    let gatewayProvider = 'mock';
    let gpuProcessed = false;

    try {
        // When Stripe is enabled, create a PaymentIntent and return the client secret.
        // The frontend / POS app can then confirm it with Stripe.js or Stripe Terminal SDK.
        if (stripeGateway.isEnabled()) {
            secureVault.clear(`${vaultKey}_pan`);

            const paymentIntent = await stripeGateway.createPaymentIntent(
                amount,
                currency,
                merchantSettings.accountNumber,
                { entryMode, entryModeLabel, tapSessionId, terminalId }
            );

            // Update tap session
            database.db.prepare(
                `UPDATE nfc_tap_sessions SET transaction_id = ?, status = 'awaiting_confirm' WHERE id = ?`
            ).run(paymentIntent.id, tapSessionId);

            auditLogger.logSecurityEvent({
                type: 'nfc_tap_intent_created',
                description: `NFC tap PaymentIntent ${paymentIntent.id} created for ${amount} ${currency}`,
                severity: 'info', ip: req.ip,
                metadata: { tapSessionId, paymentIntentId: paymentIntent.id, entryMode }
            });

            return res.json({
                success: false,          // NOT approved yet — card still needs to be confirmed
                mode: 'stripe',
                requiresCardConfirm: true,
                tapSessionId,
                entryMode,
                entryModeLabel,
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
                message: 'Present card to complete payment'
            });
        }

        // Fail-closed: the mock NFC ISO8583 pipeline must not run in production
        if (!securityConfig.isSimulationAllowed()) {
            secureVault.clear(`${vaultKey}_pan`);
            try {
                database.db.prepare(
                    `UPDATE nfc_tap_sessions SET status = 'error', error_message = ? WHERE id = ?`
                ).run('Simulated processing disabled', tapSessionId);
            } catch (dbErr) {
                console.warn('[NFC] Could not update tap session:', dbErr.message);
            }
            return res.status(503).json({
                success: false,
                message: securityConfig.simulation.disabledMessage
            });
        }

        // Mock ISO8583 path — build message with NFC entry mode (F22)
        const isoMessage = nfcHandler.buildNFCISO8583Message(normalised);

        // GPU-accelerated parsing
        const gpuResult = await processWithGPU({ id: `nfc_parse_${Date.now()}`, message: isoMessage });
        gpuProcessed = gpuResult.gpuProcessed;

        const parsed = nfcHandler.parseNFCISO8583Message(isoMessage);
        gatewayResp = MockAcquirer.processRequest(parsed, merchantSettings.accountNumber);

        auditLogger.logSecurityEvent({
            type: 'nfc_gateway_response',
            description: `NFC tap gateway response: ${gatewayResp.status} (${gatewayResp.responseCode})`,
            severity: 'info', ip: req.ip,
            metadata: { maskedPan, entryMode, status: gatewayResp.status, responseCode: gatewayResp.responseCode, gpuProcessed }
        });

    } catch (err) {
        secureVault.clear(`${vaultKey}_pan`);
        database.db.prepare(
            `UPDATE nfc_tap_sessions SET status = 'error', error_message = ? WHERE id = ?`
        ).run(err.message, tapSessionId);

        auditLogger.logSecurityEvent({
            type: 'nfc_tap_error',
            description: `NFC tap payment error: ${err.message}`,
            severity: 'error', ip: req.ip,
            metadata: { maskedPan, entryMode, error: err.message }
        });
        return res.status(500).json({ success: false, message: 'NFC payment processing failed' });
    }

    const processingTimeMs = Date.now() - startTime;
    const txStatus = gatewayResp.status || (gatewayResp.success ? 'Approved' : 'Declined');

    // 4. Save the transaction (with entry_mode column)
    const txnData = {
        id: generateTransactionId(),
        cardType: cardBrand,
        lastFour,
        amount,
        currency,
        status: txStatus,
        responseCode: gatewayResp.responseCode || '00',
        settlementStatus: gatewayResp.settlementStatus || (txStatus === 'Approved' ? 'Settled' : 'N/A'),
        merchantAccount: merchantSettings.accountNumber,
        paymentIntentId: tapSessionId,
        gatewayProvider,
        processingTimeMs,
        gpuProcessed,
        mfaVerified: false,
        encrypted: true,
        entryMode,
        securityFlags: { cardMasked: true, encrypted: true, auditLogged: true, gpuProcessed }
    };

    // Insert with entry_mode
    const savedTxn = database.insertTransaction(txnData);

    // Update tap session to completed
    database.db.prepare(
        `UPDATE nfc_tap_sessions SET transaction_id = ?, status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(savedTxn.id, txStatus === 'Approved' ? 'completed' : 'declined', tapSessionId);

    auditLogger.logTransaction({
        ...savedTxn,
        securityFlags: txnData.securityFlags
    });

    auditLogger.logSecurityEvent({
        type: 'nfc_tap_complete',
        description: `NFC tap ${tapSessionId} → TXN ${savedTxn.id}: ${txStatus} in ${processingTimeMs}ms (${entryModeLabel})`,
        severity: 'info', ip: req.ip,
        metadata: { tapSessionId, transactionId: savedTxn.id, status: txStatus, entryMode, processingTimeMs }
    });

    secureVault.clear(`${vaultKey}_pan`);

    res.json({
        success: txStatus === 'Approved',
        mode: 'mock_iso8583',
        tapSessionId,
        transactionId: savedTxn.id,
        status: txStatus,
        entryMode,
        entryModeLabel,
        processingTimeMs: processingTimeMs || 0,
        gpuProcessed,
        message: txStatus === 'Approved' ? `Tap accepted (${entryModeLabel})` : `Tap declined: ${gatewayResp.responseCode}`,
        securityMetadata: { cardMasked: true, encrypted: true, auditLogged: true, gpuProcessed }
    });
});

/**
 * GET /api/nfc/sessions
 * Returns recent NFC tap sessions for the admin dashboard (admin auth required).
 */
app.get('/api/nfc/sessions', adminOnly, (req, res) => {
    try {
        const sessions = database.db.prepare(`
            SELECT * FROM nfc_tap_sessions
            ORDER BY created_at DESC
            LIMIT 100
        `).all();
        res.json({ success: true, sessions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/nfc/entry-modes
 * Returns supported NFC entry modes for POS/client configuration.
 */
app.get('/api/nfc/entry-modes', (req, res) => {
    res.json({
        success: true,
        entryModes: nfcHandler.ENTRY_MODE_LABELS,
        contactlessCodes: ['07', '91', '10']
    });
});

/**
 * POST /api/process-payment
 * Process a payment transaction with full security and performance integration.
 */
app.post('/api/process-payment', strictRateLimiter, async (req, res) => {
    const startTime = Date.now();
    const { cardNumber, expiryDate, cvv, amount, currency, mfaVerified } = req.body;

    if (!cardNumber || !amount) {
        return res.status(400).json({ success: false, message: 'Missing fields' });
    }

    // 1. Validate card number (structured error reporting)
    const val = validateCard(cardNumber);
    const maskedCard = maskCardNumber(cardNumber);

    // Audit log: transaction start with masked card number
    auditLogger.logSecurityEvent({
        type: 'transaction_start',
        description: `Transaction started for card ${maskedCard}, amount: ${amount} ${currency || 'USD'}`,
        severity: 'info',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { maskedCard, amount, currency: currency || 'USD', mfaVerified: mfaVerified || false }
    });

    if (!val.isValid) {
        // Audit log: card validation failure
        auditLogger.logSecurityEvent({
            type: 'invalid_card',
            description: `Card validation failed: ${val.error} (${val.errorCode}) for card ${maskedCard}`,
            severity: 'warning',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { maskedCard, errorCode: val.errorCode }
        });
        return res.status(400).json({
            success: false,
            message: val.error,
            errorCode: val.errorCode
        });
    }

    // Audit log: card validation success
    auditLogger.logSecurityEvent({
        type: 'card_validated',
        description: `Card validated successfully: ${maskedCard} (${val.cardType})`,
        severity: 'info',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { maskedCard, cardType: val.cardType, lastFour: val.lastFour }
    });

    console.log(`[TRANSACTION] Processing: ${maskedCard} - $${amount}`);

    // 2. Store sensitive card data in secure vault (PCI-DSS compliance)
    const vaultKey = `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    secureVault.store(`${vaultKey}_pan`, cardNumber);
    if (cvv) secureVault.store(`${vaultKey}_cvv`, cvv);
    // Apply retention policy: clear sensitive data after 5 minutes
    secureVault.setRetentionPolicy(`${vaultKey}_pan`, 300000);
    if (cvv) secureVault.setRetentionPolicy(`${vaultKey}_cvv`, 300000);

    let gatewayResp;
    let gatewayProvider = 'mock';
    let gpuProcessed = false;

    // 3DS is disabled — process all cards and amounts directly
    // Stripe handles its own risk assessment server-side when Stripe is enabled
    const amountNum = parseFloat(amount);

    // 3. Process transaction via gateway (Stripe or mock ISO8583 with GPU)
    try {
        // When Stripe is enabled, this endpoint is NOT used for real payments.
        // Real payments must go through: /api/create-payment-intent → Stripe Elements → /api/record-payment-result
        if (stripeGateway.isEnabled()) {
            secureVault.clear(`${vaultKey}_pan`);
            if (cvv) secureVault.clear(`${vaultKey}_cvv`);
            return res.status(400).json({
                success: false,
                message: 'Stripe is enabled. Use /api/create-payment-intent + Stripe Elements + /api/record-payment-result.'
            });
        }

        // Fail-closed: the mock ISO8583 pipeline must not run in production
        if (!securityConfig.isSimulationAllowed()) {
            secureVault.clear(`${vaultKey}_pan`);
            if (cvv) secureVault.clear(`${vaultKey}_cvv`);
            return res.status(503).json({
                success: false,
                message: securityConfig.simulation.disabledMessage
            });
        }

        // Fall back to mock ISO8583 processing with GPU acceleration
        console.log('[MOCK] Stripe not enabled - using mock ISO8583 processing');
        const isoMessage = ISO8583Sim.buildMessage({
            mti: '0200',
            cardNumber,
            amount: (parseFloat(amount) * 100).toString(),
            currencyCode: '840',
            transmissionDate: new Date().toISOString(),
            cvv: cvv || '123',
            expiry: expiryDate || '1225'
        });

        // GPU processing: distribute ISO8583 parsing task to GPU cluster with CPU fallback
        const gpuResult = await processWithGPU({ id: `parse_${Date.now()}`, message: isoMessage });
        gpuProcessed = gpuResult.gpuProcessed;

        if (!gpuProcessed) {
            console.warn('[GPU] Falling back to CPU processing for ISO8583 parsing');
            auditLogger.logSecurityEvent({
                type: 'gpu_fallback',
                description: `GPU unavailable for card ${maskedCard} - using CPU fallback`,
                severity: 'warning',
                ip: req.ip,
                metadata: { maskedCard }
            });
        }

        const parsed = ISO8583Sim.parseMessage(isoMessage);
        gatewayResp = MockAcquirer.processRequest(parsed, merchantSettings.accountNumber);

        // Audit log: gateway response
        auditLogger.logSecurityEvent({
            type: 'gateway_response',
            description: `Gateway response for card ${maskedCard}: ${gatewayResp.status || (gatewayResp.success ? 'Approved' : 'Declined')} (code: ${gatewayResp.responseCode || 'N/A'})`,
            severity: 'info',
            ip: req.ip,
            metadata: {
                maskedCard,
                provider: gatewayProvider,
                status: gatewayResp.status || (gatewayResp.success ? 'Approved' : 'Declined'),
                responseCode: gatewayResp.responseCode,
                gpuProcessed
            }
        });

    } catch (err) {
        console.error('[TRANSACTION] Processing error:', err.message);
        auditLogger.logSecurityEvent({
            type: 'transaction_error',
            description: `Transaction processing error for card ${maskedCard}: ${err.message}`,
            severity: 'error',
            ip: req.ip,
            metadata: { maskedCard, error: err.message }
        });
        // Clear vault data on error to prevent sensitive data leakage
        secureVault.clear(`${vaultKey}_pan`);
        if (cvv) secureVault.clear(`${vaultKey}_cvv`);
        return res.status(500).json({ success: false, message: 'Transaction processing failed' });
    }

    const processingTimeMs = Date.now() - startTime;

    // 4. Performance monitoring: log warning if threshold exceeded
    if (processingTimeMs > performanceConfig.thresholds.transactionTimeMs) {
        const warningMsg = `[PERFORMANCE] Transaction for card ${maskedCard} took ${processingTimeMs}ms (threshold: ${performanceConfig.thresholds.transactionTimeMs}ms)`;
        console.warn(warningMsg);
        auditLogger.logSecurityEvent({
            type: 'performance_warning',
            description: warningMsg,
            severity: 'warning',
            ip: req.ip,
            metadata: { maskedCard, processingTimeMs, threshold: performanceConfig.thresholds.transactionTimeMs }
        });
    }
    performanceOptimizer.updateMetrics('process-payment', processingTimeMs);

    const txStatus = gatewayResp.status || (gatewayResp.success ? 'Approved' : 'Declined');
    const securityFlags = {
        cardMasked: true,
        encrypted: true,
        auditLogged: true,
        gpuProcessed
    };

    const txnData = {
        id: generateTransactionId(),
        cardType: val.cardType,
        lastFour: val.lastFour,
        amount: amountNum,
        currency: currency || 'USD',
        status: txStatus,
        responseCode: gatewayResp.responseCode || '00',
        settlementStatus: gatewayResp.settlementStatus || (gatewayResp.success ? 'Settled' : 'N/A'),
        merchantAccount: merchantSettings.accountNumber,
        paymentIntentId: gatewayResp.paymentIntentId,
        gatewayProvider,
        processingTimeMs,
        gpuProcessed,
        mfaVerified: mfaVerified || false,
        encrypted: true,
        securityFlags
    };

    const savedTxn = database.insertTransaction(txnData);

    // 5. Audit log: transaction completion with all metadata
    auditLogger.logTransaction({
        id: savedTxn.id,
        cardType: savedTxn.cardType,
        lastFour: savedTxn.lastFour,
        amount: savedTxn.amount,
        currency: savedTxn.currency,
        status: savedTxn.status,
        responseCode: savedTxn.responseCode,
        settlementStatus: savedTxn.settlementStatus,
        merchantAccount: savedTxn.merchantAccount,
        processingTimeMs: savedTxn.processingTimeMs,
        gpuProcessed: savedTxn.gpuProcessed,
        securityFlags
    });

    auditLogger.logSecurityEvent({
        type: 'transaction_complete',
        description: `Transaction ${savedTxn.id} completed: ${savedTxn.status} for card ${maskedCard} in ${processingTimeMs}ms`,
        severity: 'info',
        ip: req.ip,
        metadata: {
            transactionId: savedTxn.id,
            maskedCard,
            status: savedTxn.status,
            processingTimeMs,
            gpuProcessed,
            mfaVerified: mfaVerified || false
        }
    });

    // 6. Clear sensitive vault data after transaction completes
    secureVault.clear(`${vaultKey}_pan`);
    if (cvv) secureVault.clear(`${vaultKey}_cvv`);

    res.json({
        success: savedTxn.status === 'Approved',
        message: savedTxn.status === 'Approved' ? 'Success' : `Declined: ${savedTxn.responseCode}`,
        transactionId: savedTxn.id,
        status: savedTxn.status,
        processingTimeMs: savedTxn.processingTimeMs,
        gpuProcessed: savedTxn.gpuProcessed,
        paymentIntentId: savedTxn.paymentIntentId,
        requiresAction: gatewayResp.requiresAction || false,
        clientSecret: gatewayResp.clientSecret,
        securityMetadata: {
            cardMasked: securityFlags.cardMasked,
            encrypted: securityFlags.encrypted,
            auditLogged: securityFlags.auditLogged,
            gpuProcessed: securityFlags.gpuProcessed
        }
    });
});

/**
 * GET /api/transactions
 * List all transactions (admin only).
 */
app.get('/api/transactions', adminOnly, (req, res) => {
    auditLogger.logAccess(req.user?.id || 'admin', 'view_transactions', {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        resource: 'transactions',
        success: true
    });
    const transactions = database.getTransactions({ limit: 100 });
    res.json(transactions);
});

/**
 * GET /api/transactions/:id
 * Get a specific transaction by ID (admin only).
 */
app.get('/api/transactions/:id', adminOnly, (req, res) => {
    const { id } = req.params;
    auditLogger.logAccess(req.user?.id || 'admin', 'view_transaction', {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        resource: `transactions/${id}`,
        success: true
    });
    const transaction = database.getTransaction(id);
    if (!transaction) {
        return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    res.json(transaction);
});

/**
 * GET /api/settings
 * Get merchant settings (admin only).
 */
app.get('/api/settings', adminOnly, (req, res) => {
    auditLogger.logAccess(req.user?.id || 'admin', 'view_settings', {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        resource: 'settings',
        success: true
    });
    res.json(merchantSettings);
});

/**
 * POST /api/settings
 * Update merchant settings (admin only).
 */
app.post('/api/settings', adminOnly, (req, res) => {
    Object.assign(merchantSettings, req.body);
    database.upsertMerchant(merchantSettings);
    auditLogger.logAccess(req.user?.id || 'admin', 'update_settings', {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        resource: 'settings',
        success: true
    });
    // Invalidate settings cache
    performanceOptimizer.cacheInvalidate('settings:*');
    res.json({ success: true, settings: merchantSettings });
});

// --- API Key Management Endpoints ---

app.get('/api/api-keys', adminOnly, (req, res) => {
    // Only non-sensitive metadata is exposed — plaintext keys are never returned
    const keys = authService.listActiveAPIKeys();
    res.json({
        success: true,
        keys: keys.map(k => ({
            keyHash: k.keyHash,
            keyPreview: k.keyPreview,
            userId: k.userId,
            metadata: k.metadata,
            active: k.active,
            createdAt: k.createdAt,
            expiresAt: k.expiresAt
        }))
    });
});

app.post('/api/api-keys/generate', adminOnly, (req, res) => {
    const { userId = 'admin', roles = ['admin'], expiresInDays = null, label = 'Default API Key' } = req.body;
    let expiresIn = null;
    if (expiresInDays) expiresIn = expiresInDays * 24 * 60 * 60 * 1000;
    
    const newKey = authService.generateAPIKey();
    const record = authService.storeAPIKey(newKey, userId, { roles, label }, expiresIn);
    
    auditLogger.logSecurityEvent({
        type: 'api_key_generated',
        user: req.user?.id,
        description: `New API key generated for user ${userId}`,
        severity: 'info',
        ip: req.ip
    });
    
    // Save the new key as current
    saveCurrentApiKey(newKey);
    
    res.json({
        success: true,
        apiKey: newKey,
        expiresAt: record.expiresAt ? new Date(record.expiresAt).toISOString() : null
    });
});

app.post('/api/api-keys/rotate', adminOnly, (req, res) => {
    const { oldKey, userId = 'admin', roles = ['admin'], expiresInDays = null, label = 'Rotated API Key' } = req.body;
    let expiresIn = null;
    if (expiresInDays) expiresIn = expiresInDays * 24 * 60 * 60 * 1000;
    
    const record = authService.rotateAPIKey(oldKey, userId, { roles, label }, expiresIn);
    
    auditLogger.logSecurityEvent({
        type: 'api_key_rotated',
        user: req.user?.id,
        description: `API key rotated for user ${userId}`,
        severity: 'info',
        ip: req.ip
    });
    
    // Save the new key as current
    saveCurrentApiKey(record.key);
    
    res.json({
        success: true,
        apiKey: record.key,
        expiresAt: record.expiresAt ? new Date(record.expiresAt).toISOString() : null
    });
});

// Get current API key
app.get('/api/api-keys/current', adminOnly, (req, res) => {
    res.json({
        success: true,
        apiKey: currentApiKey
    });
});

// Save current API key
app.post('/api/api-keys/current', adminOnly, (req, res) => {
    const { key } = req.body;
    if (!key) {
        return res.status(400).json({ success: false, message: 'API key is required' });
    }
    saveCurrentApiKey(key);
    res.json({ success: true });
});

app.post('/api/api-keys/deactivate', adminOnly, (req, res) => {
    const { key } = req.body;
    const success = authService.deactivateAPIKey(key);
    if (success) {
        auditLogger.logSecurityEvent({
            type: 'api_key_deactivated',
            user: req.user?.id,
            description: `API key deactivated`,
            severity: 'info',
            ip: req.ip
        });
    }
    res.json({ success });
});

// --- MFA step-up (RFC 6238-compatible challenge) ---

/**
 * POST /api/auth/mfa/initiate
 * Start an MFA challenge for the authenticated admin. Returns an mfaToken to
 * complete the challenge. The one-time code is delivered out-of-band in
 * production (wire an SMS/email provider); it is echoed back only in
 * non-production environments for local testing.
 */
app.post('/api/auth/mfa/initiate', adminOnly, (req, res) => {
    try {
        const initiated = authService.initiateMFA({ id: req.user.id });

        auditLogger.logSecurityEvent({
            type: 'mfa_challenge_initiated',
            user: req.user.id,
            description: `MFA challenge initiated`,
            severity: 'info',
            ip: req.ip,
            metadata: { mfaToken: initiated.mfaToken }
        });

        const payload = {
            success: true,
            mfaToken: initiated.mfaToken,
            expiresAt: initiated.expiresAt
        };
        // Only expose the code in non-production (local/dev/test convenience)
        if (securityConfig.isSimulationAllowed()) {
            payload.code = initiated.code;
        }
        res.json(payload);
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/auth/mfa/verify
 * Complete an MFA challenge and receive a short-lived grant token. Sensitive
 * endpoints require this grant via the x-mfa-token header.
 */
app.post('/api/auth/mfa/verify', adminOnly, (req, res) => {
    const { mfaToken, code } = req.body;
    const identifier = `ip:${req.ip}`;
    const challenge = code || mfaToken;

    const result = authService.verifyMFA({ id: req.user.id }, challenge);

    if (!result.isValid) {
        const info = authService.recordAuthFailure(identifier);
        auditLogger.logSecurityEvent({
            type: 'mfa_verification_failed',
            user: req.user.id,
            description: `MFA verification failed: ${result.reason}`,
            severity: 'warning',
            ip: req.ip
        });
        return res.status(info.locked ? 429 : 401).json({
            success: false,
            message: result.reason,
            attemptsRemaining: result.attemptsRemaining,
            retryAfterMs: info.retryAfterMs
        });
    }

    authService.clearAuthFailures(identifier);
    const grant = authService.issueMfaGrant(req.user.id);

    auditLogger.logSecurityEvent({
        type: 'mfa_verification_success',
        user: req.user.id,
        description: `MFA verification succeeded; grant issued`,
        severity: 'info',
        ip: req.ip
    });

    res.json({
        success: true,
        mfaVerified: true,
        grantToken: grant.token,
        expiresAt: grant.expiresAt
    });
});

/**
 * POST /api/auth/mfa/totp
 * Verify a 6-digit TOTP code (RFC 6238) against the enrolled ADMIN_MFA_SECRET
 * and issue a step-up grant token. This is the production-usable MFA path:
 * the operator scans the base32 secret into an authenticator app.
 */
app.post('/api/auth/mfa/totp', adminOnly, (req, res) => {
    const secret = process.env.ADMIN_MFA_SECRET;
    if (!secret) {
        return res.status(400).json({
            success: false,
            message: 'MFA is not enrolled (ADMIN_MFA_SECRET not configured)'
        });
    }

    const { code } = req.body;
    const identifier = `ip:${req.ip}`;

    if (!authService.verifyTOTP(secret, code)) {
        const info = authService.recordAuthFailure(identifier);
        auditLogger.logSecurityEvent({
            type: 'mfa_totp_failed',
            user: req.user.id,
            description: `TOTP verification failed`,
            severity: 'warning',
            ip: req.ip
        });
        return res.status(info.locked ? 429 : 401).json({
            success: false,
            message: 'Invalid MFA code',
            retryAfterMs: info.retryAfterMs
        });
    }

    authService.clearAuthFailures(identifier);
    const grant = authService.issueMfaGrant(req.user.id);

    auditLogger.logSecurityEvent({
        type: 'mfa_totp_success',
        user: req.user.id,
        description: `TOTP verification succeeded; grant issued`,
        severity: 'info',
        ip: req.ip
    });

    res.json({
        success: true,
        mfaVerified: true,
        grantToken: grant.token,
        expiresAt: grant.expiresAt
    });
});

// Get OAuth credentials
app.get('/api/oauth/credentials', adminOnly, (req, res) => {
    res.json({
        success: true,
        clientId: oauthCredentials.clientId,
        clientSecret: oauthCredentials.clientSecret
    });
});

// POST OAuth credentials
app.post('/api/oauth/credentials', adminMfaOnly, (req, res) => {
    const { clientId, clientSecret } = req.body;
    if (!clientId || clientSecret === undefined) {
        return res.status(400).json({ success: false, message: 'Client ID and Client Secret are required' });
    }
    const result = saveOAuthCredentials({ clientId, clientSecret });
    if (!result.success) {
        return res.status(500).json({ success: false, message: result.message });
    }
    auditLogger.logSecurityEvent({
        type: 'oauth_credentials_saved',
        user: req.user?.id,
        description: `OAuth credentials saved`,
        severity: 'info',
        ip: req.ip
    });
    res.json({ success: true });
});

/**
 * POST /api/request-payout
 * Request a payout for settled transactions (admin only).
 */
app.post('/api/request-payout', adminOnly, async (req, res) => {
    const settled = database.getTransactions({ 
        status: 'Approved', 
        settlementStatus: 'Settled',
        merchantAccount: merchantSettings.accountNumber
    });
    
    if (!settled.length) {
        return res.status(400).json({ success: false, message: 'No settled funds available for payout' });
    }
    
    const total = settled.reduce((s, t) => s + t.amount, 0);
    const transactionIds = settled.map(t => t.id);
    
    let stripePayout = null;
    let payoutStatus = 'Pending';

    // Determine payout currency from the settled transactions (use most common, default to merchant setting or AED)
    const currencyCount = {};
    settled.forEach(t => { currencyCount[t.currency] = (currencyCount[t.currency] || 0) + 1; });
    const payoutCurrency = Object.keys(currencyCount).sort((a, b) => currencyCount[b] - currencyCount[a])[0] || merchantSettings.currency || 'AED';

    // Try to create real Stripe payout if enabled
    if (stripeGateway.isEnabled()) {
        try {
            stripePayout = await stripeGateway.createPayout(
                total,
                payoutCurrency,
                merchantSettings,
                `Payout for merchant ${merchantSettings.accountNumber}`
            );
            payoutStatus = stripePayout.status; // in_transit, pending, paid, failed, canceled
            console.log(`[STRIPE] Payout created: ${stripePayout.id} — ${total} ${payoutCurrency}`);
        } catch (stripeError) {
            console.error(`[STRIPE] Payout failed: ${stripeError.message}`);
            auditLogger.logSecurityEvent({
                type: 'payout_failed',
                user: req.user?.id || 'admin',
                description: `Stripe payout failed: ${stripeError.message}`,
                severity: 'error',
                ip: req.ip,
                metadata: { error: stripeError.message }
            });
        }
    }

    // Create payout record in our database
    const payout = database.createPayout({
        merchantAccount: merchantSettings.accountNumber,
        amount: total,
        currency: payoutCurrency,
        status: payoutStatus,
        bankName: merchantSettings.bankName,
        iban: merchantSettings.iban,
        swift: merchantSettings.swift,
        accountHolder: merchantSettings.accountHolder,
        transactionIds: transactionIds,
        stripePayoutId: stripePayout?.id
    });
    
    // Mark transactions as Paid Out
    settled.forEach(t => database.updateTransaction(t.id, { settlementStatus: 'Paid Out' }));
    
    auditLogger.logSecurityEvent({
        type: 'payout_requested',
        user: req.user?.id || 'admin',
        description: `Payout of $${total.toFixed(2)} initiated`,
        severity: 'info',
        ip: req.ip,
        metadata: {
            payoutId: payout.id,
            stripePayoutId: stripePayout?.id,
            amount: total,
            transactionCount: transactionIds.length,
            bankName: merchantSettings.bankName,
            isRealPayout: !!stripePayout
        }
    });
    
    res.json({
        success: true,
        message: `Payout of $${total.toFixed(2)} initiated to ${merchantSettings.bankName}`,
        payout: payout,
        stripePayout: stripePayout
    });
});

/**
 * GET /api/payouts
 * Get payout history (admin only).
 */
app.get('/api/payouts', adminOnly, (req, res) => {
    const { status, startDate, endDate, limit } = req.query;
    const filter = { merchantAccount: merchantSettings.accountNumber };
    
    if (status) filter.status = status;
    if (startDate) filter.startDate = startDate;
    if (endDate) filter.endDate = endDate;
    if (limit) filter.limit = parseInt(limit, 10);
    
    const payouts = database.getPayouts(filter);
    res.json({ success: true, payouts });
});

/**
 * GET /api/balance
 * Get Stripe account balance (admin only).
 */
app.get('/api/balance', adminOnly, async (req, res) => {
    if (!stripeGateway.isEnabled()) {
        return res.json({ success: false, message: 'Stripe integration not enabled' });
    }
    
    try {
        const balance = await stripeGateway.getBalance();
        res.json({ success: true, balance });
    } catch (error) {
        console.error('[STRIPE] Balance check failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/audit-logs
 * Retrieve audit trail (admin only).
 */
app.get('/api/audit-logs', adminOnly, (req, res) => {
    const { user, action, startDate, endDate, severity, limit, offset } = req.query;
    const filter = {};
    if (user) filter.user = user;
    if (action) filter.action = action;
    if (startDate) filter.startDate = startDate;
    if (endDate) filter.endDate = endDate;
    if (severity) filter.severity = severity;
    if (limit) filter.limit = parseInt(limit, 10);
    if (offset) filter.offset = parseInt(offset, 10);

    const logs = auditLogger.getAuditTrail(filter);
    res.json({ success: true, logs, total: logs.length });
});

/**
 * GET /api/security-events
 * Retrieve security events (admin only).
 */
app.get('/api/security-events', adminOnly, (req, res) => {
    const { type, user, startDate, endDate, severity, limit, offset } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (user) filter.user = user;
    if (startDate) filter.startDate = startDate;
    if (endDate) filter.endDate = endDate;
    if (severity) filter.severity = severity;
    if (limit) filter.limit = parseInt(limit, 10);
    if (offset) filter.offset = parseInt(offset, 10);

    const events = auditLogger.getSecurityEvents(filter);
    res.json({ success: true, events, total: events.length });
});

/**
 * GET /api/metrics
 * Get performance metrics (admin only).
 */
app.get('/api/metrics', adminOnly, (req, res) => {
    const perfMetrics = performanceOptimizer.getMetrics();
    const gpuMetrics = gpuManager.getMetrics();
    const cacheStats = performanceOptimizer.getCacheStats();
    const auditSummary = auditLogger.getSummary();

    res.json({
        success: true,
        performance: perfMetrics,
        gpu: gpuMetrics,
        cache: cacheStats,
        audit: auditSummary,
        timestamp: new Date().toISOString()
    });
});

/**
 * POST /api/rotate-keys
 * Rotate encryption keys in the secure vault (admin only).
 */
app.post('/api/rotate-keys', adminMfaStrict, (req, res) => {
    try {
        const result = secureVault.rotateKeys();
        auditLogger.logSecurityEvent({
            type: 'key_rotation',
            user: req.user?.id || 'admin',
            description: `Encryption keys rotated. Records re-encrypted: ${result.recordsReencrypted}`,
            severity: 'info',
            ip: req.ip,
            metadata: {
                oldKeyHash: result.oldKeyHash,
                newKeyHash: result.newKeyHash,
                recordsReencrypted: result.recordsReencrypted
            }
        });
        res.json({
            success: true,
            message: 'Key rotation completed',
            recordsReencrypted: result.recordsReencrypted
        });
    } catch (err) {
        console.error('[KEY ROTATION] Error:', err.message);
        res.status(500).json({ success: false, message: 'Key rotation failed' });
    }
});

/**
 * GET /api/vault-status
 * Get secure vault encryption status (admin only).
 */
app.get('/api/vault-status', adminOnly, (req, res) => {
    const status = secureVault.getEncryptionStatus();
    const compliance = secureVault.verifyFIPSCompliance();
    res.json({
        success: true,
        vault: status,
        fipsCompliance: compliance
    });
});

/**
 * GET /api/gpu-status
 * Get GPU cluster status and metrics (admin only).
 */
app.get('/api/gpu-status', adminOnly, (req, res) => {
    const utilization = gpuManager.monitorUtilization();
    const config = gpuManager.getConfig();
    res.json({
        success: true,
        utilization,
        config
    });
});

/**
 * POST /api/gpu-scale
 * Scale the GPU cluster up or down (admin only).
 */
app.post('/api/gpu-scale', adminStrict, (req, res) => {
    const { up } = req.body;
    if (typeof up !== 'boolean') {
        return res.status(400).json({ success: false, message: 'Missing or invalid "up" boolean field' });
    }
    const result = gpuManager.scaleCluster(up);
    auditLogger.logSecurityEvent({
        type: 'gpu_scale',
        user: req.user?.id || 'admin',
        description: `GPU cluster scaled ${up ? 'up' : 'down'}. Result: ${result.message || 'success'}`,
        severity: 'info',
        ip: req.ip,
        metadata: result
    });
    res.json({ success: result.success, ...result });
});

/**
 * GET /api/audit-export
 * Export audit data for compliance reporting (admin only).
 */
app.get('/api/audit-export', adminOnly, (req, res) => {
    const { format = 'json', startDate, endDate, exportType = 'all' } = req.query;
    const exported = auditLogger.exportForAudit(format, { startDate, endDate, exportType });

    if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="audit-export.csv"');
        return res.send(exported);
    }
    if (format === 'xml') {
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', 'attachment; filename="audit-export.xml"');
        return res.send(exported);
    }
    res.json(JSON.parse(exported));
});

/**
 * POST /api/webhooks/stripe
 * Stripe webhook handler — receives real-time payment events from Stripe.
 * Verifies the signature using STRIPE_WEBHOOK_SECRET before processing.
 * This is the reliable fallback for recording payments when the browser
 * closes before /api/record-payment-result is called.
 *
 * Required Stripe events to enable in your dashboard:
 *   payment_intent.succeeded
 *   payment_intent.payment_failed
 *   payout.paid
 *   payout.failed
 */
app.post('/api/webhooks/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    if (webhookSecret && sig) {
        try {
            event = stripeGateway.verifyWebhookEvent(req.body, sig, webhookSecret);
        } catch (err) {
            console.error('[WEBHOOK] Signature verification failed:', err.message);
            auditLogger.logSecurityEvent({
                type: 'webhook_signature_failed',
                description: `Stripe webhook signature verification failed: ${err.message}`,
                severity: 'warning',
                ip: req.ip
            });
            return res.status(400).json({ success: false, message: 'Webhook signature verification failed' });
        }
    } else {
        // No webhook secret configured — only allow in non-production
        if (process.env.NODE_ENV === 'production') {
            console.error('[WEBHOOK] Rejected unsigned webhook in production — set STRIPE_WEBHOOK_SECRET');
            return res.status(400).json({ success: false, message: 'Webhook secret not configured' });
        }
        // Parse JSON manually for development/testing
        try {
            event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        } catch (err) {
            return res.status(400).json({ success: false, message: 'Invalid JSON' });
        }
    }

    // Acknowledge receipt immediately (Stripe requires a quick 200)
    res.json({ received: true });

    // Process the event asynchronously
    try {
        switch (event.type) {
            case 'payment_intent.succeeded': {
                const pi = event.data.object;

                // Check if we already have this transaction recorded
                const existingTxns = database.getTransactions({ limit: 500 });
                const alreadyRecorded = existingTxns.some(t => t.paymentIntentId === pi.id);

                if (!alreadyRecorded) {
                    // Extract masked card details safely
                    const cardDetails = stripeGateway.extractCardDetails(pi);
                    const brandFormatted = cardDetails.brand.charAt(0).toUpperCase() + cardDetails.brand.slice(1);
                    const amountDollars = pi.amount / 100;

                    const txnData = {
                        id: generateTransactionId('WH'),
                        cardType: brandFormatted,
                        lastFour: cardDetails.last4,
                        amount: amountDollars,
                        currency: (pi.currency || 'aed').toUpperCase(),
                        status: 'Approved',
                        responseCode: '00',
                        settlementStatus: 'Settled',
                        merchantAccount: pi.metadata?.merchant_account || merchantSettings.accountNumber,
                        paymentIntentId: pi.id,
                        gatewayProvider: 'stripe',
                        processingTimeMs: 0,
                        gpuProcessed: false,
                        mfaVerified: false,
                        encrypted: true,
                        securityFlags: { cardMasked: true, encrypted: true, auditLogged: true, gpuProcessed: false }
                    };

                    const savedTxn = database.insertTransaction(txnData);

                    auditLogger.logTransaction({
                        id: savedTxn.id,
                        cardType: savedTxn.cardType,
                        lastFour: savedTxn.lastFour,
                        amount: savedTxn.amount,
                        currency: savedTxn.currency,
                        status: savedTxn.status,
                        responseCode: savedTxn.responseCode,
                        settlementStatus: savedTxn.settlementStatus,
                        merchantAccount: savedTxn.merchantAccount,
                        processingTimeMs: 0,
                        gpuProcessed: false,
                        securityFlags: txnData.securityFlags
                    });

                    auditLogger.logSecurityEvent({
                        type: 'webhook_payment_recorded',
                        description: `Payment ${pi.id} recorded via webhook (browser may have closed early)`,
                        severity: 'info',
                        ip: 'stripe-webhook',
                        metadata: { paymentIntentId: pi.id, amount: amountDollars, transactionId: savedTxn.id }
                    });

                    console.log(`[WEBHOOK] Recorded payment ${pi.id} → TXN ${savedTxn.id}`);
                } else {
                    console.log(`[WEBHOOK] Payment ${pi.id} already recorded — skipping`);
                }
                break;
            }

            case 'payment_intent.payment_failed': {
                const pi = event.data.object;
                const failureMsg = pi.last_payment_error?.message || 'Payment failed';
                auditLogger.logSecurityEvent({
                    type: 'webhook_payment_failed',
                    description: `Payment ${pi.id} failed: ${failureMsg}`,
                    severity: 'warning',
                    ip: 'stripe-webhook',
                    metadata: { paymentIntentId: pi.id, error: failureMsg }
                });
                console.log(`[WEBHOOK] Payment failed: ${pi.id} — ${failureMsg}`);
                break;
            }

            case 'payout.paid': {
                const payout = event.data.object;
                // Update our payout record status
                const payouts = database.getPayouts({ limit: 200 });
                const localPayout = payouts.find(p => p.stripePayoutId === payout.id);
                if (localPayout) {
                    database.updatePayoutStatus(localPayout.id, 'Completed');
                    console.log(`[WEBHOOK] Payout ${payout.id} marked as Completed`);
                }
                break;
            }

            case 'payout.failed': {
                const payout = event.data.object;
                const payouts = database.getPayouts({ limit: 200 });
                const localPayout = payouts.find(p => p.stripePayoutId === payout.id);
                if (localPayout) {
                    database.updatePayoutStatus(localPayout.id, 'Failed');
                    console.log(`[WEBHOOK] Payout ${payout.id} marked as Failed`);
                }
                auditLogger.logSecurityEvent({
                    type: 'webhook_payout_failed',
                    description: `Stripe payout ${payout.id} failed`,
                    severity: 'error',
                    ip: 'stripe-webhook',
                    metadata: { stripePayoutId: payout.id }
                });
                break;
            }

            default:
                // Unhandled event type — not an error, just ignore
                break;
        }
    } catch (err) {
        console.error('[WEBHOOK] Error processing event:', err.message);
        auditLogger.logSecurityEvent({
            type: 'webhook_processing_error',
            description: `Error processing webhook event ${event.type}: ${err.message}`,
            severity: 'error',
            ip: 'stripe-webhook',
            metadata: { eventType: event.type, error: err.message }
        });
    }
});

// --- Error Handling ---
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    auditLogger.logSecurityEvent({
        type: 'uncaught_exception',
        description: err.message,
        severity: 'error',
        metadata: { stack: err.stack }
    });
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    auditLogger.logSecurityEvent({
        type: 'unhandled_rejection',
        description: String(reason),
        severity: 'error'
    });
});

// --- Start Server only when run directly ---
if (require.main === module) {
    // --- Keep Server Alive ---
    setInterval(() => {
        // Just a simple keep-alive to prevent the process from exiting
    }, 1000);

    // --- Start Server ---
    const server = app.listen(PORT, () => {
        console.log('\x1b[32m✅ SERVER RUNNING on http://localhost:' + PORT + '\x1b[0m');
        console.log('\x1b[34m👤 ADMIN: Username "Admin" | Password from ADMIN_API_KEY in .env\x1b[0m');
        console.log('\x1b[36m📊 Dashboard:      http://localhost:' + PORT + '\x1b[0m');
        console.log('\x1b[36m🏪 Merchant API:   POST /api/merchants/register\x1b[0m');
        console.log('\x1b[36m💳 Charge API:     POST /api/v1/charge\x1b[0m');
        console.log('\x1b[36m📴 Offline Queue:  POST /api/v1/offline/queue\x1b[0m');
        console.log('\x1b[36m🔄 Offline Sync:   POST /api/v1/offline/sync\x1b[0m');
        console.log('\x1b[36m❤️  Health Check:  GET  /api/v1/status\x1b[0m');
        console.log('\x1b[33m🔒 Security: Card validation, Secure Vault, Audit Logging enabled\x1b[0m');
        console.log('\x1b[33m⚡ Performance: Rate Limiting, Performance Optimizer enabled\x1b[0m');
        console.log('\x1b[35m💰 Platform Fee: ' + (process.env.PLATFORM_FEE_PERCENT || '1.0') + '% per transaction\x1b[0m');

        // ── PC/SC WebSocket bridge (ACR122U on Windows) ──────────────────
        try {
            const { attachPcscBridge } = require('./utils/pcscBridge');
            attachPcscBridge(server);
            console.log('\x1b[36m📡 NFC Bridge:     ws://localhost:' + PORT + '/nfc-ws\x1b[0m');
        } catch (e) {
            console.warn('\x1b[33m⚠️  PC/SC bridge not started:', e.message, '\x1b[0m');
        }
    });

    // Handle server errors
    server.on('error', (err) => {
        console.error('❌ Server error:', err);
    });
}

module.exports = app;
