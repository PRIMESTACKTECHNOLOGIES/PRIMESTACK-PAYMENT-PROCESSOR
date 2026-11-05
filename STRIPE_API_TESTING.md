# Stripe API Testing Guide

This guide shows how to test your payment processor using Stripe-like API patterns.

## 📋 Table of Contents
1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Your Original Example](#your-original-example)
4. [Enhanced Testing](#enhanced-testing)
5. [Stripe API Patterns](#stripe-api-patterns)
6. [Test Card Numbers](#test-card-numbers)
7. [Advanced Usage](#advanced-usage)

---

## Overview

Your payment processor now supports Stripe-like API testing with:

- ✅ **Charges API** - Direct charge creation
- ✅ **Payment Intents** - Modern Stripe pattern
- ✅ **Customer API** - Customer management
- ✅ **Test Cards** - Visa, Mastercard, Amex, Discover
- ✅ **Amount in Cents** - Stripe-standard format
- ✅ **Response Transformation** - Stripe-like JSON responses

---

## Quick Start

### Start Payment Processor
```bash
node index.js
```

### Run Node.js Tests
```bash
node utils/stripeSimulator.js
```

### Run Python Tests
```bash
pip install requests
python test-stripe-api.py
```

---

## Your Original Example

### Exact Implementation (Enhanced)

```python
import requests

stripe_api_key = "sk_test_xxx"  # Test key

def test_card_transaction(card_number, amount=2500):  # 25 USD in cents
    try:
        headers = {
            'Authorization': f'Bearer {stripe_api_key}',
            'Stripe-Version': '2023-10-16',
            'Content-Type': 'application/json'
        }
        
        payload = {
            'cardNumber': card_number,
            'amount': f"{amount / 100:.2f}",  # Convert cents to dollars
            'currency': 'USD',
            'expiryDate': '12/25',
            'cvv': '123',
            'description': 'Test transaction with educational card'
        }
        
        response = requests.post(
            "http://localhost:6001/api/process-payment",
            headers=headers,
            json=payload,
            verify=False
        )
        
        result = response.json()
        
        if result.get('success'):
            return f"✓ Charge succeeded: ${amount/100:.2f}"
        else:
            return f"✗ Charge failed: {result.get('message')}"
            
    except Exception as e:
        return f"Card declined: {str(e)}"

# Test with all sample card numbers
cards = {
    "Mastercard": "5454545454545454",
    "Visa": "4024007100000002",
    "Amex": "372552054769013"
}

for card_type, number in cards.items():
    print(f"\nTesting {card_type}:")
    result = test_card_transaction(number)
    print(f"Response: {result}")
```

### What This Demonstrates

1. **Stripe API Key Format** - `sk_test_*` pattern
2. **Amount in Cents** - 2500 = $25.00 (Stripe standard)
3. **Test Card Numbers** - Educational/test cards only
4. **Bearer Authentication** - Standard Stripe auth pattern
5. **Error Handling** - Graceful decline handling

---

## Enhanced Testing

### Using StripeSimulator Class (Python)

```python
from test-stripe-api import StripeSimulator

simulator = StripeSimulator("sk_test_xxx")

# Test single card
result = simulator.test_card_transaction("4024007100000002", amount=2500)
print(result)

# Test all cards
results = simulator.test_all_cards()
```

### Using StripeSimulator Class (Node.js)

```javascript
const { StripeSimulator } = require('./utils/stripeSimulator');

const stripe = new StripeSimulator('sk_test_xxx');

// Create charge
const charge = await stripe.createCharge({
    cardNumber: '4024007100000002',
    amount: 2500,  // $25.00 in cents
    currency: 'usd',
    expMonth: 12,
    expYear: 2025,
    cvc: '123'
});

console.log(charge);
```

---

## Stripe API Patterns

### 1. Charges API

**Python:**
```python
charge = simulator.create_charge(
    amount=2500,  # $25.00
    currency="usd",
    card_number="4024007100000002",
    description="Test charge"
)
print(f"Charge ID: {charge['id']}")
print(f"Status: {charge['status']}")
```

**Node.js:**
```javascript
const charge = await stripe.createCharge({
    amount: 2500,
    currency: 'usd',
    cardNumber: '4024007100000002',
    description: 'Test charge'
});
```

### 2. Payment Intents API

**Python:**
```python
intent = simulator.create_payment_intent(
    amount=5000,  # $50.00
    currency="usd",
    description="Payment for order #12345"
)
print(f"Payment Intent ID: {intent['id']}")
print(f"Client Secret: {intent['client_secret']}")
```

### 3. Customer API

**Python:**
```python
customer = simulator.create_customer(
    email="customer@example.com",
    name="John Doe"
)
print(f"Customer ID: {customer['id']}")
```

---

## Test Card Numbers

### Educational Test Cards (STRIPE COMPATIBLE)

| Card Type | Test Number | CVV | Expiry | Status |
|-----------|-------------|-----|--------|--------|
| **Visa** | 4024007100000002 | 123 | 12/25 | ✓ Approved |
| **Mastercard** | 5454545454545454 | 123 | 12/25 | ✓ Approved |
| **Amex** | 372552054769013 | 1234 | 12/25 | ✓ Approved |
| **Discover** | 6011000000000004 | 123 | 12/25 | ✓ Approved |

### Special Test Cards

| Card Number | Behavior |
|-------------|----------|
| 4000000000000002 | Always succeeds |
| 4000000000000010 | Always declines |
| 4000000000009995 | Insufficient funds |

---

## Advanced Usage

### Amount Testing

```python
# Test different amounts (in cents)
amounts = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000]

for amount in amounts:
    result = simulator.test_card_transaction("4024007100000002", amount)
    print(f"${amount/100:.2f}: {result['status']}")
```

### Currency Testing

```python
currencies = ["usd", "eur", "gbp", "cad", "aud"]

for currency in currencies:
    result = simulator.create_charge(
        amount=2500,
        currency=currency,
        card_number="4024007100000002"
    )
    print(f"{currency.upper()}: {result['status']}")
```

### Load Testing

```python
# Send 50 concurrent charges
import concurrent.futures

def process_charge(i):
    return simulator.create_charge(
        amount=1000,
        card_number="4024007100000002",
        description=f"Test charge {i}"
    )

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
    futures = [executor.submit(process_charge, i) for i in range(50)]
    results = [f.result() for f in futures]
    
print(f"Processed {len(results)} charges")
```

### Error Testing

```python
# Test with invalid card
result = simulator.test_card_transaction("1234567890123456")
print(f"Invalid card result: {result}")

# Test with declined card
result = simulator.test_card_transaction("4000000000000010")
print(f"Declined card result: {result}")
```

---

## Response Format

### Success Response (Stripe-like)

```json
{
  "id": "ch_1234567890",
  "object": "charge",
  "amount": 2500,
  "amount_captured": 2500,
  "amount_refunded": 0,
  "captured": true,
  "currency": "usd",
  "description": "Test transaction with educational card",
  "failure_code": null,
  "failure_message": null,
  "paid": true,
  "status": "succeeded",
  "payment_method_details": {
    "card": {
      "brand": "visa",
      "last4": "0002",
      "exp_month": 12,
      "exp_year": 2025,
      "checks": {
        "cvc_check": "pass"
      }
    }
  },
  "outcome": {
    "network_status": "approved_by_network",
    "risk_level": "normal",
    "seller_message": "Payment complete.",
    "type": "authorized"
  },
  "receipt_url": "https://pay.stripe.com/receipts/test"
}
```

### Error Response

```json
{
  "type": "StripeCardError",
  "message": "Your card was declined.",
  "code": "card_declined",
  "decline_code": "generic_decline",
  "param": "number"
}
```

---

## Integration Examples

### E-commerce Checkout Flow

```python
def process_checkout(cart_total, customer_email, card_number):
    """Simulate complete checkout flow"""
    simulator = StripeSimulator()
    
    # 1. Create customer
    customer = simulator.create_customer(email=customer_email)
    print(f"✓ Customer created: {customer['id']}")
    
    # 2. Create payment intent
    intent = simulator.create_payment_intent(
        amount=int(cart_total * 100),  # Convert to cents
        currency="usd",
        description=f"Order payment"
    )
    print(f"✓ Payment intent: {intent['id']}")
    
    # 3. Create charge
    charge = simulator.create_charge(
        amount=int(cart_total * 100),
        card_number=card_number,
        description=f"Order payment"
    )
    
    if charge['status'] == 'succeeded':
        print(f"✓ Payment successful!")
        print(f"  Charge ID: {charge['id']}")
        print(f"  Receipt: {charge['receipt_url']}")
        return True
    else:
        print(f"✗ Payment failed: {charge['failure_message']}")
        return False

# Test checkout
process_checkout(
    cart_total=125.50,
    customer_email="customer@example.com",
    card_number="4024007100000002"
)
```

### Subscription Payment

```python
def test_subscription():
    """Simulate subscription payment flow"""
    simulator = StripeSimulator()
    
    # Monthly subscription: $29.99
    monthly_amount = 2999  # in cents
    
    for month in range(1, 4):
        print(f"\nMonth {month}:")
        charge = simulator.create_charge(
            amount=monthly_amount,
            card_number="4024007100000002",
            description=f"Monthly subscription - Month {month}"
        )
        print(f"  Status: {charge['status']}")
        print(f"  Amount: ${charge['amount']/100:.2f}")
```

---

## Comparison: Stripe vs Your Payment Processor

| Feature | Stripe | Your Payment Processor |
|---------|--------|------------------------|
| **Auth** | `sk_test_*` API key | Bearer token |
| **Amount** | Cents (2500 = $25) | Dollars ("25.00") |
| **Endpoint** | `/v1/charges` | `/api/process-payment` |
| **Response** | Stripe format | Standardized format |
| **Test Cards** | 4242..., 4000... | 4111..., 5500... |
| **Validation** | Luhn + custom | Luhn + GPU parsing |

---

## Troubleshooting

### "Card declined" Error
- Ensure payment processor is running
- Use valid test card numbers
- Check amount is in cents (not dollars)

### Connection Refused
```bash
# Check if payment processor is running
curl http://localhost:6001

# Start the server
node index.js
```

### Install Dependencies
```bash
# Python
pip install requests

# Node.js (already installed)
npm install
```

---

## Resources

- **Node.js Simulator**: `utils/stripeSimulator.js`
- **Python Tests**: `test-stripe-api.py`
- **Merchant API**: `utils/merchantApiSimulator.js`
- **ISO8583 TCP**: `utils/iso8583tcp.js`
- **Main Server**: `index.js`

---

## Next Steps

1. **Test all card types** - Run `python test-stripe-api.py`
2. **Try different amounts** - Test various transaction sizes
3. **Load testing** - Send multiple concurrent requests
4. **Integration** - Combine with ISO8583 TCP testing
5. **Custom flows** - Build your own payment scenarios
