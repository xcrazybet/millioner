README-FOR-CLIENTS.md# Football Data Hub - Client Integration

## 📦 Quick Start

Add this to your HTML:

```html
<!-- Add this where you want the widget -->
<div id="football-widget"></div>

<!-- Add this before closing </body> -->
<script src="https://xcrazybet.github.io/millioner/client-sdk-enhanced.js"></script>
<script>
  // Initialize widget
  embedFootballWidget('#football-widget', {
    type: 'predictions', // 'predictions', 'live', 'valuebets'
    theme: 'dark',       // 'dark' or 'light'
    autoRefresh: true    // Auto-update every minute
  });
</script>
