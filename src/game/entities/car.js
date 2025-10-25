export class Car {
  constructor({ id, x, y, width = 72, height = 32, color = '#ffcc00', sprite = null, speed = 0.15 }) {
    this.id = id;
    this.position = { x, y };
    this.size = { width, height };
    this.color = color;
    this.sprite = sprite;
    this.speed = speed;
    this.direction = Math.random() > 0.5 ? 1 : -1;
  }

  update(delta) {
    this.position.x += this.speed * this.direction * delta;
    if (this.position.x < -this.size.width) {
      this.position.x = 800 + this.size.width;
    } else if (this.position.x > 800 + this.size.width) {
      this.position.x = -this.size.width;
    }
  }

  draw(ctx) {
    if (!ctx) {
      return;
    }

    if (this.sprite && this.sprite.complete) {
      ctx.drawImage(
        this.sprite,
        this.position.x,
        this.position.y,
        this.size.width,
        this.size.height
      );
      return;
    }

    ctx.fillStyle = this.color;
    ctx.fillRect(this.position.x, this.position.y, this.size.width, this.size.height);
    ctx.fillStyle = '#111';
    ctx.fillRect(this.position.x + 4, this.position.y + 4, 12, 8);
    ctx.fillRect(this.position.x + this.size.width - 16, this.position.y + 4, 12, 8);
  }
}
