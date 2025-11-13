export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export abstract class Entity {
  position: Position;
  size: Size;
  active: boolean = true;

  constructor(x: number, y: number, width: number, height: number) {
    this.position = { x, y };
    this.size = { width, height };
  }

  abstract update(deltaTime: number): void;
  abstract render(ctx: CanvasRenderingContext2D): void;

  getBounds() {
    return {
      x: this.position.x,
      y: this.position.y,
      width: this.size.width,
      height: this.size.height,
    };
  }

  collidesWith(other: Entity): boolean {
    return (
      this.position.x < other.position.x + other.size.width &&
      this.position.x + this.size.width > other.position.x &&
      this.position.y < other.position.y + other.size.height &&
      this.position.y + this.size.height > other.position.y
    );
  }
}

