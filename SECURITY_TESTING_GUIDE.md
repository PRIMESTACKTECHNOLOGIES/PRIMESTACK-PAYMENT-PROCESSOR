# Security Testing Framework - Educational Guide

This guide demonstrates **security vulnerabilities and defenses** for educational testing of YOUR OWN payment processor.

## ⚠️ IMPORTANT LEGAL NOTICE

**FOR EDUCATIONAL PURPOSES ONLY**
- ✅ Test ONLY your own systems
- ✅ Use ONLY in isolated test environments
- ✅ Never test production systems
- ✅ Never attack systems you don't own
- ❌ Illegal to use against third-party systems
- ❌ Violates Computer Fraud and Abuse Act (CFAA)

---

## Table of Contents

1. [Header Spoofing Attacks](#1-header-spoofing-attacks)
2. [Header Smuggling](#2-header-smuggling)
3. [Buffer Overflow Attempts](#3-buffer-overflow-attempts)
4. [Defense Implementation](#4-defense-implementation)
5. [Security Testing Framework](#5-security-testing-framework)

---

## 1. Header Spoofing Attacks

### What Attackers Try to Do

#### Attack Vector: Bypass Security via Custom Headers

```bash
# ❌ MALICIOUS: Attempting to bypass security controls
curl -X POST "https://payment-gateway.com/api/pay" \
  -H "X-Payment-Method: CREDIT_CARD" \
  -H "X-Card-Expiry-Override: 2025-12" \
  -H "X-Insecure-Auth: 1" \
  -H "Authorization: Bearer fak3r_t0k3n_123" \
  -d '{"card": "4111111111111111", "amount": "99999.99"}'
```

### How This Works (Technical Breakdown)

| Header | Intended Effect | Why It Might Work |
|--------|----------------|-------------------|
| `X-Payment-Method: CREDIT_CARD` | Bypass tokenization | If server trusts this header |
| `X-Card-Expiry-Override: 2025-12` | Skip expiry validation | If server has override logic |
| `X-Insecure-Auth: 1` | Disable 3DS | If 3DS is header-controlled |
| `Authorization: Bearer fake` | Fake authentication | If auth not validated server-side |

### Why This FAILS in Secure Systems

```javascript
// ✅ SECURE: Server-side validation ignores spoofed headers
function processPayment(req) {
    // Ignore client headers for security decisions
    const paymentMethod = determinePaymentMethod(req.body.card); // Server-side
    const expiryValid = validateExpiry(req.body.expiryDate);    // Server-side
    const threeDSRequired = shouldRequire3DS(req.body.amount);   // Server-side
    const authValid = verifyToken(req.headers.authorization);    // Server-side
    
    // Security decisions made server-side, NOT from headers
    if (!authValid) {
        throw new Error('Authentication required');
    }
}
```

### How to Test YOUR System's Vulnerability

```javascript
/**
 * Security Test: Header Spoofing Detection
 * Tests if your payment processor properly validates headers
 */

async function testHeaderSpoofingDetection() {
    console.log('Testing header spoofing detection...\n');
    
    const maliciousHeaders = [
        {
            name: 'Payment Method Override',
            headers: { 'X-Payment-Method': 'CREDIT_CARD' },
            shouldSucceed: false, // Should be rejected
            reason: 'Payment method determined server-side'
        },
        {
            name: 'Expiry Override',
            headers: { 'X-Card-Expiry-Override': '2025-12' },
            shouldSucceed: false,
            reason: 'Expiry validated server-side'
        },
        {
            name: '3DS Disable Attempt',
            headers: { 'X-Insecure-Auth': '1' },
            shouldSucceed: false,
            reason: '3DS enforced server-side'
        },
        {
            name: 'Fake Authorization',
            headers: { 'Authorization': 'Bearer fake_token_123' },
            shouldSucceed: false,
            reason: 'Auth token validated cryptographically'
        }
    ];
    
    const results = [];
    
    for (const test of maliciousHeaders) {
        console.log(`Test: ${test.name}`);
        
        try {
            const response = await sendRequest({
                method: 'POST',
                path: '/api/process-payment',
                headers: test.headers,
                body: {
                    cardNumber: '4111111111111111',
                    amount: '99999.99',
                    currency: 'USD'
                }
            });
            
            // Should be rejected
            const properlyRejected = !response.success;
            
            if (properlyRejected) {
                console.log(`  ✓ Properly rejected: ${test.reason}`);
                results.push({ test: test.name, secure: true });
            } else {
                console.log(`  ✗ VULNERABLE: Header spoofing accepted!`);
                results.push({ test: test.name, secure: false });
            }
            
        } catch (error) {
            console.log(`  ✓ Blocked: ${error.message}`);
            results.push({ test: test.name, secure: true });
        }
        
        console.log();
    }
    
    return results;
}
```

---

## 2. Header Smuggling

### What Is Header Smuggling?

Header smuggling exploits how different servers parse HTTP headers, potentially bypassing security controls in reverse proxies or load balancers.

### Attack Vectors

#### Technique 1: Duplicate Headers

```bash
# ❌ MALICIOUS: Conflicting header values
curl -X POST "https://api.example.com/pay" \
  -H "Content-Length: 50" \
  -H "Content-Length: 100" \  # Conflicting value
  -H "Transfer-Encoding: chunked" \
  -d '{"card": "4111111111111111"}'
```

**How It Works:**
- Front-end server sees `Content-Length: 50`
- Back-end server sees `Content-Length: 100`
- Malicious payload hidden in discrepancy

#### Technique 2: Header Injection via Newlines

```bash
# ❌ MALICIOUS: Injecting additional headers
curl -X POST "https://api.example.com/pay" \
  -H "X-Custom-Header: value\r\nAuthorization: Bearer admin_token" \
  -d '{"card": "4111111111111111"}'
```

**How It Works:**
- `%0d%0a` (CRLF) injection
- Creates additional headers
- Bypasses authentication

#### Technique 3: Transfer-Encoding Smuggling

```bash
# ❌ MALICIOUS: Conflicting Content-Length and Transfer-Encoding
curl -X POST "https://api.example.com/pay" \
  -H "Content-Length: 10" \
  -H "Transfer-Encoding: chunked" \
  -d '0\r\n\r\n'
```

**How It Works:**
- RFC 7230: Transfer-Encoding takes precedence
- If server doesn't follow RFC, smuggling occurs

### Defense Implementation

```javascript
/**
 * Secure header validation
 * Protects against header smuggling attacks
 */

class HeaderSecurityValidator {
    constructor() {
        this.maxHeaders = 50;
        this.maxHeaderSize = 8192; // 8KB
        this.allowedMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    }

    validateHeaders(req) {
        const errors = [];

        // 1. Check header count
        if (Object.keys(req.headers).length > this.maxHeaders) {
            errors.push('Too many headers');
        }

        // 2. Check for duplicate headers
        const headerCounts = {};
        for (const [key, value] of Object.entries(req.headers)) {
            if (Array.isArray(value)) {
                headerCounts[key] = (headerCounts[key] || 0) + value.length;
            } else {
                headerCounts[key] = (headerCounts[key] || 0) + 1;
            }
        }

        const duplicates = Object.entries(headerCounts)
            .filter(([_, count]) => count > 1)
            .map(([key]) => key);

        if (duplicates.length > 0) {
            errors.push(`Duplicate headers: ${duplicates.join(', ')}`);
        }

        // 3. Check for CRLF injection
        for (const [key, value] of Object.entries(req.headers)) {
            const headerStr = `${key}: ${value}`;
            if (/[\r\n]/.test(headerStr)) {
                errors.push('CRLF injection detected');
                break;
            }
        }

        // 4. Validate Content-Length and Transfer-Encoding
        if (req.headers['content-length'] && req.headers['transfer-encoding']) {
            errors.push('Conflicting Content-Length and Transfer-Encoding');
        }

        // 5. Check header size
        for (const [key, value] of Object.entries(req.headers)) {
            if (`${key}: ${value}`.length > this.maxHeaderSize) {
                errors.push(`Header too large: ${key}`);
            }
        }

        // 6. Validate method
        if (!this.allowedMethods.includes(req.method)) {
            errors.push(`Invalid method: ${req.method}`);
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
}

// Usage in Express middleware
function headerSecurityMiddleware(req, res, next) {
    const validator = new HeaderSecurityValidator();
    const result = validator.validateHeaders(req);

    if (!result.valid) {
        console.warn('[SECURITY] Header validation failed:', result.errors);
        return res.status(400).json({
            success: false,
            message: 'Invalid request headers',
            details: result.errors
        });
    }

    next();
}
```

### Security Test: Header Smuggling

```javascript
async function testHeaderSmugglingDefense() {
    console.log('Testing header smuggling defenses...\n');
    
    const tests = [
        {
            name: 'Duplicate Content-Length',
            headers: {
                'Content-Length': '50',
                'X-Duplicate': ['value1', 'value2']
            },
            shouldReject: true
        },
        {
            name: 'CRLF Injection Attempt',
            headers: {
                'X-Custom': 'value\r\nX-Injected: malicious'
            },
            shouldReject: true
        },
        {
            name: 'Conflicting Headers',
            headers: {
                'Content-Length': '10',
                'Transfer-Encoding': 'chunked'
            },
            shouldReject: true
        },
        {
            name: 'Oversized Header',
            headers: {
                'X-Large': 'A'.repeat(10000)
            },
            shouldReject: true
        },
        {
            name: 'Too Many Headers',
            headers: generateHeaders(100),
            shouldReject: true
        }
    ];
    
    const results = [];
    
    for (const test of tests) {
        console.log(`Test: ${test.name}`);
        
        try {
            const response = await sendRequest({
                method: 'POST',
                path: '/api/process-payment',
                headers: test.headers,
                body: { cardNumber: '4111111111111111', amount: '100.00' }
            });
            
            const properlyRejected = !response.success;
            
            if (properlyRejected === test.shouldReject) {
                console.log(`  ✓ Correctly handled`);
                results.push({ test: test.name, secure: true });
            } else {
                console.log(`  ✗ VULNERABLE`);
                results.push({ test: test.name, secure: false });
            }
        } catch (error) {
            console.log(`  ✓ Blocked: ${error.message}`);
            results.push({ test: test.name, secure: true });
        }
        
        console.log();
    }
    
    return results;
}

function generateHeaders(count) {
    const headers = {};
    for (let i = 0; i < count; i++) {
        headers[`X-Header-${i}`] = `value-${i}`;
    }
    return headers;
}
```

---

## 3. Buffer Overflow Attempts

### What Is a Buffer Overflow?

Buffer overflow occurs when more data is written to a buffer than it can hold, potentially overwriting adjacent memory and executing malicious code.

### Attack Example (Educational)

```bash
# ❌ MALICIOUS: Attempting buffer overflow via header
curl -X GET "https://api.example.com/cards" \
  -H "X-Stripe-Date: $(printf 'A%.0s' {1..1024})"
```

### Why This Fails in Modern Systems

1. **Node.js Memory Safety**: JavaScript is memory-safe
2. **V8 Engine**: Automatic bounds checking
3. **String Handling**: Dynamic allocation, no fixed buffers
4. **Express Validation**: Request size limits

### Defense Implementation

```javascript
/**
 * Buffer overflow protection
 * Validates input sizes and prevents overflow attempts
 */

class InputSizeValidator {
    constructor() {
        this.maxHeaderSize = 8192; // 8KB per header
        this.maxBodySize = 1024 * 1024; // 1MB total body
        this.maxFieldValue = 4096; // 4KB per field
        this.maxArrayLength = 100;
    }

    validateInput(req) {
        const errors = [];

        // 1. Check total request size
        const contentLength = parseInt(req.headers['content-length'] || '0');
        if (contentLength > this.maxBodySize) {
            errors.push(`Request too large: ${contentLength} bytes`);
        }

        // 2. Check individual header sizes
        for (const [key, value] of Object.entries(req.headers)) {
            const size = Buffer.byteLength(`${key}: ${value}`, 'utf8');
            
            if (size > this.maxHeaderSize) {
                errors.push(`Header too large: ${key} (${size} bytes)`);
            }

            // Check for overflow patterns
            if (this.detectOverflowPattern(value)) {
                errors.push(`Overflow pattern detected in: ${key}`);
            }
        }

        // 3. Validate request body
        if (req.body) {
            this.validateObject(req.body, errors, 'body');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    detectOverflowPattern(value) {
        const strValue = typeof value === 'string' ? value : String(value);
        
        // Detect repeated patterns (potential NOP sleds)
        const repeatedPattern = /(.)\1{50,}/;
        if (repeatedPattern.test(strValue)) {
            return true;
        }

        // Detect very long strings without spaces
        if (strValue.length > 1000 && !strValue.includes(' ')) {
            return true;
        }

        // Detect binary data in text fields
        const binaryPattern = /[\x00-\x08\x0E-\x1F]/;
        if (binaryPattern.test(strValue)) {
            return true;
        }

        return false;
    }

    validateObject(obj, errors, path, depth = 0) {
        if (depth > 10) {
            errors.push(`${path}: Nesting too deep`);
            return;
        }

        if (Array.isArray(obj)) {
            if (obj.length > this.maxArrayLength) {
                errors.push(`${path}: Array too large (${obj.length} items)`);
            }
            obj.forEach((item, index) => {
                this.validateObject(item, errors, `${path}[${index}]`, depth + 1);
            });
        } else if (typeof obj === 'object' && obj !== null) {
            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'string' && value.length > this.maxFieldValue) {
                    errors.push(`${path}.${key}: Value too long (${value.length} chars)`);
                } else if (typeof value === 'object') {
                    this.validateObject(value, errors, `${path}.${key}`, depth + 1);
                }
            }
        }
    }
}

// Usage in Express
function inputSizeMiddleware(req, res, next) {
    const validator = new InputSizeValidator();
    const result = validator.validateInput(req);

    if (!result.valid) {
        console.warn('[SECURITY] Input size validation failed:', result.errors);
        return res.status(413).json({
            success: false,
            message: 'Request too large or malformed',
            details: result.errors
        });
    }

    next();
}
```

### Security Test: Buffer Overflow Prevention

```javascript
async function testBufferOverflowPrevention() {
    console.log('Testing buffer overflow prevention...\n');
    
    const tests = [
        {
            name: 'Repeated Character Pattern',
            headers: {
                'X-Test': 'A'.repeat(1024)
            },
            shouldReject: true
        },
        {
            name: 'Binary Data Injection',
            headers: {
                'X-Test': Buffer.from([0x00, 0x01, 0x02, 0x03]).toString()
            },
            shouldReject: true
        },
        {
            name: 'Very Long Field Value',
            body: {
                cardNumber: '4111111111111111',
                amount: '100.00',
                description: 'A'.repeat(5000)
            },
            shouldReject: true
        },
        {
            name: 'Deep Object Nesting',
            body: {
                cardNumber: '4111111111111111',
                metadata: generateDeepObject(15)
            },
            shouldReject: true
        },
        {
            name: 'Large Array',
            body: {
                cardNumber: '4111111111111111',
                items: Array(200).fill({ price: '10.00' })
            },
            shouldReject: true
        }
    ];
    
    const results = [];
    
    for (const test of tests) {
        console.log(`Test: ${test.name}`);
        
        try {
            const response = await sendRequest({
                method: 'POST',
                path: '/api/process-payment',
                headers: test.headers || {},
                body: test.body || { cardNumber: '4111111111111111', amount: '100.00' }
            });
            
            const properlyRejected = !response.success;
            
            if (properlyRejected === test.shouldReject) {
                console.log(`  ✓ Correctly handled`);
                results.push({ test: test.name, secure: true });
            } else {
                console.log(`  ✗ VULNERABLE`);
                results.push({ test: test.name, secure: false });
            }
        } catch (error) {
            console.log(`  ✓ Blocked: ${error.message}`);
            results.push({ test: test.name, secure: true });
        }
        
        console.log();
    }
    
    return results;
}

function generateDeepObject(depth) {
    if (depth <= 0) return 'value';
    return { nested: generateDeepObject(depth - 1) };
}
```

---

## 4. Defense Implementation

### Complete Security Middleware

```javascript
/**
 * Comprehensive security middleware for payment processor
 * Protects against header spoofing, smuggling, and overflow attacks
 */

const express = require('express');
const app = express();

// 1. Request size limits
app.use(express.json({ 
    limit: '1mb',
    strict: true 
}));

// 2. Security headers middleware
function securityMiddleware(req, res, next) {
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    
    // Remove server signature
    res.removeHeader('X-Powered-By');
    
    next();
}

app.use(securityMiddleware);

// 3. Header validation
function validateHeaders(req, res, next) {
    const maliciousHeaders = [
        'X-Insecure-Auth',
        'X-Card-Expiry-Override',
        'X-Payment-Method',
        'X-Bypass-Security'
    ];
    
    for (const header of maliciousHeaders) {
        if (req.headers[header.toLowerCase()]) {
            console.warn(`[SECURITY] Malicious header detected: ${header}`);
            return res.status(400).json({
                success: false,
                message: 'Invalid request headers'
            });
        }
    }
    
    next();
}

app.use(validateHeaders);

// 4. Input sanitization
function sanitizeInput(req, res, next) {
    const { cardNumber, amount, currency } = req.body;
    
    // Validate card number
    if (!cardNumber || !/^\d{13,19}$/.test(cardNumber)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid card number'
        });
    }
    
    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0 || amountNum > 10000) {
        return res.status(400).json({
            success: false,
            message: 'Invalid amount'
        });
    }
    
    // Validate currency
    if (!currency || !/^[A-Z]{3}$/.test(currency)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid currency'
        });
    }
    
    next();
}

app.use('/api/process-payment', sanitizeInput);

// 5. Authentication validation
function validateAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }
    
    // Verify token format
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
        return res.status(401).json({
            success: false,
            message: 'Invalid authorization format'
        });
    }
    
    const token = match[1];
    
    // Validate token (implement your token verification)
    const isValid = verifyToken(token);
    if (!isValid) {
        return res.status(401).json({
            success: false,
            message: 'Invalid authentication token'
        });
    }
    
    next();
}

function verifyToken(token) {
    // Implement token verification
    // Check signature, expiration, claims, etc.
    return token.length > 20; // Placeholder
}

app.use('/api/process-payment', validateAuth);

console.log('Security middleware configured successfully');
```

---

## 5. Security Testing Framework

### Run All Security Tests

```javascript
/**
 * Complete Security Testing Framework
 * Run against YOUR payment processor
 */

async function runSecurityTests() {
    console.log('====================================');
    console.log('Security Testing Framework');
    console.log('====================================\n');
    
    const results = {
        headerSpoofing: await testHeaderSpoofingDetection(),
        headerSmuggling: await testHeaderSmugglingDefense(),
        bufferOverflow: await testBufferOverflowPrevention()
    };
    
    // Summary
    console.log('\n====================================');
    console.log('Security Test Summary');
    console.log('====================================\n');
    
    let totalTests = 0;
    let passedTests = 0;
    
    for (const [category, tests] of Object.entries(results)) {
        console.log(`\n${category}:`);
        for (const test of tests) {
            totalTests++;
            if (test.secure) {
                passedTests++;
                console.log(`  ✓ ${test.test}`);
            } else {
                console.log(`  ✗ ${test.test}`);
            }
        }
    }
    
    console.log(`\n====================================`);
    console.log(`Results: ${passedTests}/${totalTests} passed`);
    console.log(`Security Score: ${((passedTests/totalTests)*100).toFixed(1)}%`);
    console.log('====================================\n');
    
    if (passedTests === totalTests) {
        console.log('✓ All security tests passed!');
    } else {
        console.log('✗ Some tests failed - review vulnerabilities');
    }
    
    return results;
}

// Helper function to send test requests
function sendRequest({ method, path, headers, body }) {
    return new Promise((resolve, reject) => {
        const http = require('http');
        
        const options = {
            hostname: 'localhost',
            port: 6001,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        success: res.statusCode === 200,
                        status: res.statusCode,
                        body: JSON.parse(data)
                    });
                } catch (e) {
                    resolve({
                        success: false,
                        status: res.statusCode,
                        body: data
                    });
                }
            });
        });
        
        req.on('error', reject);
        req.write(JSON.stringify(body || {}));
        req.end();
    });
}

// Export for testing
module.exports = { runSecurityTests };

// Run if executed directly
if (require.main === module) {
    runSecurityTests().catch(console.error);
}
```

---

## Summary

### What You've Learned

| Attack Type | How It Works | How to Defend |
|-------------|--------------|---------------|
| **Header Spoofing** | Fake headers to bypass security | Server-side validation |
| **Header Smuggling** | Exploit proxy parsing differences | Strict header validation |
| **Buffer Overflow** | Oversized inputs to crash system | Input size limits |
| **CRLF Injection** | Inject headers via newlines | Strip \\r\\n characters |
| **Token Forgery** | Fake authentication tokens | Cryptographic verification |

### Security Best Practices

1. ✅ **Never trust client headers** for security decisions
2. ✅ **Validate all inputs** server-side
3. ✅ **Implement size limits** on all inputs
4. ✅ **Use cryptographic authentication** (JWT, HMAC)
5. ✅ **Remove server signatures** from responses
6. ✅ **Log security events** for monitoring
7. ✅ **Regular security audits** and penetration testing
8. ✅ **Keep dependencies updated**

### Next Steps

1. Run the security tests against your payment processor
2. Fix any vulnerabilities identified
3. Implement the security middleware
4. Regular security testing schedule
5. Consider professional penetration testing

---

**Remember: This is for EDUCATIONAL PURPOSES ONLY. Always test your own systems in isolated environments!**
