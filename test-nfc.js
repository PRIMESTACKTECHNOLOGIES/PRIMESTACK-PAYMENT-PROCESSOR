/**
 * Quick smoke test for NFC integration
 * Run: node test-nfc.js
 */
const db = require('./utils/database');
const { runMigrations } = require('./utils/migrations');
const nfc = require('./utils/nfcHandler');
const iso = require('./utils/isoSim');

let passed = 0;
let failed = 0;

function check(name, condition) {
    if (condition) {
        console.log('  ✓', name);
        passed++;
    } else {
        console.error('  ✗', name);
        failed++;
    }
}

// ── Migrations ────────────────────────────────────────────────────────────
console.log('\n[1] Database migrations');
runMigrations(db.db);

const tables = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nfc_tap_sessions'").all();
check('nfc_tap_sessions table exists', tables.length > 0);

const cols = db.db.prepare('PRAGMA table_info(transactions)').all();
const hasEntryMode = cols.some(c => c.name === 'entry_mode');
check('entry_mode column in transactions', hasEntryMode);

// ── NFC handler ───────────────────────────────────────────────────────────
console.log('\n[2] NFC handler');
const v1 = nfc.validateNFCData({ cardNumber: '4111111111111111', amount: 25.00, currency: 'AED', entryMethod: 'nfc' });
check('Valid NFC data passes', v1.valid);
check('Entry mode resolves to 07 (NFC chip)', v1.normalised.entryMode === '07');
check('Entry mode label correct', v1.normalised.entryModeLabel === 'NFC Tap (Chip)');
check('isContactless flag set', nfc.isContactless('07'));
check('isContactless false for manual', !nfc.isContactless('01'));

const v2 = nfc.validateNFCData({ token: 'dpan_test_token', lastFour: '4242', amount: 10, entryMethod: 'apple_pay' });
check('Apple Pay token passes', v2.valid);
check('Apple Pay entry mode is 10', v2.normalised.entryMode === '10');
check('Apple Pay is flagged as token', v2.normalised.isToken);

const v3 = nfc.validateNFCData(null);
check('Null data rejected', !v3.valid);

const v4 = nfc.validateNFCData({ cardNumber: '4111111111111111', amount: -5 });
check('Negative amount rejected', !v4.valid);

// ── ISO8583 F22 ───────────────────────────────────────────────────────────
console.log('\n[3] ISO8583 F22 (POS Entry Mode)');
const msg = iso.buildMessage({ mti: '0200', cardNumber: '4111111111111111', amount: '002500', currencyCode: '784', transmissionDate: new Date().toISOString(), cvv: '123', expiry: '1225', entryMode: '07' });
check('buildMessage includes F22:07', msg.includes('F22:07'));

const parsed = iso.parseMessage(msg);
check('parseMessage extracts entryMode', parsed.entryMode === '07');

const defaultMsg = iso.buildMessage({ mti: '0200', cardNumber: '4111111111111111', amount: '001000', currencyCode: '840', transmissionDate: new Date().toISOString(), cvv: '123', expiry: '1225' });
const parsedDefault = iso.parseMessage(defaultMsg);
check('Default entry mode is 01 (manual)', parsedDefault.entryMode === '01');

// ── NFC ISO8583 builder ───────────────────────────────────────────────────
console.log('\n[4] NFC ISO8583 message builder');
const nfcMsg = nfc.buildNFCISO8583Message(v1.normalised);
check('NFC message contains F22:07', nfcMsg.includes('F22:07'));

const parsedNfc = nfc.parseNFCISO8583Message(nfcMsg);
check('parseNFCISO8583Message gets entryMode', parsedNfc.entryMode === '07');
check('parseNFCISO8583Message gets entryModeLabel', parsedNfc.entryModeLabel === 'NFC Tap (Chip)');

// ── Database insertTransaction with entry_mode ────────────────────────────
console.log('\n[5] Database insertTransaction with entry_mode');
const testId = 'TEST_NFC_' + Date.now();
const txn = db.insertTransaction({
    id: testId,
    cardType: 'Visa',
    lastFour: '1234',
    amount: 10.00,
    currency: 'AED',
    status: 'Approved',
    entryMode: '07'
});
check('Transaction saved with entryMode', txn.entryMode === '07');
check('isContactless flag true for 07', txn.isContactless === true);

const txn2 = db.insertTransaction({
    id: testId + '_manual',
    cardType: 'Mastercard',
    lastFour: '5678',
    amount: 5.00,
    currency: 'USD',
    status: 'Approved',
    entryMode: '01'
});
check('Manual entry saved', txn2.entryMode === '01');
check('isContactless false for manual', txn2.isContactless === false);

// Cleanup
db.db.prepare("DELETE FROM transactions WHERE id LIKE 'TEST_NFC_%'").run();

// ── Summary ───────────────────────────────────────────────────────────────
console.log(`\n────────────────────────────────`);
console.log(`  ${passed} passed  |  ${failed} failed`);
console.log(`────────────────────────────────\n`);
process.exit(failed > 0 ? 1 : 0);
