#!/bin/bash

# ModernChat Deployment Script
# This script helps you prepare your project for deployment

echo "🚀 ModernChat Deployment Helper"
echo "================================"

# Check if we're in the right directory
if [ ! -f "index.html" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

echo "📋 Pre-deployment checklist:"

# 1. Check if dependencies are installed
echo "1. Checking dependencies..."
cd nodeServer
if [ ! -d "node_modules" ]; then
    echo "   Installing dependencies..."
    npm install
else
    echo "   ✅ Dependencies already installed"
fi
cd ..

# 2. Test the server
echo "2. Testing server startup..."
cd nodeServer
timeout 5s npm start > /dev/null 2>&1
if [ $? -eq 0 ] || [ $? -eq 124 ]; then
    echo "   ✅ Server starts successfully"
else
    echo "   ❌ Server startup failed"
    cd ..
    exit 1
fi
cd ..

# 3. Check for required files
echo "3. Checking required files..."
files=("index.html" "js/client.js" "nodeServer/index.js" "nodeServer/package.json")
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✅ $file found"
    else
        echo "   ❌ $file missing"
        exit 1
    fi
done

echo ""
echo "🎉 Your project is ready for deployment!"
echo ""
echo "📝 Next steps:"
echo "1. Update the backend URL in js/client.js"
echo "2. Push to GitHub: git add . && git commit -m 'Ready for deployment' && git push"
echo "3. Deploy backend to Render.com"
echo "4. Deploy frontend to Netlify.com"
echo ""
echo "📖 For detailed instructions, see HOSTING_GUIDE.md"
