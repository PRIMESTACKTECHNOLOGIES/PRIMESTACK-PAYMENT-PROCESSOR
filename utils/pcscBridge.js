/**
 * PC/SC Bridge — ACR122U on Windows Laptop
 *
 * Runs as part of the main server (integrated into index.js).
 * Exposes a WebSocket endpoint at ws://localhost:PORT/nfc-ws
 *
 * Flow:
 *   1. Browser dashboard connects to /nfc-ws
 *   2. Server sends { type:'reader_status', connected:true/false, readerName }
 *   3. Browser sends { type:'read_card' }
 *   4. Server calls pcscReader.ps1 (PowerShell → WinSCard → ACR122U)
 *   5. Server sends { type:'card_data', pan, lastFour, brand, expiry, cryptogram }
 *      OR { type:'error', message }
 *
 * No extra npm packages — uses built-in 'ws' (already installed) and child_process.
 */

'use strict';

const { execFile, spawn } = require('child_process');
const path  = require('path');
const { WebSocketServer } = require('ws');

const PS_SCRIPT = path.join(__dirname, 'pcscReader.ps1');

// ── Reader status polling (every 3 s) ────────────────────────────────────────
const POLL_INTERVAL_MS = 3000;

/**
 * Query Windows Smart Card service to check whether a reader is connected.
 * Uses `certutil -scinfo` — built into every Windows install.
 * @returns {Promise<{connected:boolean, readerName:string|null}>}
 */
function checkReaderStatus() {
    return new Promise((resolve) => {
        execFile('certutil', ['-scinfo'], { timeout: 5000 }, (err, stdout) => {
            if (err || !stdout) return resolve({ connected: false, readerName: null });
            const match = stdout.match(/Reader:\s*(.+)/i) ||
                          stdout.match(/0:\s*(.+)/);
            if (match) {
                return resolve({ connected: true, readerName: match[1].trim() });
            }
            resolve({ connected: false, readerName: null });
        });
    });
}

/**
 * Read a card using pcscReader.ps1.
 * @returns {Promise<object>} Parsed JSON result from the PowerShell script
 */
function readCardViaPS() {
    return new Promise((resolve) => {
        console.log('[PCSC] Starting PowerShell script to read card');
        const ps = spawn('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy', 'Bypass',
            '-File', PS_SCRIPT
        ], { timeout: 70000 }); // Increased timeout to 70s

        let stdout = '';
        let stderr = '';

        ps.stdout.on('data', d => { 
            const str = d.toString();
            console.log('[PCSC] PowerShell stdout:', str);
            stdout += str; 
        });
        ps.stderr.on('data', d => { 
            const str = d.toString();
            console.error('[PCSC] PowerShell stderr:', str);
            stderr += str; 
        });

        ps.on('close', (code) => {
            console.log('[PCSC] PowerShell script exited with code:', code);
            const raw = stdout.trim();
            // Find the JSON line (last line that starts with '{')
            const lines = raw.split('\n').filter(l => l.trim().startsWith('{'));
            console.log('[PCSC] Found JSON lines:', lines);
            const jsonLine = lines[lines.length - 1];

            if (!jsonLine) {
                console.log('[PCSC] No JSON output');
                return resolve({ ok: false, error: stderr.trim() || 'No output from card reader script' });
            }
            try {
                const result = JSON.parse(jsonLine);
                console.log('[PCSC] Parsed result:', result);
                resolve(result);
            } catch (e) {
                console.error('[PCSC] Failed to parse JSON:', e);
                resolve({ ok: false, error: 'Parse error: ' + jsonLine });
            }
        });

        ps.on('error', (err) => {
            console.error('[PCSC] PowerShell spawn error:', err);
            resolve({ ok: false, error: 'PowerShell error: ' + err.message });
        });
    });
}

/**
 * Attach the PC/SC WebSocket bridge to an existing HTTP server.
 *
 * @param {http.Server} httpServer  The Express HTTP server instance
 * @param {string} wsPath           WebSocket path (default '/nfc-ws')
 */
function attachPcscBridge(httpServer, wsPath = '/nfc-ws') {
    const wss = new WebSocketServer({ server: httpServer, path: wsPath });

    console.log(`[PCSC] WebSocket bridge listening at ws://...${wsPath}`);

    wss.on('connection', (ws, req) => {
        const ip = req.socket.remoteAddress;
        console.log(`[PCSC] Browser connected from ${ip}`);

        let pollTimer = null;
        let lastReaderName = null;

        // ── Send current reader status immediately ────────────────────────
        async function sendStatus() {
            const { connected, readerName } = await checkReaderStatus();
            if (ws.readyState !== ws.OPEN) return;

            if (readerName !== lastReaderName) {
                lastReaderName = readerName;
                ws.send(JSON.stringify({
                    type: 'reader_status',
                    connected,
                    readerName: readerName || null
                }));
            }
        }

        sendStatus();
        pollTimer = setInterval(sendStatus, POLL_INTERVAL_MS);

        // ── Handle messages from the browser ─────────────────────────────
        ws.on('message', async (raw) => {
            let msg;
            try { msg = JSON.parse(raw.toString()); } catch { return; }

            if (msg.type === 'read_card') {
                ws.send(JSON.stringify({ type: 'reading', message: 'Tap card to reader…' }));

                const result = await readCardViaPS();

                if (ws.readyState !== ws.OPEN) return;

                if (result.ok && result.pan) {
                    ws.send(JSON.stringify({
                        type:        'card_data',
                        pan:         result.pan,
                        lastFour:    result.lastFour,
                        brand:       result.brand    || 'Card',
                        expiry:      result.expiry   || '',
                        cryptogram:  result.cryptogram || null,
                        entryMethod: result.entryMethod || 'nfc',
                        atr:         result.atr      || null,
                        reader:      result.reader   || lastReaderName
                    }));
                } else {
                    ws.send(JSON.stringify({
                        type:    'error',
                        message: result.error || 'Could not read card'
                    }));
                }
            }

            if (msg.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
            }
        });

        ws.on('close', () => {
            clearInterval(pollTimer);
            console.log(`[PCSC] Browser disconnected from ${ip}`);
        });

        ws.on('error', (err) => {
            console.error('[PCSC] WebSocket error:', err.message);
            clearInterval(pollTimer);
        });
    });

    return wss;
}

module.exports = { attachPcscBridge, checkReaderStatus, readCardViaPS };
