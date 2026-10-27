@echo off
echo 🎨 Building Tailwind CSS for production...

npx tailwindcss -i ./src/input.css -o ./css/style.css --minify

if %errorlevel% equ 0 (
    echo ✅ Tailwind CSS built successfully!
    echo 📦 Ready for deployment to Vercel
) else (
    echo ❌ Build failed!
    exit /b 1
)
