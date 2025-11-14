import { motion } from 'framer-motion';
import { WalletConnect } from './WalletConnect.js';
import './LandingPage.css';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

const featureVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

export function LandingPage() {
  return (
    <motion.div
      className="landing-page"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <div className="landing-hero">
        <motion.div className="hero-content" variants={itemVariants}>
          <motion.div
            className="hero-badge"
            variants={itemVariants}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            🚀 THE FUTURE OF WEB3 GAMING
          </motion.div>
          <motion.h1 className="hero-title" variants={itemVariants}>
            <motion.span
              className="title-line title-emoji"
              variants={itemVariants}
              whileHover={{ rotate: [0, -10, 10, -10, 0], transition: { duration: 0.5 } }}
            >
              <svg width="1em" height="1em" viewBox="0 0 5000 5000" style={{ verticalAlign: 'middle', display: 'inline-block' }}>
                <g transform="translate(2500, 2500)" stroke="#000" strokeWidth="24">
                  <circle fill="#fff" r="2376"/>
                  <path fill="none" d="m-1643-1716 155 158m-550 2364c231 231 538 195 826 202m-524-2040c-491 351-610 1064-592 1060m1216-1008c-51 373 84 783 364 1220m-107-2289c157-157 466-267 873-329m-528 4112c-50 132-37 315-8 510m62-3883c282 32 792 74 1196 303m-404 2644c310 173 649 247 1060 180m-340-2008c-242 334-534 645-872 936m1109-2119c-111-207-296-375-499-534m1146 1281c100 3 197 44 290 141m-438 495c158 297 181 718 204 1140"/>
                </g>
              </svg>
            </motion.span>
            <motion.span className="title-line gradient-text" variants={itemVariants}>
              Kicking It
            </motion.span>
            <motion.span className="title-line" variants={itemVariants}>
              with
            </motion.span>
            <motion.span className="title-line gradient-text-2" variants={itemVariants}>
              $SOCCER
            </motion.span>
          </motion.h1>
          <motion.p className="hero-subtitle" variants={itemVariants}>
            Experience the next generation of multiplayer soccer gaming. 
            Connect your wallet, own $SOCCER token for 2.5x rewards, and dominate the pitch.
          </motion.p>
          <motion.div className="hero-features" variants={itemVariants}>
            <motion.div
              className="feature-item"
              variants={featureVariants}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="feature-icon">⚡</span>
              <span>Instant Wallet Auth</span>
            </motion.div>
            <motion.div
              className="feature-item"
              variants={featureVariants}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="feature-icon">⚽</span>
              <span>$SOCCER Token Rewards</span>
            </motion.div>
            <motion.div
              className="feature-item"
              variants={featureVariants}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="feature-icon">🎁</span>
              <span>Rare Item Drops</span>
            </motion.div>
          </motion.div>
          <motion.div className="landing-contract-footer" variants={itemVariants}>
            <div className="landing-contract-footer-row">
              <span className="landing-contract-label">$SOCCER Contract</span>
              <code className="landing-contract-address">6q75D5TCaEJXSvidqwEDeyog55MKhWV2k5NZQRpzpump</code>
            </div>
            <div className="landing-contract-footer-row">
              <motion.button
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
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Copy Address
              </motion.button>
              <motion.a
                href={`https://birdeye.so/token/6q75D5TCaEJXSvidqwEDeyog55MKhWV2k5NZQRpzpump?chain=solana`}
                target="_blank"
                rel="noopener noreferrer"
                className="landing-contract-btn landing-contract-btn-chart"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                View Chart
              </motion.a>
            </div>
          </motion.div>
        </motion.div>
        <motion.div
          className="hero-card"
          variants={itemVariants}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <WalletConnect />
        </motion.div>
      </div>
      
      <div className="landing-particles">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            className="particle"
            initial={{ opacity: 0, y: 100 }}
            animate={{
              opacity: [0, 0.6, 0.6, 0],
              y: -100,
              x: Math.random() * 100 - 50,
            }}
            transition={{
              duration: 5 + Math.random() * 5,
              delay: Math.random() * 5,
              repeat: Infinity,
              ease: 'linear',
            }}
            style={{
              left: `${Math.random() * 100}%`,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

