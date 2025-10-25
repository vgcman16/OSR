import { createInitialGameState } from './state/gameState.js';
import { MissionSystem } from './systems/missionSystem.js';
import { HeatSystem } from './systems/heatSystem.js';
import { EconomySystem } from './systems/economySystem.js';
import { GameLoop } from './loop/gameLoop.js';

const createCarThiefGame = ({ canvas, context }) => {
  const state = createInitialGameState();
  const missionSystem = new MissionSystem(state);
  const heatSystem = new HeatSystem(state);
  const economySystem = new EconomySystem(state);

  const renderHud = () => {
    if (!context || !canvas) {
      return;
    }

    context.fillStyle = '#121822';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = '#78beff';
    context.font = '20px "Segoe UI", sans-serif';
    context.textAlign = 'left';
    context.fillText(`City: ${state.city.name}`, 32, 48);
    context.fillText(`Day ${state.day}`, 32, 78);
    context.fillText(`Funds: $${state.funds.toLocaleString()}`, 32, 108);
    context.fillText(`Heat: ${state.heat.toFixed(2)}`, 32, 138);

    context.fillStyle = '#d1eaff';
    context.font = '16px "Segoe UI", sans-serif';
    context.fillText('Crew:', 32, 182);
    state.crew.forEach((member, index) => {
      context.fillText(`- ${member.name} (${member.specialty})`, 48, 212 + index * 26);
    });

    context.fillText('Active Contracts:', 420, 182);
    missionSystem.availableMissions.forEach((mission, index) => {
      context.fillText(`${mission.name} — $${mission.payout.toLocaleString()}`, 420, 212 + index * 26);
    });
  };

  const loop = new GameLoop({
    update: (delta) => {
      missionSystem.update(delta);
      heatSystem.update(delta);
      economySystem.update(delta);
    },
    render: renderHud,
  });

  const boot = () => {
    missionSystem.generateInitialContracts();
    loop.attachCanvas(canvas);
    renderHud();
  };

  const start = () => loop.start();
  const stop = () => loop.stop();

  return {
    state,
    systems: {
      mission: missionSystem,
      heat: heatSystem,
      economy: economySystem,
    },
    loop,
    boot,
    start,
    stop,
  };
};

export { createCarThiefGame };
