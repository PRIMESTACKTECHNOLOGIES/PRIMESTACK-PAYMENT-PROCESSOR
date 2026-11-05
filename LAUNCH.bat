@echo off
title PRIMESTACK PAYMENT PROCESSOR
color 0A
cd /d "%~dp0"

cls
echo.
echo  ============================================================
echo    PRIMESTACK PAYMENT PROCESSOR
echo  ============================================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found!
    echo  Install it from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Check .env
if not exist ".env" (
    echo  [ERROR] .env file not found!
    echo  Copy .env.example to .env and fill in your Stripe keys.
    echo.
    pause
    exit /b 1
)

:: Install dependencies if missing
if not exist "node_modules" (
    echo  [INFO] Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo  [ERROR] npm install failed!
        pause
        exit /b 1
    )
)

:: Open browser
echo  Opening browser in 2 seconds...
start "" http://localhost:6001
timeout /t 2 /nobreak >nul

:: Print URLs
echo.
echo  ============================================================
echo   Payment Terminal  :  http://localhost:6001
echo   Admin Panel       :  http://localhost:6001/admin
echo   Merchant Portal   :  http://localhost:6001/portal
echo  ============================================================
echo   Login password = ADMIN_API_KEY value in your .env file
echo  ============================================================
echo.
echo  Press Ctrl+C to stop the server.
echo.

:: Start server
node index.js

echo.
echo  Server stopped.
pause
