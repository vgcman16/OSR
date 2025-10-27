import { createInitialGameState } from './state/gameState.js';
import { MissionSystem } from './systems/missionSystem.js';
import { HeatSystem } from './systems/heatSystem.js';
import { EconomySystem } from './systems/economySystem.js';
import { GameLoop } from './loop/gameLoop.js';

const createCarThiefGame = ({ canvas, context }) => {
  const state = createInitialGameState();
  const heatSystem = new HeatSystem(state);
  const missionSystem = new MissionSystem(state, { heatSystem });
  const economySystem = new EconomySystem(state);

  const renderHud = () => {
    if (!context || !canvas) {
      return;
    }

    const crackdownTier = heatSystem.getCurrentTierConfig();
    const crackdownLabel = crackdownTier?.label ?? 'Unknown';

    context.fillStyle = '#121822';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = '#78beff';
    context.font = '20px "Segoe UI", sans-serif';
    context.textAlign = 'left';
    context.fillText(`City: ${state.city.name}`, 32, 48);
    context.fillText(`Day ${state.day}`, 32, 78);
    context.fillText(`Funds: $${state.funds.toLocaleString()}`, 32, 108);
    context.fillText(`Heat: ${state.heat.toFixed(2)}`, 32, 138);
    context.fillText(`Crackdown: ${crackdownLabel}`, 32, 168);

    context.fillStyle = '#d1eaff';
    context.font = '16px "Segoe UI", sans-serif';
    context.fillText('Crew:', 32, 212);
    state.crew.forEach((member, index) => {
      context.fillText(`- ${member.name} (${member.specialty})`, 48, 242 + index * 26);
    });

    const crewSectionBottom = 242 + state.crew.length * 26;
    const garageLabelY = crewSectionBottom + 40;
    context.fillText('Garage:', 32, garageLabelY);

    const garage = Array.isArray(state.garage) ? state.garage : [];
    const garageStartY = garageLabelY + 30;
    const garageColumnWidth = 200;
    const garageRowHeight = 60;
    const maxGarageColumns = Math.max(1, Math.min(3, Math.floor((canvas.width - 64) / garageColumnWidth)));
    const maxGarageRows = 3;
    const maxVehiclesVisible = maxGarageColumns * maxGarageRows;
    const vehiclesToDisplay = garage.slice(0, maxVehiclesVisible);

    vehiclesToDisplay.forEach((vehicle, index) => {
      const columnIndex = index % maxGarageColumns;
      const rowIndex = Math.floor(index / maxGarageColumns);
      const vehicleX = 32 + columnIndex * garageColumnWidth;
      const vehicleY = garageStartY + rowIndex * garageRowHeight;

      const condition = typeof vehicle.condition === 'number' ? Math.round(vehicle.condition) : 'N/A';
      const heat = typeof vehicle.heat === 'number' ? vehicle.heat.toFixed(1) : 'N/A';

      context.fillText(vehicle.model ?? 'Unknown vehicle', vehicleX, vehicleY);
      context.fillText(`Condition: ${condition}%`, vehicleX, vehicleY + 20);
      context.fillText(`Heat: ${heat}`, vehicleX, vehicleY + 40);
    });

    if (garage.length > vehiclesToDisplay.length) {
      const remaining = garage.length - vehiclesToDisplay.length;
      const infoY =
        garageStartY + maxGarageRows * garageRowHeight - 10;
      context.fillText(`+${remaining} more in garage`, 32, infoY);
    }

    const garageColumnsUsed = Math.min(Math.max(garage.length, 1), maxGarageColumns);
    const missionInfoX = Math.max(420, 32 + garageColumnsUsed * garageColumnWidth + 48);
    let missionInfoY = 48;
    context.fillText('Mission Status:', missionInfoX, missionInfoY);

    missionInfoY += 30;
    const activeMission = state.activeMission;
    if (activeMission) {
      const progressPercent = Math.round((activeMission.progress ?? 0) * 100);
      const remainingSeconds = Math.max(
        (activeMission.duration ?? 0) - (activeMission.elapsedTime ?? 0),
        0,
      );
      const timeLabel = `${Math.ceil(remainingSeconds)}s remaining`;
      const statusLabel =
        activeMission.status === 'awaiting-resolution'
          ? 'Awaiting outcome'
          : activeMission.status === 'in-progress'
            ? 'In progress'
            : activeMission.status === 'completed'
              ? `Completed (${activeMission.outcome ?? 'unknown'})`
              : activeMission.status ?? 'Unknown';
      const activeMetadata = [
        activeMission.districtName ? `District: ${activeMission.districtName}` : null,
        activeMission.riskTier ? `Risk: ${activeMission.riskTier}` : null,
      ].filter(Boolean);

      context.fillText(activeMission.name, missionInfoX, missionInfoY);
      missionInfoY += 26;
      context.fillText(`Status: ${statusLabel}`, missionInfoX, missionInfoY);
      missionInfoY += 26;

      if (activeMetadata.length) {
        context.fillText(activeMetadata.join(' • '), missionInfoX, missionInfoY);
        missionInfoY += 26;
      }

      if (activeMission.status === 'in-progress') {
        context.fillText(
          `Progress: ${progressPercent}% — ${timeLabel}`,
          missionInfoX,
          missionInfoY,
        );
        missionInfoY += 26;
      } else if (activeMission.status === 'awaiting-resolution') {
        context.fillText(`Progress: ${progressPercent}% — Ready to resolve`, missionInfoX, missionInfoY);
        missionInfoY += 26;
      } else if (activeMission.status === 'completed') {
        context.fillText(`Payout: $${activeMission.payout.toLocaleString()}`, missionInfoX, missionInfoY);
        missionInfoY += 26;
      }
    } else {
      context.fillText('No active mission', missionInfoX, missionInfoY);
      missionInfoY += 26;
    }

    missionInfoY += 32;
    context.fillText('Contracts:', missionInfoX, missionInfoY);
    missionSystem.availableMissions.forEach((mission, index) => {
      const baseY = missionInfoY + 30 + index * 26;
      const progressPercent = Math.round((mission.progress ?? 0) * 100);
      let statusLabel = mission.status ?? 'unknown';
      if (mission.status === 'in-progress') {
        statusLabel = `in progress (${progressPercent}%)`;
      } else if (mission.status === 'awaiting-resolution') {
        statusLabel = 'awaiting outcome';
      }

      const metadataSegments = [
        mission.districtName ? `@ ${mission.districtName}` : null,
        mission.riskTier ? `risk: ${mission.riskTier}` : null,
        mission.restricted ? 'LOCKED' : null,
      ].filter(Boolean);
      const metadataLabel = metadataSegments.length ? ` — ${metadataSegments.join(' • ')}` : '';

      context.fillText(
        `${mission.name} — $${mission.payout.toLocaleString()} (${statusLabel})${metadataLabel}`,
        missionInfoX,
        baseY,
      );
      if (mission.restricted && mission.restrictionReason) {
        context.fillText(`   ⛔ ${mission.restrictionReason}`, missionInfoX, baseY + 18);
      }
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
