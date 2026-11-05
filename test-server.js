const http = require('http');
const fs = require('fs');
const path = require('path');

console.log('\n====================================================');
console.log('SIMPLE TEST SERVER STARTING');
console.log('====================================================\n');

const PORT = 6001;

const server = http.createServer((req, res) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);

    let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('404 Not Found');
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`✅ SERVER IS RUNNING ON: http://localhost:${PORT}`);
    console.log('✅ Open this URL in your browser now!');
    console.log('\n====================================================\n');
});
