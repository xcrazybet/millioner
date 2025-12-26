// firebase-config.js - Secure configuration
const getFirebaseConfig = () => {
    // In production, these should be environment variables
    // For now, we'll keep them here but make sure this file is NOT tracked by git
    return {
        apiKey: "AIzaSyA72Yo_YGqno9PX25p3yQBvyflcaM-NqEM",
        authDomain: "x-bet-prod-jd.firebaseapp.com",
        projectId: "x-bet-prod-jd",
        storageBucket: "x-bet-prod-jd.firebasestorage.app",
        messagingSenderId: "499334334535",
        appId: "1:499334334535:web:bebc1bf817e24d9e3c4962",
        measurementId: "G-PTV4XMYQ6P"
    };
};
