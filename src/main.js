function initGame() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) {
    console.warn('Game canvas not found.');
    return;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    console.error('Canvas context unavailable.');
    return;
  }

  context.fillStyle = '#121822';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#78beff';
  context.font = '24px "Segoe UI", sans-serif';
  context.textAlign = 'center';
  context.fillText('Loading Open Source Roguelike...', canvas.width / 2, canvas.height / 2);

  window.dispatchEvent(new CustomEvent('osr:init', { detail: { canvas, context } }));
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.readyState === 'loading') {
    window.addEventListener('load', initGame, { once: true });
  }
  initGame();
});

export { initGame };
