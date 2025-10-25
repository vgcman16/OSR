import { createCarThiefGame } from './game/carThief/index.js';

let gameInstance = null;

function initGame() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) {
    console.warn('Game canvas not found.');
    return null;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    console.error('Canvas context unavailable.');
    return null;
  }

  gameInstance = createCarThiefGame({ canvas, context });
  gameInstance.boot();
  gameInstance.start();

  window.dispatchEvent(
    new CustomEvent('osr:init', {
      detail: { canvas, context, game: gameInstance },
    }),
  );

  return gameInstance;
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.readyState === 'loading') {
    window.addEventListener('load', initGame, { once: true });
  }
  initGame();
});

export { initGame };
