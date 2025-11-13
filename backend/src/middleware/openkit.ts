import { Request, Response, NextFunction } from 'express';
import { createOpenKit403, inMemoryLRU } from '@openkitx403/server';
import { checkTokenOwnership, TokenGateConfig } from '../services/solana.js';
import { verifyJWT, generateJWT } from '../services/jwt.js';

export interface OpenKit403User {
  address: string;
  challenge?: any;
}

declare global {
  namespace Express {
    interface Request {
      openkitx403User?: OpenKit403User;
    }
  }
}

// Token gate configuration (optional - set via environment variables)
const tokenGateConfig: TokenGateConfig = {
  requiredNftCollection: process.env.REQUIRED_NFT_COLLECTION,
  requiredTokenMint: process.env.REQUIRED_TOKEN_MINT,
  requiredTokenAmount: process.env.REQUIRED_TOKEN_AMOUNT 
    ? parseInt(process.env.REQUIRED_TOKEN_AMOUNT) 
    : undefined,
};

// Optional token gate function - only used if token gate is configured
const tokenGate = tokenGateConfig.requiredNftCollection || tokenGateConfig.requiredTokenMint
  ? async (address: string): Promise<boolean> => {
      try {
        const result = await checkTokenOwnership(address, tokenGateConfig);
        return result.hasAccess;
      } catch (error) {
        console.error('Token gate check failed:', error);
        return false;
      }
    }
  : undefined;

// Initialize OpenKit403
// Increased TTL to 30 minutes (1800 seconds) to reduce re-authentication prompts
// Tokens are JWT tokens that work for ALL endpoints on the same domain
// Once a user signs once, the token should be reusable for all API calls
const openkit = createOpenKit403({
  issuer: process.env.OPENKIT_ISSUER || 'solana-defender-api-v1',
  audience: process.env.OPENKIT_AUDIENCE || 'http://localhost:5173',
  ttlSeconds: parseInt(process.env.OPENKIT_TTL_SECONDS || '1800'), // 30 minutes
  replayStore: inMemoryLRU(),
  // Only add tokenGate if configured
  ...(tokenGate && { tokenGate }),
});

// Get the base OpenKit403 middleware
const baseOpenKitMiddleware = openkit.middleware();

// Custom middleware that wraps OpenKit403 with JWT token support
export const openkitMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  console.log(`[openkitMiddleware] ${req.method} ${req.path} - Auth header:`, authHeader ? 'Present' : 'Missing');
  
  // First, check if it's a Bearer token (JWT)
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    console.log(`[openkitMiddleware] Attempting to verify JWT token (length: ${token.length})`);
    const jwtResult = verifyJWT(token);
    
    if (jwtResult) {
      console.log(`[openkitMiddleware] ✅ Valid JWT token for address: ${jwtResult.address}`);
      // Valid JWT token - set user and continue
      req.openkitx403User = {
        address: jwtResult.address,
      };
      
      // Add JWT token to response header so frontend can cache it
      res.setHeader('X-Auth-Token', token);
      
      return next();
    }
    console.log(`[openkitMiddleware] ⚠️ Invalid JWT token, falling through to OpenKit403`);
    // Invalid JWT - fall through to OpenKit403 challenge
  }
  
  // No valid JWT - use OpenKit403 middleware
  // We need to intercept the response to add JWT token after successful auth
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  
  res.json = function(body: any) {
    // If authentication was successful, add JWT token to headers
    if (req.openkitx403User && res.statusCode !== 403 && res.statusCode !== 401) {
      const jwtToken = generateJWT(req.openkitx403User.address);
      res.setHeader('X-Auth-Token', jwtToken);
      res.setHeader('Authorization', `Bearer ${jwtToken}`);
    }
    return originalJson(body);
  };
  
  res.send = function(body: any) {
    // If authentication was successful, add JWT token to headers
    if (req.openkitx403User && res.statusCode !== 403 && res.statusCode !== 401) {
      const jwtToken = generateJWT(req.openkitx403User.address);
      res.setHeader('X-Auth-Token', jwtToken);
      res.setHeader('Authorization', `Bearer ${jwtToken}`);
    }
    return originalSend(body);
  };
  
  // Call the base OpenKit403 middleware
  baseOpenKitMiddleware(req, res, next);
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  console.log(`[requireAuth] Checking auth for ${req.method} ${req.path}`);
  console.log(`[requireAuth] Authorization header:`, req.headers['authorization'] ? 'Present' : 'Missing');
  console.log(`[requireAuth] openkitx403User:`, req.openkitx403User ? `Present (${req.openkitx403User.address})` : 'Missing');
  
  if (!req.openkitx403User) {
    console.log(`[requireAuth] ❌ Authentication failed for ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  console.log(`[requireAuth] ✅ Authentication passed for ${req.method} ${req.path}`);
  next();
};

export { openkit };

