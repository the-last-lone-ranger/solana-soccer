import { dbQueries } from '../db/database.js';
import { lobbyManager } from './lobbyManager.js';
import { BetAmount } from '@solana-defender/shared';

/**
 * Manages permanent lobbies that always exist:
 * - Free (0 SOL)
 * - Low stakes (0.05 SOL)
 * - High stakes (0.25 SOL)
 */
class PermanentLobbyManager {
  private readonly PERMANENT_BET_AMOUNTS = [
    BetAmount.Free,
    BetAmount.Low,
    BetAmount.Medium, // This is "High stakes"
  ];

  private permanentLobbyIds: Map<number, string> = new Map();

  /**
   * Initialize permanent lobbies - ensures one lobby exists for each bet amount
   */
  async initializePermanentLobbies(): Promise<void> {
    console.log('[PermanentLobbyManager] Initializing permanent lobbies...');

    for (const betAmount of this.PERMANENT_BET_AMOUNTS) {
      await this.ensurePermanentLobby(betAmount);
    }

    console.log('[PermanentLobbyManager] Permanent lobbies initialized');
  }

  /**
   * Ensure a permanent lobby exists for the given bet amount
   * If one doesn't exist or the existing one is completed, create a new one
   */
  async ensurePermanentLobby(betAmount: number): Promise<string> {
    // Check if we already have a permanent lobby ID for this bet amount
    const existingLobbyId = this.permanentLobbyIds.get(betAmount);
    
    if (existingLobbyId) {
      const lobby = await dbQueries.getLobby(existingLobbyId);
      
      // If lobby exists and is in a valid state (waiting or starting), return it
      if (lobby && (lobby.status === 'waiting' || lobby.status === 'starting')) {
        return existingLobbyId;
      }
      
      // If lobby is completed or cancelled, we need to create a new one
      console.log(`[PermanentLobbyManager] Lobby ${existingLobbyId} is ${lobby?.status}, creating new one`);
    }

    // Check if there's an available lobby with this bet amount
    const availableLobbies = await dbQueries.getAvailableLobbies(betAmount);
    const validLobby = availableLobbies.find(
      (l) => l.status === 'waiting' || l.status === 'starting'
    );

    if (validLobby) {
      // Use existing lobby
      this.permanentLobbyIds.set(betAmount, validLobby.id);
      console.log(`[PermanentLobbyManager] Using existing lobby ${validLobby.id} for bet amount ${betAmount}`);
      return validLobby.id;
    }

    // Create new permanent lobby
    const newLobbyId = await lobbyManager.createLobby(betAmount, 50);
    this.permanentLobbyIds.set(betAmount, newLobbyId);
    console.log(`[PermanentLobbyManager] Created new permanent lobby ${newLobbyId} for bet amount ${betAmount}`);
    
    return newLobbyId;
  }

  /**
   * Get the permanent lobby ID for a given bet amount
   */
  getPermanentLobbyId(betAmount: number): string | null {
    return this.permanentLobbyIds.get(betAmount) || null;
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
    // Find which bet amount this lobby was for
    const lobby = await dbQueries.getLobby(lobbyId);
    if (!lobby) {
      return;
    }

    const betAmount = lobby.betAmountSol;
    
    // Check if this is a permanent lobby bet amount
    if (!this.PERMANENT_BET_AMOUNTS.includes(betAmount)) {
      return; // Not a permanent lobby, don't recreate
    }

    // Remove from map and create a new one
    this.permanentLobbyIds.delete(betAmount);
    await this.ensurePermanentLobby(betAmount);
    console.log(`[PermanentLobbyManager] Recreated permanent lobby for bet amount ${betAmount}`);
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
      await this.ensurePermanentLobby(betAmount);
    }
  }
}

export const permanentLobbyManager = new PermanentLobbyManager();

