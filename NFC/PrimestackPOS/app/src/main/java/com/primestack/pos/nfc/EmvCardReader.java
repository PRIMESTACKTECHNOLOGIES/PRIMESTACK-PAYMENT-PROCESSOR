package com.primestack.pos.nfc;

/**
 * EMV Contactless Card Reader
 *
 * Sends standard ISO7816 APDUs to an NFC/contactless card via the ACS reader.
 * Extracts the PAN (card number), expiry, and card brand from EMV TLV data.
 *
 * APDU sequence for a contactless EMV card:
 *   1. SELECT PPSE (Proximity Payment System Environment)
 *   2. SELECT application (AID from PPSE FCI)
 *   3. GET PROCESSING OPTIONS
 *   4. READ RECORD to extract card data
 *
 * Reference: EMV Book 3 (Application Specification), EMV Contactless Book B
 */
public class EmvCardReader {

    // ── APDU commands ────────────────────────────────────────────────────────

    /** SELECT PPSE — finds the contactless payment application on the card */
    public static final byte[] SELECT_PPSE = hexToBytes(
        "00A404000E325041592E5359532E444446303100");

    /** SELECT command header — AID appended at runtime */
    private static final byte[] SELECT_CMD_HEADER = hexToBytes("00A4040007");

    /** GET PROCESSING OPTIONS with empty PDOL */
    public static final byte[] GET_PROCESSING_OPTIONS = hexToBytes("80A8000002830000");

    /** READ RECORD template: 00B2{sfi}{record}04 */
    private static final byte READ_RECORD_CLA   = 0x00;
    private static final byte READ_RECORD_INS   = (byte) 0xB2;
    private static final byte READ_RECORD_P2_SFI_SHIFT = 3;
    private static final byte READ_RECORD_Le    = 0x00;

    // ── EMV TLV tags of interest ────────────────────────────────────────────
    public static final int TAG_FCI_TEMPLATE            = 0x6F;
    public static final int TAG_DF_NAME                 = 0x84;
    public static final int TAG_FCI_PROP_TEMPLATE       = 0xA5;
    public static final int TAG_APPLICATION_LABEL       = 0x50;
    public static final int TAG_APPLICATION_PRIORITY    = 0x87;
    public static final int TAG_PDOL                    = 0x9F38;
    public static final int TAG_DIRECTORY_ENTRY         = 0x61;
    public static final int TAG_AID                     = 0x4F;
    public static final int TAG_AFL                     = 0x94;    // Application File Locator
    public static final int TAG_PAN                     = 0x5A;    // Primary Account Number
    public static final int TAG_PAN_SEQ                 = 0x5F34;
    public static final int TAG_EXPIRY                  = 0x5F24; // YYMMDD
    public static final int TAG_CARDHOLDER_NAME         = 0x5F20;
    public static final int TAG_TRACK2_EQUIV            = 0x57;   // Track 2 Equivalent Data
    public static final int TAG_APP_CRYPTOGRAM          = 0x9F26; // EMV Cryptogram (AC)

    // ── Well-known AIDs ──────────────────────────────────────────────────────
    public static final String AID_VISA         = "A0000000031010";
    public static final String AID_VISA_DEBIT   = "A0000000032010";
    public static final String AID_MASTERCARD   = "A0000000041010";
    public static final String AID_MAESTRO      = "A0000000043060";
    public static final String AID_AMEX         = "A000000025010104";
    public static final String AID_DISCOVER     = "A0000001523010";

    /** Extracted card data after reading */
    public static class CardData {
        public String pan;          // Primary Account Number (digits only)
        public String lastFour;
        public String expiry;       // YYMM format
        public String cardBrand;    // "Visa", "Mastercard", etc.
        public String cryptogram;   // Application Cryptogram (hex)
        public String entryMethod = "nfc";
    }

    /**
     * Build a SELECT AID APDU.
     */
    public static byte[] buildSelectAid(byte[] aid) {
        byte[] cmd = new byte[SELECT_CMD_HEADER.length + aid.length];
        System.arraycopy(SELECT_CMD_HEADER, 0, cmd, 0, SELECT_CMD_HEADER.length);
        // Overwrite the length byte (last byte of header) with actual AID length
        cmd[4] = (byte) aid.length;
        System.arraycopy(aid, 0, cmd, SELECT_CMD_HEADER.length, aid.length);
        return cmd;
    }

    /**
     * Build a READ RECORD APDU.
     * @param sfi   Short File Identifier (1–31)
     * @param record Record number (1–)
     */
    public static byte[] buildReadRecord(int sfi, int record) {
        return new byte[]{
            READ_RECORD_CLA,
            READ_RECORD_INS,
            (byte) record,
            (byte) ((sfi << READ_RECORD_P2_SFI_SHIFT) | 0x04),
            READ_RECORD_Le
        };
    }

    /**
     * Check whether an APDU response ends with SW 9000 (success).
     */
    public static boolean isSuccess(byte[] resp, int len) {
        if (resp == null || len < 2) return false;
        return resp[len - 2] == (byte) 0x90 && resp[len - 1] == (byte) 0x00;
    }

    /**
     * Extract card data from the raw TLV payload accumulated during the read session.
     *
     * @param tlvData  Concatenated bytes of all READ RECORD responses
     * @param len      Valid byte count
     * @return         Parsed CardData (fields may be null if not found)
     */
    public static CardData parseCardData(byte[] tlvData, int len, String detectedBrand) {
        CardData card = new CardData();
        card.cardBrand = detectedBrand != null ? detectedBrand : "Card";

        // Walk TLV
        int i = 0;
        while (i < len - 1) {
            // Parse tag
            int tag = tlvData[i] & 0xFF;
            i++;
            if ((tag & 0x1F) == 0x1F) {
                // Two-byte tag
                if (i >= len) break;
                tag = (tag << 8) | (tlvData[i] & 0xFF);
                i++;
            }

            // Parse length
            if (i >= len) break;
            int length = tlvData[i] & 0xFF;
            i++;
            if (length == 0x81) {
                if (i >= len) break;
                length = tlvData[i] & 0xFF;
                i++;
            } else if (length == 0x82) {
                if (i + 1 >= len) break;
                length = ((tlvData[i] & 0xFF) << 8) | (tlvData[i + 1] & 0xFF);
                i += 2;
            }

            if (i + length > len) break;

            // Extract values we care about
            switch (tag) {
                case TAG_PAN: {
                    // BCD-encoded PAN — convert to string, strip trailing 'F'
                    StringBuilder sb = new StringBuilder();
                    for (int j = 0; j < length; j++) {
                        int hi = (tlvData[i + j] >> 4) & 0x0F;
                        int lo = tlvData[i + j] & 0x0F;
                        sb.append((char)('0' + hi));
                        if (lo != 0x0F) sb.append((char)('0' + lo));
                    }
                    card.pan = sb.toString();
                    if (card.pan.length() >= 4) {
                        card.lastFour = card.pan.substring(card.pan.length() - 4);
                    }
                    break;
                }
                case TAG_EXPIRY: {
                    // 3 bytes: YYMMDD — we want YYMM
                    if (length >= 2) {
                        String yy = String.format("%02X", tlvData[i] & 0xFF);
                        String mm = String.format("%02X", tlvData[i + 1] & 0xFF);
                        card.expiry = mm + yy; // MMYY for ISO
                    }
                    break;
                }
                case TAG_TRACK2_EQUIV: {
                    // Format: PAN D YYMM service_code padding
                    // If we didn't get PAN from tag 5A, try extracting from track2
                    if (card.pan == null) {
                        StringBuilder sb = new StringBuilder();
                        boolean foundSep = false;
                        for (int j = 0; j < length; j++) {
                            int hi = (tlvData[i + j] >> 4) & 0x0F;
                            int lo = tlvData[i + j] & 0x0F;
                            if (hi == 0xD) { foundSep = true; break; }
                            sb.append((char)('0' + hi));
                            if (lo == 0xD) { foundSep = true; break; }
                            if (lo != 0xF) sb.append((char)('0' + lo));
                        }
                        if (foundSep && sb.length() >= 4) {
                            card.pan = sb.toString();
                            card.lastFour = card.pan.substring(card.pan.length() - 4);
                        }
                    }
                    break;
                }
                case TAG_APP_CRYPTOGRAM: {
                    card.cryptogram = bytesToHex(tlvData, i, length);
                    break;
                }
            }

            i += length;
        }

        return card;
    }

    /**
     * Determine card brand from AID bytes.
     */
    public static String brandFromAid(byte[] aid) {
        String aidHex = bytesToHex(aid, 0, aid.length).toUpperCase();
        if (aidHex.startsWith("A0000000031010") || aidHex.startsWith("A0000000032010"))
            return "Visa";
        if (aidHex.startsWith("A000000004"))
            return "Mastercard";
        if (aidHex.startsWith("A000000025"))
            return "Amex";
        if (aidHex.startsWith("A000000152") || aidHex.startsWith("A0000001523"))
            return "Discover";
        return "Card";
    }

    // ── Utilities ────────────────────────────────────────────────────────────

    public static byte[] hexToBytes(String hex) {
        int len = hex.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(hex.charAt(i), 16) << 4)
                                 + Character.digit(hex.charAt(i + 1), 16));
        }
        return data;
    }

    public static String bytesToHex(byte[] bytes, int offset, int length) {
        StringBuilder sb = new StringBuilder(length * 2);
        for (int i = offset; i < offset + length; i++) {
            sb.append(String.format("%02X", bytes[i] & 0xFF));
        }
        return sb.toString();
    }
}
