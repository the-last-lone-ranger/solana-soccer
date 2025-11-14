import type { PlayerPosition } from '@solana-defender/shared';

export interface EquippedItem {
  itemId: string;
  itemName: string;
  itemType: string;
  rarity: string;
}

export interface SoccerPlayer {
  walletAddress: string;
  username?: string;
  avatarUrl?: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: 'left' | 'right' | 'up' | 'down';
  color: string;
  team: 'red' | 'blue';
  score: number;
  isSpeaking?: boolean; // Voice chat indicator
  hasCrown?: boolean; // Crown indicator for leader
  equippedItems?: EquippedItem[]; // Equipped items for visual customization
}

export interface Ball {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
}

export interface Goal {
  x: number;
  y: number;
  width: number;
  height: number;
  team: 'red' | 'blue';
}

export interface GameResult {
  walletAddress: string;
  team: 'red' | 'blue';
  score: number;
  won: boolean;
}

export class SoccerGame {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  
  // Game state
  isRunning: boolean = false;
  startTime: number = 0;
  gameDuration: number = 180000; // 3 minutes
  redScore: number = 0;
  blueScore: number = 0;
  maxScore: number = 5; // First to 5 wins
  
  // Players
  localPlayer: SoccerPlayer;
  remotePlayers: Map<string, SoccerPlayer> = new Map();
  
  // Avatar image cache
  avatarImages: Map<string, HTMLImageElement> = new Map();
  avatarLoadPromises: Map<string, Promise<void>> = new Map();
  
  // Ball
  ball: Ball;
  
  // Goals
  goals: Goal[] = [];
  
  // Field dimensions (base dimensions, will scale with canvas)
  readonly FIELD_WIDTH = 800;
  readonly FIELD_HEIGHT = 600;
  readonly GOAL_WIDTH = 20;
  readonly GOAL_HEIGHT = 120;
  readonly SCOREBOARD_HEIGHT = 100; // Height reserved for scoreboard at top
  
  // Current field dimensions (scaled to canvas)
  fieldWidth: number = 800;
  fieldHeight: number = 600;
  canvasWidth: number = 800;
  canvasHeight: number = 600;
  
  // Physics constants
  readonly PLAYER_SPEED = 5; // Increased from 4 for better movement
  readonly BALL_FRICTION = 0.985; // Slightly less friction for smoother movement
  readonly BALL_BOUNCE = 0.7;
  readonly KICK_STRENGTH = 15; // Increased from 8 - much easier to kick!
  readonly PLAYER_RADIUS = 20;
  readonly BALL_RADIUS = 12;
  readonly KICK_RANGE = 35; // Extended kick range - easier to hit the ball
  readonly BALL_MAGNETISM = 0.3; // Ball slightly attracted to nearby players
  
  // Input
  keys: Set<string> = new Set();
  
  // Callbacks
  onGoal?: (team: 'red' | 'blue', scorer: string) => void;
  onGameEnd?: (results: GameResult[]) => void;
  
  constructor(canvas: HTMLCanvasElement, localWalletAddress: string, localUsername?: string) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2d context');
    }
    this.ctx = ctx;
    
    // Get display size from CSS (or use defaults)
    // Note: canvas.width/height might be DPR-scaled, so we use CSS size instead
    const displayWidth = canvas.clientWidth || parseInt(canvas.style.width) || this.FIELD_WIDTH;
    const displayHeight = canvas.clientHeight || parseInt(canvas.style.height) || this.FIELD_HEIGHT;
    
    // Store canvas dimensions
    this.canvasWidth = displayWidth || this.FIELD_WIDTH;
    this.canvasHeight = displayHeight || this.FIELD_HEIGHT;
    
    // Field dimensions = canvas minus scoreboard area
    // Scoreboard is at top, field starts below it
    this.fieldWidth = this.canvasWidth;
    this.fieldHeight = Math.max(this.canvasHeight - this.SCOREBOARD_HEIGHT, this.FIELD_HEIGHT);
    
    // Calculate scale factors
    const scaleX = this.fieldWidth / this.FIELD_WIDTH;
    const scaleY = this.fieldHeight / this.FIELD_HEIGHT;
    
    // Initialize goals (scaled to field size, positioned relative to field start)
    const fieldStartY = this.SCOREBOARD_HEIGHT; // Field starts below scoreboard
    this.goals = [
      { x: 0, y: fieldStartY + (this.fieldHeight - this.GOAL_HEIGHT * scaleY) / 2, width: this.GOAL_WIDTH * scaleX, height: this.GOAL_HEIGHT * scaleY, team: 'red' },
      { x: this.fieldWidth - this.GOAL_WIDTH * scaleX, y: fieldStartY + (this.fieldHeight - this.GOAL_HEIGHT * scaleY) / 2, width: this.GOAL_WIDTH * scaleX, height: this.GOAL_HEIGHT * scaleY, team: 'blue' },
    ];
    
    // Initialize ball in center of field (not canvas)
    this.ball = {
      x: this.fieldWidth / 2,
      y: fieldStartY + this.fieldHeight / 2,
      velocityX: 0,
      velocityY: 0,
      radius: this.BALL_RADIUS,
    };
    
    // Initialize local player (assign team based on wallet address hash)
    const team = this.getTeamForPlayer(localWalletAddress);
    this.localPlayer = {
      walletAddress: localWalletAddress,
      username: localUsername,
      avatarUrl: undefined, // Will be set from lobby
      x: team === 'red' ? 150 * (this.fieldWidth / this.FIELD_WIDTH) : this.fieldWidth - 150 * (this.fieldWidth / this.FIELD_WIDTH),
      y: fieldStartY + this.fieldHeight / 2,
      velocityX: 0,
      velocityY: 0,
      facing: 'right',
      color: team === 'red' ? '#FF6B6B' : '#4A90E2',
      team,
      score: 0,
    };
    
    // Setup input
    this.setupInput();
  }
  
  getTeamForPlayer(walletAddress: string): 'red' | 'blue' {
    // Simple hash to assign teams consistently
    const hash = walletAddress.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return hash % 2 === 0 ? 'red' : 'blue';
  }
  
  setupInput(): void {
    const handleKeyDown = (e: KeyboardEvent) => {
      this.keys.add(e.key);
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.key);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
  }
  
  start(): void {
    this.isRunning = true;
    this.startTime = Date.now();
    this.gameLoop();
  }
  
  stop(): void {
    this.isRunning = false;
  }

  resize(width: number, height: number): void {
    // Store canvas dimensions
    this.canvasWidth = width;
    this.canvasHeight = height;
    
    // Field dimensions = canvas minus scoreboard area
    // Field MUST end at canvas bottom - no exceptions
    this.fieldWidth = width;
    this.fieldHeight = height - this.SCOREBOARD_HEIGHT; // Exact calculation - field ends at canvas bottom
    
    // Recalculate goals with new dimensions
    const scaleX = this.fieldWidth / this.FIELD_WIDTH;
    const scaleY = this.fieldHeight / this.FIELD_HEIGHT;
    const fieldStartY = this.SCOREBOARD_HEIGHT;
    const fieldEndY = this.canvasHeight; // Field ends exactly at canvas bottom
    
    this.goals = [
      { x: 0, y: fieldStartY + (this.fieldHeight - this.GOAL_HEIGHT * scaleY) / 2, width: this.GOAL_WIDTH * scaleX, height: this.GOAL_HEIGHT * scaleY, team: 'red' },
      { x: this.fieldWidth - this.GOAL_WIDTH * scaleX, y: fieldStartY + (this.fieldHeight - this.GOAL_HEIGHT * scaleY) / 2, width: this.GOAL_WIDTH * scaleX, height: this.GOAL_HEIGHT * scaleY, team: 'blue' },
    ];
    
    // Ensure ball stays within field boundaries - use canvas height as absolute limit
    this.ball.x = Math.max(this.BALL_RADIUS, Math.min(this.ball.x, this.fieldWidth - this.BALL_RADIUS));
    this.ball.y = Math.max(fieldStartY + this.BALL_RADIUS, Math.min(this.ball.y, fieldEndY - this.BALL_RADIUS));
  }
  
  updateLocalPlayer(deltaTime: number): void {
    const player = this.localPlayer;
    
    // Handle movement
    const up = this.keys.has('ArrowUp') || this.keys.has('w') || this.keys.has('W');
    const down = this.keys.has('ArrowDown') || this.keys.has('s') || this.keys.has('S');
    const left = this.keys.has('ArrowLeft') || this.keys.has('a') || this.keys.has('A');
    const right = this.keys.has('ArrowRight') || this.keys.has('d') || this.keys.has('D');
    
    player.velocityX = 0;
    player.velocityY = 0;
    
    if (up) {
      player.velocityY = -this.PLAYER_SPEED;
      player.facing = 'up';
    }
    if (down) {
      player.velocityY = this.PLAYER_SPEED;
      player.facing = 'down';
    }
    if (left) {
      player.velocityX = -this.PLAYER_SPEED;
      player.facing = 'left';
    }
    if (right) {
      player.velocityX = this.PLAYER_SPEED;
      player.facing = 'right';
    }
    
    // Update position
    const newX = player.x + player.velocityX * deltaTime * 60;
    const newY = player.y + player.velocityY * deltaTime * 60;
    
    // Boundary checks - field starts below scoreboard, ends at canvas bottom
    const fieldStartY = this.SCOREBOARD_HEIGHT;
    const fieldEndY = this.canvasHeight; // Absolute limit - canvas bottom
    player.x = Math.max(this.PLAYER_RADIUS, Math.min(newX, this.fieldWidth - this.PLAYER_RADIUS));
    player.y = Math.max(fieldStartY + this.PLAYER_RADIUS, Math.min(newY, fieldEndY - this.PLAYER_RADIUS));
    
    // Check ball collision with extended range for easier kicking
    const dx = this.ball.x - player.x;
    const dy = this.ball.y - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxCollisionDistance = this.KICK_RANGE; // Extended range
    
    // Ball magnetism - slightly pull ball toward player when close
    if (distance < this.KICK_RANGE * 1.5 && distance > 0) {
      const magnetismStrength = this.BALL_MAGNETISM * (1 - distance / (this.KICK_RANGE * 1.5));
      const pullX = (dx / distance) * magnetismStrength;
      const pullY = (dy / distance) * magnetismStrength;
      this.ball.velocityX += pullX;
      this.ball.velocityY += pullY;
    }
    
    if (distance < maxCollisionDistance) {
      const angle = Math.atan2(dy, dx);
      const playerSpeed = Math.sqrt(player.velocityX * player.velocityX + player.velocityY * player.velocityY);
      const ballSpeed = Math.sqrt(this.ball.velocityX * this.ball.velocityX + this.ball.velocityY * this.ball.velocityY);
      
      // Simplified kick logic - always kick when touching, but vary power based on player movement
      let kickPower = this.KICK_STRENGTH;
      
      // Increase kick power if player is moving (momentum)
      if (playerSpeed > 0.5) {
        kickPower += playerSpeed * 2; // Bonus power from movement
      }
      
      // Determine kick direction based on player movement or angle to ball
      let kickAngle = angle;
      if (playerSpeed > 1) {
        // If player is moving, kick in the direction they're moving
        kickAngle = Math.atan2(player.velocityY, player.velocityX);
      }
      
      // Apply kick
      this.ball.velocityX = Math.cos(kickAngle) * kickPower;
      this.ball.velocityY = Math.sin(kickAngle) * kickPower;
      
      // Push ball away from player to prevent sticking
      const pushDistance = Math.max(this.PLAYER_RADIUS + this.BALL_RADIUS + 3, distance + 2);
      this.ball.x = player.x + Math.cos(angle) * pushDistance;
      this.ball.y = player.y + Math.sin(angle) * pushDistance;
    }
  }
  
  updateBall(deltaTime: number): void {
    // Check collisions with all players (including remote players)
    const allPlayers = [this.localPlayer, ...Array.from(this.remotePlayers.values())];
    
    for (const player of allPlayers) {
      const dx = this.ball.x - player.x;
      const dy = this.ball.y - player.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const maxCollisionDistance = this.KICK_RANGE; // Extended range
      
      // Ball magnetism for all players
      if (distance < this.KICK_RANGE * 1.5 && distance > 0) {
        const magnetismStrength = this.BALL_MAGNETISM * (1 - distance / (this.KICK_RANGE * 1.5));
        const pullX = (dx / distance) * magnetismStrength;
        const pullY = (dy / distance) * magnetismStrength;
        this.ball.velocityX += pullX;
        this.ball.velocityY += pullY;
      }
      
      if (distance < maxCollisionDistance) {
        const angle = Math.atan2(dy, dx);
        const playerSpeed = Math.sqrt(player.velocityX * player.velocityX + player.velocityY * player.velocityY);
        
        // Simplified kick logic - always kick, power based on movement
        let kickPower = this.KICK_STRENGTH;
        
        // Increase kick power if player is moving
        if (playerSpeed > 0.5) {
          kickPower += playerSpeed * 2;
        }
        
        // Determine kick direction
        let kickAngle = angle;
        if (playerSpeed > 1) {
          kickAngle = Math.atan2(player.velocityY, player.velocityX);
        }
        
        // Apply kick
        this.ball.velocityX = Math.cos(kickAngle) * kickPower;
        this.ball.velocityY = Math.sin(kickAngle) * kickPower;
        
        // Push ball away from player
        const pushDistance = Math.max(this.PLAYER_RADIUS + this.BALL_RADIUS + 3, distance + 2);
        this.ball.x = player.x + Math.cos(angle) * pushDistance;
        this.ball.y = player.y + Math.sin(angle) * pushDistance;
        break; // Only handle one collision per frame
      }
    }
    
    // Apply friction
    this.ball.velocityX *= this.BALL_FRICTION;
    this.ball.velocityY *= this.BALL_FRICTION;
    
    // Update position
    this.ball.x += this.ball.velocityX * deltaTime * 60;
    this.ball.y += this.ball.velocityY * deltaTime * 60;
    
    // Field boundaries - field starts below scoreboard, ends at canvas bottom
    const fieldStartY = this.SCOREBOARD_HEIGHT;
    const fieldEndY = this.canvasHeight; // Absolute limit - canvas bottom
    
    // Bounce off walls - STOP AT CANVAS BOUNDARIES
    if (this.ball.x - this.BALL_RADIUS < 0) {
      this.ball.x = this.BALL_RADIUS;
      this.ball.velocityX *= -this.BALL_BOUNCE;
    }
    if (this.ball.x + this.BALL_RADIUS > this.fieldWidth) {
      this.ball.x = this.fieldWidth - this.BALL_RADIUS;
      this.ball.velocityX *= -this.BALL_BOUNCE;
    }
    if (this.ball.y - this.BALL_RADIUS < fieldStartY) {
      this.ball.y = fieldStartY + this.BALL_RADIUS;
      this.ball.velocityY *= -this.BALL_BOUNCE;
    }
    if (this.ball.y + this.BALL_RADIUS > fieldEndY) {
      this.ball.y = fieldEndY - this.BALL_RADIUS;
      this.ball.velocityY *= -this.BALL_BOUNCE;
    }
    
    // Check goal collisions
    for (const goal of this.goals) {
      if (
        this.ball.x - this.BALL_RADIUS < goal.x + goal.width &&
        this.ball.x + this.BALL_RADIUS > goal.x &&
        this.ball.y - this.BALL_RADIUS < goal.y + goal.height &&
        this.ball.y + this.BALL_RADIUS > goal.y
      ) {
        // Goal scored!
        const scoringTeam = goal.team === 'red' ? 'blue' : 'red'; // Opposite team scores
        if (scoringTeam === 'red') {
          this.redScore++;
        } else {
          this.blueScore++;
        }
        
        // Find scorer (player closest to ball)
        let scorer = this.localPlayer.walletAddress;
        let minDistance = Infinity;
        
        for (const player of [this.localPlayer, ...Array.from(this.remotePlayers.values())]) {
          const dist = Math.sqrt(
            Math.pow(player.x - this.ball.x, 2) + Math.pow(player.y - this.ball.y, 2)
          );
          if (dist < minDistance) {
            minDistance = dist;
            scorer = player.walletAddress;
          }
        }
        
        this.onGoal?.(scoringTeam, scorer);
        
        // Reset ball to center of field (not canvas)
        const fieldStartY = this.SCOREBOARD_HEIGHT;
        this.ball.x = this.fieldWidth / 2;
        this.ball.y = fieldStartY + this.fieldHeight / 2;
        this.ball.velocityX = 0;
        this.ball.velocityY = 0;
        
        // Check for game end
        if (this.redScore >= this.maxScore || this.blueScore >= this.maxScore) {
          this.endGame();
        }
      }
    }
  }
  
  updateRemotePlayer(walletAddress: string, position: PlayerPosition, hasCrown?: boolean, avatarUrl?: string, equippedItems?: EquippedItem[]): void {
    let remotePlayer = this.remotePlayers.get(walletAddress);
    
    if (!remotePlayer) {
      const team = this.getTeamForPlayer(walletAddress);
      remotePlayer = {
        walletAddress,
        username: position.username,
        avatarUrl: avatarUrl,
        x: position.x,
        y: position.y,
        velocityX: position.velocityX,
        velocityY: position.velocityY,
        facing: position.facing as 'left' | 'right' | 'up' | 'down',
        color: team === 'red' ? '#FF6B6B' : '#4A90E2',
        team,
        score: 0,
        isSpeaking: position.isSpeaking ?? false,
        hasCrown: hasCrown ?? false,
        equippedItems: equippedItems ?? [],
      };
      this.remotePlayers.set(walletAddress, remotePlayer);
      // Load avatar if provided
      if (avatarUrl) {
        this.loadAvatar(walletAddress, avatarUrl);
      }
    } else {
      remotePlayer.x = position.x;
      remotePlayer.y = position.y;
      remotePlayer.velocityX = position.velocityX;
      remotePlayer.velocityY = position.velocityY;
      remotePlayer.facing = position.facing as 'left' | 'right' | 'up' | 'down';
      if (position.username !== undefined) {
        remotePlayer.username = position.username;
      }
      if (avatarUrl !== undefined && remotePlayer.avatarUrl !== avatarUrl) {
        remotePlayer.avatarUrl = avatarUrl;
        this.loadAvatar(walletAddress, avatarUrl);
      }
      if (position.isSpeaking !== undefined) {
        remotePlayer.isSpeaking = position.isSpeaking;
      }
      if (hasCrown !== undefined) {
        remotePlayer.hasCrown = hasCrown;
      }
      // Only update equipped items if explicitly provided (preserve existing ones)
      if (equippedItems !== undefined) {
        remotePlayer.equippedItems = equippedItems;
      } else if (!remotePlayer.equippedItems) {
        // Initialize empty array if not set
        remotePlayer.equippedItems = [];
      }
    }
  }
  
  setLocalPlayerEquippedItems(equippedItems: EquippedItem[]): void {
    this.localPlayer.equippedItems = equippedItems;
  }
  
  setLocalPlayerAvatar(avatarUrl?: string): void {
    this.localPlayer.avatarUrl = avatarUrl;
    if (avatarUrl) {
      this.loadAvatar(this.localPlayer.walletAddress, avatarUrl);
    }
  }
  
  private loadAvatar(walletAddress: string, avatarUrl: string): void {
    // Skip if already loaded or loading
    if (this.avatarImages.has(walletAddress) || this.avatarLoadPromises.has(walletAddress)) {
      return;
    }
    
    // Check if it's an emoji (simple check)
    const EMOJI_AVATARS = ['🚀', '👾', '🎮', '⚡', '🔥', '💎', '👑', '🦄', '🐉', '🌟', '🎯', '💫'];
    if (EMOJI_AVATARS.includes(avatarUrl)) {
      // Emoji avatars don't need image loading
      return;
    }
    
    // Load image
    const promise = new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.avatarImages.set(walletAddress, img);
        this.avatarLoadPromises.delete(walletAddress);
        resolve();
      };
      img.onerror = () => {
        this.avatarLoadPromises.delete(walletAddress);
        reject(new Error(`Failed to load avatar for ${walletAddress}`));
      };
      img.src = avatarUrl;
    });
    
    this.avatarLoadPromises.set(walletAddress, promise);
  }
  
  updatePlayerCrown(walletAddress: string, hasCrown: boolean): void {
    const player = walletAddress === this.localPlayer.walletAddress 
      ? this.localPlayer 
      : this.remotePlayers.get(walletAddress);
    
    if (player) {
      player.hasCrown = hasCrown;
    }
  }

  updateLocalPlayerSpeaking(isSpeaking: boolean): void {
    this.localPlayer.isSpeaking = isSpeaking;
  }

  updateRemotePlayerSpeaking(walletAddress: string, isSpeaking: boolean): void {
    const remotePlayer = this.remotePlayers.get(walletAddress);
    if (remotePlayer) {
      remotePlayer.isSpeaking = isSpeaking;
    }
  }
  
  getLocalPlayerPosition(): PlayerPosition {
    return {
      walletAddress: this.localPlayer.walletAddress,
      x: this.localPlayer.x,
      y: this.localPlayer.y,
      velocityX: this.localPlayer.velocityX,
      velocityY: this.localPlayer.velocityY,
      isGrounded: false, // Not used in soccer
      facing: this.localPlayer.facing,
      username: this.localPlayer.username,
      isSpeaking: this.localPlayer.isSpeaking ?? false,
    };
  }

  getBallPosition(): { x: number; y: number; velocityX: number; velocityY: number } {
    return {
      x: this.ball.x,
      y: this.ball.y,
      velocityX: this.ball.velocityX,
      velocityY: this.ball.velocityY,
    };
  }
  
  endGame(): void {
    this.isRunning = false;
    
    const results: GameResult[] = [];
    
    // Add local player result
    results.push({
      walletAddress: this.localPlayer.walletAddress,
      team: this.localPlayer.team,
      score: this.localPlayer.team === 'red' ? this.redScore : this.blueScore,
      won: (this.localPlayer.team === 'red' && this.redScore > this.blueScore) ||
           (this.localPlayer.team === 'blue' && this.blueScore > this.redScore),
    });
    
    // Add remote players
    for (const player of this.remotePlayers.values()) {
      results.push({
        walletAddress: player.walletAddress,
        team: player.team,
        score: player.team === 'red' ? this.redScore : this.blueScore,
        won: (player.team === 'red' && this.redScore > this.blueScore) ||
             (player.team === 'blue' && this.blueScore > this.redScore),
      });
    }
    
    this.onGameEnd?.(results);
  }
  
  private lastFrameTime: number = 0;
  
  gameLoop(): void {
    if (!this.isRunning) return;
    
    const currentTime = performance.now();
    const deltaTime = this.lastFrameTime === 0 
      ? 0.016
      : Math.min((currentTime - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = currentTime;
    
    // Update game state
    this.updateLocalPlayer(deltaTime);
    this.updateBall(deltaTime);
    
    // Check game time
    const elapsed = Date.now() - this.startTime;
    if (elapsed >= this.gameDuration) {
      this.endGame();
    }
    
    // Render
    this.render();
    
    requestAnimationFrame(() => this.gameLoop());
  }
  
  render(): void {
    const ctx = this.ctx;
    
    // Clear entire canvas
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    
    // Draw scoreboard FIRST at the top (always visible)
    this.drawUI(ctx);
    
    // Field starts below scoreboard
    const fieldStartY = this.SCOREBOARD_HEIGHT;
    
    // Field ends exactly at canvas bottom
    const fieldEndY = this.canvasHeight;
    
    // Draw field (green grass with texture effect) - positioned below scoreboard, ends at canvas bottom
    const fieldGradient = ctx.createLinearGradient(0, fieldStartY, 0, fieldEndY);
    fieldGradient.addColorStop(0, '#8BC34A'); // Brighter green
    fieldGradient.addColorStop(0.5, '#7CB342'); // Medium green
    fieldGradient.addColorStop(1, '#689F38'); // Darker green
    ctx.fillStyle = fieldGradient;
    ctx.fillRect(0, fieldStartY, this.fieldWidth, this.fieldHeight);
    
    // Draw grass texture (subtle stripes) - exactly to canvas bottom
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.15)';
    ctx.lineWidth = 2;
    for (let i = fieldStartY; i < fieldEndY; i += 8) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(this.fieldWidth, i);
      ctx.stroke();
    }
    
    // Draw center line with glow - exactly to canvas bottom
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#FFF';
    ctx.shadowBlur = 8;
    ctx.setLineDash([25, 15]);
    ctx.beginPath();
    ctx.moveTo(this.fieldWidth / 2, fieldStartY);
    ctx.lineTo(this.fieldWidth / 2, fieldEndY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    
    // Draw center circle with glow
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#FFF';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(this.fieldWidth / 2, fieldStartY + this.fieldHeight / 2, 80, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Draw center dot
    ctx.fillStyle = '#FFF';
    ctx.shadowColor = '#FFF';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(this.fieldWidth / 2, fieldStartY + this.fieldHeight / 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Draw goals with better graphics
    for (const goal of this.goals) {
      // Goal background (net area)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(goal.x, goal.y, goal.width, goal.height);
      
      // Goal posts with glow
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 5;
      ctx.shadowColor = '#FFF';
      ctx.shadowBlur = 10;
      ctx.strokeRect(goal.x, goal.y, goal.width, goal.height);
      ctx.shadowBlur = 0;
      
      // Goal net (dashed lines with glow)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
      ctx.shadowBlur = 4;
      ctx.setLineDash([6, 6]);
      for (let i = 0; i < 6; i++) {
        const y = goal.y + (goal.height / 6) * i;
        ctx.beginPath();
        ctx.moveTo(goal.x, y);
        ctx.lineTo(goal.x - 35, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    }
    
    // Draw ball with improved graphics
    const ballGradient = ctx.createRadialGradient(
      this.ball.x - 4, this.ball.y - 4, 0,
      this.ball.x, this.ball.y, this.BALL_RADIUS
    );
    ballGradient.addColorStop(0, '#FFFFFF');
    ballGradient.addColorStop(0.3, '#F5F5F5');
    ballGradient.addColorStop(1, '#E0E0E0');
    ctx.fillStyle = ballGradient;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, this.BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Ball outline
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, this.BALL_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    
    // Ball pattern (hexagon/pentagon pattern like a real soccer ball)
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    
    // Draw hexagon pattern
    const hexSize = 3;
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6;
      const px = this.ball.x + Math.cos(angle) * hexSize;
      const py = this.ball.y + Math.sin(angle) * hexSize;
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Center pentagon
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const px = this.ball.x + Math.cos(angle) * 2;
      const py = this.ball.y + Math.sin(angle) * 2;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    
    // Draw all players
    this.drawPlayer(ctx, this.localPlayer, true);
    
    for (const remotePlayer of this.remotePlayers.values()) {
      this.drawPlayer(ctx, remotePlayer, false);
    }
    
    // Draw UI
    this.drawUI(ctx);
  }
  
  drawPlayer(ctx: CanvasRenderingContext2D, player: SoccerPlayer, isLocal: boolean): void {
    ctx.save();
    ctx.translate(player.x, player.y);
    
    // Body shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(2, this.PLAYER_RADIUS + 2, this.PLAYER_RADIUS * 0.8, this.PLAYER_RADIUS * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw equipped items effects BEFORE player body (for background effects)
    if (player.equippedItems && player.equippedItems.length > 0) {
      this.drawEquippedItems(ctx, player, true); // Draw background effects first
    }
    
    // Draw avatar if available, otherwise draw colored circle
    const avatarImg = player.avatarUrl ? this.avatarImages.get(player.walletAddress) : null;
    const EMOJI_AVATARS = ['🚀', '👾', '🎮', '⚡', '🔥', '💎', '👑', '🦄', '🐉', '🌟', '🎯', '💫'];
    const isEmojiAvatar = player.avatarUrl && EMOJI_AVATARS.includes(player.avatarUrl);
    
    if (avatarImg) {
      // Draw avatar image
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, this.PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.clip();
      
      // Draw team color background behind avatar
      const bodyGradient = ctx.createRadialGradient(-5, -5, 0, 0, 0, this.PLAYER_RADIUS);
      bodyGradient.addColorStop(0, this.lightenColor(player.color, 30));
      bodyGradient.addColorStop(0.7, player.color);
      bodyGradient.addColorStop(1, this.darkenColor(player.color, 10));
      ctx.fillStyle = bodyGradient;
      ctx.fillRect(-this.PLAYER_RADIUS, -this.PLAYER_RADIUS, this.PLAYER_RADIUS * 2, this.PLAYER_RADIUS * 2);
      
      // Draw avatar image
      ctx.drawImage(avatarImg, -this.PLAYER_RADIUS, -this.PLAYER_RADIUS, this.PLAYER_RADIUS * 2, this.PLAYER_RADIUS * 2);
      ctx.restore();
    } else if (isEmojiAvatar) {
      // Draw emoji avatar
      const bodyGradient = ctx.createRadialGradient(-5, -5, 0, 0, 0, this.PLAYER_RADIUS);
      bodyGradient.addColorStop(0, this.lightenColor(player.color, 30));
      bodyGradient.addColorStop(0.7, player.color);
      bodyGradient.addColorStop(1, this.darkenColor(player.color, 10));
      ctx.fillStyle = bodyGradient;
      ctx.beginPath();
      ctx.arc(0, 0, this.PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw emoji
      ctx.font = `${this.PLAYER_RADIUS * 1.2}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(player.avatarUrl, 0, 0);
    } else {
      // Draw colored circle (fallback)
      const bodyGradient = ctx.createRadialGradient(-5, -5, 0, 0, 0, this.PLAYER_RADIUS);
      bodyGradient.addColorStop(0, this.lightenColor(player.color, 50));
      bodyGradient.addColorStop(0.6, player.color);
      bodyGradient.addColorStop(1, this.darkenColor(player.color, 20));
      ctx.fillStyle = bodyGradient;
      ctx.beginPath();
      ctx.arc(0, 0, this.PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw equipped items effects AFTER player body (for foreground effects)
    if (player.equippedItems && player.equippedItems.length > 0) {
      this.drawEquippedItems(ctx, player, false); // Draw foreground effects
    }
    
    // Crown indicator - Gold outline with pulsing glow effect
    if (player.hasCrown) {
      const pulseTime = Date.now() / 1000;
      const pulseGlow = 15 + Math.sin(pulseTime * 3) * 5; // Pulsing glow intensity
      const pulseWidth = 5 + Math.sin(pulseTime * 3) * 1; // Pulsing outline width
      
      // Outer gold glow ring
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = pulseGlow;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = pulseWidth;
      ctx.beginPath();
      ctx.arc(0, 0, this.PLAYER_RADIUS + 2, 0, Math.PI * 2);
      ctx.stroke();
      
      // Inner gold outline
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#FFA500';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, this.PLAYER_RADIUS + 1, 0, Math.PI * 2);
      ctx.stroke();
      
      // Bright gold inner ring
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Outline with glow for local player
    if (isLocal) {
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 4;
      ctx.shadowColor = player.color;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // Draw direction indicator (arrow showing which way player is facing)
    // Only show arrow if no avatar (to avoid overlap)
    if (!avatarImg && !isEmojiAvatar) {
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      const arrowSize = 8;
      if (player.facing === 'right') {
        ctx.moveTo(arrowSize, 0);
        ctx.lineTo(-arrowSize, -arrowSize);
        ctx.lineTo(-arrowSize, arrowSize);
      } else if (player.facing === 'left') {
        ctx.moveTo(-arrowSize, 0);
        ctx.lineTo(arrowSize, -arrowSize);
        ctx.lineTo(arrowSize, arrowSize);
      } else if (player.facing === 'up') {
        ctx.moveTo(0, -arrowSize);
        ctx.lineTo(-arrowSize, arrowSize);
        ctx.lineTo(arrowSize, arrowSize);
      } else {
        ctx.moveTo(0, arrowSize);
        ctx.lineTo(-arrowSize, -arrowSize);
        ctx.lineTo(arrowSize, -arrowSize);
      }
      ctx.closePath();
      ctx.fill();
    }
    
    // Display name above player (username or wallet address)
    const displayName = player.username || `${player.walletAddress.slice(0, 6)}...${player.walletAddress.slice(-4)}`;
    const nameYOffset = isLocal ? -this.PLAYER_RADIUS - 50 : -this.PLAYER_RADIUS - 20;
    
    // Name background with gradient
    ctx.font = '600 12px Inter, Arial';
    const textWidth = ctx.measureText(displayName).width;
    const nameBgGradient = ctx.createLinearGradient(-textWidth / 2 - 6, nameYOffset - 14, -textWidth / 2 - 6, nameYOffset + 2);
    nameBgGradient.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
    nameBgGradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = nameBgGradient;
    ctx.fillRect(-textWidth / 2 - 6, nameYOffset - 14, textWidth + 12, 16);
    
    // Name border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-textWidth / 2 - 6, nameYOffset - 14, textWidth + 12, 16);
    
    // Name text with shadow
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(displayName, 0, nameYOffset);
    ctx.shadowBlur = 0;
    
    // Voice icon if speaking
    if (player.isSpeaking) {
      const voiceIconY = nameYOffset - 28;
      
      // Pulsing animation effect
      const pulseSize = 8 + Math.sin(Date.now() / 100) * 2;
      
      // Outer glow ring
      ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, voiceIconY, pulseSize + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Microphone icon background
      const micGradient = ctx.createRadialGradient(0, voiceIconY - 2, 0, 0, voiceIconY, 8);
      micGradient.addColorStop(0, '#34d399');
      micGradient.addColorStop(1, '#10b981');
      ctx.fillStyle = micGradient;
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, voiceIconY, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Microphone icon border
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, voiceIconY, 8, 0, Math.PI * 2);
      ctx.stroke();
      
      // Microphone lines
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, voiceIconY - 5);
      ctx.lineTo(0, voiceIconY + 5);
      ctx.moveTo(-3, voiceIconY + 5);
      ctx.lineTo(3, voiceIconY + 5);
      ctx.stroke();
    }
    
    // "YOU" badge for local player
    if (isLocal) {
      ctx.shadowColor = player.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = player.color;
      ctx.fillRect(-15, nameYOffset - 25, 30, 12);
      ctx.shadowBlur = 0;
      
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 9px Inter, Arial';
      ctx.textAlign = 'center';
      ctx.fillText('YOU', 0, nameYOffset - 16);
    }
    
    ctx.restore();
  }
  
  private lightenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + percent);
    const g = Math.min(255, ((num >> 8) & 0x00FF) + percent);
    const b = Math.min(255, (num & 0x0000FF) + percent);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  private darkenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const r = Math.max(0, (num >> 16) - percent);
    const g = Math.max(0, ((num >> 8) & 0x00FF) - percent);
    const b = Math.max(0, (num & 0x0000FF) - percent);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }
  
  drawUI(ctx: CanvasRenderingContext2D): void {
    // Score display with modern styling - ALWAYS AT TOP (y=10)
    const scoreY = 10;
    const scoreBgGradient = ctx.createLinearGradient(10, scoreY, 10, scoreY + 70);
    scoreBgGradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    scoreBgGradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = scoreBgGradient;
    ctx.fillRect(10, scoreY, 220, 70);
    
    // Score border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, scoreY, 220, 70);
    
    // Red team score
    ctx.fillStyle = '#FF6B6B';
    ctx.font = 'bold 28px Orbitron, Arial';
    ctx.textAlign = 'left';
    ctx.shadowColor = '#FF6B6B';
    ctx.shadowBlur = 10;
    ctx.fillText(`RED: ${this.redScore}`, 20, scoreY + 35);
    ctx.shadowBlur = 0;
    
    // Blue team score
    ctx.fillStyle = '#4A90E2';
    ctx.shadowColor = '#4A90E2';
    ctx.shadowBlur = 10;
    ctx.fillText(`BLUE: ${this.blueScore}`, 20, scoreY + 65);
    ctx.shadowBlur = 0;
    
    // Timer with modern styling
    const elapsed = Date.now() - this.startTime;
    const remaining = Math.max(0, this.gameDuration - elapsed);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    const timerX = this.canvasWidth - 180;
    const timerBgGradient = ctx.createLinearGradient(timerX, scoreY, this.canvasWidth - 20, scoreY + 40);
    timerBgGradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    timerBgGradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = timerBgGradient;
    ctx.fillRect(timerX, scoreY, 170, 50);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(timerX, scoreY, 170, 50);
    
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 24px Orbitron, Arial';
    ctx.textAlign = 'right';
    ctx.shadowColor = '#FFF';
    ctx.shadowBlur = 8;
    ctx.fillText(`${minutes}:${seconds.toString().padStart(2, '0')}`, this.canvasWidth - 20, scoreY + 30);
    ctx.shadowBlur = 0;
    
    // Game mode indicator
    const modeBgGradient = ctx.createLinearGradient(timerX, scoreY + 50, this.canvasWidth - 20, scoreY + 80);
    modeBgGradient.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
    modeBgGradient.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    ctx.fillStyle = modeBgGradient;
    ctx.fillRect(timerX, scoreY + 50, 170, 30);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(timerX, scoreY + 50, 170, 30);
    
    ctx.fillStyle = '#FFF';
    ctx.font = '600 14px Inter, Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`First to ${this.maxScore} wins`, this.canvasWidth - 20, scoreY + 70);
  }
  
  drawEquippedItems(ctx: CanvasRenderingContext2D, player: SoccerPlayer, isBackground: boolean): void {
    if (!player.equippedItems || player.equippedItems.length === 0) return;
    
    const time = Date.now() / 1000;
    
    for (const item of player.equippedItems) {
      const rarity = item.rarity.toLowerCase();
      
      // Get rarity color
      let rarityColor = '#9ca3af'; // Common - gray
      if (rarity === 'rare') rarityColor = '#3b82f6'; // Blue
      else if (rarity === 'epic') rarityColor = '#a855f7'; // Purple
      else if (rarity === 'legendary') rarityColor = '#f59e0b'; // Gold
      
      // Shield items - background effect (glowing aura)
      if (item.itemType.toLowerCase() === 'shield' && isBackground) {
        const pulse = Math.sin(time * 2) * 0.3 + 0.7;
        const shieldRadius = this.PLAYER_RADIUS + 8 + pulse * 3;
        
        // Outer glow
        ctx.shadowColor = rarityColor;
        ctx.shadowBlur = 15 * pulse;
        ctx.strokeStyle = rarityColor;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.6 * pulse;
        ctx.beginPath();
        ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Inner ring
        ctx.globalAlpha = 0.8 * pulse;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, shieldRadius - 2, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
      
      // Weapon items - foreground effect (weapon visual)
      if (item.itemType.toLowerCase() === 'weapon' && !isBackground) {
        const weaponSize = 12;
        const angle = player.facing === 'right' ? 0 : player.facing === 'left' ? Math.PI : 
                     player.facing === 'up' ? -Math.PI / 2 : Math.PI / 2;
        
        ctx.save();
        ctx.rotate(angle);
        ctx.translate(this.PLAYER_RADIUS + 5, 0);
        
        // Weapon glow
        ctx.shadowColor = rarityColor;
        ctx.shadowBlur = 8;
        ctx.fillStyle = rarityColor;
        
        // Draw weapon shape (simple blaster/sword)
        ctx.beginPath();
        if (item.itemName.toLowerCase().includes('sword') || item.itemName.toLowerCase().includes('blade')) {
          // Sword shape
          ctx.moveTo(0, -weaponSize);
          ctx.lineTo(weaponSize * 0.5, 0);
          ctx.lineTo(0, weaponSize);
          ctx.lineTo(-weaponSize * 0.3, 0);
          ctx.closePath();
        } else {
          // Blaster shape
          ctx.fillRect(-weaponSize * 0.3, -weaponSize * 0.5, weaponSize * 0.6, weaponSize);
          ctx.beginPath();
          ctx.arc(0, 0, weaponSize * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.restore();
      }
      
      // Cosmetic items - foreground effect (particles, trails, etc.)
      if (item.itemType.toLowerCase() === 'cosmetic' && !isBackground) {
        const pulse = Math.sin(time * 3) * 0.5 + 0.5;
        
        // Particle trail effect
        if (item.itemName.toLowerCase().includes('trail') || item.itemName.toLowerCase().includes('glow')) {
          ctx.shadowColor = rarityColor;
          ctx.shadowBlur = 10 * pulse;
          ctx.strokeStyle = rarityColor;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.7 * pulse;
          ctx.beginPath();
          ctx.arc(0, 0, this.PLAYER_RADIUS + 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        
        // Aura effect
        if (item.itemName.toLowerCase().includes('aura') || item.itemName.toLowerCase().includes('radiance')) {
          const auraRadius = this.PLAYER_RADIUS + 5 + pulse * 2;
          const gradient = ctx.createRadialGradient(0, 0, this.PLAYER_RADIUS, 0, 0, auraRadius);
          gradient.addColorStop(0, `rgba(${this.hexToRgb(rarityColor)}, 0.8)`);
          gradient.addColorStop(0.5, `rgba(${this.hexToRgb(rarityColor)}, 0.4)`);
          gradient.addColorStop(1, `rgba(${this.hexToRgb(rarityColor)}, 0)`);
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(0, 0, auraRadius, 0, Math.PI * 2);
          ctx.fill();
        }
        
        // Wings effect
        if (item.itemName.toLowerCase().includes('wing')) {
          ctx.shadowColor = rarityColor;
          ctx.shadowBlur = 8;
          ctx.strokeStyle = rarityColor;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.8;
          
          // Left wing
          ctx.beginPath();
          ctx.moveTo(-this.PLAYER_RADIUS - 8, -5);
          ctx.lineTo(-this.PLAYER_RADIUS - 15, -10);
          ctx.lineTo(-this.PLAYER_RADIUS - 12, 0);
          ctx.lineTo(-this.PLAYER_RADIUS - 15, 10);
          ctx.lineTo(-this.PLAYER_RADIUS - 8, 5);
          ctx.stroke();
          
          // Right wing
          ctx.beginPath();
          ctx.moveTo(this.PLAYER_RADIUS + 8, -5);
          ctx.lineTo(this.PLAYER_RADIUS + 15, -10);
          ctx.lineTo(this.PLAYER_RADIUS + 12, 0);
          ctx.lineTo(this.PLAYER_RADIUS + 15, 10);
          ctx.lineTo(this.PLAYER_RADIUS + 8, 5);
          ctx.stroke();
          
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }
        
        ctx.shadowBlur = 0;
      }
    }
  }
  
  hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 0, 0';
  }
}

