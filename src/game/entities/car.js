const DEFAULT_SPEED = 0.12;

export class Car {
  constructor({ id, x, y, sprite, speed = DEFAULT_SPEED, worldWidth = 960 }) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.sprite = sprite;
    this.speed = speed;
    this.direction = Math.random() > 0.5 ? 1 : -1;
    this.worldWidth = worldWidth;
  }

  update(delta) {
    const safeDelta = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 1000)) : 0;
    const distance = this.speed * safeDelta * this.direction;
    this.x += distance;

    if (this.x < -32) {
      this.x = this.worldWidth + 32;
    } else if (this.x > this.worldWidth + 32) {
      this.x = -32;
    }
  }

  draw(ctx) {
    if (!ctx) {
      return;
    }

    ctx.save();
    if (this.sprite && this.sprite.complete) {
      const frameWidth = this.sprite.width / 4 || 64;
      const frameHeight = this.sprite.height || 32;
      ctx.drawImage(
        this.sprite,
        0,
        0,
        frameWidth,
        frameHeight,
        this.x - frameWidth / 2,
        this.y - frameHeight / 2,
        frameWidth,
        frameHeight
      );
    } else {
      ctx.fillStyle = '#888';
      ctx.fillRect(this.x - 24, this.y - 12, 48, 24);
    }
    ctx.restore();
  }
}
