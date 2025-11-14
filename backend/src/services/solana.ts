import { Connection, PublicKey, Transaction } from '@solana/web3.js';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

// Cache for token checks (5 minute TTL)
const tokenCache = new Map<string, { result: boolean; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache for SOL balance checks (30 second TTL to reduce RPC rate limits)
const balanceCache = new Map<string, { balance: number; timestamp: number }>();
const BALANCE_CACHE_TTL = 30 * 1000; // 30 seconds

export interface TokenGateConfig {
  requiredNftCollection?: string;
  requiredTokenMint?: string;
  requiredTokenAmount?: number;
}

export async function checkTokenOwnership(
  walletAddress: string,
  config: TokenGateConfig
): Promise<{ hasAccess: boolean; tokenType?: 'nft' | 'spl'; balance?: number }> {
  const cacheKey = `${walletAddress}-${JSON.stringify(config)}`;
  const cached = tokenCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { hasAccess: cached.result };
  }

  try {
    const publicKey = new PublicKey(walletAddress);
    let hasAccess = false;
    let tokenType: 'nft' | 'spl' | undefined;
    let balance: number | undefined;

    // Check NFT collection ownership
    if (config.requiredNftCollection) {
      const collectionPubkey = new PublicKey(config.requiredNftCollection);
      hasAccess = await checkNftOwnership(publicKey, collectionPubkey);
      if (hasAccess) {
        tokenType = 'nft';
      }
    }

    // Check SPL token balance
    if (!hasAccess && config.requiredTokenMint) {
      const mintPubkey = new PublicKey(config.requiredTokenMint);
      balance = await getTokenBalance(publicKey, mintPubkey);
      const requiredAmount = config.requiredTokenAmount || 1;
      hasAccess = balance >= requiredAmount;
      if (hasAccess) {
        tokenType = 'spl';
      }
    }

    // If no requirements, grant access
    if (!config.requiredNftCollection && !config.requiredTokenMint) {
      hasAccess = true;
    }

    tokenCache.set(cacheKey, { result: hasAccess, timestamp: Date.now() });
    
    return { hasAccess, tokenType, balance };
  } catch (error) {
    console.error('Error checking token ownership:', error);
    return { hasAccess: false };
  }
}

async function checkNftOwnership(wallet: PublicKey, collection: PublicKey): Promise<boolean> {
  try {
    // Get all token accounts for the wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    });

    // Check if any NFT belongs to the collection
    // Note: This is a simplified check. In production, you'd want to verify
    // the metadata and collection field more thoroughly
    for (const account of tokenAccounts.value) {
      const amount = account.account.data.parsed.info.tokenAmount.amount;
      if (amount === '1') {
        // Potential NFT (amount = 1), check metadata
        // For now, we'll do a basic check
        // In production, use Metaplex SDK to verify collection
        try {
          const mint = new PublicKey(account.account.data.parsed.info.mint);
          // Simplified: just check if we can find the NFT
          // Full implementation would verify collection field in metadata
          return true; // Placeholder - implement full metadata check
        } catch {
          continue;
        }
      }
    }
    return false;
  } catch (error) {
    console.error('Error checking NFT ownership:', error);
    return false;
  }
}

async function getTokenBalance(wallet: PublicKey, mint: PublicKey): Promise<number> {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet, {
      mint: mint,
    });

    if (tokenAccounts.value.length === 0) {
      return 0;
    }

    const account = tokenAccounts.value[0];
    const amount = account.account.data.parsed.info.tokenAmount.uiAmount || 0;
    return amount;
  } catch (error) {
    console.error('Error getting token balance:', error);
    return 0;
  }
}

// Check if wallet holds the Kicking It ($SOCCER) token
const KICKING_IT_TOKEN_MINT = '6q75D5TCaEJXSvidqwEDeyog55MKhWV2k5NZQRpzpump';

export async function checkKickItTokenHolder(walletAddress: string): Promise<boolean> {
  try {
    const publicKey = new PublicKey(walletAddress);
    const mintPubkey = new PublicKey(KICKING_IT_TOKEN_MINT);
    const balance = await getTokenBalance(publicKey, mintPubkey);
    return balance > 0;
  } catch (error) {
    console.error('Error checking Kicking It token holder:', error);
    return false;
  }
}

export async function getTokenHoldings(walletAddress: string): Promise<{ tokenBalance: number; nftCount: number }> {
  try {
    const publicKey = new PublicKey(walletAddress);
    
    // Get all token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    });

    let tokenBalance = 0;
    let nftCount = 0;

    for (const account of tokenAccounts.value) {
      const amount = account.account.data.parsed.info.tokenAmount.amount;
      const decimals = account.account.data.parsed.info.tokenAmount.decimals;
      
      // NFTs have amount = 1 and decimals = 0
      if (amount === '1' && decimals === 0) {
        nftCount++;
      } else {
        // Sum up token balances (simplified - in production you'd want to filter by specific tokens)
        const uiAmount = parseFloat(amount) / Math.pow(10, decimals);
        tokenBalance += uiAmount;
      }
    }

    return { tokenBalance, nftCount };
  } catch (error) {
    console.error('Error getting token holdings:', error);
    return { tokenBalance: 0, nftCount: 0 };
  }
}

// Clear cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of tokenCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      tokenCache.delete(key);
    }
  }
}, 60000); // Clean every minute

/**
 * Verify a SOL transfer transaction
 * Checks that the transaction exists, is confirmed, and transfers the expected amount
 */
export async function verifySolTransfer(
  transactionSignature: string,
  expectedFromAddress: string,
  expectedAmountSol: number,
  escrowAddress?: string
): Promise<{ valid: boolean; error?: string; actualAmount?: number }> {
  try {
    // Get transaction details
    const tx = await connection.getTransaction(transactionSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { valid: false, error: 'Transaction not found' };
    }

    if (tx.meta?.err) {
      return { valid: false, error: `Transaction failed: ${JSON.stringify(tx.meta.err)}` };
    }

    // Verify the transaction is from the expected address
    const fromPubkey = new PublicKey(expectedFromAddress);
    const accountKeys = tx.transaction.message.getAccountKeys();
    const allAccountKeys = accountKeys.keySegments().flat();
    if (!allAccountKeys.some((key: PublicKey) => key.equals(fromPubkey))) {
      return { valid: false, error: 'Transaction not from expected address' };
    }

    // Calculate SOL transfer amount
    // In a SOL transfer, we check the balance changes
    const preBalances = tx.meta?.preBalances || [];
    const postBalances = tx.meta?.postBalances || [];
    
    if (preBalances.length === 0 || postBalances.length === 0) {
      return { valid: false, error: 'Could not determine balance changes' };
    }

    // Find the sender's account index
    const senderIndex = allAccountKeys.findIndex(
      (key: PublicKey) => key.equals(fromPubkey)
    );

    if (senderIndex === -1) {
      return { valid: false, error: 'Sender not found in transaction' };
    }

    // Calculate amount sent (in lamports)
    const preBalance = preBalances[senderIndex] || 0;
    const postBalance = postBalances[senderIndex] || 0;
    const lamportsSent = preBalance - postBalance;

    // Convert to SOL (1 SOL = 1,000,000,000 lamports)
    const solSent = lamportsSent / 1_000_000_000;

    // Verify amount matches expected (with small tolerance for fees)
    const tolerance = 0.01; // Allow 0.01 SOL tolerance for transaction fees
    if (solSent < expectedAmountSol - tolerance) {
      return {
        valid: false,
        error: `Insufficient amount: expected ${expectedAmountSol} SOL, got ${solSent} SOL`,
        actualAmount: solSent,
      };
    }

    // If escrow address is provided, verify funds went there
    if (escrowAddress) {
      const escrowPubkey = new PublicKey(escrowAddress);
      const escrowIndex = allAccountKeys.findIndex(
        (key: PublicKey) => key.equals(escrowPubkey)
      );

      if (escrowIndex === -1) {
        return { valid: false, error: 'Escrow address not found in transaction' };
      }

      const escrowPreBalance = preBalances[escrowIndex] || 0;
      const escrowPostBalance = postBalances[escrowIndex] || 0;
      const escrowReceived = escrowPostBalance - escrowPreBalance;
      const escrowReceivedSol = escrowReceived / 1_000_000_000;

      if (escrowReceivedSol < expectedAmountSol - tolerance) {
        return {
          valid: false,
          error: `Escrow did not receive expected amount: expected ${expectedAmountSol} SOL, got ${escrowReceivedSol} SOL`,
          actualAmount: escrowReceivedSol,
        };
      }
    }

    return { valid: true, actualAmount: solSent };
  } catch (error: any) {
    console.error('Error verifying SOL transfer:', error);
    return { valid: false, error: error.message || 'Failed to verify transaction' };
  }
}

/**
 * Get SOL balance for a wallet address (with caching to reduce RPC rate limits)
 */
export async function getSolBalance(walletAddress: string): Promise<number> {
  // Check cache first
  const cached = balanceCache.get(walletAddress);
  if (cached && Date.now() - cached.timestamp < BALANCE_CACHE_TTL) {
    return cached.balance;
  }

  try {
    const publicKey = new PublicKey(walletAddress);
    const balanceLamports = await connection.getBalance(publicKey);
    const balance = balanceLamports / 1_000_000_000; // Convert lamports to SOL
    
    // Cache the result
    balanceCache.set(walletAddress, {
      balance,
      timestamp: Date.now(),
    });
    
    return balance;
  } catch (error: any) {
    console.error('Error getting SOL balance:', error);
    
    // If we have a cached value and it's a rate limit error, return cached value
    if (cached && error.message?.includes('429')) {
      console.log(`[Solana] Rate limited, returning cached balance for ${walletAddress}`);
      return cached.balance;
    }
    
    // If we have a cached value (even if expired), return it on error
    if (cached) {
      console.log(`[Solana] Error fetching balance, returning cached value for ${walletAddress}`);
      return cached.balance;
    }
    
    return 0;
  }
}

