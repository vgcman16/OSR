const MESSAGE_DURATION = 4500;
const MAX_MESSAGES = 5;

function now() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

export class HUD {
  constructor() {
    this.messages = [];
    this.lastUpdate = now();
  }

  pushMessage(text) {
    if (!text) {
      return;
    }
    const timestamp = now();
    this.messages.push({
      id: `${timestamp}-${Math.random().toString(16).slice(2)}`,
      text,
      elapsed: 0,
      ttl: MESSAGE_DURATION,
    });
    if (this.messages.length > MAX_MESSAGES) {
      this.messages = this.messages.slice(-MAX_MESSAGES);
    }
  }

  update() {
    const current = now();
    const delta = Math.max(0, Math.min(1000, current - this.lastUpdate));
    this.lastUpdate = current;

    this.messages = this.messages
      .map((message) => ({ ...message, elapsed: message.elapsed + delta }))
      .filter((message) => message.elapsed < message.ttl);
  }

  draw(ctx, { player, timers }) {
    if (!ctx) {
      return;
    }

    ctx.save();
    this.drawPlayerStats(ctx, player);
    this.drawTimers(ctx, timers);
    this.drawMessages(ctx);
    ctx.restore();
  }

  drawPlayerStats(ctx, player) {
    if (!player) {
      return;
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(16, 16, 200, 120);

    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.fillText(`Cash: $${player.cash.toFixed(0)}`, 24, 40);
    ctx.fillText(`Combo: x${player.combo}`, 24, 60);
    ctx.fillText(`Heat: ${(player.heat * 100).toFixed(0)}%`, 24, 80);
    ctx.fillText(`Notoriety: ${(player.notoriety * 100).toFixed(0)}%`, 24, 100);
    ctx.fillText(`Stamina: ${player.stamina}`, 24, 120);

    this.drawProgressBar(ctx, 24, 130, 168, player.heat, '#ff5b5b');
  }

  drawTimers(ctx, timers) {
    if (!timers) {
      return;
    }

    const countdown = timers.missionCountdown ?? 0;
    const total = timers.missionTotal || 1;
    const ratio = Math.max(0, Math.min(1, countdown / total));

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(16, 152, 200, 36);
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.fillText(`Mission Time: ${(countdown / 1000).toFixed(1)}s`, 24, 174);
    this.drawProgressBar(ctx, 24, 178, 168, ratio, '#66ff66');
  }

  drawMessages(ctx) {
    if (!this.messages.length) {
      return;
    }

    const startY = 520;
    ctx.font = '12px sans-serif';
    this.messages.forEach((message, index) => {
      const opacity = 1 - message.elapsed / message.ttl;
      const y = startY - index * 18;
      ctx.fillStyle = `rgba(0, 0, 0, ${0.6 * opacity})`;
      ctx.fillRect(16, y - 14, 360, 18);
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      ctx.fillText(message.text, 24, y);
    });
  }

  drawProgressBar(ctx, x, y, width, ratio, color) {
    ctx.fillStyle = '#222';
    ctx.fillRect(x, y, width, 6);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width * Math.max(0, Math.min(1, ratio)), 6);
  }
}
