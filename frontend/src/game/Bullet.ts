import { Entity } from './Entity.js';

export class Bullet extends Entity {
  speed: number = 8;
  damage: number = 1;

  constructor(x: number, y: number) {
    super(x, y, 4, 10);
  }

  update(deltaTime: number): void {
    this.position.y -= this.speed * deltaTime * 60; // Normalize to 60fps
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(this.position.x, this.position.y, this.size.width, this.size.height);
    
    // Glow effect
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00ffff';
    ctx.fillRect(this.position.x, this.position.y, this.size.width, this.size.height);
    ctx.shadowBlur = 0;
  }
}



