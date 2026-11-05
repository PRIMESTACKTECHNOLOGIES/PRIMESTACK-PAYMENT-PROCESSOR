# ISO8583 TCP Communication Guide

This guide shows multiple ways to send and receive ISO8583 messages with your payment processor.

## 📋 Table of Contents
1. [Quick Start](#quick-start)
2. [Method 1: Terminal Raw Send (Netcat)](#method-1-terminal-raw-send-netcat)
3. [Method 2: Terminal Send (Socat)](#method-2-terminal-send-socat)
4. [Method 3: Node.js TCP Client](#method-3-nodejs-tcp-client)
5. [Method 4: ISO8583 Sniffer/Listener](#method-4-iso8583-snifferlistener)
6. [Method 5: Hex-to-Raw Binary Converter](#method-5-hex-to-raw-binary-converter)
7. [Testing Your Payment Processor](#testing-your-payment-processor)

---

## Quick Start

### Start the ISO8583 TCP Server
```bash
node iso8583-server.js
```

The server will listen on port 8000 by default.

---

## Method 1: Terminal Raw Send (Netcat)

### Windows (PowerShell)
```powershell
# Send hex-encoded ISO8583 message
$message = "08009F0206A000000003179F030600100000000315009F1015840484048404840484049F26105046494E414E4349414C9F4E03000000"
$client = New-Object System.Net.Sockets.TcpClient("127.0.0.1", 8000)
$stream = $client.GetStream()
$bytes = [System.Text.Encoding]::ASCII.GetBytes($message + "`n")
$stream.Write($bytes, 0, $bytes.Length)
Start-Sleep -Seconds 1
$readBuffer = New-Object byte[] 1024
$bytesRead = $stream.Read($readBuffer, 0, 1024)
[System.Text.Encoding]::ASCII.GetString($readBuffer, 0, $bytesRead)
$client.Close()
```

### Linux/macOS (Netcat)
```bash
# Send hex message via netcat
echo -n "08009F0206A000000003179F030600100000000315009F1015840484048404840484049F26105046494E414E4349414C9F4E03000000" | nc -v 127.0.0.1 8000
```

### With spaces in hex (will be cleaned)
```bash
echo -n "0800 9F0206A00000000317 9F03060010000000031500 9F101584048404840484048404 9F26105046494E414E4349414C 9F4E03000000" | tr -d ' ' | nc -v 127.0.0.1 8000
```

---

## Method 2: Terminal Send (Socat)

### Linux/macOS
```bash
# Hex-to-binary via xxd and socat
cat <<EOF | xxd -r -p | socat - TCP:127.0.0.1:8000
08009F0206A000000003179F030600100000000315009F1015840484048404840484049F26105046494E414E4349414C9F4E03000000
EOF
```

### Send and receive response
```bash
echo "08009F0206A00000000317" | socat - TCP:127.0.0.1:8000
```

---

## Method 3: Node.js TCP Client

### Run the example client
```bash
node test-iso8583-tcp.js
```

### Use in your own code
```javascript
const { ISO8583TCPClient } = require('./utils/iso8583tcp');

async function sendPayment() {
    const client = new ISO8583TCPClient('127.0.0.1', 8000);
    
    // Send payment transaction
    const response = await client.sendISO8583({
        mti: '0200',
        cardNumber: '4111111111111111',
        amount: '99.99',
        currencyCode: '840',
        cvv: '123',
        expiry: '12/25'
    });
    
    console.log('Response:', response);
}

sendPayment();
```

### Send raw hex
```javascript
const { ISO8583TCPClient } = require('./utils/iso8583tcp');

async function sendRaw() {
    const client = new ISO8583TCPClient('127.0.0.1', 8000);
    
    const hexMessage = '08009F0206A000000003179F03060010000000031500';
    const response = await client.sendRawHex(hexMessage);
    
    console.log('Raw response:', response);
}

sendRaw();
```

---

## Method 4: ISO8583 Sniffer/Listener

### Start the built-in server
```bash
node iso8583-server.js
```

This will:
- Listen on port 8000
- Parse incoming ISO8583 messages
- Log all received messages
- Send appropriate responses
- Handle multiple concurrent connections

### Custom listener with your own logic
```javascript
const { ISO8583TCPServer } = require('./utils/iso8583tcp');

const server = new ISO8583TCPServer(8000);

const myHandler = (parsedMessage, socket) => {
    console.log('Received:', parsedMessage);
    
    // Your custom logic here
    return {
        mti: '0210',
        '39': '00' // Approved
    };
};

server.start(myHandler);
```

---

## Method 5: Hex-to-Raw Binary Converter

### Using the utility functions
```javascript
const { hexToBinary, binaryToHex } = require('./utils/iso8583tcp');

// Convert hex to binary
const hexStr = '0800 9F0206A00000000317 9F03060010000000031500';
const binary = hexToBinary(hexStr);
console.log('Binary length:', binary.length, 'bytes');

// Convert binary back to hex
const hex = binaryToHex(binary, true); // true = add spaces
console.log('Hex:', hex);
```

### Python equivalent (for reference)
```python
def hex_to_bin(hex_str):
    """Convert hex string to binary blob"""
    return bytes.fromhex(hex_str.replace(" ", ""))

# Usage
hex_str = "0800 9F0206A00000000317"
binary_data = hex_to_bin(hex_str)
print(f"Binary: {binary_data}")
```

---

## Testing Your Payment Processor

### Test 1: Network Management (Ping)
```bash
# Send 0800 message (network management)
echo "08009F0206A00000000317" | nc 127.0.0.1 8000

# Expected response: 0810 with response code 00
```

### Test 2: Financial Transaction
```bash
# Send 0200 message (financial transaction)
echo "02009F0206A00000000317" | nc 127.0.0.1 8000

# Expected response: 0210 with approval
```

### Test 3: Multiple Messages
```bash
# Send multiple messages
(echo "0800"; echo "0200"; echo "0800") | nc 127.0.0.1 8000
```

### Test 4: Using Node.js Client
```bash
node test-iso8583-tcp.js
```

---

## ISO8583 Message Format Reference

### Your Example Message Breakdown
```
0800                                    - MTI (Network Management Request)
9F0206A00000000317                      - Field 9F02: PAN Sequence Number
9F03060010000000031500                  - Field 9F03: Processing Code
9F101584048404840484048404              - Field 9F10: Terminal ID
9F26105046494E414E4349414C              - Field 9F26: Track2 Data
9F4E03000000                            - Field 9F4E: Terminal ID
```

### Common MTI Codes
- `0800` - Network Management Request
- `0810` - Network Management Response
- `0200` - Financial Transaction Request
- `0210` - Financial Transaction Response
- `0400` - Reversal Request
- `0410` - Reversal Response

### Common Fields
- Field 2: Primary Account Number (PAN)
- Field 3: Processing Code
- Field 4: Amount, Transaction
- Field 7: Transmission Date & Time
- Field 11: System Trace Audit Number (STAN)
- Field 39: Response Code
- Field 41: Card Acceptor Terminal ID
- Field 49: Currency Code, Transaction

---

## Troubleshooting

### Connection Refused
```bash
# Check if server is running
netstat -an | grep 8000

# Start the server
node iso8583-server.js
```

### Message Not Parsing
- Ensure hex string is valid
- Check that message format matches ISO8583 standard
- Verify MTI is correct (first 4 characters)

### Timeout
- Server might not be running
- Firewall blocking port 8000
- Network connectivity issues

---

## Advanced Usage

### Load Testing
```bash
# Send 100 messages
for i in {1..100}; do
    echo "08009F0206A00000000317" | nc 127.0.0.1 8000 &
done
wait
```

### Message Logging
```bash
# Log all messages to file
nc -l 8000 > iso8583_messages.log
```

### Binary Mode (for actual binary protocols)
```bash
# Convert hex to binary and send
echo -n "08009F02" | xxd -r -p | nc 127.0.0.1 8000
```

---

## Integration with Payment Processor

Your payment processor already has ISO8583 support! See:
- `utils/isoSim.js` - ISO8583 message builder/parser
- `utils/iso8583tcp.js` - TCP client/server utilities
- `index.js` - Main server with `/api/process-payment` endpoint

### Full Flow Example
```javascript
const { ISO8583TCPClient } = require('./utils/iso8583tcp');

async function processPaymentViaTCP() {
    // 1. Send ISO8583 message via TCP
    const client = new ISO8583TCPClient('127.0.0.1', 8000);
    const isoResponse = await client.sendISO8583({
        mti: '0200',
        cardNumber: '4111111111111111',
        amount: '99.99',
        currencyCode: '840'
    });
    
    // 2. Parse response
    console.log('ISO8583 Response:', isoResponse);
    
    // 3. Process through payment processor API
    const http = require('http');
    const options = {
        hostname: 'localhost',
        port: 6001,
        path: '/api/process-payment',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    };
    
    // Send to payment processor
    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            console.log('Payment Processor Response:', JSON.parse(data));
        });
    });
    
    req.write(JSON.stringify({
        cardNumber: '4111111111111111',
        amount: '99.99',
        currency: 'USD'
    }));
    req.end();
}

processPaymentViaTCP();
```

---

## Resources

- [ISO8583 Wikipedia](https://en.wikipedia.org/wiki/ISO_8583)
- [ISO8583.org](https://www.iso8583.org/)
- Payment Processor Docs: `README.md`
- API Docs: `http://localhost:6001` (when server is running)
