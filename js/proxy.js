// ============================================
// CORS PROXY SERVICE - X Lodon Betting
// ============================================

const PROXY_CONFIG = {
    // Primary proxy - most reliable
    primary: 'https://api.allorigins.win/raw?url=',
    
    // Backup proxies
    backups: [
        'https://corsproxy.io/?',
        'https://cors-anywhere.herokuapp.com/',
        'https://proxy.cors.sh/'
    ],
    
    // Direct API (if CORS is fixed)
    direct: ''
};

class CORSProxy {
    constructor() {
        this.currentProxy = PROXY_CONFIG.primary;
        this.failedProxies = [];
    }
    
    async fetch(url, options = {}) {
        // Try current proxy first
        try {
            const response = await this.tryProxy(this.currentProxy, url, options);
            if (response) return response;
        } catch (e) {
            console.warn(`Primary proxy failed: ${e.message}`);
            this.failedProxies.push(this.currentProxy);
        }
        
        // Try backups
        for (const proxy of PROXY_CONFIG.backups) {
            if (this.failedProxies.includes(proxy)) continue;
            
            try {
                const response = await this.tryProxy(proxy, url, options);
                if (response) {
                    this.currentProxy = proxy;
                    console.log(`✅ Switched to backup proxy: ${proxy.split('/')[2]}`);
                    return response;
                }
            } catch (e) {
                console.warn(`Backup proxy ${proxy.split('/')[2]} failed`);
                this.failedProxies.push(proxy);
            }
        }
        
        // Try direct as last resort
        try {
            console.log('Trying direct API call...');
            const response = await fetch(url, options);
            if (response.ok) {
                this.currentProxy = PROXY_CONFIG.direct;
                return response;
            }
        } catch (e) {
            console.error('Direct API call failed');
        }
        
        throw new Error('All proxies failed - network error');
    }
    
    async tryProxy(proxy, url, options) {
        const proxyUrl = proxy + encodeURIComponent(url);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
        
        try {
            const response = await fetch(proxyUrl, {
                ...options,
                signal: controller.signal,
                headers: {
                    ...options.headers,
                    'Accept': 'application/json'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            return response;
            
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }
    
    async fetchJSON(url, options = {}) {
        const response = await this.fetch(url, options);
        return await response.json();
    }
    
    reset() {
        this.failedProxies = [];
        this.currentProxy = PROXY_CONFIG.primary;
    }
}

// Create global instance
const corsProxy = new CORSProxy();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { corsProxy, CORSProxy };
}

console.log('✅ CORS Proxy service loaded');
