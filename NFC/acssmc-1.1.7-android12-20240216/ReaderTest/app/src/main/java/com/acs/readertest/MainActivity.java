/*
 * Copyright (C) 2011-2024 Advanced Card Systems Ltd. All rights reserved.
 *
 * This software is the confidential and proprietary information of Advanced
 * Card Systems Ltd. ("Confidential Information").  You shall not disclose such
 * Confidential Information and shall use it only in accordance with the terms
 * of the license agreement you entered into with ACS.
 */

package com.acs.readertest;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.os.Bundle;
import android.text.method.ScrollingMovementMethod;
import android.view.WindowManager;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.PendingIntentCompat;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.DialogFragment;

import com.acs.smartcard.Features;
import com.acs.smartcard.PinModify;
import com.acs.smartcard.PinProperties;
import com.acs.smartcard.PinVerify;
import com.acs.smartcard.ReadKeyOption;
import com.acs.smartcard.Reader;
import com.acs.smartcard.TlvProperties;

import java.io.UnsupportedEncodingException;
import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Test program for ACS smart card readers.
 *
 * @author Godfrey Chung
 * @version 1.2, 16 Feb 2024
 */
public class MainActivity extends AppCompatActivity implements
        VerifyPinDialogFragment.VerifyPinDialogListener,
        ModifyPinDialogFragment.ModifyPinDialogListener,
        ReadKeyDialogFragment.ReadKeyDialogListener,
        DisplayLcdMessageDialogFragment.DisplayLcdMessageDialogListener {

    private static final String ACTION_USB_PERMISSION = "com.android.example.USB_PERMISSION";

    private static final String[] powerActionStrings = {"Power Down",
            "Cold Reset", "Warm Reset"};

    private static final String[] stateStrings = {"Unknown", "Absent",
            "Present", "Swallowed", "Powered", "Negotiable", "Specific"};

    private static final String[] featureStrings = {"FEATURE_UNKNOWN",
            "FEATURE_VERIFY_PIN_START", "FEATURE_VERIFY_PIN_FINISH",
            "FEATURE_MODIFY_PIN_START", "FEATURE_MODIFY_PIN_FINISH",
            "FEATURE_GET_KEY_PRESSED", "FEATURE_VERIFY_PIN_DIRECT",
            "FEATURE_MODIFY_PIN_DIRECT", "FEATURE_MCT_READER_DIRECT",
            "FEATURE_MCT_UNIVERSAL", "FEATURE_IFD_PIN_PROPERTIES",
            "FEATURE_ABORT", "FEATURE_SET_SPE_MESSAGE",
            "FEATURE_VERIFY_PIN_DIRECT_APP_ID",
            "FEATURE_MODIFY_PIN_DIRECT_APP_ID", "FEATURE_WRITE_DISPLAY",
            "FEATURE_GET_KEY", "FEATURE_IFD_DISPLAY_PROPERTIES",
            "FEATURE_GET_TLV_PROPERTIES", "FEATURE_CCID_ESC_COMMAND"};

    private static final String[] propertyStrings = {"Unknown", "wLcdLayout",
            "bEntryValidationCondition", "bTimeOut2", "wLcdMaxCharacters",
            "wLcdMaxLines", "bMinPINSize", "bMaxPINSize", "sFirmwareID",
            "bPPDUSupport", "dwMaxAPDUDataSize", "wIdVendor", "wIdProduct"};

    private static final String STATE_LOG = "log";
    private static final String STATE_VERIFY_PIN_BUTTON = "verify_pin_button";
    private static final String STATE_MODIFY_PIN_BUTTON = "modify_pin_button";

    /* PIN verify */
    private static final String STATE_PV_TIMEOUT = "pv_timeout";
    private static final String STATE_PV_TIMEOUT2 = "pv_timeout2";
    private static final String STATE_PV_FORMAT_STRING = "pv_format_string";
    private static final String STATE_PV_PIN_BLOCK_STRING = "pv_pin_block_string";
    private static final String STATE_PV_PIN_LENGTH_FORMAT = "pv_pin_length_format";
    private static final String STATE_PV_PIN_MAX_EXTRA_DIGIT = "pv_pin_max_extra_digit";
    private static final String STATE_PV_ENTRY_VALIDATION_CONDITION =
            "pv_entry_validation_condition";
    private static final String STATE_PV_NUMBER_MESSAGE = "pv_number_message";
    private static final String STATE_PV_LANG_ID = "pv_lang_id";
    private static final String STATE_PV_MSG_INDEX = "pv_msg_index";
    private static final String STATE_PV_TEO_PROLOGUE0 = "pv_teo_prologue0";
    private static final String STATE_PV_TEO_PROLOGUE1 = "pv_teo_prologue1";
    private static final String STATE_PV_TEO_PROLOGUE2 = "pv_teo_prologue2";
    private static final String STATE_PV_DATA = "pv_data";

    /* PIN modify */
    private static final String STATE_PM_TIMEOUT = "pm_timeout";
    private static final String STATE_PM_TIMEOUT2 = "pm_timeout2";
    private static final String STATE_PM_FORMAT_STRING = "pm_format_string";
    private static final String STATE_PM_PIN_BLOCK_STRING = "pm_pin_block_string";
    private static final String STATE_PM_PIN_LENGTH_FORMAT = "pm_pin_length_format";
    private static final String STATE_PM_INSERTION_OFFSET_OLD = "pm_insertion_offset_old";
    private static final String STATE_PM_INSERTION_OFFSET_NEW = "pm_insertion_offset_new";
    private static final String STATE_PM_PIN_MAX_EXTRA_DIGIT = "pm_pin_max_extra_digit";
    private static final String STATE_PM_CONFIRM_PIN = "pm_confirm_pin";
    private static final String STATE_PM_ENTRY_VALIDATION_CONDITION =
            "pm_entry_validation_condition";
    private static final String STATE_PM_NUMBER_MESSAGE = "pm_number_message";
    private static final String STATE_PM_LANG_ID = "pm_lang_id";
    private static final String STATE_PM_MSG_INDEX1 = "pm_msg_index1";
    private static final String STATE_PM_MSG_INDEX2 = "pm_msg_index2";
    private static final String STATE_PM_MSG_INDEX3 = "pm_msg_index3";
    private static final String STATE_PM_TEO_PROLOGUE0 = "pm_teo_prologue0";
    private static final String STATE_PM_TEO_PROLOGUE1 = "pm_teo_prologue1";
    private static final String STATE_PM_TEO_PROLOGUE2 = "pm_teo_prologue2";
    private static final String STATE_PM_DATA = "pm_data";

    /* Read key option */
    private static final String STATE_RK_TIMEOUT = "rk_timeout";
    private static final String STATE_RK_PIN_MAX_EXTRA_DIGIT = "rk_max_extra_digit";
    private static final String STATE_RK_KEY_RETURN_CONDITION = "rk_key_return_condition";
    private static final String STATE_RK_ECHO_LCD_START_POSITION = "rk_echo_lcd_start_position";
    private static final String STATE_RK_ECHO_LCD_MODE = "rk_echo_lcd_mode";

    private static final String STATE_LCD_MESSAGE = "lcd_message";

    private UsbManager mManager;
    private Reader mReader;
    private PendingIntent mPermissionIntent;

    private static final int MAX_LINES = 1000;
    private static final char[] HEX_DIGITS = "0123456789ABCDEF".toCharArray();
    private TextView mResponseTextView;
    private Spinner mReaderSpinner;
    private ArrayAdapter<String> mReaderAdapter;
    private Spinner mSlotSpinner;
    private ArrayAdapter<String> mSlotAdapter;
    private Spinner mPowerSpinner;
    private Button mListButton;
    private Button mOpenButton;
    private Button mCloseButton;
    private Button mGetStateButton;
    private Button mPowerButton;
    private Button mGetAtrButton;
    private CheckBox mT0CheckBox;
    private CheckBox mT1CheckBox;
    private Button mSetProtocolButton;
    private Button mGetProtocolButton;
    private EditText mCommandEditText;
    private Button mTransmitButton;
    private EditText mControlEditText;
    private Button mControlButton;
    private Button mGetFeaturesButton;
    private Button mVerifyPinButton;
    private Button mModifyPinButton;
    private Button mReadKeyButton;
    private Button mDisplayLcdMessageButton;

    private final Features mFeatures = new Features();
    private final PinVerify mPinVerify = new PinVerify();
    private final PinModify mPinModify = new PinModify();
    private final ReadKeyOption mReadKeyOption = new ReadKeyOption();
    private String mLcdMessage;

    private final BroadcastReceiver mReceiver = new BroadcastReceiver() {

        public void onReceive(Context context, Intent intent) {

            String action = intent.getAction();

            if (ACTION_USB_PERMISSION.equals(action)) {

                synchronized (this) {

                    UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);

                    if (intent.getBooleanExtra(
                            UsbManager.EXTRA_PERMISSION_GRANTED, false)) {

                        if (device != null) {

                            // Open reader
                            logMsg("Opening reader: " + device.getDeviceName()
                                    + "...");
                            new Thread(new OpenTask(device)).start();
                        }

                    } else {

                        logMsg("Permission denied for device " + device);

                        // Enable open button
                        mOpenButton.setEnabled(true);
                    }
                }

            } else if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {

                synchronized (this) {

                    // Update reader list
                    mReaderAdapter.clear();
                    for (UsbDevice device : mManager.getDeviceList().values()) {
                        if (mReader.isSupported(device)) {
                            mReaderAdapter.add(device.getDeviceName());
                        }
                    }

                    UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);

                    if (device != null && device.equals(mReader.getDevice())) {

                        // Disable buttons
                        mCloseButton.setEnabled(false);
                        mSlotSpinner.setEnabled(false);
                        mGetStateButton.setEnabled(false);
                        mPowerSpinner.setEnabled(false);
                        mPowerButton.setEnabled(false);
                        mGetAtrButton.setEnabled(false);
                        mT0CheckBox.setEnabled(false);
                        mT1CheckBox.setEnabled(false);
                        mSetProtocolButton.setEnabled(false);
                        mGetProtocolButton.setEnabled(false);
                        mTransmitButton.setEnabled(false);
                        mControlButton.setEnabled(false);
                        mGetFeaturesButton.setEnabled(false);
                        mVerifyPinButton.setEnabled(false);
                        mModifyPinButton.setEnabled(false);
                        mReadKeyButton.setEnabled(false);
                        mDisplayLcdMessageButton.setEnabled(false);

                        // Clear slot items
                        mSlotAdapter.clear();

                        // Close reader
                        logMsg("Closing reader...");
                        new Thread(new CloseTask()).start();
                    }
                }
            }
        }
    };

    private class OpenTask implements Runnable {

        private final UsbDevice mDevice;

        public OpenTask(UsbDevice device) {
            mDevice = device;
        }

        @Override
        public void run() {

            Exception result = doInBackground(mDevice);
            runOnUiThread(() -> onPostExecute(result));
        }

        private Exception doInBackground(UsbDevice... params) {

            Exception result = null;

            try {

                mReader.open(params[0]);

            } catch (Exception e) {

                result = e;
            }

            return result;
        }

        private void onPostExecute(Exception result) {

            if (result != null) {

                logMsg(result.toString());

            } else {

                logMsg("Reader name: " + mReader.getReaderName());

                int numSlots = mReader.getNumSlots();
                logMsg("Number of slots: " + numSlots);

                // Add slot items
                mSlotAdapter.clear();
                for (int i = 0; i < numSlots; i++) {
                    mSlotAdapter.add(Integer.toString(i));
                }

                // Remove all control codes
                mFeatures.clear();

                // Enable buttons
                mCloseButton.setEnabled(true);
                mSlotSpinner.setEnabled(true);
                mGetStateButton.setEnabled(true);
                mPowerSpinner.setEnabled(true);
                mPowerButton.setEnabled(true);
                mGetAtrButton.setEnabled(true);
                mT0CheckBox.setEnabled(true);
                mT1CheckBox.setEnabled(true);
                mSetProtocolButton.setEnabled(true);
                mGetProtocolButton.setEnabled(true);
                mTransmitButton.setEnabled(true);
                mControlButton.setEnabled(true);
                mGetFeaturesButton.setEnabled(true);
                mReadKeyButton.setEnabled(true);
                mDisplayLcdMessageButton.setEnabled(true);
            }
        }
    }

    private class CloseTask implements Runnable {

        @Override
        public void run() {

            Void result = doInBackground();
            runOnUiThread(() -> onPostExecute(result));
        }

        private Void doInBackground(Void... params) {

            mReader.close();
            return null;
        }

        private void onPostExecute(Void result) {
            mOpenButton.setEnabled(true);
        }
    }

    private static class PowerParams {

        public int slotNum;
        public int action;
    }

    private static class PowerResult {

        public byte[] atr;
        public Exception e;
    }

    private class PowerTask implements Runnable {

        private final PowerParams mParams;

        public PowerTask(PowerParams params) {
            mParams = params;
        }

        @Override
        public void run() {

            PowerResult result = doInBackground(mParams);
            runOnUiThread(() -> onPostExecute(result));
        }

        private PowerResult doInBackground(PowerParams... params) {

            PowerResult result = new PowerResult();

            try {

                result.atr = mReader.power(params[0].slotNum, params[0].action);

            } catch (Exception e) {

                result.e = e;
            }

            return result;
        }

        private void onPostExecute(PowerResult result) {

            if (result.e != null) {

                logMsg(result.e.toString());

            } else {

                // Show ATR
                if (result.atr != null) {

                    logMsg("ATR:");
                    logBuffer(result.atr, result.atr.length);

                } else {

                    logMsg("ATR: None");
                }
            }
        }
    }

    private static class SetProtocolParams {

        public int slotNum;
        public int preferredProtocols;
    }

    private static class SetProtocolResult {

        public int activeProtocol;
        public Exception e;
    }

    private class SetProtocolTask implements Runnable {

        private final SetProtocolParams mParams;

        public SetProtocolTask(SetProtocolParams params) {
            mParams = params;
        }

        @Override
        public void run() {

            SetProtocolResult result = doInBackground(mParams);
            runOnUiThread(() -> onPostExecute(result));
        }

        private SetProtocolResult doInBackground(SetProtocolParams... params) {

            SetProtocolResult result = new SetProtocolResult();

            try {

                result.activeProtocol = mReader.setProtocol(params[0].slotNum,
                        params[0].preferredProtocols);

            } catch (Exception e) {

                result.e = e;
            }

            return result;
        }

        private void onPostExecute(SetProtocolResult result) {

            if (result.e != null) {

                logMsg(result.e.toString());

            } else {

                String activeProtocolString = "Active Protocol: ";

                switch (result.activeProtocol) {

                    case Reader.PROTOCOL_T0:
                        activeProtocolString += "T=0";
                        break;

                    case Reader.PROTOCOL_T1:
                        activeProtocolString += "T=1";
                        break;

                    default:
                        activeProtocolString += "Unknown";
                        break;
                }

                // Show active protocol
                logMsg(activeProtocolString);
            }
        }
    }

    private static class TransmitParams {

        public int slotNum;
        public int controlCode;
        public String commandString;
    }

    private static class TransmitProgress {

        public int controlCode;
        public byte[] command;
        public int commandLength;
        public byte[] response;
        public int responseLength;
        public Exception e;
    }

    private class TransmitTask implements Runnable {

        private final TransmitParams mParams;

        public TransmitTask(TransmitParams params) {
            mParams = params;
        }

        @Override
        public void run() {
            doInBackground(mParams);
        }

        private void doInBackground(TransmitParams... params) {

            TransmitProgress progress;

            byte[] command;
            byte[] response;
            int responseLength;
            int foundIndex;
            int startIndex = 0;

            do {

                // Find carriage return
                foundIndex = params[0].commandString.indexOf('\n', startIndex);
                if (foundIndex >= 0) {
                    command = Hex.toByteArray(params[0].commandString.substring(
                            startIndex, foundIndex));
                } else {
                    command = Hex.toByteArray(params[0].commandString
                            .substring(startIndex));
                }

                // Set next start index
                startIndex = foundIndex + 1;

                response = new byte[65538];
                progress = new TransmitProgress();
                progress.controlCode = params[0].controlCode;
                try {

                    if (params[0].controlCode < 0) {

                        // Transmit APDU
                        responseLength = mReader.transmit(params[0].slotNum,
                                command, command.length, response,
                                response.length);

                    } else {

                        // Transmit control command
                        responseLength = mReader.control(params[0].slotNum,
                                params[0].controlCode, command, command.length,
                                response, response.length);
                    }

                    progress.command = command;
                    progress.commandLength = command.length;
                    progress.response = response;
                    progress.responseLength = responseLength;
                    progress.e = null;

                } catch (Exception e) {

                    progress.command = null;
                    progress.commandLength = 0;
                    progress.response = null;
                    progress.responseLength = 0;
                    progress.e = e;
                }

                TransmitProgress finalProgress = progress;
                runOnUiThread(() -> onProgressUpdate(finalProgress));

            } while (foundIndex >= 0);
        }

        private void onProgressUpdate(TransmitProgress... progress) {

            if (progress[0].e != null) {

                logMsg(progress[0].e.toString());

            } else {

                logMsg("Command:");
                logBuffer(progress[0].command, progress[0].commandLength);

                logMsg("Response:");
                logBuffer(progress[0].response, progress[0].responseLength);

                if (progress[0].response != null
                        && progress[0].responseLength > 0) {

                    int controlCode;
                    int i;

                    // Show control codes for IOCTL_GET_FEATURE_REQUEST
                    if (progress[0].controlCode == Reader.IOCTL_GET_FEATURE_REQUEST) {

                        mFeatures.fromByteArray(progress[0].response,
                                progress[0].responseLength);

                        logMsg("Features:");
                        for (i = Features.FEATURE_VERIFY_PIN_START;
                                i <= Features.FEATURE_CCID_ESC_COMMAND; i++) {

                            controlCode = mFeatures.getControlCode(i);
                            if (controlCode >= 0) {
                                logMsg("Control Code: " + controlCode + " ("
                                        + featureStrings[i] + ")");
                            }
                        }

                        // Enable buttons if features are supported
                        mVerifyPinButton
                                .setEnabled(mFeatures
                                        .getControlCode(Features.FEATURE_VERIFY_PIN_DIRECT) >= 0);
                        mModifyPinButton
                                .setEnabled(mFeatures
                                        .getControlCode(Features.FEATURE_MODIFY_PIN_DIRECT) >= 0);
                    }

                    controlCode = mFeatures
                            .getControlCode(Features.FEATURE_IFD_PIN_PROPERTIES);
                    if (controlCode >= 0
                            && progress[0].controlCode == controlCode) {

                        PinProperties pinProperties = new PinProperties(
                                progress[0].response,
                                progress[0].responseLength);

                        logMsg("PIN Properties:");
                        logMsg("LCD Layout: "
                                + Hex.toHexString(pinProperties.getLcdLayout()));
                        logMsg("Entry Validation Condition: "
                                + Hex.toHexString(pinProperties
                                .getEntryValidationCondition()));
                        logMsg("Timeout 2: "
                                + Hex.toHexString(pinProperties.getTimeOut2()));
                    }

                    controlCode = mFeatures
                            .getControlCode(Features.FEATURE_GET_TLV_PROPERTIES);
                    if (controlCode >= 0
                            && progress[0].controlCode == controlCode) {

                        TlvProperties readerProperties = new TlvProperties(
                                progress[0].response,
                                progress[0].responseLength);

                        Object property;
                        logMsg("TLV Properties:");
                        for (i = TlvProperties.PROPERTY_wLcdLayout;
                                i <= TlvProperties.PROPERTY_wIdProduct; i++) {

                            property = readerProperties.getProperty(i);
                            if (property instanceof Integer) {
                                logMsg(propertyStrings[i] + ": "
                                        + Hex.toHexString((Integer) property));
                            } else if (property instanceof String) {
                                logMsg(propertyStrings[i] + ": " + property);
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * Called when the activity is first created.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {

        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Get USB manager
        mManager = UsbReader.getInstance(this).getManager();

        // Initialize reader
        mReader = UsbReader.getInstance(this).getReader();
        mReader.setOnStateChangeListener((slotNum, prevState, currState) -> {

            if (prevState < Reader.CARD_UNKNOWN
                    || prevState > Reader.CARD_SPECIFIC) {
                prevState = Reader.CARD_UNKNOWN;
            }

            if (currState < Reader.CARD_UNKNOWN
                    || currState > Reader.CARD_SPECIFIC) {
                currState = Reader.CARD_UNKNOWN;
            }

            // Create output string
            final String outputString = "Slot " + slotNum + ": "
                    + stateStrings[prevState] + " -> "
                    + stateStrings[currState];

            // Show output
            runOnUiThread(() -> logMsg(outputString));
        });

        // Register receiver for USB permission
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            flags |= PendingIntent.FLAG_ALLOW_UNSAFE_IMPLICIT_INTENT;
        }
        mPermissionIntent = PendingIntentCompat.getBroadcast(this, 0,
                new Intent(ACTION_USB_PERMISSION), flags, true);
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_USB_PERMISSION);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        ContextCompat.registerReceiver(this, mReceiver, filter, ContextCompat.RECEIVER_EXPORTED);

        // Initialize response text view
        mResponseTextView = findViewById(R.id.main_text_view_response);
        mResponseTextView.setMovementMethod(new ScrollingMovementMethod());
        mResponseTextView.setText("");

        // Initialize reader spinner
        mReaderAdapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item);
        for (UsbDevice device : mManager.getDeviceList().values()) {
            if (mReader.isSupported(device)) {
                mReaderAdapter.add(device.getDeviceName());
            }
        }
        mReaderSpinner = findViewById(R.id.main_spinner_reader);
        mReaderSpinner.setAdapter(mReaderAdapter);

        // Initialize slot spinner
        mSlotAdapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item);
        mSlotSpinner = findViewById(R.id.main_spinner_slot);
        mSlotSpinner.setAdapter(mSlotAdapter);

        // Initialize power spinner
        ArrayAdapter<String> powerAdapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, powerActionStrings);
        mPowerSpinner = findViewById(R.id.main_spinner_power);
        mPowerSpinner.setAdapter(powerAdapter);
        mPowerSpinner.setSelection(Reader.CARD_WARM_RESET);

        // Initialize list button
        mListButton = findViewById(R.id.main_button_list);
        mListButton.setOnClickListener(v -> {

            mReaderAdapter.clear();
            for (UsbDevice device : mManager.getDeviceList().values()) {
                if (mReader.isSupported(device)) {
                    mReaderAdapter.add(device.getDeviceName());
                }
            }
        });

        // Initialize open button
        mOpenButton = findViewById(R.id.main_button_open);
        mOpenButton.setOnClickListener(v -> {

            boolean requested = false;

            // Disable open button
            mOpenButton.setEnabled(false);

            String deviceName = (String) mReaderSpinner.getSelectedItem();

            if (deviceName != null) {

                // For each device
                for (UsbDevice device : mManager.getDeviceList().values()) {

                    // If device name is found
                    if (deviceName.equals(device.getDeviceName())) {

                        // Request permission
                        mManager.requestPermission(device,
                                mPermissionIntent);

                        requested = true;
                        break;
                    }
                }
            }

            if (!requested) {

                // Enable open button
                mOpenButton.setEnabled(true);
            }
        });

        // Initialize close button
        mCloseButton = findViewById(R.id.main_button_close);
        mCloseButton.setOnClickListener(v -> {

            // Disable buttons
            mCloseButton.setEnabled(false);
            mSlotSpinner.setEnabled(false);
            mGetStateButton.setEnabled(false);
            mPowerSpinner.setEnabled(false);
            mPowerButton.setEnabled(false);
            mGetAtrButton.setEnabled(false);
            mT0CheckBox.setEnabled(false);
            mT1CheckBox.setEnabled(false);
            mSetProtocolButton.setEnabled(false);
            mGetProtocolButton.setEnabled(false);
            mTransmitButton.setEnabled(false);
            mControlButton.setEnabled(false);
            mGetFeaturesButton.setEnabled(false);
            mVerifyPinButton.setEnabled(false);
            mModifyPinButton.setEnabled(false);
            mReadKeyButton.setEnabled(false);
            mDisplayLcdMessageButton.setEnabled(false);

            // Clear slot items
            mSlotAdapter.clear();

            // Close reader
            logMsg("Closing reader...");
            new Thread(new CloseTask()).start();
        });

        // Initialize get state button
        mGetStateButton = findViewById(R.id.main_button_get_state);
        mGetStateButton.setOnClickListener(v -> {

            // Get slot number
            int slotNum = mSlotSpinner.getSelectedItemPosition();

            // If slot is selected
            if (slotNum != Spinner.INVALID_POSITION) {

                try {

                    // Get state
                    logMsg("Slot " + slotNum + ": Getting state...");
                    int state = mReader.getState(slotNum);

                    if (state < Reader.CARD_UNKNOWN
                            || state > Reader.CARD_SPECIFIC) {
                        state = Reader.CARD_UNKNOWN;
                    }

                    logMsg("State: " + stateStrings[state]);

                } catch (IllegalArgumentException e) {

                    logMsg(e.toString());
                }
            }
        });

        // Initialize power button
        mPowerButton = findViewById(R.id.main_button_power);
        mPowerButton.setOnClickListener(v -> {

            // Get slot number
            int slotNum = mSlotSpinner.getSelectedItemPosition();

            // Get action number
            int actionNum = mPowerSpinner.getSelectedItemPosition();

            // If slot and action are selected
            if (slotNum != Spinner.INVALID_POSITION
                    && actionNum != Spinner.INVALID_POSITION) {

                if (actionNum < Reader.CARD_POWER_DOWN
                        || actionNum > Reader.CARD_WARM_RESET) {
                    actionNum = Reader.CARD_WARM_RESET;
                }

                // Set parameters
                PowerParams params = new PowerParams();
                params.slotNum = slotNum;
                params.action = actionNum;

                // Perform power action
                logMsg("Slot " + slotNum + ": "
                        + powerActionStrings[actionNum] + "...");
                new Thread(new PowerTask(params)).start();
            }
        });

        mGetAtrButton = findViewById(R.id.main_button_get_atr);
        mGetAtrButton.setOnClickListener(v -> {

            // Get slot number
            int slotNum = mSlotSpinner.getSelectedItemPosition();

            // If slot is selected
            if (slotNum != Spinner.INVALID_POSITION) {

                try {

                    // Get ATR
                    logMsg("Slot " + slotNum + ": Getting ATR...");
                    byte[] atr = mReader.getAtr(slotNum);

                    // Show ATR
                    if (atr != null) {

                        logMsg("ATR:");
                        logBuffer(atr, atr.length);

                    } else {

                        logMsg("ATR: None");
                    }

                } catch (IllegalArgumentException e) {

                    logMsg(e.toString());
                }
            }
        });

        // Initialize T=0 check box
        mT0CheckBox = findViewById(R.id.main_check_box_t0);
        mT0CheckBox.setChecked(true);

        // Initialize T=1 check box
        mT1CheckBox = findViewById(R.id.main_check_box_t1);
        mT1CheckBox.setChecked(true);

        // Initialize set protocol button
        mSetProtocolButton = findViewById(R.id.main_button_set_protocol);
        mSetProtocolButton.setOnClickListener(v -> {

            // Get slot number
            int slotNum = mSlotSpinner.getSelectedItemPosition();

            // If slot is selected
            if (slotNum != Spinner.INVALID_POSITION) {

                int preferredProtocols = Reader.PROTOCOL_UNDEFINED;
                String preferredProtocolsString = "";

                if (mT0CheckBox.isChecked()) {

                    preferredProtocols |= Reader.PROTOCOL_T0;
                    preferredProtocolsString = "T=0";
                }

                if (mT1CheckBox.isChecked()) {

                    preferredProtocols |= Reader.PROTOCOL_T1;
                    if (!preferredProtocolsString.equals("")) {
                        preferredProtocolsString += "/";
                    }

                    preferredProtocolsString += "T=1";
                }

                if (preferredProtocolsString.equals("")) {
                    preferredProtocolsString = "None";
                }

                // Set Parameters
                SetProtocolParams params = new SetProtocolParams();
                params.slotNum = slotNum;
                params.preferredProtocols = preferredProtocols;

                // Set protocol
                logMsg("Slot " + slotNum + ": Setting protocol to "
                        + preferredProtocolsString + "...");
                new Thread(new SetProtocolTask(params)).start();
            }
        });

        // Initialize get active protocol button
        mGetProtocolButton = findViewById(R.id.main_button_get_protocol);
        mGetProtocolButton.setOnClickListener(v -> {

            // Get slot number
            int slotNum = mSlotSpinner.getSelectedItemPosition();

            // If slot is selected
            if (slotNum != Spinner.INVALID_POSITION) {

                try {

                    // Get active protocol
                    logMsg("Slot " + slotNum
                            + ": Getting active protocol...");
                    int activeProtocol = mReader.getProtocol(slotNum);

                    // Show active protocol
                    String activeProtocolString = "Active Protocol: ";
                    switch (activeProtocol) {

                        case Reader.PROTOCOL_T0:
                            activeProtocolString += "T=0";
                            break;

                        case Reader.PROTOCOL_T1:
                            activeProtocolString += "T=1";
                            break;

                        default:
                            activeProtocolString += "Unknown";
                            break;
                    }

                    logMsg(activeProtocolString);

                } catch (IllegalArgumentException e) {

                    logMsg(e.toString());
                }
            }
        });

        // Initialize command edit text
        mCommandEditText = findViewById(R.id.main_edit_text_command);

        // Initialize transmit button
        mTransmitButton = findViewById(R.id.main_button_transmit);
        mTransmitButton.setOnClickListener(v -> {

            // Get slot number
            int slotNum = mSlotSpinner.getSelectedItemPosition();

            // If slot is selected
            if (slotNum != Spinner.INVALID_POSITION) {

                // Set parameters
                TransmitParams params = new TransmitParams();
                params.slotNum = slotNum;
                params.controlCode = -1;
                params.commandString = mCommandEditText.getText()
                        .toString();

                // Transmit APDU
                logMsg("Slot " + slotNum + ": Transmitting APDU...");
                new Thread(new TransmitTask(params)).start();
            }
        });

        // Initialize control edit text
        mControlEditText = findViewById(R.id.main_edit_text_control);
        mControlEditText.setText(String.format(Locale.US, "%d", Reader.IOCTL_CCID_ESCAPE));

        // Initialize control button
        mControlButton = findViewById(R.id.main_button_control);
        mControlButton.setOnClickListener(v -> {

            // Get slot number
            int slotNum = mSlotSpinner.getSelectedItemPosition();

            // If slot is selected
            if (slotNum != Spinner.INVALID_POSITION) {

                // Get control code
                int controlCode;
                try {

                    controlCode = Integer.parseInt(mControlEditText
                            .getText().toString());

                } catch (NumberFormatException e) {

                    controlCode = Reader.IOCTL_CCID_ESCAPE;
                }

                // Set parameters
                TransmitParams params = new TransmitParams();
                params.slotNum = slotNum;
                params.controlCode = controlCode;
                params.commandString = mCommandEditText.getText()
                        .toString();

                // Transmit control command
                logMsg("Slot " + slotNum
                        + ": Transmitting control command (Control Code: "
                        + params.controlCode + ")...");
                new Thread(new TransmitTask(params)).start();
            }
        });

        // Initialize get features button
        mGetFeaturesButton = findViewById(R.id.main_button_get_features);
        mGetFeaturesButton.setOnClickListener(v -> {

            // Get slot number
            int slotNum = mSlotSpinner.getSelectedItemPosition();

            // If slot is selected
            if (slotNum != Spinner.INVALID_POSITION) {

                // Set parameters
                TransmitParams params = new TransmitParams();
                params.slotNum = slotNum;
                params.controlCode = Reader.IOCTL_GET_FEATURE_REQUEST;
                params.commandString = "";

                // Transmit control command
                logMsg("Slot " + slotNum
                        + ": Getting features (Control Code: "
                        + params.controlCode + ")...");
                new Thread(new TransmitTask(params)).start();
            }
        });

        // Initialize verify pin button
        mVerifyPinButton = findViewById(R.id.main_button_verify_pin);
        mVerifyPinButton.setOnClickListener(v -> {

            /* Initialize the dialog data. */
            VerifyPinDialogFragment fragment = new VerifyPinDialogFragment();
            PinVerify pinVerify = fragment.getPinVerify();
            pinVerify.setTimeOut(mPinVerify.getTimeOut());
            pinVerify.setTimeOut2(mPinVerify.getTimeOut2());
            pinVerify.setFormatString(mPinVerify.getFormatString());
            pinVerify.setPinBlockString(mPinVerify.getPinBlockString());
            pinVerify.setPinLengthFormat(mPinVerify.getPinLengthFormat());
            pinVerify.setPinMaxExtraDigit(mPinVerify.getPinMaxExtraDigit());
            pinVerify.setEntryValidationCondition(mPinVerify.getEntryValidationCondition());
            pinVerify.setNumberMessage(mPinVerify.getNumberMessage());
            pinVerify.setLangId(mPinVerify.getLangId());
            pinVerify.setMsgIndex(mPinVerify.getMsgIndex());
            pinVerify.setTeoPrologue(0, mPinVerify.getTeoPrologue(0));
            pinVerify.setTeoPrologue(1, mPinVerify.getTeoPrologue(1));
            pinVerify.setTeoPrologue(2, mPinVerify.getTeoPrologue(2));
            byte[] pinVerifyData = mPinVerify.getData();
            if ((pinVerifyData != null) && (pinVerifyData.length > 0)) {
                pinVerify.setData(pinVerifyData, pinVerifyData.length);
            }

            /* Show the dialog. */
            fragment.show(getSupportFragmentManager(), "verify_pin");
        });

        // Initialize modify pin button
        mModifyPinButton = findViewById(R.id.main_button_modify_pin);
        mModifyPinButton.setOnClickListener(v -> {

            /* Initialize the dialog data. */
            ModifyPinDialogFragment fragment = new ModifyPinDialogFragment();
            PinModify pinModify = fragment.getPinModify();
            pinModify.setTimeOut(mPinModify.getTimeOut());
            pinModify.setTimeOut2(mPinModify.getTimeOut2());
            pinModify.setFormatString(mPinModify.getFormatString());
            pinModify.setPinBlockString(mPinModify.getPinBlockString());
            pinModify.setPinLengthFormat(mPinModify.getPinLengthFormat());
            pinModify.setInsertionOffsetOld(mPinModify.getInsertionOffsetOld());
            pinModify.setInsertionOffsetNew(mPinModify.getInsertionOffsetNew());
            pinModify.setPinMaxExtraDigit(mPinModify.getPinMaxExtraDigit());
            pinModify.setConfirmPin(mPinModify.getConfirmPin());
            pinModify.setEntryValidationCondition(mPinModify.getEntryValidationCondition());
            pinModify.setNumberMessage(mPinModify.getNumberMessage());
            pinModify.setLangId(mPinModify.getLangId());
            pinModify.setMsgIndex1(mPinModify.getMsgIndex1());
            pinModify.setMsgIndex2(mPinModify.getMsgIndex2());
            pinModify.setMsgIndex3(mPinModify.getMsgIndex3());
            pinModify.setTeoPrologue(0, mPinModify.getTeoPrologue(0));
            pinModify.setTeoPrologue(1, mPinModify.getTeoPrologue(1));
            pinModify.setTeoPrologue(2, mPinModify.getTeoPrologue(2));
            byte[] pinModifyData = mPinModify.getData();
            if ((pinModifyData != null) && (pinModifyData.length > 0)) {
                pinModify.setData(pinModifyData, pinModifyData.length);
            }

            /* Show the dialog. */
            fragment.show(getSupportFragmentManager(), "modify_pin");
        });

        // Initialize read key button
        mReadKeyButton = findViewById(R.id.main_button_read_key);
        mReadKeyButton.setOnClickListener(v -> {

            /* Initialize the dialog data. */
            ReadKeyDialogFragment fragment = new ReadKeyDialogFragment();
            ReadKeyOption readKeyOption = fragment.getReadKeyOption();
            readKeyOption.setTimeOut(mReadKeyOption.getTimeOut());
            readKeyOption.setPinMaxExtraDigit(mReadKeyOption.getPinMaxExtraDigit());
            readKeyOption.setKeyReturnCondition(mReadKeyOption.getKeyReturnCondition());
            readKeyOption.setEchoLcdStartPosition(mReadKeyOption.getEchoLcdStartPosition());
            readKeyOption.setEchoLcdMode(mReadKeyOption.getEchoLcdMode());

            /* Show the dialog. */
            fragment.show(getSupportFragmentManager(), "read_key");
        });

        // Initialize display LCD message button
        mDisplayLcdMessageButton = findViewById(R.id.main_button_display_lcd_message);
        mDisplayLcdMessageButton.setOnClickListener(v -> {

            /* Initialize the dialog data. */
            DisplayLcdMessageDialogFragment fragment = new DisplayLcdMessageDialogFragment();
            fragment.setMessage(mLcdMessage);

            /* Show the dialog. */
            fragment.show(getSupportFragmentManager(), "display_lcd_message");
        });

        /* Restore the state. */
        if (savedInstanceState != null) {

            /* UI */
            mResponseTextView.setText(savedInstanceState.getCharSequence(STATE_LOG));
            mVerifyPinButton.setEnabled(savedInstanceState.getBoolean(STATE_VERIFY_PIN_BUTTON));
            mModifyPinButton.setEnabled(savedInstanceState.getBoolean(STATE_MODIFY_PIN_BUTTON));

            /* PIN verify */
            mPinVerify.setTimeOut(savedInstanceState.getInt(STATE_PV_TIMEOUT));
            mPinVerify.setTimeOut2(savedInstanceState.getInt(STATE_PV_TIMEOUT2));
            mPinVerify.setFormatString(savedInstanceState.getInt(STATE_PV_FORMAT_STRING));
            mPinVerify.setPinBlockString(savedInstanceState.getInt(STATE_PV_PIN_BLOCK_STRING));
            mPinVerify.setPinLengthFormat(savedInstanceState.getInt(STATE_PV_PIN_LENGTH_FORMAT));
            mPinVerify.setPinMaxExtraDigit(savedInstanceState.getInt(STATE_PV_PIN_MAX_EXTRA_DIGIT));
            mPinVerify.setEntryValidationCondition(
                    savedInstanceState.getInt(STATE_PV_ENTRY_VALIDATION_CONDITION));
            mPinVerify.setNumberMessage(savedInstanceState.getInt(STATE_PV_NUMBER_MESSAGE));
            mPinVerify.setLangId(savedInstanceState.getInt(STATE_PV_LANG_ID));
            mPinVerify.setMsgIndex(savedInstanceState.getInt(STATE_PV_MSG_INDEX));
            mPinVerify.setTeoPrologue(0, savedInstanceState.getInt(STATE_PV_TEO_PROLOGUE0));
            mPinVerify.setTeoPrologue(1, savedInstanceState.getInt(STATE_PV_TEO_PROLOGUE1));
            mPinVerify.setTeoPrologue(2, savedInstanceState.getInt(STATE_PV_TEO_PROLOGUE2));
            byte[] pinVerifyData = savedInstanceState.getByteArray(STATE_PV_DATA);
            if ((pinVerifyData != null) && (pinVerifyData.length > 0)) {
                mPinVerify.setData(pinVerifyData, pinVerifyData.length);
            }

            /* PIN modify */
            mPinModify.setTimeOut(savedInstanceState.getInt(STATE_PM_TIMEOUT));
            mPinModify.setTimeOut2(savedInstanceState.getInt(STATE_PM_TIMEOUT2));
            mPinModify.setFormatString(savedInstanceState.getInt(STATE_PM_FORMAT_STRING));
            mPinModify.setPinBlockString(savedInstanceState.getInt(STATE_PM_PIN_BLOCK_STRING));
            mPinModify.setPinLengthFormat(savedInstanceState.getInt(STATE_PM_PIN_LENGTH_FORMAT));
            mPinModify.setInsertionOffsetOld(
                    savedInstanceState.getInt(STATE_PM_INSERTION_OFFSET_OLD));
            mPinModify.setInsertionOffsetNew(
                    savedInstanceState.getInt(STATE_PM_INSERTION_OFFSET_NEW));
            mPinModify.setPinMaxExtraDigit(savedInstanceState.getInt(STATE_PM_PIN_MAX_EXTRA_DIGIT));
            mPinModify.setConfirmPin(savedInstanceState.getInt(STATE_PM_CONFIRM_PIN));
            mPinModify.setEntryValidationCondition(
                    savedInstanceState.getInt(STATE_PM_ENTRY_VALIDATION_CONDITION));
            mPinModify.setNumberMessage(savedInstanceState.getInt(STATE_PM_NUMBER_MESSAGE));
            mPinModify.setLangId(savedInstanceState.getInt(STATE_PM_LANG_ID));
            mPinModify.setMsgIndex1(savedInstanceState.getInt(STATE_PM_MSG_INDEX1));
            mPinModify.setMsgIndex2(savedInstanceState.getInt(STATE_PM_MSG_INDEX2));
            mPinModify.setMsgIndex3(savedInstanceState.getInt(STATE_PM_MSG_INDEX3));
            mPinModify.setTeoPrologue(0, savedInstanceState.getInt(STATE_PM_TEO_PROLOGUE0));
            mPinModify.setTeoPrologue(1, savedInstanceState.getInt(STATE_PM_TEO_PROLOGUE1));
            mPinModify.setTeoPrologue(2, savedInstanceState.getInt(STATE_PM_TEO_PROLOGUE2));
            byte[] pinModifyData = savedInstanceState.getByteArray(STATE_PM_DATA);
            if ((pinModifyData != null) && (pinModifyData.length > 0)) {
                mPinModify.setData(pinModifyData, pinModifyData.length);
            }

            /* Read key option */
            mReadKeyOption.setTimeOut(savedInstanceState.getInt(STATE_RK_TIMEOUT));
            mReadKeyOption.setPinMaxExtraDigit(
                    savedInstanceState.getInt(STATE_RK_PIN_MAX_EXTRA_DIGIT));
            mReadKeyOption.setKeyReturnCondition(
                    savedInstanceState.getInt(STATE_RK_KEY_RETURN_CONDITION));
            mReadKeyOption.setEchoLcdStartPosition(
                    savedInstanceState.getInt(STATE_RK_ECHO_LCD_START_POSITION));
            mReadKeyOption.setEchoLcdMode(savedInstanceState.getInt(STATE_RK_ECHO_LCD_MODE));

            /* LCD message */
            mLcdMessage = savedInstanceState.getString(STATE_LCD_MESSAGE);

        } else {

            // PIN verification command (ACOS3)
            byte[] pinVerifyData = {(byte) 0x80, 0x20, 0x06, 0x00, 0x08,
                    (byte) 0xFF, (byte) 0xFF, (byte) 0xFF, (byte) 0xFF,
                    (byte) 0xFF, (byte) 0xFF, (byte) 0xFF, (byte) 0xFF};

            // Initialize PIN verify structure (ACOS3)
            mPinVerify.setTimeOut(0);
            mPinVerify.setTimeOut2(0);
            mPinVerify.setFormatString(0);
            mPinVerify.setPinBlockString(0x08);
            mPinVerify.setPinLengthFormat(0);
            mPinVerify.setPinMaxExtraDigit(0x0408);
            mPinVerify.setEntryValidationCondition(0x03);
            mPinVerify.setNumberMessage(0x01);
            mPinVerify.setLangId(0x0409);
            mPinVerify.setMsgIndex(0);
            mPinVerify.setTeoPrologue(0, 0);
            mPinVerify.setTeoPrologue(1, 0);
            mPinVerify.setTeoPrologue(2, 0);
            mPinVerify.setData(pinVerifyData, pinVerifyData.length);

            // PIN modification command (ACOS3)
            byte[] pinModifyData = {(byte) 0x80, 0x24, 0x00, 0x00, 0x08,
                    (byte) 0xFF, (byte) 0xFF, (byte) 0xFF, (byte) 0xFF,
                    (byte) 0xFF, (byte) 0xFF, (byte) 0xFF, (byte) 0xFF};

            // Initialize PIN modify structure (ACOS3)
            mPinModify.setTimeOut(0);
            mPinModify.setTimeOut2(0);
            mPinModify.setFormatString(0);
            mPinModify.setPinBlockString(0x08);
            mPinModify.setPinLengthFormat(0);
            mPinModify.setInsertionOffsetOld(0);
            mPinModify.setInsertionOffsetNew(0);
            mPinModify.setPinMaxExtraDigit(0x0408);
            mPinModify.setConfirmPin(0x01);
            mPinModify.setEntryValidationCondition(0x03);
            mPinModify.setNumberMessage(0x02);
            mPinModify.setLangId(0x0409);
            mPinModify.setMsgIndex1(0);
            mPinModify.setMsgIndex2(0x01);
            mPinModify.setMsgIndex3(0);
            mPinModify.setTeoPrologue(0, 0);
            mPinModify.setTeoPrologue(1, 0);
            mPinModify.setTeoPrologue(2, 0);
            mPinModify.setData(pinModifyData, pinModifyData.length);

            // Initialize read key option
            mReadKeyOption.setTimeOut(0);
            mReadKeyOption.setPinMaxExtraDigit(0x0408);
            mReadKeyOption.setKeyReturnCondition(0x01);
            mReadKeyOption.setEchoLcdStartPosition(0);
            mReadKeyOption.setEchoLcdMode(0x01);

            // Initialize LCD message
            mLcdMessage = "Hello!";
        }

        if (mReader.isOpened()) {

            mOpenButton.setEnabled(false);
            for (int i = 0; i < mReader.getNumSlots(); i++) {
                mSlotAdapter.add(Integer.toString(i));
            }

        } else {

            // Disable buttons
            mCloseButton.setEnabled(false);
            mSlotSpinner.setEnabled(false);
            mGetStateButton.setEnabled(false);
            mPowerSpinner.setEnabled(false);
            mPowerButton.setEnabled(false);
            mGetAtrButton.setEnabled(false);
            mT0CheckBox.setEnabled(false);
            mT1CheckBox.setEnabled(false);
            mSetProtocolButton.setEnabled(false);
            mGetProtocolButton.setEnabled(false);
            mTransmitButton.setEnabled(false);
            mControlButton.setEnabled(false);
            mGetFeaturesButton.setEnabled(false);
            mVerifyPinButton.setEnabled(false);
            mModifyPinButton.setEnabled(false);
            mReadKeyButton.setEnabled(false);
            mDisplayLcdMessageButton.setEnabled(false);
        }

        // Hide input window
        getWindow().setSoftInputMode(
                WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
    }

    @Override
    protected void onDestroy() {

        // Unregister receiver
        unregisterReceiver(mReceiver);

        super.onDestroy();
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {

        /*
         * Save the state.
         */

        outState.putCharSequence(STATE_LOG, mResponseTextView.getText());
        outState.putBoolean(STATE_VERIFY_PIN_BUTTON, mVerifyPinButton.isEnabled());
        outState.putBoolean(STATE_MODIFY_PIN_BUTTON, mModifyPinButton.isEnabled());

        /* PIN verify */
        outState.putInt(STATE_PV_TIMEOUT, mPinVerify.getTimeOut());
        outState.putInt(STATE_PV_TIMEOUT2, mPinVerify.getTimeOut2());
        outState.putInt(STATE_PV_FORMAT_STRING, mPinVerify.getFormatString());
        outState.putInt(STATE_PV_PIN_BLOCK_STRING, mPinVerify.getPinBlockString());
        outState.putInt(STATE_PV_PIN_LENGTH_FORMAT, mPinVerify.getPinLengthFormat());
        outState.putInt(STATE_PV_PIN_MAX_EXTRA_DIGIT, mPinVerify.getPinMaxExtraDigit());
        outState.putInt(STATE_PV_ENTRY_VALIDATION_CONDITION,
                mPinVerify.getEntryValidationCondition());
        outState.putInt(STATE_PV_NUMBER_MESSAGE, mPinVerify.getNumberMessage());
        outState.putInt(STATE_PV_LANG_ID, mPinVerify.getLangId());
        outState.putInt(STATE_PV_MSG_INDEX, mPinVerify.getMsgIndex());
        outState.putInt(STATE_PV_TEO_PROLOGUE0, mPinVerify.getTeoPrologue(0));
        outState.putInt(STATE_PV_TEO_PROLOGUE1, mPinVerify.getTeoPrologue(1));
        outState.putInt(STATE_PV_TEO_PROLOGUE2, mPinVerify.getTeoPrologue(2));
        outState.putByteArray(STATE_PV_DATA, mPinVerify.getData());

        /* PIN modify */
        outState.putInt(STATE_PM_TIMEOUT, mPinModify.getTimeOut());
        outState.putInt(STATE_PM_TIMEOUT2, mPinModify.getTimeOut2());
        outState.putInt(STATE_PM_FORMAT_STRING, mPinModify.getFormatString());
        outState.putInt(STATE_PM_PIN_BLOCK_STRING, mPinModify.getPinBlockString());
        outState.putInt(STATE_PM_PIN_LENGTH_FORMAT, mPinModify.getPinLengthFormat());
        outState.putInt(STATE_PM_INSERTION_OFFSET_OLD, mPinModify.getInsertionOffsetOld());
        outState.putInt(STATE_PM_INSERTION_OFFSET_NEW, mPinModify.getInsertionOffsetNew());
        outState.putInt(STATE_PM_PIN_MAX_EXTRA_DIGIT, mPinModify.getPinMaxExtraDigit());
        outState.putInt(STATE_PM_CONFIRM_PIN, mPinModify.getConfirmPin());
        outState.putInt(STATE_PM_ENTRY_VALIDATION_CONDITION,
                mPinModify.getEntryValidationCondition());
        outState.putInt(STATE_PM_NUMBER_MESSAGE, mPinModify.getNumberMessage());
        outState.putInt(STATE_PM_LANG_ID, mPinModify.getLangId());
        outState.putInt(STATE_PM_MSG_INDEX1, mPinModify.getMsgIndex1());
        outState.putInt(STATE_PM_MSG_INDEX2, mPinModify.getMsgIndex2());
        outState.putInt(STATE_PM_MSG_INDEX3, mPinModify.getMsgIndex3());
        outState.putInt(STATE_PM_TEO_PROLOGUE0, mPinModify.getTeoPrologue(0));
        outState.putInt(STATE_PM_TEO_PROLOGUE1, mPinModify.getTeoPrologue(1));
        outState.putInt(STATE_PM_TEO_PROLOGUE2, mPinModify.getTeoPrologue(2));
        outState.putByteArray(STATE_PM_DATA, mPinModify.getData());

        /* Read key option */
        outState.putInt(STATE_RK_TIMEOUT, mReadKeyOption.getTimeOut());
        outState.putInt(STATE_RK_PIN_MAX_EXTRA_DIGIT, mReadKeyOption.getPinMaxExtraDigit());
        outState.putInt(STATE_RK_KEY_RETURN_CONDITION, mReadKeyOption.getKeyReturnCondition());
        outState.putInt(STATE_RK_ECHO_LCD_START_POSITION, mReadKeyOption.getEchoLcdStartPosition());
        outState.putInt(STATE_RK_ECHO_LCD_MODE, mReadKeyOption.getEchoLcdMode());

        /* LCD message */
        outState.putString(STATE_LCD_MESSAGE, mLcdMessage);

        super.onSaveInstanceState(outState);
    }

    @Override
    public void onVerifyPinDialogPositiveClick(DialogFragment dialog) {

        /* Get the slot number. */
        int slotNum = mSlotSpinner.getSelectedItemPosition();
        if (slotNum == Spinner.INVALID_POSITION) {
            return;
        }

        /* Update the data from the dialog. */
        VerifyPinDialogFragment fragment = (VerifyPinDialogFragment) dialog;
        PinVerify pinVerify = fragment.getPinVerify();
        mPinVerify.setTimeOut(pinVerify.getTimeOut());
        mPinVerify.setTimeOut2(pinVerify.getTimeOut2());
        mPinVerify.setFormatString(pinVerify.getFormatString());
        mPinVerify.setPinBlockString(pinVerify.getPinBlockString());
        mPinVerify.setPinLengthFormat(pinVerify.getPinLengthFormat());
        mPinVerify.setPinMaxExtraDigit(pinVerify.getPinMaxExtraDigit());
        mPinVerify.setEntryValidationCondition(pinVerify.getEntryValidationCondition());
        mPinVerify.setNumberMessage(pinVerify.getNumberMessage());
        mPinVerify.setLangId(pinVerify.getLangId());
        mPinVerify.setMsgIndex(pinVerify.getMsgIndex());
        mPinVerify.setTeoPrologue(0, pinVerify.getTeoPrologue(0));
        mPinVerify.setTeoPrologue(1, pinVerify.getTeoPrologue(1));
        mPinVerify.setTeoPrologue(2, pinVerify.getTeoPrologue(2));
        byte[] pinVerifyData = pinVerify.getData();
        if ((pinVerifyData != null) && (pinVerifyData.length > 0)) {
            mPinVerify.setData(pinVerifyData, pinVerifyData.length);
        }

        /* Set parameters. */
        TransmitParams params = new TransmitParams();
        params.slotNum = slotNum;
        params.controlCode = mFeatures.getControlCode(Features.FEATURE_VERIFY_PIN_DIRECT);
        params.commandString = Hex.toHexString(mPinVerify.toByteArray());

        /* Transmit the control command. */
        logMsg("Slot " + slotNum + ": Verifying PIN (Control Code: " + params.controlCode + ")...");
        new Thread(new TransmitTask(params)).start();
    }

    @Override
    public void onVerifyPinDialogNegativeClick(DialogFragment dialog) {
        dialog.requireDialog().cancel();
    }

    @Override
    public void onModifyPinDialogPositiveClick(DialogFragment dialog) {

        /* Get the slot number. */
        int slotNum = mSlotSpinner.getSelectedItemPosition();
        if (slotNum == Spinner.INVALID_POSITION) {
            return;
        }

        /* Update the data from the dialog. */
        ModifyPinDialogFragment fragment = (ModifyPinDialogFragment) dialog;
        PinModify pinModify = fragment.getPinModify();
        mPinModify.setTimeOut(pinModify.getTimeOut());
        mPinModify.setTimeOut2(pinModify.getTimeOut2());
        mPinModify.setFormatString(pinModify.getFormatString());
        mPinModify.setPinBlockString(pinModify.getPinBlockString());
        mPinModify.setPinLengthFormat(pinModify.getPinLengthFormat());
        mPinModify.setInsertionOffsetOld(pinModify.getInsertionOffsetOld());
        mPinModify.setInsertionOffsetNew(pinModify.getInsertionOffsetNew());
        mPinModify.setPinMaxExtraDigit(pinModify.getPinMaxExtraDigit());
        mPinModify.setConfirmPin(pinModify.getConfirmPin());
        mPinModify.setEntryValidationCondition(pinModify.getEntryValidationCondition());
        mPinModify.setNumberMessage(pinModify.getNumberMessage());
        mPinModify.setLangId(pinModify.getLangId());
        mPinModify.setMsgIndex1(pinModify.getMsgIndex1());
        mPinModify.setMsgIndex2(pinModify.getMsgIndex2());
        mPinModify.setMsgIndex3(pinModify.getMsgIndex3());
        mPinModify.setTeoPrologue(0, pinModify.getTeoPrologue(0));
        mPinModify.setTeoPrologue(1, pinModify.getTeoPrologue(1));
        mPinModify.setTeoPrologue(2, pinModify.getTeoPrologue(2));
        byte[] pinModifyData = pinModify.getData();
        if ((pinModifyData != null) && (pinModifyData.length > 0)) {
            mPinModify.setData(pinModifyData, pinModifyData.length);
        }

        /* Set parameters. */
        TransmitParams params = new TransmitParams();
        params.slotNum = slotNum;
        params.controlCode = mFeatures.getControlCode(Features.FEATURE_MODIFY_PIN_DIRECT);
        params.commandString = Hex.toHexString(mPinModify.toByteArray());

        /* Transmit the control command. */
        logMsg("Slot " + slotNum + ": Modifying PIN (Control Code: " + params.controlCode + ")...");
        new Thread(new TransmitTask(params)).start();
    }

    @Override
    public void onModifyPinDialogNegativeClick(DialogFragment dialog) {
        dialog.requireDialog().cancel();
    }

    @Override
    public void onReadKeyDialogPositiveClick(DialogFragment dialog) {

        /* Get the slot number. */
        int slotNum = mSlotSpinner.getSelectedItemPosition();
        if (slotNum == Spinner.INVALID_POSITION) {
            return;
        }

        /* Update the data from the dialog. */
        ReadKeyDialogFragment fragment = (ReadKeyDialogFragment) dialog;
        ReadKeyOption readKeyOption = fragment.getReadKeyOption();
        mReadKeyOption.setTimeOut(readKeyOption.getTimeOut());
        mReadKeyOption.setPinMaxExtraDigit(readKeyOption.getPinMaxExtraDigit());
        mReadKeyOption.setKeyReturnCondition(readKeyOption.getKeyReturnCondition());
        mReadKeyOption.setEchoLcdStartPosition(readKeyOption.getEchoLcdStartPosition());
        mReadKeyOption.setEchoLcdMode(readKeyOption.getEchoLcdMode());

        /* Set parameters. */
        TransmitParams params = new TransmitParams();
        params.slotNum = slotNum;
        params.controlCode = Reader.IOCTL_ACR83_READ_KEY;
        params.commandString = Hex.toHexString(mReadKeyOption.toByteArray());

        /* Transmit the control command. */
        logMsg("Slot " + slotNum + ": Reading key (Control Code: " + params.controlCode + ")...");
        new Thread(new TransmitTask(params)).start();
    }

    @Override
    public void onReadKeyDialogNegativeClick(DialogFragment dialog) {
        dialog.requireDialog().cancel();
    }

    @Override
    public void onDisplayLcdMessageDialogPositiveClick(DialogFragment dialog) {

        /* Get the slot number. */
        int slotNum = mSlotSpinner.getSelectedItemPosition();
        if (slotNum == Spinner.INVALID_POSITION) {
            return;
        }

        /* Update the data from the dialog. */
        DisplayLcdMessageDialogFragment fragment = (DisplayLcdMessageDialogFragment) dialog;
        mLcdMessage = fragment.getMessage();

        /* Set parameters. */
        TransmitParams params = new TransmitParams();
        params.slotNum = slotNum;
        params.controlCode = Reader.IOCTL_ACR83_DISPLAY_LCD_MESSAGE;
        try {
            params.commandString = Hex.toHexString(mLcdMessage.getBytes("US-ASCII"));
        } catch (UnsupportedEncodingException e) {
            params.commandString = "";
        }

        /* Transmit the control command. */
        logMsg("Slot " + slotNum + ": Displaying LCD message (Control Code: " + params.controlCode
                + ")...");
        new Thread(new TransmitTask(params)).start();
    }

    @Override
    public void onDisplayLcdMessageDialogNegativeClick(DialogFragment dialog) {
        dialog.requireDialog().cancel();
    }

    /**
     * Logs the message.
     *
     * @param msg the message.
     */
    private void logMsg(String msg) {

        DateFormat dateFormat = new SimpleDateFormat("[dd-MM-yyyy HH:mm:ss]: ", Locale.US);
        Date date = new Date();
        int lines = mResponseTextView.getHeight() / mResponseTextView.getLineHeight();

        /* Append the message to the text view. */
        mResponseTextView.append(dateFormat.format(date) + msg + "\n");

        /* Remove the first line from the text view. */
        if (mResponseTextView.getLineCount() > MAX_LINES) {

            String logString = mResponseTextView.getText().toString();
            int newLineIndex = logString.indexOf('\n', 1);

            if (newLineIndex >= 0) {
                mResponseTextView.getEditableText().delete(0, newLineIndex);
            }
        }

        /* Scroll the text view. */
        if (mResponseTextView.getLineCount() > lines) {
            mResponseTextView.scrollTo(0, (mResponseTextView.getLineCount() - lines)
                    * mResponseTextView.getLineHeight());
        }
    }

    /**
     * Logs the contents of buffer.
     *
     * @param buffer       the buffer.
     * @param bufferLength the buffer length.
     */
    private void logBuffer(byte[] buffer, int bufferLength) {

        StringBuilder builder = new StringBuilder(3 * bufferLength);

        for (int i = 0; i < bufferLength; i++) {

            int tmp = buffer[i] & 0xFF;

            if (i % 16 == 0) {
                if (builder.length() > 0) {

                    logMsg(builder.toString());
                    builder.setLength(0);
                }
            } else {
                builder.append(" ");
            }

            builder.append(HEX_DIGITS[tmp >>> 4]);
            builder.append(HEX_DIGITS[tmp & 0x0F]);
        }

        if (builder.length() > 0) {
            logMsg(builder.toString());
        }
    }
}
