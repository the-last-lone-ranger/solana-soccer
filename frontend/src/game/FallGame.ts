import type { PlayerPosition } from '@solana-defender/shared';

export interface FallPlayer {
  walletAddress: string;
  username?: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  isGrounded: boolean;
  facing: 'left' | 'right';
  finished: boolean;
  finishTime?: number;
  color: string;
}

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GameResult {
  walletAddress: string;
  position: number; // 1st, 2nd, 3rd, etc.
  finishTime: number;
}

export class FallGame {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  
  // Game state
  isRunning: boolean = false;
  startTime: number = 0;
  finishLineY: number = 0;
  
  // Players
  localPlayer: FallPlayer;
  remotePlayers: Map<string, FallPlayer> = new Map();
  
  // Platforms (obstacles)
  platforms: Platform[] = [];
  
  // Physics constants
  readonly GRAVITY = 0.8;
  readonly JUMP_STRENGTH = -15;
  readonly MOVE_SPEED = 5;
  readonly FRICTION = 0.85;
  readonly PLATFORM_HEIGHT = 20;
  
  // Input
  keys: Set<string> = new Set();
  
  // Callbacks
  onPlayerFinish?: (result: GameResult) => void;
  onGameEnd?: (results: GameResult[]) => void;
  
  constructor(canvas: HTMLCanvasElement, localWalletAddress: string, localUsername?: string) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2d context');
    }
    this.ctx = ctx;
    
    // Set canvas size
    this.canvas.width = 800;
    this.canvas.height = 2000; // Tall canvas for falling
    
    // Initialize local player at the top
    this.localPlayer = {
      walletAddress: localWalletAddress,
      username: localUsername,
      x: this.canvas.width / 2,
      y: 50,
      velocityX: 0,
      velocityY: 0,
      isGrounded: false,
      facing: 'right',
      finished: false,
      color: '#4A90E2', // Blue for local player
    };
    
    // Set finish line at the bottom
    this.finishLineY = this.canvas.height - 100;
    
    // Generate platforms
    this.generatePlatforms();
    
    // Setup input
    this.setupInput();
  }
  
  generatePlatforms(): void {
    // Generate MANY more platforms for a challenging game
    const platformCount = 80; // Increased from 30
    const minGap = 80; // Reduced gap for more platforms
    const maxGap = 180;
    
    let currentY = 200;
    
    for (let i = 0; i < platformCount; i++) {
      // Vary platform sizes - some small, some large
      const width = 60 + Math.random() * 200;
      const x = Math.random() * (this.canvas.width - width);
      
      // Create some moving/platform patterns
      const isMoving = Math.random() < 0.15; // 15% chance of moving platform
      
      this.platforms.push({
        x,
        y: currentY,
        width,
        height: this.PLATFORM_HEIGHT,
        isMoving: isMoving,
        moveSpeed: isMoving ? (Math.random() - 0.5) * 2 : 0,
        moveDirection: Math.random() > 0.5 ? 1 : -1,
      });
      
      // Sometimes add multiple platforms at same height (side by side)
      if (Math.random() < 0.2 && i < platformCount - 1) {
        const secondWidth = 60 + Math.random() * 150;
        const secondX = Math.random() * (this.canvas.width - secondWidth);
        this.platforms.push({
          x: secondX,
          y: currentY,
          width: secondWidth,
          height: this.PLATFORM_HEIGHT,
          isMoving: false,
          moveSpeed: 0,
          moveDirection: 1,
        });
      }
      
      currentY += minGap + Math.random() * (maxGap - minGap);
    }
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
  
  updatePlatforms(deltaTime: number): void {
    // Update moving platforms
    for (const platform of this.platforms) {
      if (platform.isMoving && platform.moveSpeed !== undefined && platform.moveDirection !== undefined) {
        platform.x += platform.moveSpeed * platform.moveDirection * deltaTime * 60;
        
        // Bounce platforms off walls
        if (platform.x < 0 || platform.x + platform.width > this.canvas.width) {
          platform.moveDirection *= -1;
          platform.x = Math.max(0, Math.min(platform.x, this.canvas.width - platform.width));
        }
      }
    }
  }
  
  updateLocalPlayer(deltaTime: number): void {
    if (this.localPlayer.finished) return;
    
    const player = this.localPlayer;
    
    // Handle horizontal movement
    const left = this.keys.has('ArrowLeft') || this.keys.has('a') || this.keys.has('A');
    const right = this.keys.has('ArrowRight') || this.keys.has('d') || this.keys.has('D');
    const jump = this.keys.has(' ') || this.keys.has('ArrowUp') || this.keys.has('w') || this.keys.has('W');
    
    if (left) {
      player.velocityX = -this.MOVE_SPEED;
      player.facing = 'left';
    } else if (right) {
      player.velocityX = this.MOVE_SPEED;
      player.facing = 'right';
    } else {
      player.velocityX *= this.FRICTION;
    }
    
    // Handle jump
    if (jump && player.isGrounded) {
      player.velocityY = this.JUMP_STRENGTH;
      player.isGrounded = false;
    }
    
    // Apply gravity
    player.velocityY += this.GRAVITY;
    
    // Update position
    player.x += player.velocityX;
    player.y += player.velocityY;
    
    // Check platform collisions
    player.isGrounded = false;
    for (const platform of this.platforms) {
      if (
        player.x + 20 > platform.x &&
        player.x - 20 < platform.x + platform.width &&
        player.y + 20 > platform.y &&
        player.y + 20 < platform.y + platform.height &&
        player.velocityY >= 0
      ) {
        player.y = platform.y - 20;
        player.velocityY = 0;
        player.isGrounded = true;
        
        // If on a moving platform, move with it
        if (platform.isMoving && platform.moveSpeed !== undefined && platform.moveDirection !== undefined) {
          player.x += platform.moveSpeed * platform.moveDirection * deltaTime * 60;
        }
        break;
      }
    }
    
    // Boundary checks
    if (player.x < 20) {
      player.x = 20;
      player.velocityX = 0;
    }
    if (player.x > this.canvas.width - 20) {
      player.x = this.canvas.width - 20;
      player.velocityX = 0;
    }
    
    // Check if finished
    if (player.y >= this.finishLineY && !player.finished) {
      player.finished = true;
      player.finishTime = Date.now() - this.startTime;
      this.onPlayerFinish?.({
        walletAddress: player.walletAddress,
        position: 0, // Will be calculated later
        finishTime: player.finishTime,
      });
    }
  }
  
  updateRemotePlayer(walletAddress: string, position: PlayerPosition): void {
    let remotePlayer = this.remotePlayers.get(walletAddress);
    
    if (!remotePlayer) {
      // Create new remote player
      const colors = ['#FF6B6B', '#FFD93D', '#6BCF7F', '#4D96FF', '#9B59B6'];
      const colorIndex = this.remotePlayers.size % colors.length;
      
      remotePlayer = {
        walletAddress,
        x: position.x,
        y: position.y,
        velocityX: position.velocityX,
        velocityY: position.velocityY,
        isGrounded: position.isGrounded,
        facing: position.facing,
        finished: false,
        color: colors[colorIndex],
      };
      this.remotePlayers.set(walletAddress, remotePlayer);
    } else {
      // Update existing remote player (interpolate for smooth movement)
      remotePlayer.x = position.x;
      remotePlayer.y = position.y;
      remotePlayer.velocityX = position.velocityX;
      remotePlayer.velocityY = position.velocityY;
      remotePlayer.isGrounded = position.isGrounded;
      remotePlayer.facing = position.facing;
    }
  }
  
  getLocalPlayerPosition(): PlayerPosition {
    return {
      walletAddress: this.localPlayer.walletAddress,
      x: this.localPlayer.x,
      y: this.localPlayer.y,
      velocityX: this.localPlayer.velocityX,
      velocityY: this.localPlayer.velocityY,
      isGrounded: this.localPlayer.isGrounded,
      facing: this.localPlayer.facing,
    };
  }
  
  private lastFrameTime: number = 0;
  
  gameLoop(): void {
    if (!this.isRunning) return;
    
    const currentTime = performance.now();
    const deltaTime = this.lastFrameTime === 0 
      ? 0.016 // ~60fps on first frame
      : Math.min((currentTime - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = currentTime;
    
    // Update platforms (moving platforms)
    this.updatePlatforms(deltaTime);
    
    // Update local player
    this.updateLocalPlayer(deltaTime);
    
    // Render
    this.render();
    
    requestAnimationFrame(() => this.gameLoop());
  }
  
  render(): void {
    const ctx = this.ctx;
    
    // Clear canvas
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw background gradient (sky to ground)
    const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    gradient.addColorStop(0, '#87CEEB'); // Sky blue
    gradient.addColorStop(0.7, '#E0F6FF'); // Light blue
    gradient.addColorStop(1, '#7CB342'); // Green (ground)
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw platforms with better graphics
    for (const platform of this.platforms) {
      // Platform base (wood texture effect)
      const gradient = ctx.createLinearGradient(platform.x, platform.y, platform.x, platform.y + platform.height);
      gradient.addColorStop(0, '#8B4513'); // Brown
      gradient.addColorStop(0.5, '#A0522D'); // Sienna
      gradient.addColorStop(1, '#654321'); // Dark brown
      ctx.fillStyle = gradient;
      ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
      
      // Platform top edge (highlight)
      ctx.fillStyle = '#CD853F'; // Peru
      ctx.fillRect(platform.x, platform.y, platform.width, 3);
      
      // Platform wood grain lines
      ctx.strokeStyle = '#654321';
      ctx.lineWidth = 1;
      for (let i = 0; i < platform.width; i += 20) {
        ctx.beginPath();
        ctx.moveTo(platform.x + i, platform.y);
        ctx.lineTo(platform.x + i, platform.y + platform.height);
        ctx.stroke();
      }
      
      // Moving platform indicator
      if (platform.isMoving) {
        ctx.fillStyle = '#FFD700'; // Gold
        ctx.fillRect(platform.x + platform.width / 2 - 5, platform.y - 8, 10, 5);
      }
      
      // Platform shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(platform.x + 3, platform.y + platform.height, platform.width, 5);
    }
    
    // Draw finish line
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 5;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(0, this.finishLineY);
    ctx.lineTo(this.canvas.width, this.finishLineY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw finish line text
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🏁 FINISH LINE 🏁', this.canvas.width / 2, this.finishLineY - 10);
    
    // Draw all players
    this.drawPlayer(ctx, this.localPlayer, true);
    
    for (const remotePlayer of this.remotePlayers.values()) {
      this.drawPlayer(ctx, remotePlayer, false);
    }
    
    // Draw UI overlay
    this.drawUI(ctx);
  }
  
  drawPlayer(ctx: CanvasRenderingContext2D, player: FallPlayer, isLocal: boolean): void {
    ctx.save();
    ctx.translate(player.x, player.y);
    
    // Flip if facing left
    if (player.facing === 'left') {
      ctx.scale(-1, 1);
      ctx.translate(-40, 0);
    }
    
    // Body gradient (more vibrant)
    const bodyGradient = ctx.createRadialGradient(20, 0, 0, 20, 0, 15);
    bodyGradient.addColorStop(0, this.lightenColor(player.color, 30));
    bodyGradient.addColorStop(1, player.color);
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.arc(20, 0, 15, 0, Math.PI * 2);
    ctx.fill();
    
    // Body outline with glow effect
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Eyes with shine
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(15, -5, 5, 0, Math.PI * 2);
    ctx.arc(25, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Eye shine
    ctx.fillStyle = '#000';
    ctx.beginPath();
    const eyeX = player.facing === 'left' ? 13 : 15;
    ctx.arc(eyeX, -5, 3, 0, Math.PI * 2);
    ctx.arc(eyeX + 10, -5, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Eye highlight
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(eyeX + 1, -6, 1, 0, Math.PI * 2);
    ctx.arc(eyeX + 11, -6, 1, 0, Math.PI * 2);
    ctx.fill();
    
    // Smile with more expression
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(20, 5, 7, 0, Math.PI, false);
    ctx.stroke();
    
    // Draw username above player with background
    if (player.username) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const textWidth = ctx.measureText(player.username).width;
      ctx.fillRect(20 - textWidth / 2 - 4, -38, textWidth + 8, 16);
      
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(player.username, 20, -26);
    }
    
    // Draw "YOU" badge for local player with glow
    if (isLocal) {
      // Glow effect
      ctx.shadowColor = '#4A90E2';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#4A90E2';
      ctx.fillRect(-5, -35, 50, 15);
      ctx.shadowBlur = 0;
      
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('YOU', 20, -23);
    }
    
    // Draw finished indicator with animation
    if (player.finished) {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('🏆', 20, -45);
    }
    
    ctx.restore();
  }
  
  private lightenColor(color: string, percent: number): string {
    // Simple color lightening
    const num = parseInt(color.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + percent);
    const g = Math.min(255, ((num >> 8) & 0x00FF) + percent);
    const b = Math.min(255, (num & 0x0000FF) + percent);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }
  
  drawUI(ctx: CanvasRenderingContext2D): void {
    // Draw timer
    const elapsed = this.isRunning ? Date.now() - this.startTime : 0;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const displaySeconds = seconds % 60;
    
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Time: ${minutes}:${displaySeconds.toString().padStart(2, '0')}`, 10, 30);
    
    // Draw player count
    ctx.fillText(`Players: ${this.remotePlayers.size + 1}`, 10, 55);
    
    // Draw leaderboard
    const allPlayers = [this.localPlayer, ...Array.from(this.remotePlayers.values())];
    const sortedPlayers = allPlayers
      .filter(p => p.finished)
      .sort((a, b) => (a.finishTime || Infinity) - (b.finishTime || Infinity));
    
    if (sortedPlayers.length > 0) {
      ctx.fillStyle = '#000';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('🏆 Leaderboard:', this.canvas.width - 200, 30);
      
      sortedPlayers.forEach((player, index) => {
        const time = player.finishTime ? (player.finishTime / 1000).toFixed(2) : '0.00';
        ctx.fillStyle = index === 0 ? '#FFD700' : '#FFF';
        ctx.font = '14px Arial';
        ctx.fillText(
          `${index + 1}. ${player.username || player.walletAddress.slice(0, 6)}... - ${time}s`,
          this.canvas.width - 200,
          55 + index * 20
        );
      });
    }
  }
}

