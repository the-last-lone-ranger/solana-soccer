import { Keypair, PublicKey } from '@solana/web3.js';
import { dbQueries } from '../db/database.js';
import crypto from 'crypto';

/**
 * Wallet Service
 * Manages in-game custodial wallets for users
 * Each user gets a unique SOL wallet controlled by the backend
 */

// Encryption key from environment (should be set in production)
const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt a private key for storage
 */
function encryptPrivateKey(privateKey: Uint8Array): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  let encrypted = cipher.update(Buffer.from(privateKey));
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const authTag = cipher.getAuthTag();
  
  // Return iv:authTag:encrypted as hex string
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a private key from storage
 */
function decryptPrivateKey(encryptedData: string): Uint8Array {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = Buffer.from(parts[2], 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return new Uint8Array(decrypted);
}

/**
 * Get or create an in-game wallet for a user
 * Returns the public key address
 */
export async function getOrCreateInGameWallet(walletAddress: string): Promise<string> {
  // Check if user already has an in-game wallet
  const player = await dbQueries.getOrCreatePlayer(walletAddress);
  
  if (player.in_game_wallet_address) {
    return player.in_game_wallet_address;
  }
  
  // Generate new keypair for this user
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  
  // Encrypt the private key (secretKey is already a Uint8Array)
  const encryptedPrivateKey = encryptPrivateKey(keypair.secretKey);
  
  // Store wallet address and encrypted private key
  await dbQueries.setInGameWallet(walletAddress, publicKey, encryptedPrivateKey);
  
  console.log(`Created in-game wallet ${publicKey} for user ${walletAddress}`);
  
  return publicKey;
}

/**
 * Get the Keypair for a user's in-game wallet
 * This allows the backend to sign transactions on behalf of the user
 */
export async function getInGameWalletKeypair(walletAddress: string): Promise<Keypair | null> {
  const walletData = await dbQueries.getInGameWallet(walletAddress);
  
  if (!walletData) {
    return null;
  }
  
  try {
    const privateKeyArray = decryptPrivateKey(walletData.encrypted_private_key);
    return Keypair.fromSecretKey(privateKeyArray);
  } catch (error) {
    console.error('Failed to decrypt private key:', error);
    return null;
  }
}

/**
 * Get the public key address for a user's in-game wallet
 */
export async function getInGameWalletAddress(walletAddress: string): Promise<string | null> {
  const player = await dbQueries.getOrCreatePlayer(walletAddress);
  return player.in_game_wallet_address || null;
}

