# setup-api.ps1
Write-Host "--- MILLIONER API Setup & Deployment ---" -ForegroundColor Cyan

$TOKEN = "DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy"

Write-Host "1. Setting API token in Firebase config..." -ForegroundColor Yellow
firebase functions:config:set sportmonks.key="$TOKEN"

Write-Host "2. Deploying Cloud Functions..." -ForegroundColor Yellow
firebase deploy --only functions

Write-Host "3. Deploying Hosting (Frontend)..." -ForegroundColor Yellow
firebase deploy --only hosting

Write-Host "`n--- SETUP COMPLETE ---" -ForegroundColor Green
Write-Host "Check your website: http://xlodon.co.uk/sports.html"
Write-Host "If matches still don't load, verify your project is on the Blaze (Pay-as-you-go) plan."
