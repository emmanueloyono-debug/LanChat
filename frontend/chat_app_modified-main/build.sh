#!/bin/bash

echo "🎨 Building Tailwind CSS for production..."

# Build the CSS
npx tailwindcss -i ./src/input.css -o ./css/style.css --minify

if [ $? -eq 0 ]; then
    echo "✅ Tailwind CSS built successfully!"
    echo "📦 Ready for deployment to Vercel"
else
    echo "❌ Build failed!"
    exit 1
fi
