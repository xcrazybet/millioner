#!/bin/bash
echo "🚀 Deploying to both Firebase and GitHub..."

# Deploy to Firebase
firebase deploy --only hosting

# Commit and push to GitHub
git add .
git commit -m "Update: $(date)"
git push origin main

# Trigger GitHub Pages rebuild
curl -X POST https://api.github.com/repos/xcrazybet/millioner/pages/builds \
  -H "Authorization: token YOUR_GITHUB_TOKEN"

echo "✅ Deployed to both platforms!"
