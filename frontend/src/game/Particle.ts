import { Position } from './Entity.js';

export class Particle {
  position: Position;
  velocity: Position;
  life: number;
  maxLife: number;
  size: number;
  color: string;

  constructor(x: number, y: number, color: string = '#ffffff') {
    this.position = { x, y };
    this.velocity = {
      x: (Math.random() - 0.5) * 4,
      y: (Math.random() - 0.5) * 4,
    };
    this.maxLife = 1;
    this.life = this.maxLife;
    this.size = Math.random() * 3 + 1;
    this.color = color;
  }

  update(deltaTime: number): boolean {
    this.position.x += this.velocity.x * deltaTime * 60;
    this.position.y += this.velocity.y * deltaTime * 60;
    this.life -= deltaTime;
    return this.life > 0;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const alpha = this.life / this.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.position.x, this.position.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

