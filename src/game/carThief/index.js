import { createInitialGameState } from './state/gameState.js';
import { MissionSystem } from './systems/missionSystem.js';
import { HeatSystem } from './systems/heatSystem.js';
import { EconomySystem } from './systems/economySystem.js';
import { getActiveSafehouseFromState } from './world/safehouse.js';
import { GameLoop } from './loop/gameLoop.js';

const normalizeDistrictKey = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const key = String(value).trim().toLowerCase();
  return key ? key : null;
};

const createDistrictKey = (district) => {
  const idKey = normalizeDistrictKey(district?.id);
  if (idKey) {
    return `id:${idKey}`;
  }

  const nameKey = normalizeDistrictKey(district?.name);
  return nameKey ? `name:${nameKey}` : null;
};

const createMissionDistrictKey = (mission) => {
  if (!mission) {
    return null;
  }

  const idKey = normalizeDistrictKey(mission.districtId);
  if (idKey) {
    return `id:${idKey}`;
  }

  const nameKey = normalizeDistrictKey(mission.districtName);
  return nameKey ? `name:${nameKey}` : null;
};

const determineDistrictRiskTier = (securityScore) => {
  const numeric = Number(securityScore);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (numeric >= 4) {
    return 'high';
  }

  if (numeric >= 3) {
    return 'moderate';
  }

  return 'low';
};

const createCarThiefGame = ({ canvas, context }) => {
  const state = createInitialGameState();
  const heatSystem = new HeatSystem(state);
  const missionSystem = new MissionSystem(state, { heatSystem });
  const economySystem = new EconomySystem(state);

  const renderHud = () => {
    if (!context || !canvas) {
      return;
    }

    const renderDistrictMiniMap = () => {
      const city = state.city ?? null;
      const districts = Array.isArray(city?.districts) ? city.districts : [];
      if (!districts.length) {
        return null;
      }

      const mapWidth = 220;
      const mapX = canvas.width - mapWidth - 32;
      const mapY = 32;
      const maxHeight = canvas.height - mapY - 32;
      const mapHeight = Math.max(120, Math.min(maxHeight, 24 + districts.length * 34));

      context.save();
      context.fillStyle = 'rgba(12, 20, 32, 0.88)';
      context.fillRect(mapX, mapY, mapWidth, mapHeight);
      context.strokeStyle = 'rgba(120, 190, 255, 0.65)';
      context.strokeRect(mapX + 0.5, mapY + 0.5, mapWidth - 1, mapHeight - 1);

      context.font = '15px "Segoe UI", sans-serif';
      context.textAlign = 'left';
      context.textBaseline = 'top';
      context.fillStyle = '#9ac7ff';
      context.fillText('Districts', mapX + 16, mapY + 8);

      const availableHeight = mapHeight - 32;
      const rowHeightRaw = availableHeight / Math.max(districts.length, 1);
      const rowHeight = Math.max(26, Math.min(48, rowHeightRaw));
      const totalRowsHeight = rowHeight * districts.length;
      const startY = mapY + 28 + Math.max(0, (availableHeight - totalRowsHeight) / 2);

      const activeKey = createMissionDistrictKey(state.activeMission);

      districts.forEach((district, index) => {
        const cellX = mapX + 12;
        const cellWidth = mapWidth - 24;
        const cellY = startY + index * rowHeight;
        const cellHeight = rowHeight - 6;

        const districtKey = createDistrictKey(district);
        const isActive = Boolean(activeKey && districtKey === activeKey);

        let fillColor = 'rgba(80, 120, 180, 0.2)';
        let borderColor = 'rgba(120, 190, 255, 0.35)';
        let nameColor = '#d1eaff';
        let detailColor = '#9ac7ff';

        if (isActive) {
          fillColor = 'rgba(255, 214, 102, 0.3)';
          borderColor = 'rgba(255, 214, 102, 0.8)';
          nameColor = '#ffe27a';
          detailColor = '#ffd15c';
        }

        context.fillStyle = fillColor;
        context.fillRect(cellX, cellY, cellWidth, cellHeight);
        context.strokeStyle = borderColor;
        context.strokeRect(cellX + 0.5, cellY + 0.5, cellWidth - 1, cellHeight - 1);

        const riskTier = determineDistrictRiskTier(district.security);
        const riskLabel = riskTier
          ? `${riskTier.charAt(0).toUpperCase() + riskTier.slice(1)} risk`
          : 'Risk unknown';

        context.fillStyle = nameColor;
        context.fillText(district.name ?? 'Unknown', cellX + 8, cellY + 6);
        context.fillStyle = detailColor;
        context.fillText(riskLabel, cellX + 8, cellY + 22);
      });

      context.restore();
      return { x: mapX, y: mapY, width: mapWidth, height: mapHeight };
    };

    const crackdownTier = heatSystem.getCurrentTierConfig();
    const crackdownLabel = crackdownTier?.label ?? 'Unknown';
    const formatExpense = (value) => {
      const numeric = Number.isFinite(value) ? value : 0;
      const rounded = Math.round(Math.abs(numeric));
      const formatted = `$${rounded.toLocaleString()}`;
      return numeric < 0 ? `-${formatted}` : formatted;
    };
    const formatSigned = (value) => {
      if (!Number.isFinite(value) || value === 0) {
        return null;
      }
      const rounded = Math.round(Math.abs(value));
      const formatted = `$${rounded.toLocaleString()}`;
      return value >= 0 ? `+${formatted}` : `-${formatted}`;
    };
    const payroll = economySystem.getCrewPayroll();
    const projectedDaily = economySystem.getProjectedDailyExpenses();
    const lastExpenseReport = economySystem.getLastExpenseReport();
    const safehouse = getActiveSafehouseFromState(state);
    const safehouseTier = safehouse?.getCurrentTier?.() ?? null;
    const safehousePassiveIncome = typeof safehouse?.getPassiveIncome === 'function'
      ? safehouse.getPassiveIncome()
      : Number.isFinite(safehouseTier?.passiveIncome)
        ? safehouseTier.passiveIncome
        : 0;
    const safehouseHeatReduction = typeof safehouse?.getHeatReduction === 'function'
      ? safehouse.getHeatReduction()
      : Number.isFinite(safehouseTier?.heatReduction)
        ? safehouseTier.heatReduction
        : 0;
    const safehouseOverhead = Number.isFinite(lastExpenseReport?.safehouseOverhead)
      ? lastExpenseReport.safehouseOverhead
      : 0;
    const safehouseIncome = Number.isFinite(lastExpenseReport?.safehouseIncome)
      ? lastExpenseReport.safehouseIncome
      : 0;
    const adjustmentSegments = [];
    const overheadLabel = formatSigned(safehouseOverhead);
    if (overheadLabel) {
      adjustmentSegments.push(`safehouse ${overheadLabel}`);
    }
    const perkLabel = formatSigned(-safehouseIncome);
    if (perkLabel) {
      adjustmentSegments.push(`perks ${perkLabel}`);
    }
    const adjustmentsLabel = adjustmentSegments.length ? ` + ${adjustmentSegments.join(' + ')}` : '';
    const lastExpenseLabel = lastExpenseReport
      ? `${formatExpense(lastExpenseReport.total)} (base ${formatExpense(
          lastExpenseReport.base,
        )} + crew ${formatExpense(lastExpenseReport.payroll)}${adjustmentsLabel})`
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
    const safehouseLabel = safehouse
      ? `${safehouse.name} — ${safehouseTier?.label ?? 'Unranked'}`
      : 'None assigned';
    const safehousePerks = [];
    if (Number.isFinite(safehousePassiveIncome) && safehousePassiveIncome > 0) {
      safehousePerks.push(`+${formatExpense(safehousePassiveIncome)}/day`);
    }
    if (Number.isFinite(safehouseHeatReduction) && safehouseHeatReduction > 0) {
      safehousePerks.push(`-${safehouseHeatReduction.toFixed(2)} heat/day`);
    }
    const safehousePerksLabel = safehousePerks.length ? ` (${safehousePerks.join(', ')})` : '';
    context.fillText(`Safehouse: ${safehouseLabel}${safehousePerksLabel}`, 32, 288);

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
    const missionInfoXBase = Math.max(420, 32 + garageColumnsUsed * garageColumnWidth + 48);
    const miniMapBounds = renderDistrictMiniMap();
    let missionInfoX = missionInfoXBase;
    if (miniMapBounds) {
      missionInfoX = Math.min(missionInfoXBase, miniMapBounds.x - 32);
      missionInfoX = Math.max(420, missionInfoX);
    }
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

      const playerSummary = Array.isArray(activeMission.playerEffectSummary)
        ? activeMission.playerEffectSummary
        : [];
      if (playerSummary.length) {
        context.fillText('Player influence:', missionInfoX, missionInfoY);
        missionInfoY += 24;
        playerSummary.slice(0, 2).forEach((line) => {
          context.fillText(` • ${line}`, missionInfoX + 12, missionInfoY);
          missionInfoY += 22;
        });
        if (playerSummary.length > 2) {
          context.fillText(` • +${playerSummary.length - 2} more adjustments`, missionInfoX + 12, missionInfoY);
          missionInfoY += 22;
        }
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
