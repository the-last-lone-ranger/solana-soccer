# ⚽ Kicking It - Multiplayer Soccer with $SOCCER

A complete full-stack Web3 gaming platform featuring real-time multiplayer soccer matches, Solana wallet authentication, voice chat, EXP leveling system, rare item drops, and $SOCCER token integration.

## 🎮 Overview

**Kicking It** is a next-generation multiplayer soccer gaming platform built on Solana. Players compete in real-time matches, earn SOL rewards, level up through an EXP system, collect rare items, and benefit from holding the $SOCCER token. The platform combines competitive gaming with Web3 economics, creating an engaging play-to-earn experience.

## ✨ Core Features

### 🏆 Multiplayer Soccer Game
- **Real-time multiplayer matches** with up to 50 players per lobby
- **Team-based gameplay** (Red vs Blue) with synchronized physics
- **Smooth 60 FPS gameplay** powered by Canvas and Socket.IO
- **Real-time position synchronization** across all players
- **Spectator mode** to watch ongoing matches

### 🎯 Lobby System
- **Three bet tiers**:
  - **Free Lobbies** (0 SOL) - Practice and casual play
  - **Low Stakes** (0.05 SOL) - Entry-level competitive matches
  - **Medium Stakes** (0.25 SOL) - High-stakes competitive matches
- **Permanent lobbies** that persist across sessions
- **Auto-matchmaking** - Join existing lobbies or create new ones
- **30-second countdown** when 2+ players join
- **Automatic SOL payouts** to winning team members
- **Lobby browser** with real-time player counts and status

### 🎤 Voice Chat
- **WebRTC peer-to-peer voice communication**
- **Push-to-talk** (default key: `V`) for team coordination
- **Real-time voice state indicators** showing who's speaking
- **Configurable push-to-talk key** in user settings
- **Microphone permissions** handled automatically
- **Works seamlessly** during matches and in lobby waiting rooms

### 📈 EXP & Leveling System
- **Progressive leveling system** with exponential EXP requirements
- **EXP gains scale** with bet amount and performance:
  - Base: 50 EXP per win
  - Free matches: 1x multiplier
  - 0.05 SOL matches: 1.5x multiplier
  - 0.25 SOL matches: 2x multiplier
  - Higher bet amounts: Linear scaling
- **Performance bonuses** based on score (up to 20% bonus)
- **Team win bonus** (10% extra EXP for team victories)
- **Level scaling** prevents high-level players from snowballing
- **Level display** on player profiles and user cards
- **EXP progress tracking** with visual progress bars

### 🎁 Item Drop System
- **Rare item drops** after matches with 4 rarity tiers:
  - **Common** (5% base chance) - Basic shields, weapons, powerups, cosmetics
  - **Rare** (1.5% base chance) - Enhanced equipment with better stats
  - **Epic** (0.5% base chance) - Powerful items with significant bonuses
  - **Legendary** (0.1% base chance) - Ultra-rare items like "Solana Destroyer" and "God Mode"
- **Item types**:
  - **Weapons** - Attack, crit chance, crit damage stats
  - **Shields** - Defense and health bonuses
  - **Powerups** - Speed and health boosts
  - **Cosmetics** - Visual effects with stat bonuses
  - **Crowns** - Balanced stat boosts (earned from wins)
- **$SOCCER token holders** get **2.5x drop rate multiplier**
- **Token balance bonuses** (up to 2x multiplier)
- **NFT count bonuses** (up to 1.5x multiplier)
- **Item inventory** system to view and manage collected items
- **Item drop notifications** with rarity-based styling

### 💰 $SOCCER Token Integration
- **Token contract**: `6q75D5TCaEJXSvidqwEDeyog55MKhWV2k5NZQRpzpump`
- **2.5x item drop rate** for token holders
- **30% of creator rewards** distributed to token holders
- **Token balance display** in user interface
- **Token gating** for premium features (future)
- **Real-time token balance checking** via Solana RPC

### 💼 Wallet Management
- **In-game wallet system** for secure SOL deposits
- **Deposit SOL** to your in-game wallet address
- **Automatic SOL payouts** to winners after matches
- **Withdrawal functionality** to external Solana wallets
- **Balance tracking** with real-time updates
- **Transaction history** (future)

### 🏅 Leaderboards
- **Global leaderboard** ranked by total score
- **Player statistics** including:
  - Total games played
  - Wins and losses
  - Total score
  - Current level and EXP
  - Win rate percentage
- **Real-time updates** as players compete
- **Player profile links** from leaderboard entries

### 👤 Player Profiles
- **Comprehensive player stats**:
  - Username and avatar
  - Level and EXP progress
  - Total games, wins, losses
  - Win rate percentage
  - Total score
  - Item inventory
  - Recent match history
- **Public profiles** - View any player's profile
- **Profile customization**:
  - Username (1 change per 24 hours)
  - Avatar URL
  - Voice chat settings
- **EXP gain display** on recent rounds cards

### 📊 Recent Rounds
- **Match history display** showing:
  - Match date and time
  - Bet amount
  - Winners and their scores
  - EXP gained by winners
  - Match type (lobby vs match)
- **Real-time updates** as matches complete
- **Visual cards** with match details

### 👥 Platform Users
- **Browse all platform users**
- **Player level display** below avatars
- **User cards** with avatars, usernames, and levels
- **Click to view** full player profiles

### 🔐 Authentication
- **Solana wallet authentication** via OpenKitx403:
  - Phantom Wallet
  - Backpack Wallet
  - Solflare Wallet
- **Google OAuth** as alternative authentication
- **Synthetic wallet addresses** for Google users
- **JWT token-based** session management
- **Automatic token caching** for seamless experience
- **First-time setup** flow for new users

### 🎨 User Interface
- **Modern, responsive design** with Notion/Monday.com aesthetics
- **Dark/Light theme** toggle
- **Framer Motion animations** throughout
- **Smooth page transitions**
- **Loading states** with spinners
- **Error handling** with user-friendly messages
- **Mobile-responsive** layout

### 🔄 Real-time Features
- **Socket.IO integration** for:
  - Lobby state updates
  - Player join/leave events
  - Game state synchronization
  - Voice chat signaling
  - Position updates
- **WebRTC** for peer-to-peer voice chat
- **Real-time balance updates**
- **Live match tracking**

## 🛠 Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **Framer Motion** for animations
- **Socket.IO Client** for real-time communication
- **WebRTC** for voice chat
- **Canvas API** for game rendering
- **React Router** for navigation

### Backend
- **Express.js** with TypeScript
- **SQLite** database (with Turso cloud support)
- **Socket.IO Server** for real-time features
- **OpenKitx403** for Solana wallet authentication
- **Solana Web3.js** for blockchain interactions
- **JWT** for session management
- **WebRTC signaling** server

### Infrastructure
- **Node.js 18+**
- **TypeScript** throughout
- **Shared types package** for type safety
- **RESTful API** architecture
- **WebSocket** for real-time updates

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** and npm
- **Solana wallet** (Phantom, Backpack, or Solflare) OR Google account
- **Git** for cloning the repository

### Installation

```bash
# Clone the repository
git clone https://github.com/the-last-lone-ranger/solana-soccer.git
cd solana-soccer

# Install all dependencies (root, frontend, backend, shared)
npm run install:all

# Or install individually
npm install
cd frontend && npm install
cd ../backend && npm install
cd ../shared && npm install
```

### Environment Setup

Create a `.env` file in the `backend` directory:

```bash
# Database (choose one)
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token
# OR for local SQLite
DATABASE_PATH=./data/game.db

# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
# Or use a free RPC like Helius, QuickNode, etc.

# Token Configuration
REQUIRED_TOKEN_MINT=6q75D5TCaEJXSvidqwEDeyog55MKhWV2k5NZQRpzpump
REQUIRED_TOKEN_AMOUNT=1000

# Server
PORT=3000

# OpenKitx403 (for Solana auth)
OPENKIT_ISSUER=solana-defender-api-v1
OPENKIT_AUDIENCE=http://localhost:3000
OPENKIT_TTL_SECONDS=300

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Frontend URL
FRONTEND_URL=http://localhost:5173
```

### Development

```bash
# Run both frontend and backend concurrently
npm run dev

# Or run separately
npm run dev:frontend  # Frontend on http://localhost:5173
npm run dev:backend   # Backend on http://localhost:3000
```

### Build

```bash
# Build all packages
npm run build

# Build individually
npm run build:frontend
npm run build:backend
npm run build:shared
```

## 📁 Project Structure

```
solana-soccer/
├── frontend/              # React frontend application
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── game/         # Game logic (SoccerGame, etc.)
│   │   ├── services/     # API client, Socket client, Voice chat
│   │   ├── contexts/     # React contexts (Wallet, Theme)
│   │   ├── hooks/        # Custom React hooks
│   │   └── pages/        # Page components
│   └── package.json
├── backend/              # Express API server
│   ├── src/
│   │   ├── routes/       # API route handlers
│   │   ├── services/     # Business logic (EXP, items, lobbies)
│   │   ├── db/           # Database queries and schema
│   │   ├── middleware/   # Express middleware
│   │   └── index.ts      # Server entry point
│   └── package.json
├── shared/               # Shared TypeScript types
│   ├── src/
│   │   └── types.ts      # Shared interfaces and enums
│   └── package.json
└── README.md
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/wallet` - Authenticate with Solana wallet
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - Google OAuth callback

### Profile
- `GET /api/profile` - Get current player profile (protected)
- `PUT /api/profile` - Update player profile (protected)
- `GET /api/profile/:walletAddress` - Get any player's profile (public)

### Lobbies
- `GET /api/lobbies` - Get available lobbies (public)
- `POST /api/lobbies` - Create a new lobby (protected)
- `POST /api/lobbies/:lobbyId/join` - Join a lobby (protected)
- `POST /api/lobbies/:lobbyId/leave` - Leave a lobby (protected)
- `GET /api/lobbies/:lobbyId` - Get lobby details (public)
- `POST /api/lobbies/:lobbyId/results` - Submit match results (protected)

### Game
- `GET /api/health` - Health check
- `GET /api/token-check` - Check token/NFT ownership (protected)
- `POST /api/item-drop` - Generate item drop (protected)
- `GET /api/items` - Get player items (public)
- `GET /api/items/:walletAddress` - Get any player's items (public)

### Leaderboard
- `GET /api/leaderboard` - Get global leaderboard (public)
- `GET /api/users` - Get all platform users (public)

### Wallet
- `GET /api/wallet/balance` - Get in-game wallet balance (protected)
- `GET /api/wallet/deposit-address` - Get deposit address (protected)
- `POST /api/wallet/withdraw` - Withdraw SOL (protected)

### Statistics
- `GET /api/stats/total-sol-bet` - Get total SOL bet across platform (public)
- `GET /api/recent-rounds` - Get recent match history (public)

## 🎮 Game Mechanics

### Soccer Game
- **Team-based** (Red vs Blue)
- **Real-time physics** with collision detection
- **Goal scoring** system
- **Match duration** configurable per lobby
- **Score tracking** for each team
- **Automatic match end** when time expires or goal threshold reached

### Match Flow
1. **Join/Create Lobby** - Select bet amount and join or create
2. **Waiting Room** - Wait for players (minimum 2)
3. **Countdown** - 30-second countdown when ready
4. **Match Start** - Game begins with synchronized start
5. **Gameplay** - Real-time multiplayer soccer
6. **Match End** - Results calculated, winners determined
7. **Rewards** - EXP gained, items dropped, SOL distributed

### EXP Calculation
- **Base EXP**: 50 per win
- **Bet Multiplier**: 
  - Free: 1x
  - 0.05 SOL: 1.5x
  - 0.25 SOL: 2x
  - Custom: Linear scaling
- **Level Penalty**: Higher levels get slightly less EXP (prevents snowballing)
- **Score Bonus**: Up to 20% based on performance
- **Team Bonus**: 10% extra for team wins

### Item Drop Rates
- **Base rates** (without bonuses):
  - Common: 5%
  - Rare: 1.5%
  - Epic: 0.5%
  - Legendary: 0.1%
- **$SOCCER token holders**: 2.5x multiplier
- **Token balance**: Up to 2x multiplier
- **NFT count**: Up to 1.5x multiplier
- **Capped maximums** to keep items rare

## 💎 Token Economics

### $SOCCER Token Benefits
- **2.5x item drop rate** multiplier
- **30% creator rewards** distribution
- **Premium features** (future)
- **Governance rights** (future)

### SOL Rewards
- **Winners** receive SOL from the pot
- **Automatic payouts** to in-game wallets
- **Withdrawable** to external wallets
- **No fees** on winnings

## 🎯 Future Features

- [ ] NFT integration for avatars
- [ ] Tournament system
- [ ] Custom game modes
- [ ] Replay system
- [ ] Advanced statistics
- [ ] Social features (friends, teams)
- [ ] Mobile app
- [ ] Cross-chain support

## 📝 License

MIT

## 🙏 Acknowledgments

- **OpenKitx403** for Solana wallet authentication
- **Solana** for the blockchain infrastructure
- **Socket.IO** for real-time communication
- **WebRTC** for voice chat

---

**Built with ⚽ by the Kicking It team**
