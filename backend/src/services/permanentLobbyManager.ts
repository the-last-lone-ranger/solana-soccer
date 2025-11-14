import { dbQueries } from '../db/database.js';
import { lobbyManager } from './lobbyManager.js';
import { BetAmount, GameType } from '@solana-defender/shared';

/**
 * Manages permanent lobbies that always exist:
 * - Free (0 SOL)
 * - Low stakes (0.05 SOL)
 * - High stakes (0.25 SOL)
 * For both Soccer and FallGuys game types
 */
class PermanentLobbyManager {
  private readonly PERMANENT_BET_AMOUNTS = [
    BetAmount.Free,
    BetAmount.Low,
    BetAmount.Medium, // This is "High stakes"
  ];

  private readonly GAME_TYPES = [GameType.Soccer, GameType.FallGuys];

  private permanentLobbyIds: Map<string, string> = new Map(); // Key: `${betAmount}-${gameType}`

  /**
   * Initialize permanent lobbies - ensures one lobby exists for each bet amount and game type
   */
  async initializePermanentLobbies(): Promise<void> {
    console.log('[PermanentLobbyManager] Initializing permanent lobbies...');

    for (const betAmount of this.PERMANENT_BET_AMOUNTS) {
      for (const gameType of this.GAME_TYPES) {
        await this.ensurePermanentLobby(betAmount, gameType);
      }
    }

    console.log('[PermanentLobbyManager] Permanent lobbies initialized');
  }

  /**
   * Ensure a permanent lobby exists for the given bet amount and game type
   * If one doesn't exist or the existing one is completed, create a new one
   */
  async ensurePermanentLobby(betAmount: number, gameType: GameType): Promise<string> {
    const key = `${betAmount}-${gameType}`;
    
    // Check if we already have a permanent lobby ID for this bet amount and game type
    const existingLobbyId = this.permanentLobbyIds.get(key);
    
    if (existingLobbyId) {
      const lobby = await dbQueries.getLobby(existingLobbyId);
      
      // If lobby exists and is in a valid state (waiting or starting), return it
      if (lobby && (lobby.status === 'waiting' || lobby.status === 'starting')) {
        return existingLobbyId;
      }
      
      // If lobby is completed or cancelled, we need to create a new one
      console.log(`[PermanentLobbyManager] Lobby ${existingLobbyId} is ${lobby?.status}, creating new one`);
    }

    // Check if there's an available lobby with this bet amount and game type
    const availableLobbies = await dbQueries.getAvailableLobbies(betAmount, gameType);
    const validLobby = availableLobbies.find(
      (l) => (l.status === 'waiting' || l.status === 'starting') && l.gameType === gameType
    );

    if (validLobby) {
      // Use existing lobby
      this.permanentLobbyIds.set(key, validLobby.id);
      console.log(`[PermanentLobbyManager] Using existing lobby ${validLobby.id} for bet amount ${betAmount}, game type ${gameType}`);
      return validLobby.id;
    }

    // Create new permanent lobby
    const newLobbyId = await lobbyManager.createLobby(betAmount, gameType, 50);
    this.permanentLobbyIds.set(key, newLobbyId);
    console.log(`[PermanentLobbyManager] Created new permanent lobby ${newLobbyId} for bet amount ${betAmount}, game type ${gameType}`);
    
    return newLobbyId;
  }

  /**
   * Get the permanent lobby ID for a given bet amount and game type
   */
  getPermanentLobbyId(betAmount: number, gameType: GameType): string | null {
    const key = `${betAmount}-${gameType}`;
    return this.permanentLobbyIds.get(key) || null;
  }

  /**
   * Check if a lobby is a permanent lobby
   */
  isPermanentLobby(lobbyId: string): boolean {
    return Array.from(this.permanentLobbyIds.values()).includes(lobbyId);
  }

  /**
   * Handle when a permanent lobby completes - recreate it
   */
  async handlePermanentLobbyCompleted(lobbyId: string): Promise<void> {
    // Find which bet amount and game type this lobby was for
    const lobby = await dbQueries.getLobby(lobbyId);
    if (!lobby) {
      return;
    }

    const betAmount = lobby.betAmountSol;
    const gameType = (lobby.gameType as GameType) || GameType.Soccer;
    
    // Check if this is a permanent lobby bet amount
    if (!this.PERMANENT_BET_AMOUNTS.includes(betAmount)) {
      return; // Not a permanent lobby, don't recreate
    }

    // Remove from map and create a new one
    const key = `${betAmount}-${gameType}`;
    this.permanentLobbyIds.delete(key);
    await this.ensurePermanentLobby(betAmount, gameType);
    console.log(`[PermanentLobbyManager] Recreated permanent lobby for bet amount ${betAmount}, game type ${gameType}`);
  }

  /**
   * Get all permanent lobby IDs
   */
  getAllPermanentLobbyIds(): string[] {
    return Array.from(this.permanentLobbyIds.values());
  }

  /**
   * Periodically check and ensure permanent lobbies exist
   * This handles edge cases where lobbies might be deleted or corrupted
   */
  async checkAndMaintainPermanentLobbies(): Promise<void> {
    for (const betAmount of this.PERMANENT_BET_AMOUNTS) {
      for (const gameType of this.GAME_TYPES) {
        await this.ensurePermanentLobby(betAmount, gameType);
      }
    }
  }
}

export const permanentLobbyManager = new PermanentLobbyManager();


