import React from 'react';
import ReactDOM from 'react-dom/client';
import { WalletProvider } from './contexts/WalletContext.js';
import { ThemeProvider } from './contexts/ThemeContext.js';
import App from './App.js';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <WalletProvider>
        <App />
      </WalletProvider>
    </ThemeProvider>
  </React.StrictMode>
);

