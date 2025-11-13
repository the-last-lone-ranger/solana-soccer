import { Entity } from './Entity.js';

export class Player extends Entity {
  speed: number = 300; // pixels per second
  velocity: number = 0;
  maxSpeed: number = 300; // pixels per second
  hasShield: boolean = false;
  shieldTime: number = 0;
  multiShot: boolean = false;
  multiShotTime: number = 0;

  constructor(x: number, y: number) {
    super(x, y, 40, 40);
  }

  update(deltaTime: number): void {
    // Update position based on velocity
    this.position.x += this.velocity * deltaTime;

    // Keep player in bounds and stop velocity if hitting boundary
    if (this.position.x < 0) {
      this.position.x = 0;
      if (this.velocity < 0) {
        this.velocity = 0;
      }
    }
    if (this.position.x > 800 - this.size.width) {
      this.position.x = 800 - this.size.width;
      if (this.velocity > 0) {
        this.velocity = 0;
      }
    }

    // Update power-up timers
    if (this.hasShield) {
      this.shieldTime -= deltaTime;
      if (this.shieldTime <= 0) {
        this.hasShield = false;
      }
    }

    if (this.multiShot) {
      this.multiShotTime -= deltaTime;
      if (this.multiShotTime <= 0) {
        this.multiShot = false;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    // Draw shield if active
    if (this.hasShield) {
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        this.position.x + this.size.width / 2,
        this.position.y + this.size.height / 2,
        this.size.width / 2 + 5,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }

    // Draw player ship
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.moveTo(this.position.x + this.size.width / 2, this.position.y);
    ctx.lineTo(this.position.x, this.position.y + this.size.height);
    ctx.lineTo(this.position.x + this.size.width / 2, this.position.y + this.size.height - 10);
    ctx.lineTo(this.position.x + this.size.width, this.position.y + this.size.height);
    ctx.closePath();
    ctx.fill();

    // Draw engine glow
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(
      this.position.x + this.size.width / 2 - 3,
      this.position.y + this.size.height - 8,
      6,
      8
    );
  }

  moveLeft(): void {
    this.velocity = -this.maxSpeed;
  }

  moveRight(): void {
    this.velocity = this.maxSpeed;
  }

  stop(): void {
    this.velocity = 0;
  }

  activateShield(duration: number = 10000): void {
    this.hasShield = true;
    this.shieldTime = duration;
  }

  activateMultiShot(duration: number = 10000): void {
    this.multiShot = true;
    this.multiShotTime = duration;
  }

  activateSpeedBoost(duration: number = 10000): void {
    this.maxSpeed = 450; // 50% speed boost
    setTimeout(() => {
      this.maxSpeed = 300;
    }, duration);
  }
}

