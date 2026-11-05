/**
 * ISO8583 TCP Server Example
 * Listens for incoming ISO8583 messages and responds
 */

const { ISO8583TCPServer, ISO8583Sim } = require('./utils/iso8583tcp');

// Create server instance
const server = new ISO8583TCPServer(8000);

// Define message handler
const messageHandler = (parsedMessage, socket) => {
    console.log('\n[Handler] Processing message...');
    console.log('[Handler] Parsed:', JSON.stringify(parsedMessage, null, 2));

    // Check if it's an error
    if (parsedMessage.error) {
        console.error('[Handler] Error in message:', parsedMessage.error);
        return 'ERROR: ' + parsedMessage.error;
    }

    // Extract MTI
    const mti = parsedMessage.mti;
    console.log(`[Handler] MTI: ${mti}`);

    // Handle different message types
    if (mti === '0800') {
        // Network management message (heartbeat/ping)
        console.log('[Handler] Network management message received');
        return {
            mti: '0810', // Response to 0800
            '39': '00',   // Response code (success)
            '7': new Date().toISOString().slice(0, 10).replace(/-/g, '') + new Date().toISOString().slice(11, 13) + new Date().toISOString().slice(14, 16) + new Date().toISOString().slice(17, 19) // Transmission date-time
        };
    } else if (mti === '0200') {
        // Financial transaction message
        console.log('[Handler] Financial transaction received');
        
        // Extract card number and amount
        const cardNumber = parsedMessage.fields && parsedMessage.fields['2'];
        const amount = parsedMessage.fields && parsedMessage.fields['4'];
        
        console.log(`[Handler] Card: ${cardNumber}, Amount: ${amount}`);
        
        // Simulate approval
        const responseCode = '00'; // Approved
        const settlementDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        
        return {
            mti: '0210', // Response to 0200
            '2': cardNumber || '4111111111111111',
            '4': amount || '000000001000',
            '11': parsedMessage.fields && parsedMessage.fields['11'] || '000001', // STAN
            '39': responseCode,
            '37': 'REF' + Date.now().toString().slice(-12), // RRN
            '38': 'AUTH' + Math.random().toString(36).substr(2, 6).toUpperCase(), // Authorization code
            '7': settlementDate
        };
    } else {
        console.log(`[Handler] Unknown MTI: ${mti}`);
        return {
            mti: mti.slice(0, 1) + '1' + mti.slice(2), // Convert request to response
            '39': '91', // Invalid message type
            '7': new Date().toISOString().slice(0, 10).replace(/-/g, '')
        };
    }
};

// Start server
console.log('Starting ISO8583 TCP Server on port 8000...');
console.log('Press Ctrl+C to stop\n');

server.start(messageHandler);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down server...');
    server.stop();
    process.exit(0);
});
