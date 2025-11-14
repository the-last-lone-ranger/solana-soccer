import { Entity } from './Entity.js';

export enum PowerUpType {
  Shield = 'shield',
  MultiShot = 'multishot',
  SpeedBoost = 'speedboost',
}

export class PowerUp extends Entity {
  type: PowerUpType;
  speed: number = 1.5;
  rotation: number = 0;

  constructor(x: number, y: number, type: PowerUpType) {
    super(x, y, 30, 30);
    this.type = type;
  }

  update(deltaTime: number): void {
    this.position.y += this.speed * deltaTime * 60;
    this.rotation += deltaTime * 3;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const centerX = this.position.x + this.size.width / 2;
    const centerY = this.position.y + this.size.height / 2;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(this.rotation);

    // Color based on type
    switch (this.type) {
      case PowerUpType.Shield:
        ctx.fillStyle = '#00ffff';
        break;
      case PowerUpType.MultiShot:
        ctx.fillStyle = '#ffff00';
        break;
      case PowerUpType.SpeedBoost:
        ctx.fillStyle = '#00ff00';
        break;
    }

    // Draw power-up icon
    ctx.beginPath();
    ctx.arc(0, 0, this.size.width / 2, 0, Math.PI * 2);
    ctx.fill();

    // Draw symbol
    ctx.fillStyle = '#000000';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    switch (this.type) {
      case PowerUpType.Shield:
        ctx.fillText('S', 0, 0);
        break;
      case PowerUpType.MultiShot:
        ctx.fillText('M', 0, 0);
        break;
      case PowerUpType.SpeedBoost:
        ctx.fillText('⚡', 0, 0);
        break;
    }

    ctx.restore();
  }
}


