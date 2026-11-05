# PRIMESTACK Payment Processor API

## Production warning

This project is not ready to process production payments. Do not deploy it with
live Stripe credentials until the production-readiness issues in the code have
been addressed and independently validated.

Never send card numbers, expiration dates, or CVC values to this API. The
`POST /api/process-payment` endpoint is a mock processor and is not a real
payment endpoint. Collect card details only with Stripe Elements or another
Stripe-approved client integration.

Use your HTTPS domain as the base URL in production:

```text
https://yourdomain.com
```

## Public client configuration

### `GET /api/config`

Returns the Stripe publishable key for client initialization. This key is
designed to be public; never expose `STRIPE_SECRET_KEY` or webhook signing
secrets in browser code.

## Create and confirm a payment

### `POST /api/create-payment-intent`

Creates a Stripe PaymentIntent. This endpoint currently accepts the amount from
the request; production applications must calculate and validate the charge
amount on a trusted server from an order or other authoritative source.

Request:

```json
{
  "amount": 29.99,
  "currency": "USD",
  "email": "customer@example.com",
  "name": "Customer",
  "description": "Order 123"
}
```

Response:

```json
{
  "success": true,
  "clientSecret": "pi_..._secret_...",
  "paymentIntentId": "pi_..."
}
```

Use the returned `clientSecret` with Stripe.js and Stripe Elements to confirm
the payment in the browser. Do not store or log the client secret. Do not use
this example as a substitute for trusted order pricing, idempotency, or
customer/merchant authorization.

### `POST /api/record-payment-result`

The browser currently calls this after Stripe confirmation. The server
retrieves the PaymentIntent from Stripe, but this endpoint is not idempotent and
must not be treated as the authoritative payment ledger. Reconcile payment
state from verified Stripe webhooks before fulfilling orders.

## Webhooks

Configure Stripe to send events to:

```text
POST /api/webhooks/stripe
```

Set `STRIPE_WEBHOOK_SECRET` from the Stripe webhook endpoint configuration.
The application verifies Stripe's signature against the raw request body.
Currently handled event types include:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payout.paid`
- `payout.failed`

Test webhook delivery and recovery behavior before relying on it in production.

## Admin endpoints

Admin endpoints require the `x-api-key` header. The current implementation
uses the `ADMIN_API_KEY` value as a shared administrator credential; it is not
a per-user or per-merchant authorization system.

### `GET /api/transactions`

Returns transaction history. Optional query parameters include `status` and
`limit`.

### `GET /api/transactions/:id`

Returns a transaction by ID.

### `POST /api/request-payout`

Requests a payout using the configured Stripe account. This is a sensitive
financial operation and requires administrator authentication. Verify account
ownership, available funds, currency, and payout controls before enabling it.

## Error responses

Errors generally use this shape:

```json
{
  "success": false,
  "message": "Error description"
}
```

## Security requirements

- Use HTTPS for all client and webhook traffic.
- Keep Stripe secret and webhook keys only in a managed server-side secret
  store; never commit them or place them in client-side configuration.
- Rotate any credential that has appeared in source code, logs, screenshots, or
  chat.
- Do not collect or transmit raw card data through this API.
- Do not use the mock processor or offline queue as proof that a payment was
  authorized or captured.
