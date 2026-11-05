/**
 * ISO8583 TCP Client & Server Utilities
 * Provides tools for sending and receiving ISO8583 messages over TCP
 * Integrates with the existing ISO8583 simulator
 */

const net = require('net');
const ISO8583Sim = require('./isoSim');

class ISO8583TCPClient {
    constructor(host = '127.0.0.1', port = 8000) {
        this.host = host;
        this.port = port;
    }

    /**
     * Send ISO8583 message over TCP
     * @param {Object} transactionData - Transaction data to build ISO8583 message
     * @returns {Promise<Object>} Response from server
     */
    async sendISO8583(transactionData) {
        return new Promise((resolve, reject) => {
            const client = new net.Socket();
            
            client.setTimeout(5000);
            
            client.connect(this.port, this.host, () => {
                console.log(`[ISO8583 TCP] Connected to ${this.host}:${this.port}`);
                
                // Build ISO8583 message
                const isoMessage = ISO8583Sim.buildMessage({
                    mti: transactionData.mti || '0200',
                    cardNumber: transactionData.cardNumber || '4111111111111111',
                    amount: transactionData.amount ? (parseFloat(transactionData.amount) * 100).toString() : '000000001000',
                    currencyCode: transactionData.currencyCode || '840',
                    transmissionDate: new Date().toISOString(),
                    cvv: transactionData.cvv || '123',
                    expiry: transactionData.expiry || '12/25'
                });

                console.log(`[ISO8583 TCP] Sending message: ${isoMessage}`);
                
                // Send as hex-encoded string
                client.write(isoMessage + '\n');
            });

            let responseData = '';
            
            client.on('data', (data) => {
                responseData += data.toString();
            });

            client.on('end', () => {
                console.log(`[ISO8583 TCP] Connection closed`);
                try {
                    // Parse response if it's a valid ISO8583 message
                    const parsed = ISO8583Sim.parseMessage(responseData.trim());
                    resolve({
                        raw: responseData.trim(),
                        parsed: parsed
                    });
                } catch (e) {
                    resolve({
                        raw: responseData.trim(),
                        error: 'Failed to parse response'
                    });
                }
            });

            client.on('error', (err) => {
                reject(new Error(`[ISO8583 TCP] Connection error: ${err.message}`));
            });

            client.on('timeout', () => {
                client.destroy();
                reject(new Error('[ISO8583 TCP] Connection timeout'));
            });
        });
    }

    /**
     * Send raw hex data over TCP
     * @param {string} hexData - Hex string to send
     * @returns {Promise<string>} Raw response
     */
    async sendRawHex(hexData) {
        return new Promise((resolve, reject) => {
            const client = new net.Socket();
            
            client.setTimeout(5000);
            
            client.connect(this.port, this.host, () => {
                console.log(`[ISO8583 TCP] Sending raw hex to ${this.host}:${this.port}`);
                client.write(hexData + '\n');
            });

            let responseData = '';
            
            client.on('data', (data) => {
                responseData += data.toString();
            });

            client.on('end', () => {
                resolve(responseData.trim());
            });

            client.on('error', (err) => {
                reject(new Error(`[ISO8583 TCP] Connection error: ${err.message}`));
            });
        });
    }
}

class ISO8583TCPServer {
    constructor(port = 8000) {
        this.port = port;
        this.server = null;
        this.clients = new Set();
    }

    /**
     * Start ISO8583 TCP listener
     * @param {Function} messageHandler - Callback for received messages
     */
    start(messageHandler) {
        this.server = net.createServer((socket) => {
            const clientInfo = `${socket.remoteAddress}:${socket.remotePort}`;
            console.log(`[ISO8583 Server] Client connected: ${clientInfo}`);
            this.clients.add(socket);

            let buffer = '';

            socket.on('data', (data) => {
                buffer += data.toString();
                
                // Process complete messages (newline-delimited)
                const messages = buffer.split('\n');
                buffer = messages.pop(); // Keep incomplete message in buffer

                messages.forEach((msg) => {
                    if (msg.trim()) {
                        console.log(`[ISO8583 Server] Received from ${clientInfo}: ${msg.trim()}`);
                        
                        try {
                            // Try to parse as ISO8583
                            const parsed = ISO8583Sim.parseMessage(msg.trim());
                            console.log(`[ISO8583 Server] Parsed:`, parsed);

                            // Call message handler
                            if (messageHandler) {
                                const response = messageHandler(parsed, socket);
                                
                                // Send response if provided
                                if (response) {
                                    const responseMsg = typeof response === 'string' 
                                        ? response 
                                        : ISO8583Sim.buildMessage(response);
                                    socket.write(responseMsg + '\n');
                                }
                            }
                        } catch (e) {
                            console.error(`[ISO8583 Server] Parse error:`, e.message);
                            
                            // Send error response
                            if (messageHandler) {
                                const errorResponse = messageHandler({ error: e.message }, socket);
                                if (errorResponse) {
                                    socket.write(errorResponse + '\n');
                                }
                            }
                        }
                    }
                });
            });

            socket.on('end', () => {
                console.log(`[ISO8583 Server] Client disconnected: ${clientInfo}`);
                this.clients.delete(socket);
            });

            socket.on('error', (err) => {
                console.error(`[ISO8583 Server] Socket error: ${err.message}`);
                this.clients.delete(socket);
            });
        });

        this.server.listen(this.port, () => {
            console.log(`\x1b[32m[ISO8583 Server] Listening on port ${this.port}\x1b[0m`);
        });

        this.server.on('error', (err) => {
            console.error(`[ISO8583 Server] Server error: ${err.message}`);
        });
    }

    /**
     * Stop the server
     */
    stop() {
        if (this.server) {
            this.server.close(() => {
                console.log('[ISO8583 Server] Server stopped');
            });
            
            // Close all client connections
            this.clients.forEach((client) => {
                client.destroy();
            });
            this.clients.clear();
        }
    }

    /**
     * Broadcast message to all connected clients
     * @param {string} message - Message to broadcast
     */
    broadcast(message) {
        this.clients.forEach((client) => {
            client.write(message + '\n');
        });
    }
}

/**
 * Convert hex string to binary buffer
 * @param {string} hexStr - Hex string (with or without spaces)
 * @returns {Buffer} Binary buffer
 */
function hexToBinary(hexStr) {
    const cleanHex = hexStr.replace(/\s+/g, '');
    return Buffer.from(cleanHex, 'hex');
}

/**
 * Convert binary buffer to hex string
 * @param {Buffer} buffer - Binary buffer
 * @param {boolean} spaced - Add spaces between bytes
 * @returns {string} Hex string
 */
function binaryToHex(buffer, spaced = false) {
    const hex = buffer.toString('hex').toUpperCase();
    if (spaced) {
        return hex.match(/.{2}/g).join(' ');
    }
    return hex;
}

/**
 * Build ISO8583 message from hex fields (similar to your examples)
 * @param {Object} fields - Field number to value mapping
 * @returns {string} ISO8583 message string
 */
function buildISO8583FromHex(fields) {
    let message = fields.mti || '0800';
    
    // Sort fields by number and append
    const fieldNumbers = Object.keys(fields)
        .filter(k => k !== 'mti')
        .sort();
    
    fieldNumbers.forEach(fieldNum => {
        const value = fields[fieldNum];
        message += `${fieldNum}${value}`;
    });
    
    return message;
}

module.exports = {
    ISO8583TCPClient,
    ISO8583TCPServer,
    hexToBinary,
    binaryToHex,
    buildISO8583FromHex,
    ISO8583Sim
};
