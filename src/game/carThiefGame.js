import { HUD } from './ui/hud.js';
import { Car } from './entities/car.js';
import { difficultyProgression, missionCatalog, lootTable, scoringRules } from './data/balance.js';

const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;
const LOOT_RESPAWN_TIME = 15000;

export class CarThiefGame {
  constructor({ canvas, context, assets }) {
    this.canvas = canvas;
    this.context = context;
    this.assets = assets;

    this.hud = new HUD();
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
      pointer: { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 },
    };

    this.inputState = {
      keys: new Set(),
      pointerActive: false,
    };

    if (this.canvas) {
      this.canvas.width = GAME_WIDTH;
      this.canvas.height = GAME_HEIGHT;
    }
  }

  startGame() {
    this.spawnCars();
    this.assignMission();
    this.timers.lootRespawn = LOOT_RESPAWN_TIME;
    this.hud.pushMessage('Gear up! First job is live.');
  }

  spawnCars() {
    this.cars = Array.from({ length: 4 }, (_, index) =>
      new Car({
        id: `traffic-${index}`,
        x: Math.random() * GAME_WIDTH,
        y: 180 + index * 60,
        sprite: this.assets?.sprites?.cars,
        speed: 0.08 + Math.random() * 0.12,
        worldWidth: GAME_WIDTH,
      })
    );
  }

  assignMission() {
    const nextMission = missionCatalog[Math.floor(Math.random() * missionCatalog.length)];
    const progression = difficultyProgression[this.player.levelIndex] ?? difficultyProgression.at(-1);
    const duration = Math.max(15000, nextMission.baseDuration * Math.max(0.4, 1 - this.player.combo * 0.05));

    this.player.activeMission = {
      ...nextMission,
      payout: scoringRules.missionBonus * (1 + this.player.combo * scoringRules.comboMultiplierStep),
      duration,
      lootMultiplier: progression.lootMultiplier,
    };
    this.timers.missionTotal = this.player.activeMission.duration;
    this.timers.missionCountdown = this.player.activeMission.duration;
    this.hud.pushMessage(`Mission started: ${nextMission.displayName}`);
  }

  handleKeyDown(key) {
    this.inputState.keys.add(key);
  }

  handleKeyUp(key) {
    this.inputState.keys.delete(key);
  }

  handlePointerMove(x, y) {
    this.player.pointer = { x, y };
  }

  handlePointerDown() {
    this.inputState.pointerActive = true;
  }

  handlePointerUp() {
    this.inputState.pointerActive = false;
  }

  update(delta) {
    const seconds = delta / 1000;
    const progression = difficultyProgression[this.player.levelIndex] ?? difficultyProgression.at(-1);

    this.timers.elapsed += delta;
    this.timers.missionCountdown = Math.max(0, this.timers.missionCountdown - delta);
    this.timers.lootRespawn -= delta;

    if (this.timers.lootRespawn <= 0) {
      this.spawnLoot();
      this.timers.lootRespawn = LOOT_RESPAWN_TIME;
    }

    this.hud.update();

    const movement = this.getMovementInput();
    this.player.pointer.x = Math.max(0, Math.min(GAME_WIDTH, this.player.pointer.x + movement.x * delta));
    this.player.pointer.y = Math.max(0, Math.min(GAME_HEIGHT, this.player.pointer.y + movement.y * delta));

    if (this.inputState.pointerActive) {
      this.collectNearbyLoot();
    }

    this.cars.forEach((car) => car.update(delta));

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
    this.loot.push({
      ...lootChoice,
      x: 120 + Math.random() * (GAME_WIDTH - 240),
      y: 240 + Math.random() * 180,
      value: lootChoice.baseValue * (1 + this.player.combo * scoringRules.comboMultiplierStep),
    });
    this.hud.pushMessage(`Loot spotted: ${lootChoice.label}`);
  }

  collectNearbyLoot() {
    const radius = 48;
    this.loot = this.loot.filter((drop) => {
      const distance = Math.hypot(drop.x - this.player.pointer.x, drop.y - this.player.pointer.y);
      if (distance <= radius) {
        this.player.cash += drop.value;
        this.player.combo += 1;
        this.player.heat = Math.min(1, this.player.heat + drop.heat);
        this.hud.pushMessage(`Scooped ${drop.label}!`);
        return false;
      }
      return true;
    });
  }

  completeMission(success) {
    if (!this.player.activeMission) {
      return;
    }

    if (success) {
      const payout = this.player.activeMission.payout + scoringRules.baseLootValue * this.player.activeMission.lootMultiplier;
      this.player.cash += payout;
      this.player.combo += 1;
      this.hud.pushMessage(`Mission success! +$${payout.toFixed(0)}`);
    } else {
      this.player.combo = 0;
      this.player.stamina = Math.max(0, this.player.stamina - 15);
      this.hud.pushMessage('Mission failed. Regroup and try again.');
    }

    this.player.activeMission = null;
    this.progressDifficulty();
    this.assignMission();
  }

  progressDifficulty() {
    if (this.player.levelIndex < difficultyProgression.length - 1) {
      const nextThreshold = 15000 * (this.player.levelIndex + 1);
      if (this.player.cash >= nextThreshold) {
        this.player.levelIndex += 1;
        this.hud.pushMessage(`New rank unlocked: ${difficultyProgression[this.player.levelIndex].name}`);
      }
    }
  }

  getMovementInput() {
    const speed = 0.25;
    const dir = { x: 0, y: 0 };
    if (this.inputState.keys.has('ArrowLeft') || this.inputState.keys.has('a')) {
      dir.x -= speed;
    }
    if (this.inputState.keys.has('ArrowRight') || this.inputState.keys.has('d')) {
      dir.x += speed;
    }
    if (this.inputState.keys.has('ArrowUp') || this.inputState.keys.has('w')) {
      dir.y -= speed;
    }
    if (this.inputState.keys.has('ArrowDown') || this.inputState.keys.has('s')) {
      dir.y += speed;
    }
    return dir;
  }

  render() {
    if (!this.context) {
      return;
    }

    const ctx = this.context;
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.drawBackground(ctx);
    this.cars.forEach((car) => car.draw(ctx));
    this.drawLoot(ctx);
    this.drawPointer(ctx);
    this.drawMissionStatus(ctx);
    this.hud.draw(ctx, { player: this.player, timers: this.timers });
  }

  drawBackground(ctx) {
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.fillStyle = '#1f1f1f';
    for (let y = 120; y < GAME_HEIGHT; y += 48) {
      ctx.fillRect(0, y, GAME_WIDTH, 24);
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

  drawMissionStatus(ctx) {
    const mission = this.player.activeMission;
    if (!mission) {
      return;
    }

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(GAME_WIDTH - 260, 16, 244, 96);

    if (this.assets?.sprites?.mission?.complete) {
      ctx.drawImage(this.assets.sprites.mission, GAME_WIDTH - 248, 24, 64, 64);
    } else {
      ctx.fillStyle = '#ff6f61';
      ctx.fillRect(GAME_WIDTH - 248, 24, 64, 64);
    }

    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.fillText(mission.displayName, GAME_WIDTH - 176, 40);
    ctx.font = '12px sans-serif';
    ctx.fillText(mission.description, GAME_WIDTH - 176, 60, 150);
    ctx.fillText(`Reward: $${mission.payout.toFixed(0)}`, GAME_WIDTH - 176, 80);
    ctx.fillText(`Loot x${mission.lootMultiplier.toFixed(2)}`, GAME_WIDTH - 176, 96);

    ctx.restore();
  }
}
