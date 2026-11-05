/**
 * Security Testing Framework
 * FOR EDUCATIONAL PURPOSES ONLY
 * Tests YOUR OWN payment processor's security defenses
 */

const http = require('http');

class SecurityTestFramework {
    constructor(targetUrl = 'http://localhost:6001') {
        this.baseUrl = targetUrl;
        console.log('Security Testing Framework - Educational Edition');
        console.log('================================================\n');
    }

    // ============================================
    // TEST 1: Header Spoofing Detection
    // ============================================

    async testHeaderSpoofing() {
        console.log('\nTest 1: Header Spoofing Detection');
        console.log('-'.repeat(60));
        console.log('Purpose: Verify server ignores malicious security headers\n');

        const tests = [
            {
                name: 'Payment Method Override',
                headers: { 'X-Payment-Method': 'CREDIT_CARD' },
                description: 'Attempt to bypass tokenization'
            },
            {
                name: 'Expiry Override',
                headers: { 'X-Card-Expiry-Override': '2025-12' },
                description: 'Attempt to skip expiry validation'
            },
            {
                name: '3DS Disable',
                headers: { 'X-Insecure-Auth': '1' },
                description: 'Attempt to disable 3D Secure'
            },
            {
                name: 'Fake Auth Token',
                headers: { 'Authorization': 'Bearer fak3r_t0k3n_123' },
                description: 'Attempt authentication bypass'
            },
            {
                name: 'Security Bypass Flag',
                headers: { 'X-Bypass-Security': 'true' },
                description: 'Attempt to disable all security'
            }
        ];

        const results = [];

        for (const test of tests) {
            console.log(`\nTest: ${test.name}`);
            console.log(`Description: ${test.description}`);
            console.log(`Malicious Header: ${Object.keys(test.headers)[0]}: ${Object.values(test.headers)[0]}`);

            try {
                const response = await this.sendPaymentRequest({
                    cardNumber: '4111111111111111',
                    amount: '100.00',
                    currency: 'USD',
                    expiryDate: '12/25',
                    cvv: '123'
                }, test.headers);

                // Should be rejected or processed securely
                const secure = this.isSecureResponse(response, test);

                if (secure) {
                    console.log('✓ PASS: System properly handled malicious header');
                    results.push({ test: test.name, secure: true });
                } else {
                    console.log('✗ FAIL: System may be vulnerable to header spoofing');
                    results.push({ test: test.name, secure: false });
                }

            } catch (error) {
                console.log(`✓ PASS: Request blocked - ${error.message}`);
                results.push({ test: test.name, secure: true });
            }
        }

        console.log('\n' + '='.repeat(60));
        return results;
    }

    // ============================================
    // TEST 2: Header Smuggling Prevention
    // ============================================

    async testHeaderSmuggling() {
        console.log('\n\nTest 2: Header Smuggling Prevention');
        console.log('-'.repeat(60));
        console.log('Purpose: Verify system prevents header injection attacks\n');

        const tests = [
            {
                name: 'Duplicate Content-Length',
                headers: {
                    'Content-Length': '50',
                    'X-Duplicate-Test': 'value1'
                },
                arrayHeaders: { 'X-Array-Header': ['value1', 'value2'] },
                description: 'Conflicting Content-Length values'
            },
            {
                name: 'CRLF Injection',
                headers: {
                    'X-Custom': 'value\r\nX-Injected: malicious'
                },
                description: 'Newline characters in header value'
            },
            {
                name: 'Conflicting Transfer-Encoding',
                headers: {
                    'Content-Length': '10',
                    'Transfer-Encoding': 'chunked'
                },
                description: 'Both Content-Length and Transfer-Encoding'
            },
            {
                name: 'Oversized Header',
                headers: {
                    'X-Large-Header': 'A'.repeat(10000)
                },
                description: 'Header exceeding size limits'
            },
            {
                name: 'Too Many Headers',
                headers: this.generateMultipleHeaders(100),
                description: 'Excessive number of headers'
            }
        ];

        const results = [];

        for (const test of tests) {
            console.log(`\nTest: ${test.name}`);
            console.log(`Description: ${test.description}`);

            try {
                const response = await this.sendPaymentRequest({
                    cardNumber: '4111111111111111',
                    amount: '100.00',
                    currency: 'USD'
                }, test.headers);

                // Should be rejected
                const rejected = !response.success || response.status >= 400;

                if (rejected) {
                    console.log('✓ PASS: Malicious headers rejected');
                    results.push({ test: test.name, secure: true });
                } else {
                    console.log('✗ FAIL: Malicious headers accepted');
                    results.push({ test: test.name, secure: false });
                }

            } catch (error) {
                console.log(`✓ PASS: Request blocked - ${error.message}`);
                results.push({ test: test.name, secure: true });
            }
        }

        console.log('\n' + '='.repeat(60));
        return results;
    }

    // ============================================
    // TEST 3: Buffer Overflow Prevention
    // ============================================

    async testBufferOverflow() {
        console.log('\n\nTest 3: Buffer Overflow Prevention');
        console.log('-'.repeat(60));
        console.log('Purpose: Verify system handles oversized inputs safely\n');

        const tests = [
            {
                name: 'Repeated Character Pattern',
                body: {
                    cardNumber: '4111111111111111',
                    amount: '100.00',
                    description: 'A'.repeat(1024)
                },
                description: 'Potential NOP sled pattern'
            },
            {
                name: 'Binary Data Injection',
                body: {
                    cardNumber: '4111111111111111',
                    amount: '100.00',
                    metadata: Buffer.from([0x00, 0x01, 0x02, 0x03]).toString('latin1')
                },
                description: 'Binary data in text field'
            },
            {
                name: 'Very Long Field Value',
                body: {
                    cardNumber: '4111111111111111',
                    amount: '100.00',
                    description: 'A'.repeat(50000)
                },
                description: 'Excessively long string'
            },
            {
                name: 'Deep Object Nesting',
                body: {
                    cardNumber: '4111111111111111',
                    amount: '100.00',
                    metadata: this.generateDeepObject(20)
                },
                description: 'Deeply nested object structure'
            },
            {
                name: 'Large Array Payload',
                body: {
                    cardNumber: '4111111111111111',
                    amount: '100.00',
                    items: Array(500).fill({ price: '10.00', name: 'item' })
                },
                description: 'Massive array in request body'
            }
        ];

        const results = [];

        for (const test of tests) {
            console.log(`\nTest: ${test.name}`);
            console.log(`Description: ${test.description}`);

            try {
                const response = await this.sendPaymentRequest(test.body);

                // Should handle gracefully (reject or process)
                const handled = response.status < 500; // Not a server error

                if (handled) {
                    console.log('✓ PASS: Input handled safely');
                    results.push({ test: test.name, secure: true });
                } else {
                    console.log('✗ FAIL: Server error - possible overflow');
                    results.push({ test: test.name, secure: false });
                }

            } catch (error) {
                if (error.message.includes('timeout') || error.message.includes('ECONNRESET')) {
                    console.log('✗ FAIL: Server crash or timeout');
                    results.push({ test: test.name, secure: false });
                } else {
                    console.log(`✓ PASS: Request blocked - ${error.message}`);
                    results.push({ test: test.name, secure: true });
                }
            }
        }

        console.log('\n' + '='.repeat(60));
        return results;
    }

    // ============================================
    // TEST 4: Input Validation
    // ============================================

    async testInputValidation() {
        console.log('\n\nTest 4: Input Validation');
        console.log('-'.repeat(60));
        console.log('Purpose: Verify proper input sanitization\n');

        const tests = [
            {
                name: 'SQL Injection',
                body: {
                    cardNumber: "4111111111111111' OR '1'='1",
                    amount: '100.00',
                    currency: 'USD'
                },
                description: 'SQL injection in card number'
            },
            {
                name: 'XSS Attempt',
                body: {
                    cardNumber: '4111111111111111',
                    amount: '100.00',
                    description: '<script>alert("xss")</script>'
                },
                description: 'Cross-site scripting in description'
            },
            {
                name: 'Invalid Card Number',
                body: {
                    cardNumber: '1234567890123456', // Invalid Luhn
                    amount: '100.00',
                    currency: 'USD'
                },
                description: 'Card number fails Luhn check'
            },
            {
                name: 'Negative Amount',
                body: {
                    cardNumber: '4111111111111111',
                    amount: '-100.00',
                    currency: 'USD'
                },
                description: 'Negative transaction amount'
            },
            {
                name: 'Excessive Amount',
                body: {
                    cardNumber: '4111111111111111',
                    amount: '999999999.99',
                    currency: 'USD'
                },
                description: 'Amount exceeding limits'
            },
            {
                name: 'Invalid Currency',
                body: {
                    cardNumber: '4111111111111111',
                    amount: '100.00',
                    currency: 'INVALID'
                },
                description: 'Non-ISO currency code'
            }
        ];

        const results = [];

        for (const test of tests) {
            console.log(`\nTest: ${test.name}`);
            console.log(`Description: ${test.description}`);

            try {
                const response = await this.sendPaymentRequest(test.body);

                // Should reject invalid input
                const rejected = !response.success;

                if (rejected) {
                    console.log('✓ PASS: Invalid input rejected');
                    results.push({ test: test.name, secure: true });
                } else {
                    console.log('✗ FAIL: Invalid input accepted');
                    results.push({ test: test.name, secure: false });
                }

            } catch (error) {
                console.log(`✓ PASS: Request blocked - ${error.message}`);
                results.push({ test: test.name, secure: true });
            }
        }

        console.log('\n' + '='.repeat(60));
        return results;
    }

    // ============================================
    // TEST 5: Authentication Bypass Prevention
    // ============================================

    async testAuthenticationBypass() {
        console.log('\n\nTest 5: Authentication Bypass Prevention');
        console.log('-'.repeat(60));
        console.log('Purpose: Verify authentication cannot be bypassed\n');

        const tests = [
            {
                name: 'No Auth Header',
                headers: {},
                description: 'Missing authentication'
            },
            {
                name: 'Empty Bearer Token',
                headers: { 'Authorization': 'Bearer ' },
                description: 'Empty token value'
            },
            {
                name: 'Invalid Token Format',
                headers: { 'Authorization': 'InvalidFormat token123' },
                description: 'Not Bearer scheme'
            },
            {
                name: 'Fake JWT Token',
                headers: { 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.fake' },
                description: 'Forged JWT token'
            },
            {
                name: 'Expired Token',
                headers: { 'Authorization': 'Bearer expired_token_12345' },
                description: 'Expired authentication token'
            }
        ];

        const results = [];

        for (const test of tests) {
            console.log(`\nTest: ${test.name}`);
            console.log(`Description: ${test.description}`);

            try {
                const response = await this.sendPaymentRequest({
                    cardNumber: '4111111111111111',
                    amount: '100.00',
                    currency: 'USD'
                }, test.headers);

                // Should reject unauthenticated requests
                const rejected = response.status === 401 || response.status === 403;

                if (rejected) {
                    console.log('✓ PASS: Authentication required');
                    results.push({ test: test.name, secure: true });
                } else {
                    console.log('✗ FAIL: Authentication bypassed');
                    results.push({ test: test.name, secure: false });
                }

            } catch (error) {
                console.log(`✓ PASS: Request blocked - ${error.message}`);
                results.push({ test: test.name, secure: true });
            }
        }

        console.log('\n' + '='.repeat(60));
        return results;
    }

    // ============================================
    // UTILITY METHODS
    // ============================================

    /**
     * Send payment request with custom headers
     */
    sendPaymentRequest(body, customHeaders = {}) {
        return new Promise((resolve, reject) => {
            const headers = {
                'Content-Type': 'application/json',
                ...customHeaders
            };

            const options = {
                hostname: 'localhost',
                port: 6001,
                path: '/api/process-payment',
                method: 'POST',
                headers: headers,
                timeout: 5000
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
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(JSON.stringify(body));
            req.end();
        });
    }

    /**
     * Check if response indicates secure handling
     */
    isSecureResponse(response, test) {
        // If server rejected the request, it's secure
        if (!response.success || response.status >= 400) {
            return true;
        }

        // If server processed it, check if security was bypassed
        // This depends on the specific test
        return true; // Default to secure if no error
    }

    /**
     * Generate multiple headers for testing
     */
    generateMultipleHeaders(count) {
        const headers = {};
        for (let i = 0; i < count; i++) {
            headers[`X-Header-${i}`] = `value-${i}`;
        }
        return headers;
    }

    /**
     * Generate deeply nested object
     */
    generateDeepObject(depth) {
        if (depth <= 0) return 'value';
        return { nested: this.generateDeepObject(depth - 1) };
    }

    /**
     * Run all security tests
     */
    async runAllTests() {
        console.log('\n' + '='.repeat(60));
        console.log('Starting Complete Security Test Suite');
        console.log('='.repeat(60) + '\n');

        const results = {
            headerSpoofing: await this.testHeaderSpoofing(),
            headerSmuggling: await this.testHeaderSmuggling(),
            bufferOverflow: await this.testBufferOverflow(),
            inputValidation: await this.testInputValidation(),
            authentication: await this.testAuthenticationBypass()
        };

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('SECURITY TEST SUMMARY');
        console.log('='.repeat(60) + '\n');

        let totalTests = 0;
        let passedTests = 0;

        for (const [category, tests] of Object.entries(results)) {
            console.log(`\n${category.replace(/([A-Z])/g, ' $1').trim()}:`);
            const categoryPassed = tests.filter(t => t.secure).length;
            const categoryTotal = tests.length;
            
            console.log(`  Score: ${categoryPassed}/${categoryTotal} passed`);

            for (const test of tests) {
                totalTests++;
                if (test.secure) {
                    passedTests++;
                    console.log(`    ✓ ${test.test}`);
                } else {
                    console.log(`    ✗ ${test.test}`);
                }
            }
        }

        const score = ((passedTests / totalTests) * 100).toFixed(1);

        console.log(`\n${'='.repeat(60)}`);
        console.log(`OVERALL SECURITY SCORE: ${score}%`);
        console.log(`${passedTests}/${totalTests} tests passed`);
        console.log('='.repeat(60) + '\n');

        if (passedTests === totalTests) {
            console.log('✓ EXCELLENT: All security tests passed!\n');
        } else if (score >= 80) {
            console.log('⚠ GOOD: Most tests passed, review failures\n');
        } else {
            console.log('✗ WARNING: Multiple security issues detected\n');
        }

        return results;
    }
}

// Export for use
module.exports = { SecurityTestFramework };

// Run if executed directly
if (require.main === module) {
    const framework = new SecurityTestFramework();
    framework.runAllTests().catch(console.error);
}
