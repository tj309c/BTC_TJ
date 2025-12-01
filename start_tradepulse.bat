@echo off
setlocal enabledelayedexpansion

:: ============================================
:: TradePulse Startup Script
:: ============================================
:: This script starts both the backend API and frontend
:: with automatic idle timeout and cleanup
:: ============================================

title TradePulse Launcher

:: Configuration
set IDLE_TIMEOUT_MINUTES=30
set BACKEND_PORT=5000
set FRONTEND_PORT=3000
set PROJECT_DIR=%~dp0
set VENV_PATH=%PROJECT_DIR%venv

echo.
echo ========================================
echo    TradePulse Startup Script
echo ========================================
echo.

:: Check if ports are already in use
echo [1/6] Checking for existing processes on ports...
netstat -ano | findstr ":%BACKEND_PORT% " > nul
if %errorlevel%==0 (
    echo WARNING: Port %BACKEND_PORT% is already in use!
    echo Attempting to kill existing process...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%BACKEND_PORT% " ^| findstr "LISTENING"') do (
        echo Killing PID %%a
        taskkill /PID %%a /F > nul 2>&1
    )
    timeout /t 2 > nul
)

netstat -ano | findstr ":%FRONTEND_PORT% " > nul
if %errorlevel%==0 (
    echo WARNING: Port %FRONTEND_PORT% is already in use!
    echo Attempting to kill existing process...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%FRONTEND_PORT% " ^| findstr "LISTENING"') do (
        echo Killing PID %%a
        taskkill /PID %%a /F > nul 2>&1
    )
    timeout /t 2 > nul
)

:: Navigate to project directory
cd /d "%PROJECT_DIR%"
echo [2/6] Working directory: %PROJECT_DIR%

:: Check for virtual environment
if exist "%VENV_PATH%\Scripts\activate.bat" (
    echo [3/6] Activating virtual environment...
    call "%VENV_PATH%\Scripts\activate.bat"
) else (
    echo [3/6] No virtual environment found, using system Python...
)

:: Install Python dependencies if needed
echo [4/6] Checking Python dependencies...
pip show flask > nul 2>&1
if %errorlevel% neq 0 (
    echo Installing Python dependencies...
    pip install flask flask-cors flask-compress pandas numpy requests pyarrow
)

:: Check for secrets.toml
if not exist "%PROJECT_DIR%secrets.toml" (
    echo.
    echo WARNING: secrets.toml not found!
    echo Create this file with your API keys. See STARTUP_GUIDE.md
    echo.
)

:: Start backend API server in background
echo [5/6] Starting backend API server on port %BACKEND_PORT%...
start "TradePulse API" /min cmd /c "cd /d %PROJECT_DIR% && python api_server.py"

:: Wait for backend to start
echo Waiting for backend to initialize...
timeout /t 3 > nul

:: Verify backend started
curl -s http://localhost:%BACKEND_PORT%/api/health > nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: Backend may not have started correctly.
    echo Check the "TradePulse API" window for errors.
)

:: Start frontend
echo [6/6] Starting frontend on port %FRONTEND_PORT%...
cd /d "%PROJECT_DIR%tradepulse"

:: Check if node_modules exists
if not exist "node_modules" (
    echo Installing Node.js dependencies...
    call npm install
)

:: Start frontend in background
start "TradePulse Frontend" /min cmd /c "npm run dev"

:: Wait for frontend to start
timeout /t 5 > nul

echo.
echo ========================================
echo    TradePulse is starting!
echo ========================================
echo.
echo Backend API:  http://localhost:%BACKEND_PORT%
echo Frontend:     http://localhost:%FRONTEND_PORT%
echo.
echo Idle timeout: %IDLE_TIMEOUT_MINUTES% minutes
echo.
echo Opening browser...
start http://localhost:%FRONTEND_PORT%

echo.
echo ========================================
echo    Idle Monitor Active
echo ========================================
echo.
echo This window monitors for idle timeout.
echo Close this window to stop monitoring.
echo Use stop_tradepulse.bat to shutdown all services.
echo.

:: Start idle monitoring
call :monitor_idle
goto :eof

:: ============================================
:: Idle Monitor Function
:: ============================================
:monitor_idle
set /a IDLE_SECONDS=0
set /a TIMEOUT_SECONDS=%IDLE_TIMEOUT_MINUTES%*60
set /a CHECK_INTERVAL=60

:monitor_loop
:: Check if backend is still running
curl -s http://localhost:%BACKEND_PORT%/api/health > nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo Backend is no longer running. Exiting monitor.
    goto :cleanup_and_exit
)

:: Check for recent API activity by looking at connection count
set CONNECTIONS=0
for /f %%a in ('netstat -ano ^| findstr ":%BACKEND_PORT%" ^| find /c "ESTABLISHED"') do set CONNECTIONS=%%a

if %CONNECTIONS% gtr 0 (
    :: Active connections, reset idle timer
    set /a IDLE_SECONDS=0
    echo [%time%] Active connections: %CONNECTIONS% - Idle timer reset
) else (
    :: No connections, increment idle timer
    set /a IDLE_SECONDS+=CHECK_INTERVAL
    set /a REMAINING=(%TIMEOUT_SECONDS%-%IDLE_SECONDS%)/60
    echo [%time%] No active connections. Idle: %IDLE_SECONDS%s / %TIMEOUT_SECONDS%s ^(~%REMAINING% min remaining^)
)

:: Check if idle timeout exceeded
if %IDLE_SECONDS% geq %TIMEOUT_SECONDS% (
    echo.
    echo ========================================
    echo    IDLE TIMEOUT REACHED
    echo ========================================
    echo No activity for %IDLE_TIMEOUT_MINUTES% minutes.
    echo Shutting down TradePulse services...
    goto :cleanup_and_exit
)

:: Wait before next check
timeout /t %CHECK_INTERVAL% > nul
goto :monitor_loop

:cleanup_and_exit
echo.
echo Stopping TradePulse services...

:: Kill backend
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%BACKEND_PORT% " ^| findstr "LISTENING"') do (
    echo Stopping backend ^(PID %%a^)...
    taskkill /PID %%a /F > nul 2>&1
)

:: Kill frontend
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%FRONTEND_PORT% " ^| findstr "LISTENING"') do (
    echo Stopping frontend ^(PID %%a^)...
    taskkill /PID %%a /F > nul 2>&1
)

:: Kill any node processes from this project
taskkill /FI "WINDOWTITLE eq TradePulse*" /F > nul 2>&1

echo.
echo TradePulse has been shut down.
echo Run start_tradepulse.bat to restart.
echo.
pause
exit /b 0
