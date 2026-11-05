package com.primestack.pos.ui;

import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.method.ScrollingMovementMethod;
import android.util.Log;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.acs.smartcard.Reader;
import com.primestack.pos.BuildConfig;
import com.primestack.pos.R;
import com.primestack.pos.nfc.AcsReaderManager;
import com.primestack.pos.nfc.EmvCardReader;
import com.primestack.pos.network.PrimestackApi;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * MainActivity — PRIMESTACK POS Terminal
 *
 * Flow:
 *  1. ACS reader connects via USB
 *  2. Cashier enters amount
 *  3. Customer taps contactless card / phone
 *  4. onCardPresented fires → background thread reads EMV data (SELECT PPSE → SELECT AID →
 *     GET PROCESSING OPTIONS → READ RECORDs)
 *  5. Extracted card data is posted to /api/process-nfc-payment
 *  6. Result displayed with approval / decline status
 */
public class MainActivity extends AppCompatActivity implements AcsReaderManager.ReaderListener {

    private static final String TAG = "POS-MainActivity";

    // Slot 0 = contactless (PICC) on most ACS dual-interface readers
    private static final int SLOT_CONTACTLESS = 0;

    // ── Views (kept as fields to avoid repeated findViewById) ─────────────
    private TextView tvReaderStatus;
    private TextView tvReaderName;
    private View readerStatusDot;
    private com.google.android.material.textfield.TextInputEditText etAmount;
    private Spinner spinnerCurrency;
    private TextView tvTapStatus;
    private TextView tvCardInfo;
    private TextView tvResult;
    private TextView tvTxnId;
    private View resultCard;
    private com.google.android.material.button.MaterialButton btnCharge;
    private TextView tvLog;

    // ── State ──────────────────────────────────────────────────────────────
    private AcsReaderManager mReaderManager;
    private SharedPreferences mPrefs;
    private final Handler mMainHandler = new Handler(Looper.getMainLooper());

    // Card data read from the NFC tap (populated in background thread)
    private volatile EmvCardReader.CardData mCardData;
    private volatile int mActiveSlot = SLOT_CONTACTLESS;
    private volatile boolean mPaymentInProgress = false;

    // ── Lifecycle ─────────────────────────────────────────────────────────

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        mPrefs = getSharedPreferences("pos_prefs", MODE_PRIVATE);

        bindViews();
        setupCurrencySpinner();
        setupClickListeners();

        mReaderManager = AcsReaderManager.getInstance(this);
        mReaderManager.setListener(this);
    }

    @Override
    protected void onResume() {
        super.onResume();
        mReaderManager.registerReceiver();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        mReaderManager.unregisterReceiver();
    }

    // ── View binding ──────────────────────────────────────────────────────

    private void bindViews() {
        tvReaderStatus  = findViewById(R.id.tvReaderStatus);
        tvReaderName    = findViewById(R.id.tvReaderName);
        readerStatusDot = findViewById(R.id.readerStatusDot);
        etAmount        = findViewById(R.id.etAmount);
        spinnerCurrency = findViewById(R.id.spinnerCurrency);
        tvTapStatus     = findViewById(R.id.tvTapStatus);
        tvCardInfo      = findViewById(R.id.tvCardInfo);
        tvResult        = findViewById(R.id.tvResult);
        tvTxnId         = findViewById(R.id.tvTxnId);
        resultCard      = findViewById(R.id.resultCard);
        btnCharge       = findViewById(R.id.btnCharge);
        tvLog           = findViewById(R.id.tvLog);
        tvLog.setMovementMethod(new ScrollingMovementMethod());
    }

    private void setupCurrencySpinner() {
        String[] currencies = {"AED", "USD", "EUR", "GBP", "SAR", "INR"};
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, currencies);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerCurrency.setAdapter(adapter);

        // Restore last-used currency
        String saved = mPrefs.getString(getString(R.string.pref_currency), "AED");
        for (int i = 0; i < currencies.length; i++) {
            if (currencies[i].equals(saved)) { spinnerCurrency.setSelection(i); break; }
        }
    }

    private void setupClickListeners() {
        findViewById(R.id.btnSettings).setOnClickListener(v ->
                startActivity(new Intent(this, SettingsActivity.class)));

        btnCharge.setOnClickListener(v -> {
            if (mCardData != null) {
                processPayment();
            }
        });

        // Tapping the tap-area primes the reader for the next card
        findViewById(R.id.tapArea).setOnClickListener(v -> {
            if (mReaderManager.isConnected()) {
                setTapStatus("Ready — tap your card", "#94A3B8");
                mCardData = null;
                btnCharge.setEnabled(false);
                btnCharge.setText("Tap Card to Charge");
            } else {
                Toast.makeText(this, "No reader connected", Toast.LENGTH_SHORT).show();
            }
        });
    }

    // ── AcsReaderManager.ReaderListener ──────────────────────────────────

    @Override
    public void onReaderConnected(String readerName) {
        mMainHandler.post(() -> {
            tvReaderStatus.setText(getString(R.string.label_reader_connected));
            tvReaderName.setText(readerName);
            readerStatusDot.setBackgroundResource(R.drawable.dot_green);
            tvReaderStatus.setTextColor(Color.parseColor("#16A34A"));
            setTapStatus("Reader ready — tap card to pay", "#94A3B8");
            log("Reader: " + readerName);
        });
    }

    @Override
    public void onReaderDisconnected() {
        mMainHandler.post(() -> {
            tvReaderStatus.setText(getString(R.string.label_reader_disconnected));
            tvReaderName.setText("");
            readerStatusDot.setBackgroundResource(R.drawable.dot_grey);
            tvReaderStatus.setTextColor(Color.parseColor("#94A3B8"));
            setTapStatus("No reader — plug in ACS reader", "#EF4444");
            mCardData = null;
            btnCharge.setEnabled(false);
            log("Reader disconnected");
        });
    }

    @Override
    public void onCardPresented(int slotNum) {
        mActiveSlot = slotNum;
        mMainHandler.post(() -> {
            setTapStatus("Reading card…", "#F59E0B");
            tvCardInfo.setVisibility(View.GONE);
            resultCard.setVisibility(View.GONE);
            log("Card detected on slot " + slotNum);
        });

        // Read card data on a background thread
        new Thread(() -> readEmvCard(slotNum)).start();
    }

    @Override
    public void onCardRemoved(int slotNum) {
        mMainHandler.post(() -> {
            if (!mPaymentInProgress) {
                setTapStatus("Card removed — tap again to pay", "#94A3B8");
            }
        });
    }

    @Override
    public void onError(String message) {
        mMainHandler.post(() -> {
            setTapStatus("Error: " + message, "#EF4444");
            log("ERROR: " + message);
        });
    }

    // ── EMV card reading ──────────────────────────────────────────────────

    /**
     * Full EMV contactless read sequence:
     *   Power on → SELECT PPSE → SELECT AID → GET PROCESSING OPTIONS → READ RECORDs
     *
     * Runs on a background thread.
     */
    private void readEmvCard(int slotNum) {
        Reader reader = mReaderManager.getReader();
        byte[] response = new byte[258];
        int len;

        try {
            // Step 1: Power on the card
            byte[] atr = mReaderManager.powerOn(slotNum);
            if (atr == null) {
                postError("Failed to power on card");
                return;
            }
            log("ATR: " + EmvCardReader.bytesToHex(atr, 0, atr.length));

            // Step 2: SELECT PPSE
            len = mReaderManager.transmit(slotNum, EmvCardReader.SELECT_PPSE, response);
            if (len < 0 || !EmvCardReader.isSuccess(response, len)) {
                postError("PPSE select failed");
                return;
            }
            log("PPSE response: " + EmvCardReader.bytesToHex(response, 0, len));

            // Step 3: Find the first AID in the PPSE FCI
            byte[] aid = extractFirstAid(response, len);
            String brand = (aid != null) ? EmvCardReader.brandFromAid(aid) : "Card";

            if (aid == null) {
                // No AID found in PPSE — try well-known Visa / MC AIDs
                aid = EmvCardReader.hexToBytes(EmvCardReader.AID_MASTERCARD);
                brand = "Mastercard";
                log("No AID in PPSE — trying Mastercard AID");
            }

            // Step 4: SELECT application AID
            byte[] selectAid = EmvCardReader.buildSelectAid(aid);
            len = mReaderManager.transmit(slotNum, selectAid, response);
            if (len < 0 || !EmvCardReader.isSuccess(response, len)) {
                // Try Visa if Mastercard failed
                aid = EmvCardReader.hexToBytes(EmvCardReader.AID_VISA);
                brand = "Visa";
                selectAid = EmvCardReader.buildSelectAid(aid);
                len = mReaderManager.transmit(slotNum, selectAid, response);
                if (len < 0 || !EmvCardReader.isSuccess(response, len)) {
                    postError("AID select failed");
                    return;
                }
            }
            log("AID selected: " + brand + " (" + EmvCardReader.bytesToHex(aid, 0, aid.length) + ")");

            // Step 5: GET PROCESSING OPTIONS
            len = mReaderManager.transmit(slotNum, EmvCardReader.GET_PROCESSING_OPTIONS, response);
            if (len < 0 || !EmvCardReader.isSuccess(response, len)) {
                postError("GPO failed");
                return;
            }

            // Collect all TLV data for parsing
            byte[] allTlv = new byte[4096];
            int totalLen = 0;
            System.arraycopy(response, 0, allTlv, totalLen, len);
            totalLen += len;

            // Step 6: Read records (AFL from GPO response, or brute-force SFI 1–3, records 1–8)
            for (int sfi = 1; sfi <= 3; sfi++) {
                for (int rec = 1; rec <= 8; rec++) {
                    byte[] readRec = EmvCardReader.buildReadRecord(sfi, rec);
                    len = mReaderManager.transmit(slotNum, readRec, response);
                    if (len < 2) break;
                    if (!EmvCardReader.isSuccess(response, len)) break; // No more records in this SFI
                    if (totalLen + len <= allTlv.length) {
                        System.arraycopy(response, 0, allTlv, totalLen, len);
                        totalLen += len;
                    }
                }
            }

            // Step 7: Parse all collected TLV data
            EmvCardReader.CardData card = EmvCardReader.parseCardData(allTlv, totalLen, brand);

            if (card.pan == null) {
                postError("Could not read card number from chip");
                return;
            }

            mCardData = card;
            log("Card: " + brand + " ****" + card.lastFour + " exp " + card.expiry);

            // Update UI on main thread
            mMainHandler.post(() -> {
                setTapStatus("Card ready — press Charge", "#16A34A");
                tvCardInfo.setText(brand + " ending in " + card.lastFour);
                tvCardInfo.setVisibility(View.VISIBLE);
                btnCharge.setEnabled(true);
                btnCharge.setText("Charge " + brand + " ****" + card.lastFour);
            });

        } catch (Exception e) {
            Log.e(TAG, "EMV read error", e);
            postError("Card read error: " + e.getMessage());
        }
    }

    /**
     * Walk the PPSE FCI response and return the bytes of the first application AID (tag 4F).
     */
    private byte[] extractFirstAid(byte[] data, int len) {
        for (int i = 0; i < len - 2; i++) {
            if ((data[i] & 0xFF) == EmvCardReader.TAG_DIRECTORY_ENTRY) {
                // Found a Directory Entry (0x61) — scan its children for AID (0x4F)
                int dirLen = data[i + 1] & 0xFF;
                int j = i + 2;
                int end = j + dirLen;
                while (j < end - 1 && j < len) {
                    if ((data[j] & 0xFF) == EmvCardReader.TAG_AID) {
                        int aidLen = data[j + 1] & 0xFF;
                        if (j + 2 + aidLen <= len) {
                            byte[] aid = new byte[aidLen];
                            System.arraycopy(data, j + 2, aid, 0, aidLen);
                            return aid;
                        }
                    }
                    j += 2 + (data[j + 1] & 0xFF);
                }
            }
        }
        return null;
    }

    // ── Payment submission ─────────────────────────────────────────────────

    private void processPayment() {
        String amountStr = etAmount.getText() != null ? etAmount.getText().toString().trim() : "";
        if (amountStr.isEmpty() || Double.parseDouble(amountStr) <= 0) {
            Toast.makeText(this, "Enter a valid amount", Toast.LENGTH_SHORT).show();
            return;
        }

        double amount = Double.parseDouble(amountStr);
        String currency = (String) spinnerCurrency.getSelectedItem();
        String serverUrl = mPrefs.getString(getString(R.string.pref_server_url),
                BuildConfig.SERVER_BASE_URL);
        String merchantKey = mPrefs.getString(getString(R.string.pref_merchant_key), "");
        String terminalId  = mPrefs.getString(getString(R.string.pref_terminal_id), "TERM_POS_001");

        EmvCardReader.CardData card = mCardData;

        mPaymentInProgress = true;
        btnCharge.setEnabled(false);
        setTapStatus("Processing payment…", "#F59E0B");
        resultCard.setVisibility(View.GONE);

        // Save last currency
        mPrefs.edit().putString(getString(R.string.pref_currency), currency).apply();

        new Thread(() -> {
            PrimestackApi api = new PrimestackApi(serverUrl, merchantKey);
            PrimestackApi.ApiResult result = api.processNfcPayment(
                    card.pan,
                    card.lastFour,
                    card.cardBrand,
                    card.expiry,
                    amount,
                    currency,
                    card.entryMethod,
                    terminalId,
                    card.cryptogram
            );

            mMainHandler.post(() -> showResult(result, amount, currency));
        }).start();
    }

    // ── Result display ─────────────────────────────────────────────────────

    private void showResult(PrimestackApi.ApiResult result, double amount, String currency) {
        mPaymentInProgress = false;
        resultCard.setVisibility(View.VISIBLE);

        if (result.success) {
            tvResult.setText("✓  " + currency + " " + String.format(Locale.US, "%.2f", amount) + "  APPROVED");
            tvResult.setTextColor(Color.parseColor("#16A34A"));
            tvTxnId.setText("TXN: " + (result.transactionId != null ? result.transactionId : result.tapSessionId));
            setTapStatus("Approved ✓", "#16A34A");
            log("APPROVED TXN=" + result.transactionId + " " + result.processingTimeMs + "ms");

            // Reset after a few seconds
            mMainHandler.postDelayed(() -> {
                mCardData = null;
                btnCharge.setEnabled(false);
                btnCharge.setText("Tap Card to Charge");
                tvCardInfo.setVisibility(View.GONE);
                etAmount.setText("");
                setTapStatus("Ready — tap card to pay", "#94A3B8");
                resultCard.setVisibility(View.GONE);
            }, 4000);

        } else {
            tvResult.setText("✗  DECLINED");
            tvResult.setTextColor(Color.parseColor("#DC2626"));
            tvTxnId.setText(result.message != null ? result.message : "Payment not processed");
            setTapStatus("Declined — try again", "#EF4444");
            log("DECLINED: " + result.message);

            // Re-enable for retry
            mMainHandler.postDelayed(() -> {
                btnCharge.setEnabled(mCardData != null);
            }, 2000);
        }
    }

    // ── UI helpers ─────────────────────────────────────────────────────────

    private void setTapStatus(String text, String colorHex) {
        tvTapStatus.setText(text);
        try { tvTapStatus.setTextColor(Color.parseColor(colorHex)); } catch (Exception ignored) {}
    }

    private void postError(String message) {
        mMainHandler.post(() -> {
            setTapStatus("Error: " + message, "#EF4444");
            log("ERROR: " + message);
            mCardData = null;
            btnCharge.setEnabled(false);
        });
    }

    private void log(String message) {
        String ts = new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date());
        mMainHandler.post(() -> {
            String current = tvLog.getText().toString();
            String line = ts + " " + message + "\n";
            // Keep last 20 lines
            String[] lines = (line + current).split("\n");
            StringBuilder sb = new StringBuilder();
            int start = Math.max(0, lines.length - 20);
            for (int i = start; i < lines.length; i++) sb.append(lines[i]).append("\n");
            tvLog.setText(sb.toString());
        });
    }
}
