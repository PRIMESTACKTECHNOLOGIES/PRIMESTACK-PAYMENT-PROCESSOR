# PRIMESTACK PAYMENT PROCESSOR - Integration Examples

This folder contains ready-to-use integration examples for your **website**, **POS system**, or **any application**.

---

## 🔑 Getting Your Credentials

Before you start, get your credentials from the PRIMESTACK Merchant Dashboard (Settings tab):
1. **Client ID**
2. **Client Secret**
3. **API Key**

These three are required for all API requests!

---

## Quick Start

1. **Start PRIMESTACK**
   ```bash
   # Double-click RUN_SERVER.bat or run:
   node index.js
   ```

2. **Test the API**
   ```bash
   curl http://localhost:6001/api/info
   ```

3. **Get your credentials**
   - Open the dashboard at `http://localhost:6001`
   - Log in and go to the **Settings** tab
   - Get your Client ID, Client Secret, and API Key

---

## 🌐 Website Integration

### Option 1: Embed Full Payment Terminal
- File: `website-integration.html`
- Open it in a browser to see working examples
- Embed with an iframe or popup

### Option 2: Simple Checkout Button
```html
<button onclick="window.open('https://your-primestack-domain.com', '_blank')">
  Buy Now
</button>
```

### Option 3: Custom API Integration
Build your own checkout form using the API!

---

## 🛒 POS Integration

### JavaScript (Node.js/Browser)
- File: `pos-integration.js`
- Works in Node.js and browsers
- Easy-to-use class wrapper
- Uses all three credentials (Client ID, Client Secret, API Key)

### Python
- File: `pos-integration.py`
- Uses `requests` library
- Clean Pythonic API
- Uses all three credentials (Client ID, Client Secret, API Key)

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/process-payment` | POST | Process a payment |
| `/api/transactions/:id` | GET | Get transaction |
| `/api/transactions` | GET | Get history |
| `/api/request-payout` | POST | Request payout |
| `/api/balance` | GET | Check balance |
| `/api/info` | GET | API info |
| `/api-docs` | GET | Documentation |

## Authentication

All endpoints require these headers:
```
x-client-id: YOUR_CLIENT_ID
x-client-secret: YOUR_CLIENT_SECRET
x-api-key: YOUR_API_KEY
```

## Support

See `../API_DOCUMENTATION.md` for full API documentation.
