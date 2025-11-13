export interface Player {
  walletAddress: string;
  username?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Score {
  id: number;
  walletAddress: string;
  score: number;
  levelReached: number;
  timestamp: string;
}

export interface PlayerStats {
  walletAddress: string;
  gamesPlayed: number;
  totalScore: number;
  highScore: number;
}

export interface LeaderboardEntry {
  walletAddress: string;
  username?: string;
  avatarUrl?: string;
  score: number;
  levelReached: number;
  timestamp: string;
  rank: number;
}

export interface SubmitScoreRequest {
  score: number;
  levelReached: number;
}

export interface SubmitScoreResponse {
  success: boolean;
  rank?: number;
  message?: string;
}

export interface TokenCheckResponse {
  hasAccess: boolean;
  tokenType?: 'nft' | 'spl';
  balance?: number;
}

export interface GameConfig {
  requiredNftCollection?: string;
  requiredTokenMint?: string;
  requiredTokenAmount?: number;
}

export enum ItemRarity {
  Common = 'common',
  Rare = 'rare',
  Epic = 'epic',
  Legendary = 'legendary',
}

export enum ItemType {
  Weapon = 'weapon',
  Shield = 'shield',
  PowerUp = 'powerup',
  Cosmetic = 'cosmetic',
  Crown = 'crown',
}

export interface GameItem {
  id: string;
  name: string;
  type: ItemType;
  rarity: ItemRarity;
  description: string;
}

export interface PlayerItem {
  id: number;
  walletAddress: string;
  itemId: string;
  itemName: string;
  itemType: string;
  rarity: string;
  equipped: boolean;
  foundAt: string;
}

export interface ItemDropRequest {
  tokenBalance?: number;
  nftCount?: number;
}

export interface ItemDropResponse {
  success: boolean;
  item?: GameItem;
  message?: string;
}

export interface UpdateProfileRequest {
  username?: string;
  avatarUrl?: string;
}

export interface UpdateProfileResponse {
  success: boolean;
  message?: string;
  player?: Player;
}

export enum MatchStatus {
  Waiting = 'waiting',
  Active = 'active',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

export interface Match {
  id: string;
  creatorAddress: string;
  creatorUsername?: string;
  creatorAvatar?: string;
  opponentAddress?: string;
  opponentUsername?: string;
  opponentAvatar?: string;
  betAmountSol: number;
  creatorBetTx?: string;
  opponentBetTx?: string;
  status: MatchStatus;
  winnerAddress?: string;
  creatorScore?: number;
  opponentScore?: number;
  payoutTx?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CreateMatchRequest {
  betAmountSol: number;
  betTransactionSignature?: string; // Optional - not needed when using in-game wallet
}

export interface CreateMatchResponse {
  success: boolean;
  match: Match;
  message?: string;
}

export interface JoinMatchRequest {
  matchId: string;
  betTransactionSignature?: string; // Optional - not needed when using in-game wallet
}

export interface JoinMatchResponse {
  success: boolean;
  match: Match;
  message?: string;
}

export interface SubmitMatchResultRequest {
  matchId: string;
  creatorScore: number;
  opponentScore: number;
  payoutTransactionSignature?: string; // Optional - backend handles payouts automatically
}

export interface WalletBalanceResponse {
  balance: number;
  depositAddress: string | null;
}

export interface DepositAddressResponse {
  depositAddress: string;
  message: string;
}

export interface SubmitMatchResultResponse {
  success: boolean;
  match: Match;
  message?: string;
}

// Lobby-based matchmaking types
export enum LobbyStatus {
  Waiting = 'waiting',
  Starting = 'starting', // Countdown active
  Active = 'active', // Game in progress
  Completed = 'completed',
  Cancelled = 'cancelled',
}

export enum BetAmount {
  Free = 0,
  Low = 0.05,
  Medium = 0.25,
}

export interface LobbyPlayer {
  walletAddress: string;
  username?: string;
  avatarUrl?: string;
  joinedAt: string;
}

export interface Lobby {
  id: string;
  betAmountSol: number;
  status: LobbyStatus;
  players: LobbyPlayer[];
  maxPlayers?: number; // Optional max players per lobby
  countdownSeconds?: number; // Countdown when >= 2 players
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface CreateLobbyRequest {
  betAmountSol: number; // 0 (free), 0.05, or 0.25
}

export interface CreateLobbyResponse {
  success: boolean;
  lobby: Lobby;
  message?: string;
}

export interface JoinLobbyRequest {
  lobbyId: string;
}

export interface JoinLobbyResponse {
  success: boolean;
  lobby: Lobby;
  message?: string;
}

export interface LobbyUpdate {
  lobby: Lobby;
  event: 'player_joined' | 'player_left' | 'countdown_started' | 'game_started' | 'game_ended';
}

// Real-time game state synchronization
export interface PlayerPosition {
  walletAddress: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  isGrounded: boolean;
  facing: 'left' | 'right' | 'up' | 'down';
  username?: string;
  isSpeaking?: boolean; // Voice chat state
}

export interface GameStateUpdate {
  lobbyId: string;
  players: PlayerPosition[];
  timestamp: number;
}

export interface PlayerInput {
  lobbyId: string;
  walletAddress: string;
  keys: {
    left: boolean;
    right: boolean;
    jump: boolean;
  };
  timestamp: number;
}

