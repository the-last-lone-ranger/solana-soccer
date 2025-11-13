#!/bin/bash

# Railway Deployment Script
# This script helps you deploy to Railway

echo "🚀 Railway Deployment Helper"
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
fi

echo "✅ Railway CLI ready"
echo ""
echo "Next steps:"
echo ""
echo "Option 1: Deploy via Railway Dashboard (Easiest)"
echo "  1. Go to: https://railway.app/dashboard"
echo "  2. Click 'New Project' → 'Deploy from GitHub repo'"
echo "  3. Select your repository"
echo "  4. Add environment variables (see RAILWAY_DEPLOY.md)"
echo "  5. Deploy!"
echo ""
echo "Option 2: Deploy via CLI"
echo "  1. Run: railway login"
echo "  2. Run: railway init"
echo "  3. Run: railway up"
echo ""
echo "Your Railway API Token: 19713d2b-97fa-45fe-81e4-38037fa94c9b"
echo ""
echo "⚠️  Keep your token private! Don't commit it to git."
echo ""

