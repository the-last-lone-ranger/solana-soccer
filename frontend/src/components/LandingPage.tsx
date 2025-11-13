import { WalletConnect } from './WalletConnect.js';
import './LandingPage.css';

export function LandingPage() {
  return (
    <div className="landing-page">
      <div className="landing-hero">
        <div className="hero-content">
          <div className="hero-badge">🚀 THE FUTURE OF WEB3 GAMING</div>
          <h1 className="hero-title">
            <span className="title-line">Defend</span>
            <span className="title-line gradient-text">Solana</span>
            <span className="title-line">from the</span>
            <span className="title-line gradient-text-2">Void</span>
          </h1>
          <p className="hero-subtitle">
            Experience the next generation of blockchain gaming. 
            Connect your wallet, claim your crown, and dominate the leaderboard.
          </p>
          <div className="hero-features">
            <div className="feature-item">
              <span className="feature-icon">⚡</span>
              <span>Instant Wallet Auth</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">👑</span>
              <span>Leader Rewards</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">🎁</span>
              <span>Rare Item Drops</span>
            </div>
          </div>
        </div>
        <div className="hero-card">
          <WalletConnect />
        </div>
      </div>
      
      <div className="landing-particles">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="particle" style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 5}s`,
            animationDuration: `${5 + Math.random() * 5}s`,
          }} />
        ))}
      </div>
    </div>
  );
}

