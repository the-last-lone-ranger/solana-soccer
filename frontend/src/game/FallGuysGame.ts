import type { PlayerPosition } from '@solana-defender/shared';

export interface FallGuysPlayer {
  walletAddress: string;
  username?: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  isGrounded: boolean;
  facing: 'left' | 'right';
  eliminated: boolean;
  eliminationTime?: number;
  color: string;
}

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  isMoving?: boolean;
  moveSpeed?: number;
  moveDirection?: number;
  disappearsAfter?: number; // Timestamp when platform disappears
}

export interface GameResult {
  walletAddress: string;
  position: number; // 1st, 2nd, 3rd, etc. (1 = winner)
  eliminated: boolean;
  survivalTime: number;
}

export class FallGuysGame {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  
  // Game state
  isRunning: boolean = false;
  startTime: number = 0;
  eliminationZoneY: number = 0; // Players below this get eliminated
  playersAlive: number = 0;
  
  // Players
  localPlayer: FallGuysPlayer;
  remotePlayers: Map<string, FallGuysPlayer> = new Map();
  
  // Platforms (obstacles) - platforms disappear over time
  platforms: Platform[] = [];
  
  // Physics constants
  readonly GRAVITY = 0.8;
  readonly JUMP_STRENGTH = -15;
  readonly MOVE_SPEED = 5;
  readonly FRICTION = 0.85;
  readonly PLATFORM_HEIGHT = 20;
  readonly ELIMINATION_ZONE_OFFSET = 100; // How far below canvas before elimination
  
  // Input
  keys: Set<string> = new Set();
  
  // Callbacks
  onPlayerEliminated?: (walletAddress: string) => void;
  onGameEnd?: (results: GameResult[]) => void;
  
  constructor(canvas: HTMLCanvasElement, localWalletAddress: string, localUsername?: string) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2d context');
    }
    this.ctx = ctx;
    
    // Set canvas size
    this.canvas.width = 1200;
    this.canvas.height = 800;
    
    // Initialize local player at the top center
    this.localPlayer = {
      walletAddress: localWalletAddress,
      username: localUsername,
      x: this.canvas.width / 2,
      y: 50,
      velocityX: 0,
      velocityY: 0,
      isGrounded: false,
      facing: 'right',
      eliminated: false,
      color: '#4A90E2', // Blue for local player
    };
    
    // Set elimination zone at the bottom
    this.eliminationZoneY = this.canvas.height + this.ELIMINATION_ZONE_OFFSET;
    
    // Generate platforms - FALL GUYS STYLE: platforms disappear!
    this.generatePlatforms();
    
    // Setup input
    this.setupInput();
    
    // Count initial players
    this.updatePlayersAlive();
  }
  
  generatePlatforms(): void {
    // Generate MANY platforms that will disappear over time
    const platformCount = 60;
    const minGap = 60;
    const maxGap = 150;
    
    let currentY = 150;
    
    for (let i = 0; i < platformCount; i++) {
      // Vary platform sizes
      const width = 80 + Math.random() * 180;
      const x = Math.random() * (this.canvas.width - width);
      
      // Some platforms move horizontally
      const isMoving = Math.random() < 0.2; // 20% chance
      
      // Some platforms disappear after a delay (Fall Guys style!)
      const disappearsAfter = Math.random() < 0.3 ? Date.now() + 10000 + Math.random() * 20000 : undefined;
      
      this.platforms.push({
        x,
        y: currentY,
        width,
        height: this.PLATFORM_HEIGHT,
        isMoving: isMoving,
        moveSpeed: isMoving ? (Math.random() - 0.5) * 2 : 0,
        moveDirection: isMoving ? (Math.random() > 0.5 ? 1 : -1) : 0,
        disappearsAfter: disappearsAfter, // Store timestamp when platform disappears
      });
      
      // Sometimes add multiple platforms at same height
      if (Math.random() < 0.15 && i < platformCount - 1) {
        const secondWidth = 60 + Math.random() * 120;
        const secondX = Math.random() * (this.canvas.width - secondWidth);
        this.platforms.push({
          x: secondX,
          y: currentY,
          width: secondWidth,
          height: this.PLATFORM_HEIGHT,
          isMoving: false,
          moveSpeed: 0,
          moveDirection: 0,
          disappearsAfter: undefined,
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
    const now = Date.now();
    
    // Update moving platforms and remove disappearing ones
    this.platforms = this.platforms.filter(platform => {
      // Remove platform if it's time to disappear
      if (platform.disappearsAfter && now > platform.disappearsAfter) {
        return false; // Remove this platform
      }
      
      // Update moving platforms
      if (platform.isMoving && platform.moveSpeed !== undefined && platform.moveDirection !== undefined) {
        platform.x += platform.moveSpeed * platform.moveDirection * deltaTime * 60;
        
        // Bounce platforms off walls
        if (platform.x < 0 || platform.x + platform.width > this.canvas.width) {
          platform.moveDirection *= -1;
          platform.x = Math.max(0, Math.min(platform.x, this.canvas.width - platform.width));
        }
      }
      
      return true; // Keep this platform
    });
  }
  
  updateLocalPlayer(deltaTime: number): void {
    if (this.localPlayer.eliminated) return;
    
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
    
    // Boundary checks - wrap around horizontally (Fall Guys style)
    if (player.x < -20) {
      player.x = this.canvas.width + 20;
    }
    if (player.x > this.canvas.width + 20) {
      player.x = -20;
    }
    
    // Check if eliminated (fell off bottom)
    if (player.y > this.eliminationZoneY && !player.eliminated) {
      player.eliminated = true;
      player.eliminationTime = Date.now() - this.startTime;
      this.onPlayerEliminated?.(player.walletAddress);
      this.updatePlayersAlive();
      
      // Check if game should end (only one player left)
      if (this.playersAlive <= 1) {
        this.endGame();
      }
    }
  }
  
  updateRemotePlayer(walletAddress: string, position: PlayerPosition): void {
    let remotePlayer = this.remotePlayers.get(walletAddress);
    
    if (!remotePlayer) {
      // Create new remote player
      const colors = ['#FF6B6B', '#FFD93D', '#6BCF7F', '#4D96FF', '#9B59B6', '#FF9FF3', '#54A0FF', '#5F27CD'];
      const colorIndex = this.remotePlayers.size % colors.length;
      
      remotePlayer = {
        walletAddress,
        username: position.username,
        x: position.x,
        y: position.y,
        velocityX: position.velocityX,
        velocityY: position.velocityY,
        isGrounded: position.isGrounded,
        facing: position.facing,
        eliminated: false,
        color: colors[colorIndex],
      };
      this.remotePlayers.set(walletAddress, remotePlayer);
      this.updatePlayersAlive();
    } else {
      // Update existing remote player
      remotePlayer.x = position.x;
      remotePlayer.y = position.y;
      remotePlayer.velocityX = position.velocityX;
      remotePlayer.velocityY = position.velocityY;
      remotePlayer.isGrounded = position.isGrounded;
      remotePlayer.facing = position.facing;
      
      // Check if remote player got eliminated
      if (!remotePlayer.eliminated && remotePlayer.y > this.eliminationZoneY) {
        remotePlayer.eliminated = true;
        remotePlayer.eliminationTime = Date.now() - this.startTime;
        this.onPlayerEliminated?.(remotePlayer.walletAddress);
        this.updatePlayersAlive();
        
        // Check if game should end
        if (this.playersAlive <= 1) {
          this.endGame();
        }
      }
    }
  }
  
  updatePlayersAlive(): void {
    let alive = 0;
    if (!this.localPlayer.eliminated) alive++;
    for (const player of this.remotePlayers.values()) {
      if (!player.eliminated) alive++;
    }
    this.playersAlive = alive;
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
      username: this.localPlayer.username,
    };
  }
  
  private lastFrameTime: number = 0;
  
  gameLoop(): void {
    if (!this.isRunning) return;
    
    const currentTime = performance.now();
    const deltaTime = this.lastFrameTime === 0 
      ? 0.016
      : Math.min((currentTime - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = currentTime;
    
    // Update platforms (moving and disappearing)
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
    
    // Draw background gradient (sky to void)
    const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    gradient.addColorStop(0, '#87CEEB'); // Sky blue
    gradient.addColorStop(0.5, '#E0F6FF'); // Light blue
    gradient.addColorStop(0.8, '#FFD700'); // Gold (warning zone)
    gradient.addColorStop(1, '#FF0000'); // Red (elimination zone)
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw elimination zone warning
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.fillRect(0, this.canvas.height - 50, this.canvas.width, 50);
    ctx.fillStyle = '#FF0000';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('⚠️ ELIMINATION ZONE ⚠️', this.canvas.width / 2, this.canvas.height - 15);
    
    // Draw platforms with disappearing animation
    const now = Date.now();
    for (const platform of this.platforms) {
      // Flash platform if it's about to disappear
      if (platform.disappearsAfter) {
        const timeLeft = platform.disappearsAfter - now;
        if (timeLeft < 3000) {
          // Flash red when about to disappear
          const flash = Math.sin(timeLeft / 100) > 0;
          ctx.fillStyle = flash ? '#FF0000' : '#8B4513';
        } else {
          ctx.fillStyle = '#8B4513';
        }
      } else {
        ctx.fillStyle = '#8B4513';
      }
      
      // Platform base
      const platformGradient = ctx.createLinearGradient(platform.x, platform.y, platform.x, platform.y + platform.height);
      platformGradient.addColorStop(0, '#8B4513');
      platformGradient.addColorStop(0.5, '#A0522D');
      platformGradient.addColorStop(1, '#654321');
      ctx.fillStyle = platformGradient;
      ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
      
      // Platform top edge
      ctx.fillStyle = '#CD853F';
      ctx.fillRect(platform.x, platform.y, platform.width, 3);
      
      // Moving platform indicator
      if (platform.isMoving) {
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(platform.x + platform.width / 2 - 5, platform.y - 8, 10, 5);
      }
      
      // Disappearing platform warning
      if (platform.disappearsAfter) {
        const timeLeft = platform.disappearsAfter - now;
        if (timeLeft < 5000) {
          ctx.fillStyle = '#FF0000';
          ctx.font = 'bold 12px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('⚠', platform.x + platform.width / 2, platform.y - 15);
        }
      }
    }
    
    // Draw all players
    this.drawPlayer(ctx, this.localPlayer, true);
    
    for (const remotePlayer of this.remotePlayers.values()) {
      this.drawPlayer(ctx, remotePlayer, false);
    }
    
    // Draw UI overlay
    this.drawUI(ctx);
  }
  
  drawPlayer(ctx: CanvasRenderingContext2D, player: FallGuysPlayer, isLocal: boolean): void {
    if (player.eliminated) {
      // Draw eliminated player as gray ghost
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.translate(player.x, player.y);
      
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.arc(20, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('ELIMINATED', 20, -25);
      
      ctx.restore();
      return;
    }
    
    ctx.save();
    ctx.translate(player.x, player.y);
    
    // Flip if facing left
    if (player.facing === 'left') {
      ctx.scale(-1, 1);
      ctx.translate(-40, 0);
    }
    
    // Body gradient (Fall Guys style - vibrant colors)
    const bodyGradient = ctx.createRadialGradient(20, 0, 0, 20, 0, 15);
    bodyGradient.addColorStop(0, this.lightenColor(player.color, 30));
    bodyGradient.addColorStop(1, player.color);
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.arc(20, 0, 15, 0, Math.PI * 2);
    ctx.fill();
    
    // Body outline
    ctx.strokeStyle = '#FFF';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Eyes
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(15, -5, 5, 0, Math.PI * 2);
    ctx.arc(25, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Pupils
    ctx.fillStyle = '#000';
    ctx.beginPath();
    const eyeX = player.facing === 'left' ? 13 : 15;
    ctx.arc(eyeX, -5, 3, 0, Math.PI * 2);
    ctx.arc(eyeX + 10, -5, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Smile
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(20, 5, 7, 0, Math.PI, false);
    ctx.stroke();
    
    // Username
    if (player.username) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const textWidth = ctx.measureText(player.username).width;
      ctx.fillRect(20 - textWidth / 2 - 4, -30, textWidth + 8, 16);
      
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(player.username, 20, -20);
    }
    
    // "YOU" badge for local player
    if (isLocal) {
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
    
    ctx.restore();
  }
  
  private lightenColor(color: string, percent: number): string {
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
    
    // Draw players alive count (BIG AND PROMINENT)
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.playersAlive} PLAYERS ALIVE`, this.canvas.width / 2, 50);
    
    // Draw elimination list
    const allPlayers = [this.localPlayer, ...Array.from(this.remotePlayers.values())];
    const eliminatedPlayers = allPlayers
      .filter(p => p.eliminated)
      .sort((a, b) => (a.eliminationTime || Infinity) - (b.eliminationTime || Infinity));
    
    if (eliminatedPlayers.length > 0) {
      ctx.fillStyle = '#000';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('💀 Eliminated:', this.canvas.width - 250, 30);
      
      eliminatedPlayers.forEach((player, index) => {
        const name = player.username || player.walletAddress.slice(0, 6) + '...';
        ctx.fillStyle = '#999';
        ctx.font = '14px Arial';
        ctx.fillText(
          `${eliminatedPlayers.length - index}. ${name}`,
          this.canvas.width - 250,
          55 + index * 20
        );
      });
    }
  }
  
  endGame(): void {
    this.isRunning = false;
    
    const results: GameResult[] = [];
    const allPlayers = [this.localPlayer, ...Array.from(this.remotePlayers.values())];
    
    // Sort by elimination time (survivors first, then by elimination order)
    const sortedPlayers = allPlayers.sort((a, b) => {
      if (!a.eliminated && b.eliminated) return -1;
      if (a.eliminated && !b.eliminated) return 1;
      if (!a.eliminated && !b.eliminated) return 0; // Both alive (shouldn't happen)
      return (a.eliminationTime || Infinity) - (b.eliminationTime || Infinity);
    });
    
    sortedPlayers.forEach((player, index) => {
      results.push({
        walletAddress: player.walletAddress,
        position: index + 1,
        eliminated: player.eliminated,
        survivalTime: player.eliminationTime || (Date.now() - this.startTime),
      });
    });
    
    this.onGameEnd?.(results);
  }
}

