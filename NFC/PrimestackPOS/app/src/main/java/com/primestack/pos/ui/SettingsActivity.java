package com.primestack.pos.ui;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.primestack.pos.BuildConfig;
import com.primestack.pos.R;
import com.primestack.pos.network.PrimestackApi;

/**
 * SettingsActivity
 *
 * Allows the operator to configure:
 *   - Server URL  (default: BuildConfig.SERVER_BASE_URL)
 *   - Merchant secret key (ps_sec_…)
 *   - Terminal ID
 */
public class SettingsActivity extends AppCompatActivity {

    private com.google.android.material.textfield.TextInputEditText etServerUrl;
    private com.google.android.material.textfield.TextInputEditText etMerchantKey;
    private com.google.android.material.textfield.TextInputEditText etTerminalId;
    private android.widget.TextView tvConnectionResult;
    private SharedPreferences mPrefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);

        if (getSupportActionBar() != null) {
            getSupportActionBar().setDisplayHomeAsUpEnabled(true);
            getSupportActionBar().setTitle("POS Settings");
        }

        mPrefs = getSharedPreferences("pos_prefs", MODE_PRIVATE);

        etServerUrl    = findViewById(R.id.etServerUrl);
        etMerchantKey  = findViewById(R.id.etMerchantKey);
        etTerminalId   = findViewById(R.id.etTerminalId);
        tvConnectionResult = findViewById(R.id.tvConnectionResult);

        // Populate with saved values
        etServerUrl.setText(mPrefs.getString(
                getString(R.string.pref_server_url), BuildConfig.SERVER_BASE_URL));
        etMerchantKey.setText(mPrefs.getString(
                getString(R.string.pref_merchant_key), ""));
        etTerminalId.setText(mPrefs.getString(
                getString(R.string.pref_terminal_id), "TERM_POS_001"));

        findViewById(R.id.btnSaveSettings).setOnClickListener(v -> saveSettings());
        findViewById(R.id.btnTestConnection).setOnClickListener(v -> testConnection());
    }

    @Override
    public boolean onSupportNavigateUp() {
        finish();
        return true;
    }

    private void saveSettings() {
        String url  = text(etServerUrl);
        String key  = text(etMerchantKey);
        String term = text(etTerminalId);

        if (url.isEmpty()) {
            Toast.makeText(this, "Server URL is required", Toast.LENGTH_SHORT).show();
            return;
        }

        mPrefs.edit()
              .putString(getString(R.string.pref_server_url),    url)
              .putString(getString(R.string.pref_merchant_key),  key)
              .putString(getString(R.string.pref_terminal_id),   term)
              .apply();

        Toast.makeText(this, "Settings saved ✓", Toast.LENGTH_SHORT).show();
    }

    private void testConnection() {
        String url = text(etServerUrl);
        if (url.isEmpty()) {
            tvConnectionResult.setText("Enter a server URL first");
            return;
        }

        tvConnectionResult.setText("Testing…");
        String key = text(etMerchantKey);

        new Thread(() -> {
            PrimestackApi api = new PrimestackApi(url, key);
            PrimestackApi.ApiResult result = api.testConnection();
            String msg = result.success
                    ? "✓ Connected to PRIMESTACK server"
                    : "✗ Failed: " + result.message;
            runOnUiThread(() -> tvConnectionResult.setText(msg));
        }).start();
    }

    private String text(com.google.android.material.textfield.TextInputEditText et) {
        return et.getText() != null ? et.getText().toString().trim() : "";
    }
}
