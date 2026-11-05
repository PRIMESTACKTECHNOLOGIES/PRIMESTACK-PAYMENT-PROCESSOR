/**
 * Simple ISO8583-like message builder for transaction data.
 * This formats data into a structured layout common in financial systems.
 *
 * This is a SIMULATED message builder used by the mock processing pipeline.
 * Building simulated requests is gated to non-production environments
 * (see config/security.isSimulationAllowed).
 */

const net = require('net');
const fs = require('fs');
const path = require('path');
const securityConfig = require('../config/security');

class ISO8583Sim {
    // Valid MTI codes for transaction requests
    static get VALID_MTIS() {
        return ['0200', '0210', '0220', '0400', '0410', '0420'];
    }

    // Required fields for a valid ISO8583 message
    static get REQUIRED_FIELDS() {
        return ['MTI', 'F02', 'F04', 'F07'];
    }

    /**
     * Builds a mock ISO8583 message.
     * @param {object} data 
     * @returns {string}
     */
    static buildMessage(data) {
        // Fail-closed: refuse to build simulated messages outside permitted envs
        if (!securityConfig.isSimulationAllowed()) {
            throw new Error(securityConfig.simulation.disabledMessage);
        }

        const { mti, cardNumber, amount, currencyCode, transmissionDate, cvv, expiry, entryMode } = data;

        // Simplified ISO8583 format: MTI + Bitmap (simplified) + Fields
        // MTI 0200 = Transaction Request
        // Field 2  = Primary Account Number (PAN)
        // Field 4  = Amount
        // Field 7  = Transmission Date/Time
        // Field 14 = Expiration Date
        // Field 22 = Point of Service Entry Mode (07 = NFC/contactless, 01 = manual, etc.)
        // Field 49 = Currency Code
        // Field 52 = Personal Identification Number (PIN) / CVV (Simulated)

        // Store original card number for round-trip consistency
        const originalCardNumber = cardNumber || '';

        // Default entry mode: 01 (manual/keyed); callers set 07 for NFC tap
        const posEntryMode = entryMode || '01';
        
        return [
            `MTI:${mti || ''}`,
            `F02:${originalCardNumber}`,
            `F04:${(amount || '').toString().padStart(12, '0')}`,
            `F07:${transmissionDate || ''}`,
            `F14:${expiry || '0000'}`,
            `F22:${posEntryMode}`,
            `F49:${currencyCode || ''}`,
            `F52:${cvv ? 'PRESENT' : 'MISSING'}`
        ].join('|');
    }

    /**
     * Parses an ISO8583-like message string back into an object.
     * @param {string} message 
     * @returns {object}
     */
    static parseMessage(message) {
        const parts = message.split('|');
        const data = {};
        const errors = [];

        parts.forEach(part => {
            const [key, value] = part.split(':');
            switch (key) {
                case 'MTI': data.mti = value; break;
                case 'F02': data.cardNumber = value; break;
                case 'F04': data.amount = value; break;
                case 'F07': data.transmissionDate = value; break;
                case 'F14': data.expiry = value; break;
                case 'F22': data.entryMode = value; break;
                case 'F41': data.terminalId = value; break;
                case 'F49': data.currencyCode = value; break;
                case 'F52': data.cvvStatus = value; break;
                case 'F55': data.cryptogram = value; break;
                default:
                    errors.push(`Unknown field: ${key}`);
            }
        });

        // Store errors for later retrieval
        data._parseErrors = errors;

        return data;
    }

    /**
     * Validates an ISO8583 message for integrity and format.
     * @param {string} message 
     * @returns {object} Validation result with isValid flag and errors array
     */
    static validateMessage(message) {
        const errors = [];
        const warnings = [];

        // Check if message is a string
        if (typeof message !== 'string' || message.trim() === '') {
            errors.push('Message must be a non-empty string');
            return { isValid: false, errors, warnings };
        }

        // Split message into parts
        const parts = message.split('|');
        
        // Check for minimum required parts
        if (parts.length < 4) {
            errors.push('Message must contain at least MTI, F02, F04, and F07 fields');
            return { isValid: false, errors, warnings };
        }

        // Parse and validate each field
        const fields = {};
        parts.forEach(part => {
            const [key, value] = part.split(':');
            if (key && value !== undefined) {
                fields[key] = value;
            }
        });

        // Validate MTI
        if (!fields.MTI) {
            errors.push('Missing required field: MTI');
        } else if (!this.VALID_MTIS.includes(fields.MTI)) {
            warnings.push(`Unknown MTI code: ${fields.MTI}`);
        }

        // Validate required fields
        this.REQUIRED_FIELDS.forEach(field => {
            if (!fields[field]) {
                errors.push(`Missing required field: ${field}`);
            } else if (fields[field] === '') {
                errors.push(`Empty required field: ${field}`);
            }
        });

        // Validate F02 (Card Number) - should not be masked in round-trip
        if (fields.F02) {
            const cardNumber = fields.F02;
            if (cardNumber.includes('*')) {
                warnings.push('Card number contains asterisks - may indicate masking issue');
            }
        }

        // Validate F04 (Amount) - should be numeric
        if (fields.F04) {
            const amount = fields.F04;
            if (!/^\d+$/.test(amount)) {
                errors.push(`Invalid amount format: ${amount}`);
            }
        }

        // Validate F07 (Transmission Date) - should be in expected format
        if (fields.F07) {
            const date = fields.F07;
            if (!/^\d{14}$/.test(date) && !/^\d{8}$/.test(date)) {
                warnings.push(`Unusual date format: ${date} (expected YYYYMMDDHHMMSS or YYYYMMDD)`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Returns descriptive error messages for a parsed message.
     * @param {string|object} message - Either a message string or parsed object
     * @returns {array} Array of error messages
     */
    static getParseErrors(message) {
        const errors = [];

        // If message is a string, parse it first
        let parsed;
        if (typeof message === 'string') {
            parsed = this.parseMessage(message);
        } else {
            parsed = message;
        }

        // Collect errors from parsing
        if (parsed._parseErrors) {
            errors.push(...parsed._parseErrors);
        }

        // Validate MTI
        if (!parsed.mti) {
            errors.push('Missing MTI (Message Type Indicator)');
        }

        // Validate F02 (Card Number)
        if (!parsed.cardNumber) {
            errors.push('Missing F02 (Card Number/PAN)');
        }

        // Validate F04 (Amount)
        if (!parsed.amount) {
            errors.push('Missing F04 (Amount)');
        } else if (!/^\d+$/.test(parsed.amount)) {
            errors.push(`Invalid amount format: ${parsed.amount}`);
        }

        // Validate F07 (Transmission Date)
        if (!parsed.transmissionDate) {
            errors.push('Missing F07 (Transmission Date/Time)');
        }

        // Validate F49 (Currency Code)
        if (!parsed.currencyCode) {
            errors.push('Missing F49 (Currency Code)');
        }

        // Validate F52 (CVV Status)
        if (!parsed.cvvStatus) {
            errors.push('Missing F52 (CVV Status)');
        }

        return errors;
    }

    // ============================================
    // Raw Socket Transmission (TCP) - Code Pattern 1
    // ============================================

    /**
     * Sends an ISO8583 message via TCP socket to a remote host.
     * @param {string} host - The hostname or IP address of the remote server
     * @param {number} port - The port number to connect to
     * @param {string} message - The ISO8583 message to send
     * @returns {Promise<object>} Promise that resolves with response or rejects with error
     */
    static async sendViaSocket(host, port, message) {
        return new Promise((resolve, reject) => {
            const client = new net.Socket();
            let response = '';
            let errorMessage = null;

            client.setTimeout(5000); // 5 second timeout

            client.connect({ host, port }, () => {
                client.write(message);
            });

            client.on('data', (data) => {
                response += data.toString();
            });

            client.on('timeout', () => {
                client.destroy();
                errorMessage = 'Connection timeout';
                reject(new Error(errorMessage));
            });

            client.on('error', (err) => {
                if (!errorMessage) {
                    errorMessage = err.message;
                }
                reject(new Error(errorMessage));
            });

            client.on('close', () => {
                if (errorMessage) {
                    reject(new Error(errorMessage));
                } else {
                    resolve({ success: true, response });
                }
            });
        });
    }

    // ============================================
    // Unencrypted Storage - Code Pattern 2
    // ============================================

    /**
     * Stores card data to a file in the format: CARDNUMBER=XXXX&EXPM=XX&EXPY=XX
     * @param {string} cardNumber - The card number to store
     * @param {string} expiry - The expiry date (MM/YY or MMYY format)
     * @param {string} filename - The filename to write to
     * @returns {boolean} True if successful, false otherwise
     */
    static storeCardData(cardNumber, expiry, filename) {
        try {
            // Parse expiry date to extract month and year
            let month, year;
            
            if (expiry.includes('/')) {
                const [m, y] = expiry.split('/');
                month = m;
                year = y;
            } else {
                // Assume format MMYY
                month = expiry.substring(0, 2);
                year = expiry.substring(2, 4);
            }

            // Format: CARDNUMBER=XXXX&EXPM=XX&EXPY=XX
            const data = `CARDNUMBER=${cardNumber}&EXPM=${month}&EXPY=${year}`;
            
            // Write to file in data directory
            const filePath = path.join('data', filename);
            fs.writeFileSync(filePath, data, 'utf8');
            
            return true;
        } catch (error) {
            console.error(`Error storing card data: ${error.message}`);
            return false;
        }
    }

    /**
     * Loads card data from a file.
     * @param {string} filename - The filename to read from
     * @returns {object|null} Card data object or null if not found
     */
    static loadCardData(filename) {
        try {
            const filePath = path.join('data', filename);
            
            if (!fs.existsSync(filePath)) {
                return null;
            }

            const data = fs.readFileSync(filePath, 'utf8');
            
            // Parse: CARDNUMBER=XXXX&EXPM=XX&EXPY=XX
            const cardNumberMatch = data.match(/CARDNUMBER=([^&]+)/);
            const expMonthMatch = data.match(/EXPM=([^&]+)/);
            const expYearMatch = data.match(/EXPY=([^&]+)/);

            if (!cardNumberMatch || !expMonthMatch || !expYearMatch) {
                return null;
            }

            return {
                cardNumber: cardNumberMatch[1],
                expiryMonth: expMonthMatch[1],
                expiryYear: expYearMatch[1]
            };
        } catch (error) {
            console.error(`Error loading card data: ${error.message}`);
            return null;
        }
    }

    // ============================================
    // Header Spoofing - Code Pattern 3
    // ============================================

    /**
     * Builds an ISO8583 message with custom headers.
     * @param {object} data - Message data object
     * @param {object} customHeaders - Custom headers to include
     * @returns {string} Message with headers prepended
     */
    static buildMessageWithHeaders(data, customHeaders = {}) {
        const baseMessage = this.buildMessage(data);
        
        // Build header string
        const headers = Object.entries(customHeaders)
            .map(([key, value]) => `${key}:${value}`)
            .join('|');
        
        // Prepend headers to message
        return headers ? `${headers}|${baseMessage}` : baseMessage;
    }

    /**
     * Parses an ISO8583 message that includes custom headers.
     * @param {string} message - Message with optional headers
     * @returns {object} Object containing headers and parsed message data
     */
    static parseMessageWithHeaders(message) {
        // Split into parts
        const parts = message.split('|');
        
        // Find where headers end and message begins
        // Headers are key:value pairs, message fields are like MTI:xxx, F02:xxx
        let headerEndIndex = 0;
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const [key] = part.split(':');
            
            // If key looks like a message field (MTI, F02, etc.), headers end here
            if (key === 'MTI' || key.startsWith('F')) {
                headerEndIndex = i;
                break;
            }
        }
        
        // Extract headers
        const headers = {};
        for (let i = 0; i < headerEndIndex; i++) {
            const [key, value] = parts[i].split(':');
            if (key && value !== undefined) {
                headers[key] = value;
            }
        }
        
        // Reconstruct message without headers
        const messageWithoutHeaders = parts.slice(headerEndIndex).join('|');
        
        // Parse the message
        const parsedMessage = this.parseMessage(messageWithoutHeaders);
        
        return {
            headers,
            message: parsedMessage
        };
    }

    // ============================================
    // Memory-resident Buffer - Code Pattern 4
    // ============================================

    /**
     * Buffers card data using Node.js Buffer.
     * @param {string} cardNumber - The card number to buffer
     * @returns {Buffer} Buffer containing card data
     */
    static bufferCardData(cardNumber) {
        // Create a buffer with card number
        // Format: length (1 byte) + card number
        const cardBuffer = Buffer.allocUnsafe(1 + cardNumber.length);
        
        // First byte: length of card number
        cardBuffer.writeUInt8(cardNumber.length, 0);
        
        // Remaining bytes: card number as ASCII
        cardBuffer.write(cardNumber, 1);
        
        return cardBuffer;
    }

    /**
     * Reads card data from a buffer.
     * @param {Buffer} buffer - Buffer containing card data
     * @returns {string|null} Card number or null if buffer is invalid
     */
    static readFromBuffer(buffer) {
        if (!Buffer.isBuffer(buffer) || buffer.length < 1) {
            return null;
        }
        
        // Read length from first byte
        const length = buffer.readUInt8(0);
        
        // Validate length
        if (length === 0 || length > buffer.length - 1) {
            return null;
        }
        
        // Read card number from remaining bytes
        return buffer.toString('ascii', 1, 1 + length);
    }
}

module.exports = ISO8583Sim;
