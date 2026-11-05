# Merchant API Testing Guide

This guide shows how to test your payment processor with various merchant gateway simulations.

## 📋 Table of Contents
1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Method 1: Node.js Merchant Simulator](#method-1-nodejs-merchant-simulator)
4. [Method 2: Python Merchant Simulator](#method-2-python-merchant-simulator)
5. [Method 3: Your Original Amex Example](#method-3-your-original-amex-example)
6. [Method 4: Custom Header Testing](#method-4-custom-header-testing)
7. [Testing Different Card Types](#testing-different-card-types)
8. [Security Considerations](#security-considerations)

---

## Overview

Your payment processor now supports testing with multiple merchant gateway patterns:

- ✅ **Amex Merchant API** - Spoofed Amex headers and credentials
- ✅ **Visa Merchant API** - Visa gateway simulation
- ✅ **Mastercard Merchant API** - Mastercard gateway simulation  
- ✅ **Generic Gateway** - Universal payment gateway pattern
- ✅ **Custom Headers** - Any custom header combination

---

## Quick Start

### Start Payment Processor
```bash
node index.js
```

### Run Node.js Tests
```bash
node utils/merchantApiSimulator.js
```

### Run Python Tests
```bash
pip install requests
python test-merchant-api.py
```

---

## Method 1: Node.js Merchant Simulator

### Basic Usage
```javascript
const { MerchantAPISimulator } = require('./utils/merchantApiSimulator');

const simulator = new MerchantAPISimulator('http://localhost:6001');

// Test all gateways
const results = await simulator.testAllGateways();
```

### Test Amex Merchant Request
```javascript
const simulator = new MerchantAPISimulator('http://localhost:6001');

const response = await simulator.simulateAmexMerchantRequest({
    merchantId: 'AMX9876543210',
    merchantSecret: '0xdeadbeefcafe',
    clientId: 'FAKE_CLIENT_01',
    amount: '1000.00',
    cardNumber: '340000000000009',
    expiryDate: '12/25',
    cvv: '1234'
});

console.log('Response:', response);
```

### Test Visa Merchant Request
```javascript
const response = await simulator.simulateVisaMerchantRequest({
    merchantId: 'VISA_MCHNT_12345',
    apiKey: 'visa_api_key_1234567890',
    amount: '500.00',
    cardNumber: '4111111111111111',
    expiryDate: '12/25',
    cvv: '123'
});
```

### Test Mastercard Merchant Request
```javascript
const response = await simulator.simulateMastercardMerchantRequest({
    merchantId: 'MC_MCHNT_67890',
    amount: '750.00',
    cardNumber: '5500000000000004'
});
```

---

## Method 2: Python Merchant Simulator

### Basic Usage
```python
from test-merchant-api import MerchantAPISimulator

simulator = MerchantAPISimulator("http://localhost:6001")
results = simulator.test_all_gateways()
```

### Test Amex Merchant Request
```python
from test-merchant-api import MerchantAPISimulator

simulator = MerchantAPISimulator("http://localhost:6001")

response = simulator.simulate_amex_merchant_request({
    'merchant_id': 'AMX9876543210',
    'merchant_secret': '0xdeadbeefcafe',
    'client_id': 'FAKE_CLIENT_01',
    'amount': '1000.00',
    'card_number': '340000000000009',
    'expiry_date': '12/25',
    'cvv': '1234'
})

print(f"Status: {response.status_code}")
print(f"Response: {response.json()}")
```

### Test All Gateways
```python
simulator = MerchantAPISimulator("http://localhost:6001")
results = simulator.test_all_gateways()

for result in results:
    print(f"{result['gateway']}: {'PASS' if result['success'] else 'FAIL'}")
```

---

## Method 3: Your Original Amex Example

### Original Function (Enhanced)
```python
import requests

def fake_amex_merchant_request(url="http://localhost:6001/api/process-payment"):
    headers = {
        # Spoofed HTTP headers for Amex merchant API
        'X-merchant-id': 'AMX9876543210',
        'X-merchant-secret': '0xdeadbeefcafe',
        'X-Amex-Client-ID': 'FAKE_CLIENT_01',
        'X-Authorization': 'MAC id="1234", nonce="abcd1234", signature="xyz123"',
        'API-Key': 'AMERICA_1234567890',
        'Host': 'mchnt-test.authorize.net',
        'Connection': 'close',
        'User-Agent': 'AmexTerminalSimulator/3.2.1'
    }
    
    payload = {
        'cardNumber': '340000000000009',
        'amount': '1000.00',
        'currency': 'USD',
        'expiryDate': '12/25',
        'cvv': '1234',
        'type': 'visa',
        'merchantId': 'FAKE_MERCHANT_01',
        'transactionId': '123456789',
        'paymentMethod': 'credit-card'
    }
    
    response = requests.post(url, headers=headers, json=payload, verify=False)
    return response.text

# Usage
result = fake_amex_merchant_request()
print(result)
```

### What This Demonstrates
1. **Spoofed header format** for Amex API communications
2. **Synthetic transaction structure** with test data
3. **Fake cryptographic credentials** (MAC authentication)
4. **Mock HTTP request signing pattern**

---

## Method 4: Custom Header Testing

### Node.js - Custom Headers
```javascript
const http = require('http');

async function customMerchantRequest() {
    const headers = {
        'X-Custom-Merchant-ID': 'CUSTOM_123',
        'X-Auth-Token': 'my_secret_token',
        'X-Request-Source': 'test-suite',
        'Content-Type': 'application/json'
    };
    
    const payload = {
        cardNumber: '4111111111111111',
        amount: '250.00',
        currency: 'USD',
        expiryDate: '12/25',
        cvv: '123'
    };
    
    const options = {
        hostname: 'localhost',
        port: 6001,
        path: '/api/process-payment',
        method: 'POST',
        headers: headers
    };
    
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        
        req.on('error', reject);
        req.write(JSON.stringify(payload));
        req.end();
    });
}

customMerchantRequest().then(console.log);
```

### Python - Custom Headers
```python
import requests

def custom_merchant_request():
    headers = {
        'X-Custom-Merchant-ID': 'CUSTOM_123',
        'X-Auth-Token': 'my_secret_token',
        'X-Request-Source': 'test-suite'
    }
    
    payload = {
        'cardNumber': '4111111111111111',
        'amount': '250.00',
        'currency': 'USD',
        'expiryDate': '12/25',
        'cvv': '123'
    }
    
    response = requests.post(
        'http://localhost:6001/api/process-payment',
        headers=headers,
        json=payload
    )
    
    return response.json()

result = custom_merchant_request()
print(result)
```

---

## Testing Different Card Types

### Test Card Numbers
| Card Type | Test Number | CVV | Expiry |
|-----------|-------------|-----|--------|
| Visa | 4111111111111111 | 123 | 12/25 |
| Mastercard | 5500000000000004 | 456 | 12/25 |
| Amex | 340000000000009 | 1234 | 12/25 |
| Discover | 6011000000000004 | 789 | 12/25 |

### Test Multiple Card Types
```javascript
const simulator = new MerchantAPISimulator('http://localhost:6001');

const testCards = [
    { type: 'Visa', number: '4111111111111111', cvv: '123' },
    { type: 'Mastercard', number: '5500000000000004', cvv: '456' },
    { type: 'Amex', number: '340000000000009', cvv: '1234' }
];

for (const card of testCards) {
    console.log(`\nTesting ${card.type}...`);
    const response = await simulator.simulateAmexMerchantRequest({
        cardNumber: card.number,
        cvv: card.cvv,
        amount: '100.00'
    });
    console.log(`Result: ${response.body.success ? '✓ Approved' : '✗ Declined'}`);
}
```

---

## Security Considerations

### ⚠️ Important Notes

1. **Fake Credentials Only**
   - All API keys and secrets in this guide are FAKE
   - Never use real credentials in test environments
   - These patterns are for TESTING ONLY

2. **Header Spoofing**
   - Header spoofing in production is ILLEGAL
   - Only use in isolated test environments
   - Real payment gateways require proper authentication

3. **Test Data**
   - Use only test card numbers
   - Never process real card data in test mode
   - Comply with PCI-DSS requirements

### Security Headers Used

```javascript
// Example: MAC Authentication (Message Authentication Code)
'X-Authorization': 'MAC id="1234", nonce="abcd1234", signature="xyz123"'

// Components:
// - id: Client identifier
// - nonce: Unique request identifier (prevents replay attacks)
// - signature: HMAC signature of request
```

---

## Advanced Usage

### Load Testing
```javascript
const simulator = new MerchantAPISimulator('http://localhost:6001');

// Send 100 concurrent requests
const promises = [];
for (let i = 0; i < 100; i++) {
    promises.push(simulator.simulateAmexMerchantRequest({
        amount: (Math.random() * 1000).toFixed(2),
        transactionId: `TXN_${i}`
    }));
}

const results = await Promise.all(promises);
console.log(`Completed ${results.length} transactions`);
```

### Custom Amount Testing
```javascript
const amounts = ['0.01', '1.00', '10.00', '100.00', '1000.00', '4999.99', '5000.00', '5000.01'];

for (const amount of amounts) {
    const response = await simulator.simulateVisaMerchantRequest({ amount });
    console.log(`Amount $${amount}: ${response.body.success ? '✓' : '✗'}`);
}
```

### Error Testing
```javascript
// Test with invalid card
try {
    const response = await simulator.simulateAmexMerchantRequest({
        cardNumber: '1234567890123456', // Invalid
        amount: '100.00'
    });
    console.log('Response:', response);
} catch (error) {
    console.log('Expected error:', error.message);
}
```

---

## Troubleshooting

### Connection Refused
```bash
# Check if payment processor is running
curl http://localhost:6001/api/process-payment

# Start the server
node index.js
```

### Python Requests Error
```bash
# Install requests library
pip install requests

# Or with pip3
pip3 install requests
```

### Invalid Response
- Verify card numbers are valid test cards
- Check amount format (string with 2 decimals)
- Ensure expiry date format is MM/YY

---

## Integration with Payment Processor

Your payment processor automatically:
- ✅ Validates card numbers (Luhn algorithm)
- ✅ Detects card type (Visa, MC, Amex, Discover)
- ✅ Masks card numbers in logs
- ✅ Encrypts sensitive data
- ✅ Logs audit trails
- ✅ Processes through mock acquirer
- ✅ Returns standardized responses

### Example Response
```json
{
  "success": true,
  "message": "Success",
  "transactionId": "TXN_1234567890123",
  "status": "Approved",
  "processingTimeMs": 350,
  "gpuProcessed": false
}
```

---

## Resources

- Payment Processor: `index.js`
- Merchant Simulator: `utils/merchantApiSimulator.js`
- Python Tests: `test-merchant-api.py`
- ISO8583 TCP Guide: `ISO8583_TCP_GUIDE.md`
- API Endpoint: `http://localhost:6001/api/process-payment`
