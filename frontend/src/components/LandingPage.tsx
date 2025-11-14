import { WalletConnect } from './WalletConnect.js';
import './LandingPage.css';

export function LandingPage() {
  return (
    <div className="landing-page">
      <div className="landing-hero">
        <div className="hero-content">
          <div className="hero-badge">🚀 THE FUTURE OF WEB3 GAMING</div>
          <h1 className="hero-title">
            <span className="title-line title-emoji">
              <svg width="1em" height="1em" viewBox="0 0 5000 5000" style={{ verticalAlign: 'middle', display: 'inline-block' }}>
                <g transform="translate(2500, 2500)" stroke="#000" strokeWidth="24">
                  <circle fill="#fff" r="2376"/>
                  <path fill="none" d="m-1643-1716 155 158m-550 2364c231 231 538 195 826 202m-524-2040c-491 351-610 1064-592 1060m1216-1008c-51 373 84 783 364 1220m-107-2289c157-157 466-267 873-329m-528 4112c-50 132-37 315-8 510m62-3883c282 32 792 74 1196 303m-404 2644c310 173 649 247 1060 180m-340-2008c-242 334-534 645-872 936m1109-2119c-111-207-296-375-499-534m1146 1281c100 3 197 44 290 141m-438 495c158 297 181 718 204 1140"/>
                </g>
              </svg>
            </span>
            <span className="title-line gradient-text">Kicking It</span>
            <span className="title-line">with</span>
            <span className="title-line gradient-text-2">$SOCCER</span>
          </h1>
          <p className="hero-subtitle">
            Experience the next generation of multiplayer soccer gaming. 
            Connect your wallet, own $SOCCER token for 2.5x rewards, and dominate the pitch.
          </p>
          <div className="hero-features">
            <div className="feature-item">
              <span className="feature-icon">⚡</span>
              <span>Instant Wallet Auth</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">⚽</span>
              <span>$SOCCER Token Rewards</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">🎁</span>
              <span>Rare Item Drops</span>
            </div>
          </div>
          <div className="landing-contract-footer">
            <div className="landing-contract-footer-row">
              <span className="landing-contract-label">$SOCCER Contract</span>
              <code className="landing-contract-address">6q75D5TCaEJXSvidqwEDeyog55MKhWV2k5NZQRpzpump</code>
            </div>
            <div className="landing-contract-footer-row">
              <button
                className="landing-contract-btn landing-contract-btn-copy"
                onClick={(e) => {
                  navigator.clipboard.writeText('6q75D5TCaEJXSvidqwEDeyog55MKhWV2k5NZQRpzpump');
                  const btn = e.target as HTMLElement;
                  const originalText = btn.textContent;
                  btn.textContent = '✓ Copied!';
                  setTimeout(() => {
                    btn.textContent = originalText;
                  }, 2000);
                }}
              >
                Copy Address
              </button>
              <a
                href={`https://birdeye.so/token/6q75D5TCaEJXSvidqwEDeyog55MKhWV2k5NZQRpzpump?chain=solana`}
                target="_blank"
                rel="noopener noreferrer"
                className="landing-contract-btn landing-contract-btn-chart"
              >
                View Chart
              </a>
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

