# Solana Defender - Web3 Gaming Platform

A complete full-stack Web3 gaming application featuring a space shooter game with Solana wallet authentication using OpenKitx403.

## Features

- 🎮 Playable space shooter game
- 🔐 Solana wallet authentication (Phantom, Backpack, Solflare)
- 📊 Authenticated leaderboard
- 🎯 Token gating for premium features
- 👤 Player profiles and stats
- 🏆 Score tracking and achievements

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Express + TypeScript
- **Database**: SQLite
- **Authentication**: OpenKitx403
- **Blockchain**: Solana Web3.js

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Solana wallet (Phantom, Backpack, or Solflare)

### Installation

```bash
# Install all dependencies
npm run install:all

# Or install individually
npm install
cd frontend && npm install
cd ../backend && npm install
cd ../shared && npm install
```

### Development

```bash
# Run both frontend and backend
npm run dev

# Or run separately
npm run dev:frontend  # Frontend on http://localhost:5173
npm run dev:backend   # Backend on http://localhost:3000
```

### Build

```bash
npm run build
```

## Project Structure

```
x402/
├── frontend/          # React frontend with game
├── backend/           # Express API server
├── shared/            # Shared TypeScript types
└── README.md
```

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/scores` - Submit score (protected)
- `GET /api/leaderboard` - Get leaderboard
- `GET /api/profile` - Get player profile (protected)
- `GET /api/token-check` - Check token/NFT ownership (protected)

## License

MIT

