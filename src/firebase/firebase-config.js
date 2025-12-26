// firebase-config.js
// This should be loaded FIRST in all HTML files

const firebaseConfig = {
    apiKey: "AIzaSyA72Yo_YGqno9PX25p3yQBvyflcaM-NqEM",
    authDomain: "x-bet-prod-jd.firebaseapp.com",
    projectId: "x-bet-prod-jd",
    storageBucket: "x-bet-prod-jd.firebasestorage.app",
    messagingSenderId: "499334334535",
    appId: "1:499334334535:web:bebc1bf817e24d9e3c4962",
    measurementId: "G-PTV4XMYQ6P"
};

// Initialize Firebase
try {
    // Check if Firebase is already initialized
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    
    // Export Firebase services
    window.firebaseApp = {
        auth: firebase.auth(),
        db: firebase.firestore(),
        storage: firebase.storage(),
        app: firebase.app()
    };
    
    console.log("✅ Firebase initialized successfully");
    
} catch (error) {
    console.error("❌ Firebase initialization error:", error);
    throw error;
}

// Enable offline persistence for better gaming experience
firebase.firestore().enablePersistence()
    .then(() => console.log("📱 Offline persistence enabled"))
    .catch(err => {
        if (err.code === 'failed-precondition') {
            console.warn("⚠️ Multiple tabs open, persistence can only be enabled in one tab");
        } else if (err.code === 'unimplemented') {
            console.warn("⚠️ Browser doesn't support persistence");
        }
    });
