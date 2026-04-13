// ============================================
// FRONTEND PROXY HELPER - X Lodon Betting
// Works with Render backend
// ============================================

const PROXY_CONFIG = {
    // Your Render backend URL
    backend: 'https://millioner.onrender.com',
    
    // Fallback proxies (only used if backend fails)
    fallbacks: [
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://corsproxy.io/?'
    ]
};

class APIProxy {
    constructor() {
        this.useBackend = true;
        this.backendUrl = PROXY_CONFIG.backend;
    }
    
    async fetch(endpoint) {
        // Try Render backend first
        if (this.useBackend) {
            try {
                const url = `${this.backendUrl}${endpoint}`;
                console.log(`🔄 Fetching from backend: ${url}`);
                
                const response = await fetch(url);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log(`✅ Backend success: ${endpoint}`);
                    return data;
                }
            } catch (e) {
                console.warn('⚠️ Backend failed, trying fallback...');
                this.useBackend = false;
            }
        }
        
        // Try fallback proxies
        for (const proxy of PROXY_CONFIG.fallbacks) {
            try {
                const apiUrl = `https://api.sportmonks.com/v3/football${endpoint}?api_token=${SPORTMONKS_TOKEN}`;
                const proxyUrl = proxy + encodeURIComponent(apiUrl);
                
                console.log(`🔄 Trying fallback: ${proxy.split('/')[2]}`);
                const response = await fetch(proxyUrl);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log(`✅ Fallback success`);
                    return data;
                }
            } catch (e) {
                console.warn(`Fallback failed: ${e.message}`);
            }
        }
        
        console.error('❌ All fetch methods failed');
        return null;
    }
    
    reset() {
        this.useBackend = true;
    }
}

// Sportmonks token (same as backend)
const SPORTMONKS_TOKEN = 'DkFdWG9jFZvH8XSEgLrRfGwczABWVg5rlV25GvIRyN06zdPsOI48Nsv9Wooy';

// Create global instance
const apiProxy = new APIProxy();

console.log('✅ Proxy helper loaded - Backend: ' + PROXY_CONFIG.backend);
