@echo off
:: ============================================
:: TradePulse Stop Script
:: ============================================
:: Cleanly shuts down all TradePulse services
:: ============================================

title TradePulse Shutdown

set BACKEND_PORT=5000
set FRONTEND_PORT=3000

echo.
echo ========================================
echo    TradePulse Shutdown
echo ========================================
echo.

:: Kill backend
echo Stopping backend API on port %BACKEND_PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%BACKEND_PORT% " ^| findstr "LISTENING" 2^>nul') do (
    echo   Killing PID %%a
    taskkill /PID %%a /F > nul 2>&1
)

:: Kill frontend
echo Stopping frontend on port %FRONTEND_PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%FRONTEND_PORT% " ^| findstr "LISTENING" 2^>nul') do (
    echo   Killing PID %%a
    taskkill /PID %%a /F > nul 2>&1
)

:: Kill any TradePulse windows
taskkill /FI "WINDOWTITLE eq TradePulse*" /F > nul 2>&1

echo.
echo Done! All TradePulse services have been stopped.
echo.

:: Verify ports are free
netstat -ano | findstr ":%BACKEND_PORT% " | findstr "LISTENING" > nul 2>&1
if %errorlevel%==0 (
    echo WARNING: Port %BACKEND_PORT% may still be in use.
) else (
    echo Port %BACKEND_PORT%: Free
)

netstat -ano | findstr ":%FRONTEND_PORT% " | findstr "LISTENING" > nul 2>&1
if %errorlevel%==0 (
    echo WARNING: Port %FRONTEND_PORT% may still be in use.
) else (
    echo Port %FRONTEND_PORT%: Free
)

echo.
pause
