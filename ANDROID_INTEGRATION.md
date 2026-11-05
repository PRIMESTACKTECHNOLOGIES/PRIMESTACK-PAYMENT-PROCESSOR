# PRIMESTACK Android Integration Guide

Complete guide to connect your Android POS app to the PRIMESTACK processor.

---

## Setup

Add to `build.gradle`:
```groovy
dependencies {
    implementation 'com.squareup.retrofit2:retrofit:2.9.0'
    implementation 'com.squareup.retrofit2:converter-gson:2.9.0'
    implementation 'com.stripe:stripe-android:20.x.x'
}
```

---

## 1. Configuration

```kotlin
object PrimestackConfig {
    const val BASE_URL = "https://yourdomain.com"   // your server URL
    const val PUBLISHABLE_KEY = "ps_pub_xxxx"        // from your processor owner
}
```

---

## 2. API Service Interface

```kotlin
interface PrimestackApi {

    @GET("/api/v1/status")
    suspend fun checkStatus(
        @Header("x-api-key") key: String = PrimestackConfig.PUBLISHABLE_KEY
    ): StatusResponse

    @POST("/api/v1/charge")
    suspend fun charge(
        @Header("x-api-key") key: String = PrimestackConfig.PUBLISHABLE_KEY,
        @Body request: ChargeRequest
    ): ChargeResponse

    @POST("/api/v1/offline/queue")
    suspend fun queueOffline(
        @Header("x-api-key") key: String = PrimestackConfig.PUBLISHABLE_KEY,
        @Body request: OfflineRequest
    ): QueueResponse

    @POST("/api/v1/offline/sync")
    suspend fun syncOffline(
        @Header("x-api-key") key: String = PrimestackConfig.PUBLISHABLE_KEY
    ): SyncResponse

    @GET("/api/v1/offline/pending")
    suspend fun getPending(
        @Header("x-api-key") key: String = PrimestackConfig.PUBLISHABLE_KEY
    ): PendingResponse
}
```

---

## 3. Data Models

```kotlin
data class ChargeRequest(
    val amount: Double,
    val currency: String,
    val description: String? = null,
    // Offline fields (only used when offline = true)
    val offline: Boolean = false,
    val offlineRef: String? = null,
    val cardLast4: String? = null,
    val cardBrand: String? = null,
    val cardExpiry: String? = null,
    val terminalId: String? = null,
    val capturedAt: String? = null
)

data class ChargeResponse(
    val success: Boolean,
    val mode: String,             // "online" or "offline"
    val paymentIntentId: String?,
    val clientSecret: String?,
    val queueId: String?,
    val amount: Double,
    val currency: String,
    val fee: FeeBreakdown?,
    val error: String?,
    val message: String?
)

data class FeeBreakdown(
    val percent: Double,
    val amount: Double,
    val youReceive: Double
)

data class OfflineRequest(
    val amount: Double,
    val currency: String,
    val cardLast4: String,
    val cardBrand: String,
    val cardExpiry: String,
    val terminalId: String,
    val offlineRef: String,
    val capturedAt: String
)

data class StatusResponse(
    val success: Boolean,
    val status: String,           // "online"
    val offlineSupported: Boolean,
    val pendingOfflineCount: Int,
    val merchant: MerchantInfo?
)

data class MerchantInfo(
    val merchantId: String,
    val businessName: String,
    val currency: String,
    val offlineEnabled: Boolean,
    val offlineLimit: Double,
    val offlineDailyLimit: Double
)

data class SyncResponse(
    val success: Boolean,
    val total: Int,
    val approved: Int,
    val declined: Int,
    val errors: Int,
    val message: String
)
```

---

## 4. Payment Manager

```kotlin
class PaymentManager(private val api: PrimestackApi) {

    private var isOnline = false
    private var merchantInfo: MerchantInfo? = null

    // ── Generate unique offline reference ────────────────────────────────────
    private fun generateOfflineRef(): String {
        return "OFFLINE_${System.currentTimeMillis()}_${(1000..9999).random()}"
    }

    // ── Check connectivity every 30 seconds ──────────────────────────────────
    suspend fun checkConnectivity(): Boolean {
        return try {
            val status = api.checkStatus()
            isOnline = status.success
            merchantInfo = status.merchant
            if (isOnline && status.pendingOfflineCount > 0) {
                syncOfflineTransactions()
            }
            isOnline
        } catch (e: Exception) {
            isOnline = false
            false
        }
    }

    // ── Process a payment (online or offline automatically) ───────────────────
    suspend fun processPayment(
        amount: Double,
        currency: String,
        cardLast4: String,
        cardBrand: String,
        cardExpiry: String,
        terminalId: String,
        onClientSecret: (String) -> Unit,   // callback for Stripe SDK confirmation
        onQueued: (String) -> Unit,          // callback when queued offline
        onError: (String) -> Unit
    ) {
        if (isOnline) {
            // ONLINE: Get client secret → confirm with Stripe SDK
            try {
                val response = api.charge(request = ChargeRequest(
                    amount = amount,
                    currency = currency
                ))

                if (response.success && response.clientSecret != null) {
                    // Pass clientSecret to Stripe SDK for card confirmation
                    onClientSecret(response.clientSecret)
                } else {
                    onError(response.message ?: "Charge failed")
                }
            } catch (e: Exception) {
                // Network error during charge — fall back to offline
                queueOffline(amount, currency, cardLast4, cardBrand, cardExpiry, terminalId, onQueued, onError)
            }
        } else {
            // OFFLINE: Queue the transaction
            queueOffline(amount, currency, cardLast4, cardBrand, cardExpiry, terminalId, onQueued, onError)
        }
    }

    // ── Queue offline transaction ─────────────────────────────────────────────
    suspend fun queueOffline(
        amount: Double,
        currency: String,
        cardLast4: String,
        cardBrand: String,
        cardExpiry: String,
        terminalId: String,
        onQueued: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        // Check single transaction limit
        merchantInfo?.let { info ->
            if (amount > info.offlineLimit) {
                onError("Amount exceeds offline limit of ${info.offlineLimit}")
                return
            }
        }

        val offlineRef = generateOfflineRef()

        try {
            val response = api.queueOffline(request = OfflineRequest(
                amount = amount,
                currency = currency,
                cardLast4 = cardLast4,
                cardBrand = cardBrand,
                cardExpiry = cardExpiry,
                terminalId = terminalId,
                offlineRef = offlineRef,
                capturedAt = java.time.Instant.now().toString()
            ))

            if (response.success) {
                onQueued(offlineRef)
            } else {
                onError(response.message ?: "Queue failed")
            }
        } catch (e: Exception) {
            // Even the queue endpoint is unreachable — store locally
            saveToLocalDb(offlineRef, amount, currency, cardLast4, cardBrand, cardExpiry, terminalId)
            onQueued(offlineRef)
        }
    }

    // ── Sync all pending transactions ─────────────────────────────────────────
    suspend fun syncOfflineTransactions(): SyncResponse? {
        return try {
            val result = api.syncOffline()
            result
        } catch (e: Exception) {
            null
        }
    }

    // ── Local DB fallback (implement with Room) ───────────────────────────────
    private fun saveToLocalDb(ref: String, amount: Double, currency: String,
                               last4: String, brand: String, expiry: String, terminalId: String) {
        // TODO: Save to Room database for ultra-offline scenarios
        // When even the server queue endpoint is unreachable
        // These should be synced via api.queueOffline() when server is reachable again
    }
}
```

---

## 5. Stripe SDK Confirmation

After getting `clientSecret` from `/api/v1/charge`:

```kotlin
// In your Activity/Fragment
private fun confirmPayment(clientSecret: String, paymentMethodId: String) {
    val confirmParams = ConfirmPaymentIntentParams.createWithPaymentMethodId(
        paymentMethodId = paymentMethodId,
        clientSecret = clientSecret
    )

    stripe.confirmPayment(this, confirmParams)
}

// Handle result in onActivityResult or use PaymentLauncher
override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)

    stripe.onPaymentResult(requestCode, data, object : ApiResultCallback<PaymentIntentResult> {
        override fun onSuccess(result: PaymentIntentResult) {
            when (result.intent.status) {
                StripeIntent.Status.Succeeded -> {
                    showSuccess(result.intent.id ?: "")
                }
                else -> showError("Payment declined")
            }
        }
        override fun onError(e: Exception) {
            showError(e.message ?: "Payment error")
        }
    })
}
```

---

## 6. Connectivity Monitor Service

```kotlin
class ConnectivityMonitor(
    private val paymentManager: PaymentManager,
    private val onOnline: () -> Unit,
    private val onOffline: () -> Unit
) {
    private var job: Job? = null

    fun start(scope: CoroutineScope) {
        job = scope.launch {
            while (isActive) {
                val online = paymentManager.checkConnectivity()
                if (online) onOnline() else onOffline()
                delay(30_000) // check every 30 seconds
            }
        }
    }

    fun stop() { job?.cancel() }
}
```

---

## 7. Complete POS Flow Example

```kotlin
class CheckoutActivity : AppCompatActivity() {

    private lateinit var paymentManager: PaymentManager
    private lateinit var connectivityMonitor: ConnectivityMonitor
    private val scope = CoroutineScope(Dispatchers.Main + Job())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize Stripe
        PaymentConfiguration.init(this, PrimestackConfig.PUBLISHABLE_KEY)
        val stripe = Stripe(this, PrimestackConfig.PUBLISHABLE_KEY)

        // Start connectivity monitor
        connectivityMonitor = ConnectivityMonitor(
            paymentManager = paymentManager,
            onOnline = { updateUI(online = true) },
            onOffline = { updateUI(online = false) }
        )
        connectivityMonitor.start(scope)
    }

    fun onChargeButtonClick() {
        val amount = getAmountFromUI()
        val currency = getCurrencyFromUI()
        val cardLast4 = getCardLast4FromReader()  // from your card reader SDK
        val cardBrand = getCardBrandFromReader()

        scope.launch {
            paymentManager.processPayment(
                amount = amount,
                currency = currency,
                cardLast4 = cardLast4,
                cardBrand = cardBrand,
                cardExpiry = "12/26",
                terminalId = "TERMINAL_001",
                onClientSecret = { clientSecret ->
                    // Confirm with Stripe SDK
                    confirmPayment(clientSecret, getPaymentMethodFromReader())
                },
                onQueued = { offlineRef ->
                    // Show offline approval to customer
                    showOfflineApproval(offlineRef, amount, currency)
                },
                onError = { msg ->
                    showError(msg)
                }
            )
        }
    }

    private fun updateUI(online: Boolean) {
        runOnUiThread {
            connectionStatus.text = if (online) "Online" else "Offline Mode"
            connectionStatus.setTextColor(if (online) Color.GREEN else Color.RED)
            // Show offline banner if applicable
        }
    }

    private fun showOfflineApproval(ref: String, amount: Double, currency: String) {
        // Show receipt/approval screen
        // The transaction is queued and will sync automatically
        AlertDialog.Builder(this)
            .setTitle("Payment Approved (Offline)")
            .setMessage("$currency ${amount.format()}\nRef: $ref\nWill sync when online.")
            .setPositiveButton("Done") { _, _ -> }
            .show()
    }

    override fun onDestroy() {
        super.onDestroy()
        connectivityMonitor.stop()
        scope.cancel()
    }
}
```

---

## 8. Error Handling Reference

| Error Code | Meaning | What to do |
|---|---|---|
| `MISSING_KEY` | No x-api-key header | Check your key is set |
| `INVALID_KEY` | Wrong key or suspended | Contact processor admin |
| `INVALID_AMOUNT` | Amount ≤ 0 | Validate input |
| `OFFLINE_DISABLED` | Offline not enabled | Contact processor admin |
| `OFFLINE_LIMIT_EXCEEDED` | Above single txn limit | Use online only or reduce amount |
| `OFFLINE_DAILY_LIMIT_EXCEEDED` | Daily cap reached | Wait for sync, or go online |
| `PROCESSOR_UNAVAILABLE` | Stripe not configured | Contact processor admin |
| `CHARGE_FAILED` | Stripe error | Show error to customer |

---

## 9. Quick Reference

```
Your server URL:   https://yourdomain.com
Health check:      GET  /api/v1/status
Online charge:     POST /api/v1/charge          { amount, currency }
Offline queue:     POST /api/v1/offline/queue   { amount, cardLast4, offlineRef, ... }
Sync offline:      POST /api/v1/offline/sync
Pending check:     GET  /api/v1/offline/pending
Account info:      GET  /api/v1/status/account
Balance:           GET  /api/v1/status/balance
Transactions:      GET  /api/v1/status/transactions
```

All endpoints require: `x-api-key: ps_pub_xxxx` header
