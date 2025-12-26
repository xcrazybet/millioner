// fixes.js - Critical fixes for index.html
document.addEventListener('DOMContentLoaded', function() {
    // 1. Input sanitization
    window.sanitizeHTML = function(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };
    
    // 2. Enhanced error handling
    window.showError = function(error, context = '') {
        console.error(`Error in ${context}:`, error);
        
        let userMessage = 'An error occurred. Please try again.';
        
        if (error.code === 'permission-denied') {
            userMessage = 'You do not have permission to perform this action.';
        } else if (error.code === 'unavailable') {
            userMessage = 'Service is temporarily unavailable. Please check your connection.';
        }
        
        if (typeof showToast === 'function') {
            showToast('error', 'Error', userMessage);
        }
    };
    
    // 3. Mobile menu improvements
    document.addEventListener('click', function(e) {
        if (e.target.closest('.nav-link')) {
            document.querySelectorAll('.nav-links.show').forEach(nav => {
                nav.classList.remove('show');
                document.getElementById('mobileMenuBtn')?.setAttribute('aria-expanded', 'false');
            });
        }
    });
});
