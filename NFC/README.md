# PRIMESTACK NFC / Tap Payment

## What's in this folder

| Path | What it is |
|---|---|
| `acssmc-1.1.7-android12-20240216/` | ACS Smart Card Reader SDK for Android (USB host mode) |
| `ACS-Unified-Driver-Win-4280.rar` | Windows USB driver for ACS readers (install on the PC/cashier station) |
| `ACS-Unified-MSI-4280.rar` | Windows MSI installer version of the same driver |
| `PrimestackPOS/` | **Android POS app** — tap-to-pay terminal using the ACS reader |

---

## Architecture

```
[ACS NFC Reader] ──USB──▶ [Android POS App]
                                │
                         POST /api/process-nfc-payment
                                │
                         [PRIMESTACK Server]
                                │
                         SQLite transactions table
                         (entry_mode = '07' for NFC chip)
```

---

## ACS Reader Hardware

The SDK supports the full ACS reader lineup.  For contactless (NFC) payments the
recommended readers are:

| Reader | Notes |
|---|---|
| **ACR1252U** | Dual-interface (contact + contactless), most common POS choice |
| **ACR122U** | Classic NFC reader, wide compatibility |
| **ACR1552U** | Multi-interface with SAM slot |
| **WalletMate II** | Compact form-factor |

Connect via USB to the Android device.  The app auto-detects and opens the reader
when it's plugged in.

---

## PrimestackPOS Android App

### Requirements
- Android 5.0+ (API 21)
- USB Host mode enabled on the Android device
- ACS reader connected via USB OTG cable

### Build

```bash
cd NFC/PrimestackPOS

# Debug build (points to emulator: 10.0.2.2:6001)
./gradlew assembleDebug

# Release pointing to your server
./gradlew assembleRelease -PserverUrl=https://your-server.com
```

The APK lands in `app/build/outputs/apk/`.

### First-time setup on device
1. Install the APK
2. Open the app → tap the ⚙ Settings icon
3. Enter your **Server URL** (e.g. `http://192.168.1.50:6001`)
4. Enter your **Merchant Secret Key** (`ps_sec_…` from the dashboard)
5. Set a **Terminal ID** (e.g. `TERM_001`)
6. Tap **Test Server Connection** — should show "✓ Connected"
7. Plug in the ACS reader via USB OTG — the status dot turns green

### Payment flow
1. Cashier types the amount and selects currency
2. Customer taps card or phone near the ACS reader
3. App reads the EMV chip (SELECT PPSE → SELECT AID → GET PROCESSING OPTIONS → READ RECORDS)
4. Card data is posted to `/api/process-nfc-payment`
5. **APPROVED ✓** or **DECLINED ✗** displayed in ~1 second

---

## Server-side changes (already applied)

| File | Change |
|---|---|
| `utils/nfcHandler.js` | New — NFC validation, ISO8583 F22 builder/parser |
| `utils/isoSim.js` | Added F22 (POS Entry Mode) to `buildMessage` / `parseMessage` |
| `utils/migrations.js` | Adds `entry_mode` column to `transactions` + `nfc_tap_sessions` table |
| `utils/database.js` | `insertTransaction` now saves `entry_mode`; `_formatTransaction` exposes it |
| `index.js` | `POST /api/process-nfc-payment`, `GET /api/nfc/sessions`, `GET /api/nfc/entry-modes` |
| `public/index.html` | NFC tap panel + "Method" column in transaction history (📡 badge) |

### New API endpoints

```
POST /api/process-nfc-payment
  body: { cardNumber, lastFour, cardBrand, expiry, amount, currency,
          entryMethod, terminalId, cryptogram }
  → { success, tapSessionId, transactionId, status, entryMode, entryModeLabel,
      processingTimeMs, ... }

GET  /api/nfc/sessions       (admin auth)   → { sessions: [...] }
GET  /api/nfc/entry-modes                  → { entryModes, contactlessCodes }
```

### ISO8583 Field 22 values
| Code | Meaning |
|---|---|
| `07` | NFC / EMV contactless chip |
| `91` | Contactless magnetic stripe (MSD) |
| `10` | Digital wallet (Apple Pay / Google Pay DPAN) |
| `01` | Manual / keyed entry |
| `02` | Magnetic swipe |
| `05` | Contact chip insert |

---

## Windows Driver (cashier PC with card reader)

If you're running the ACS reader on a **Windows PC** (not Android), install the
driver first:

1. Extract `ACS-Unified-MSI-4280.rar`
2. Run the `.msi` installer as Administrator
3. Plug in the ACS reader — Windows Device Manager should show it as a Smart Card Reader
4. The Web NFC panel in the PRIMESTACK dashboard (`index.html`) can then simulate
   tap payments using the manual entry form.

---

## Security notes

- Card PANs are stored in the secure vault for ≤5 minutes then cleared
- Only `last_four` and `card_brand` are persisted in the database — never the full PAN
- The EMV Application Cryptogram (`F55`) is logged in the tap session for dispute resolution
- `entry_mode` in the transaction record provides a full audit trail of how each payment was taken
