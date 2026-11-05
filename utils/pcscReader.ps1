# pcscReader.ps1
# Drives the ACS ACR122U via Windows WinSCard (winscard.dll) using pure PowerShell.
# Reads a contactless card (EMV / NFC), extracts PAN + expiry, and prints JSON to stdout.

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class WinSCard {
    [DllImport("winscard.dll")]
    public static extern uint SCardEstablishContext(uint scope, IntPtr r1, IntPtr r2, out IntPtr hCtx);

    [DllImport("winscard.dll")]
    public static extern uint SCardReleaseContext(IntPtr hCtx);

    [DllImport("winscard.dll", CharSet = CharSet.Unicode)]
    public static extern uint SCardListReadersW(IntPtr hCtx, string groups, char[] readers, ref uint len);

    [DllImport("winscard.dll", CharSet = CharSet.Unicode)]
    public static extern uint SCardConnectW(IntPtr hCtx, string reader, uint shareMode, uint preferredProtocols, out IntPtr hCard, out uint activeProtocol);

    [DllImport("winscard.dll")]
    public static extern uint SCardDisconnect(IntPtr hCard, uint disposition);

    [DllImport("winscard.dll")]
    public static extern uint SCardTransmit(IntPtr hCard, IntPtr pioSendPci, byte[] sendBuf, uint sendLen, IntPtr pioRecvPci, byte[] recvBuf, ref uint recvLen);

    [DllImport("winscard.dll")]
    public static extern uint SCardStatus(IntPtr hCard, IntPtr reader, IntPtr readerLen, out uint state, out uint protocol, byte[] atr, ref uint atrLen);

    [StructLayout(LayoutKind.Sequential)]
    public struct SCARD_IO_REQUEST {
        public uint dwProtocol;
        public uint cbPciLength;
    }

    public const uint SCARD_SCOPE_USER = 0;
    public const uint SCARD_SHARE_SHARED = 2;
    public const uint SCARD_SHARE_EXCLUSIVE = 1;
    public const uint SCARD_PROTOCOL_T0 = 1;
    public const uint SCARD_PROTOCOL_T1 = 2;
    public const uint SCARD_PROTOCOL_RAW = 0x10000;
    public const uint SCARD_PROTOCOL_ANY = 0x80000000;
    public const uint SCARD_LEAVE_CARD = 0;
    public const uint SCARD_UNPOWER_CARD = 2;
    public const uint SCARD_S_SUCCESS = 0;

    public static byte[] Transmit(IntPtr hCard, uint protocol, byte[] apdu) {
        var pioSend = new SCARD_IO_REQUEST { dwProtocol = protocol, cbPciLength = 8 };
        var pioHandle = GCHandle.Alloc(pioSend, GCHandleType.Pinned);
        try {
            byte[] recv = new byte[258];
            uint recvLen = (uint)recv.Length;
            uint r = SCardTransmit(hCard, pioHandle.AddrOfPinnedObject(), apdu, (uint)apdu.Length, IntPtr.Zero, recv, ref recvLen);
            if (r != SCARD_S_SUCCESS) return null;
            byte[] result = new byte[recvLen];
            Array.Copy(recv, result, (int)recvLen);
            return result;
        } finally {
            pioHandle.Free();
        }
    }
}
"@ -ErrorAction Stop

function ToHex([byte[]] $bytes) {
    $sb = [System.Text.StringBuilder]::new()
    foreach ($b in $bytes) {
        $sb.Append($b.ToString("X2")) | Out-Null
    }
    return $sb.ToString()
}

function FromHex([string] $hex) {
    $bytes = [System.Collections.Generic.List[byte]]::new()
    for ($i = 0; $i -lt $hex.Length; $i += 2) {
        $bytes.Add([Convert]::ToByte($hex.Substring($i, 2), 16))
    }
    return $bytes.ToArray()
}

function IsSuccess([byte[]] $response) {
    if (-not $response -or $response.Length -lt 2) { return $false }
    $sw1 = $response[$response.Length - 2]
    $sw2 = $response[$response.Length - 1]
    return ($sw1 -eq 0x90 -and $sw2 -eq 0x00)
}

# APDUs
$SELECT_PPSE = FromHex "00A404000E325041592E5359532E444446303100"
$GET_GPO = FromHex "80A8000002830000"

function SelectAid([byte[]] $aid) {
    $cmd = [System.Collections.Generic.List[byte]]::new()
    $cmd.AddRange([byte[]]@(0x00, 0xA4, 0x04, 0x00))
    $cmd.Add([byte]$aid.Length)
    $cmd.AddRange($aid)
    $cmd.Add(0x00)
    return $cmd.ToArray()
}

function ReadRecord([int] $sfi, [int] $rec) {
    $p1 = [byte]$rec
    $p2 = [byte](($sfi -shl 3) -bor 4)
    return [byte[]]@(0x00, 0xB2, $p1, $p2, 0x00)
}

# TLV Parser
function ParseTlv([byte[]] $data, [int] $len) {
    $result = @{}
    $i = 0
    while ($i -lt ($len - 1)) {
        $tag = $data[$i]
        $i++
        if (($tag -band 0x1F) -eq 0x1F) {
            if ($i -ge $len) { break }
            $tag = ($tag -shl 8) -bor $data[$i]
            $i++
        }
        if ($i -ge $len) { break }
        $length = $data[$i]
        $i++
        if ($length -eq 0x81) {
            if ($i -ge $len) { break }
            $length = $data[$i]
            $i++
        } elseif ($length -eq 0x82) {
            if (($i + 1) -ge $len) { break }
            $length = ($data[$i] -shl 8) -bor $data[$i + 1]
            $i += 2
        }
        $lengthInt = [int]$length
        if (($i + $lengthInt) -gt $len) { break }
        $val = New-Object byte[] $lengthInt
        [Array]::Copy($data, $i, $val, 0, $lengthInt)
        $result["$tag"] = $val
        $i += $lengthInt
    }
    return $result
}

function ExtractPan([byte[]] $bcd) {
    $s = ""
    foreach ($b in $bcd) {
        $hi = ($b -shr 4) -band 0x0F
        $lo = $b -band 0x0F
        $s += $hi.ToString()
        if ($lo -ne 0x0F) { $s += $lo.ToString() }
    }
    return $s
}

function BrandFromAid([byte[]] $aid) {
    $h = ToHex $aid
    if ($h.StartsWith("A000000003")) { return "Visa" }
    if ($h.StartsWith("A000000004")) { return "Mastercard" }
    if ($h.StartsWith("A000000025")) { return "Amex" }
    if ($h.StartsWith("A000000152")) { return "Discover" }
    if ($h.StartsWith("A000000333")) { return "JCB" }
    if ($h.StartsWith("A000000658")) { return "UnionPay" }
    return "Card"
}

function FindFirstAid([byte[]] $fci, [int] $len) {
    for ($i = 0; $i -lt ($len - 2); $i++) {
        if ($fci[$i] -eq 0x61) {
            $dirLen = [int]$fci[$i + 1]
            $j = $i + 2
            $end = $j + $dirLen
            while ($j -lt $end -and $j -lt ($len - 1)) {
                if ($fci[$j] -eq 0x4F) {
                    $aidLen = [int]$fci[$j + 1]
                    if (($j + 2 + $aidLen) -le $len) {
                        $aid = New-Object byte[] $aidLen
                        [Array]::Copy($fci, $j + 2, $aid, 0, $aidLen)
                        return $aid
                    }
                }
                $j += 2 + [int]$fci[$j + 1]
            }
        }
    }
    return $null
}

# Main
Write-Host "[DEBUG] Starting pcscReader.ps1"
$hCtx = [IntPtr]::Zero
$hCard = [IntPtr]::Zero

try {
    # Establish context
    Write-Host "[DEBUG] Establishing SCARD context"
    $r = [WinSCard]::SCardEstablishContext([WinSCard]::SCARD_SCOPE_USER, [IntPtr]::Zero, [IntPtr]::Zero, [ref]$hCtx)
    if ($r -ne 0) {
        Write-Host "[DEBUG] SCardEstablishContext failed: 0x$($r.ToString('X'))"
        Write-Output (ConvertTo-Json @{ok = $false; error = "SCardEstablishContext failed: 0x$($r.ToString('X'))" })
        exit 1
    }

    # List readers
    Write-Host "[DEBUG] Listing readers"
    $len = [uint32]0
    [WinSCard]::SCardListReadersW($hCtx, $null, $null, [ref]$len) | Out-Null
    if ($len -eq 0) {
        Write-Host "[DEBUG] No readers found"
        Write-Output (ConvertTo-Json @{ok = $false; error = "No readers found" })
        exit 1
    }
    $bufLen = [int]$len
    $buf = New-Object char[] $bufLen
    [WinSCard]::SCardListReadersW($hCtx, $null, $buf, [ref]$len) | Out-Null
    $stringLength = $bufLen - 2
    $readerString = New-Object string($buf, 0, $stringLength)
    $readerName = $readerString.Split([char]0)[0]
    Write-Host "[DEBUG] Found reader: $readerName"

    $maxAttempts = 60
    $attempt = 0
    $pan = $null
    $expiry = $null
    $cryptogram = $null
    $brand = "Card"
    $atr = $null

    while ($attempt -lt $maxAttempts -and -not $pan) {
        $attempt++
        Write-Host "[DEBUG] Attempt $attempt / $maxAttempts"

        $protocol = [uint32]0
        Write-Host "[DEBUG] Trying to connect to reader"
        $connectResult = [WinSCard]::SCardConnectW($hCtx, $readerName, [WinSCard]::SCARD_SHARE_EXCLUSIVE, [WinSCard]::SCARD_PROTOCOL_ANY, [ref]$hCard, [ref]$protocol)
        if ($connectResult -ne [WinSCard]::SCARD_S_SUCCESS) {
            Write-Host "[DEBUG] No card present (connect result: 0x$($connectResult.ToString('X'))), waiting 1s"
            Start-Sleep -Milliseconds 1000
            continue
        }
        Write-Host "[DEBUG] Connected to card with protocol: $protocol"

        $atrBuf = New-Object byte[] 33
        $atrLenVar = [uint32]33
        $stateVar = [uint32]0
        $protoVar = [uint32]0
        Write-Host "[DEBUG] Getting ATR"
        [WinSCard]::SCardStatus($hCard, [IntPtr]::Zero, [IntPtr]::Zero, [ref]$stateVar, [ref]$protoVar, $atrBuf, [ref]$atrLenVar) | Out-Null
        Write-Host "[DEBUG] ATR length: $atrLenVar"
        $atrIndex = [int]$atrLenVar - 1
        if ($atrIndex -ge 0) {
            $atrBytes = New-Object byte[] ($atrIndex + 1)
            [Array]::Copy($atrBuf, $atrBytes, $atrIndex + 1)
            $atr = ToHex $atrBytes
        }
        Write-Host "[DEBUG] ATR: $atr"

        Write-Host "[DEBUG] Selecting PPSE"
        $resp = [WinSCard]::Transmit($hCard, $protocol, $SELECT_PPSE)
        $allTlv = [System.Collections.Generic.List[byte]]::new()

        $aidList = @()
        if ($resp -and (IsSuccess $resp)) {
            Write-Host "[DEBUG] PPSE select success"
            $allTlv.AddRange($resp)
            $aid = FindFirstAid $resp $resp.Length
            if ($aid) {
                Write-Host "[DEBUG] Found AID in PPSE: $(ToHex $aid)"
                $aidList += ,$aid
                $brand = BrandFromAid $aid
            }
        } else {
            Write-Host "[DEBUG] PPSE select failed or no response"
        }

        Write-Host "[DEBUG] Adding common AIDs"
        $commonAids = @(
            @{AID = [byte[]]@(0xA0,0x00,0x00,0x00,0x03,0x10,0x10); Brand = "Visa"},
            @{AID = [byte[]]@(0xA0,0x00,0x00,0x00,0x03); Brand = "Visa"},
            @{AID = [byte[]]@(0xA0,0x00,0x00,0x00,0x04,0x10,0x10); Brand = "Mastercard"},
            @{AID = [byte[]]@(0xA0,0x00,0x00,0x00,0x04); Brand = "Mastercard"},
            @{AID = [byte[]]@(0xA0,0x00,0x00,0x00,0x25,0x01); Brand = "Amex"},
            @{AID = [byte[]]@(0xA0,0x00,0x00,0x01,0x52,0x30,0x10); Brand = "Discover"},
            @{AID = [byte[]]@(0xA0,0x00,0x00,0x03,0x33,0x01,0x01); Brand = "JCB"},
            @{AID = [byte[]]@(0xA0,0x00,0x00,0x06,0x58,0x20,0x10); Brand = "UnionPay"}
        )
        foreach ($ca in $commonAids) {
            $exists = $false
            foreach ($a in $aidList) {
                if ($a -join "," -eq $ca.AID -join ",") { $exists = $true; break }
            }
            if (-not $exists) { $aidList += ,$ca.AID }
        }
        Write-Host "[DEBUG] Total AIDs to try: $($aidList.Count)"

        foreach ($aid in $aidList) {
            if ($pan) { break }
            Write-Host "[DEBUG] Trying AID: $(ToHex $aid)"
            $resp2 = [WinSCard]::Transmit($hCard, $protocol, (SelectAid $aid))
            if (-not (IsSuccess $resp2)) {
                Write-Host "[DEBUG] AID select failed"
                continue
            }
            Write-Host "[DEBUG] AID select success"
            $allTlv.AddRange($resp2)

            Write-Host "[DEBUG] Sending GET PROCESSING OPTIONS"
            $resp3 = [WinSCard]::Transmit($hCard, $protocol, $GET_GPO)
            if ($resp3) { $allTlv.AddRange($resp3) }

            Write-Host "[DEBUG] Reading records"
            for ($sfi = 1; $sfi -le 10; $sfi++) {
                for ($rec = 1; $rec -le 16; $rec++) {
                    if ($pan) { break }
                    $rr = [WinSCard]::Transmit($hCard, $protocol, (ReadRecord $sfi $rec))
                    if (-not $rr -or $rr.Length -lt 2) { break }
                    if (-not (IsSuccess $rr)) { break }
                    $allTlv.AddRange($rr)
                }
                if ($pan) { break }
            }

            Write-Host "[DEBUG] Parsing TLV data"
            $tlvArr = $allTlv.ToArray()
            $tlvMap = ParseTlv $tlvArr $tlvArr.Length
            Write-Host "[DEBUG] TLV keys found: $($tlvMap.Keys -join ', ')"

            if ($tlvMap.ContainsKey("90")) {
                Write-Host "[DEBUG] Found PAN tag (90)"
                $pan = ExtractPan $tlvMap["90"]
                Write-Host "[DEBUG] Extracted PAN: $pan"
            }
            if (-not $pan -and $tlvMap.ContainsKey("87")) {
                Write-Host "[DEBUG] Found Track2 tag (87)"
                $t2 = $tlvMap["87"]
                $s = ""
                foreach ($b in $t2) {
                    $hi = ($b -shr 4) -band 0xF
                    $lo = $b -band 0xF
                    if ($hi -eq 0xD) { break }
                    $s += $hi.ToString()
                    if ($lo -eq 0xD) { break }
                    if ($lo -ne 0xF) { $s += $lo.ToString() }
                }
                if ($s.Length -ge 4) {
                    $pan = $s
                    Write-Host "[DEBUG] Extracted PAN from Track2: $pan"
                }
            }
            if ($pan) {
                if ($tlvMap.ContainsKey("24356")) {
                    Write-Host "[DEBUG] Found expiry tag (24356)"
                    $e = $tlvMap["24356"]
                    if ($e.Length -ge 2) {
                        $expiry = $e[1].ToString("X2") + $e[0].ToString("X2")
                        Write-Host "[DEBUG] Expiry: $expiry"
                    }
                }
                if ($tlvMap.ContainsKey("40730")) {
                    Write-Host "[DEBUG] Found cryptogram tag (40730)"
                    $cryptogram = ToHex $tlvMap["40730"]
                    Write-Host "[DEBUG] Cryptogram: $cryptogram"
                }
                $brand = BrandFromAid $aid
                Write-Host "[DEBUG] Brand: $brand"
            }
        }

        if (-not $pan) {
            Write-Host "[DEBUG] No PAN found, disconnecting and waiting 0.5s"
            [WinSCard]::SCardDisconnect($hCard, [WinSCard]::SCARD_UNPOWER_CARD) | Out-Null
            $hCard = [IntPtr]::Zero
            Start-Sleep -Milliseconds 500
        }
    }

    Write-Host "[DEBUG] Done, preparing output"
    $lastFour = if ($pan -and $pan.Length -ge 4) { $pan.Substring($pan.Length - 4) } else { $null }
    Write-Host "[DEBUG] Last four: $lastFour"

    $out = @{
        ok         = ($pan -ne $null)
        pan        = $pan
        lastFour   = $lastFour
        expiry     = $expiry
        brand      = $brand
        entryMethod = "nfc"
        cryptogram = $cryptogram
        atr        = $atr
        reader     = $readerName
        error      = if ($pan) { $null } else { "Timed out waiting for card" }
    }
    Write-Host "[DEBUG] Output: $(ConvertTo-Json $out -Compress)"
    Write-Output (ConvertTo-Json $out -Compress)
}
catch {
    Write-Host "[DEBUG] Exception: $_"
    Write-Host "[DEBUG] Stack trace: $($_.ScriptStackTrace)"
    Write-Output (ConvertTo-Json @{ok = $false; error = $_.Exception.Message })
}
finally {
    Write-Host "[DEBUG] Cleaning up"
    if ($hCard -ne [IntPtr]::Zero) { [WinSCard]::SCardDisconnect($hCard, [WinSCard]::SCARD_UNPOWER_CARD) | Out-Null }
    if ($hCtx -ne [IntPtr]::Zero) { [WinSCard]::SCardReleaseContext($hCtx) | Out-Null }
}
