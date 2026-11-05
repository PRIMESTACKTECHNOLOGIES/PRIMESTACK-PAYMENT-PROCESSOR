# PRIMESTACK Payment Processor — API Reference

## Overview

You are the **processor owner**. Your merchants (POS software owners, app developers) integrate with YOUR server using keys YOU issue to them.

```
YOU (Processor)  →  Your Merchant  →  Their Customer
```

---

## Authentication

Every request from a merchant uses their PRIMESTACK key in the header:

```
x-api-key: ps_pub_xxxx   (publishable — safe in Android app)
x-api-key: ps_sec_xxxx   (secret — server-side only)
```

Your admin endpoints use your own `ADMIN_API_KEY` from `.env`.

---

## 1. Onboard a Merchant (Admin Only)

```http
POST /api/merchants/register
x-api-key: YOUR_ADMIN_API_KEY
Content-Type: application/json

{
  "businessName": "Coffee Shop LLC",
  "email": "owner@coffeeshop.com",
  "country": "US",
  "currency": "USD",
  "platformFeePercent": 1.5,
  "offlineEnabled": true,
  "offlineLimit": 500,
  "offlineDailyLimit": 2000,
  "contactName": "John Smith",
  "phone": "+1234567890"
}
```

**Response — save these keys, secret key shown only once:**
```json
{
  "success": true,
  "merchant": {
    "merchantId": "MERCH_ABC123",
    "businessName": "Coffee Shop LLC",
    "email": "owner@coffeeshop.com",
    "keys": {
      "publishableKey": "ps_pub_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "secretKey":      "ps_sec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "note": "Save these keys securely. Secret key will never be shown again."
    }
  }
}
```

Give `publishableKey` to the merchant for their **Android app**.
Give `secretKey` to the merchant for their **server / POS backend**.

---

## 2. Process a Payment (Online)

Used by Android app or POS when internet is available.

```http
POST /api/v1/charge
x-api-key: ps_pub_xxxx
Content-Type: application/json

{
  "amount": 25.00,
  "currency": "USD",
  "description": "Coffee order #1234"
}
```

**Response:**
```json
{
  "success": true,
  "mode": "online",
  "paymentIntentId": "pi_xxx",
  "clientSecret": "pi_xxx_secret_xxx",
  "amount": 25.00,
  "currency": "USD",
  "fee": {
    "percent": 1.5,
    "amount": 0.38,
    "youReceive": 24.62
  },
  "instructions": "Use clientSecret with Stripe SDK to confirm payment on device"
}
```

Then confirm on the Android app using Stripe's Android SDK:
```kotlin
stripe.confirmPayment(activity, ConfirmPaymentIntentParams.createWithPaymentMethodId(
    clientSecret, paymentMethodId
))
```

---

## 3. Queue a Payment (Offline — No Internet)

When the Android app detects no internet, queue the transaction locally AND send to this endpoint when any connectivity returns.

```http
POST /api/v1/offline/queue
x-api-key: ps_pub_xxxx
Content-Type: application/json

{
  "amount": 15.50,
  "currency": "USD",
  "cardLast4": "4242",
  "cardBrand": "visa",
  "cardExpiry": "12/26",
  "terminalId": "POS-TERMINAL-01",
  "offlineRef": "OFFLINE_1234567890_abc",
  "capturedAt": "2026-06-08T10:30:00Z"
}
```

**offlineRef** — generate this on the device. Must be unique. Use: `OFFLINE_${timestamp}_${randomString}`

**Response:**
```json
{
  "success": true,
  "queueId": "OQ_ABCDEF12",
  "offlineRef": "OFFLINE_1234567890_abc",
  "status": "pending",
  "message": "Transaction queued. Will process on next sync."
}
```

---

## 4. Sync Offline Transactions (Back Online)

Call this as soon as internet is restored. Processes ALL pending transactions.

```http
POST /api/v1/offline/sync
x-api-key: ps_pub_xxxx
```

**Response:**
```json
{
  "success": true,
  "message": "Sync complete. 3 approved, 0 declined.",
  "total": 3,
  "approved": 3,
  "declined": 0,
  "errors": 0,
  "results": [
    {
      "queueId": "OQ_AAA",
      "offlineRef": "OFFLINE_xxx",
      "transactionId": "TXN_OFFLINE_xxx",
      "status": "Approved",
      "amount": 15.50,
      "currency": "USD"
    }
  ]
}
```

---

## 5. Check Pending Offline Queue

```http
GET /api/v1/offline/pending
x-api-key: ps_pub_xxxx
```

---

## 6. Health Check (Android App Connectivity Detection)

```http
GET /api/v1/status
x-api-key: ps_pub_xxxx
```

**Response:**
```json
{
  "success": true,
  "processor": "PRIMESTACK",
  "status": "online",
  "stripeEnabled": true,
  "offlineSupported": true,
  "merchant": {
    "merchantId": "MERCH_ABC123",
    "offlineEnabled": true,
    "offlineLimit": 500,
    "offlineDailyLimit": 2000
  },
  "pendingOfflineCount": 2
}
```

**Android app logic:**
```kotlin
// Poll every 30 seconds
fun checkConnectivity() {
    api.getStatus().enqueue(object : Callback<StatusResponse> {
        override fun onResponse(...) {
            isOnline = true
            if (response.pendingOfflineCount > 0) syncOffline()
        }
        override fun onFailure(...) {
            isOnline = false  // switch to offline mode
        }
    })
}
```

---

## 7. Merchant Account Info

```http
GET /api/v1/status/account
x-api-key: ps_pub_xxxx
```

---

## 8. Merchant Balance

```http
GET /api/v1/status/balance
x-api-key: ps_pub_xxxx
```

---

## 9. Merchant Transaction History

```http
GET /api/v1/status/transactions?limit=50&status=Approved
x-api-key: ps_pub_xxxx
```

---

## Admin: Manage Your Merchants

```http
GET    /api/merchants                    # list all merchants
GET    /api/merchants/:id                # single merchant
PUT    /api/merchants/:id                # update settings
POST   /api/merchants/:id/rotate-keys   # issue new keys
POST   /api/merchants/:id/suspend       # suspend merchant
POST   /api/merchants/:id/reactivate    # reactivate
GET    /api/merchants/:id/stats         # transaction stats
```

All require: `x-api-key: YOUR_ADMIN_API_KEY`

---

## Android App Integration Flow

```
App starts
    └── GET /api/v1/status  ← check if online
            ├── ONLINE  → normal flow
            └── OFFLINE → enable offline mode

Customer taps card
    ├── ONLINE  → POST /api/v1/charge → get clientSecret → confirm with Stripe SDK
    └── OFFLINE → POST /api/v1/offline/queue → store locally → show "Approved (Offline)"

Connection restored
    └── POST /api/v1/offline/sync → process all queued → update UI
```

---

## Offline Risk Rules

| Situation | What happens |
|---|---|
| Card approved offline, declines on sync | Transaction marked Declined. **Merchant bears the loss.** |
| Offline amount > offlineLimit | Rejected immediately — do not capture |
| Daily offline total > offlineDailyLimit | Rejected — ask customer for online payment |
| Same offlineRef submitted twice | Second one ignored (idempotent) |

---

## Error Codes

| Code | Meaning |
|---|---|
| `MISSING_KEY` | No x-api-key header |
| `INVALID_KEY` | Key not found or merchant suspended |
| `INVALID_AMOUNT` | Amount is zero or negative |
| `OFFLINE_DISABLED` | Merchant account has offline turned off |
| `MISSING_OFFLINE_REF` | offlineRef not provided |
| `OFFLINE_LIMIT_EXCEEDED` | Single transaction over limit |
| `OFFLINE_DAILY_LIMIT_EXCEEDED` | Daily cap reached |
| `PROCESSOR_UNAVAILABLE` | Stripe not configured on server |
| `CHARGE_FAILED` | Stripe returned an error |
