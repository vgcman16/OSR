import { HUD } from './ui/hud.js';
import { Car } from './entities/car.js';
import {
  difficultyProgression,
  missionCatalog,
  lootTable,
  scoringRules,
  getLastDifficultyTier,
} from './data/balance.js';

const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;
const LOOT_RESPAWN_TIME = 15000;
const POINTER_SPEED = 0.25;
const LOOT_COLLECTION_RADIUS = 48;
const COLLECT_KEYS = new Set([' ', 'Spacebar', 'Space']);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getProgression(levelIndex) {
  return difficultyProgression[levelIndex] ?? getLastDifficultyTier();
}

function chooseNextMission(previousMissionId) {
  const pool = missionCatalog.filter((mission) => mission.id !== previousMissionId);
  const source = pool.length ? pool : missionCatalog;
  return source[Math.floor(Math.random() * source.length)];
}

export class CarThiefGame {
  constructor({ canvas, context, assets } = {}) {
    this.canvas = canvas ?? null;
    this.context = context ?? canvas?.getContext?.('2d') ?? null;
    this.assets = assets ?? {};
    this.hud = new HUD();

    this.resizeCanvas(GAME_WIDTH, GAME_HEIGHT);
    this.resetGameState();
  }

  setAssets(assets) {
    this.assets = assets ?? {};
  }

  resizeCanvas(width = GAME_WIDTH, height = GAME_HEIGHT) {
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  getWorldWidth() {
    return this.canvas?.width ?? GAME_WIDTH;
  }

  getWorldHeight() {
    return this.canvas?.height ?? GAME_HEIGHT;
  }

  resetGameState() {
    const width = this.getWorldWidth();
    const height = this.getWorldHeight();

    this.cars = [];
    this.loot = [];
    this.effects = [];
    this.timers = {
      missionCountdown: 0,
      missionTotal: 1,
      policeAlert: 0,
      lootRespawn: 0,
      elapsed: 0,
    };

    this.player = {
      stamina: 100,
      heat: 0,
      notoriety: 0,
      cash: 0,
      combo: 0,
      levelIndex: 0,
      activeMission: null,
      pointer: { x: width / 2, y: height / 2 },
    };

    this.inputState = {
      keys: new Set(),
      pointerActive: false,
    };

    this.lastMissionId = null;
    this.running = false;
    if (typeof this.hud.reset === 'function') {
      this.hud.reset();
    }
  }

  startGame() {
    this.resetGameState();
    this.spawnCars();
    this.assignMission();
    this.timers.lootRespawn = LOOT_RESPAWN_TIME;
    this.running = true;
    this.hud.pushMessage('Gear up! First job is live.');
  }

  stopGame() {
    this.running = false;
  }

  isRunning() {
    return this.running;
  }

  spawnCars() {
    const worldWidth = this.getWorldWidth();
    this.cars = Array.from({ length: 4 }, (_, index) =>
      new Car({
        id: `traffic-${index}`,
        x: Math.random() * worldWidth,
        y: 180 + index * 60,
        sprite: this.assets?.sprites?.cars,
        speed: 0.08 + Math.random() * 0.12,
        worldWidth,
      })
    );
  }

  assignMission() {
    const nextMission = chooseNextMission(this.lastMissionId);
    this.lastMissionId = nextMission.id;

    const progression = getProgression(this.player.levelIndex);
    const duration = Math.max(
      15000,
      nextMission.baseDuration * Math.max(0.4, 1 - this.player.combo * 0.05)
    );
    const lootTarget = Math.max(1, nextMission.lootTarget ?? 1);

    this.player.activeMission = {
      ...nextMission,
      payout:
        scoringRules.missionBonus * (1 + this.player.combo * scoringRules.comboMultiplierStep),
      duration,
      lootTarget,
      lootCollected: 0,
      lootMultiplier: progression.lootMultiplier,
    };

    this.timers.missionTotal = duration;
    this.timers.missionCountdown = duration;
    this.hud.pushMessage(
      `Mission started: ${nextMission.displayName} (grab ${lootTarget} haul${
        lootTarget > 1 ? 's' : ''
      })`
    );
  }

  handleKeyDown(key) {
    this.inputState.keys.add(key);
  }

  handleKeyUp(key) {
    this.inputState.keys.delete(key);
  }

  handlePointerMove(x, y) {
    this.player.pointer = {
      x: clamp(x, 0, this.getWorldWidth()),
      y: clamp(y, 0, this.getWorldHeight()),
    };
  }

  handlePointerDown() {
    this.inputState.pointerActive = true;
  }

  handlePointerUp() {
    this.inputState.pointerActive = false;
  }

  update(delta) {
    this.hud.update();

    if (!this.running) {
      return;
    }

    const safeDelta = Number.isFinite(delta) ? clamp(delta, 0, 1000) : 0;
    const seconds = safeDelta / 1000;
    const progression = getProgression(this.player.levelIndex);

    this.timers.elapsed += safeDelta;
    this.timers.missionCountdown = Math.max(0, this.timers.missionCountdown - safeDelta);
    this.timers.lootRespawn -= safeDelta;

    while (this.timers.lootRespawn <= 0) {
      this.spawnLoot();
      this.timers.lootRespawn += LOOT_RESPAWN_TIME;
    }

    const movement = this.getMovementInput();
    this.player.pointer.x = clamp(
      this.player.pointer.x + movement.x * safeDelta,
      0,
      this.getWorldWidth()
    );
    this.player.pointer.y = clamp(
      this.player.pointer.y + movement.y * safeDelta,
      0,
      this.getWorldHeight()
    );

    if (this.inputState.pointerActive || this.isCollectKeyPressed()) {
      this.collectNearbyLoot();
    }

    this.cars.forEach((car) => car.update(safeDelta));

    this.player.heat = Math.min(1, this.player.heat + seconds * 0.02);
    if (this.player.heat > progression.policeAlertThreshold) {
      this.triggerPoliceAlert();
    }

    if (this.timers.missionCountdown === 0) {
      this.completeMission(false);
    }
  }

  triggerPoliceAlert() {
    if (this.assets?.audio?.policeAlert && this.assets.audio.policeAlert.paused) {
      this.assets.audio.policeAlert.currentTime = 0;
      this.assets.audio.policeAlert.play().catch(() => {});
    }

    this.hud.pushMessage('Police scanners buzzing! Lay low.');
    this.player.heat = 0.25;
    this.player.notoriety = Math.min(1, this.player.notoriety + 0.1);
  }

  spawnLoot() {
    const lootChoice = lootTable[Math.floor(Math.random() * lootTable.length)];
    const width = this.getWorldWidth();
    const height = this.getWorldHeight();
    const marginX = Math.min(120, width / 4);
    const marginY = Math.min(180, height / 4);
    const xRange = Math.max(0, width - marginX * 2);
    const yRange = Math.max(0, height - marginY * 2);

    this.loot.push({
      ...lootChoice,
      x: marginX + (xRange > 0 ? Math.random() * xRange : 0),
      y: marginY + (yRange > 0 ? Math.random() * yRange : 0),
      value: lootChoice.baseValue * (1 + this.player.combo * scoringRules.comboMultiplierStep),
    });
    this.hud.pushMessage(`Loot spotted: ${lootChoice.label}`);
  }

  isCollectKeyPressed() {
    for (const key of COLLECT_KEYS) {
      if (this.inputState.keys.has(key)) {
        return true;
      }
    }
    return false;
  }

  collectNearbyLoot() {
    let missionCompleted = false;
    this.loot = this.loot.filter((drop) => {
      const distance = Math.hypot(drop.x - this.player.pointer.x, drop.y - this.player.pointer.y);
      if (distance <= LOOT_COLLECTION_RADIUS) {
        this.player.cash += drop.value;
        this.player.combo += 1;
        this.player.heat = Math.min(1, this.player.heat + drop.heat);
        this.hud.pushMessage(`Scooped ${drop.label}!`);
        if (this.player.activeMission) {
          this.player.activeMission.lootCollected = Math.min(
            this.player.activeMission.lootTarget,
            (this.player.activeMission.lootCollected ?? 0) + 1
          );
          if (this.player.activeMission.lootCollected >= this.player.activeMission.lootTarget) {
            missionCompleted = true;
          }
        }
        return false;
      }
      return true;
    });

    if (missionCompleted) {
      this.completeMission(true);
    }
  }

  completeMission(success) {
    if (!this.player.activeMission) {
      return;
    }

    if (success) {
      const payout =
        this.player.activeMission.payout +
        scoringRules.baseLootValue * this.player.activeMission.lootMultiplier;
      this.player.cash += payout;
      this.player.combo += 1;
      this.hud.pushMessage(`Mission success! +$${payout.toFixed(0)}`);
    } else {
      this.player.combo = 0;
      this.player.stamina = Math.max(0, this.player.stamina - 15);
      this.hud.pushMessage('Mission failed. Regroup and try again.');
    }

    this.loot = [];
    this.player.activeMission = null;

    if (this.running) {
      this.progressDifficulty();
      this.assignMission();
    }
  }

  progressDifficulty() {
    if (this.player.levelIndex < difficultyProgression.length - 1) {
      const nextThreshold = 15000 * (this.player.levelIndex + 1);
      if (this.player.cash >= nextThreshold) {
        this.player.levelIndex += 1;
        this.hud.pushMessage(
          `New rank unlocked: ${difficultyProgression[this.player.levelIndex].name}`
        );
      }
    }
  }

  getMovementInput() {
    const dir = { x: 0, y: 0 };
    if (this.inputState.keys.has('ArrowLeft') || this.inputState.keys.has('a')) {
      dir.x -= POINTER_SPEED;
    }
    if (this.inputState.keys.has('ArrowRight') || this.inputState.keys.has('d')) {
      dir.x += POINTER_SPEED;
    }
    if (this.inputState.keys.has('ArrowUp') || this.inputState.keys.has('w')) {
      dir.y -= POINTER_SPEED;
    }
    if (this.inputState.keys.has('ArrowDown') || this.inputState.keys.has('s')) {
      dir.y += POINTER_SPEED;
    }
    return dir;
  }

  render() {
    if (!this.context) {
      return;
    }

    const ctx = this.context;
    const width = this.getWorldWidth();
    const height = this.getWorldHeight();
    ctx.clearRect(0, 0, width, height);

    this.drawBackground(ctx, width, height);
    this.cars.forEach((car) => car.draw(ctx));
    this.drawLoot(ctx);
    this.drawPointer(ctx);
    this.drawMissionStatus(ctx, width);
    this.hud.draw(ctx, { player: this.player, timers: this.timers });
  }

  drawBackground(ctx, width, height) {
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#1f1f1f';
    for (let y = 120; y < height; y += 48) {
      ctx.fillRect(0, y, width, 24);
    }
  }

  drawLoot(ctx) {
    this.loot.forEach((drop) => {
      ctx.save();
      ctx.fillStyle = '#44c7f4';
      if (this.assets?.sprites?.loot?.complete) {
        ctx.drawImage(this.assets.sprites.loot, drop.x - 24, drop.y - 24, 48, 48);
      } else {
        ctx.beginPath();
        ctx.arc(drop.x, drop.y, 16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  drawPointer(ctx) {
    ctx.save();
    ctx.strokeStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(this.player.pointer.x, this.player.pointer.y, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawMissionStatus(ctx, width) {
    const mission = this.player.activeMission;
    if (!mission) {
      return;
    }

    const panelX = Math.max(0, width - 260);

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(panelX, 16, 244, 120);

    if (this.assets?.sprites?.mission?.complete) {
      ctx.drawImage(this.assets.sprites.mission, panelX + 12, 24, 64, 64);
    } else {
      ctx.fillStyle = '#ff6f61';
      ctx.fillRect(panelX + 12, 24, 64, 64);
    }

    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.fillText(mission.displayName, panelX + 84, 40);
    ctx.font = '12px sans-serif';
    ctx.fillText(mission.description, panelX + 84, 60, 150);
    ctx.fillText(`Reward: $${mission.payout.toFixed(0)}`, panelX + 84, 80);
    ctx.fillText(`Loot x${mission.lootMultiplier.toFixed(2)}`, panelX + 84, 96);
    ctx.fillText(
      `Progress: ${(mission.lootCollected ?? 0)}/${mission.lootTarget}`,
      panelX + 84,
      112
    );

    const progressRatio = Math.min(1, (mission.lootCollected ?? 0) / mission.lootTarget);
    ctx.fillStyle = '#333';
    ctx.fillRect(panelX + 84, 120, 150, 10);
    ctx.fillStyle = '#66ff66';
    ctx.fillRect(panelX + 84, 120, 150 * progressRatio, 10);

    ctx.restore();
  }

  destroy() {
    this.stopGame();
    this.resetGameState();
  }
}

export default CarThiefGame;
