# PRIMESTACK Payment Processor — Production Deployment Guide

> **Do not deploy this application with live Stripe credentials yet.** The
> deployment steps below are not a production-readiness guarantee. The current
> payment flow still has unresolved payment integrity, webhook durability,
> storage, and dependency security issues. Complete and independently validate
> those items before processing real payments. Rotate any credentials that
> appeared in the repository or were shared outside a secrets manager.

The following is infrastructure setup guidance only, not a certification or
recommendation to process live payments.

---

## Step 1 — Get a Server

You need a Linux VPS. Recommended providers:
- **DigitalOcean Droplet** — $6/month, Ubuntu 22.04
- **AWS Lightsail** — similar pricing
- **Hetzner Cloud** — cheapest option in Europe

Minimum spec: 1 vCPU, 1GB RAM, Ubuntu 22.04

---

## Step 2 — Point a Domain to Your Server

1. Buy a domain (Namecheap, GoDaddy, Cloudflare, etc.)
2. Add an **A record** pointing `yourdomain.com` → your server IP
3. Wait for DNS to propagate (up to 30 min)

---

## Step 3 — Server Setup

SSH into your server, then run:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install nginx and certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Install PM2 (process manager — keeps app running after crashes/reboots)
sudo npm install -g pm2
```

---

## Step 4 — Upload Your Project

From your Windows machine:
```bash
# Using SCP (run in your terminal)
scp -r "d:/PAYMENT PROCESSOR - Copy" user@your-server-ip:/home/user/primestack

# Or use FileZilla / WinSCP for a GUI option
```

---

## Step 5 — Install Dependencies & Configure Environment

On the server:
```bash
cd /home/user/primestack
npm install --production

# Copy the example env file
cp .env.example .env
nano .env
```

Fill in your `.env` with real values:

```env
PORT=6001
NODE_ENV=production

# Your live Stripe keys (from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# Your actual domain
STRIPE_RETURN_URL=https://yourdomain.com

# Webhook secret — see Step 6
STRIPE_WEBHOOK_SECRET=whsec_...

# STRONG admin password — generate one:
# openssl rand -hex 24
ADMIN_API_KEY=your_strong_random_password_here

# Encryption key — generate one:
# openssl rand -hex 32
ENCRYPTION_KEY=your_64_char_hex_key_here
```

---

## Step 6 — Configure Stripe Webhooks

1. Go to **https://dashboard.stripe.com/webhooks**
2. Click **Add endpoint**
3. Endpoint URL: `https://yourdomain.com/api/webhooks/stripe`
4. Select these events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payout.paid`
   - `payout.failed`
5. Copy the **Signing secret** (starts with `whsec_`)
6. Paste it into your `.env` as `STRIPE_WEBHOOK_SECRET`

> **This is critical.** Without webhooks, payments that complete after the browser closes will not be recorded.

---

## Step 7 — Configure Stripe Account for Payouts

1. Go to **https://dashboard.stripe.com/settings/payouts**
2. Add your bank account
3. Verify your identity if prompted
4. Enable automatic payouts or use the Cashout button in your dashboard

---

## Step 8 — Set Up Nginx & HTTPS

```bash
# Copy the nginx config
sudo cp /home/user/primestack/nginx.conf /etc/nginx/sites-available/primestack

# Edit the config — replace yourdomain.com with your actual domain
sudo nano /etc/nginx/sites-available/primestack

# Enable it
sudo ln -s /etc/nginx/sites-available/primestack /etc/nginx/sites-enabled/
sudo nginx -t

# Get SSL certificate (free via Let's Encrypt)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Reload nginx
sudo systemctl reload nginx
```

---

## Step 9 — Start the App with PM2

```bash
cd /home/user/primestack

# Start the app
pm2 start index.js --name primestack

# Save PM2 config so it restarts on server reboot
pm2 save
pm2 startup

# View logs
pm2 logs primestack
```

---

## Step 10 — Verify Everything Works

1. Open `https://yourdomain.com` in your browser — you should see the payment terminal
2. Log in with your `ADMIN_API_KEY` password
3. Make a small test payment (e.g., $1.00) using a real card
4. Check your Stripe dashboard — you should see the payment appear
5. Check the transaction history in your dashboard

---

## Security Checklist Before Going Live

- [ ] `ADMIN_API_KEY` is a strong random password (not `Admin123`)
- [ ] `STRIPE_SECRET_KEY` is your live key (not test)
- [ ] `STRIPE_WEBHOOK_SECRET` is set correctly
- [ ] `STRIPE_RETURN_URL` points to `https://yourdomain.com`
- [ ] HTTPS is working (green padlock in browser)
- [ ] `.env` file is NOT committed to git (check `.gitignore`)
- [ ] Stripe webhook is configured and receiving events
- [ ] Your Stripe account is fully activated with bank account linked

---

## Ongoing Maintenance

```bash
# View live logs
pm2 logs primestack

# Restart after code changes
pm2 restart primestack

# Update the app from your local machine
scp -r "d:/PAYMENT PROCESSOR - Copy" user@your-server-ip:/home/user/primestack
pm2 restart primestack

# Renew SSL certificate (auto-renews, but test manually)
sudo certbot renew --dry-run
```

---

## What the Webhook Does

The `/api/webhooks/stripe` endpoint is your safety net. Here's why it matters:

1. Customer pays → Stripe confirms → browser should call `/api/record-payment-result`
2. **But** if the browser crashes or connection drops, step 2 never happens
3. Stripe sends a `payment_intent.succeeded` event to your webhook
4. Your server records the payment automatically
5. No money is lost or untracked

---

## Support

- Stripe documentation: https://stripe.com/docs
- Stripe Dashboard: https://dashboard.stripe.com
- Let's Encrypt: https://letsencrypt.org
- PM2 documentation: https://pm2.keymetrics.io
