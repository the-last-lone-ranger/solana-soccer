// Database configuration
// Supports both local SQLite and Turso (SQLite-compatible cloud)

export interface DatabaseConfig {
  type: 'local' | 'turso';
  path?: string; // For local SQLite
  url?: string; // For Turso
  authToken?: string; // For Turso
}

export function getDatabaseConfig(): DatabaseConfig {
  // Check for Turso environment variables first
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    return {
      type: 'turso',
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    };
  }

  // Fallback to local SQLite
  return {
    type: 'local',
    path: process.env.DATABASE_PATH || './data/game.db',
  };
}



