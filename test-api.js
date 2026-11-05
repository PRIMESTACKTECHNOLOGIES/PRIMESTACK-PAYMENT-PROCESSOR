const http = require('http');

const data = JSON.stringify({
    cardNumber: '4111111111111111',
    expiryDate: '12/26',
    cvv: '123',
    amount: '10.00',
    currency: 'USD'
});

const options = {
    hostname: 'localhost',
    port: 6001,
    path: '/api/process-payment',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log('STATUS:', res.statusCode);
        console.log('BODY:', body);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
