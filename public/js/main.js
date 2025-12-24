import { auth } from './modules/auth.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
    const currentPage = window.location.pathname;
    
    if (user) {
        console.log("User logged in:", user.email);
        if (currentPage.includes('login.html') || currentPage.includes('register.html')) {
            window.location.href = 'dashboard.html';
        }
    } else {
        if (currentPage.includes('dashboard.html')) {
            window.location.href = 'login.html';
        }
    }
});
