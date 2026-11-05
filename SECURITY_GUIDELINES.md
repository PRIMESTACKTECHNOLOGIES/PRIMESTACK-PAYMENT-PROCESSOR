# Security Guidelines

## Payment Processor Security Documentation

**Version:** 1.0  
**Compliance:** PCI-DSS, FIPS 140-2, ISO 27001  
**Last Updated:** See git history

---

## Table of Contents

1. [Overview](#1-overview)
2. [API Key Management](#2-api-key-management)
3. [Encryption Key Rotation Procedure](#3-encryption-key-rotation-procedure)
4. [Audit Log Review Procedures](#4-audit-log-review-procedures)
5. [PCI-DSS Compliance Checklist](#5-pci-dss-compliance-checklist)
6. [FIPS 140-2 Compliance](#6-fips-140-2-compliance)
7. [Incident Response](#7-incident-response)
8. [Production Deployment Security](#8-production-deployment-security)

---

## 1. Overview

### Security Architecture

The payment processor is built on a **defense-in-depth** model with multiple independent security layers:

```
┌─────────────────────────────────────────────────────────┐
│                    TLS 1.3 Transport                    │
├─────────────────────────────────────────────────────────┤
│              API Key + MFA Authentication               │
├─────────────────────────────────────────────────────────┤
│           Role-Based Access Control (RBAC)              │
├─────────────────────────────────────────────────────────┤
│         Rate Limiting (per-IP, per-endpoint)            │
├─────────────────────────────────────────────────────────┤
│      AES-256-CBC Encrypted Vault (FIPS 140-2)           │
├─────────────────────────────────────────────────────────┤
│         Comprehensive Audit Logging (PCI-DSS)           │
└─────────────────────────────────────────────────────────┘
```

### Compliance Standards

| Standard | Scope | Key Controls |
|----------|-------|--------------|
| **PCI-DSS** | Cardholder data protection | Encryption at rest, card masking, access control, audit logging |
| **FIPS 140-2** | Cryptographic module validation | AES-256-CBC, 256-bit keys, CSRNG |
| **ISO 27001** | Information security management | RBAC, incident response, audit trails |

### Core Security Principles

- **Least privilege**: Every role has access only to the resources it needs.
- **Encrypt everything**: All sensitive data is encrypted at rest using AES-256-CBC before storage.
- **Audit everything**: All access to cardholder data and administrative functions is logged.
- **Rotate regularly**: Encryption keys are rotated on a 90-day schedule.
- **Never trust input**: All card data is validated and masked before logging or responding.

---

## 2. API Key Management

### 2.1 Generating Secure API Keys

API keys are generated using Node.js `crypto.randomBytes(32)`, producing 256 bits of cryptographically secure entropy. Never create API keys manually or use predictable strings.

**Programmatic generation (Node.js):**

```javascript
const authService = require('./utils/authService');

// Generate a new cryptographically secure API key
const newKey = authService.generateAPIKey();
// Returns a 64-character hex string, e.g.:
// "a3f8c2d1e4b7a9f0c3d6e8b1a4f7c2d5e8b3a6f9c2d5e8b1a4f7c2d5e8b3a6f9"

// Store the key for a specific user with role metadata
authService.storeAPIKey(newKey, 'user-id-123', {
    roles: ['merchant'],
    username: 'AcmeCorp'
});
```

**Via the admin API:**

```bash
# Generate and store a new merchant API key
curl -X POST https://your-server/api/admin/generate-key \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId": "merchant-001", "roles": ["merchant"]}'
```

### 2.2 Key Rotation Schedule

| Key Type | Rotation Frequency | Trigger |
|----------|--------------------|---------|
| Admin API keys | Every 90 days | Scheduled or on personnel change |
| Merchant API keys | Every 180 days | Scheduled or on contract renewal |
| Encryption master key | Every 90 days | Scheduled (see Section 3) |
| Any key | Immediately | Suspected compromise |

Set a calendar reminder or automated job to rotate keys before expiry. Keys should be rotated during a low-traffic maintenance window.

### 2.3 Deactivating Compromised Keys

If a key is suspected to be compromised, deactivate it immediately — do not wait for the rotation schedule.

```javascript
const authService = require('./utils/authService');

// Immediately deactivate a compromised key
const deactivated = authService.deactivateAPIKey('compromised-key-value');
// Returns true if found and deactivated, false if key not found

// Issue a replacement key right away
const replacementKey = authService.generateAPIKey();
authService.storeAPIKey(replacementKey, 'user-id-123', {
    roles: ['merchant'],
    username: 'AcmeCorp'
});
```

After deactivation, any request using the old key will receive a `403 Forbidden` response with reason `"Key is inactive"`.

### 2.4 API Key Security Rules

- **Never hardcode API keys** in source code, configuration files, or scripts.
- Store keys in environment variables (`.env`) or a secrets manager.
- Never commit `.env` files to version control — add `.env` to `.gitignore`.
- Never log API key values — log only the user ID or a truncated prefix.
- Transmit keys only over HTTPS/TLS — never over plain HTTP.
- Treat API keys like passwords: if in doubt, rotate.

**Correct usage:**

```bash
# .env file (never commit this)
ADMIN_API_KEY=a3f8c2d1e4b7...

# Application reads from environment
const adminKey = process.env.ADMIN_API_KEY;
```

**Incorrect usage (never do this):**

```javascript
// WRONG: hardcoded key in source code
const apiKey = 'Admin123';  // This is the insecure default — change it!
```

---

## 3. Encryption Key Rotation Procedure

### 3.1 When to Rotate Keys

Rotate the vault master encryption key in these situations:

| Situation | Action |
|-----------|--------|
| Scheduled rotation (every 90 days) | Planned rotation during maintenance window |
| Suspected key compromise | Immediate emergency rotation |
| Personnel with key access leaves | Rotate within 24 hours |
| Security audit finding | Rotate as directed by audit |
| After a data breach | Immediate rotation as part of incident response |

### 3.2 Triggering Key Rotation

Key rotation is performed via the admin API. The endpoint requires a valid admin API key.

```bash
# Trigger encryption key rotation
curl -X POST https://your-server/api/rotate-keys \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json"
```

**Expected successful response:**

```json
{
  "success": true,
  "message": "Key rotation completed successfully",
  "oldKeyHash": "sha256-hash-of-old-key",
  "newKeyHash": "sha256-hash-of-new-key",
  "recordsReencrypted": 42,
  "rotatedAt": "2024-01-15T10:30:00.000Z"
}
```

### 3.3 What Happens During Rotation

The `rotateKeys()` process is atomic per-record and follows these steps:

1. A new 256-bit master key is generated using `crypto.randomBytes(32)` (CSRNG).
2. The old key is saved to the key history (up to 5 versions retained).
3. Every record in the vault is decrypted with the old key and re-encrypted with the new key, each with a fresh random IV.
4. The master key reference is updated to the new key.
5. The rotation event is logged to the audit trail.

> **Note:** The vault remains available during rotation. If re-encryption of an individual record fails, that record is skipped and the error is logged — rotation continues for all other records.

### 3.4 Verifying Rotation Success

After rotation, verify the vault status to confirm the new key is active and FIPS-compliant:

```bash
# Check vault encryption status
curl -X GET https://your-server/api/vault-status \
  -H "x-api-key: YOUR_ADMIN_KEY"
```

**Expected response:**

```json
{
  "status": "operational",
  "encryption": {
    "algorithm": "aes-256-cbc",
    "keySize": 256,
    "fipsCompliant": true,
    "keyHistoryLength": 1,
    "recordsStored": 42
  },
  "compliance": {
    "compliant": true,
    "details": [
      "Algorithm aes-256-cbc is FIPS 140-2 validated",
      "Key size 256 bits meets FIPS requirements",
      "Cryptographically secure random number generation verified"
    ]
  }
}
```

Confirm that `fipsCompliant` is `true` and `keySize` is `256`.

### 3.5 Key Rotation Audit Trail

Every key rotation is automatically recorded in the audit log with:

- Timestamp of rotation
- Hash of the old key (SHA-256, not the key itself)
- Hash of the new key (SHA-256)
- Number of records re-encrypted
- User who triggered the rotation

Retrieve rotation events from the audit log:

```bash
curl -X GET "https://your-server/api/audit-export?exportType=security&format=json" \
  -H "x-api-key: YOUR_ADMIN_KEY"
```

Filter for events of type `key_rotation` in the returned security events.

---

## 4. Audit Log Review Procedures

### 4.1 Daily Review Checklist

Perform the following checks every business day:

- [ ] **Invalid card attempts**: Check for `invalid_card` events. More than 10 in a 5-minute window from the same IP is a potential fraud signal — investigate immediately.
- [ ] **Gateway errors**: Review `gateway_error` events. A spike may indicate connectivity issues or an upstream outage.
- [ ] **Performance warnings**: Check for `performance_warning` events. Transactions exceeding 500ms should be investigated.
- [ ] **Authentication failures**: Review failed API key validations. More than 5 failures per minute from a single IP triggers automatic blocking (15-minute block).
- [ ] **Unauthorized access attempts**: Any `unauthorized_access` security event requires same-day review.

**Quick daily check command:**

```bash
# Export today's security events
curl -X GET "https://your-server/api/audit-export?exportType=security&startDate=$(date -I)&format=json" \
  -H "x-api-key: YOUR_ADMIN_KEY" | jq '.data.security[] | select(.severity == "error" or .severity == "critical")'
```

### 4.2 Weekly Review

Each week, review the following:

- **Access patterns**: Look for unusual access times (e.g., admin access at 3 AM), access from new IP addresses, or access to resources outside a user's normal scope.
- **Volume anomalies**: Compare transaction volumes to the same day last week. A significant drop may indicate a processing issue; a spike may indicate fraud.
- **Role changes**: Verify that no roles were modified without a corresponding change request.
- **Key rotation status**: Confirm that no key is approaching its 90-day rotation deadline without a scheduled rotation.
- **Retention compliance**: Confirm that logs are being retained and that the oldest entries are within the 365-day retention window.

### 4.3 Exporting Audit Data for Compliance

The audit export endpoint supports JSON, CSV, and XML formats for compliance reporting.

```bash
# Export all audit data as JSON
curl -X GET "https://your-server/api/audit-export?format=json&exportType=all" \
  -H "x-api-key: YOUR_ADMIN_KEY" > audit-$(date +%Y-%m-%d).json

# Export transaction logs as CSV for a date range
curl -X GET "https://your-server/api/audit-export?format=csv&exportType=transactions&startDate=2024-01-01&endDate=2024-01-31" \
  -H "x-api-key: YOUR_ADMIN_KEY" -o transactions-jan-2024.csv

# Export security events as XML
curl -X GET "https://your-server/api/audit-export?format=xml&exportType=security" \
  -H "x-api-key: YOUR_ADMIN_KEY" -o security-events.xml
```

**Query parameters:**

| Parameter | Values | Description |
|-----------|--------|-------------|
| `format` | `json`, `csv`, `xml` | Output format |
| `exportType` | `all`, `access`, `security`, `transactions` | Data category |
| `startDate` | ISO 8601 date string | Filter start date |
| `endDate` | ISO 8601 date string | Filter end date |

### 4.4 Log Retention Requirements

| Log Type | Minimum Retention | Basis |
|----------|-------------------|-------|
| Access logs | 365 days | PCI-DSS Requirement 10.7 |
| Security events | 365 days | PCI-DSS Requirement 10.7 |
| Transaction logs | 365 days | PCI-DSS Requirement 10.7 |
| Key rotation records | 365 days | FIPS 140-2 audit requirements |

The system is configured with a default retention of **365 days** (`retentionDays: 365` in `config/security.js`). Entries older than the retention period are automatically trimmed.

For long-term archival (beyond 365 days), export logs periodically and store them in a secure, access-controlled archive.

### 4.5 Alerting Thresholds

Configure monitoring alerts for the following conditions:

| Event | Threshold | Action |
|-------|-----------|--------|
| Invalid card attempts | > 10 in 5 minutes from same IP | Investigate for fraud; consider IP block |
| Authentication failures | > 5 per minute from same IP | Automatic 15-minute IP block |
| Gateway errors | > 5% of transactions in 10 minutes | Escalate to operations team |
| Performance warnings | > 10% of transactions exceed 500ms | Investigate performance degradation |
| Unauthorized access | Any single event | Immediate review |
| Key rotation overdue | Key age > 90 days | Schedule emergency rotation |

---

## 5. PCI-DSS Compliance Checklist

Use this checklist during security reviews and audits.

### Requirement 3: Protect Stored Cardholder Data

- [ ] **Card data never stored in plaintext.** All cardholder data is encrypted with AES-256-CBC before being written to the vault. Verify with `GET /api/vault-status` — `fipsCompliant` must be `true`.
- [ ] **Card numbers masked in all logs and responses.** The `maskCardNumber()` function replaces all but the last 4 digits with asterisks (e.g., `************1234`). Verify by reviewing transaction log entries — `lastFour` field only, no full PANs.
- [ ] **Unique IV per encryption operation.** Each `store()` call generates a fresh `crypto.randomBytes(16)` IV. No two records share an IV.
- [ ] **Encrypted vault with AES-256-CBC.** Confirmed in `utils/secureVault.js` and `config/security.js` (`algorithm: 'aes-256-cbc'`).

### Requirement 7 & 8: Access Control

- [ ] **Role-Based Access Control (RBAC) enforced.** Four roles are defined: `admin`, `merchant`, `user`, `support`. Each role has explicit resource/action permissions. Verify in `utils/authService.js`.
- [ ] **Principle of least privilege applied.** Merchants cannot access user management; support cannot write transactions. Review role definitions in `config/security.js`.
- [ ] **API key authentication on all admin endpoints.** The `authenticateAdmin` middleware is applied to all `/api/*` admin routes. Verify in `middleware/auth.js`.
- [ ] **MFA enabled for admin access.** `mfaEnabled: true` in `config/security.js`. Admin sessions require MFA verification before granting access.

### Requirement 10: Track and Monitor All Access

- [ ] **Audit logging of all card data access.** Every `retrieve()` call on the vault calls `auditAccess()`. Every transaction is logged via `auditLogger.logTransaction()`.
- [ ] **Security events logged.** Authentication failures, unauthorized access, and key rotation events are all logged via `auditLogger.logSecurityEvent()`.
- [ ] **Log retention of at least 1 year.** `retentionDays: 365` in `config/security.js` and `AuditLogger` constructor.
- [ ] **Audit logs exportable for review.** `GET /api/audit-export` supports JSON, CSV, and XML formats.

### Requirement 6: Session Management

- [ ] **Session timeout configured.** Sessions expire after 1 hour (`sessionTimeout: 3600000` ms). Expired sessions are automatically invalidated.
- [ ] **Sessions invalidated on logout.** `authService.invalidateSession(sessionId)` removes the session immediately.
- [ ] **MFA codes expire after 10 minutes.** `mfaCodeValidity: 600000` ms. Codes are single-use and deleted after successful verification.
- [ ] **Maximum MFA attempts enforced.** After 3 failed MFA attempts, the code is invalidated and the user must re-initiate MFA.

### Requirement 6.4: Rate Limiting

- [ ] **Rate limiting on all payment endpoints.** The `defaultRateLimiter` (100 requests/minute) is applied to standard endpoints. The `strictRateLimiter` is applied to sensitive endpoints like `/api/rotate-keys`.
- [ ] **Rate limit configuration reviewed.** Verify `config/security.js` `featureFlags.rateLimiting` settings match your traffic profile.

---

## 6. FIPS 140-2 Compliance

### 6.1 Algorithm Requirements

Only FIPS 140-2 validated algorithms are used for cryptographic operations:

| Operation | Algorithm | Key Size | Status |
|-----------|-----------|----------|--------|
| Data encryption at rest | AES-256-CBC | 256-bit | ✅ FIPS validated |
| Data encryption (alternative) | AES-256-GCM | 256-bit | ✅ FIPS validated |
| Hashing | SHA-256 | — | ✅ FIPS validated |
| Hashing | SHA-384, SHA-512 | — | ✅ FIPS validated |

Non-FIPS algorithms (e.g., MD5, SHA-1, DES, 3DES, RC4) are **prohibited**. Do not introduce them in any new code.

### 6.2 Key Size Requirements

- Minimum key size: **256 bits** for symmetric encryption.
- The vault master key is always `crypto.randomBytes(32)` = 256 bits.
- Never reduce key size below 256 bits, even for testing.

### 6.3 Cryptographically Secure Random Number Generation (CSRNG)

All random values — encryption keys, IVs, session tokens, API keys, MFA codes — are generated using Node.js `crypto.randomBytes()`, which uses the operating system's CSRNG (e.g., `/dev/urandom` on Linux, `CryptGenRandom` on Windows).

**Never use `Math.random()` for security-sensitive values.** It is not cryptographically secure.

```javascript
// CORRECT: CSRNG
const key = crypto.randomBytes(32);       // 256-bit key
const iv  = crypto.randomBytes(16);       // 128-bit IV
const token = crypto.randomBytes(16).toString('hex');  // session token

// WRONG: not cryptographically secure
const badKey = Math.random().toString();  // Never do this
```

### 6.4 Verifying FIPS Compliance

Use the vault status endpoint to verify FIPS compliance at any time:

```bash
curl -X GET https://your-server/api/vault-status \
  -H "x-api-key: YOUR_ADMIN_KEY"
```

The response includes a `compliance` object. All three checks must pass:

```json
{
  "compliance": {
    "compliant": true,
    "details": [
      "Algorithm aes-256-cbc is FIPS 140-2 validated",
      "Key size 256 bits meets FIPS requirements",
      "Cryptographically secure random number generation verified"
    ]
  }
}
```

If `compliant` is `false`, review the `details` array for the specific failure and remediate immediately.

---

## 7. Incident Response

### 7.1 Suspected Key Compromise

If you suspect the vault master encryption key or an API key has been exposed:

1. **Immediately deactivate the compromised API key** (if applicable):
   ```bash
   # Deactivate the compromised key
   curl -X POST https://your-server/api/admin/deactivate-key \
     -H "x-api-key: YOUR_ADMIN_KEY" \
     -d '{"key": "compromised-key-value"}'
   ```

2. **Immediately rotate the vault encryption key**:
   ```bash
   curl -X POST https://your-server/api/rotate-keys \
     -H "x-api-key: YOUR_ADMIN_KEY"
   ```

3. **Issue replacement credentials** to affected users.

4. **Review audit logs** for the period the key was potentially compromised:
   ```bash
   curl -X GET "https://your-server/api/audit-export?exportType=all&startDate=SUSPECTED_START_DATE&format=json" \
     -H "x-api-key: YOUR_ADMIN_KEY"
   ```

5. **Document the incident**: Record the timeline, affected systems, data potentially accessed, and remediation steps taken.

6. **Notify stakeholders**: Depending on the scope, notify your security team, compliance officer, and potentially affected merchants or cardholders per your breach notification policy.

### 7.2 Suspected Data Breach

If you suspect cardholder data has been accessed without authorization:

1. **Preserve evidence**: Do not delete logs. Export all audit data immediately.
   ```bash
   curl -X GET "https://your-server/api/audit-export?exportType=all&format=json" \
     -H "x-api-key: YOUR_ADMIN_KEY" > breach-evidence-$(date +%Y%m%d-%H%M%S).json
   ```

2. **Isolate the affected system** if the breach is ongoing. Take the server offline if necessary to prevent further data loss.

3. **Rotate all credentials**: Rotate the vault encryption key, all API keys, and any other secrets that may have been exposed.

4. **Engage your incident response team** and legal counsel.

5. **Notify your acquiring bank and card brands** (Visa, Mastercard) within the timeframes required by your merchant agreement (typically 24–72 hours).

6. **File a PCI-DSS incident report** with your Qualified Security Assessor (QSA).

### 7.3 Unusual Access Patterns

If audit log review reveals unusual access patterns (e.g., access from unexpected IPs, access outside business hours, access to resources outside a user's normal scope):

1. **Export the relevant audit logs** for the suspicious period:
   ```bash
   curl -X GET "https://your-server/api/audit-export?exportType=access&startDate=START&endDate=END&format=json" \
     -H "x-api-key: YOUR_ADMIN_KEY"
   ```

2. **Filter for the suspicious user or IP**:
   ```bash
   # Using jq to filter by user
   cat audit-export.json | jq '.data.access[] | select(.user == "suspicious-user-id")'
   
   # Filter by IP address
   cat audit-export.json | jq '.data.access[] | select(.details.ip == "1.2.3.4")'
   ```

3. **Correlate with transaction logs** to determine if any cardholder data was accessed.

4. **Deactivate the user's API key** if the access appears unauthorized, pending investigation.

5. **Determine root cause**: Was this a compromised credential, an insider threat, or a misconfigured permission? Update access controls accordingly.

---

## 8. Production Deployment Security

### 8.1 Change Default API Keys Before Deployment

The application ships with insecure default API keys (`Admin123`, `Merchant123`) for development convenience. **These must be replaced before any production deployment.**

```bash
# Generate secure keys
node -e "const crypto = require('crypto'); console.log('ADMIN_API_KEY=' + crypto.randomBytes(32).toString('hex')); console.log('MERCHANT_API_KEY=' + crypto.randomBytes(32).toString('hex'));"
```

Add the generated keys to your `.env` file:

```
ADMIN_API_KEY=<generated-64-char-hex-string>
MERCHANT_API_KEY=<generated-64-char-hex-string>
```

The application reads `ADMIN_API_KEY` from the environment at startup (`process.env.ADMIN_API_KEY`).

### 8.2 HTTPS/TLS in Production

All production traffic must use HTTPS with TLS 1.3. Never expose the payment processor over plain HTTP.

- Configure your reverse proxy (nginx, AWS ALB, Cloudflare) to terminate TLS and enforce TLS 1.3.
- Redirect all HTTP traffic to HTTPS with a permanent (301) redirect.
- Use certificates from a trusted CA (e.g., Let's Encrypt, DigiCert).
- Enable HSTS (HTTP Strict Transport Security) with a minimum `max-age` of 1 year.

**Example nginx TLS configuration:**

```nginx
server {
    listen 443 ssl http2;
    ssl_protocols TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}

server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

### 8.3 Environment Variable Management

- Store all secrets (API keys, database credentials, encryption seeds) in environment variables or a secrets manager (AWS Secrets Manager, HashiCorp Vault, Azure Key Vault).
- Use `.env.example` as a template — it contains placeholder values only and is safe to commit.
- Add `.env` to `.gitignore` and verify it is never committed.
- Rotate secrets if they are ever accidentally committed to version control. Treat the git history as compromised.
- In CI/CD pipelines, inject secrets via the pipeline's secret store — never hardcode them in pipeline scripts.

```bash
# Verify .env is gitignored
grep -q "^\.env$" .gitignore && echo "OK: .env is gitignored" || echo "WARNING: .env is NOT gitignored"
```

### 8.4 Rate Limiting Configuration

Review and tune rate limiting for your expected production traffic before going live:

| Limiter | Default | Endpoint Scope | Recommendation |
|---------|---------|----------------|----------------|
| `defaultRateLimiter` | 100 req/min | Standard admin endpoints | Adjust based on expected admin traffic |
| `strictRateLimiter` | Lower limit | `/api/rotate-keys` and sensitive ops | Keep strict; these should be rare |

Configuration is in `config/security.js` under `featureFlags.rateLimiting`. Tune `maxRequests` and `windowMs` to match your traffic profile without blocking legitimate users.

### 8.5 Firewall and Network Security

- **Restrict admin API access by IP**: If your admin users access the system from known IP ranges, configure your firewall or load balancer to allow only those IPs to reach admin endpoints.
- **Use a Web Application Firewall (WAF)**: A WAF can block common attack patterns (SQL injection, XSS, path traversal) before they reach the application.
- **Isolate the payment processor**: Run the payment processor in a dedicated network segment (VPC/subnet) with strict ingress/egress rules. It should only be reachable from your application servers, not directly from the internet.
- **Disable unused ports**: The payment processor should only listen on the HTTPS port (443) and, if required, the ISO8583 TCP port. Close all other ports.
- **Enable DDoS protection**: Use your cloud provider's DDoS mitigation service (AWS Shield, Cloudflare, Azure DDoS Protection) to protect against volumetric attacks.
- **Log network traffic**: Enable VPC flow logs or equivalent to capture network-level access for forensic analysis.

---

## Appendix: Quick Reference

### Key API Endpoints

| Endpoint | Method | Auth Required | Purpose |
|----------|--------|---------------|---------|
| `/api/rotate-keys` | POST | Admin key | Rotate vault encryption key |
| `/api/vault-status` | GET | Admin key | Check encryption and FIPS status |
| `/api/audit-export` | GET | Admin key | Export audit logs for compliance |

### Security Configuration File

All security settings are centralized in `config/security.js`. Key settings:

```javascript
encryption.algorithm      = 'aes-256-cbc'   // FIPS 140-2 validated
encryption.keySize        = 256              // bits
encryption.rotationInterval = 90            // days
authentication.sessionTimeout = 3600000     // 1 hour in ms
audit.retentionDays       = 365             // PCI-DSS minimum
securityEvents.failedAuthAlertThreshold = 5 // per minute
securityEvents.ipBlockDuration = 900000     // 15 minutes in ms
```

### Emergency Contacts

Update this section with your organization's actual contacts:

| Role | Contact | Escalation |
|------|---------|------------|
| Security Lead | security@yourcompany.com | Primary contact for incidents |
| Compliance Officer | compliance@yourcompany.com | PCI-DSS and regulatory matters |
| Operations On-Call | ops-oncall@yourcompany.com | System availability issues |
| Acquiring Bank | See merchant agreement | Card brand incident reporting |
