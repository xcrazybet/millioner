// deploy-rules.js - Run this in Firebase CLI
const { exec } = require('child_process');
const fs = require('fs');

console.log('Deploying Firestore rules...');

// Read the firestore.rules file
const rules = fs.readFileSync('firestore.rules', 'utf8');

// Create a temporary .rules file for deployment
fs.writeFileSync('firestore-deploy.rules', rules);

// Deploy using Firebase CLI
exec('firebase deploy --only firestore:rules', (error, stdout, stderr) => {
    if (error) {
        console.error('Error deploying rules:', error);
        return;
    }
    console.log('Rules deployed successfully!');
    console.log(stdout);
    
    // Clean up
    fs.unlinkSync('firestore-deploy.rules');
});
