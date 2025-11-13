import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/openkit.js';
import { dbQueries } from '../db/database.js';
import db from '../db/database.js';
import { lobbyManager } from '../services/lobbyManager.js';
import { permanentLobbyManager } from '../services/permanentLobbyManager.js';
import { getOrCreateInGameWallet, getInGameWalletKeypair, getInGameWalletAddress } from '../services/wallet.js';
import { getSolBalance } from '../services/solana.js';
import { BetAmount, LobbyStatus, CreateLobbyRequest, CreateLobbyResponse, JoinLobbyRequest, JoinLobbyResponse } from '@solana-defender/shared';
import { Connection, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { randomUUID } from 'crypto';

const router = Router();

// Get available lobbies (public)
router.get('/lobbies', async (req: Request, res: Response) => {
  try {
    console.log('[Lobbies] GET /lobbies - query:', req.query);
    const { betAmount } = req.query;
    const betAmountSol = betAmount ? parseFloat(betAmount as string) : undefined;

    // Validate bet amount if provided
    if (betAmountSol !== undefined) {
      const validBetAmounts = [BetAmount.Free, BetAmount.Low, BetAmount.Medium];
      if (!validBetAmounts.includes(betAmountSol)) {
        console.log('[Lobbies] Invalid bet amount:', betAmountSol);
        return res.status(400).json({ error: 'Invalid bet amount' });
      }
    }

    // Ensure permanent lobbies exist before fetching
    await permanentLobbyManager.checkAndMaintainPermanentLobbies();

    console.log('[Lobbies] Fetching lobbies with betAmountSol:', betAmountSol);
    const lobbies = await dbQueries.getAvailableLobbies(betAmountSol);
    console.log('[Lobbies] Found lobbies:', lobbies.length);

    // Get player counts for each lobby
    const lobbiesWithPlayers = await Promise.all(
      lobbies.map(async (lobby) => {
        const players = await dbQueries.getLobbyPlayers(lobby.id);
        return {
          id: lobby.id,
          betAmountSol: lobby.betAmountSol,
          status: lobby.status,
          players: players.map((p) => ({
            walletAddress: p.walletAddress,
            username: p.username,
            avatarUrl: p.avatarUrl,
            joinedAt: p.joinedAt,
            hasCrown: p.hasCrown,
          })),
          maxPlayers: lobby.maxPlayers,
          countdownSeconds: lobby.countdownSeconds,
          startedAt: lobby.startedAt,
          completedAt: lobby.completedAt,
          createdAt: lobby.createdAt,
        };
      })
    );

    // Sort: permanent lobbies first, then by creation date
    const permanentLobbyIds = permanentLobbyManager.getAllPermanentLobbyIds();
    lobbiesWithPlayers.sort((a, b) => {
      const aIsPermanent = permanentLobbyIds.includes(a.id);
      const bIsPermanent = permanentLobbyIds.includes(b.id);
      if (aIsPermanent && !bIsPermanent) return -1;
      if (!aIsPermanent && bIsPermanent) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    console.log('[Lobbies] Returning lobbies:', lobbiesWithPlayers.length);
    res.json({ lobbies: lobbiesWithPlayers });
  } catch (error) {
    console.error('[Lobbies] Error fetching lobbies:', error);
    res.status(500).json({ error: 'Failed to fetch lobbies', details: error instanceof Error ? error.message : String(error) });
  }
});

// Get specific lobby (public)
router.get('/lobbies/:lobbyId', async (req: Request, res: Response) => {
  try {
    const { lobbyId } = req.params;
    const lobby = await lobbyManager.getLobbyWithPlayers(lobbyId);

    if (!lobby) {
      return res.status(404).json({ error: 'Lobby not found' });
    }

    res.json({ lobby });
  } catch (error) {
    console.error('Error fetching lobby:', error);
    res.status(500).json({ error: 'Failed to fetch lobby' });
  }
});

// Create lobby (protected)
router.post('/lobbies', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    const { betAmountSol }: CreateLobbyRequest = req.body;

    // Validate bet amount
    const validBetAmounts = [BetAmount.Free, BetAmount.Low, BetAmount.Medium];
    if (!validBetAmounts.includes(betAmountSol)) {
      return res.status(400).json({ 
        error: `Invalid bet amount. Must be one of: ${validBetAmounts.join(', ')} SOL` 
      });
    }

    // Check balance if not free
    if (betAmountSol > 0) {
      await dbQueries.getOrCreatePlayer(user.address);
      const inGameWalletAddress = await getOrCreateInGameWallet(user.address);
      const balance = await getSolBalance(inGameWalletAddress);

      if (balance < betAmountSol) {
        return res.status(400).json({
          error: `Insufficient balance. You have ${balance.toFixed(4)} SOL, need ${betAmountSol} SOL.`,
          balance,
          depositAddress: inGameWalletAddress,
        });
      }
    }

    // Create lobby
    const lobbyId = await lobbyManager.createLobby(betAmountSol);
    
    // Join the creator to the lobby
    await lobbyManager.joinLobby(lobbyId, user.address);

    // Get full lobby with players
    const lobby = await lobbyManager.getLobbyWithPlayers(lobbyId);

    const response: CreateLobbyResponse = {
      success: true,
      lobby: {
        id: lobby.id,
        betAmountSol: lobby.betAmountSol,
        status: lobby.status as LobbyStatus,
        players: lobby.players,
        maxPlayers: lobby.maxPlayers,
        countdownSeconds: lobby.countdownSeconds,
        startedAt: lobby.startedAt,
        completedAt: lobby.completedAt,
        createdAt: lobby.createdAt,
      },
    };

    res.json(response);
  } catch (error) {
    console.error('Error creating lobby:', error);
    res.status(500).json({ error: 'Failed to create lobby' });
  }
});

// Join lobby (protected)
router.post('/lobbies/:lobbyId/join', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    const { lobbyId } = req.params;

    const lobby = await dbQueries.getLobby(lobbyId);
    if (!lobby) {
      return res.status(404).json({ error: 'Lobby not found' });
    }

    // Can't join if game is active or completed
    if (lobby.status === 'active' || lobby.status === 'completed') {
      return res.status(400).json({ error: 'Lobby is not accepting new players' });
    }

    // Check if user is already in a lobby with the same bet amount
    const existingLobbyId = await dbQueries.getUserLobbyByBetAmount(user.address, lobby.betAmountSol);
    if (existingLobbyId && existingLobbyId !== lobbyId) {
      return res.status(400).json({ 
        error: `You are already in a ${lobby.betAmountSol === 0 ? 'free' : `${lobby.betAmountSol} SOL`} lobby. You can only join one lobby per bet amount.`,
        existingLobbyId,
      });
    }

    // Check balance if not free
    if (lobby.betAmountSol > 0) {
      await dbQueries.getOrCreatePlayer(user.address);
      const inGameWalletAddress = await getOrCreateInGameWallet(user.address);
      const balance = await getSolBalance(inGameWalletAddress);

      if (balance < lobby.betAmountSol) {
        return res.status(400).json({
          error: `Insufficient balance. You have ${balance.toFixed(4)} SOL, need ${lobby.betAmountSol} SOL.`,
          balance,
          depositAddress: inGameWalletAddress,
        });
      }
    }

    // Join lobby
    const joined = await lobbyManager.joinLobby(lobbyId, user.address);
    if (!joined) {
      return res.status(400).json({ error: 'Failed to join lobby (may be full)' });
    }

    // Get updated lobby with players
    const updatedLobby = await lobbyManager.getLobbyWithPlayers(lobbyId);

    const response: JoinLobbyResponse = {
      success: true,
      lobby: {
        id: updatedLobby.id,
        betAmountSol: updatedLobby.betAmountSol,
        status: updatedLobby.status as LobbyStatus,
        players: updatedLobby.players,
        maxPlayers: updatedLobby.maxPlayers,
        countdownSeconds: updatedLobby.countdownSeconds,
        startedAt: updatedLobby.startedAt,
        completedAt: updatedLobby.completedAt,
        createdAt: updatedLobby.createdAt,
      },
    };

    res.json(response);
  } catch (error) {
    console.error('Error joining lobby:', error);
    res.status(500).json({ error: 'Failed to join lobby' });
  }
});

// Leave lobby (protected)
router.post('/lobbies/:lobbyId/leave', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    const { lobbyId } = req.params;

    await lobbyManager.leaveLobby(lobbyId, user.address);

    res.json({ success: true, message: 'Left lobby successfully' });
  } catch (error) {
    console.error('Error leaving lobby:', error);
    res.status(500).json({ error: 'Failed to leave lobby' });
  }
});

// Submit lobby game results (protected)
router.post('/lobbies/:lobbyId/results', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    const { lobbyId } = req.params;
    const { results } = req.body; // Array of GameResult

    if (!results || !Array.isArray(results)) {
      return res.status(400).json({ error: 'Results array is required' });
    }

    // Get lobby to check bet amount
    const lobby = await dbQueries.getLobby(lobbyId);
    if (!lobby) {
      return res.status(404).json({ error: 'Lobby not found' });
    }

    // Determine winning team
    const redTeam = results.filter(r => r.team === 'red');
    const blueTeam = results.filter(r => r.team === 'blue');
    const redScore = redTeam.reduce((sum, r) => sum + r.score, 0);
    const blueScore = blueTeam.reduce((sum, r) => sum + r.score, 0);
    const winningTeam = redScore > blueScore ? 'red' : blueScore > redScore ? 'blue' : null;

    // Submit results for all players
    for (const result of results) {
      await dbQueries.submitLobbyResult(
        lobbyId,
        result.walletAddress,
        result.score,
        0, // position not used for team games
        result.team,
        result.won || (winningTeam && result.team === winningTeam)
      );
    }

    // Process payouts if it's a paid match
    if (lobby.betAmountSol > 0 && winningTeam) {
      const winningPlayers = results.filter(r => r.team === winningTeam);
      const losingPlayers = results.filter(r => r.team !== winningTeam);
      const totalPot = lobby.betAmountSol * results.length;
      const payoutPerPlayer = totalPot / winningPlayers.length;

      // Get Solana connection
      const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(RPC_URL, 'confirmed');

      // Process payouts: transfer SOL from losing players to winning players
      const payoutTransactions: string[] = [];
      
      for (const winner of winningPlayers) {
        const winnerWalletAddress = await getInGameWalletAddress(winner.walletAddress);
        if (!winnerWalletAddress) {
          console.warn(`⚠️ No in-game wallet for winner ${winner.walletAddress}`);
          continue;
        }

        const winnerKeypair = await getInGameWalletKeypair(winner.walletAddress);
        if (!winnerKeypair) {
          console.warn(`⚠️ Could not get keypair for winner ${winner.walletAddress}`);
          continue;
        }

        // Collect bet amounts from losing players
        let totalReceived = 0;
        for (const loser of losingPlayers) {
          const loserWalletAddress = await getInGameWalletAddress(loser.walletAddress);
          if (!loserWalletAddress) continue;

          const loserKeypair = await getInGameWalletKeypair(loser.walletAddress);
          if (!loserKeypair) continue;

          try {
            const betAmountLamports = Math.floor(lobby.betAmountSol * 1_000_000_000);
            
            // Transfer from loser to winner
            const transaction = new Transaction().add(
              SystemProgram.transfer({
                fromPubkey: loserKeypair.publicKey,
                toPubkey: winnerKeypair.publicKey,
                lamports: betAmountLamports,
              })
            );

            const signature = await sendAndConfirmTransaction(
              connection,
              transaction,
              [loserKeypair],
              { commitment: 'confirmed' }
            );

            payoutTransactions.push(signature);
            totalReceived += lobby.betAmountSol;
            console.log(`✅ Transferred ${lobby.betAmountSol} SOL from ${loser.walletAddress.slice(0, 8)}... to ${winner.walletAddress.slice(0, 8)}...`);
          } catch (error: any) {
            console.error(`❌ Failed to transfer from ${loser.walletAddress} to ${winner.walletAddress}:`, error);
          }
        }

        // Update payout amount in database for this winner
        if (totalReceived > 0) {
          await db.execute({
            sql: `
              UPDATE lobby_results 
              SET payout_amount = ?, payout_tx = ?
              WHERE lobby_id = ? AND wallet_address = ?
            `,
            args: [totalReceived, payoutTransactions.join(','), lobbyId, winner.walletAddress],
          });
        }
      }

      console.log(`💰 Payout complete: ${payoutPerPlayer.toFixed(4)} SOL to each of ${winningPlayers.length} winners`);
      
      // Mark lobby as completed
      await dbQueries.updateLobbyStatus(lobbyId, 'completed', undefined);
      
      // If this is a permanent lobby, recreate it
      if (permanentLobbyManager.isPermanentLobby(lobbyId)) {
        await permanentLobbyManager.handlePermanentLobbyCompleted(lobbyId);
      }

      // Get winner details with usernames and payout amounts
      const winnerDetails = await Promise.all(
        winningPlayers.map(async (winner) => {
          const player = await dbQueries.getOrCreatePlayer(winner.walletAddress);
          const result = await db.execute({
            sql: 'SELECT payout_amount FROM lobby_results WHERE lobby_id = ? AND wallet_address = ?',
            args: [lobbyId, winner.walletAddress],
          });
          const payoutAmount = result.rows[0]?.payout_amount as number || payoutPerPlayer;
          
          return {
            walletAddress: winner.walletAddress,
            username: player.username || null,
            avatarUrl: player.avatar_url || null,
            team: winner.team,
            score: winner.score,
            payoutAmount,
          };
        })
      );

      const loserDetails = await Promise.all(
        losingPlayers.map(async (loser) => {
          const player = await dbQueries.getOrCreatePlayer(loser.walletAddress);
          return {
            walletAddress: loser.walletAddress,
            username: player.username || null,
            avatarUrl: player.avatar_url || null,
            team: loser.team,
            score: loser.score,
            payoutAmount: 0,
          };
        })
      );

      res.json({ 
        success: true, 
        winningTeam, 
        redScore, 
        blueScore,
        winners: winnerDetails,
        losers: loserDetails,
        betAmountSol: lobby.betAmountSol,
        totalPot: lobby.betAmountSol * results.length,
        payoutPerPlayer: payoutPerPlayer,
      });
    } else {
      // Free game - no payouts, but still return winner info
      const allPlayers = await Promise.all(
        results.map(async (result) => {
          const player = await dbQueries.getOrCreatePlayer(result.walletAddress);
          return {
            walletAddress: result.walletAddress,
            username: player.username || null,
            avatarUrl: player.avatar_url || null,
            team: result.team,
            score: result.score,
            won: result.won || (winningTeam && result.team === winningTeam),
            payoutAmount: 0,
          };
        })
      );

      const winners = allPlayers.filter(p => p.won);
      const losers = allPlayers.filter(p => !p.won);

      // Mark lobby as completed (even for free games)
      await dbQueries.updateLobbyStatus(lobbyId, 'completed', undefined);

      res.json({ 
        success: true, 
        winningTeam, 
        redScore, 
        blueScore,
        winners,
        losers,
        betAmountSol: 0,
        totalPot: 0,
        payoutPerPlayer: 0,
      });
      
      // If this is a permanent lobby, recreate it
      if (permanentLobbyManager.isPermanentLobby(lobbyId)) {
        await permanentLobbyManager.handlePermanentLobbyCompleted(lobbyId);
      }
    }
  } catch (error) {
    console.error('Error submitting lobby results:', error);
    res.status(500).json({ error: 'Failed to submit results' });
  }
});

// Get recent rounds/games (public)
router.get('/rounds', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const rounds = await dbQueries.getRecentRounds(limit);
    res.json({ rounds });
  } catch (error) {
    console.error('Error fetching recent rounds:', error);
    res.status(500).json({ error: 'Failed to fetch recent rounds' });
  }
});

export default router;

