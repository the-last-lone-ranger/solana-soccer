import type { PlayerPosition } from '@solana-defender/shared';

export interface SoccerPlayer {
  walletAddress: string;
  username?: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: 'left' | 'right' | 'up' | 'down';
  color: string;
  team: 'red' | 'blue';
  score: number;
  isSpeaking?: boolean; // Voice chat indicator
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
  
  // Ball
  ball: Ball;
  
  // Goals
  goals: Goal[] = [];
  
  // Field dimensions
  readonly FIELD_WIDTH = 800;
  readonly FIELD_HEIGHT = 600;
  readonly GOAL_WIDTH = 20;
  readonly GOAL_HEIGHT = 120;
  
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
    
    // Set canvas size
    this.canvas.width = this.FIELD_WIDTH;
    this.canvas.height = this.FIELD_HEIGHT;
    
    // Initialize goals
    this.goals = [
      { x: 0, y: (this.FIELD_HEIGHT - this.GOAL_HEIGHT) / 2, width: this.GOAL_WIDTH, height: this.GOAL_HEIGHT, team: 'red' },
      { x: this.FIELD_WIDTH - this.GOAL_WIDTH, y: (this.FIELD_HEIGHT - this.GOAL_HEIGHT) / 2, width: this.GOAL_WIDTH, height: this.GOAL_HEIGHT, team: 'blue' },
    ];
    
    // Initialize ball in center
    this.ball = {
      x: this.FIELD_WIDTH / 2,
      y: this.FIELD_HEIGHT / 2,
      velocityX: 0,
      velocityY: 0,
      radius: this.BALL_RADIUS,
    };
    
    // Initialize local player (assign team based on wallet address hash)
    const team = this.getTeamForPlayer(localWalletAddress);
    this.localPlayer = {
      walletAddress: localWalletAddress,
      username: localUsername,
      x: team === 'red' ? 150 : this.FIELD_WIDTH - 150,
      y: this.FIELD_HEIGHT / 2,
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
    
    // Boundary checks
    player.x = Math.max(this.PLAYER_RADIUS, Math.min(newX, this.FIELD_WIDTH - this.PLAYER_RADIUS));
    player.y = Math.max(this.PLAYER_RADIUS, Math.min(newY, this.FIELD_HEIGHT - this.PLAYER_RADIUS));
    
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
    
    // Bounce off walls
    if (this.ball.x - this.BALL_RADIUS < 0) {
      this.ball.x = this.BALL_RADIUS;
      this.ball.velocityX *= -this.BALL_BOUNCE;
    }
    if (this.ball.x + this.BALL_RADIUS > this.FIELD_WIDTH) {
      this.ball.x = this.FIELD_WIDTH - this.BALL_RADIUS;
      this.ball.velocityX *= -this.BALL_BOUNCE;
    }
    if (this.ball.y - this.BALL_RADIUS < 0) {
      this.ball.y = this.BALL_RADIUS;
      this.ball.velocityY *= -this.BALL_BOUNCE;
    }
    if (this.ball.y + this.BALL_RADIUS > this.FIELD_HEIGHT) {
      this.ball.y = this.FIELD_HEIGHT - this.BALL_RADIUS;
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
        
        // Reset ball to center
        this.ball.x = this.FIELD_WIDTH / 2;
        this.ball.y = this.FIELD_HEIGHT / 2;
        this.ball.velocityX = 0;
        this.ball.velocityY = 0;
        
        // Check for game end
        if (this.redScore >= this.maxScore || this.blueScore >= this.maxScore) {
          this.endGame();
        }
      }
    }
  }
  
  updateRemotePlayer(walletAddress: string, position: PlayerPosition): void {
    let remotePlayer = this.remotePlayers.get(walletAddress);
    
    if (!remotePlayer) {
      const team = this.getTeamForPlayer(walletAddress);
      remotePlayer = {
        walletAddress,
        username: position.username,
        x: position.x,
        y: position.y,
        velocityX: position.velocityX,
        velocityY: position.velocityY,
        facing: position.facing as 'left' | 'right' | 'up' | 'down',
        color: team === 'red' ? '#FF6B6B' : '#4A90E2',
        team,
        score: 0,
        isSpeaking: position.isSpeaking ?? false,
      };
      this.remotePlayers.set(walletAddress, remotePlayer);
    } else {
      remotePlayer.x = position.x;
      remotePlayer.y = position.y;
      remotePlayer.velocityX = position.velocityX;
      remotePlayer.velocityY = position.velocityY;
      remotePlayer.facing = position.facing as 'left' | 'right' | 'up' | 'down';
      if (position.username !== undefined) {
        remotePlayer.username = position.username;
      }
      if (position.isSpeaking !== undefined) {
        remotePlayer.isSpeaking = position.isSpeaking;
      }
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
    
    // Draw field (green grass with texture effect)
    const fieldGradient = ctx.createLinearGradient(0, 0, 0, this.FIELD_HEIGHT);
    fieldGradient.addColorStop(0, '#8BC34A'); // Brighter green
    fieldGradient.addColorStop(0.5, '#7CB342'); // Medium green
    fieldGradient.addColorStop(1, '#689F38'); // Darker green
    ctx.fillStyle = fieldGradient;
    ctx.fillRect(0, 0, this.FIELD_WIDTH, this.FIELD_HEIGHT);
    
    // Draw grass texture (subtle stripes)
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.15)';
    ctx.lineWidth = 2;
    for (let i = 0; i < this.FIELD_HEIGHT; i += 8) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(this.FIELD_WIDTH, i);
      ctx.stroke();
    }
    
    // Draw center line with glow
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#FFF';
    ctx.shadowBlur = 8;
    ctx.setLineDash([25, 15]);
    ctx.beginPath();
    ctx.moveTo(this.FIELD_WIDTH / 2, 0);
    ctx.lineTo(this.FIELD_WIDTH / 2, this.FIELD_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    
    // Draw center circle with glow
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#FFF';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(this.FIELD_WIDTH / 2, this.FIELD_HEIGHT / 2, 80, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Draw center dot
    ctx.fillStyle = '#FFF';
    ctx.shadowColor = '#FFF';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(this.FIELD_WIDTH / 2, this.FIELD_HEIGHT / 2, 6, 0, Math.PI * 2);
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
    
    // Body (circle with team color and gradient)
    const bodyGradient = ctx.createRadialGradient(-5, -5, 0, 0, 0, this.PLAYER_RADIUS);
    bodyGradient.addColorStop(0, this.lightenColor(player.color, 50));
    bodyGradient.addColorStop(0.6, player.color);
    bodyGradient.addColorStop(1, this.darkenColor(player.color, 20));
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.arc(0, 0, this.PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    
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
    // Score display with modern styling
    const scoreBgGradient = ctx.createLinearGradient(10, 10, 10, 70);
    scoreBgGradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    scoreBgGradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = scoreBgGradient;
    ctx.fillRect(10, 10, 220, 70);
    
    // Score border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 220, 70);
    
    // Red team score
    ctx.fillStyle = '#FF6B6B';
    ctx.font = 'bold 28px Orbitron, Arial';
    ctx.textAlign = 'left';
    ctx.shadowColor = '#FF6B6B';
    ctx.shadowBlur = 10;
    ctx.fillText(`RED: ${this.redScore}`, 20, 45);
    ctx.shadowBlur = 0;
    
    // Blue team score
    ctx.fillStyle = '#4A90E2';
    ctx.shadowColor = '#4A90E2';
    ctx.shadowBlur = 10;
    ctx.fillText(`BLUE: ${this.blueScore}`, 20, 75);
    ctx.shadowBlur = 0;
    
    // Timer with modern styling
    const elapsed = Date.now() - this.startTime;
    const remaining = Math.max(0, this.gameDuration - elapsed);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    const timerBgGradient = ctx.createLinearGradient(this.FIELD_WIDTH - 180, 10, this.FIELD_WIDTH - 20, 50);
    timerBgGradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    timerBgGradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = timerBgGradient;
    ctx.fillRect(this.FIELD_WIDTH - 180, 10, 170, 50);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.FIELD_WIDTH - 180, 10, 170, 50);
    
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 24px Orbitron, Arial';
    ctx.textAlign = 'right';
    ctx.shadowColor = '#FFF';
    ctx.shadowBlur = 8;
    ctx.fillText(`${minutes}:${seconds.toString().padStart(2, '0')}`, this.FIELD_WIDTH - 20, 40);
    ctx.shadowBlur = 0;
    
    // Game mode indicator
    const modeBgGradient = ctx.createLinearGradient(this.FIELD_WIDTH - 180, 60, this.FIELD_WIDTH - 20, 85);
    modeBgGradient.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
    modeBgGradient.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    ctx.fillStyle = modeBgGradient;
    ctx.fillRect(this.FIELD_WIDTH - 180, 60, 170, 30);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.FIELD_WIDTH - 180, 60, 170, 30);
    
    ctx.fillStyle = '#FFF';
    ctx.font = '600 14px Inter, Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`First to ${this.maxScore} wins`, this.FIELD_WIDTH - 20, 80);
  }
}

