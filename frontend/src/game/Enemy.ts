import { Entity } from './Entity.js';

export enum EnemyType {
  Basic = 'basic',
  Fast = 'fast',
  Tank = 'tank',
}

export class Enemy extends Entity {
  type: EnemyType;
  speed: number;
  health: number;
  points: number;

  constructor(x: number, y: number, type: EnemyType = EnemyType.Basic) {
    const size = type === EnemyType.Tank ? 50 : type === EnemyType.Fast ? 25 : 35;
    super(x, y, size, size);

    this.type = type;
    
    switch (type) {
      case EnemyType.Fast:
        this.speed = 2;
        this.health = 1;
        this.points = 20;
        break;
      case EnemyType.Tank:
        this.speed = 0.8;
        this.health = 3;
        this.points = 50;
        break;
      default:
        this.speed = 1.5;
        this.health = 1;
        this.points = 10;
    }
  }

  update(deltaTime: number): void {
    this.position.y += this.speed * deltaTime * 60; // Normalize to 60fps
  }

  render(ctx: CanvasRenderingContext2D): void {
    const centerX = this.position.x + this.size.width / 2;
    const centerY = this.position.y + this.size.height / 2;

    // Color based on type
    if (this.type === EnemyType.Fast) {
      ctx.fillStyle = '#ff00ff';
    } else if (this.type === EnemyType.Tank) {
      ctx.fillStyle = '#ff0000';
    } else {
      ctx.fillStyle = '#ff8800';
    }

    // Draw enemy shape
    ctx.beginPath();
    ctx.moveTo(centerX, this.position.y);
    ctx.lineTo(this.position.x, centerY);
    ctx.lineTo(centerX, this.position.y + this.size.height);
    ctx.lineTo(this.position.x + this.size.width, centerY);
    ctx.closePath();
    ctx.fill();

    // Draw health indicator for tanks
    if (this.type === EnemyType.Tank && this.health > 1) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${this.health}`, centerX, centerY + 4);
    }
  }

  takeDamage(): boolean {
    this.health--;
    return this.health <= 0;
  }
}



