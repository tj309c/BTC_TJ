@echo off
:: ============================================
:: TradePulse Status Script
:: ============================================
:: Shows the status of TradePulse services
:: ============================================

title TradePulse Status

set BACKEND_PORT=5000
set FRONTEND_PORT=3000

echo.
echo ========================================
echo    TradePulse Status
echo ========================================
echo.

:: Check backend
echo Backend API (port %BACKEND_PORT%):
netstat -ano | findstr ":%BACKEND_PORT% " | findstr "LISTENING" > nul 2>&1
if %errorlevel%==0 (
    echo   Status: RUNNING
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%BACKEND_PORT% " ^| findstr "LISTENING"') do (
        echo   PID: %%a
    )
    curl -s http://localhost:%BACKEND_PORT%/api/health > nul 2>&1
    if %errorlevel%==0 (
        echo   Health: OK
    ) else (
        echo   Health: NOT RESPONDING
    )
) else (
    echo   Status: STOPPED
)

echo.

:: Check frontend
echo Frontend (port %FRONTEND_PORT%):
netstat -ano | findstr ":%FRONTEND_PORT% " | findstr "LISTENING" > nul 2>&1
if %errorlevel%==0 (
    echo   Status: RUNNING
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%FRONTEND_PORT% " ^| findstr "LISTENING"') do (
        echo   PID: %%a
    )
) else (
    echo   Status: STOPPED
)

echo.

:: Check active connections
echo Active Connections:
for /f %%a in ('netstat -ano ^| findstr ":%BACKEND_PORT%" ^| find /c "ESTABLISHED"') do (
    echo   Backend: %%a connections
)
for /f %%a in ('netstat -ano ^| findstr ":%FRONTEND_PORT%" ^| find /c "ESTABLISHED"') do (
    echo   Frontend: %%a connections
)

echo.

:: Check cache files
echo Cache Files:
set PROJECT_DIR=%~dp0
if exist "%PROJECT_DIR%btc_full_data_cache.parquet" (
    for %%f in ("%PROJECT_DIR%btc_full_data_cache.parquet") do echo   btc_full_data_cache.parquet: %%~zf bytes
) else (
    echo   btc_full_data_cache.parquet: NOT FOUND
)
if exist "%PROJECT_DIR%btc_ohlc_cache.parquet" (
    for %%f in ("%PROJECT_DIR%btc_ohlc_cache.parquet") do echo   btc_ohlc_cache.parquet: %%~zf bytes
) else (
    echo   btc_ohlc_cache.parquet: NOT FOUND
)

echo.
echo ========================================
echo.
pause
