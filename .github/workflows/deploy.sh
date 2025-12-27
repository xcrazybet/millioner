#!/bin/bash
# deploy.sh - Deploy to BOTH Firebase and GitHub Pages

echo "🔄 Syncing files..."
# Copy public files to root for Firebase
cp -r public/* . 2>/dev/null || true

echo "🚀 Deploying to Firebase..."
firebase deploy --only hosting --force

echo "🌐 Deploying to GitHub Pages..."
git add .
git commit -m "Update site"
git push origin main

echo "✅ Done! Visit:"
echo "- Firebase: https://x-bet-prod-jd.web.app"
echo "- GitHub Pages: https://xcrazybet.github.io/millioner"
