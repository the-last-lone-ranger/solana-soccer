import { Player } from './Player.js';
import { Enemy, EnemyType } from './Enemy.js';
import { Bullet } from './Bullet.js';
import { PowerUp, PowerUpType } from './PowerUp.js';
import { Particle } from './Particle.js';

export enum GameState {
  Menu = 'menu',
  Playing = 'playing',
  Paused = 'paused',
  GameOver = 'gameover',
}

export interface GameStats {
  score: number;
  level: number;
  lives: number;
  enemiesKilled: number;
}

export interface CompetitiveMatchInfo {
  matchId: string;
  isCreator: boolean;
  opponentAddress: string;
  opponentUsername?: string;
  betAmountSol: number;
}

export interface CompetitiveStats {
  myScore: number;
  opponentScore: number;
  timeRemaining?: number;
}

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  state: GameState = GameState.Menu;
  stats: GameStats = {
    score: 0,
    level: 1,
    lives: 3,
    enemiesKilled: 0,
  };

  player: Player;
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  powerUps: PowerUp[] = [];
  particles: Particle[] = [];

  keys: Set<string> = new Set();
  lastTime: number = 0;
  enemySpawnTimer: number = 0;
  enemySpawnInterval: number = 2000; // milliseconds
  powerUpSpawnTimer: number = 0;
  powerUpSpawnInterval: number = 15000; // 15 seconds
  itemDropTimer: number = 0;
  itemDropInterval: number = 30000; // 30 seconds
  tokenBalance: number = 0;
  nftCount: number = 0;

  // Competitive multiplayer mode
  isCompetitive: boolean = false;
  matchInfo: CompetitiveMatchInfo | null = null;
  opponentScore: number = 0;
  matchStartTime: number = 0;
  matchDuration: number = 300; // 5 minutes default
  scoreSyncInterval: number = 0;
  lastScoreSync: number = 0;

  onGameOver?: (stats: GameStats) => void;
  onScoreUpdate?: (score: number) => void;
  onItemFound?: (item: any) => void;
  onCompetitiveScoreUpdate?: (stats: CompetitiveStats) => void;
  onMatchTimeUpdate?: (timeRemaining: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2d context');
    }
    this.ctx = ctx;

    // Set canvas size
    this.canvas.width = 800;
    this.canvas.height = 600;

    // Initialize player
    this.player = new Player(this.canvas.width / 2 - 20, this.canvas.height - 60);

    // Setup input handlers
    this.setupInput();
  }

  setupInput(): void {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Use e.code for more reliable key detection (physical key position)
      // e.key can vary based on keyboard layout, e.code is consistent
      let key: string;
      
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          key = 'left';
          break;
        case 'ArrowRight':
        case 'KeyD':
          key = 'right';
          break;
        case 'ArrowUp':
        case 'KeyW':
          key = 'up';
          break;
        case 'ArrowDown':
        case 'KeyS':
          key = 'down';
          break;
        case 'Space':
          key = 'space';
          break;
        default:
          // Fallback to e.key for other keys
          key = e.key.toLowerCase();
          break;
      }
      
      this.keys.add(key);
      
      // Prevent default for game keys to avoid scrolling/page navigation
      if (['left', 'right', 'up', 'down', 'space', 'a', 'd', 'w', 's'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Use e.code for more reliable key detection
      let key: string;
      
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          key = 'left';
          break;
        case 'ArrowRight':
        case 'KeyD':
          key = 'right';
          break;
        case 'ArrowUp':
        case 'KeyW':
          key = 'up';
          break;
        case 'ArrowDown':
        case 'KeyS':
          key = 'down';
          break;
        case 'Space':
          key = 'space';
          break;
        default:
          // Fallback to e.key for other keys
          key = e.key.toLowerCase();
          break;
      }
      
      this.keys.delete(key);
    };

    // Add listeners to window for global key handling
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Also add listeners to canvas for better focus handling
    this.canvas.addEventListener('keydown', handleKeyDown);
    this.canvas.addEventListener('keyup', handleKeyUp);
    
    // Make canvas focusable
    this.canvas.setAttribute('tabindex', '0');
    this.canvas.focus();
  }

  start(): void {
    this.state = GameState.Playing;
    this.reset();
    if (this.isCompetitive) {
      this.matchStartTime = performance.now();
      this.lastScoreSync = performance.now();
    }
    // Ensure canvas has focus for keyboard input
    this.canvas.focus();
    this.gameLoop();
  }

  startCompetitive(matchInfo: CompetitiveMatchInfo): void {
    this.isCompetitive = true;
    this.matchInfo = matchInfo;
    this.start();
  }

  reset(): void {
    this.stats = {
      score: 0,
      level: 1,
      lives: 3,
      enemiesKilled: 0,
    };
    this.player = new Player(this.canvas.width / 2 - 20, this.canvas.height - 60);
    this.enemies = [];
    this.bullets = [];
    this.powerUps = [];
    this.particles = [];
    this.enemySpawnTimer = 0;
    this.powerUpSpawnTimer = 0;
    this.enemySpawnInterval = 2000;
    this.opponentScore = 0;
    this.matchStartTime = 0;
    this.lastScoreSync = 0;
  }

  setOpponentScore(score: number): void {
    this.opponentScore = score;
    if (this.onCompetitiveScoreUpdate) {
      const timeRemaining = this.getTimeRemaining();
      this.onCompetitiveScoreUpdate({
        myScore: this.stats.score,
        opponentScore: score,
        timeRemaining,
      });
    }
  }

  getTimeRemaining(): number {
    if (!this.isCompetitive || this.matchStartTime === 0) {
      return 0;
    }
    const elapsed = (performance.now() - this.matchStartTime) / 1000; // seconds
    return Math.max(0, this.matchDuration - elapsed);
  }

  pause(): void {
    if (this.state === GameState.Playing) {
      this.state = GameState.Paused;
    } else if (this.state === GameState.Paused) {
      this.state = GameState.Playing;
      this.gameLoop();
    }
  }

  gameLoop(): void {
    if (this.state !== GameState.Playing && this.state !== GameState.Paused) {
      return;
    }

    const currentTime = performance.now();
    // Initialize lastTime on first frame to avoid huge deltaTime
    if (this.lastTime === 0) {
      this.lastTime = currentTime;
    }
    const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
    this.lastTime = currentTime;
    
    // Clamp deltaTime to prevent huge jumps (e.g., tab switching)
    const clampedDeltaTime = Math.min(deltaTime, 0.1); // Max 100ms per frame

    if (this.state === GameState.Playing) {
      this.update(clampedDeltaTime);
    }

    this.render();
    requestAnimationFrame(() => this.gameLoop());
  }

  update(deltaTime: number): void {
    // Handle input - check for movement keys (support both old and new normalization)
    const leftPressed = this.keys.has('left') || this.keys.has('arrowleft') || this.keys.has('a');
    const rightPressed = this.keys.has('right') || this.keys.has('arrowright') || this.keys.has('d');
    
    // Handle movement
    if (leftPressed) {
      this.player.moveLeft();
    } else if (rightPressed) {
      this.player.moveRight();
    } else {
      this.player.stop();
    }

    // Handle shooting - support both 'space' and ' ' 
    if ((this.keys.has('space') || this.keys.has(' ')) && this.canShoot()) {
      this.shoot();
    }

    // Update entities
    this.player.update(deltaTime);
    
    this.bullets.forEach((bullet) => bullet.update(deltaTime));
    this.bullets = this.bullets.filter((bullet) => bullet.position.y > -bullet.size.height);

    this.enemies.forEach((enemy) => enemy.update(deltaTime));
    this.enemies = this.enemies.filter((enemy) => enemy.position.y < this.canvas.height + 50);

    this.powerUps.forEach((powerUp) => powerUp.update(deltaTime));
    this.powerUps = this.powerUps.filter((powerUp) => powerUp.position.y < this.canvas.height + 50);

    this.particles.forEach((particle) => particle.update(deltaTime));
    this.particles = this.particles.filter((particle) => particle.life > 0);

    // Spawn enemies
    this.enemySpawnTimer += deltaTime * 1000;
    if (this.enemySpawnTimer >= this.enemySpawnInterval) {
      this.spawnEnemy();
      this.enemySpawnTimer = 0;
      // Increase spawn rate as level increases
      this.enemySpawnInterval = Math.max(800, 2000 - this.stats.level * 100);
    }

    // Spawn power-ups
    this.powerUpSpawnTimer += deltaTime * 1000;
    if (this.powerUpSpawnTimer >= this.powerUpSpawnInterval) {
      this.spawnPowerUp();
      this.powerUpSpawnTimer = 0;
    }

    // Check for item drops
    this.itemDropTimer += deltaTime * 1000;
    if (this.itemDropTimer >= this.itemDropInterval) {
      this.checkItemDrop();
      this.itemDropTimer = 0;
    }

    // Check collisions
    this.checkCollisions();

    // Check if enemies reached bottom
    this.enemies.forEach((enemy) => {
      if (enemy.position.y > this.canvas.height - 20) {
        this.takeDamage();
        enemy.active = false;
      }
    });
    this.enemies = this.enemies.filter((enemy) => enemy.active);

    // Update level based on score
    const newLevel = Math.floor(this.stats.score / 500) + 1;
    if (newLevel > this.stats.level) {
      this.stats.level = newLevel;
    }

    // Competitive mode: sync scores and check time
    if (this.isCompetitive) {
      const now = performance.now();
      const timeSinceLastSync = (now - this.lastScoreSync) / 1000; // seconds
      
      // Sync score every 2 seconds
      if (timeSinceLastSync >= 2) {
        this.onScoreUpdate?.(this.stats.score);
        this.lastScoreSync = now;
      }

      // Check time limit
      const timeRemaining = this.getTimeRemaining();
      this.onMatchTimeUpdate?.(timeRemaining);
      
      if (timeRemaining <= 0) {
        this.gameOver();
      }

      // Update competitive stats
      if (this.onCompetitiveScoreUpdate) {
        this.onCompetitiveScoreUpdate({
          myScore: this.stats.score,
          opponentScore: this.opponentScore,
          timeRemaining,
        });
      }
    }
  }

  canShoot(): boolean {
    // Limit shooting rate
    const lastBullet = this.bullets[this.bullets.length - 1];
    if (lastBullet && lastBullet.position.y > this.player.position.y - 50) {
      return false;
    }
    return true;
  }

  shoot(): void {
    const centerX = this.player.position.x + this.player.size.width / 2;
    const y = this.player.position.y;

    if (this.player.multiShot) {
      // Triple shot
      this.bullets.push(new Bullet(centerX - 15, y));
      this.bullets.push(new Bullet(centerX, y));
      this.bullets.push(new Bullet(centerX + 15, y));
    } else {
      this.bullets.push(new Bullet(centerX - 2, y));
    }
  }

  spawnEnemy(): void {
    const x = Math.random() * (this.canvas.width - 50);
    let type = EnemyType.Basic;
    
    // Spawn different types based on level
    const rand = Math.random();
    if (this.stats.level > 3 && rand < 0.3) {
      type = EnemyType.Tank;
    } else if (this.stats.level > 2 && rand < 0.5) {
      type = EnemyType.Fast;
    }

    this.enemies.push(new Enemy(x, -50, type));
  }

  spawnPowerUp(): void {
    const x = Math.random() * (this.canvas.width - 30);
    const types = [PowerUpType.Shield, PowerUpType.MultiShot, PowerUpType.SpeedBoost];
    const type = types[Math.floor(Math.random() * types.length)];
    this.powerUps.push(new PowerUp(x, -30, type));
  }

  checkCollisions(): void {
    // Bullets vs Enemies
    this.bullets.forEach((bullet, bulletIndex) => {
      this.enemies.forEach((enemy, enemyIndex) => {
        if (bullet.collidesWith(enemy)) {
          const killed = enemy.takeDamage();
          if (killed) {
            this.stats.score += enemy.points;
            this.stats.enemiesKilled++;
            this.onScoreUpdate?.(this.stats.score);
            this.createExplosion(enemy.position.x + enemy.size.width / 2, enemy.position.y + enemy.size.height / 2);
            enemy.active = false;
          }
          bullet.active = false;
        }
      });
    });

    // Player vs Enemies
    if (!this.player.hasShield) {
      this.enemies.forEach((enemy) => {
        if (this.player.collidesWith(enemy)) {
          this.takeDamage();
          enemy.active = false;
          this.createExplosion(enemy.position.x + enemy.size.width / 2, enemy.position.y + enemy.size.height / 2);
        }
      });
    }

    // Player vs PowerUps
    this.powerUps.forEach((powerUp, index) => {
      if (this.player.collidesWith(powerUp)) {
        this.activatePowerUp(powerUp.type);
        powerUp.active = false;
      }
    });

    // Clean up inactive entities
    this.bullets = this.bullets.filter((bullet) => bullet.active);
    this.enemies = this.enemies.filter((enemy) => enemy.active);
    this.powerUps = this.powerUps.filter((powerUp) => powerUp.active);
  }

  activatePowerUp(type: PowerUpType): void {
    switch (type) {
      case PowerUpType.Shield:
        this.player.activateShield();
        break;
      case PowerUpType.MultiShot:
        this.player.activateMultiShot();
        break;
      case PowerUpType.SpeedBoost:
        this.player.activateSpeedBoost();
        break;
    }
  }

  takeDamage(): void {
    if (this.player.hasShield) {
      return;
    }

    this.stats.lives--;
    if (this.stats.lives <= 0) {
      this.gameOver();
    } else {
      // Brief invincibility
      this.player.activateShield(2000);
    }
  }

  createExplosion(x: number, y: number): void {
    for (let i = 0; i < 10; i++) {
      this.particles.push(new Particle(x, y, '#ff8800'));
    }
  }

  setTokenHoldings(tokenBalance: number, nftCount: number): void {
    this.tokenBalance = tokenBalance;
    this.nftCount = nftCount;
  }

  async checkItemDrop(): Promise<void> {
    // This will be called from the component with API client
    if (this.onItemFound) {
      // Trigger item drop check
      this.onItemFound({ tokenBalance: this.tokenBalance, nftCount: this.nftCount });
    }
  }

  gameOver(): void {
    this.state = GameState.GameOver;
    this.onGameOver?.(this.stats);
  }

  render(): void {
    // Clear canvas
    this.ctx.fillStyle = '#000011';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw stars background
    this.drawStars();

    if (this.state === GameState.Playing || this.state === GameState.Paused) {
      // Draw game entities
      this.player.render(this.ctx);
      this.bullets.forEach((bullet) => bullet.render(this.ctx));
      this.enemies.forEach((enemy) => enemy.render(this.ctx));
      this.powerUps.forEach((powerUp) => powerUp.render(this.ctx));
      this.particles.forEach((particle) => particle.render(this.ctx));

      // Draw UI
      this.drawUI();

      if (this.state === GameState.Paused) {
        this.drawPauseScreen();
      }
    } else if (this.state === GameState.Menu) {
      this.drawMenu();
    } else if (this.state === GameState.GameOver) {
      this.drawGameOver();
    }
  }

  drawStars(): void {
    this.ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 50; i++) {
      const x = (i * 37) % this.canvas.width;
      const y = (i * 73 + Date.now() / 10) % this.canvas.height;
      this.ctx.fillRect(x, y, 2, 2);
    }
  }

  drawUI(): void {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '20px Arial';
    this.ctx.textAlign = 'left';
    
    if (this.isCompetitive && this.matchInfo) {
      // Competitive mode UI
      const timeRemaining = Math.ceil(this.getTimeRemaining());
      const minutes = Math.floor(timeRemaining / 60);
      const seconds = timeRemaining % 60;
      
      // Left side - Your score
      this.ctx.fillStyle = '#00ff00';
      this.ctx.fillText(`YOU: ${this.stats.score}`, 10, 30);
      
      // Right side - Opponent score
      this.ctx.fillStyle = '#ff4444';
      this.ctx.textAlign = 'right';
      const opponentName = this.matchInfo.opponentUsername || 
                          this.matchInfo.opponentAddress.slice(0, 8) + '...';
      this.ctx.fillText(`${opponentName}: ${this.opponentScore}`, this.canvas.width - 10, 30);
      
      // Center - Timer
      this.ctx.fillStyle = '#ffff00';
      this.ctx.textAlign = 'center';
      this.ctx.font = '24px Arial';
      this.ctx.fillText(
        `${minutes}:${seconds.toString().padStart(2, '0')}`,
        this.canvas.width / 2,
        35
      );
      
      // Bet amount
      this.ctx.fillStyle = '#ffd700';
      this.ctx.font = '18px Arial';
      this.ctx.fillText(
        `💰 ${this.matchInfo.betAmountSol} SOL`,
        this.canvas.width / 2,
        60
      );
      
      // Lives
      this.ctx.fillStyle = '#ffffff';
      this.ctx.textAlign = 'left';
      this.ctx.font = '20px Arial';
      this.ctx.fillText(`Lives: ${this.stats.lives}`, 10, 90);
    } else {
      // Single player UI
      this.ctx.textAlign = 'left';
      this.ctx.fillText(`Score: ${this.stats.score}`, 10, 30);
      this.ctx.fillText(`Level: ${this.stats.level}`, 10, 60);
      this.ctx.fillText(`Lives: ${this.stats.lives}`, 10, 90);
    }

    // Power-up indicators
    if (this.player.hasShield) {
      this.ctx.fillStyle = '#00ffff';
      this.ctx.fillText('🛡️', this.canvas.width - 100, 30);
    }
    if (this.player.multiShot) {
      this.ctx.fillStyle = '#ffff00';
      this.ctx.fillText('💥', this.canvas.width - 70, 30);
    }
    if (this.player.maxSpeed > 5) {
      this.ctx.fillStyle = '#00ff00';
      this.ctx.fillText('⚡', this.canvas.width - 40, 30);
    }
  }

  drawMenu(): void {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '48px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('SOLANA DEFENDER', this.canvas.width / 2, this.canvas.height / 2 - 50);
    
    this.ctx.font = '24px Arial';
    this.ctx.fillText('Press SPACE to Start', this.canvas.width / 2, this.canvas.height / 2 + 50);
  }

  drawPauseScreen(): void {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '48px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('PAUSED', this.canvas.width / 2, this.canvas.height / 2);
  }

  drawGameOver(): void {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '48px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 50);
    
    this.ctx.font = '24px Arial';
    this.ctx.fillText(`Final Score: ${this.stats.score}`, this.canvas.width / 2, this.canvas.height / 2 + 20);
    this.ctx.fillText(`Level Reached: ${this.stats.level}`, this.canvas.width / 2, this.canvas.height / 2 + 50);
  }
}

