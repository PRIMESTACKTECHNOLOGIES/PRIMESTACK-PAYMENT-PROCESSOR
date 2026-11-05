/**
 * ISO8583 TCP Client Example
 * Demonstrates sending ISO8583 messages to a TCP server
 */

const { ISO8583TCPClient, hexToBinary, buildISO8583FromHex } = require('./utils/iso8583tcp');

async function main() {
    const client = new ISO8583TCPClient('127.0.0.1', 8000);

    console.log('=== ISO8583 TCP Client Examples ===\n');

    // Example 1: Send standard payment transaction
    console.log('1. Sending payment transaction...');
    try {
        const response = await client.sendISO8583({
            mti: '0200',
            cardNumber: '4111111111111111',
            amount: '99.99',
            currencyCode: '840',
            cvv: '123',
            expiry: '12/25'
        });
        console.log('Response:', response);
    } catch (error) {
        console.error('Error:', error.message);
    }

    console.log('\n---\n');

    // Example 2: Send raw hex message (like your netcat example)
    console.log('2. Sending raw hex message...');
    try {
        const hexMessage = '08009F0206A000000003179F030600100000000315009F1015840484048404840484049F26105046494E414E4349414C9F4E03000000';
        const response = await client.sendRawHex(hexMessage);
        console.log('Raw response:', response);
    } catch (error) {
        console.error('Error:', error.message);
    }

    console.log('\n---\n');

    // Example 3: Build ISO8583 from hex fields
    console.log('3. Building ISO8583 from hex fields...');
    const isoMessage = buildISO8583FromHex({
        mti: '0800',
        '9F02': '06A00000000317',
        '9F03': '060010000000031500',
        '9F10': '1584048404840484048404',
        '9F26': '105046494E414E4349414C',
        '9F4E': '03000000'
    });
    console.log('Built message:', isoMessage);

    console.log('\n---\n');

    // Example 4: Convert hex to binary
    console.log('4. Converting hex to binary...');
    const hexStr = '0800 9F0206A00000000317 9F03060010000000031500';
    const binary = hexToBinary(hexStr);
    console.log('Hex:', hexStr);
    console.log('Binary length:', binary.length, 'bytes');
    console.log('Binary (hex):', binary.toString('hex').toUpperCase());
}

main().catch(console.error);
