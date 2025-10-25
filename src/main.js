import { CarThiefGame } from './game/carThiefGame.js';

function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(image);
    image.src = src;
  });
}

async function loadAudio(src) {
  const audio = new Audio(src);
  await audio.load?.();
  audio.volume = 0.5;
  return audio;
}

async function bootstrap() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) {
    throw new Error('Canvas element with id "game-canvas" not found');
  }
  const context = canvas.getContext('2d');

  const [carsSprite, lootSprite, missionSprite] = await Promise.all([
    loadImage('assets/sprites/cars.svg'),
    loadImage('assets/sprites/loot.svg'),
    loadImage('assets/sprites/mission.svg'),
  ]);

  const [policeAlertAudio] = await Promise.all([
    loadAudio('assets/audio/policeAlert.ogg'),
  ]);

  const game = new CarThiefGame({
    canvas,
    context,
    assets: {
      sprites: {
        cars: carsSprite,
        loot: lootSprite,
        mission: missionSprite,
      },
      audio: {
        policeAlert: policeAlertAudio,
      },
    },
  });

  wireInputHandlers(game, canvas);
  game.startGame();

  const getNow = () => globalThis.performance?.now?.() ?? Date.now();
  const scheduleFrame =
    globalThis.requestAnimationFrame?.bind(globalThis) ?? ((cb) => globalThis.setTimeout(() => cb(getNow()), 16));

  let lastTimestamp = getNow();
  function frame(timestamp) {
    const currentTime = Number.isFinite(timestamp) ? timestamp : getNow();
    const delta = currentTime - lastTimestamp;
    lastTimestamp = currentTime;
    game.update(delta);
    game.render();
    scheduleFrame(frame);
  }

  scheduleFrame(frame);
}

function wireInputHandlers(game, canvas) {
  window.addEventListener('keydown', (event) => {
    game.handleKeyDown(event.key);
  });

  window.addEventListener('keyup', (event) => {
    game.handleKeyUp(event.key);
  });

  canvas.addEventListener('pointerdown', () => game.handlePointerDown());
  canvas.addEventListener('pointerup', () => game.handlePointerUp());
  canvas.addEventListener('pointerleave', () => game.handlePointerUp());
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    game.handlePointerMove(x, y);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
