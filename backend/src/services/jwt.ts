import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_ISSUER = process.env.OPENKIT_ISSUER || 'solana-defender-api-v1';
const JWT_AUDIENCE = process.env.OPENKIT_AUDIENCE || 'http://localhost:5173';
const JWT_TTL_SECONDS = parseInt(process.env.OPENKIT_TTL_SECONDS || '1800'); // 30 minutes

export interface JWTPayload {
  address: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

/**
 * Generate a JWT token for a wallet address after successful OpenKit403 authentication
 */
export function generateJWT(address: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    address,
    iat: now,
    exp: now + JWT_TTL_SECONDS,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
  };

  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
  });
}

/**
 * Verify a JWT token and extract the wallet address
 */
export function verifyJWT(token: string): { address: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as JWTPayload;

    return {
      address: decoded.address,
    };
  } catch (error) {
    return null;
  }
}

