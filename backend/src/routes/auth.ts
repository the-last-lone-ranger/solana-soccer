import { Router, Request, Response } from 'express';
import { dbQueries } from '../db/database.js';
import db from '../db/database.js';
import { generateJWT } from '../services/jwt.js';

const router = Router();

// Google OAuth2 callback endpoint
router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || `${process.env.API_URL || (req.protocol + '://' + req.get('host')) || 'http://localhost:3000'}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Google token exchange failed:', error);
      return res.status(400).json({ error: 'Failed to exchange authorization code' });
    }

    const tokens = await tokenResponse.json();
    const { access_token } = tokens;

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!userInfoResponse.ok) {
      return res.status(400).json({ error: 'Failed to fetch user info' });
    }

    const userInfo = await userInfoResponse.json();
    const { id: googleId, email, name, picture } = userInfo;

    // Create or get player with Google ID
    // For Google users, we'll use a synthetic wallet address format: "google_<googleId>"
    const syntheticWalletAddress = `google_${googleId}`;
    
    // Check if user exists by google_id
    let player = await dbQueries.getPlayerByGoogleId(googleId);
    
    if (!player) {
      // Check if synthetic wallet address already exists (from previous sign-in)
      const existingPlayer = await dbQueries.getOrCreatePlayer(syntheticWalletAddress);
      
      // If player exists but doesn't have google_id set, update it
      if (existingPlayer && existingPlayer.wallet_address === syntheticWalletAddress) {
        try {
          // Update existing player with Google info
          await db.execute({
            sql: `UPDATE players SET google_id = ?, email = ?, username = COALESCE(?, username), avatar_url = COALESCE(?, avatar_url), auth_type = 'google' WHERE wallet_address = ?`,
            args: [googleId, email, name, picture, syntheticWalletAddress],
          });
          player = await dbQueries.getPlayerByGoogleId(googleId);
        } catch (error: any) {
          // If update fails (e.g., google_id already exists for another user), try to create new
          console.error('[Google OAuth] Failed to update existing player:', error.message);
          if (error.code === 'SQLITE_CONSTRAINT') {
            // google_id already exists for another wallet_address - use that player instead
            player = await dbQueries.getPlayerByGoogleId(googleId);
          } else {
            throw error;
          }
        }
      } else {
        // Create new player
        try {
          await dbQueries.createPlayerWithGoogle({
            googleId,
            email,
            name,
            picture,
            syntheticWalletAddress,
          });
          player = await dbQueries.getPlayerByGoogleId(googleId);
        } catch (error: any) {
          // If creation fails due to UNIQUE constraint, player already exists
          if (error.code === 'SQLITE_CONSTRAINT') {
            console.log('[Google OAuth] Player already exists, fetching...');
            player = await dbQueries.getPlayerByGoogleId(googleId);
            if (!player) {
              // Fallback: get by synthetic wallet address
              const fallbackPlayer = await dbQueries.getOrCreatePlayer(syntheticWalletAddress);
              player = {
                wallet_address: fallbackPlayer.wallet_address,
                username: fallbackPlayer.username,
                avatar_url: fallbackPlayer.avatar_url,
                created_at: fallbackPlayer.created_at,
                updated_at: fallbackPlayer.updated_at || fallbackPlayer.created_at,
                in_game_wallet_address: null,
                encrypted_private_key: null,
              };
            }
          } else {
            throw error;
          }
        }
      }
    } else {
      // Player exists - update avatar/email if changed
      if (picture && picture !== player.avatar_url) {
        await dbQueries.updatePlayerProfile(player.wallet_address || syntheticWalletAddress, undefined, picture);
      }
      if (email && email !== (player as any).email) {
        await db.execute({
          sql: `UPDATE players SET email = ? WHERE wallet_address = ?`,
          args: [email, player.wallet_address || syntheticWalletAddress],
        });
      }
    }

    // Generate JWT token
    const jwtToken = generateJWT(player.wallet_address || syntheticWalletAddress, 'google', googleId);

    console.log('[Google OAuth] ✅ Authentication successful, redirecting to frontend...');
    console.log('[Google OAuth] Player wallet address:', player.wallet_address || syntheticWalletAddress);
    
    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectUrl = `${frontendUrl}/?token=${encodeURIComponent(jwtToken)}&type=google`;
    console.log('[Google OAuth] Redirecting to:', redirectUrl);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/error?message=${encodeURIComponent('Authentication failed')}`);
  }
});

// Get Google OAuth URL
router.get('/google/url', (req: Request, res: Response) => {
  try {
    console.log('[Google OAuth] Getting OAuth URL...');
    const clientId = process.env.GOOGLE_CLIENT_ID;
    // Use API_URL or construct from request if not set
    const apiUrl = process.env.API_URL || (req.protocol + '://' + req.get('host')) || 'http://localhost:3000';
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${apiUrl}/api/auth/google/callback`;
    
    console.log('[Google OAuth] Client ID:', clientId ? 'Set' : 'Missing');
    console.log('[Google OAuth] API URL:', apiUrl);
    console.log('[Google OAuth] Redirect URI:', redirectUri);
    
    if (!clientId) {
      console.error('[Google OAuth] Missing GOOGLE_CLIENT_ID environment variable');
      return res.status(500).json({ 
        error: 'Google OAuth not configured',
        details: 'GOOGLE_CLIENT_ID environment variable is missing'
      });
    }

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
    })}`;

    console.log('[Google OAuth] Generated auth URL successfully');
    res.json({ authUrl });
  } catch (error) {
    console.error('[Google OAuth] Error generating URL:', error);
    res.status(500).json({ 
      error: 'Failed to generate OAuth URL',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;

