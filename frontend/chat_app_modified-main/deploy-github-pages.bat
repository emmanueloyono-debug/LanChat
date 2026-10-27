@echo off
echo 🚀 ModernChat - GitHub Pages Deployment Helper
echo =============================================
echo.

REM Check if we're in the right directory
if not exist "index.html" (
    echo ❌ Error: Please run this script from the project root directory
    pause
    exit /b 1
)

echo 📋 Pre-deployment checklist:
echo.

REM Check for git
git --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Git is not installed. Please install Git first.
    pause
    exit /b 1
) else (
    echo ✅ Git is available
)

REM Check if this is a git repository
if not exist ".git" (
    echo 🔧 Initializing Git repository...
    git init
    echo ✅ Git repository initialized
) else (
    echo ✅ Git repository found
)

echo.
echo 📝 Next steps:
echo 1. Update CORS on Render dashboard:
echo    - Add environment variable CORS_ORIGIN
echo    - Value: https://yourusername.github.io,http://127.0.0.1:5500,http://localhost:5500
echo    - Replace 'yourusername' with your GitHub username
echo.
echo 2. Run these commands to deploy:
echo    git add .
echo    git commit -m "Deploy to GitHub Pages"
echo    git remote add origin https://github.com/yourusername/chat-app-modified.git
echo    git push -u origin main
echo.
echo 3. Enable GitHub Pages in your repository settings
echo.
echo 📖 For detailed instructions, see GITHUB_PAGES_SETUP.md
echo.
pause
