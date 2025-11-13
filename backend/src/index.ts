import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { openkitMiddleware } from './middleware/openkit.js';
import gameRoutes from './routes/game.js';
import lobbyRoutes from './routes/lobbies.js';
import authRoutes from './routes/auth.js';
import { setupSocketServer } from './services/socketServer.js';
import { permanentLobbyManager } from './services/permanentLobbyManager.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure data directory exists (for local fallback)
const dataDir = join(__dirname, '../data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  exposedHeaders: ['WWW-Authenticate', 'OpenKit-Challenge', 'openkit-challenge', 'X-Auth-Token', 'Authorization'],
}));
app.use(express.json());

// Request logging middleware
app.use('/api', (req, res, next) => {
  if (req.path === '/health') {
    return next(); // Skip logging for health checks
  }
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Headers:', {
    'authorization': req.headers.authorization ? 'Present: ' + req.headers.authorization : 'Missing',
    'openkit-challenge': req.headers['openkit-challenge'] || 'None',
    'openkit-signature': req.headers['openkit-signature'] ? 'Present' : 'Missing',
  });
  next();
});

// Public routes (no authentication required)
const publicRoutes = ['/health', '/leaderboard', '/username-check', '/rounds', '/users', '/auth/google/url'];

// Apply OpenKit middleware conditionally - only for protected routes
app.use('/api', (req, res, next) => {
  // Log the path for debugging
  console.log(`[Auth Check] ${req.method} ${req.path} (originalUrl: ${req.originalUrl})`);
  
  // Skip OpenKit middleware for public routes (check both req.path and req.originalUrl)
  const isPublicRoute = publicRoutes.includes(req.path) || 
                         publicRoutes.some(route => req.originalUrl.includes(route)) ||
                         req.path === '/users' ||
                         req.originalUrl.includes('/api/users');
  
  if (isPublicRoute) {
    console.log(`[Auth Check] ✅ Skipping auth for public route: ${req.path}`);
    return next();
  }
  
  // GET /matches is public, but POST /matches requires auth
  if (req.path === '/matches' && req.method === 'GET') {
    return next();
  }
  
  // GET /lobbies is public, but POST /lobbies requires auth
  if (req.path === '/lobbies' && req.method === 'GET') {
    return next();
  }
  
  // GET /rounds is public (no auth required)
  if (req.path === '/rounds' && req.method === 'GET') {
    return next();
  }
  
  // GET /users is public (no auth required) - explicit check
  if ((req.path === '/users' || req.originalUrl.includes('/api/users')) && req.method === 'GET') {
    console.log(`[Auth Check] ✅ Skipping auth for GET /users`);
    return next();
  }
  
  // GET /auth/google/url is public (no auth required)
  if (req.path === '/auth/google/url' && req.method === 'GET') {
    return next();
  }
  
  // GET /auth/google/callback is public (OAuth callback)
  if (req.path === '/auth/google/callback' && req.method === 'GET') {
    return next();
  }
  
  // GET /matches/:matchId is public (no auth required)
  if (req.path.startsWith('/matches/') && req.method === 'GET') {
    return next();
  }
  
  // GET /lobbies/:lobbyId is public (no auth required)
  if (req.path.startsWith('/lobbies/') && req.method === 'GET') {
    return next();
  }
  
  // All GET endpoints are public (except /profile which needs auth for user-specific data)
  // All POST/PUT/DELETE endpoints require auth (for playing the game)
  if (req.method === 'GET' && req.path !== '/profile' && !req.path.startsWith('/auth/google/callback')) {
    return next();
  }
  
  // Apply OpenKit middleware for protected routes (POST/PUT/DELETE and GET /profile)
  console.log(`[Auth Check] 🔒 Applying auth middleware for protected route: ${req.path}`);
  openkitMiddleware(req, res, next);
});

// Add auth status logging AND JWT token injection AFTER OpenKit middleware
app.use('/api', (req, res, next) => {
  // Skip logging for public routes
  if (publicRoutes.includes(req.path)) {
    return next();
  }
  
  // GET /matches, GET /lobbies, and GET /rounds are public (no auth required), but POST requires auth
  const isPublicRoute = (req.path === '/matches' || req.path === '/lobbies' || req.path === '/rounds') && req.method === 'GET';
  
  if (isPublicRoute) {
    // Don't log auth status for public routes
    return next();
  }
  
  if (req.openkitx403User) {
    console.log(`✅ Authenticated user: ${req.openkitx403User.address} for ${req.method} ${req.path}`);
    
    // CRITICAL: Generate and return a JWT token that works for ALL endpoints
    // This allows the frontend to reuse the token for all API calls
    // The JWT is generated from the OpenKit403 middleware's internal state
    // We need to create a JWT that the backend will accept for all endpoints
    
    // Check if Authorization header contains OpenKitx403 format
    const authHeader = req.headers.authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('OpenKitx403')) {
      // Extract the challenge to generate a JWT token
      // The challenge contains the header+payload, we need to create a proper JWT
      const challengeMatch = authHeader.match(/challenge="([^"]+)"/);
      if (challengeMatch && challengeMatch[1]) {
        // The challenge is a JWT header+payload (2 parts)
        // We can't create a valid JWT without the private key, but we can return
        // a token in the response that the frontend can use
        // Actually, OpenKit403 middleware validates the challenge/signature format
        // It doesn't expose a reusable JWT token
        
        // Instead, let's return a custom token in the response header
        // The frontend can use this token for subsequent requests
        // But we need to modify the middleware to accept Bearer tokens too
        
        // For now, let's add the JWT token to the response header
        // We'll need to generate it from the OpenKit403 instance
        try {
          // Try to get the JWT token from OpenKit403
          // The middleware should have generated a token internally
          // We can access it through the request object if available
          const jwtToken = (req as any).openkitx403Token || (req as any).jwtToken;
          if (jwtToken) {
            res.setHeader('X-Auth-Token', jwtToken);
            res.setHeader('Authorization', `Bearer ${jwtToken}`);
          }
        } catch (error) {
          // Ignore errors - token generation might not be available
        }
      }
    }
  } else {
    console.log(`❌ Not authenticated for ${req.method} ${req.path} - OpenKit middleware did not set user`);
    // Log response headers to see if challenge was sent
    const originalSend = res.send;
    res.send = function(body: any) {
      if (res.statusCode === 403) {
        console.log('🔐 403 Response headers:', res.getHeaders());
        console.log('🔐 WWW-Authenticate header:', res.getHeader('WWW-Authenticate'));
        console.log('🔐 OpenKit-Challenge header:', res.getHeader('OpenKit-Challenge'));
      }
      return originalSend.call(this, body);
    };
  }
  next();
});

// Mount routes (they handle their own public/protected logic)
app.use('/api/auth', authRoutes);
app.use('/api', gameRoutes);
app.use('/api', lobbyRoutes);

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  const frontendDistPath = join(__dirname, '../../frontend/dist');
  if (existsSync(frontendDistPath)) {
    app.use(express.static(frontendDistPath));
    // SPA fallback - serve index.html for all non-API routes
    app.get('*', (req, res, next) => {
      // Don't serve index.html for API routes
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(join(frontendDistPath, 'index.html'));
    });
  }
}

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Create HTTP server and Socket.IO server
const httpServer = createServer(app);
const io = setupSocketServer(httpServer);

httpServer.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 API available at http://localhost:${PORT}/api`);
  console.log(`🔌 WebSocket server ready`);
  
  // Initialize permanent lobbies on startup
  try {
    await permanentLobbyManager.initializePermanentLobbies();
  } catch (error) {
    console.error('❌ Failed to initialize permanent lobbies:', error);
  }
  
  // Periodically check and maintain permanent lobbies (every 5 minutes)
  setInterval(async () => {
    try {
      await permanentLobbyManager.checkAndMaintainPermanentLobbies();
    } catch (error) {
      console.error('❌ Error maintaining permanent lobbies:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
});

