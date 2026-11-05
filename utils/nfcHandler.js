/**
 * NFC / Contactless Payment Handler
 *
 * Handles NFC tap-to-pay card data:
 *  - Parses NDEF / EMV contactless card data delivered by the client
 *  - Validates the NFC entry mode and card token
 *  - Builds an ISO8583 message with Field 22 (Point of Service Entry Mode)
 *    set to contactless values per the EMV Contactless Book C-2 spec
 *  - Supports Apple Pay / Google Pay DPAN tokens as well as physical NFC cards
 *
 * ISO 8583 Field 22 Entry Mode values used here:
 *   07  = Contactless chip (NFC / EMV tap)
 *   91  = Contactless magnetic stripe (MSD, older tap cards)
 *   10  = Credential-on-file (Apple Pay / Google Pay DPAN token)
 */

const ISO8583Sim = require('./isoSim');
const { validateCard } = require('./cardValidator');

// ── Entry mode constants ─────────────────────────────────────────────────────
const ENTRY_MODES = {
    CONTACTLESS_CHIP:   '07',   // NFC / EMV tap (physical card)
    CONTACTLESS_MAG:    '91',   // NFC magnetic stripe (older cards)
    DIGITAL_WALLET:     '10',   // Apple Pay / Google Pay DPAN token
    CHIP:               '05',   // Contact chip (inserted)
    SWIPE:              '02',   // Magnetic stripe swipe
    MANUAL:             '01',   // Keyed / manual entry
};

// Human-readable labels for each mode
const ENTRY_MODE_LABELS = {
    '07': 'NFC Tap (Chip)',
    '91': 'NFC Tap (Magnetic)',
    '10': 'Digital Wallet',
    '05': 'Chip Insert',
    '02': 'Magnetic Swipe',
    '01': 'Manual Entry',
};

/**
 * Determine the ISO8583 entry mode code from the tap payload.
 * @param {object} nfcData  - Data received from the NFC client
 * @returns {string}  Two-digit ISO 8583 F22 code
 */
function resolveEntryMode(nfcData) {
    if (!nfcData || !nfcData.entryMethod) return ENTRY_MODES.CONTACTLESS_CHIP;

    switch (nfcData.entryMethod.toLowerCase()) {
        case 'contactless_chip':
        case 'nfc':
        case 'tap':
            return ENTRY_MODES.CONTACTLESS_CHIP;

        case 'contactless_mag':
        case 'msd':
            return ENTRY_MODES.CONTACTLESS_MAG;

        case 'apple_pay':
        case 'google_pay':
        case 'samsung_pay':
        case 'digital_wallet':
        case 'token':
            return ENTRY_MODES.DIGITAL_WALLET;

        default:
            return ENTRY_MODES.CONTACTLESS_CHIP;
    }
}

/**
 * Validate and normalise incoming NFC tap payment data.
 *
 * @param {object} tapData - Raw payload from the POS / browser client
 * @returns {{ valid: boolean, error?: string, normalised?: object }}
 */
function validateNFCData(tapData) {
    if (!tapData) {
        return { valid: false, error: 'No NFC data provided' };
    }

    // A tap payload must carry at least the PAN (or a token) and the amount
    if (!tapData.cardNumber && !tapData.token) {
        return { valid: false, error: 'NFC data missing card number or token' };
    }

    if (!tapData.amount || isNaN(parseFloat(tapData.amount)) || parseFloat(tapData.amount) <= 0) {
        return { valid: false, error: 'Invalid or missing amount in NFC payload' };
    }

    // If we have a raw PAN, run the standard card validator
    // For NFC taps, skip strict Luhn check — EMV contactless chips sometimes
    // return DPANs (Device PANs / tokens) which don't pass Luhn but are valid
    if (tapData.cardNumber) {
        const cleaned = tapData.cardNumber.replace(/\D/g, '');
        if (!cleaned || cleaned.length < 12 || cleaned.length > 19) {
            return { valid: false, error: `Card validation failed: invalid PAN length (${cleaned.length} digits)` };
        }
        // Only check brand/type — skip Luhn for NFC since DPAN tokens don't always pass it
        const { detectCardType } = require('./cardValidator');
        const brand = detectCardType(cleaned);
        if (!brand) {
            return { valid: false, error: `Card validation failed: Unknown card type or invalid length (${cleaned.length} digits, prefix ${cleaned.substring(0,6)})` };
        }
    }

    const entryMode  = resolveEntryMode(tapData);
    const isToken    = !tapData.cardNumber && !!tapData.token;
    const pan        = tapData.cardNumber || tapData.token;
    const lastFour   = tapData.lastFour || (pan ? pan.slice(-4) : '****');
    const cardBrand  = tapData.cardBrand || tapData.cardType || (tapData.cardNumber
        ? (require('./cardValidator').detectCardType(tapData.cardNumber) || 'Card')
        : 'Digital Wallet');

    return {
        valid: true,
        normalised: {
            pan,
            lastFour,
            cardBrand,
            amount:    parseFloat(tapData.amount),
            currency:  (tapData.currency || 'USD').toUpperCase(),
            expiry:    tapData.expiry    || '0000',
            cvv:       tapData.cvv       || null,
            entryMode,
            entryModeLabel: ENTRY_MODE_LABELS[entryMode] || 'NFC Tap',
            isToken,
            terminalId:   tapData.terminalId   || null,
            deviceId:     tapData.deviceId     || null,
            cryptogram:   tapData.cryptogram   || null,   // EMV contactless cryptogram (AC)
            transactionId: tapData.transactionId || null, // Apple Pay / GPay transaction ID
            merchantRef:  tapData.merchantRef  || null,
        }
    };
}

/**
 * Build an ISO8583 message for an NFC contactless transaction.
 * Adds Field 22 (Point of Service Entry Mode) for contactless identification.
 *
 * @param {object} normalisedData  - Output of validateNFCData().normalised
 * @returns {string} ISO8583-like pipe-delimited message string
 */
function buildNFCISO8583Message(normalisedData) {
    const amountCents = Math.round(normalisedData.amount * 100).toString();

    // Build standard ISO message first
    const baseMsg = ISO8583Sim.buildMessage({
        mti:              '0200',
        cardNumber:       normalisedData.pan,
        amount:           amountCents,
        currencyCode:     normalisedData.currency === 'USD' ? '840'
                        : normalisedData.currency === 'EUR' ? '978'
                        : normalisedData.currency === 'GBP' ? '826'
                        : normalisedData.currency === 'AED' ? '784'
                        : normalisedData.currency === 'SAR' ? '682'
                        : normalisedData.currency === 'INR' ? '356'
                        : '840',
        transmissionDate: new Date().toISOString(),
        cvv:              normalisedData.cvv,
        expiry:           normalisedData.expiry,
    });

    // Append NFC-specific fields
    const nfcFields = [
        `F22:${normalisedData.entryMode}`,                            // POS Entry Mode
        normalisedData.terminalId ? `F41:${normalisedData.terminalId}` : null,  // Card Acceptor Terminal ID
        normalisedData.cryptogram ? `F55:${normalisedData.cryptogram}` : null,  // EMV Data / Cryptogram
    ].filter(Boolean).join('|');

    return baseMsg + (nfcFields ? '|' + nfcFields : '');
}

/**
 * Parse an NFC-extended ISO8583 message back into an object.
 * Handles both standard fields and the NFC-specific F22/F41/F55 additions.
 *
 * @param {string} message  - Pipe-delimited ISO8583 message string
 * @returns {object}
 */
function parseNFCISO8583Message(message) {
    const base = ISO8583Sim.parseMessage(message);

    // Extract NFC fields
    const parts = message.split('|');
    parts.forEach(part => {
        const [key, value] = part.split(':');
        switch (key) {
            case 'F22': base.entryMode      = value; break;
            case 'F41': base.terminalId     = value; break;
            case 'F55': base.cryptogram     = value; break;
            default: break;
        }
    });

    // Annotate with human-readable label
    base.entryModeLabel = ENTRY_MODE_LABELS[base.entryMode] || 'Unknown';

    return base;
}

/**
 * Check whether an entry mode code represents a contactless / NFC transaction.
 * @param {string} entryMode  - ISO8583 F22 value
 * @returns {boolean}
 */
function isContactless(entryMode) {
    return [
        ENTRY_MODES.CONTACTLESS_CHIP,
        ENTRY_MODES.CONTACTLESS_MAG,
        ENTRY_MODES.DIGITAL_WALLET,
    ].includes(entryMode);
}

/**
 * Get a user-friendly display label for the entry mode.
 * @param {string} entryMode
 * @returns {string}
 */
function getEntryModeLabel(entryMode) {
    return ENTRY_MODE_LABELS[entryMode] || 'Unknown';
}

module.exports = {
    ENTRY_MODES,
    ENTRY_MODE_LABELS,
    resolveEntryMode,
    validateNFCData,
    buildNFCISO8583Message,
    parseNFCISO8583Message,
    isContactless,
    getEntryModeLabel,
};
