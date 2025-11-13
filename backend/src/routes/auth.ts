import { Router, Request, Response } from 'express';
import { dbQueries } from '../db/database.js';
import { generateJWT } from '../services/jwt.js';
import { randomBytes } from 'crypto';

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
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/api/auth/google/callback`,
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
    
    // Check if user exists by google_id or synthetic wallet address
    let player = await dbQueries.getPlayerByGoogleId(googleId);
    
    if (!player) {
      // Create new player
      await dbQueries.createPlayerWithGoogle({
        googleId,
        email,
        name,
        picture,
        syntheticWalletAddress,
      });
      player = await dbQueries.getPlayerByGoogleId(googleId);
    } else {
      // Update avatar if changed
      if (picture && picture !== player.avatar_url) {
        await dbQueries.updatePlayer(player.wallet_address || syntheticWalletAddress, {
          avatarUrl: picture,
        });
      }
    }

    // Generate JWT token
    const jwtToken = generateJWT(player.wallet_address || syntheticWalletAddress, 'google', googleId);

    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/callback?token=${jwtToken}&type=google`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/error?message=${encodeURIComponent('Authentication failed')}`);
  }
});

// Get Google OAuth URL
router.get('/google/url', (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/api/auth/google/callback`;
  
  if (!clientId) {
    return res.status(500).json({ error: 'Google OAuth not configured' });
  }

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  })}`;

  res.json({ authUrl });
});

export default router;

