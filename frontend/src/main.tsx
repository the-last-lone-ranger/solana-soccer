import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { WalletProvider } from './contexts/WalletContext.js';
import { ThemeProvider } from './contexts/ThemeContext.js';
import App from './App.js';
import './index.css';

// Suppress MetaMask provider conflict errors (harmless for Solana apps)
const originalError = console.error;
console.error = function(...args: any[]) {
  const message = args[0]?.toString() || '';
  // Suppress MetaMask provider conflict warnings
  if (message.includes('MetaMask encountered an error setting the global Ethereum provider') ||
      message.includes('Cannot set property ethereum') ||
      message.includes('which has only a getter')) {
    return; // Silently ignore
  }
  originalError.apply(console, args);
};

// Handle unhandled errors gracefully
window.addEventListener('error', (event) => {
  if (event.message && (
    event.message.includes('Cannot set property ethereum') ||
    event.message.includes('which has only a getter')
  )) {
    event.preventDefault();
    return false;
  }
}, true);

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  const message = event.reason?.toString() || '';
  if (message.includes('Cannot set property ethereum') ||
      message.includes('which has only a getter')) {
    event.preventDefault();
    return false;
  }
});

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <WalletProvider>
          <App />
        </WalletProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
} catch (error) {
  console.error('Failed to initialize app:', error);
  document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: system-ui, sans-serif;">
      <div style="text-align: center; padding: 2rem;">
        <h1>Failed to Load Application</h1>
        <p>Please refresh the page or check the console for details.</p>
        <button onclick="window.location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; cursor: pointer;">
          Reload Page
        </button>
      </div>
    </div>
  `;
}

