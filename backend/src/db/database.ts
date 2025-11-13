import 'dotenv/config';
import { createClient } from '@libsql/client';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Turso client
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;

console.log('🔍 Checking database config...');
console.log('TURSO_DATABASE_URL:', tursoUrl ? '✅ Set' : '❌ Not set');
console.log('TURSO_AUTH_TOKEN:', tursoAuthToken ? '✅ Set' : '❌ Not set');

let db: ReturnType<typeof createClient>;

if (tursoUrl && tursoAuthToken) {
  // Use Turso (cloud SQLite)
  db = createClient({
    url: tursoUrl,
    authToken: tursoAuthToken,
  });
  console.log('✅ Connected to Turso database');
} else {
  // Fallback to local SQLite (for development)
  const dbPath = path.join(__dirname, '../../data/game.db');
  db = createClient({
    url: `file:${dbPath}`,
  });
  console.log('✅ Using local SQLite database');
}

// Initialize schema
async function initializeSchema() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS players (
      wallet_address TEXT PRIMARY KEY,
      google_id TEXT UNIQUE,
      username TEXT,
      avatar_url TEXT,
      email TEXT,
      auth_type TEXT DEFAULT 'solana',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Add avatar_url column if it doesn't exist (for existing databases)
  try {
    await db.execute(`
      ALTER TABLE players ADD COLUMN avatar_url TEXT;
    `);
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await db.execute(`
      ALTER TABLE players ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;
    `);
  } catch (e) {
    // Column already exists, ignore
  }

  // Add Google auth columns if they don't exist
  // Check if columns exist first to avoid errors
  try {
    const tableInfo = await db.execute({ sql: 'PRAGMA table_info(players)' });
    const columns = tableInfo.rows.map((row: any) => row.name);
    
    if (!columns.includes('google_id')) {
      console.log('[Database] Adding google_id column...');
      // SQLite doesn't allow UNIQUE in ALTER TABLE ADD COLUMN, so add without UNIQUE first
      await db.execute(`ALTER TABLE players ADD COLUMN google_id TEXT`);
      // Then create unique index
      try {
        await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_players_google_id ON players(google_id) WHERE google_id IS NOT NULL`);
      } catch (e: any) {
        console.log('[Database] Index may already exist:', e.message);
      }
    }
    
    if (!columns.includes('email')) {
      console.log('[Database] Adding email column...');
      await db.execute(`ALTER TABLE players ADD COLUMN email TEXT`);
    }
    
    if (!columns.includes('auth_type')) {
      console.log('[Database] Adding auth_type column...');
      await db.execute(`ALTER TABLE players ADD COLUMN auth_type TEXT DEFAULT 'solana'`);
    }
  } catch (e: any) {
    console.error('[Database] Error adding Google auth columns:', e.message);
    // Try individual ALTER statements as fallback (without UNIQUE)
    try {
      await db.execute(`ALTER TABLE players ADD COLUMN google_id TEXT`);
      await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_players_google_id ON players(google_id) WHERE google_id IS NOT NULL`);
    } catch (e2: any) {
      if (!e2.message?.includes('duplicate column') && !e2.message?.includes('already exists')) {
        console.error('[Database] Failed to add google_id:', e2.message);
      }
    }
    try {
      await db.execute(`ALTER TABLE players ADD COLUMN email TEXT`);
    } catch (e2: any) {
      if (!e2.message?.includes('duplicate column')) {
        console.error('[Database] Failed to add email:', e2.message);
      }
    }
    try {
      await db.execute(`ALTER TABLE players ADD COLUMN auth_type TEXT DEFAULT 'solana'`);
    } catch (e2: any) {
      if (!e2.message?.includes('duplicate column')) {
        console.error('[Database] Failed to add auth_type:', e2.message);
      }
    }
  }

  // Add in-game wallet columns
  try {
    await db.execute(`
      ALTER TABLE players ADD COLUMN in_game_wallet_address TEXT;
    `);
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await db.execute(`
      ALTER TABLE players ADD COLUMN encrypted_private_key TEXT;
    `);
  } catch (e) {
    // Column already exists, ignore
  }

  // Create index for in-game wallet lookups
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_players_in_game_wallet ON players(in_game_wallet_address);
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      score INTEGER NOT NULL,
      level_reached INTEGER NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wallet_address) REFERENCES players(wallet_address)
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS player_stats (
      wallet_address TEXT PRIMARY KEY,
      games_played INTEGER DEFAULT 0,
      total_score INTEGER DEFAULT 0,
      high_score INTEGER DEFAULT 0,
      FOREIGN KEY (wallet_address) REFERENCES players(wallet_address)
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS player_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      item_type TEXT NOT NULL,
      rarity TEXT NOT NULL,
      equipped INTEGER DEFAULT 0,
      found_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wallet_address) REFERENCES players(wallet_address),
      UNIQUE(wallet_address, item_id)
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS equipment (
      wallet_address TEXT PRIMARY KEY,
      crown_equipped INTEGER DEFAULT 0,
      FOREIGN KEY (wallet_address) REFERENCES players(wallet_address)
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      creator_address TEXT NOT NULL,
      opponent_address TEXT,
      bet_amount_sol REAL NOT NULL,
      creator_bet_tx TEXT,
      opponent_bet_tx TEXT,
      status TEXT NOT NULL DEFAULT 'waiting',
      winner_address TEXT,
      creator_score INTEGER,
      opponent_score INTEGER,
      payout_tx TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME,
      FOREIGN KEY (creator_address) REFERENCES players(wallet_address),
      FOREIGN KEY (opponent_address) REFERENCES players(wallet_address)
    );
  `);

  // Lobbies table for lobby-based matchmaking
  await db.execute(`
    CREATE TABLE IF NOT EXISTS lobbies (
      id TEXT PRIMARY KEY,
      bet_amount_sol REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      max_players INTEGER DEFAULT 50,
      countdown_seconds INTEGER,
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Lobby players join table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS lobby_players (
      lobby_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (lobby_id, wallet_address),
      FOREIGN KEY (lobby_id) REFERENCES lobbies(id) ON DELETE CASCADE,
      FOREIGN KEY (wallet_address) REFERENCES players(wallet_address)
    );
  `);

  // Lobby results table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS lobby_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lobby_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      final_score INTEGER,
      final_position INTEGER,
      team TEXT,
      won INTEGER DEFAULT 0,
      payout_amount REAL,
      payout_tx TEXT,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lobby_id) REFERENCES lobbies(id),
      FOREIGN KEY (wallet_address) REFERENCES players(wallet_address)
    );
  `);

  // Migrate existing tables: Add team and won columns if they don't exist
  // SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we catch errors
  try {
    await db.execute(`
      ALTER TABLE lobby_results ADD COLUMN team TEXT;
    `);
    console.log('✅ Migration: Added team column to lobby_results');
  } catch (error: any) {
    // Column already exists or other error - check error message
    const errorMsg = error.message || error.toString() || '';
    if (errorMsg.includes('duplicate column') || errorMsg.includes('already exists') || errorMsg.includes('no such column')) {
      // Column already exists or table doesn't exist yet - this is fine
      // The CREATE TABLE IF NOT EXISTS above will handle table creation
    } else {
      console.warn('⚠️ Migration warning (team column):', errorMsg);
    }
  }

  try {
    await db.execute(`
      ALTER TABLE lobby_results ADD COLUMN won INTEGER DEFAULT 0;
    `);
    console.log('✅ Migration: Added won column to lobby_results');
  } catch (error: any) {
    // Column already exists or other error - check error message
    const errorMsg = error.message || error.toString() || '';
    if (errorMsg.includes('duplicate column') || errorMsg.includes('already exists') || errorMsg.includes('no such column')) {
      // Column already exists or table doesn't exist yet - this is fine
    } else {
      console.warn('⚠️ Migration warning (won column):', errorMsg);
    }
  }

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_scores_timestamp ON scores(timestamp DESC);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_player_items_wallet ON player_items(wallet_address);
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_players_username ON players(username) WHERE username IS NOT NULL;
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_matches_creator ON matches(creator_address);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_matches_opponent ON matches(opponent_address);
  `);
}

// Initialize schema on module load
initializeSchema().catch(console.error);

export interface PlayerRow {
  wallet_address: string;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string | null;
  in_game_wallet_address: string | null;
  encrypted_private_key: string | null;
}

export interface InGameWalletRow {
  wallet_address: string;
  in_game_wallet_address: string;
  encrypted_private_key: string;
}

export interface ScoreRow {
  id: number;
  wallet_address: string;
  score: number;
  level_reached: number;
  timestamp: string;
}

export interface PlayerStatsRow {
  wallet_address: string;
  games_played: number;
  total_score: number;
  high_score: number;
}

export interface PlayerItemRow {
  id: number;
  wallet_address: string;
  item_id: string;
  item_name: string;
  item_type: string;
  rarity: string;
  equipped: number;
  found_at: string;
}

export interface EquipmentRow {
  wallet_address: string;
  crown_equipped: number;
}

export interface MatchRow {
  id: string;
  creator_address: string;
  opponent_address: string | null;
  bet_amount_sol: number;
  creator_bet_tx: string | null;
  opponent_bet_tx: string | null;
  status: string;
  winner_address: string | null;
  creator_score: number | null;
  opponent_score: number | null;
  payout_tx: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export const dbQueries = {
  // Player operations
  getOrCreatePlayer: async (walletAddress: string): Promise<PlayerRow> => {
    const existing = await db.execute({
      sql: 'SELECT * FROM players WHERE wallet_address = ?',
      args: [walletAddress],
    });

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return {
        wallet_address: row.wallet_address as string,
        username: row.username as string | null,
        avatar_url: row.avatar_url as string | null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string | null,
        in_game_wallet_address: row.in_game_wallet_address as string | null,
        encrypted_private_key: row.encrypted_private_key as string | null,
      };
    }

    await db.execute({
      sql: 'INSERT INTO players (wallet_address) VALUES (?)',
      args: [walletAddress],
    });

    const newPlayer = await db.execute({
      sql: 'SELECT * FROM players WHERE wallet_address = ?',
      args: [walletAddress],
    });

    const row = newPlayer.rows[0];
    return {
      wallet_address: row.wallet_address as string,
      username: row.username as string | null,
      avatar_url: row.avatar_url as string | null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string | null,
      in_game_wallet_address: row.in_game_wallet_address as string | null,
      encrypted_private_key: row.encrypted_private_key as string | null,
    };
  },

  getPlayerByGoogleId: async (googleId: string): Promise<PlayerRow | null> => {
    const result = await db.execute({
      sql: 'SELECT * FROM players WHERE google_id = ?',
      args: [googleId],
    });

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      wallet_address: row.wallet_address as string,
      username: row.username as string | null,
      avatar_url: row.avatar_url as string | null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string | null,
      in_game_wallet_address: row.in_game_wallet_address as string | null,
      encrypted_private_key: row.encrypted_private_key as string | null,
    };
  },

  createPlayerWithGoogle: async (data: {
    googleId: string;
    email: string;
    name: string;
    picture: string;
    syntheticWalletAddress: string;
  }): Promise<void> => {
    await db.execute({
      sql: `
        INSERT INTO players (wallet_address, google_id, username, avatar_url, email, auth_type)
        VALUES (?, ?, ?, ?, ?, 'google')
      `,
      args: [data.syntheticWalletAddress, data.googleId, data.name, data.picture, data.email],
    });
  },

  checkUsernameAvailable: async (username: string, excludeWalletAddress?: string): Promise<boolean> => {
    const trimmedUsername = username.trim().toLowerCase();
    let sql = 'SELECT wallet_address FROM players WHERE LOWER(username) = ?';
    const args: any[] = [trimmedUsername];

    if (excludeWalletAddress) {
      sql += ' AND wallet_address != ?';
      args.push(excludeWalletAddress);
    }

    const result = await db.execute({ sql, args });
    return result.rows.length === 0;
  },

  updatePlayerProfile: async (walletAddress: string, username?: string, avatarUrl?: string) => {
    // Check username uniqueness if provided
    if (username !== undefined && username.trim().length > 0) {
      const isAvailable = await dbQueries.checkUsernameAvailable(username.trim(), walletAddress);
      if (!isAvailable) {
        throw new Error('Username is already taken');
      }
    }

    const updates: string[] = [];
    const args: any[] = [];

    if (username !== undefined) {
      updates.push('username = ?');
      args.push(username.trim());
    }
    if (avatarUrl !== undefined) {
      updates.push('avatar_url = ?');
      args.push(avatarUrl);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      args.push(walletAddress);

      await db.execute({
        sql: `UPDATE players SET ${updates.join(', ')} WHERE wallet_address = ?`,
        args,
      });
    }
  },

  updatePlayerUsername: async (walletAddress: string, username: string) => {
    await dbQueries.updatePlayerProfile(walletAddress, username);
  },

  // Score operations
  submitScore: async (walletAddress: string, score: number, levelReached: number): Promise<ScoreRow> => {
    const result = await db.execute({
      sql: 'INSERT INTO scores (wallet_address, score, level_reached) VALUES (?, ?, ?)',
      args: [walletAddress, score, levelReached],
    });

    const lastId = result.lastInsertRowid;
    if (!lastId) {
      throw new Error('Failed to insert score');
    }

    const inserted = await db.execute({
      sql: 'SELECT * FROM scores WHERE id = ?',
      args: [Number(lastId)],
    });

    const row = inserted.rows[0];
    return {
      id: row.id as number,
      wallet_address: row.wallet_address as string,
      score: row.score as number,
      level_reached: row.level_reached as number,
      timestamp: row.timestamp as string,
    };
  },

  getLeaderboard: async (limit: number = 10): Promise<any[]> => {
    const result = await db.execute({
      sql: `
        SELECT 
          s.*,
          p.username,
          p.avatar_url
        FROM scores s
        LEFT JOIN players p ON s.wallet_address = p.wallet_address
        ORDER BY s.score DESC, s.timestamp DESC
        LIMIT ?
      `,
      args: [limit],
    });

    return result.rows.map((row) => ({
      id: row.id as number,
      wallet_address: row.wallet_address as string,
      username: row.username as string | null,
      avatar_url: row.avatar_url as string | null,
      score: row.score as number,
      level_reached: row.level_reached as number,
      timestamp: row.timestamp as string,
    }));
  },

  getPlayerRank: async (walletAddress: string, score: number): Promise<number> => {
    const result = await db.execute({
      sql: `
        SELECT COUNT(*) + 1 as rank
        FROM scores
        WHERE score > ? OR (score = ? AND wallet_address != ?)
      `,
      args: [score, score, walletAddress],
    });

    return (result.rows[0].rank as number) || 1;
  },

  // Stats operations
  updatePlayerStats: async (walletAddress: string, score: number) => {
    const existing = await db.execute({
      sql: 'SELECT * FROM player_stats WHERE wallet_address = ?',
      args: [walletAddress],
    });

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const currentHighScore = (row.high_score as number) || 0;
      const newHighScore = Math.max(currentHighScore, score);
      const currentGamesPlayed = (row.games_played as number) || 0;
      const currentTotalScore = (row.total_score as number) || 0;

      await db.execute({
        sql: `
          UPDATE player_stats 
          SET games_played = ?,
              total_score = ?,
              high_score = ?
          WHERE wallet_address = ?
        `,
        args: [currentGamesPlayed + 1, currentTotalScore + score, newHighScore, walletAddress],
      });
    } else {
      await db.execute({
        sql: `
          INSERT INTO player_stats (wallet_address, games_played, total_score, high_score)
          VALUES (?, 1, ?, ?)
        `,
        args: [walletAddress, score, score],
      });
    }
  },

  getPlayerStats: async (walletAddress: string): Promise<PlayerStatsRow | null> => {
    const result = await db.execute({
      sql: 'SELECT * FROM player_stats WHERE wallet_address = ?',
      args: [walletAddress],
    });

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      wallet_address: row.wallet_address as string,
      games_played: row.games_played as number,
      total_score: row.total_score as number,
      high_score: row.high_score as number,
    };
  },

  // Item operations
  addPlayerItem: async (walletAddress: string, itemId: string, itemName: string, itemType: string, rarity: string) => {
    await db.execute({
      sql: `
        INSERT OR IGNORE INTO player_items (wallet_address, item_id, item_name, item_type, rarity)
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [walletAddress, itemId, itemName, itemType, rarity],
    });
  },

  getPlayerItems: async (walletAddress: string): Promise<PlayerItemRow[]> => {
    const result = await db.execute({
      sql: 'SELECT * FROM player_items WHERE wallet_address = ? ORDER BY found_at DESC',
      args: [walletAddress],
    });

    return result.rows.map((row) => ({
      id: row.id as number,
      wallet_address: row.wallet_address as string,
      item_id: row.item_id as string,
      item_name: row.item_name as string,
      item_type: row.item_type as string,
      rarity: row.rarity as string,
      equipped: row.equipped as number,
      found_at: row.found_at as string,
    }));
  },

  getEquippedItems: async (walletAddress: string): Promise<PlayerItemRow[]> => {
    const result = await db.execute({
      sql: 'SELECT * FROM player_items WHERE wallet_address = ? AND equipped = 1',
      args: [walletAddress],
    });

    return result.rows.map((row) => ({
      id: row.id as number,
      wallet_address: row.wallet_address as string,
      item_id: row.item_id as string,
      item_name: row.item_name as string,
      item_type: row.item_type as string,
      rarity: row.rarity as string,
      equipped: row.equipped as number,
      found_at: row.found_at as string,
    }));
  },

  equipItem: async (walletAddress: string, itemId: string, itemType: string): Promise<void> => {
    // First, unequip any other items of the same type
    await db.execute({
      sql: 'UPDATE player_items SET equipped = 0 WHERE wallet_address = ? AND item_type = ?',
      args: [walletAddress, itemType],
    });

    // Then equip the requested item
    await db.execute({
      sql: 'UPDATE player_items SET equipped = 1 WHERE wallet_address = ? AND item_id = ?',
      args: [walletAddress, itemId],
    });
  },

  unequipItem: async (walletAddress: string, itemId: string): Promise<void> => {
    await db.execute({
      sql: 'UPDATE player_items SET equipped = 0 WHERE wallet_address = ? AND item_id = ?',
      args: [walletAddress, itemId],
    });
  },

  // Equipment operations
  equipCrown: async (walletAddress: string) => {
    // Remove crown from previous leader
    await db.execute({
      sql: 'UPDATE equipment SET crown_equipped = 0 WHERE crown_equipped = 1',
    });

    // Check if player already has equipment record
    const existing = await db.execute({
      sql: 'SELECT * FROM equipment WHERE wallet_address = ?',
      args: [walletAddress],
    });

    if (existing.rows.length > 0) {
      await db.execute({
        sql: 'UPDATE equipment SET crown_equipped = 1 WHERE wallet_address = ?',
        args: [walletAddress],
      });
    } else {
      await db.execute({
        sql: 'INSERT INTO equipment (wallet_address, crown_equipped) VALUES (?, 1)',
        args: [walletAddress],
      });
    }
  },

  getCrownHolder: async (): Promise<string | null> => {
    const result = await db.execute({
      sql: 'SELECT wallet_address FROM equipment WHERE crown_equipped = 1',
    });

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].wallet_address as string;
  },

  hasCrown: async (walletAddress: string): Promise<boolean> => {
    const result = await db.execute({
      sql: 'SELECT crown_equipped FROM equipment WHERE wallet_address = ?',
      args: [walletAddress],
    });

    if (result.rows.length === 0) {
      return false;
    }

    return (result.rows[0].crown_equipped as number) === 1;
  },

  // Check if player is #1 on leaderboard
  isLeader: async (walletAddress: string): Promise<boolean> => {
    const leaderboard = await dbQueries.getLeaderboard(1);
    return leaderboard.length > 0 && leaderboard[0].wallet_address === walletAddress;
  },

  // In-game wallet operations
  setInGameWallet: async (
    walletAddress: string,
    inGameWalletAddress: string,
    encryptedPrivateKey: string
  ): Promise<void> => {
    await db.execute({
      sql: `
        UPDATE players 
        SET in_game_wallet_address = ?, 
            encrypted_private_key = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE wallet_address = ?
      `,
      args: [inGameWalletAddress, encryptedPrivateKey, walletAddress],
    });
  },

  getInGameWallet: async (walletAddress: string): Promise<InGameWalletRow | null> => {
    const result = await db.execute({
      sql: `
        SELECT wallet_address, in_game_wallet_address, encrypted_private_key
        FROM players
        WHERE wallet_address = ? AND in_game_wallet_address IS NOT NULL
      `,
      args: [walletAddress],
    });

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      wallet_address: row.wallet_address as string,
      in_game_wallet_address: row.in_game_wallet_address as string,
      encrypted_private_key: row.encrypted_private_key as string,
    };
  },

  // Match operations
  createMatch: async (
    matchId: string,
    creatorAddress: string,
    betAmountSol: number,
    creatorBetTx: string
  ): Promise<MatchRow> => {
    console.log('DB: Creating match with betAmountSol:', betAmountSol, 'type:', typeof betAmountSol);
    
    const insertResult = await db.execute({
      sql: `
        INSERT INTO matches (id, creator_address, bet_amount_sol, creator_bet_tx, status)
        VALUES (?, ?, ?, ?, 'waiting')
      `,
      args: [matchId, creatorAddress, betAmountSol, creatorBetTx],
    });
    
    console.log('DB: Insert result:', {
      lastInsertRowid: insertResult.lastInsertRowid,
      rowsAffected: insertResult.rowsAffected,
    });

    const result = await db.execute({
      sql: 'SELECT * FROM matches WHERE id = ?',
      args: [matchId],
    });
    
    console.log('DB: Retrieved match:', result.rows[0]);

    const row = result.rows[0];
    return {
      id: row.id as string,
      creator_address: row.creator_address as string,
      opponent_address: row.opponent_address as string | null,
      bet_amount_sol: row.bet_amount_sol as number,
      creator_bet_tx: row.creator_bet_tx as string | null,
      opponent_bet_tx: row.opponent_bet_tx as string | null,
      status: row.status as string,
      winner_address: row.winner_address as string | null,
      creator_score: row.creator_score as number | null,
      opponent_score: row.opponent_score as number | null,
      payout_tx: row.payout_tx as string | null,
      created_at: row.created_at as string,
      started_at: row.started_at as string | null,
      completed_at: row.completed_at as string | null,
    };
  },

  joinMatch: async (
    matchId: string,
    opponentAddress: string,
    opponentBetTx: string
  ): Promise<MatchRow> => {
    await db.execute({
      sql: `
        UPDATE matches 
        SET opponent_address = ?, 
            opponent_bet_tx = ?, 
            status = 'active',
            started_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'waiting'
      `,
      args: [opponentAddress, opponentBetTx, matchId],
    });

    const result = await db.execute({
      sql: 'SELECT * FROM matches WHERE id = ?',
      args: [matchId],
    });

    if (result.rows.length === 0) {
      throw new Error('Match not found');
    }

    const row = result.rows[0];
    return {
      id: row.id as string,
      creator_address: row.creator_address as string,
      opponent_address: row.opponent_address as string | null,
      bet_amount_sol: row.bet_amount_sol as number,
      creator_bet_tx: row.creator_bet_tx as string | null,
      opponent_bet_tx: row.opponent_bet_tx as string | null,
      status: row.status as string,
      winner_address: row.winner_address as string | null,
      creator_score: row.creator_score as number | null,
      opponent_score: row.opponent_score as number | null,
      payout_tx: row.payout_tx as string | null,
      created_at: row.created_at as string,
      started_at: row.started_at as string | null,
      completed_at: row.completed_at as string | null,
    };
  },

  getMatch: async (matchId: string): Promise<MatchRow | null> => {
    const result = await db.execute({
      sql: 'SELECT * FROM matches WHERE id = ?',
      args: [matchId],
    });

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id as string,
      creator_address: row.creator_address as string,
      opponent_address: row.opponent_address as string | null,
      bet_amount_sol: row.bet_amount_sol as number,
      creator_bet_tx: row.creator_bet_tx as string | null,
      opponent_bet_tx: row.opponent_bet_tx as string | null,
      status: row.status as string,
      winner_address: row.winner_address as string | null,
      creator_score: row.creator_score as number | null,
      opponent_score: row.opponent_score as number | null,
      payout_tx: row.payout_tx as string | null,
      created_at: row.created_at as string,
      started_at: row.started_at as string | null,
      completed_at: row.completed_at as string | null,
    };
  },

  getAvailableMatches: async (limit: number = 10): Promise<MatchRow[]> => {
    const result = await db.execute({
      sql: `
        SELECT m.*, p1.username as creator_username, p1.avatar_url as creator_avatar
        FROM matches m
        LEFT JOIN players p1 ON m.creator_address = p1.wallet_address
        WHERE m.status = 'waiting'
        ORDER BY m.created_at DESC
        LIMIT ?
      `,
      args: [limit],
    });

    return result.rows.map((row) => ({
      id: row.id as string,
      creator_address: row.creator_address as string,
      opponent_address: row.opponent_address as string | null,
      bet_amount_sol: row.bet_amount_sol as number,
      creator_bet_tx: row.creator_bet_tx as string | null,
      opponent_bet_tx: row.opponent_bet_tx as string | null,
      status: row.status as string,
      winner_address: row.winner_address as string | null,
      creator_score: row.creator_score as number | null,
      opponent_score: row.opponent_score as number | null,
      payout_tx: row.payout_tx as string | null,
      created_at: row.created_at as string,
      started_at: row.started_at as string | null,
      completed_at: row.completed_at as string | null,
    }));
  },

  submitMatchResult: async (
    matchId: string,
    creatorScore: number,
    opponentScore: number,
    winnerAddress: string,
    payoutTx: string
  ): Promise<MatchRow> => {
    await db.execute({
      sql: `
        UPDATE matches 
        SET creator_score = ?,
            opponent_score = ?,
            winner_address = ?,
            payout_tx = ?,
            status = 'completed',
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      args: [creatorScore, opponentScore, winnerAddress, payoutTx, matchId],
    });

    const result = await db.execute({
      sql: 'SELECT * FROM matches WHERE id = ?',
      args: [matchId],
    });

    if (result.rows.length === 0) {
      throw new Error('Match not found');
    }

    const row = result.rows[0];
    return {
      id: row.id as string,
      creator_address: row.creator_address as string,
      opponent_address: row.opponent_address as string | null,
      bet_amount_sol: row.bet_amount_sol as number,
      creator_bet_tx: row.creator_bet_tx as string | null,
      opponent_bet_tx: row.opponent_bet_tx as string | null,
      status: row.status as string,
      winner_address: row.winner_address as string | null,
      creator_score: row.creator_score as number | null,
      opponent_score: row.opponent_score as number | null,
      payout_tx: row.payout_tx as string | null,
      created_at: row.created_at as string,
      started_at: row.started_at as string | null,
      completed_at: row.completed_at as string | null,
    };
  },

  // Lobby operations
  createLobby: async (
    lobbyId: string,
    betAmountSol: number,
    maxPlayers: number = 50
  ): Promise<void> => {
    await db.execute({
      sql: `
        INSERT INTO lobbies (id, bet_amount_sol, status, max_players)
        VALUES (?, ?, 'waiting', ?)
      `,
      args: [lobbyId, betAmountSol, maxPlayers],
    });
  },

  getLobby: async (lobbyId: string): Promise<any | null> => {
    const result = await db.execute({
      sql: 'SELECT * FROM lobbies WHERE id = ?',
      args: [lobbyId],
    });

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id as string,
      betAmountSol: row.bet_amount_sol as number,
      status: row.status as string,
      maxPlayers: row.max_players as number,
      countdownSeconds: row.countdown_seconds as number | null,
      startedAt: row.started_at as string | null,
      completedAt: row.completed_at as string | null,
      createdAt: row.created_at as string,
    };
  },

  getLobbyPlayers: async (lobbyId: string): Promise<any[]> => {
    const result = await db.execute({
      sql: `
        SELECT 
          lp.wallet_address,
          lp.joined_at,
          p.username,
          p.avatar_url,
          COALESCE(e.crown_equipped, 0) as has_crown
        FROM lobby_players lp
        LEFT JOIN players p ON lp.wallet_address = p.wallet_address
        LEFT JOIN equipment e ON lp.wallet_address = e.wallet_address
        WHERE lp.lobby_id = ?
        ORDER BY lp.joined_at ASC
      `,
      args: [lobbyId],
    });

    return result.rows.map((row) => ({
      walletAddress: row.wallet_address as string,
      username: row.username as string | undefined,
      avatarUrl: row.avatar_url as string | undefined,
      joinedAt: row.joined_at as string,
      hasCrown: (row.has_crown as number) === 1,
    }));
  },

  joinLobby: async (lobbyId: string, walletAddress: string): Promise<void> => {
    await db.execute({
      sql: `
        INSERT OR IGNORE INTO lobby_players (lobby_id, wallet_address)
        VALUES (?, ?)
      `,
      args: [lobbyId, walletAddress],
    });
  },

  leaveLobby: async (lobbyId: string, walletAddress: string): Promise<void> => {
    await db.execute({
      sql: 'DELETE FROM lobby_players WHERE lobby_id = ? AND wallet_address = ?',
      args: [lobbyId, walletAddress],
    });
  },

  updateLobbyStatus: async (
    lobbyId: string,
    status: string,
    countdownSeconds?: number
  ): Promise<void> => {
    const updates: string[] = ['status = ?'];
    const args: any[] = [status];

    if (status === 'starting' && countdownSeconds !== undefined) {
      updates.push('countdown_seconds = ?');
      args.push(countdownSeconds);
    }

    if (status === 'active') {
      updates.push('started_at = CURRENT_TIMESTAMP');
    }

    if (status === 'completed') {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }

    args.push(lobbyId);

    await db.execute({
      sql: `UPDATE lobbies SET ${updates.join(', ')} WHERE id = ?`,
      args,
    });
  },

  getAvailableLobbies: async (betAmountSol?: number): Promise<any[]> => {
    let sql = `
      SELECT 
        l.*,
        COUNT(lp.wallet_address) as player_count
      FROM lobbies l
      LEFT JOIN lobby_players lp ON l.id = lp.lobby_id
      WHERE l.status IN ('waiting', 'starting')
    `;
    const args: any[] = [];

    if (betAmountSol !== undefined) {
      sql += ' AND l.bet_amount_sol = ?';
      args.push(betAmountSol);
    }

    sql += ' GROUP BY l.id ORDER BY l.created_at DESC LIMIT 20';

    const result = await db.execute({ sql, args });

    return result.rows.map((row) => ({
      id: row.id as string,
      betAmountSol: row.bet_amount_sol as number,
      status: row.status as string,
      maxPlayers: row.max_players as number,
      countdownSeconds: row.countdown_seconds as number | null,
      playerCount: row.player_count as number,
      createdAt: row.created_at as string,
    }));
  },

  // Check if user is already in a lobby with a specific bet amount
  getUserLobbyByBetAmount: async (walletAddress: string, betAmountSol: number): Promise<string | null> => {
    const result = await db.execute({
      sql: `
        SELECT l.id
        FROM lobbies l
        INNER JOIN lobby_players lp ON l.id = lp.lobby_id
        WHERE lp.wallet_address = ? 
          AND l.bet_amount_sol = ?
          AND l.status IN ('waiting', 'starting')
        LIMIT 1
      `,
      args: [walletAddress, betAmountSol],
    });

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].id as string;
  },

  submitLobbyResult: async (
    lobbyId: string,
    walletAddress: string,
    finalScore: number,
    finalPosition: number,
    team?: string,
    won?: boolean
  ): Promise<void> => {
    await db.execute({
      sql: `
        INSERT INTO lobby_results (lobby_id, wallet_address, final_score, final_position, team, won)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [lobbyId, walletAddress, finalScore, finalPosition, team || null, won ? 1 : 0],
    });
  },

  getRecentRounds: async (limit: number = 5): Promise<any[]> => {
    const result = await db.execute({
      sql: `
        SELECT 
          lr.lobby_id,
          l.bet_amount_sol,
          l.completed_at,
          GROUP_CONCAT(DISTINCT lr.team) as teams,
          SUM(CASE WHEN lr.won = 1 THEN 1 ELSE 0 END) as winners_count,
          COUNT(DISTINCT lr.wallet_address) as player_count
        FROM lobby_results lr
        JOIN lobbies l ON lr.lobby_id = l.id
        WHERE l.status = 'completed'
        GROUP BY lr.lobby_id, l.bet_amount_sol, l.completed_at
        ORDER BY l.completed_at DESC
        LIMIT ?
      `,
      args: [limit],
    });

    return result.rows.map((row) => ({
      lobbyId: row.lobby_id as string,
      betAmountSol: row.bet_amount_sol as number,
      completedAt: row.completed_at as string,
      teams: (row.teams as string)?.split(',') || [],
      winnersCount: row.winners_count as number,
      playerCount: row.player_count as number,
    }));
  },

  getAllUsers: async (): Promise<any[]> => {
    const result = await db.execute({
      sql: `
        SELECT 
          p.wallet_address,
          p.username,
          p.avatar_url,
          p.created_at,
          COALESCE(ps.games_played, 0) as games_played,
          COALESCE(ps.total_score, 0) as total_score,
          COALESCE(ps.high_score, 0) as high_score,
          COUNT(DISTINCT lr.lobby_id) as rounds_played,
          SUM(CASE WHEN lr.won = 1 THEN 1 ELSE 0 END) as rounds_won,
          COALESCE(SUM(lr.payout_amount), 0) as total_sol_won
        FROM players p
        LEFT JOIN player_stats ps ON p.wallet_address = ps.wallet_address
        LEFT JOIN lobby_results lr ON p.wallet_address = lr.wallet_address
        GROUP BY p.wallet_address, p.username, p.avatar_url, p.created_at, ps.games_played, ps.total_score, ps.high_score
        ORDER BY total_sol_won DESC, rounds_won DESC, rounds_played DESC
      `,
      args: [],
    });

    return result.rows.map((row) => ({
      walletAddress: row.wallet_address as string,
      username: row.username as string | null,
      avatarUrl: row.avatar_url as string | null,
      createdAt: row.created_at as string,
      gamesPlayed: row.games_played as number,
      totalScore: row.total_score as number,
      highScore: row.high_score as number,
      roundsPlayed: row.rounds_played as number,
      roundsWon: row.rounds_won as number,
      totalSolWon: row.total_sol_won as number,
    }));
  },

  getFullLeaderboard: async (limit: number = 100): Promise<any[]> => {
    const result = await db.execute({
      sql: `
        SELECT 
          p.wallet_address,
          p.username,
          p.avatar_url,
          COALESCE(ps.games_played, 0) as games_played,
          COALESCE(ps.high_score, 0) as high_score,
          COUNT(DISTINCT lr.lobby_id) as rounds_played,
          SUM(CASE WHEN lr.won = 1 THEN 1 ELSE 0 END) as rounds_won,
          COALESCE(SUM(lr.payout_amount), 0) as total_sol_won,
          COALESCE(SUM(lr.final_score), 0) as total_score
        FROM players p
        LEFT JOIN player_stats ps ON p.wallet_address = ps.wallet_address
        LEFT JOIN lobby_results lr ON p.wallet_address = lr.wallet_address
        GROUP BY p.wallet_address, p.username, p.avatar_url, ps.games_played, ps.high_score
        HAVING rounds_played > 0 OR games_played > 0
        ORDER BY total_sol_won DESC, rounds_won DESC, total_score DESC
        LIMIT ?
      `,
      args: [limit],
    });

    return result.rows.map((row, index) => ({
      rank: index + 1,
      walletAddress: row.wallet_address as string,
      username: row.username as string | null,
      avatarUrl: row.avatar_url as string | null,
      gamesPlayed: row.games_played as number,
      highScore: row.high_score as number,
      roundsPlayed: row.rounds_played as number,
      roundsWon: row.rounds_won as number,
      totalSolWon: row.total_sol_won as number,
      totalScore: row.total_score as number,
    }));
  },
};

export default db;
