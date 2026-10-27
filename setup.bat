@echo off
echo ============================================
echo  LAN Chat — Dependency Setup
echo ============================================

cd /d "%~dp0"

echo.
echo [1/2] Installing npm packages (express, socket.io, multer)...
npm install
if errorlevel 1 (
    echo ERROR: npm install failed. Make sure Node.js is installed.
    pause
    exit /b 1
)

echo.
echo [2/2] Copying notification sound from frontend...
if not exist "public\js\ting.mp3" (
    copy "frontend\chat_app_modified-main\js\ting.mp3" "public\js\ting.mp3" >nul
    echo Copied ting.mp3
) else (
    echo ting.mp3 already present, skipping.
)

echo.
echo ============================================
echo  Setup complete! Start the server with:
echo    npm start
echo  Then open: http://localhost:3000
echo.
echo  ADMIN ACCESS:
echo    Nickname : anything you like
echo    Password : teacher123
echo ============================================
pause
