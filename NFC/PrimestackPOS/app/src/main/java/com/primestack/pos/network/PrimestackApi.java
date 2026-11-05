package com.primestack.pos.network;

import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * PrimestackApi
 *
 * Lightweight HTTP client for communicating with the PRIMESTACK Payment Processor server.
 * Uses HttpURLConnection — no third-party HTTP library needed.
 *
 * All methods are blocking and must be called from a background thread.
 */
public class PrimestackApi {

    private static final String TAG = "PrimestackApi";
    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS    = 30_000;

    private final String mBaseUrl;
    private final String mMerchantKey; // ps_sec_ key for /api/v1 endpoints

    public PrimestackApi(String baseUrl, String merchantKey) {
        // Strip trailing slash
        this.mBaseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.mMerchantKey = merchantKey;
    }

    // ── Result type ────────────────────────────────────────────────────────

    public static class ApiResult {
        public boolean success;
        public int httpStatus;
        public String transactionId;
        public String tapSessionId;
        public String status;           // "Approved" / "Declined"
        public String message;
        public String entryModeLabel;
        public long processingTimeMs;
        public String rawJson;

        @Override
        public String toString() {
            return "ApiResult{success=" + success + ", status=" + status
                    + ", txn=" + transactionId + ", msg=" + message + "}";
        }
    }

    // ── NFC tap payment ────────────────────────────────────────────────────

    /**
     * Submit an NFC tap payment to POST /api/process-nfc-payment.
     *
     * @param cardNumber   PAN or token
     * @param lastFour     Last 4 digits
     * @param cardBrand    "Visa", "Mastercard", etc.
     * @param expiry       MMYY
     * @param amount       Charge amount (major units, e.g. 12.50)
     * @param currency     ISO 4217 code (e.g. "AED")
     * @param entryMethod  "nfc" | "msd" | "apple_pay" | "google_pay"
     * @param terminalId   POS terminal identifier
     * @param cryptogram   EMV Application Cryptogram (hex), may be null
     */
    public ApiResult processNfcPayment(
            String cardNumber,
            String lastFour,
            String cardBrand,
            String expiry,
            double amount,
            String currency,
            String entryMethod,
            String terminalId,
            String cryptogram
    ) {
        try {
            JSONObject body = new JSONObject();
            body.put("cardNumber",  cardNumber);
            body.put("lastFour",    lastFour);
            body.put("cardBrand",   cardBrand);
            body.put("expiry",      expiry != null ? expiry : "");
            body.put("amount",      amount);
            body.put("currency",    currency);
            body.put("entryMethod", entryMethod != null ? entryMethod : "nfc");
            if (terminalId != null) body.put("terminalId", terminalId);
            if (cryptogram  != null) body.put("cryptogram", cryptogram);

            return post("/api/process-nfc-payment", body);

        } catch (Exception e) {
            Log.e(TAG, "processNfcPayment error", e);
            ApiResult r = new ApiResult();
            r.success = false;
            r.message = e.getMessage();
            return r;
        }
    }

    /**
     * Submit via /api/v1/charge (merchant-key authenticated path).
     * Use this when the POS app has a ps_sec_ key.
     */
    public ApiResult chargeViaV1(
            String cardLast4,
            String cardBrand,
            String expiry,
            double amount,
            String currency,
            String entryMethod,
            String terminalId,
            String offlineRef
    ) {
        try {
            JSONObject body = new JSONObject();
            body.put("card_last4",    cardLast4);
            body.put("card_brand",    cardBrand);
            body.put("card_expiry",   expiry != null ? expiry : "");
            body.put("amount",        amount);
            body.put("currency",      currency);
            body.put("entry_mode",    entryMethod);
            if (terminalId != null)  body.put("terminal_id",  terminalId);
            if (offlineRef  != null) body.put("offline_ref",  offlineRef);

            return postWithMerchantKey("/api/v1/charge", body);

        } catch (Exception e) {
            Log.e(TAG, "chargeViaV1 error", e);
            ApiResult r = new ApiResult();
            r.success = false;
            r.message = e.getMessage();
            return r;
        }
    }

    /**
     * GET /api/info — quick connectivity test.
     */
    public ApiResult testConnection() {
        try {
            String raw = get("/api/info");
            ApiResult r = new ApiResult();
            r.success    = raw != null;
            r.httpStatus = 200;
            r.rawJson    = raw;
            r.message    = r.success ? "Connected ✓" : "No response";
            return r;
        } catch (Exception e) {
            ApiResult r = new ApiResult();
            r.success = false;
            r.message = e.getMessage();
            return r;
        }
    }

    // ── Internal HTTP helpers ──────────────────────────────────────────────

    private ApiResult post(String path, JSONObject body) throws IOException {
        return doPost(path, body, null);
    }

    private ApiResult postWithMerchantKey(String path, JSONObject body) throws IOException {
        return doPost(path, body, mMerchantKey);
    }

    private ApiResult doPost(String path, JSONObject body, String authKey) throws IOException {
        URL url = new URL(mBaseUrl + path);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        conn.setRequestProperty("Accept", "application/json");
        if (authKey != null && !authKey.isEmpty()) {
            conn.setRequestProperty("x-merchant-key", authKey);
        }
        conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
        conn.setReadTimeout(READ_TIMEOUT_MS);
        conn.setDoOutput(true);

        byte[] bodyBytes = body.toString().getBytes(StandardCharsets.UTF_8);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(bodyBytes);
        }

        return parseResponse(conn);
    }

    private String get(String path) throws IOException {
        URL url = new URL(mBaseUrl + path);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("Accept", "application/json");
        conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
        conn.setReadTimeout(READ_TIMEOUT_MS);

        int code = conn.getResponseCode();
        if (code == 200) {
            return readStream(conn);
        }
        return null;
    }

    private ApiResult parseResponse(HttpURLConnection conn) throws IOException {
        ApiResult result = new ApiResult();
        result.httpStatus = conn.getResponseCode();

        String raw;
        if (result.httpStatus >= 200 && result.httpStatus < 300) {
            raw = readStream(conn);
        } else {
            raw = readErrorStream(conn);
        }
        result.rawJson = raw;

        try {
            JSONObject json = new JSONObject(raw);
            result.success        = json.optBoolean("success", false);
            result.transactionId  = json.optString("transactionId", null);
            result.tapSessionId   = json.optString("tapSessionId", null);
            result.status         = json.optString("status", null);
            result.message        = json.optString("message", null);
            result.entryModeLabel = json.optString("entryModeLabel", null);
            result.processingTimeMs = json.optLong("processingTimeMs", 0);
        } catch (Exception e) {
            result.success = false;
            result.message = "Parse error: " + e.getMessage();
            Log.w(TAG, "Failed to parse JSON response: " + raw);
        }

        Log.d(TAG, "Response [" + result.httpStatus + "]: " + result);
        return result;
    }

    private String readStream(HttpURLConnection conn) throws IOException {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
        }
        return sb.toString();
    }

    private String readErrorStream(HttpURLConnection conn) {
        try {
            if (conn.getErrorStream() == null) return "";
            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(conn.getErrorStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
            }
            return sb.toString();
        } catch (IOException e) {
            return "";
        }
    }
}
