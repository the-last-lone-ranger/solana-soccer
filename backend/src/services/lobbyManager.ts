import { dbQueries } from '../db/database.js';
import { randomUUID } from 'crypto';
import { LobbyStatus } from '@solana-defender/shared';

interface LobbyCountdown {
  lobbyId: string;
  countdown: number;
  intervalId: NodeJS.Timeout;
}

class LobbyManager {
  private countdowns: Map<string, LobbyCountdown> = new Map();
  private readonly COUNTDOWN_DURATION = 30; // 30 seconds
  private readonly MIN_PLAYERS = 2;

  async createLobby(betAmountSol: number, maxPlayers: number = 50): Promise<string> {
    const lobbyId = randomUUID();
    await dbQueries.createLobby(lobbyId, betAmountSol, maxPlayers);
    return lobbyId;
  }

  async joinLobby(lobbyId: string, walletAddress: string): Promise<boolean> {
    const lobby = await dbQueries.getLobby(lobbyId);
    if (!lobby) {
      return false;
    }

    // Can't join if game is active or completed
    if (lobby.status === 'active' || lobby.status === 'completed') {
      return false;
    }

    // Check if already in lobby
    const players = await dbQueries.getLobbyPlayers(lobbyId);
    if (players.some((p) => p.walletAddress === walletAddress)) {
      return true; // Already joined
    }

    // Check if lobby is full
    if (players.length >= lobby.maxPlayers) {
      return false;
    }

    console.log(`[LobbyManager] Joining player ${walletAddress} to lobby ${lobbyId}`);
    await dbQueries.joinLobby(lobbyId, walletAddress);

    // Verify the player was actually added before notifying
    // This ensures database consistency before broadcasting
    // Add a small delay to ensure database write is committed
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const updatedPlayers = await dbQueries.getLobbyPlayers(lobbyId);
    console.log(`[LobbyManager] Players in lobby ${lobbyId} after join:`, updatedPlayers.map(p => p.walletAddress));
    const playerWasAdded = updatedPlayers.some((p) => p.walletAddress === walletAddress);
    
    if (!playerWasAdded) {
      console.error(`[LobbyManager] ERROR: Player ${walletAddress} was not found in lobby ${lobbyId} after join - database consistency issue`);
      console.error(`[LobbyManager] Current players in lobby:`, updatedPlayers.map(p => p.walletAddress));
      return false;
    }

    console.log(`[LobbyManager] Player ${walletAddress} successfully joined lobby ${lobbyId}, notifying socket server...`);
    // Notify that a player joined (now we know they're in the database)
    this.onPlayerJoined?.(lobbyId, walletAddress);

    // Check if we should start countdown
    if (updatedPlayers.length >= this.MIN_PLAYERS && lobby.status === 'waiting') {
      await this.startCountdown(lobbyId);
    }

    return true;
  }

  async leaveLobby(lobbyId: string, walletAddress: string): Promise<void> {
    console.log(`[LobbyManager] Leaving player ${walletAddress} from lobby ${lobbyId}`);
    await dbQueries.leaveLobby(lobbyId, walletAddress);

    // Small delay to ensure database DELETE is fully committed before querying
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify the player was actually removed
    const updatedPlayers = await dbQueries.getLobbyPlayers(lobbyId);
    console.log(`[LobbyManager] Players in lobby ${lobbyId} after leave:`, updatedPlayers.map(p => p.walletAddress));
    const playerWasRemoved = !updatedPlayers.some((p) => p.walletAddress === walletAddress);
    
    if (!playerWasRemoved) {
      console.error(`[LobbyManager] ERROR: Player ${walletAddress} was still found in lobby ${lobbyId} after leave - database consistency issue`);
      console.error(`[LobbyManager] Current players in lobby:`, updatedPlayers.map(p => p.walletAddress));
    } else {
      console.log(`[LobbyManager] Player ${walletAddress} successfully left lobby ${lobbyId}, notifying socket server...`);
    }

    // Notify that a player left (this will broadcast the updated state)
    this.onPlayerLeft?.(lobbyId, walletAddress);

    // Cancel countdown if player count drops below minimum
    if (updatedPlayers.length < this.MIN_PLAYERS) {
      await this.cancelCountdown(lobbyId);
    }
  }

  private async startCountdown(lobbyId: string): Promise<void> {
    // Cancel existing countdown if any
    await this.cancelCountdown(lobbyId);

    // Update lobby status to 'starting'
    await dbQueries.updateLobbyStatus(lobbyId, 'starting', this.COUNTDOWN_DURATION);

    let countdown = this.COUNTDOWN_DURATION;
    const intervalId = setInterval(async () => {
      countdown--;

      // Check if we still have enough players
      const players = await dbQueries.getLobbyPlayers(lobbyId);
      if (players.length < this.MIN_PLAYERS) {
        await this.cancelCountdown(lobbyId);
        return;
      }

      // Update countdown in database
      await dbQueries.updateLobbyStatus(lobbyId, 'starting', countdown);

      // Emit countdown update via callback
      console.log(`[LobbyManager] Countdown for ${lobbyId}: ${countdown}`);
      this.onCountdownUpdate?.(lobbyId, countdown);

      if (countdown <= 0) {
        console.log(`[LobbyManager] Starting game for ${lobbyId}`);
        await this.startGame(lobbyId);
      }
    }, 1000);

    this.countdowns.set(lobbyId, { lobbyId, countdown, intervalId });
  }

  private async cancelCountdown(lobbyId: string): Promise<void> {
    const countdown = this.countdowns.get(lobbyId);
    if (countdown) {
      clearInterval(countdown.intervalId);
      this.countdowns.delete(lobbyId);
      await dbQueries.updateLobbyStatus(lobbyId, 'waiting');
    }
  }

  private async startGame(lobbyId: string): Promise<void> {
    const countdown = this.countdowns.get(lobbyId);
    if (countdown) {
      clearInterval(countdown.intervalId);
      this.countdowns.delete(lobbyId);
    }

    await dbQueries.updateLobbyStatus(lobbyId, 'active');
    this.onGameStart?.(lobbyId);
  }

  async getLobbyWithPlayers(lobbyId: string): Promise<any | null> {
    const lobby = await dbQueries.getLobby(lobbyId);
    if (!lobby) {
      return null;
    }

    // If lobby is in 'starting' status but no countdown is running, restart it
    if (lobby.status === 'starting' && !this.countdowns.has(lobbyId)) {
      const countdownSeconds = lobby.countdownSeconds ?? this.COUNTDOWN_DURATION;
      if (countdownSeconds > 0) {
        console.log(`[LobbyManager] Restarting countdown for ${lobbyId} (was ${countdownSeconds})`);
        // Restart countdown from current value
        await this.restartCountdown(lobbyId, countdownSeconds);
      }
    }

    const players = await dbQueries.getLobbyPlayers(lobbyId);
    return {
      ...lobby,
      players,
    };
  }
  
  private async restartCountdown(lobbyId: string, startFrom: number): Promise<void> {
    // Cancel existing countdown if any
    await this.cancelCountdown(lobbyId);

    let countdown = startFrom;
    const intervalId = setInterval(async () => {
      countdown--;

      // Check if we still have enough players
      const players = await dbQueries.getLobbyPlayers(lobbyId);
      if (players.length < this.MIN_PLAYERS) {
        await this.cancelCountdown(lobbyId);
        return;
      }

      // Update countdown in database
      await dbQueries.updateLobbyStatus(lobbyId, 'starting', countdown);

      // Emit countdown update via callback
      console.log(`[LobbyManager] Countdown for ${lobbyId}: ${countdown}`);
      this.onCountdownUpdate?.(lobbyId, countdown);

      if (countdown <= 0) {
        console.log(`[LobbyManager] Starting game for ${lobbyId}`);
        await this.startGame(lobbyId);
      }
    }, 1000);

    this.countdowns.set(lobbyId, { lobbyId, countdown, intervalId });
  }

  // Callbacks for WebSocket events
  onCountdownUpdate?: (lobbyId: string, countdown: number) => void;
  onGameStart?: (lobbyId: string) => void;
  onPlayerJoined?: (lobbyId: string, walletAddress: string) => void;
  onPlayerLeft?: (lobbyId: string, walletAddress: string) => void;
}

export const lobbyManager = new LobbyManager();

