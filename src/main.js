import CarThiefGame from './game/carThiefGame.js';
import { bindGameInput } from './game/input.js';
import { createFrameScheduler } from './game/loop/frameScheduler.js';

function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    const resolveImage = () => resolve(image);
    image.onload = resolveImage;
    image.onerror = resolveImage;
    image.src = src;
  });
}

function loadAudio(src) {
  return new Promise((resolve) => {
    const audio = new Audio();
    const cleanup = () => {
      audio.removeEventListener('canplaythrough', handleReady);
      audio.removeEventListener('error', handleReady);
    };
    const handleReady = () => {
      cleanup();
      resolve(audio);
    };
    audio.addEventListener('canplaythrough', handleReady, { once: true });
    audio.addEventListener('error', handleReady, { once: true });
    audio.preload = 'auto';
    audio.src = src;
    audio.volume = 0.5;
    if (audio.readyState >= 2) {
      cleanup();
      resolve(audio);
    }
  });
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

  const detachInput = bindGameInput(game, canvas);

  game.startGame();
  game.render();

  let lastTimestamp = 0;
  const scheduler = createFrameScheduler((timestamp) => {
    const currentTime = Number.isFinite(timestamp) ? timestamp : scheduler.getNow();
    if (!lastTimestamp) {
      lastTimestamp = currentTime;
      return;
    }

    const delta = currentTime - lastTimestamp;
    lastTimestamp = currentTime;
    game.update(delta);
    game.render();
  });

  const handleVisibilityChange = () => {
    if (document.hidden) {
      scheduler.stop();
    } else {
      lastTimestamp = scheduler.getNow();
      scheduler.start();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  let disposed = false;
  const teardown = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    scheduler.stop();
    detachInput();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', teardown);
    game.stopGame();
  };

  window.addEventListener('beforeunload', teardown);

  lastTimestamp = scheduler.getNow();
  scheduler.start();

  if (!window.__carThiefGame) {
    window.__carThiefGame = game;
  }
}

function run() {
  bootstrap().catch((error) => {
    console.error('Failed to bootstrap Car Thief Game', error);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', run, { once: true });
} else {
  run();
}
