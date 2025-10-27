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
    const formatExpense = (value) => {
      const numeric = Number.isFinite(value) ? value : 0;
      return `$${Math.max(0, Math.round(numeric)).toLocaleString()}`;
    };
    const payroll = economySystem.getCrewPayroll();
    const projectedDaily = economySystem.getProjectedDailyExpenses();
    const lastExpenseReport = economySystem.getLastExpenseReport();
    const lastExpenseLabel = lastExpenseReport
      ? `${formatExpense(lastExpenseReport.total)} (base ${formatExpense(
          lastExpenseReport.base,
        )} + crew ${formatExpense(lastExpenseReport.payroll)})`
      : '—';

    context.fillStyle = '#121822';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = '#78beff';
    context.font = '20px "Segoe UI", sans-serif';
    context.textAlign = 'left';
    context.fillText(`City: ${state.city.name}`, 32, 48);
    context.fillText(`Day ${state.day}`, 32, 78);
    context.fillText(`Funds: $${state.funds.toLocaleString()}`, 32, 108);
    context.fillText(`Payroll: ${formatExpense(payroll)}/day`, 32, 138);
    context.fillText(`Projected burn: ${formatExpense(projectedDaily)}/day`, 32, 168);
    context.fillText(`Last upkeep: ${lastExpenseLabel}`, 32, 198);
    context.fillText(`Heat: ${state.heat.toFixed(2)}`, 32, 228);
    context.fillText(`Crackdown: ${crackdownLabel}`, 32, 258);

    context.fillStyle = '#d1eaff';
    context.font = '16px "Segoe UI", sans-serif';
    context.fillText('Crew:', 32, 302);
    state.crew.forEach((member, index) => {
      const loyaltyLabel = Number.isFinite(member.loyalty) ? `L${member.loyalty}` : 'L?';
      const statusLabel = (member.status ?? 'idle').replace(/-/g, ' ');
      const line = `- ${member.name} (${member.specialty}) — ${loyaltyLabel} • ${statusLabel}`;
      context.fillText(line, 48, 332 + index * 26);
    });

    const crewSectionBottom = 332 + state.crew.length * 26;
    const garageLabelY = crewSectionBottom + 40;
    context.fillText('Garage:', 32, garageLabelY);

    const garage = Array.isArray(state.garage) ? state.garage : [];
    const garageStartY = garageLabelY + 30;
    const garageColumnWidth = 200;
    const garageRowHeight = 74;
    const maxGarageColumns = Math.max(1, Math.min(3, Math.floor((canvas.width - 64) / garageColumnWidth)));
    const maxGarageRows = 3;
    const maxVehiclesVisible = maxGarageColumns * maxGarageRows;
    const vehiclesToDisplay = garage.slice(0, maxVehiclesVisible);
    const activeMissionVehicleId = state.activeMission?.assignedVehicleId ?? null;
    const lastVehicleReport = state.lastVehicleReport ?? null;

    vehiclesToDisplay.forEach((vehicle, index) => {
      const columnIndex = index % maxGarageColumns;
      const rowIndex = Math.floor(index / maxGarageColumns);
      const vehicleX = 32 + columnIndex * garageColumnWidth;
      const vehicleY = garageStartY + rowIndex * garageRowHeight;

      const isAssigned = Boolean(activeMissionVehicleId && activeMissionVehicleId === vehicle.id);
      const isRecentlyUsed = Boolean(!isAssigned && lastVehicleReport?.vehicleId === vehicle.id);

      if (isAssigned || isRecentlyUsed) {
        context.fillStyle = isAssigned ? 'rgba(255, 200, 80, 0.18)' : 'rgba(95, 150, 255, 0.18)';
        context.fillRect(vehicleX - 16, vehicleY - 28, garageColumnWidth - 24, garageRowHeight - 12);
      }

      const nameColor = isAssigned ? '#ffe27a' : '#d1eaff';
      const detailColor = isAssigned ? '#ffd15c' : '#9ac7ff';
      const secondaryColor = isAssigned ? '#ffebb1' : '#b4d4ff';

      const conditionValue = Number.isFinite(vehicle.condition)
        ? Math.max(0, Math.min(1, vehicle.condition))
        : null;
      const conditionPercent = conditionValue !== null ? Math.round(conditionValue * 100) : null;
      const conditionDelta =
        isRecentlyUsed && Number.isFinite(lastVehicleReport?.conditionDelta)
          ? Math.round(lastVehicleReport.conditionDelta * 100)
          : null;
      const conditionDeltaLabel =
        conditionDelta !== null && Math.abs(conditionDelta) >= 1
          ? ` (${conditionDelta > 0 ? '+' : ''}${conditionDelta}%)`
          : '';

      const heatValue = Number.isFinite(vehicle.heat) ? vehicle.heat.toFixed(1) : 'N/A';
      const heatDelta =
        isRecentlyUsed && Number.isFinite(lastVehicleReport?.heatDelta)
          ? lastVehicleReport.heatDelta
          : null;
      const heatDeltaLabel =
        heatDelta !== null && Math.abs(heatDelta) >= 0.05
          ? ` (${heatDelta > 0 ? '+' : ''}${heatDelta.toFixed(1)})`
          : '';

      context.fillStyle = nameColor;
      context.fillText(vehicle.model ?? 'Unknown vehicle', vehicleX, vehicleY);
      context.fillStyle = detailColor;
      context.fillText(
        `Condition: ${conditionPercent !== null ? `${conditionPercent}%` : 'N/A'}${conditionDeltaLabel}`,
        vehicleX,
        vehicleY + 22,
      );
      context.fillText(`Heat: ${heatValue}${heatDeltaLabel}`, vehicleX, vehicleY + 42);

      const statusSegments = [];
      if (isAssigned) {
        statusSegments.push('In mission');
      } else {
        const statusLabel = (vehicle.status ?? 'idle').replace(/-/g, ' ');
        if (statusLabel && statusLabel.toLowerCase() !== 'idle') {
          statusSegments.push(statusLabel);
        }
      }

      if (isRecentlyUsed && lastVehicleReport?.outcome) {
        let outcomeLabel;
        if (lastVehicleReport.outcome === 'success') {
          outcomeLabel = 'Success';
        } else if (lastVehicleReport.outcome === 'failure') {
          outcomeLabel = 'Failure';
        } else if (lastVehicleReport.outcome === 'sale') {
          const fundsLabel = Number.isFinite(lastVehicleReport.fundsDelta)
            ? formatExpense(lastVehicleReport.fundsDelta)
            : formatExpense(lastVehicleReport.salePrice);
          outcomeLabel = `Sold (${fundsLabel})`;
        } else if (lastVehicleReport.outcome === 'scrap') {
          const fundsLabel = Number.isFinite(lastVehicleReport.fundsDelta)
            ? formatExpense(lastVehicleReport.fundsDelta)
            : formatExpense(lastVehicleReport.scrapValue);
          const partsLabel = Number.isFinite(lastVehicleReport.partsRecovered)
            ? `${lastVehicleReport.partsRecovered} parts`
            : null;
          outcomeLabel = ['Scrapped', partsLabel, fundsLabel ? `+${fundsLabel}` : null]
            .filter(Boolean)
            .join(' ');
        } else if (lastVehicleReport.outcome === 'maintenance') {
          const serviceType = lastVehicleReport.maintenanceType;
          if (serviceType === 'repair') {
            outcomeLabel = 'Maintenance: Repair';
          } else if (serviceType === 'heat') {
            outcomeLabel = 'Maintenance: Heat purge';
          } else {
            outcomeLabel = 'Maintenance';
          }
        } else {
          outcomeLabel = lastVehicleReport.outcome;
        }

        statusSegments.push(`Last: ${outcomeLabel}`);
      }

      if (statusSegments.length) {
        context.fillStyle = secondaryColor;
        context.fillText(statusSegments.join(' • '), vehicleX, vehicleY + 62);
      }
    });

    context.fillStyle = '#d1eaff';

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
          ? 'Resolving outcome'
          : activeMission.status === 'in-progress'
            ? 'In progress (auto resolves)'
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

      if (activeMission.assignedVehicleLabel) {
        context.fillText(`Vehicle: ${activeMission.assignedVehicleLabel}`, missionInfoX, missionInfoY);
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
        context.fillText(`Progress: ${progressPercent}% — Resolving outcome`, missionInfoX, missionInfoY);
        missionInfoY += 26;
      } else if (activeMission.status === 'completed') {
        context.fillText(`Payout: $${activeMission.payout.toLocaleString()}`, missionInfoX, missionInfoY);
        missionInfoY += 26;
      }

      if (Array.isArray(activeMission.assignedCrewIds) && activeMission.assignedCrewIds.length) {
        const crewMembers = activeMission.assignedCrewIds
          .map((crewId) => state.crew.find((member) => member.id === crewId))
          .filter(Boolean);
        const crewNames = crewMembers.map((member) => member.name).join(', ');
        context.fillText(`Crew: ${crewNames}`, missionInfoX, missionInfoY);
        missionInfoY += 26;

        if (Number.isFinite(activeMission.successChance)) {
          context.fillText(
            `Projected success: ${Math.round(activeMission.successChance * 100)}%`,
            missionInfoX,
            missionInfoY,
          );
          missionInfoY += 26;
        }

        const crewSummary = Array.isArray(activeMission.crewEffectSummary)
          ? activeMission.crewEffectSummary
          : [];
        crewSummary.slice(0, 3).forEach((line) => {
          context.fillText(` • ${line}`, missionInfoX + 12, missionInfoY);
          missionInfoY += 22;
        });
        if (crewSummary.length > 3) {
          context.fillText(` • +${crewSummary.length - 3} more adjustments`, missionInfoX + 12, missionInfoY);
          missionInfoY += 22;
        }
      }
    } else {
      context.fillText('No active mission', missionInfoX, missionInfoY);
      missionInfoY += 26;
    }

    const latestLogEntry =
      Array.isArray(state.missionLog) && state.missionLog.length ? state.missionLog[0] : null;
    if (latestLogEntry) {
      context.fillText(`Last result: ${latestLogEntry.summary}`, missionInfoX, missionInfoY);
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
