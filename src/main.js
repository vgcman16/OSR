import { createCarThiefGame } from './game/carThief/index.js';
import { CrewMember } from './game/carThief/entities/crewMember.js';
import { GARAGE_MAINTENANCE_CONFIG } from './game/carThief/systems/missionSystem.js';
import { executeHeatMitigation } from './game/carThief/systems/heatMitigationService.js';

let gameInstance = null;

const teardownGame = () => {
  if (!gameInstance) {
    return;
  }

  if (typeof gameInstance.stop === 'function') {
    gameInstance.stop();
  } else if (gameInstance.loop && typeof gameInstance.loop.stop === 'function') {
    gameInstance.loop.stop();
  }

  gameInstance = null;
};

const missionControls = {
  select: null,
  startButton: null,
  statusText: null,
  detailDescription: null,
  detailPayout: null,
  detailHeat: null,
  detailDuration: null,
  detailSuccess: null,
  detailRestriction: null,
  detailCrewImpact: null,
  crewList: null,
  vehicleList: null,
  crackdownText: null,
  logList: null,
  recruitList: null,
  recruitStatus: null,
  trainingCrewSelect: null,
  trainingSpecialtySelect: null,
  trainingLoyaltyButton: null,
  trainingSpecialtyButton: null,
  trainingStatus: null,
  maintenanceRepairButton: null,
  maintenanceHeatButton: null,
  maintenanceStatus: null,
  maintenanceStatusDetail: '',
  heatLayLowButton: null,
  heatBribeButton: null,
  heatStatus: null,
  heatStatusDetail: '',
  selectedCrewIds: [],
  selectedVehicleId: null,
};

let missionControlSyncHandle = null;

const CONTROL_SYNC_INTERVAL_MS = 500;

const SPECIALTY_OPTIONS = [
  { value: 'wheelman', label: 'Wheelman — getaways and pace' },
  { value: 'hacker', label: 'Hacker — disable security grids' },
  { value: 'mechanic', label: 'Mechanic — squeeze extra payout' },
  { value: 'face', label: 'Face — social leverage' },
  { value: 'infiltrator', label: 'Infiltrator — slip past surveillance' },
  { value: 'tactician', label: 'Tactician — choreograph operations' },
  { value: 'spotter', label: 'Spotter — relay recon intel' },
];

const LOYALTY_TRAINING_COST = 2000;
const SPECIALTY_TRAINING_COST = 3500;

const HEAT_MANAGEMENT_ACTIONS = {
  layLow: {
    key: 'layLow',
    label: 'Lay Low',
    cost: 4500,
    heatReduction: 2.5,
  },
  bribeOfficials: {
    key: 'bribeOfficials',
    label: 'Bribe Officials',
    cost: 9000,
    heatReduction: 4.5,
  },
};

const getMissionSystem = () => gameInstance?.systems?.mission ?? null;
const getEconomySystem = () => gameInstance?.systems?.economy ?? null;
const getHeatSystem = () => gameInstance?.systems?.heat ?? null;
const getSharedState = () => gameInstance?.state ?? getMissionSystem()?.state ?? null;

const triggerHudRender = () => {
  if (gameInstance?.loop?.render) {
    gameInstance.loop.render();
  }
};

const setMissionDetails = ({
  description,
  payout,
  heat,
  duration,
  success,
  restriction,
  crewImpact,
}) => {
  const {
    detailDescription,
    detailPayout,
    detailHeat,
    detailDuration,
    detailSuccess,
    detailRestriction,
    detailCrewImpact,
  } = missionControls;

  if (
    !(
      detailDescription &&
      detailPayout &&
      detailHeat &&
      detailDuration &&
      detailSuccess &&
      detailRestriction &&
      detailCrewImpact
    )
  ) {
    return;
  }

  detailDescription.textContent = description;
  detailPayout.textContent = payout;
  detailHeat.textContent = heat;
  detailDuration.textContent = duration;
  detailSuccess.textContent = success;
  detailRestriction.textContent = restriction;

  detailCrewImpact.innerHTML = '';
  const impactItems = Array.isArray(crewImpact) ? crewImpact : [crewImpact ?? 'No crew assigned.'];
  impactItems.forEach((line) => {
    const item = document.createElement('li');
    item.textContent = line;
    detailCrewImpact.appendChild(item);
  });
};

const resetMissionDetails = (descriptionText) => {
  setMissionDetails({
    description: descriptionText,
    payout: '—',
    heat: '—',
    duration: '—',
    success: '—',
    restriction: 'All contracts are currently open.',
    crewImpact: ['No crew assigned.', 'No vehicle selected.'],
  });
};

const formatMissionStatusMessage = (mission) => {
  if (!mission) {
    const missionSystem = getMissionSystem();
    const latestLogEntry = missionSystem?.state?.missionLog?.[0];
    const vehicleSummary = describeVehicleReportOutcome(missionSystem?.state?.lastVehicleReport);

    if (latestLogEntry) {
      const baseMessage = `No active mission. Last result: ${latestLogEntry.summary}`;
      return vehicleSummary ? `${baseMessage} — Garage: ${vehicleSummary}` : baseMessage;
    }

    if (vehicleSummary) {
      return `No active mission. ${vehicleSummary}`;
    }

    return 'No active mission.';
  }

  const status = mission.status ?? 'unknown';
  const progressPercent = Math.round((mission.progress ?? 0) * 100);
  const remainingSeconds = Math.max((mission.duration ?? 0) - (mission.elapsedTime ?? 0), 0);
  const roundedRemaining = Math.max(Math.ceil(remainingSeconds), 0);

  switch (status) {
    case 'in-progress':
      return `${mission.name} in progress — ${progressPercent}% complete (${roundedRemaining}s remaining, auto-resolving on completion)`;
    case 'awaiting-resolution':
      return `${mission.name} resolving outcome…`;
    case 'completed':
      return `${mission.name} completed — outcome: ${mission.outcome ?? 'unknown'}`;
    default:
      return `${mission.name} — status: ${status}`;
  }
};

const formatCurrency = (value) => {
  if (!Number.isFinite(value)) {
    return '—';
  }

  return `$${Math.round(value).toLocaleString()}`;
};

const formatSeconds = (value) => {
  if (!Number.isFinite(value)) {
    return '—';
  }

  return `${Math.round(value)}s`;
};

const formatPercent = (value) => {
  if (!Number.isFinite(value)) {
    return '—';
  }

  return `${Math.round(value * 100)}%`;
};

const formatHeatValue = (value) => {
  if (!Number.isFinite(value)) {
    return '—';
  }

  return value.toFixed(1);
};

const formatAdjustedValue = (
  base,
  adjusted,
  formatValue,
  formatDelta,
  tolerance = 0.01,
) => {
  if (!Number.isFinite(adjusted)) {
    return '—';
  }

  if (!Number.isFinite(base) || Math.abs(adjusted - base) <= tolerance) {
    return formatValue(adjusted);
  }

  const delta = adjusted - base;
  const sign = delta >= 0 ? '+' : '-';
  return `${formatValue(base)} → ${formatValue(adjusted)} (${sign}${formatDelta(Math.abs(delta))})`;
};

const describeVehicleReportOutcome = (report) => {
  if (!report) {
    return '';
  }

  const modelLabel = report.vehicleModel ?? 'Vehicle';
  const summarizeFunds = (value) => {
    if (!Number.isFinite(value)) {
      return '';
    }

    return formatCurrency(value);
  };

  if (report.outcome === 'sale') {
    const fundsLabel = summarizeFunds(report.fundsDelta ?? report.salePrice);
    return fundsLabel ? `${modelLabel} sold for ${fundsLabel}.` : `${modelLabel} sold.`;
  }

  if (report.outcome === 'scrap') {
    const fundsLabel = summarizeFunds(report.fundsDelta ?? report.scrapValue);
    const partsCount = Number.isFinite(report.partsRecovered) ? report.partsRecovered : 0;
    const partsLabel = partsCount > 0 ? `${partsCount} parts recovered` : '';
    const segments = [`${modelLabel} scrapped.`];
    if (partsLabel) {
      segments.push(partsLabel);
    }
    if (fundsLabel) {
      segments.push(`Worth ${fundsLabel}.`);
    }
    return segments.join(' ').trim();
  }

  if (report.outcome === 'maintenance') {
    if (report.maintenanceType === 'repair') {
      const deltaPercent = Number.isFinite(report.conditionDelta)
        ? Math.round(report.conditionDelta * 100)
        : null;
      const deltaLabel = deltaPercent && deltaPercent > 0 ? `+${deltaPercent}% condition.` : '';
      return `${modelLabel} serviced — repairs complete.${deltaLabel ? ` ${deltaLabel}` : ''}`.trim();
    }
    if (report.maintenanceType === 'heat') {
      const heatDrop = Number.isFinite(report.heatDelta) ? -report.heatDelta : null;
      const heatLabel = heatDrop && heatDrop > 0 ? `${heatDrop.toFixed(1)} heat purged.` : '';
      return `${modelLabel} heat purge complete.${heatLabel ? ` ${heatLabel}` : ''}`.trim();
    }
    return `${modelLabel} maintenance complete.`;
  }

  if (typeof report.summary === 'string' && report.summary.trim()) {
    return report.summary.trim();
  }

  if (report.outcome) {
    return `${modelLabel} update: ${report.outcome}.`;
  }

  return `${modelLabel} update recorded.`;
};

const setRecruitStatus = (message) => {
  if (!missionControls.recruitStatus) {
    return;
  }

  missionControls.recruitStatus.textContent = message ?? '';
};

const setTrainingStatus = (message) => {
  if (!missionControls.trainingStatus) {
    return;
  }

  missionControls.trainingStatus.textContent = message ?? '';
};

const clearMaintenanceStatusDetail = () => {
  missionControls.maintenanceStatusDetail = '';
};

const updateHeatManagementPanel = () => {
  const { heatLayLowButton, heatBribeButton, heatStatus } = missionControls;
  if (!heatLayLowButton || !heatBribeButton || !heatStatus) {
    return;
  }

  const missionSystem = getMissionSystem();
  const heatSystem = getHeatSystem();
  const economySystem = getEconomySystem();
  const state = missionSystem?.state ?? getSharedState();
  const funds = Number.isFinite(state?.funds) ? state.funds : 0;

  const layLowConfig = HEAT_MANAGEMENT_ACTIONS.layLow;
  const bribeConfig = HEAT_MANAGEMENT_ACTIONS.bribeOfficials;

  const systemsReady = Boolean(missionSystem && heatSystem && economySystem);

  const canLayLow = systemsReady && funds >= layLowConfig.cost;
  const canBribe = systemsReady && funds >= bribeConfig.cost;

  heatLayLowButton.disabled = !canLayLow;
  heatBribeButton.disabled = !canBribe;

  heatLayLowButton.title = canLayLow
    ? ''
    : `Requires ${formatCurrency(layLowConfig.cost)} and operational systems.`;
  heatBribeButton.title = canBribe
    ? ''
    : `Requires ${formatCurrency(bribeConfig.cost)} and operational systems.`;

  let summaryMessage;

  if (!systemsReady) {
    summaryMessage = 'Heat abatement network syncing…';
  } else {
    const layLowHeat = layLowConfig.heatReduction.toFixed(1);
    const bribeHeat = bribeConfig.heatReduction.toFixed(1);
    summaryMessage = `Lay Low costs ${formatCurrency(layLowConfig.cost)} to drop heat by ${layLowHeat}. ` +
      `Bribe Officials costs ${formatCurrency(bribeConfig.cost)} to drop heat by ${bribeHeat}.`;

    const shortages = [];
    if (funds < layLowConfig.cost) {
      shortages.push(`Lay Low needs ${formatCurrency(layLowConfig.cost)}`);
    }
    if (funds < bribeConfig.cost) {
      shortages.push(`Bribe Officials needs ${formatCurrency(bribeConfig.cost)}`);
    }

    if (shortages.length) {
      summaryMessage = `${summaryMessage} Funds short — ${shortages.join(' and ')}.`;
    } else {
      summaryMessage = `${summaryMessage} Available funds: ${formatCurrency(funds)}.`;
    }
  }

  const crackdownInfo = describeCrackdownPolicy();
  const crackdownMessage = crackdownInfo
    ? `Crackdown level: ${crackdownInfo.label} — ${crackdownInfo.impact}`
    : 'Crackdown status unavailable.';

  const detail = missionControls.heatStatusDetail?.trim();
  const leadMessage = detail || summaryMessage;

  heatStatus.textContent = [leadMessage, crackdownMessage].filter(Boolean).join(' ');
};

const updateMaintenancePanel = () => {
  const { maintenanceStatus, maintenanceRepairButton, maintenanceHeatButton } = missionControls;
  if (!maintenanceStatus || !maintenanceRepairButton || !maintenanceHeatButton) {
    return;
  }

  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();
  const state = missionSystem?.state ?? getSharedState();
  const garage = Array.isArray(state?.garage) ? state.garage : [];
  const selectedVehicleId = missionControls.selectedVehicleId ?? null;
  const selectedVehicle = selectedVehicleId
    ? garage.find((vehicle) => vehicle?.id === selectedVehicleId) ?? null
    : null;
  const funds = Number.isFinite(state?.funds) ? state.funds : 0;

  const rawRepairCost = Number(GARAGE_MAINTENANCE_CONFIG?.repair?.cost);
  const repairCost = Number.isFinite(rawRepairCost) && rawRepairCost > 0 ? rawRepairCost : 0;
  const rawRepairBoost = Number(GARAGE_MAINTENANCE_CONFIG?.repair?.conditionBoost);
  const repairBoost = Number.isFinite(rawRepairBoost) && rawRepairBoost > 0 ? rawRepairBoost : 0;
  const rawHeatCost = Number(GARAGE_MAINTENANCE_CONFIG?.heat?.cost);
  const heatCost = Number.isFinite(rawHeatCost) && rawHeatCost > 0 ? rawHeatCost : 0;
  const rawHeatReduction = Number(GARAGE_MAINTENANCE_CONFIG?.heat?.heatReduction);
  const heatReduction = Number.isFinite(rawHeatReduction) && rawHeatReduction > 0 ? rawHeatReduction : 0;

  const systemsReady = Boolean(missionSystem && economySystem);
  const hasSelection = Boolean(selectedVehicle);

  const canRepair = systemsReady && hasSelection && funds >= repairCost;
  const canReduceHeat = systemsReady && hasSelection && funds >= heatCost;

  maintenanceRepairButton.disabled = !canRepair;
  maintenanceHeatButton.disabled = !canReduceHeat;

  maintenanceRepairButton.title = canRepair ? '' : 'Select a vehicle and ensure sufficient funds.';
  maintenanceHeatButton.title = canReduceHeat ? '' : 'Select a vehicle and ensure sufficient funds.';

  let summaryMessage;
  if (!systemsReady) {
    summaryMessage = 'Maintenance channel syncing…';
  } else if (!hasSelection) {
    const repairPercent = Math.round(repairBoost * 100);
    const heatLabel = heatReduction.toFixed(1);
    summaryMessage = `Select a garage vehicle to schedule repairs (${formatCurrency(
      repairCost,
    )} for up to ${repairPercent}% condition) or heat purges (${formatCurrency(
      heatCost,
    )} to drop heat by ${heatLabel}).`;
  } else {
    const conditionPercent = Number.isFinite(selectedVehicle.condition)
      ? Math.round(Math.max(0, Math.min(1, selectedVehicle.condition)) * 100)
      : null;
    const heatValue = Number.isFinite(selectedVehicle.heat)
      ? selectedVehicle.heat.toFixed(1)
      : 'N/A';
    const affordabilityHints = [];
    if (funds < repairCost) {
      affordabilityHints.push(`repairs need ${formatCurrency(repairCost)}`);
    }
    if (funds < heatCost) {
      affordabilityHints.push(`heat purge needs ${formatCurrency(heatCost)}`);
    }
    const affordabilityMessage = affordabilityHints.length
      ? ` Insufficient funds — ${affordabilityHints.join(' and ')}.`
      : '';
    const repairPercent = Math.round(repairBoost * 100);
    const heatLabel = heatReduction.toFixed(1);
    summaryMessage = `${selectedVehicle.model ?? 'Vehicle'} — condition ${
      conditionPercent !== null ? `${conditionPercent}%` : 'N/A'
    }, heat ${heatValue}. Repairs cost ${formatCurrency(
      repairCost,
    )} for up to ${repairPercent}% restoration; heat purges cost ${formatCurrency(
      heatCost,
    )} to lower heat by ${heatLabel}.${affordabilityMessage}`;
  }

  if (systemsReady && hasSelection) {
    const disposition = missionSystem?.estimateVehicleDisposition?.(selectedVehicle) ?? null;
    if (disposition?.saleValue || disposition?.scrapValue) {
      const saleLabel = formatCurrency(disposition.saleValue ?? 0);
      const scrapLabel = formatCurrency(disposition.scrapValue ?? 0);
      const partsLabel = Number.isFinite(disposition?.partsRecovered) && disposition.partsRecovered > 0
        ? `${disposition.partsRecovered} parts`
        : 'no usable parts';
      summaryMessage = `${summaryMessage} Disposition: Sell for ${saleLabel} or scrap for ${scrapLabel} (${partsLabel}).`;
    }
  }

  const detail = missionControls.maintenanceStatusDetail?.trim();
  maintenanceStatus.textContent = [detail, summaryMessage].filter(Boolean).join(' ');
};

const performMaintenanceAction = (type) => {
  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();

  if (!missionSystem || !economySystem) {
    missionControls.maintenanceStatusDetail = 'Maintenance systems offline.';
    updateMaintenancePanel();
    updateHeatManagementPanel();
    return;
  }

  const vehicleId = missionControls.selectedVehicleId;
  if (!vehicleId) {
    missionControls.maintenanceStatusDetail = 'Select a garage vehicle before running maintenance.';
    updateMaintenancePanel();
    updateHeatManagementPanel();
    return;
  }

  const vehicle = missionSystem.getVehicleFromGarage?.(vehicleId) ?? null;
  if (!vehicle) {
    missionControls.maintenanceStatusDetail = 'Selected vehicle no longer in the garage.';
    updateMissionControls();
    return;
  }

  const result =
    type === 'repair'
      ? missionSystem.repairVehicleCondition(vehicleId, economySystem)
      : missionSystem.reduceVehicleHeat(vehicleId, economySystem);

  if (!result || !result.success) {
    let failureMessage = 'Maintenance could not be completed.';
    if (result?.reason === 'insufficient-funds') {
      const required = formatCurrency(result.cost ?? 0);
      const available = formatCurrency(result.fundsAvailable ?? missionSystem.state.funds ?? 0);
      failureMessage = `Insufficient funds — requires ${required}, available ${available}.`;
    } else if (result?.reason === 'vehicle-not-found') {
      failureMessage = 'Selected vehicle no longer in the garage.';
    }

    missionControls.maintenanceStatusDetail = failureMessage;
    updateMissionControls();
    return;
  }

  let successMessage;
  if (type === 'repair') {
    const deltaPercent = Number.isFinite(result.conditionDelta)
      ? Math.round(result.conditionDelta * 100)
      : 0;
    const afterPercent = Number.isFinite(result.conditionAfter)
      ? Math.round(result.conditionAfter * 100)
      : null;
    const deltaLabel = deltaPercent > 0 ? `+${deltaPercent}% condition` : 'condition already optimal';
    const trailing = afterPercent !== null ? ` (now ${afterPercent}%)` : '';
    successMessage = `Repaired ${vehicle.model ?? 'vehicle'} — ${deltaLabel}${trailing}. Cost ${formatCurrency(
      result.cost ?? 0,
    )}.`;
  } else {
    const heatDrop = Number.isFinite(result.heatDelta) ? Math.max(0, -result.heatDelta) : 0;
    const heatLabel = heatDrop > 0 ? heatDrop.toFixed(1) : '0.0';
    const afterHeat = Number.isFinite(result.heatAfter) ? result.heatAfter.toFixed(1) : 'N/A';
    successMessage = `Reduced heat on ${vehicle.model ?? 'vehicle'} by ${heatLabel} (now ${afterHeat}). Cost ${formatCurrency(
      result.cost ?? 0,
    )}.`;
  }

  missionControls.maintenanceStatusDetail = successMessage;
  updateMissionControls();
  triggerHudRender();
};

const handleMaintenanceRepair = () => performMaintenanceAction('repair');
const handleMaintenanceHeat = () => performMaintenanceAction('heat');

const performHeatMitigation = (actionKey) => {
  const action = HEAT_MANAGEMENT_ACTIONS[actionKey];
  const missionSystem = getMissionSystem();
  const heatSystem = getHeatSystem();
  const economySystem = getEconomySystem();
  const state = missionSystem?.state ?? getSharedState();

  if (!action || !missionSystem || !heatSystem || !economySystem || !state) {
    missionControls.heatStatusDetail = 'Heat mitigation systems offline.';
    updateHeatManagementPanel();
    return;
  }

  const funds = Number.isFinite(state.funds) ? state.funds : 0;
  const cost = Number.isFinite(action.cost) && action.cost > 0 ? action.cost : 0;

  if (funds < cost) {
    const required = formatCurrency(cost);
    const available = formatCurrency(funds);
    missionControls.heatStatusDetail = `Insufficient funds — requires ${required}, available ${available}.`;
    updateHeatManagementPanel();
    return;
  }

  const mitigationResult = executeHeatMitigation({
    heatSystem,
    missionSystem,
    economySystem,
    reduction: action.heatReduction,
    cost,
    label: action.label,
    metadata: { action: action.key },
  });

  if (!mitigationResult?.success) {
    let failureMessage = 'Unable to mitigate heat.';
    if (mitigationResult?.reason === 'insufficient-funds') {
      const required = formatCurrency(mitigationResult.cost ?? cost);
      const available = formatCurrency(mitigationResult.fundsAvailable ?? funds);
      failureMessage = `Insufficient funds — requires ${required}, available ${available}.`;
    } else if (mitigationResult?.reason === 'heat-system-unavailable') {
      failureMessage = 'Heat mitigation offline.';
    } else if (mitigationResult?.reason === 'economy-system-unavailable') {
      failureMessage = 'Economy systems offline.';
    }

    missionControls.heatStatusDetail = failureMessage;
    updateHeatManagementPanel();
    return;
  }

  const heatBefore = Number.isFinite(mitigationResult.heatBefore)
    ? mitigationResult.heatBefore
    : Number.isFinite(heatSystem?.state?.heat)
      ? heatSystem.state.heat + (mitigationResult.reductionApplied ?? 0)
      : 0;
  const heatAfter = Number.isFinite(mitigationResult.heatAfter)
    ? mitigationResult.heatAfter
    : Number.isFinite(heatSystem?.state?.heat)
      ? heatSystem.state.heat
      : 0;

  missionControls.heatStatusDetail = `Spent ${formatCurrency(mitigationResult.cost ?? cost)} to ${
    action.label.toLowerCase()
  } — heat ${formatHeatValue(heatBefore)} → ${formatHeatValue(heatAfter)}.`;

  updateMissionSelect();
  updateMissionControls();
  triggerHudRender();
};

const handleHeatLayLow = () => performHeatMitigation('layLow');
const handleHeatBribe = () => performHeatMitigation('bribeOfficials');

const handleRecruitHire = (candidateId) => {
  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();
  const state = missionSystem?.state ?? getSharedState();

  if (!missionSystem || !economySystem || !state) {
    setRecruitStatus('Crew manifest unavailable.');
    return;
  }

  const recruitPool = Array.isArray(state.recruitPool) ? state.recruitPool : [];
  const candidateIndex = recruitPool.findIndex((entry) => entry?.id === candidateId);

  if (candidateIndex === -1) {
    setRecruitStatus('Candidate data not found.');
    return;
  }

  const candidate = recruitPool[candidateIndex];
  const hireCost = Number(candidate?.hiringCost);
  const funds = Number.isFinite(state.funds) ? state.funds : 0;

  if (!Number.isFinite(hireCost) || hireCost < 0) {
    setRecruitStatus('This recruit has an invalid contract.');
    return;
  }

  if (funds < hireCost) {
    setRecruitStatus('Insufficient funds to bring this specialist onboard.');
    return;
  }

  economySystem.adjustFunds(-hireCost);

  const newMember = new CrewMember({
    name: candidate.name,
    specialty: candidate.specialty,
    upkeep: candidate.upkeep,
    loyalty: candidate.loyalty,
  });

  if (!Array.isArray(state.crew)) {
    state.crew = [];
  }

  state.crew.push(newMember);
  recruitPool.splice(candidateIndex, 1);

  setRecruitStatus(`${candidate.name} joins the crew as our newest ${candidate.specialty}.`);
  updateCrewSelectionOptions();
  updateRecruitmentOptions();
  updateTrainingOptions();
  updateMissionControls();
  triggerHudRender();
};

const updateRecruitmentOptions = () => {
  const recruitContainer = missionControls.recruitList;
  if (!recruitContainer) {
    return;
  }

  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();
  const state = missionSystem?.state ?? getSharedState();

  recruitContainer.innerHTML = '';

  if (!missionSystem || !economySystem || !state) {
    const placeholder = document.createElement('p');
    placeholder.textContent = 'Crew management channel syncing…';
    recruitContainer.appendChild(placeholder);
    return;
  }

  const recruitPool = Array.isArray(state.recruitPool) ? state.recruitPool : [];

  if (!recruitPool.length) {
    const placeholder = document.createElement('p');
    placeholder.textContent = 'No new leads at the moment. Complete missions to surface more talent.';
    recruitContainer.appendChild(placeholder);
    return;
  }

  const funds = Number.isFinite(state.funds) ? state.funds : 0;

  recruitPool.forEach((candidate) => {
    if (!candidate) {
      return;
    }

    const card = document.createElement('article');
    card.className = 'mission-recruit__card';

    const title = document.createElement('h4');
    title.className = 'mission-recruit__name';
    const loyaltyLabel = Number.isFinite(candidate.loyalty) ? `L${candidate.loyalty}` : 'L?';
    title.textContent = `${candidate.name} — ${candidate.specialty} (${loyaltyLabel})`;

    const description = document.createElement('p');
    description.className = 'mission-recruit__description';
    description.textContent = candidate.description ?? 'Eager to prove their worth on the next score.';

    const cost = Number(candidate.hiringCost);
    const upkeep = Number(candidate.upkeep);
    const costLine = document.createElement('p');
    costLine.className = 'mission-recruit__cost';
    costLine.textContent = `${formatCurrency(Number.isFinite(cost) ? cost : 0)} hire • ${formatCurrency(Number.isFinite(upkeep) ? upkeep : 0)}/day`;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mission-recruit__button';
    button.textContent = 'Recruit';
    const canAfford = Number.isFinite(cost) ? funds >= cost : true;
    button.disabled = !canAfford;
    if (!canAfford) {
      button.title = 'Insufficient funds';
    }
    button.addEventListener('click', () => handleRecruitHire(candidate.id));

    card.appendChild(title);
    card.appendChild(description);
    card.appendChild(costLine);
    card.appendChild(button);

    recruitContainer.appendChild(card);
  });
};

const updateTrainingOptions = () => {
  const crewSelect = missionControls.trainingCrewSelect;
  const specialtySelect = missionControls.trainingSpecialtySelect;
  const loyaltyButton = missionControls.trainingLoyaltyButton;
  const specialtyButton = missionControls.trainingSpecialtyButton;

  if (!crewSelect || !specialtySelect || !loyaltyButton || !specialtyButton) {
    return;
  }

  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();
  const state = missionSystem?.state ?? getSharedState();
  const crew = Array.isArray(state?.crew) ? state.crew : [];
  const funds = Number.isFinite(state?.funds) ? state.funds : 0;

  const previousSelection = crewSelect.value;
  crewSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = crew.length ? 'Select crew member' : 'No crew available';
  placeholder.disabled = true;
  placeholder.selected = true;
  crewSelect.appendChild(placeholder);

  crew.forEach((member) => {
    if (!member) {
      return;
    }

    const option = document.createElement('option');
    option.value = member.id;
    const loyaltyLabel = Number.isFinite(member.loyalty) ? `L${member.loyalty}` : 'L?';
    option.textContent = `${member.name} — ${member.specialty} (${loyaltyLabel})`;
    crewSelect.appendChild(option);
  });

  if (crew.some((member) => member?.id === previousSelection)) {
    crewSelect.value = previousSelection;
  }

  const currentSelection = crew.find((member) => member?.id === crewSelect.value) ?? null;

  const previousSpecialty = specialtySelect.value;
  specialtySelect.innerHTML = '';
  SPECIALTY_OPTIONS.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.value;
    option.textContent = entry.label;
    specialtySelect.appendChild(option);
  });

  if (SPECIALTY_OPTIONS.some((entry) => entry.value === previousSpecialty)) {
    specialtySelect.value = previousSpecialty;
  }

  if (!specialtySelect.value && SPECIALTY_OPTIONS.length) {
    specialtySelect.value = SPECIALTY_OPTIONS[0].value;
  }

  const canTrain = Boolean(missionSystem && economySystem && currentSelection);
  const atMaxLoyalty = currentSelection ? Number(currentSelection.loyalty) >= 5 : true;

  loyaltyButton.disabled =
    !canTrain ||
    atMaxLoyalty ||
    funds < LOYALTY_TRAINING_COST;
  loyaltyButton.textContent = `Boost Loyalty (${formatCurrency(LOYALTY_TRAINING_COST)})`;

  const desiredSpecialty = specialtySelect.value;
  const alreadySpecialty = currentSelection
    ? (currentSelection.specialty ?? '').toLowerCase() === desiredSpecialty
    : false;
  specialtyButton.disabled =
    !canTrain ||
    alreadySpecialty ||
    funds < SPECIALTY_TRAINING_COST;
  specialtyButton.textContent = `Specialty Training (${formatCurrency(SPECIALTY_TRAINING_COST)})`;
};

const handleLoyaltyTraining = () => {
  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();
  const state = missionSystem?.state ?? getSharedState();
  const crewSelect = missionControls.trainingCrewSelect;

  if (!missionSystem || !economySystem || !state || !crewSelect) {
    setTrainingStatus('Training systems unavailable.');
    return;
  }

  const crew = Array.isArray(state.crew) ? state.crew : [];
  const selectedId = crewSelect.value;
  const member = crew.find((entry) => entry?.id === selectedId);

  if (!member) {
    setTrainingStatus('Select a crew member to coach.');
    return;
  }

  const funds = Number.isFinite(state.funds) ? state.funds : 0;
  if (funds < LOYALTY_TRAINING_COST) {
    setTrainingStatus('Insufficient funds for loyalty training.');
    return;
  }

  if (Number(member.loyalty) >= 5) {
    setTrainingStatus(`${member.name} is already fiercely loyal.`);
    return;
  }

  economySystem.adjustFunds(-LOYALTY_TRAINING_COST);
  if (typeof member.adjustLoyalty === 'function') {
    member.adjustLoyalty(1);
  } else {
    const currentLoyalty = Number.isFinite(member.loyalty) ? member.loyalty : 0;
    member.loyalty = Math.max(0, Math.min(5, currentLoyalty + 1));
  }

  setTrainingStatus(`${member.name}'s loyalty climbs to L${member.loyalty}.`);
  updateTrainingOptions();
  updateCrewSelectionOptions();
  updateMissionControls();
  triggerHudRender();
};

const handleSpecialtyTraining = () => {
  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();
  const state = missionSystem?.state ?? getSharedState();
  const crewSelect = missionControls.trainingCrewSelect;
  const specialtySelect = missionControls.trainingSpecialtySelect;

  if (!missionSystem || !economySystem || !state || !crewSelect || !specialtySelect) {
    setTrainingStatus('Training systems unavailable.');
    return;
  }

  const crew = Array.isArray(state.crew) ? state.crew : [];
  const selectedId = crewSelect.value;
  const member = crew.find((entry) => entry?.id === selectedId);

  if (!member) {
    setTrainingStatus('Select a crew member to specialize.');
    return;
  }

  const desiredSpecialty = specialtySelect.value;
  if (!desiredSpecialty) {
    setTrainingStatus('Choose a specialty focus before training.');
    return;
  }

  const funds = Number.isFinite(state.funds) ? state.funds : 0;
  if (funds < SPECIALTY_TRAINING_COST) {
    setTrainingStatus('Insufficient funds for specialty training.');
    return;
  }

  if ((member.specialty ?? '').toLowerCase() === desiredSpecialty.toLowerCase()) {
    setTrainingStatus(`${member.name} already operates as a ${desiredSpecialty}.`);
    return;
  }

  economySystem.adjustFunds(-SPECIALTY_TRAINING_COST);
  member.specialty = desiredSpecialty;
  setTrainingStatus(`${member.name} retrains as a ${desiredSpecialty}.`);
  updateTrainingOptions();
  updateCrewSelectionOptions();
  updateMissionControls();
  triggerHudRender();
};

const updateCrewSelectionOptions = () => {
  const crewContainer = missionControls.crewList;
  if (!crewContainer) {
    return;
  }

  const missionSystem = getMissionSystem();
  const crewRoster = Array.isArray(missionSystem?.state?.crew) ? missionSystem.state.crew : [];
  const selectedSet = new Set(missionControls.selectedCrewIds ?? []);

  crewContainer.innerHTML = '';

  if (!missionSystem) {
    const placeholder = document.createElement('p');
    placeholder.textContent = 'Crew manifest loading…';
    crewContainer.appendChild(placeholder);
    missionControls.selectedCrewIds = Array.from(selectedSet);
    return;
  }

  if (!crewRoster.length) {
    const placeholder = document.createElement('p');
    placeholder.textContent = 'No crew recruited yet.';
    crewContainer.appendChild(placeholder);
    missionControls.selectedCrewIds = Array.from(selectedSet);
    return;
  }

  crewRoster.forEach((member) => {
    if (!member) {
      return;
    }

    const optionLabel = document.createElement('label');
    optionLabel.className = 'mission-crew__option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = member.id;
    const isAvailable = (member.status ?? 'idle') === 'idle';
    if (!isAvailable) {
      selectedSet.delete(member.id);
    }
    checkbox.checked = selectedSet.has(member.id);
    checkbox.disabled = !isAvailable;

    checkbox.addEventListener('change', () => {
      const currentSelection = new Set(missionControls.selectedCrewIds ?? []);
      if (checkbox.checked) {
        currentSelection.add(member.id);
      } else {
        currentSelection.delete(member.id);
      }

      missionControls.selectedCrewIds = Array.from(currentSelection);
      updateMissionControls();
    });

    const descriptor = document.createElement('span');
    descriptor.className = 'mission-crew__label';
    const loyaltyLabel = Number.isFinite(member.loyalty) ? `L${member.loyalty}` : 'L?';
    const statusLabel = (member.status ?? 'idle').replace(/-/g, ' ');
    descriptor.textContent = `${member.name} — ${member.specialty} • ${loyaltyLabel} • ${statusLabel}`;

    optionLabel.appendChild(checkbox);
    optionLabel.appendChild(descriptor);
    crewContainer.appendChild(optionLabel);
  });

  missionControls.selectedCrewIds = Array.from(selectedSet);
};

const updateVehicleSelectionOptions = () => {
  const vehicleContainer = missionControls.vehicleList;
  if (!vehicleContainer) {
    return;
  }

  const previousSelection = missionControls.selectedVehicleId;
  const missionSystem = getMissionSystem();
  const garage = Array.isArray(missionSystem?.state?.garage) ? missionSystem.state.garage : [];
  const activeMissionVehicleId = missionSystem?.state?.activeMission?.assignedVehicleId ?? null;

  vehicleContainer.innerHTML = '';

  if (!missionSystem) {
    const placeholder = document.createElement('p');
    placeholder.textContent = 'Garage manifest syncing…';
    vehicleContainer.appendChild(placeholder);
    missionControls.selectedVehicleId = null;
    clearMaintenanceStatusDetail();
    return;
  }

  if (!garage.length) {
    const placeholder = document.createElement('p');
    placeholder.textContent = 'No vehicles available. Complete missions to expand the garage.';
    vehicleContainer.appendChild(placeholder);
    missionControls.selectedVehicleId = null;
    clearMaintenanceStatusDetail();
    return;
  }

  const availableVehicles = garage.filter((vehicle) => {
    if (!vehicle) {
      return false;
    }

    const condition = Number(vehicle.condition);
    const isOperational = Number.isFinite(condition) ? condition > 0.05 : true;
    const statusLabel = (vehicle.status ?? '').toLowerCase();
    const isInMission = Boolean(vehicle.inUse) || statusLabel === 'in-mission' || activeMissionVehicleId === vehicle.id;
    return isOperational && !isInMission;
  });

  const selectionStillValid = availableVehicles.some(
    (vehicle) => vehicle && vehicle.id === missionControls.selectedVehicleId,
  );

  if (!selectionStillValid) {
    missionControls.selectedVehicleId = availableVehicles[0]?.id ?? null;
  }

  let hasSelectableOption = false;

  garage.forEach((vehicle) => {
    if (!vehicle) {
      return;
    }

    const entry = document.createElement('div');
    entry.className = 'mission-vehicle__entry';

    const optionLabel = document.createElement('label');
    optionLabel.className = 'mission-crew__option mission-vehicle__option';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'mission-vehicle';
    radio.value = vehicle.id;

    const conditionValue = Number(vehicle.condition);
    const conditionPercent = Number.isFinite(conditionValue)
      ? Math.round(Math.max(0, Math.min(1, conditionValue)) * 100)
      : null;
    const isOperational = Number.isFinite(conditionValue) ? conditionValue > 0.05 : true;
    const statusLabel = (vehicle.status ?? '').toLowerCase();
    const isInMission = Boolean(vehicle.inUse) || statusLabel === 'in-mission' || activeMissionVehicleId === vehicle.id;
    const disabled = !isOperational || isInMission;

    if (!disabled) {
      hasSelectableOption = true;
    }

    radio.checked = missionControls.selectedVehicleId === vehicle.id;
    radio.disabled = disabled;

    radio.addEventListener('change', () => {
      missionControls.selectedVehicleId = radio.checked ? vehicle.id : null;
      clearMaintenanceStatusDetail();
      updateMissionControls();
    });

    const descriptor = document.createElement('span');
    descriptor.className = 'mission-crew__label';

    const heatLabel = Number.isFinite(vehicle.heat) ? vehicle.heat.toFixed(1) : 'N/A';
    let statusText = 'Ready';
    if (!isOperational) {
      statusText = 'Inoperable';
    } else if (isInMission) {
      statusText = 'On mission';
    }

    const conditionLabel =
      conditionPercent !== null ? `${conditionPercent}% condition` : 'Condition unknown';
    descriptor.textContent = `${vehicle.model ?? 'Vehicle'} — ${conditionLabel} • Heat ${heatLabel} • ${statusText}`;

    optionLabel.appendChild(radio);
    optionLabel.appendChild(descriptor);
    entry.appendChild(optionLabel);

    const disposition = missionSystem?.estimateVehicleDisposition?.(vehicle) ?? null;
    const actionBar = document.createElement('div');
    actionBar.className = 'mission-vehicle__actions';

    const sellButton = document.createElement('button');
    sellButton.type = 'button';
    sellButton.className = 'mission-vehicle__action mission-vehicle__action--sell';
    const saleValue = Number.isFinite(disposition?.saleValue) ? disposition.saleValue : 0;
    sellButton.textContent = saleValue > 0 ? `Sell (${formatCurrency(saleValue)})` : 'Sell';
    sellButton.disabled = disabled || saleValue <= 0;
    if (disabled) {
      sellButton.title = 'Vehicle unavailable while in use or inoperable.';
    } else if (saleValue <= 0) {
      sellButton.title = 'No resale value detected.';
    }
    sellButton.addEventListener('click', () => {
      if (!missionSystem) {
        missionControls.maintenanceStatusDetail = 'Garage systems offline.';
        updateMaintenancePanel();
        return;
      }

      const result = missionSystem.sellVehicle(vehicle.id);
      if (!result?.success) {
        const failureMessage = result?.reason === 'vehicle-in-use'
          ? 'Vehicle cannot be sold while committed to a mission.'
          : 'Unable to sell vehicle.';
        missionControls.maintenanceStatusDetail = failureMessage;
        updateMaintenancePanel();
        return;
      }

      const summary = describeVehicleReportOutcome(result.report ?? missionSystem.state.lastVehicleReport);
      missionControls.maintenanceStatusDetail = summary
        ? summary
        : `Sold ${result.vehicleModel ?? 'vehicle'} for ${formatCurrency(
            result.salePrice ?? result.fundsDelta ?? 0,
          )}.`;
      if (missionControls.selectedVehicleId === vehicle.id) {
        missionControls.selectedVehicleId = null;
      }
      updateMissionControls();
      triggerHudRender();
    });

    const scrapButton = document.createElement('button');
    scrapButton.type = 'button';
    scrapButton.className = 'mission-vehicle__action mission-vehicle__action--scrap';
    const scrapValue = Number.isFinite(disposition?.scrapValue) ? disposition.scrapValue : 0;
    const partsRecovered = Number.isFinite(disposition?.partsRecovered)
      ? disposition.partsRecovered
      : 0;
    scrapButton.textContent =
      scrapValue > 0
        ? `Scrap for parts (${formatCurrency(scrapValue)})`
        : 'Scrap for parts';
    scrapButton.disabled = disabled || (scrapValue <= 0 && partsRecovered <= 0);
    if (disabled) {
      scrapButton.title = 'Vehicle unavailable while in use or inoperable.';
    } else if (partsRecovered > 0) {
      scrapButton.title = `Recover approximately ${partsRecovered} parts.`;
    } else if (scrapValue <= 0) {
      scrapButton.title = 'Limited salvage available.';
    }
    scrapButton.addEventListener('click', () => {
      if (!missionSystem) {
        missionControls.maintenanceStatusDetail = 'Garage systems offline.';
        updateMaintenancePanel();
        return;
      }

      const result = missionSystem.dismantleVehicle(vehicle.id);
      if (!result?.success) {
        const failureMessage = result?.reason === 'vehicle-in-use'
          ? 'Vehicle cannot be dismantled while committed to a mission.'
          : 'Unable to dismantle vehicle.';
        missionControls.maintenanceStatusDetail = failureMessage;
        updateMaintenancePanel();
        return;
      }

      const summary = describeVehicleReportOutcome(result.report ?? missionSystem.state.lastVehicleReport);
      if (summary) {
        missionControls.maintenanceStatusDetail = summary;
      } else {
        const fundsLabel = formatCurrency(result.scrapValue ?? result.fundsDelta ?? 0);
        const partsLabel = Number.isFinite(result.partsRecovered) && result.partsRecovered > 0
          ? `${result.partsRecovered} parts recovered.`
          : 'Minimal salvage recovered.';
        missionControls.maintenanceStatusDetail = `Scrapped ${
          result.vehicleModel ?? 'vehicle'
        } for ${fundsLabel}. ${partsLabel}`;
      }
      if (missionControls.selectedVehicleId === vehicle.id) {
        missionControls.selectedVehicleId = null;
      }
      updateMissionControls();
      triggerHudRender();
    });

    actionBar.appendChild(sellButton);
    actionBar.appendChild(scrapButton);
    entry.appendChild(actionBar);

    vehicleContainer.appendChild(entry);
  });

  if (!hasSelectableOption) {
    const placeholder = document.createElement('p');
    placeholder.textContent =
      'All vehicles are currently committed or inoperable. Wait for a mission to resolve.';
    vehicleContainer.appendChild(placeholder);
    missionControls.selectedVehicleId = null;
    clearMaintenanceStatusDetail();
  }

  if (previousSelection !== missionControls.selectedVehicleId) {
    clearMaintenanceStatusDetail();
  }
};

const describeCrackdownPolicy = () => {
  const missionSystem = getMissionSystem();
  const heatSystem = getHeatSystem();

  if (!missionSystem && !heatSystem) {
    return null;
  }

  const policy = missionSystem?.getCurrentCrackdownPolicy?.();
  const tierName = missionSystem?.currentCrackdownTier ?? heatSystem?.getCurrentTier?.();

  const label = policy?.label ?? (tierName ? tierName.charAt(0).toUpperCase() + tierName.slice(1) : 'Calm');
  let impact;

  if (!policy || !Number.isFinite(policy.maxMissionHeat)) {
    impact = 'All contracts are open.';
  } else {
    impact = `Contracts generating more than ${policy.maxMissionHeat} heat are grounded.`;
  }

  return {
    tierName: tierName ?? 'calm',
    label,
    impact,
  };
};

const updateMissionStatusText = () => {
  if (!missionControls.statusText) {
    return;
  }

  const missionSystem = getMissionSystem();
  if (!missionSystem) {
    missionControls.statusText.textContent = 'Game initializing…';
    return;
  }

  const activeMission = missionSystem.state.activeMission;
  let statusMessage = formatMissionStatusMessage(activeMission);

  const crackdownInfo = describeCrackdownPolicy();
  if (crackdownInfo) {
    const crackdownSentence = `Crackdown: ${crackdownInfo.label} — ${crackdownInfo.impact}`;
    statusMessage = `${statusMessage} ${crackdownSentence}`.trim();
  }

  missionControls.statusText.textContent = statusMessage;
  renderMissionLog();
};

const updateCrackdownIndicator = () => {
  const { crackdownText } = missionControls;
  if (!crackdownText) {
    return;
  }

  const crackdownInfo = describeCrackdownPolicy();
  if (!crackdownInfo) {
    crackdownText.textContent = 'Crackdown systems calibrating…';
    return;
  }

  crackdownText.textContent = `Crackdown level: ${crackdownInfo.label} — ${crackdownInfo.impact}`;
};

const renderMissionLog = () => {
  const { logList } = missionControls;
  if (!logList) {
    return;
  }

  const missionSystem = getMissionSystem();
  const logEntries = Array.isArray(missionSystem?.state?.missionLog)
    ? missionSystem.state.missionLog
    : [];

  logList.innerHTML = '';

  if (!logEntries.length) {
    const placeholder = document.createElement('li');
    placeholder.textContent = 'No missions resolved yet.';
    logList.appendChild(placeholder);
    return;
  }

  const options = { hour: '2-digit', minute: '2-digit' };

  logEntries.slice(0, 5).forEach((entry) => {
    const item = document.createElement('li');
    const summary = entry?.summary ?? 'Mission resolved.';
    const timestamp = Number.isFinite(entry?.timestamp) ? new Date(entry.timestamp) : null;
    const timeLabel = timestamp ? ` @ ${timestamp.toLocaleTimeString([], options)}` : '';
    item.textContent = `${summary}${timeLabel}`;
    logList.appendChild(item);
  });
};

const updateMissionControls = () => {
  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();
  const {
    select,
    startButton,
    detailDescription,
    detailPayout,
    detailHeat,
    detailDuration,
    detailSuccess,
    detailRestriction,
    detailCrewImpact,
    crewList,
    vehicleList,
    crackdownText,
    logList,
    recruitList,
    trainingCrewSelect,
    trainingSpecialtySelect,
    trainingLoyaltyButton,
    trainingSpecialtyButton,
    maintenanceRepairButton,
    maintenanceHeatButton,
    maintenanceStatus,
  } = missionControls;

  const controls = [select, startButton];
  const detailElements = [
    detailDescription,
    detailPayout,
    detailHeat,
    detailDuration,
    detailSuccess,
    detailRestriction,
    detailCrewImpact,
    crewList,
    vehicleList,
    crackdownText,
    logList,
    recruitList,
    trainingCrewSelect,
    trainingSpecialtySelect,
    trainingLoyaltyButton,
    trainingSpecialtyButton,
    maintenanceRepairButton,
    maintenanceHeatButton,
    maintenanceStatus,
  ];
  const controlsReady = [...controls, ...detailElements].every(Boolean);

  if (!controlsReady) {
    return;
  }

  updateCrewSelectionOptions();
  updateVehicleSelectionOptions();
  updateRecruitmentOptions();
  updateTrainingOptions();
  updateMaintenancePanel();

  const isReady = Boolean(missionSystem && economySystem);
  controls.forEach((control) => {
    // Keep select enabled separately to allow mission browsing once ready.
    if (control !== select) {
      control.disabled = !isReady;
    }
  });

  if (!isReady) {
    const descriptionText = missionSystem
      ? 'Select a mission to view its briefing.'
      : 'Mission database initializing…';
    resetMissionDetails(descriptionText);
    updateMissionStatusText();
    updateCrackdownIndicator();
    updateHeatManagementPanel();
    updateMaintenancePanel();
    return;
  }

  updateCrackdownIndicator();

  const selectedMissionId = select.value;
  const selectedMission = missionSystem.availableMissions.find(
    (mission) => mission.id === selectedMissionId,
  );
  const activeMission = missionSystem.state.activeMission;

  const isMissionAvailable = Boolean(selectedMission && selectedMission.status === 'available');
  const isMissionRestricted = Boolean(selectedMission && selectedMission.restricted);
  const isAnotherMissionRunning = Boolean(
    activeMission && activeMission.id !== selectedMissionId && activeMission.status !== 'completed',
  );
  const hasVehicleSelection = Boolean(missionControls.selectedVehicleId);

  startButton.disabled =
    !isReady ||
    !isMissionAvailable ||
    isAnotherMissionRunning ||
    isMissionRestricted ||
    !hasVehicleSelection;

  if (!selectedMission) {
    resetMissionDetails('Select a mission to view its briefing.');
  } else {
    const missionDescription = selectedMission.description ?? 'No description available.';
    const selectedCrewIds = missionControls.selectedCrewIds ?? [];
    const preview =
      selectedMission.status === 'available'
        ? missionSystem.previewCrewAssignment(
            selectedMission.id,
            selectedCrewIds,
            missionControls.selectedVehicleId,
          )
        : null;

    const basePayout = Number.isFinite(selectedMission.basePayout)
      ? selectedMission.basePayout
      : selectedMission.payout;
    const baseDuration = Number.isFinite(selectedMission.baseDuration)
      ? selectedMission.baseDuration
      : selectedMission.duration;
    const baseSuccess = Number.isFinite(selectedMission.baseSuccessChance)
      ? selectedMission.baseSuccessChance
      : selectedMission.successChance;
    const baseHeat = Number.isFinite(selectedMission.baseHeat)
      ? selectedMission.baseHeat
      : selectedMission.heat;

    const payoutValue = preview?.adjustedPayout ?? selectedMission.payout ?? basePayout;
    const durationValue = preview?.adjustedDuration ?? selectedMission.duration ?? baseDuration;
    const successValue = preview?.adjustedSuccessChance ?? selectedMission.successChance ?? baseSuccess;
    const heatValue = preview?.adjustedHeat ?? selectedMission.heat ?? baseHeat;

    const missionPayout = selectedMission.status === 'available'
      ? formatAdjustedValue(basePayout, payoutValue, formatCurrency, formatCurrency, 1)
      : formatCurrency(payoutValue);
    const missionHeat = selectedMission.status === 'available'
      ? formatAdjustedValue(baseHeat, heatValue, formatHeatValue, formatHeatValue, 0.05)
      : formatHeatValue(heatValue);
    const missionDuration = selectedMission.status === 'available'
      ? formatAdjustedValue(baseDuration, durationValue, formatSeconds, formatSeconds, 1)
      : formatSeconds(durationValue);
    const missionSuccess = selectedMission.status === 'available'
      ? formatAdjustedValue(baseSuccess, successValue, formatPercent, formatPercent, 0.005)
      : formatPercent(successValue);
    const crackdownInfo = describeCrackdownPolicy();
    const restrictionMessage = selectedMission.restricted
      ? selectedMission.restrictionReason ?? 'This contract is locked by the current crackdown.'
      : crackdownInfo
        ? `Eligible under the ${crackdownInfo.label.toLowerCase()} crackdown.`
        : 'All contracts are open.';

    const crewImpact = (() => {
      if (selectedMission.status === 'available') {
        const summary = preview?.summary ?? [];
        return summary.length ? summary : ['No crew bonuses applied.'];
      }

      const summary = Array.isArray(selectedMission.crewEffectSummary)
        ? selectedMission.crewEffectSummary
        : [];
      return summary.length
        ? summary
        : ['Crew assignments locked in.', 'Vehicle assignment locked in.'];
    })();

    setMissionDetails({
      description: missionDescription,
      payout: missionPayout,
      heat: missionHeat,
      duration: missionDuration,
      success: missionSuccess,
      restriction: restrictionMessage,
      crewImpact,
    });
  }

  updateMissionStatusText();
  updateHeatManagementPanel();
  updateMaintenancePanel();
};

const updateMissionSelect = () => {
  const { select } = missionControls;
  if (!select) {
    return;
  }

  const missionSystem = getMissionSystem();
  if (!missionSystem) {
    select.disabled = true;
    return;
  }

  select.disabled = false;

  const previousSelection = select.value;
  const missions = missionSystem.availableMissions ?? [];
  const selectionStillValid = missions.some((mission) => mission.id === previousSelection);

  select.innerHTML = '';

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = 'Select a mission';
  placeholderOption.disabled = true;
  placeholderOption.selected = !selectionStillValid;
  select.appendChild(placeholderOption);

  missions.forEach((mission) => {
    const option = document.createElement('option');
    option.value = mission.id;

    const progressPercent = Math.round((mission.progress ?? 0) * 100);
    let statusLabel = mission.status ?? 'unknown';
    if (mission.status === 'in-progress') {
      statusLabel = `in progress (${progressPercent}%)`;
    } else if (mission.status === 'awaiting-resolution') {
      statusLabel = 'awaiting outcome';
    }

    const restrictionLabel = mission.restricted ? ' [LOCKED]' : '';
    option.textContent = `${mission.name} — $${mission.payout.toLocaleString()} (${statusLabel})${restrictionLabel}`;
    option.selected = selectionStillValid && mission.id === previousSelection;
    select.appendChild(option);
  });

  if (selectionStillValid) {
    select.value = previousSelection;
  }

  renderMissionLog();
};

const handleMissionStart = () => {
  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();
  const { select } = missionControls;

  if (!missionSystem || !economySystem || !select) {
    return;
  }

  const missionId = select.value;
  if (!missionId) {
    return;
  }

  const crewIds = Array.isArray(missionControls.selectedCrewIds)
    ? missionControls.selectedCrewIds
    : [];
  const vehicleId = missionControls.selectedVehicleId;
  if (!vehicleId) {
    return;
  }

  const mission = missionSystem.startMission(missionId, crewIds, vehicleId);
  if (!mission) {
    updateMissionStatusText();
    return;
  }

  missionControls.selectedCrewIds = [];
  missionControls.selectedVehicleId = null;
  clearMaintenanceStatusDetail();
  economySystem.payCrew();
  updateMissionSelect();
  updateMissionControls();
  updateVehicleSelectionOptions();
  triggerHudRender();
};

const setupMissionControls = () => {
  missionControls.select = document.getElementById('mission-select');
  missionControls.startButton = document.getElementById('start-mission-btn');
  missionControls.statusText = document.getElementById('mission-status-text');
  missionControls.detailDescription = document.getElementById('mission-detail-description');
  missionControls.detailPayout = document.getElementById('mission-detail-payout');
  missionControls.detailHeat = document.getElementById('mission-detail-heat');
  missionControls.detailDuration = document.getElementById('mission-detail-duration');
  missionControls.detailSuccess = document.getElementById('mission-detail-success');
  missionControls.detailRestriction = document.getElementById('mission-detail-restriction');
  missionControls.detailCrewImpact = document.getElementById('mission-detail-crew-impact');
  missionControls.crewList = document.getElementById('mission-crew-list');
  missionControls.vehicleList = document.getElementById('mission-vehicle-list');
  missionControls.crackdownText = document.getElementById('mission-crackdown-text');
  missionControls.logList = document.getElementById('mission-log-list');
  missionControls.recruitList = document.getElementById('mission-recruit-list');
  missionControls.recruitStatus = document.getElementById('mission-recruit-status');
  missionControls.trainingCrewSelect = document.getElementById('mission-training-crew');
  missionControls.trainingSpecialtySelect = document.getElementById('mission-training-specialty');
  missionControls.trainingLoyaltyButton = document.getElementById('mission-training-loyalty-btn');
  missionControls.trainingSpecialtyButton = document.getElementById('mission-training-specialty-btn');
  missionControls.trainingStatus = document.getElementById('mission-training-status');
  missionControls.maintenanceRepairButton = document.getElementById('mission-maintenance-repair-btn');
  missionControls.maintenanceHeatButton = document.getElementById('mission-maintenance-heat-btn');
  missionControls.maintenanceStatus = document.getElementById('mission-maintenance-status');
  missionControls.heatLayLowButton = document.getElementById('mission-heat-laylow-btn');
  missionControls.heatBribeButton = document.getElementById('mission-heat-bribe-btn');
  missionControls.heatStatus = document.getElementById('mission-heat-status');

  const {
    select,
    startButton,
    detailDescription,
    detailPayout,
    detailHeat,
    detailDuration,
    detailSuccess,
    detailRestriction,
    detailCrewImpact,
    crewList,
    vehicleList,
    crackdownText,
    logList,
    recruitList,
    recruitStatus,
    trainingCrewSelect,
    trainingSpecialtySelect,
    trainingLoyaltyButton,
    trainingSpecialtyButton,
    trainingStatus,
    maintenanceRepairButton,
    maintenanceHeatButton,
    maintenanceStatus,
    heatLayLowButton,
    heatBribeButton,
    heatStatus,
  } = missionControls;

  const controlsReady = [
    select,
    startButton,
    detailDescription,
    detailPayout,
    detailHeat,
    detailDuration,
    detailSuccess,
    detailRestriction,
    detailCrewImpact,
    crewList,
    vehicleList,
    crackdownText,
    logList,
    recruitList,
    recruitStatus,
    trainingCrewSelect,
    trainingSpecialtySelect,
    trainingLoyaltyButton,
    trainingSpecialtyButton,
    trainingStatus,
    maintenanceRepairButton,
    maintenanceHeatButton,
    maintenanceStatus,
    heatLayLowButton,
    heatBribeButton,
    heatStatus,
  ].every(Boolean);

  if (!controlsReady) {
    return;
  }

  startButton.addEventListener('click', handleMissionStart);
  select.addEventListener('change', () => {
    missionControls.selectedCrewIds = [];
    missionControls.selectedVehicleId = null;
    clearMaintenanceStatusDetail();
    updateMissionControls();
  });
  trainingCrewSelect.addEventListener('change', updateTrainingOptions);
  trainingSpecialtySelect.addEventListener('change', updateTrainingOptions);
  trainingLoyaltyButton.addEventListener('click', handleLoyaltyTraining);
  trainingSpecialtyButton.addEventListener('click', handleSpecialtyTraining);
  maintenanceRepairButton.addEventListener('click', handleMaintenanceRepair);
  maintenanceHeatButton.addEventListener('click', handleMaintenanceHeat);
  heatLayLowButton.addEventListener('click', handleHeatLayLow);
  heatBribeButton.addEventListener('click', handleHeatBribe);

  setRecruitStatus('');
  setTrainingStatus('');
  clearMaintenanceStatusDetail();
  updateRecruitmentOptions();
  updateTrainingOptions();
  missionControls.heatStatusDetail = '';
  updateMaintenancePanel();
  updateHeatManagementPanel();

  renderMissionLog();

  if (!missionControlSyncHandle) {
    missionControlSyncHandle = window.setInterval(() => {
      updateMissionSelect();
      updateMissionControls();
    }, CONTROL_SYNC_INTERVAL_MS);
  }
};

function initGame() {
  if (gameInstance) {
    if (gameInstance.loop?.running) {
      return gameInstance;
    }

    teardownGame();
  }

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
  setupMissionControls();

  if (document.readyState === 'loading') {
    window.addEventListener('load', initGame, { once: true });
  }
  initGame();
});

window.addEventListener('osr:init', () => {
  updateMissionSelect();
  updateMissionControls();
});

export { initGame, teardownGame };
