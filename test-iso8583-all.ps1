Write-Host "============================================" -ForegroundColor Cyan
Write-Host "ISO8583 TCP Communication Test Suite" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Start ISO8583 Server in background
Write-Host "[1/5] Starting ISO8583 TCP Server..." -ForegroundColor Yellow
$serverProcess = Start-Process pwsh -ArgumentList "-NoExit", "-Command", "node iso8583-server.js" -PassThru
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "[2/5] Testing Node.js TCP Client..." -ForegroundColor Yellow
node test-iso8583-tcp.js

Write-Host ""
Write-Host "[3/5] Testing PowerShell TCP Client..." -ForegroundColor Yellow
try {
    $client = New-Object System.Net.Sockets.TcpClient("127.0.0.1", 8000)
    $stream = $client.GetStream()
    
    # Send network management message
    $message = "08009F0206A00000000317"
    $bytes = [System.Text.Encoding]::ASCII.GetBytes($message + "`n")
    $stream.Write($bytes, 0, $bytes.Length)
    Write-Host "  Sent: $message" -ForegroundColor Green
    
    # Wait for response
    Start-Sleep -Seconds 1
    
    # Read response
    $readBuffer = New-Object byte[] 1024
    $bytesRead = $stream.Read($readBuffer, 0, 1024)
    $response = [System.Text.Encoding]::ASCII.GetString($readBuffer, 0, $bytesRead)
    Write-Host "  Response: $response" -ForegroundColor Green
    
    $client.Close()
} catch {
    Write-Host "  Error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "[4/5] Testing Financial Transaction..." -ForegroundColor Yellow
try {
    $client = New-Object System.Net.Sockets.TcpClient("127.0.0.1", 8000)
    $stream = $client.GetStream()
    
    # Send financial transaction
    $message = "02009F0206A000000003179F03060010000000031500"
    $bytes = [System.Text.Encoding]::ASCII.GetBytes($message + "`n")
    $stream.Write($bytes, 0, $bytes.Length)
    Write-Host "  Sent: $message" -ForegroundColor Green
    
    # Wait for response
    Start-Sleep -Seconds 1
    
    # Read response
    $readBuffer = New-Object byte[] 1024
    $bytesRead = $stream.Read($readBuffer, 0, 1024)
    $response = [System.Text.Encoding]::ASCII.GetString($readBuffer, 0, $bytesRead)
    Write-Host "  Response: $response" -ForegroundColor Green
    
    $client.Close()
} catch {
    Write-Host "  Error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "[5/5] Testing Hex Utilities..." -ForegroundColor Yellow
node -e "const {hexToBinary, binaryToHex, buildISO8583FromHex} = require('./utils/iso8583tcp'); const hex = '0800 9F02 9F03'; const bin = hexToBinary(hex); console.log('  Hex:', hex); console.log('  Binary length:', bin.length, 'bytes'); console.log('  Back to hex:', binaryToHex(bin, true)); const msg = buildISO8583FromHex({mti: '0800', '9F02': '06A00000000317'}); console.log('  Built ISO8583:', msg);"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Tests Complete!" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Server is running in background (PID: $($serverProcess.Id))" -ForegroundColor Yellow
Write-Host "To stop server: Stop-Process -Id $($serverProcess.Id)" -ForegroundColor Yellow
Write-Host ""
