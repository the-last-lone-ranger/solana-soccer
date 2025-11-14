import { Router, Request, Response } from 'express';
import { dbQueries } from '../db/database.js';
import { requireAuth } from '../middleware/openkit.js';
import { checkTokenOwnership, TokenGateConfig, verifySolTransfer, getSolBalance, checkKickItTokenHolder } from '../services/solana.js';
import { generateItemDrop } from '../services/items.js';
import { getOrCreateInGameWallet, getInGameWalletAddress, getInGameWalletKeypair } from '../services/wallet.js';
import { Connection, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { randomUUID } from 'crypto';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');
import type { 
  SubmitScoreRequest, 
  SubmitScoreResponse, 
  ItemDropRequest, 
  ItemDropResponse, 
  UpdateProfileRequest, 
  UpdateProfileResponse,
  CreateMatchRequest,
  CreateMatchResponse,
  JoinMatchRequest,
  JoinMatchResponse,
  SubmitMatchResultRequest,
  SubmitMatchResultResponse,
  MatchStatus,
} from '@solana-defender/shared';

const router = Router();

// Token gate configuration (can be moved to env/config)
const tokenGateConfig: TokenGateConfig = {
  requiredNftCollection: process.env.REQUIRED_NFT_COLLECTION,
  requiredTokenMint: process.env.REQUIRED_TOKEN_MINT,
  requiredTokenAmount: process.env.REQUIRED_TOKEN_AMOUNT 
    ? parseInt(process.env.REQUIRED_TOKEN_AMOUNT) 
    : undefined,
};

// Submit score (protected)
router.post('/scores', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    const { score, levelReached }: SubmitScoreRequest = req.body;

    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ error: 'Invalid score' });
    }

    if (typeof levelReached !== 'number' || levelReached < 1) {
      return res.status(400).json({ error: 'Invalid level reached' });
    }

    // Get or create player
    await dbQueries.getOrCreatePlayer(user.address);

    // Submit score
    const scoreRow = await dbQueries.submitScore(user.address, score, levelReached);

    // Update player stats
    await dbQueries.updatePlayerStats(user.address, score);

    // Get rank
    const rank = await dbQueries.getPlayerRank(user.address, score);

    // Check if player is now #1 and equip crown
    if (rank === 1) {
      await dbQueries.equipCrown(user.address);
    }

    const response: SubmitScoreResponse = {
      success: true,
      rank,
      message: 'Score submitted successfully',
    };

    res.json(response);
  } catch (error) {
    console.error('Error submitting score:', error);
    res.status(500).json({ error: 'Failed to submit score' });
  }
});

// Get leaderboard
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const leaderboard = await dbQueries.getFullLeaderboard(Math.min(limit, 100));

    res.json({ leaderboard });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get all users (public)
router.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await dbQueries.getAllUsers();
    
    // Check token holder status for all users (in batches to avoid rate limits)
    const usersWithTokenStatus = await Promise.all(
      users.map(async (user) => {
        try {
          const isHolder = await checkKickItTokenHolder(user.walletAddress);
          return { ...user, isKickItTokenHolder: isHolder };
        } catch (error) {
          console.error(`Error checking token for ${user.walletAddress}:`, error);
          return { ...user, isKickItTokenHolder: false };
        }
      })
    );
    
    res.json({ users: usersWithTokenStatus });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get total SOL bet across all games (public)
router.get('/stats/total-sol-bet', async (req: Request, res: Response) => {
  try {
    const totalSolBet = await dbQueries.getTotalSolBet();
    res.json({ totalSolBet });
  } catch (error) {
    console.error('Error fetching total SOL bet:', error);
    res.status(500).json({ error: 'Failed to fetch total SOL bet' });
  }
});

// Get player's equipped items (public - for inspecting other players)
router.get('/players/:walletAddress/equipped-items', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;
    
    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    const equipped = await dbQueries.getEquippedItems(walletAddress);
    const player = await dbQueries.getOrCreatePlayer(walletAddress);
    const hasCrown = await dbQueries.hasCrown(walletAddress);

    res.json({
      walletAddress,
      username: player.username || null,
      avatarUrl: player.avatar_url || null,
      equipped: equipped.map(item => ({
        id: item.id,
        itemId: item.item_id,
        itemName: item.item_name,
        itemType: item.item_type,
        rarity: item.rarity,
      })),
      hasCrown,
    });
  } catch (error) {
    console.error('Error fetching equipped items:', error);
    res.status(500).json({ error: 'Failed to fetch equipped items' });
  }
});

// Get player profile (protected)
router.get('/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    const player = await dbQueries.getOrCreatePlayer(user.address);
    
    // Ensure in-game wallet is created
    const inGameWalletAddress = await getOrCreateInGameWallet(user.address);
    
    const stats = await dbQueries.getPlayerStats(user.address);
    const items = await dbQueries.getPlayerItems(user.address);
    const hasCrown = await dbQueries.hasCrown(user.address);
    const isLeader = await dbQueries.isLeader(user.address);
    
    // Check if user holds Kicking It ($SOCCER) token
    const isKickItTokenHolder = await checkKickItTokenHolder(user.address);

    res.json({
      walletAddress: user.address,
      inGameWalletAddress,
      username: player.username,
      avatarUrl: player.avatar_url,
      createdAt: player.created_at,
      updatedAt: player.updated_at,
      stats: stats || {
        gamesPlayed: 0,
        totalScore: 0,
        highScore: 0,
      },
      items: items.map(item => ({
        id: item.id,
        itemId: item.item_id,
        itemName: item.item_name,
        itemType: item.item_type,
        rarity: item.rarity,
        equipped: item.equipped === 1,
        foundAt: item.found_at,
      })),
      hasCrown,
      isLeader,
      isKickItTokenHolder,
      voiceSettings: {
        enabled: (player.voice_enabled ?? 0) === 1,
        pushToTalkKey: player.push_to_talk_key || 'v',
      },
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update voice chat settings (protected)
router.put('/profile/voice-settings', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    const { voiceEnabled, pushToTalkKey } = req.body;

    if (typeof voiceEnabled !== 'boolean') {
      return res.status(400).json({ error: 'voiceEnabled must be a boolean' });
    }

    if (!pushToTalkKey || typeof pushToTalkKey !== 'string' || pushToTalkKey.length !== 1) {
      return res.status(400).json({ error: 'pushToTalkKey must be a single character' });
    }

    await dbQueries.updateVoiceSettings(user.address, voiceEnabled, pushToTalkKey);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating voice settings:', error);
    res.status(500).json({ error: 'Failed to update voice settings' });
  }
});

// Update player profile (protected)
router.put('/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    let { username, avatarUrl }: UpdateProfileRequest = req.body;

    // Normalize empty strings to undefined
    if (username !== undefined && username.trim().length === 0) {
      username = undefined;
    }
    if (avatarUrl !== undefined && avatarUrl.trim().length === 0) {
      avatarUrl = undefined;
    }

    // Validate username if provided
    if (username !== undefined) {
      const trimmedUsername = username.trim();
      if (trimmedUsername.length === 0) {
        return res.status(400).json({ error: 'Username cannot be empty' });
      }
      if (trimmedUsername.length > 30) {
        return res.status(400).json({ error: 'Username must be 30 characters or less' });
      }
      // Basic validation - alphanumeric, underscore, hyphen
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmedUsername)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and hyphens' });
      }
    }

    // Validate avatar URL if provided
    if (avatarUrl !== undefined && avatarUrl.length > 0) {
      try {
        new URL(avatarUrl);
      } catch {
        // Allow emoji or other non-URL avatars
        if (avatarUrl.length > 200) {
          return res.status(400).json({ error: 'Avatar URL/emoji must be 200 characters or less' });
        }
      }
    }

    await dbQueries.updatePlayerProfile(user.address, username, avatarUrl);
    const updatedPlayer = await dbQueries.getOrCreatePlayer(user.address);

    const response: UpdateProfileResponse = {
      success: true,
      message: 'Profile updated successfully',
      player: {
        walletAddress: updatedPlayer.wallet_address,
        username: updatedPlayer.username || undefined,
        avatarUrl: updatedPlayer.avatar_url || undefined,
        createdAt: updatedPlayer.created_at,
        updatedAt: updatedPlayer.updated_at || undefined,
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error updating profile:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', req.body);
    console.error('User address:', req.openkitx403User?.address);
    if (error.message === 'Username is already taken') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update profile', detail: error.message });
  }
});

// Check username availability (public)
router.get('/username-check', async (req: Request, res: Response) => {
  try {
    const username = req.query.username as string;
    if (!username || username.trim().length === 0) {
      return res.json({ available: false, message: 'Username is required' });
    }

    const trimmedUsername = username.trim();
    if (trimmedUsername.length > 30) {
      return res.json({ available: false, message: 'Username must be 30 characters or less' });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedUsername)) {
      return res.json({ available: false, message: 'Username can only contain letters, numbers, underscores, and hyphens' });
    }

    const isAvailable = await dbQueries.checkUsernameAvailable(trimmedUsername);
    res.json({ available: isAvailable, message: isAvailable ? 'Username is available' : 'Username is already taken' });
  } catch (error) {
    console.error('Error checking username:', error);
    res.status(500).json({ error: 'Failed to check username' });
  }
});

// Check token ownership (protected)
router.get('/token-check', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    const result = await checkTokenOwnership(user.address, tokenGateConfig);

    res.json(result);
  } catch (error) {
    console.error('Error checking token:', error);
    res.status(500).json({ error: 'Failed to check token ownership' });
  }
});

// Check if user holds Kicking It ($SOCCER) token (protected)
router.get('/kick-it-token-check', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    const isHolder = await checkKickItTokenHolder(user.address);

    res.json({ isHolder });
  } catch (error) {
    console.error('Error checking Kicking It token:', error);
    res.status(500).json({ error: 'Failed to check Kicking It token' });
  }
});

// Generate item drop (protected)
router.post('/item-drop', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    const { tokenBalance = 0, nftCount = 0 }: ItemDropRequest = req.body;

    // Check if user holds the Kicking It ($SOCCER) token
    const hasKickItToken = await checkKickItTokenHolder(user.address);

    // Generate item based on token holdings
    const item = generateItemDrop(tokenBalance, nftCount, hasKickItToken);

    if (item) {
      // Save item to player's inventory
      await dbQueries.addPlayerItem(
        user.address,
        item.id,
        item.name,
        item.type,
        item.rarity
      );

      const response: ItemDropResponse = {
        success: true,
        item,
        message: `Found ${item.name}!`,
      };
      res.json(response);
    } else {
      const response: ItemDropResponse = {
        success: false,
        message: 'No item found this time',
      };
      res.json(response);
    }
  } catch (error) {
    console.error('Error generating item drop:', error);
    res.status(500).json({ error: 'Failed to generate item drop' });
  }
});

// Get player items (public - can view any player's items)
router.get('/items', async (req: Request, res: Response) => {
  try {
    // Get wallet address from query parameter or authenticated user
    let walletAddress: string | undefined;
    
    if (req.query.walletAddress && typeof req.query.walletAddress === 'string') {
      walletAddress = req.query.walletAddress;
    } else if (req.openkitx403User) {
      // If authenticated and no address provided, use authenticated user's address
      walletAddress = req.openkitx403User.address;
    } else {
      // If not authenticated and no address provided, return error
      return res.status(400).json({ error: 'walletAddress query parameter is required when not authenticated' });
    }

    if (!walletAddress) {
      return res.status(400).json({ error: 'walletAddress is required' });
    }

    const items = await dbQueries.getPlayerItems(walletAddress);
    const equipped = await dbQueries.getEquippedItems(walletAddress);

    res.json({
      items: items.map(item => ({
        id: item.id,
        itemId: item.item_id,
        itemName: item.item_name,
        itemType: item.item_type,
        rarity: item.rarity,
        equipped: item.equipped === 1,
        foundAt: item.found_at,
      })),
      equipped: equipped.map(item => ({
        id: item.id,
        itemId: item.item_id,
        itemName: item.item_name,
        itemType: item.item_type,
        rarity: item.rarity,
      })),
    });
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// Equip item (protected)
router.post('/items/equip', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    const { itemId, itemType } = req.body;

    if (!itemId || !itemType) {
      return res.status(400).json({ error: 'itemId and itemType are required' });
    }

    // Verify item belongs to user
    const items = await dbQueries.getPlayerItems(user.address);
    const item = items.find(i => i.item_id === itemId);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    await dbQueries.equipItem(user.address, itemId, itemType);
    res.json({ success: true });
  } catch (error) {
    console.error('Error equipping item:', error);
    res.status(500).json({ error: 'Failed to equip item' });
  }
});

// Unequip item (protected)
router.post('/items/unequip', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    const { itemId } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: 'itemId is required' });
    }

    // Verify item belongs to user
    const items = await dbQueries.getPlayerItems(user.address);
    const item = items.find(i => i.item_id === itemId);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    await dbQueries.unequipItem(user.address, itemId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error unequipping item:', error);
    res.status(500).json({ error: 'Failed to unequip item' });
  }
});

// Matchmaking routes

// Get user's deposit address (in-game wallet) (protected)
router.get('/wallet/deposit-address', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    
    // Get or create in-game wallet
    const depositAddress = await getOrCreateInGameWallet(user.address);
    
    res.json({
      depositAddress,
      message: 'Deposit SOL to this address to fund your in-game wallet for betting',
    });
  } catch (error) {
    console.error('Error getting deposit address:', error);
    res.status(500).json({ error: 'Failed to get deposit address' });
  }
});

// Get user's in-game wallet balance (protected)
router.get('/wallet/balance', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    
    const depositAddress = await getInGameWalletAddress(user.address);
    if (!depositAddress) {
      return res.json({ balance: 0, depositAddress: null });
    }
    
    const balance = await getSolBalance(depositAddress);
    
    res.json({
      balance,
      depositAddress,
    });
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    res.status(500).json({ error: 'Failed to get wallet balance' });
  }
});

// Withdraw SOL from in-game wallet (protected)
router.post('/wallet/withdraw', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    const { toAddress, amountSol } = req.body;

    if (!toAddress || typeof toAddress !== 'string') {
      return res.status(400).json({ error: 'Invalid withdrawal address' });
    }

    if (!amountSol || typeof amountSol !== 'number' || amountSol <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    if (amountSol < 0.0001) {
      return res.status(400).json({ error: 'Minimum withdrawal amount is 0.0001 SOL' });
    }

    // Get user's in-game wallet
    const keypair = await getInGameWalletKeypair(user.address);
    if (!keypair) {
      return res.status(404).json({ error: 'In-game wallet not found. Please deposit first.' });
    }

    // Get current balance
    const balance = await getSolBalance(keypair.publicKey.toBase58());
    if (balance < amountSol) {
      return res.status(400).json({ error: `Insufficient balance. Available: ${balance.toFixed(9)} SOL` });
    }

    // Validate destination address
    let destinationPubkey: PublicKey;
    try {
      destinationPubkey = new PublicKey(toAddress);
    } catch {
      return res.status(400).json({ error: 'Invalid Solana address format' });
    }

    // Create and send withdrawal transaction
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: destinationPubkey,
        lamports: Math.floor(amountSol * 1_000_000_000), // Convert SOL to lamports
      })
    );

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;

    // Sign and send transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: 'confirmed' }
    );

    console.log(`✅ Withdrawal successful: ${amountSol} SOL from ${keypair.publicKey.toBase58()} to ${toAddress} (tx: ${signature})`);

    res.json({
      success: true,
      transactionSignature: signature,
      amountSol,
      fromAddress: keypair.publicKey.toBase58(),
      toAddress,
    });
  } catch (error: any) {
    console.error('Error processing withdrawal:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process withdrawal',
    });
  }
});

// Create a new match (protected)
router.post('/matches', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    const { betAmountSol }: CreateMatchRequest = req.body;

    if (typeof betAmountSol !== 'number' || betAmountSol <= 0) {
      return res.status(400).json({ error: 'Invalid bet amount' });
    }

    // Get or create player and in-game wallet
    await dbQueries.getOrCreatePlayer(user.address);
    const inGameWalletAddress = await getOrCreateInGameWallet(user.address);
    
    // Check in-game wallet balance
    const balance = await getSolBalance(inGameWalletAddress);
    
    if (balance < betAmountSol) {
      return res.status(400).json({ 
        error: `Insufficient balance. You have ${balance.toFixed(4)} SOL, need ${betAmountSol} SOL. Please deposit to ${inGameWalletAddress}`,
        balance,
        depositAddress: inGameWalletAddress,
      });
    }

    // Create match (no transaction signature needed - we'll deduct from balance)
    const matchId = randomUUID();
    console.log('Creating match with:', {
      matchId,
      creatorAddress: user.address,
      inGameWalletAddress,
      betAmountSol,
      balance,
    });
    
    const match = await dbQueries.createMatch(
      matchId,
      user.address,
      betAmountSol,
      `in-game-wallet-${inGameWalletAddress}` // Store wallet address instead of tx signature
    );
    
    console.log('Match created:', {
      id: match.id,
      bet_amount_sol: match.bet_amount_sol,
      status: match.status,
    });

    // Get creator profile info
    const creator = await dbQueries.getOrCreatePlayer(user.address);

    const response: CreateMatchResponse = {
      success: true,
      match: {
        id: match.id,
        creatorAddress: match.creator_address,
        creatorUsername: creator.username || undefined,
        creatorAvatar: creator.avatar_url || undefined,
        betAmountSol: match.bet_amount_sol,
        creatorBetTx: match.creator_bet_tx || undefined,
        status: match.status as MatchStatus,
        createdAt: match.created_at,
      },
      message: 'Match created successfully',
    };

    res.json(response);
  } catch (error) {
    console.error('Error creating match:', error);
    res.status(500).json({ error: 'Failed to create match' });
  }
});

// Get available matches (public)
router.get('/matches', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const matches = await dbQueries.getAvailableMatches(Math.min(limit, 50));

    // Get player info for each match
    const matchesWithPlayerInfo = await Promise.all(
      matches.map(async (match) => {
        const creator = await dbQueries.getOrCreatePlayer(match.creator_address);
        return {
          id: match.id,
          creatorAddress: match.creator_address,
          creatorUsername: creator.username || undefined,
          creatorAvatar: creator.avatar_url || undefined,
          betAmountSol: match.bet_amount_sol,
          status: match.status as MatchStatus,
          createdAt: match.created_at,
        };
      })
    );

    res.json({ matches: matchesWithPlayerInfo });
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

// Get match by ID (public)
router.get('/matches/:matchId', async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;
    const match = await dbQueries.getMatch(matchId);

    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Get player info
    const creator = await dbQueries.getOrCreatePlayer(match.creator_address);
    let opponent = null;
    if (match.opponent_address) {
      opponent = await dbQueries.getOrCreatePlayer(match.opponent_address);
    }

    res.json({
      id: match.id,
      creatorAddress: match.creator_address,
      creatorUsername: creator.username || undefined,
      creatorAvatar: creator.avatar_url || undefined,
      opponentAddress: match.opponent_address || undefined,
      opponentUsername: opponent?.username || undefined,
      opponentAvatar: opponent?.avatar_url || undefined,
      betAmountSol: match.bet_amount_sol,
      creatorBetTx: match.creator_bet_tx || undefined,
      opponentBetTx: match.opponent_bet_tx || undefined,
      status: match.status as MatchStatus,
      winnerAddress: match.winner_address || undefined,
      creatorScore: match.creator_score || undefined,
      opponentScore: match.opponent_score || undefined,
      payoutTx: match.payout_tx || undefined,
      createdAt: match.created_at,
      startedAt: match.started_at || undefined,
      completedAt: match.completed_at || undefined,
    });
  } catch (error) {
    console.error('Error fetching match:', error);
    res.status(500).json({ error: 'Failed to fetch match' });
  }
});

// Join a match (protected)
router.post('/matches/:matchId/join', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    const { matchId } = req.params;

    // Get match
    const match = await dbQueries.getMatch(matchId);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    if (match.status !== 'waiting') {
      return res.status(400).json({ error: 'Match is not available to join' });
    }

    if (match.creator_address === user.address) {
      return res.status(400).json({ error: 'Cannot join your own match' });
    }

    // Get or create player and in-game wallet
    await dbQueries.getOrCreatePlayer(user.address);
    const inGameWalletAddress = await getOrCreateInGameWallet(user.address);
    
    // Check in-game wallet balance
    const balance = await getSolBalance(inGameWalletAddress);
    
    if (balance < match.bet_amount_sol) {
      return res.status(400).json({ 
        error: `Insufficient balance. You have ${balance.toFixed(4)} SOL, need ${match.bet_amount_sol} SOL. Please deposit to ${inGameWalletAddress}`,
        balance,
        depositAddress: inGameWalletAddress,
      });
    }

    // Join match (no transaction signature needed - we'll deduct from balance)
    const updatedMatch = await dbQueries.joinMatch(
      matchId,
      user.address,
      `in-game-wallet-${inGameWalletAddress}` // Store wallet address instead of tx signature
    );

    // Get player info
    const creator = await dbQueries.getOrCreatePlayer(updatedMatch.creator_address);
    const opponent = await dbQueries.getOrCreatePlayer(updatedMatch.opponent_address!);

    const response: JoinMatchResponse = {
      success: true,
      match: {
        id: updatedMatch.id,
        creatorAddress: updatedMatch.creator_address,
        creatorUsername: creator.username || undefined,
        creatorAvatar: creator.avatar_url || undefined,
        opponentAddress: updatedMatch.opponent_address || undefined,
        opponentUsername: opponent.username || undefined,
        opponentAvatar: opponent.avatar_url || undefined,
        betAmountSol: updatedMatch.bet_amount_sol,
        creatorBetTx: updatedMatch.creator_bet_tx || undefined,
        opponentBetTx: updatedMatch.opponent_bet_tx || undefined,
        status: updatedMatch.status as MatchStatus,
        createdAt: updatedMatch.created_at,
        startedAt: updatedMatch.started_at || undefined,
      },
      message: 'Match joined successfully',
    };

    res.json(response);
  } catch (error) {
    console.error('Error joining match:', error);
    res.status(500).json({ error: 'Failed to join match' });
  }
});

// Submit match result (protected)
router.post('/matches/:matchId/result', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.openkitx403User!;
    const { matchId } = req.params;
    const { creatorScore, opponentScore }: SubmitMatchResultRequest = req.body;

    if (typeof creatorScore !== 'number' || typeof opponentScore !== 'number') {
      return res.status(400).json({ error: 'Invalid scores' });
    }

    // Get match
    const match = await dbQueries.getMatch(matchId);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    if (match.status !== 'active') {
      return res.status(400).json({ error: 'Match is not active' });
    }

    // Verify user is part of the match
    if (match.creator_address !== user.address && match.opponent_address !== user.address) {
      return res.status(403).json({ error: 'Not authorized to submit result for this match' });
    }

    // Determine winner
    let winnerAddress: string;
    if (creatorScore > opponentScore) {
      winnerAddress = match.creator_address;
    } else if (opponentScore > creatorScore) {
      winnerAddress = match.opponent_address!;
    } else {
      // Tie - both players get their bet back
      winnerAddress = match.creator_address; // Creator wins ties for now
    }

    // Get in-game wallets for both players
    const creatorWalletAddress = await getInGameWalletAddress(match.creator_address);
    const opponentWalletAddress = match.opponent_address 
      ? await getInGameWalletAddress(match.opponent_address)
      : null;

    // Calculate total pot
    const totalPot = match.bet_amount_sol * 2;
    let payoutTx = '';

    // Handle payout automatically using backend-controlled wallets
    // Winner gets the opponent's bet amount transferred to their wallet
    if (creatorScore !== opponentScore && creatorWalletAddress && opponentWalletAddress) {
      const creatorKeypair = await getInGameWalletKeypair(match.creator_address);
      const opponentKeypair = await getInGameWalletKeypair(match.opponent_address!);
      
      if (creatorKeypair && opponentKeypair) {
        try {
          const betAmountLamports = Math.floor(match.bet_amount_sol * 1_000_000_000);
          
          if (winnerAddress === match.creator_address) {
            // Creator wins - transfer opponent's bet to creator
            const transaction = new Transaction().add(
              SystemProgram.transfer({
                fromPubkey: opponentKeypair.publicKey,
                toPubkey: creatorKeypair.publicKey,
                lamports: betAmountLamports,
              })
            );
            
            const signature = await sendAndConfirmTransaction(
              connection,
              transaction,
              [opponentKeypair],
              { commitment: 'confirmed' }
            );
            
            payoutTx = signature;
            console.log(`✅ Payout: ${match.bet_amount_sol} SOL from ${match.opponent_address} to ${match.creator_address} (creator won)`);
          } else {
            // Opponent wins - transfer creator's bet to opponent
            const transaction = new Transaction().add(
              SystemProgram.transfer({
                fromPubkey: creatorKeypair.publicKey,
                toPubkey: opponentKeypair.publicKey,
                lamports: betAmountLamports,
              })
            );
            
            const signature = await sendAndConfirmTransaction(
              connection,
              transaction,
              [creatorKeypair],
              { commitment: 'confirmed' }
            );
            
            payoutTx = signature;
            console.log(`✅ Payout: ${match.bet_amount_sol} SOL from ${match.creator_address} to ${match.opponent_address} (opponent won)`);
          }
        } catch (error: any) {
          console.error('❌ Failed to process payout:', error);
          // Continue anyway - we'll record the result but log the error
          payoutTx = `failed-${error.message}`;
        }
      }
    } else {
      // Tie - both keep their bets, no transfer needed
      payoutTx = 'tie-no-payout';
      console.log('Match ended in a tie - both players keep their bets');
    }

    // Submit result
    const updatedMatch = await dbQueries.submitMatchResult(
      matchId,
      creatorScore,
      opponentScore,
      winnerAddress,
      payoutTx || 'no-payout-needed'
    );

    // Update player stats - increment games played for both players
    await dbQueries.updatePlayerStats(match.creator_address, creatorScore);
    if (match.opponent_address) {
      await dbQueries.updatePlayerStats(match.opponent_address, opponentScore);
    }

    // Get player info
    const creator = await dbQueries.getOrCreatePlayer(updatedMatch.creator_address);
    const opponent = updatedMatch.opponent_address 
      ? await dbQueries.getOrCreatePlayer(updatedMatch.opponent_address)
      : null;

    const response: SubmitMatchResultResponse = {
      success: true,
      match: {
        id: updatedMatch.id,
        creatorAddress: updatedMatch.creator_address,
        creatorUsername: creator.username || undefined,
        creatorAvatar: creator.avatar_url || undefined,
        opponentAddress: updatedMatch.opponent_address || undefined,
        opponentUsername: opponent?.username || undefined,
        opponentAvatar: opponent?.avatar_url || undefined,
        betAmountSol: updatedMatch.bet_amount_sol,
        creatorBetTx: updatedMatch.creator_bet_tx || undefined,
        opponentBetTx: updatedMatch.opponent_bet_tx || undefined,
        status: updatedMatch.status as MatchStatus,
        winnerAddress: updatedMatch.winner_address || undefined,
        creatorScore: updatedMatch.creator_score || undefined,
        opponentScore: updatedMatch.opponent_score || undefined,
        payoutTx: updatedMatch.payout_tx || undefined,
        createdAt: updatedMatch.created_at,
        startedAt: updatedMatch.started_at || undefined,
        completedAt: updatedMatch.completed_at || undefined,
      },
      message: 'Match result submitted successfully',
    };

    res.json(response);
  } catch (error) {
    console.error('Error submitting match result:', error);
    res.status(500).json({ error: 'Failed to submit match result' });
  }
});

export default router;

