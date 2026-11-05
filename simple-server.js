
const express = require('express');
const path = require('path');

const app = express();
const PORT = 6001;

console.log('=== SIMPLE SERVER STARTING ===');

// Serve static files
app.use(express.static('public'));

// Root route
app.get('/', (req, res) => {
    console.log('✅ GET / - serving index.html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (req, res) => {
    console.log('✅ GET /index.html - serving index.html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✅ SIMPLE SERVER RUNNING on http://localhost:${PORT}`);
    console.log('✅ Open: http://localhost:6001');
    console.log('✅ Or: http://localhost:6001/index.html');
});
