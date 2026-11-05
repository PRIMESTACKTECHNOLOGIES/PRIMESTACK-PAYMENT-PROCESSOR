package com.primestack.pos.nfc;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.PendingIntentCompat;
import androidx.core.content.ContextCompat;

import com.acs.smartcard.Reader;

/**
 * AcsReaderManager
 *
 * Wraps the ACS {@link Reader} singleton, handles USB permission flow,
 * device attach/detach events, and card insertion state changes.
 *
 * Usage:
 * <pre>
 *   AcsReaderManager mgr = AcsReaderManager.getInstance(context);
 *   mgr.setListener(myListener);
 *   mgr.registerReceiver();
 *
 *   // When done (onDestroy):
 *   mgr.unregisterReceiver();
 * </pre>
 */
public class AcsReaderManager {

    private static final String TAG = "AcsReaderManager";
    private static final String ACTION_USB_PERMISSION = "com.primestack.pos.USB_PERMISSION";

    // ── Singleton ─────────────────────────────────────────────────────────
    private static volatile AcsReaderManager sInstance;

    public static AcsReaderManager getInstance(Context context) {
        if (sInstance == null) {
            synchronized (AcsReaderManager.class) {
                if (sInstance == null) {
                    sInstance = new AcsReaderManager(context.getApplicationContext());
                }
            }
        }
        return sInstance;
    }

    // ── State ──────────────────────────────────────────────────────────────
    public enum ReaderState { DISCONNECTED, CONNECTED, CARD_PRESENT }

    // ── Listener interface ─────────────────────────────────────────────────
    public interface ReaderListener {
        void onReaderConnected(String readerName);
        void onReaderDisconnected();
        void onCardPresented(int slotNum);
        void onCardRemoved(int slotNum);
        void onError(String message);
    }

    // ── Fields ─────────────────────────────────────────────────────────────
    private final Context mContext;
    private final UsbManager mUsbManager;
    private final Reader mReader;
    private PendingIntent mPermissionIntent;
    private ReaderListener mListener;
    private ReaderState mState = ReaderState.DISCONNECTED;
    private boolean mReceiverRegistered = false;

    private AcsReaderManager(Context context) {
        mContext = context;
        mUsbManager = (UsbManager) context.getSystemService(Context.USB_SERVICE);
        mReader = new Reader(mUsbManager);

        // Card state change listener
        mReader.setOnStateChangeListener((slotNum, prevState, currState) -> {
            Log.d(TAG, "Slot " + slotNum + " state: " + prevState + " -> " + currState);

            if (currState == Reader.CARD_PRESENT || currState == Reader.CARD_POWERED
                    || currState == Reader.CARD_NEGOTIABLE || currState == Reader.CARD_SPECIFIC) {
                mState = ReaderState.CARD_PRESENT;
                if (mListener != null) mListener.onCardPresented(slotNum);

            } else if (currState == Reader.CARD_ABSENT) {
                if (mState == ReaderState.CARD_PRESENT) {
                    mState = ReaderState.CONNECTED;
                    if (mListener != null) mListener.onCardRemoved(slotNum);
                }
            }
        });
    }

    public void setListener(ReaderListener listener) {
        mListener = listener;
    }

    public Reader getReader() {
        return mReader;
    }

    public ReaderState getState() {
        return mState;
    }

    public boolean isConnected() {
        return mState != ReaderState.DISCONNECTED;
    }

    // ── USB broadcast receiver ──────────────────────────────────────────────
    private final BroadcastReceiver mUsbReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (action == null) return;

            switch (action) {
                case ACTION_USB_PERMISSION: {
                    synchronized (this) {
                        UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                        boolean granted = intent.getBooleanExtra(
                                UsbManager.EXTRA_PERMISSION_GRANTED, false);
                        if (granted && device != null) {
                            openReader(device);
                        } else {
                            Log.w(TAG, "USB permission denied");
                            if (mListener != null) mListener.onError("USB permission denied");
                        }
                    }
                    break;
                }
                case UsbManager.ACTION_USB_DEVICE_ATTACHED: {
                    UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                    if (device != null && mReader.isSupported(device)) {
                        Log.i(TAG, "Supported reader attached: " + device.getDeviceName());
                        requestPermission(device);
                    }
                    break;
                }
                case UsbManager.ACTION_USB_DEVICE_DETACHED: {
                    UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                    if (device != null && device.equals(mReader.getDevice())) {
                        Log.i(TAG, "Reader detached");
                        mState = ReaderState.DISCONNECTED;
                        new Thread(() -> mReader.close()).start();
                        if (mListener != null) mListener.onReaderDisconnected();
                    }
                    break;
                }
            }
        }
    };

    /** Register USB broadcast receiver. Call from Activity.onResume(). */
    public void registerReceiver() {
        if (mReceiverRegistered) return;

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            flags |= PendingIntent.FLAG_ALLOW_UNSAFE_IMPLICIT_INTENT;
        }
        mPermissionIntent = PendingIntentCompat.getBroadcast(
                mContext, 0, new Intent(ACTION_USB_PERMISSION), flags, true);

        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_USB_PERMISSION);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        ContextCompat.registerReceiver(mContext, mUsbReceiver, filter,
                ContextCompat.RECEIVER_EXPORTED);
        mReceiverRegistered = true;

        // Auto-connect to any already-attached reader
        scanForAttachedReaders();
    }

    /** Unregister USB broadcast receiver. Call from Activity.onDestroy(). */
    public void unregisterReceiver() {
        if (!mReceiverRegistered) return;
        try {
            mContext.unregisterReceiver(mUsbReceiver);
        } catch (IllegalArgumentException ignored) {}
        mReceiverRegistered = false;
    }

    /** Scan devices already plugged in at startup. */
    public void scanForAttachedReaders() {
        for (UsbDevice device : mUsbManager.getDeviceList().values()) {
            if (mReader.isSupported(device)) {
                Log.i(TAG, "Found attached reader: " + device.getDeviceName());
                requestPermission(device);
                break; // Only open the first supported reader
            }
        }
    }

    private void requestPermission(UsbDevice device) {
        if (mUsbManager.hasPermission(device)) {
            openReader(device);
        } else {
            mUsbManager.requestPermission(device, mPermissionIntent);
        }
    }

    private void openReader(UsbDevice device) {
        new Thread(() -> {
            try {
                mReader.open(device);
                mState = ReaderState.CONNECTED;
                String name = mReader.getReaderName();
                Log.i(TAG, "Reader opened: " + name);
                if (mListener != null) mListener.onReaderConnected(name);
            } catch (Exception e) {
                Log.e(TAG, "Failed to open reader", e);
                if (mListener != null) mListener.onError("Failed to open reader: " + e.getMessage());
            }
        }).start();
    }

    /**
     * Transmit an APDU to the card in the given slot.
     * Blocks — call from a background thread.
     *
     * @param slotNum   Slot number (usually 0 for contactless readers)
     * @param apdu      Command APDU bytes
     * @param response  Pre-allocated response buffer (at least 258 bytes)
     * @return          Number of bytes written into response, or -1 on error
     */
    public int transmit(int slotNum, byte[] apdu, byte[] response) {
        try {
            return mReader.transmit(slotNum, apdu, apdu.length, response, response.length);
        } catch (Exception e) {
            Log.e(TAG, "transmit error", e);
            return -1;
        }
    }

    /**
     * Power up the card in the given slot and return the ATR.
     * Blocks — call from a background thread.
     */
    public byte[] powerOn(int slotNum) {
        try {
            return mReader.power(slotNum, Reader.CARD_WARM_RESET);
        } catch (Exception e) {
            Log.e(TAG, "powerOn error", e);
            return null;
        }
    }

    /**
     * Power down the card in the given slot.
     */
    public void powerOff(int slotNum) {
        try {
            mReader.power(slotNum, Reader.CARD_POWER_DOWN);
        } catch (Exception ignored) {}
    }
}
