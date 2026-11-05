
const http = require('http');
const readline = require('readline');

// Create interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Helper to make HTTP requests
const makeRequest = (options, body = null) => {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: JSON.parse(data)
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: data
                    });
                }
            });
        });
        
        req.on('error', reject);
        
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
};

async function testYourCard() {
    console.log('\n🔒 Payment Processor - Card Test (SIMULATION ONLY)\n');
    console.log('⚠️  This is a LOCAL TEST - no real transactions, no real money!\n');
    
    rl.question('Enter your card number (or just first 6 + last 4 digits): ', (cardNumber) => {
        rl.question('Enter expiry date (MM/YY): ', (expiryDate) => {
            rl.question('Enter CVV (optional for this test): ', async (cvv) => {
                try {
                    console.log('\n🚀 Testing your card...\n');
                    
                    const response = await makeRequest({
                        hostname: 'localhost',
                        port: 6001,
                        path: '/api/process-payment',
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    }, {
                        cardNumber: cardNumber.trim(),
                        expiryDate: expiryDate.trim(),
                        cvv: cvv.trim() || '123',
                        amount: 10.00,
                        currency: 'USD'
                    });
                    
                    console.log('📋 Test Results:');
                    console.log('────────────────────────────────────────');
                    console.log(`Status Code: ${response.status}`);
                    console.log(`Success: ${response.body.success}`);
                    console.log(`Message: ${response.body.message}`);
                    if (response.body.transactionId) {
                        console.log(`Transaction ID: ${response.body.transactionId}`);
                    }
                    if (response.body.status) {
                        console.log(`Transaction Status: ${response.body.status}`);
                    }
                    if (response.body.processingTimeMs) {
                        console.log(`Processing Time: ${response.body.processingTimeMs}ms`);
                    }
                    if (response.body.gpuProcessed) {
                        console.log(`GPU Accelerated: Yes`);
                    }
                    console.log('────────────────────────────────────────');
                    console.log('\n✅ Test completed! Remember - this was just a simulation!');
                    
                } catch (err) {
                    console.error('❌ Error testing card:', err.message);
                }
                
                rl.close();
            });
        });
    });
}

// Check if server is running first
async function checkServer() {
    try {
        await makeRequest({
            hostname: 'localhost',
            port: 6001,
            path: '/',
            method: 'GET'
        });
        return true;
    } catch (err) {
        return false;
    }
}

// Main execution
(async () => {
    const serverRunning = await checkServer();
    
    if (!serverRunning) {
        console.log('❌ Server is not running!');
        console.log('📝 Please start the server first by running: node index.js');
        rl.close();
        process.exit(1);
    }
    
    await testYourCard();
})();
