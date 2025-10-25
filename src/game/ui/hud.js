const BAR_WIDTH = 180;
const BAR_HEIGHT = 12;

function drawBar(ctx, label, value, max, x, y, color) {
  const safeMax = max > 0 ? max : 1;
  ctx.fillStyle = '#fff';
  ctx.font = '12px sans-serif';
  ctx.fillText(label, x, y - 4);
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(x, y, BAR_WIDTH, BAR_HEIGHT);
  ctx.fillStyle = color;
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  ctx.fillRect(x + 1, y + 1, ratio * (BAR_WIDTH - 2), BAR_HEIGHT - 2);
}

export class HUD {
  constructor() {
    this.messages = [];
  }

  pushMessage(message, duration = 3000) {
    const timestamp = globalThis.performance?.now?.() ?? Date.now();
    this.messages.push({ message, duration, timestamp });
  }

  update() {
    const now = globalThis.performance?.now?.() ?? Date.now();
    this.messages = this.messages.filter(({ timestamp, duration }) => now - timestamp < duration);
  }

  draw(ctx, state) {
    if (!ctx) {
      return;
    }

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(12, 12, 220, 120);

    drawBar(ctx, 'Stamina', state.player.stamina, 100, 24, 40, '#66ff66');
    drawBar(ctx, 'Heat', state.player.heat * 100, 100, 24, 64, '#ff5555');
    drawBar(ctx, 'Mission Timer', state.timers.missionCountdown, state.timers.missionTotal, 24, 88, '#ffd966');

    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.fillText(`Cash: $${state.player.cash.toFixed(0)}`, 24, 116);
    ctx.fillText(`Notoriety: ${(state.player.notoriety * 100).toFixed(0)}%`, 24, 132);

    this.messages.forEach(({ message }, index) => {
      ctx.fillText(message, 24, 156 + index * 16);
    });

    ctx.restore();
  }
}
