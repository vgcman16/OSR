import { createCarThiefGame } from './game/carThief/index.js';
import { CrewMember, CREW_TRAIT_CONFIG, CREW_FATIGUE_CONFIG } from './game/carThief/entities/crewMember.js';
import {
  GARAGE_MAINTENANCE_CONFIG,
  PLAYER_SKILL_CONFIG,
  PLAYER_GEAR_CATALOG,
  VEHICLE_UPGRADE_CATALOG,
  getNotorietyProfile,
  getNextNotorietyProfile,
} from './game/carThief/systems/missionSystem.js';
import { executeHeatMitigation } from './game/carThief/systems/heatMitigationService.js';
import { getActiveSafehouseFromState, getActiveStorageCapacityFromState } from './game/carThief/world/safehouse.js';
import { computeSafehouseFacilityBonuses, getFacilityEffectConfig } from './game/carThief/world/safehouseEffects.js';

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
  detailPlayerImpact: null,
  cityIntelSection: null,
  cityIntelDistrictName: null,
  cityIntelDistrictDescription: null,
  cityIntelRisk: null,
  cityIntelPoiName: null,
  cityIntelPoiDescription: null,
  cityIntelPoiPerks: null,
  cityIntelCanvas: null,
  cityIntelCanvasContext: null,
  crewList: null,
  vehicleList: null,
  crackdownText: null,
  logList: null,
  recruitList: null,
  recruitStatus: null,
  eventPrompt: null,
  eventChoices: null,
  eventHistory: null,
  eventStatus: null,
  eventStatusDetail: '',
  trainingCrewSelect: null,
  trainingSpecialtySelect: null,
  trainingLoyaltyButton: null,
  trainingSpecialtyButton: null,
   trainingAttributeSelect: null,
   trainingAttributeButton: null,
   trainingAttributeList: null,
  trainingRestCrewSelect: null,
  trainingRestDurationSelect: null,
  trainingRestButton: null,
  trainingStatus: null,
  playerStatsList: null,
  playerSkillSelect: null,
  playerSkillButton: null,
  playerGearSelect: null,
  playerGearButton: null,
  playerStatus: null,
  maintenanceRepairButton: null,
  maintenanceHeatButton: null,
  maintenanceUpgradeSelect: null,
  maintenanceUpgradeButton: null,
  maintenanceUpgradeList: null,
  maintenanceStatus: null,
  maintenanceStatusDetail: '',
  heatLayLowButton: null,
  heatBribeButton: null,
  heatStatus: null,
  heatStatusDetail: '',
  heatHistoryList: null,
  safehouseSection: null,
  safehouseName: null,
  safehouseTier: null,
  safehouseEffects: null,
  safehouseList: null,
  safehouseUpgradeButton: null,
  safehouseStatus: null,
  safehouseStatusDetail: '',
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

const CREW_ATTRIBUTE_OPTIONS = Object.values(CREW_TRAIT_CONFIG)
  .map((entry) => ({
    value: entry.key,
    label: entry.label,
    description: entry.description,
    trainingCost: entry.trainingCost,
    maxLevel: entry.maxLevel ?? 6,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

const CREW_REST_DURATION_OPTIONS = [
  { value: 1, label: '1 day — quick reset' },
  { value: 2, label: '2 days — deeper recovery' },
  { value: 3, label: '3 days — full rotation' },
];

const getCrewTraitLevel = (entity, traitKey) => {
  if (!entity) {
    return 0;
  }

  const traits = entity.traits ?? {};
  const rawValue = Number(traits[traitKey]);
  return Number.isFinite(rawValue) ? rawValue : 0;
};

const computeAttributeTrainingCost = (traitKey, currentLevel = 0) => {
  const config = CREW_TRAIT_CONFIG[traitKey];
  if (!config) {
    return Infinity;
  }

  const baseCost = Number.isFinite(config.trainingCost) ? config.trainingCost : 3000;
  const normalizedLevel = Number.isFinite(currentLevel) ? Math.max(0, currentLevel) : 0;
  return Math.round(baseCost + normalizedLevel * 400);
};

const formatCrewTraitSummary = (entity, limit = 3) => {
  if (!entity) {
    return '';
  }

  const entries = CREW_ATTRIBUTE_OPTIONS.map((option) => ({
    key: option.value,
    label: option.label,
    value: getCrewTraitLevel(entity, option.value),
  }));

  entries.sort((a, b) => {
    if (b.value === a.value) {
      return a.label.localeCompare(b.label);
    }
    return b.value - a.value;
  });

  const selection = entries.filter((entry) => entry.value > 0).slice(0, limit);
  return selection
    .map((entry) => `${entry.label} ${entry.value}`)
    .join(', ');
};

const summarizeCrewReadiness = (member) => {
  const defaults = {
    label: 'Readiness unknown',
    tooltip: 'Crew readiness data unavailable.',
    fatiguePercent: null,
    state: 'unknown',
    restPlan: null,
  };

  if (!member || typeof member !== 'object') {
    return defaults;
  }

  const summary = typeof member.getReadinessSummary === 'function'
    ? member.getReadinessSummary()
    : null;

  const maxFatigue = Number.isFinite(CREW_FATIGUE_CONFIG?.maxFatigue)
    ? CREW_FATIGUE_CONFIG.maxFatigue
    : 100;
  const fatigueValue = summary?.fatigue ?? Number(member.fatigue);
  const fatigue = Number.isFinite(fatigueValue)
    ? Math.max(0, Math.min(maxFatigue, fatigueValue))
    : null;
  const recoveryRate = summary?.recoveryPerDay ?? Number(member.fatigueRecoveryPerDay);
  const fatiguePercent = fatigue !== null ? Math.round((fatigue / maxFatigue) * 100) : null;
  const readinessState = summary?.state ?? (member.status ?? 'idle');
  const restPlan = summary?.restPlan ?? null;
  const restDaysRaw = Number(restPlan?.remainingDays);
  const restMultiplierRaw = Number(restPlan?.recoveryMultiplier);
  const restDays = Number.isFinite(restDaysRaw) ? Math.max(0, restDaysRaw) : 0;
  const restPlanSummary = restDays > 0
    ? {
        remainingDays: restDays,
        recoveryMultiplier: Number.isFinite(restMultiplierRaw) ? restMultiplierRaw : null,
      }
    : null;

  let readinessLabel = 'Ready';
  const normalizedState = typeof readinessState === 'string' ? readinessState.toLowerCase() : 'ready';
  if (normalizedState === 'resting') {
    readinessLabel = 'Resting';
  } else if (normalizedState === 'exhausted' || normalizedState === 'needs-rest') {
    readinessLabel = 'Needs rest';
  } else if (normalizedState === 'tired') {
    readinessLabel = 'Tired';
  } else if (normalizedState === 'on-mission') {
    readinessLabel = 'In the field';
  } else if (normalizedState === 'captured') {
    readinessLabel = 'Captured';
  } else if (normalizedState === 'injured') {
    readinessLabel = 'Injured';
  }

  const fatigueLabel = fatiguePercent !== null ? `${fatiguePercent}% fatigue` : 'Fatigue unknown';
  const tooltipParts = [`${fatigueLabel}.`];

  if (Number.isFinite(recoveryRate) && recoveryRate > 0) {
    tooltipParts.push(`Recovers about ${Math.round(recoveryRate)} fatigue per day.`);
  }

  if (restPlanSummary) {
    const daysLabel = restPlanSummary.remainingDays === 1
      ? '1 day remaining'
      : `${restPlanSummary.remainingDays} days remaining`;
    tooltipParts.push(`Accelerated recovery underway — ${daysLabel}.`);

    if (Number.isFinite(restPlanSummary.recoveryMultiplier) && restPlanSummary.recoveryMultiplier > 1) {
      const multiplierLabel = restPlanSummary.recoveryMultiplier >= 2
        ? `${restPlanSummary.recoveryMultiplier.toFixed(1)}x`
        : `${(restPlanSummary.recoveryMultiplier * 100 - 100).toFixed(0)}% boost`;
      tooltipParts.push(`Bench rotation applying a ${multiplierLabel} bonus to recovery.`);
    }

    tooltipParts.push('Unavailable for missions until rotation completes.');
  } else if (normalizedState === 'exhausted' || normalizedState === 'needs-rest') {
    tooltipParts.push('Unavailable for missions until rested.');
  } else if (normalizedState === 'tired') {
    tooltipParts.push('Pushing further could sideline them.');
  } else if (normalizedState === 'captured') {
    tooltipParts.push('Captured during an op — schedule a rescue mission to recover them.');
  } else if (normalizedState === 'injured') {
    tooltipParts.push('Injured in the field — coordinate medical support to bring them back.');
  }

  return {
    label: fatiguePercent !== null ? `${readinessLabel} • ${fatigueLabel}` : readinessLabel,
    tooltip: tooltipParts.join(' '),
    fatiguePercent,
    state: normalizedState,
    restPlan: restPlanSummary,
  };
};

const describeFacilityEffectLine = (facility, { prefix = 'Facility', isActive = false } = {}) => {
  if (!facility) {
    return null;
  }

  const config = getFacilityEffectConfig(facility.id);
  const name = facility.name ?? config?.name ?? 'Facility';
  const effectParts = [];

  if (config) {
    if (Number.isFinite(config.passiveIncomeBonus) && config.passiveIncomeBonus !== 0) {
      const incomeLabel = `${config.passiveIncomeBonus >= 0 ? '+' : '-'}${formatCurrency(Math.abs(config.passiveIncomeBonus))}`;
      effectParts.push(`${incomeLabel} passive income/day`);
    }
    if (Number.isFinite(config.overheadModifierBonus) && config.overheadModifierBonus !== 0) {
      const overheadLabel = `${config.overheadModifierBonus <= 0 ? '-' : '+'}${formatCurrency(Math.abs(config.overheadModifierBonus))}`;
      effectParts.push(`${overheadLabel} daily overhead`);
    }
    if (Number.isFinite(config.dailyHeatReductionBonus) && config.dailyHeatReductionBonus > 0) {
      effectParts.push(`-${config.dailyHeatReductionBonus.toFixed(2)} heat/day`);
    }
    if (Number.isFinite(config.crewRestBonus) && config.crewRestBonus > 0) {
      effectParts.push(`+${Math.round(config.crewRestBonus * 100)}% crew rest recovery`);
    }
  }

  if (!effectParts.length && (facility.summary || config?.summary)) {
    effectParts.push(facility.summary ?? config?.summary ?? '');
  }

  let line = `${prefix}: ${name}`;
  const detail = effectParts.filter(Boolean).join('; ');
  if (detail) {
    line += ` — ${detail}`;
  }

  if (isActive) {
    if (facility.status && facility.status.toLowerCase() !== 'active') {
      line += ` (Active — status: ${facility.status})`;
    } else {
      line += ' (Active)';
    }
  } else if (facility.status) {
    line += ` (Status: ${facility.status})`;
  } else {
    line += ' (Locked)';
  }

  return line;
};

const describeSafehouseTierEffects = (tier, safehouse = null) => {
  const effectLines = [];

  if (!tier && !safehouse) {
    return effectLines;
  }

  const passiveIncome =
    safehouse && typeof safehouse.getPassiveIncome === 'function'
      ? safehouse.getPassiveIncome()
      : Number.isFinite(tier?.passiveIncome)
        ? tier.passiveIncome
        : 0;
  if (Number.isFinite(passiveIncome) && passiveIncome > 0) {
    effectLines.push(`Passive income ${formatCurrency(passiveIncome)} per day.`);
  } else {
    effectLines.push('No passive income bonus yet.');
  }

  const heatReduction =
    safehouse && typeof safehouse.getHeatReduction === 'function'
      ? safehouse.getHeatReduction()
      : Number.isFinite(tier?.heatReduction)
        ? tier.heatReduction
        : 0;
  if (Number.isFinite(heatReduction) && heatReduction > 0) {
    effectLines.push(`Automatic heat reduction ${heatReduction.toFixed(2)} each day.`);
  } else {
    effectLines.push('No automatic heat reduction.');
  }

  const storageCapacity = Number.isFinite(tier?.storageCapacity) ? tier.storageCapacity : null;
  if (Number.isFinite(storageCapacity) && storageCapacity > 0) {
    effectLines.push(`Storage capacity: ${storageCapacity} contraband loads.`);
  }

  const overheadModifier =
    safehouse && typeof safehouse.getOverheadModifier === 'function'
      ? safehouse.getOverheadModifier()
      : Number.isFinite(tier?.overheadModifier)
        ? tier.overheadModifier
        : 0;
  if (Number.isFinite(overheadModifier) && overheadModifier !== 0) {
    effectLines.push(
      overheadModifier < 0
        ? `Cuts daily overhead by ${formatCurrency(Math.abs(overheadModifier))}.`
        : `Adds ${formatCurrency(overheadModifier)} to daily overhead.`,
    );
  }

  const facilityBonuses = safehouse ? computeSafehouseFacilityBonuses(safehouse) : null;
  const activeFacilityIds = new Set(facilityBonuses?.activeFacilityIds ?? []);

  const amenities = safehouse?.getUnlockedAmenities?.()
    ? safehouse.getUnlockedAmenities()
    : Array.isArray(tier?.amenities)
      ? tier.amenities
      : [];
  if (amenities.length) {
    amenities.forEach((amenity) => {
      const line = describeFacilityEffectLine(amenity, {
        prefix: 'Amenity',
        isActive: activeFacilityIds.has(amenity.id),
      });
      if (line) {
        effectLines.push(line);
      }
    });
  } else {
    effectLines.push('No safehouse amenities installed yet.');
  }

  const activeProjects = safehouse?.getActiveProjects?.()
    ? safehouse.getActiveProjects()
    : Array.isArray(tier?.projects)
      ? tier.projects
      : [];
  if (activeProjects.length) {
    activeProjects.forEach((project) => {
      const line = describeFacilityEffectLine(project, {
        prefix: 'Project',
        isActive: activeFacilityIds.has(project.id),
      });
      if (line) {
        effectLines.push(line);
      }
    });
  }

  const upcomingProjects = safehouse?.getUpcomingProjects?.()
    ? safehouse.getUpcomingProjects()
    : [];
  if (upcomingProjects.length) {
    const preview = upcomingProjects
      .slice(0, 2)
      .map((project) => project.name ?? 'Facility upgrade')
      .join(', ');
    effectLines.push(`Upcoming unlocks: ${preview}.`);
  }

  if (tier?.description) {
    effectLines.push(tier.description);
  }

  return effectLines;
};

const renderCrewTraitList = (container, member) => {
  if (!container) {
    return;
  }

  container.innerHTML = '';

  if (!member) {
    const placeholder = document.createElement('li');
    placeholder.textContent = 'Select a crew member to inspect their attributes.';
    container.appendChild(placeholder);
    return;
  }

  if (member.background?.name || member.background?.perkLabel) {
    const backgroundItem = document.createElement('li');
    const perkLabel = member.background?.perkLabel ?? '';
    const backgroundLabel = member.background?.name ?? '';
    backgroundItem.textContent = perkLabel
      ? `${backgroundLabel || 'Background'} — ${perkLabel}`
      : backgroundLabel;
    container.appendChild(backgroundItem);
  }

  const additionalPerks = Array.isArray(member.perks)
    ? member.perks.filter((perk) => perk && perk !== member.background?.perkLabel)
    : [];
  additionalPerks.forEach((perk) => {
    const perkItem = document.createElement('li');
    perkItem.textContent = perk;
    container.appendChild(perkItem);
  });

  CREW_ATTRIBUTE_OPTIONS.map((option) => ({
    key: option.value,
    label: option.label,
    maxLevel: option.maxLevel,
    value: getCrewTraitLevel(member, option.value),
  }))
    .sort((a, b) => {
      if (b.value === a.value) {
        return a.label.localeCompare(b.label);
      }
      return b.value - a.value;
    })
    .forEach((entry) => {
      const item = document.createElement('li');
      item.textContent = `${entry.label}: ${entry.value}/${entry.maxLevel}`;
      container.appendChild(item);
    });
};

const PLAYER_SKILL_OPTIONS = Object.values(PLAYER_SKILL_CONFIG).map((entry) => ({
  value: entry.key,
  label: `${entry.label} — ${entry.description}`,
  cost: entry.trainingCost,
  maxLevel: entry.maxLevel ?? 6,
  baseLevel: entry.baseLevel ?? 1,
})).sort((a, b) => a.label.localeCompare(b.label));

const PLAYER_GEAR_OPTIONS = Object.values(PLAYER_GEAR_CATALOG).map((entry) => ({
  value: entry.id,
  label: `${entry.label} — ${entry.description}`,
  cost: entry.cost,
})).sort((a, b) => a.label.localeCompare(b.label));

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
  playerImpact,
}) => {
  const {
    detailDescription,
    detailPayout,
    detailHeat,
    detailDuration,
    detailSuccess,
    detailRestriction,
    detailCrewImpact,
    detailPlayerImpact,
  } = missionControls;

  if (
    !(
      detailDescription &&
      detailPayout &&
      detailHeat &&
      detailDuration &&
      detailSuccess &&
      detailRestriction &&
      detailCrewImpact &&
      detailPlayerImpact
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

  detailPlayerImpact.innerHTML = '';
  const playerItems = Array.isArray(playerImpact)
    ? playerImpact
    : [playerImpact ?? 'Player influence steady.'];
  playerItems.forEach((line) => {
    const item = document.createElement('li');
    item.textContent = line;
    detailPlayerImpact.appendChild(item);
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
    playerImpact: ['Player expertise steady — train to unlock bonuses.'],
  });
};

const RISK_TIER_DESCRIPTIONS = {
  low: 'Low risk — light patrols and complacent security teams.',
  moderate: 'Moderate risk — rotating patrols and sensor sweeps.',
  high: 'High risk — fortified response teams and dense surveillance.',
};

const describeRiskTier = (tier) => {
  const normalized = String(tier ?? '').trim().toLowerCase();
  if (!normalized) {
    return 'Risk profile pending.';
  }

  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  const summary = RISK_TIER_DESCRIPTIONS[normalized];
  return summary ? `${label} — ${summary}` : `${label} risk tier.`;
};

const describePoiModifiers = (modifiers = {}) => {
  if (!modifiers || typeof modifiers !== 'object') {
    return ['No unique perks detected.'];
  }

  const perks = [];

  const addPercentPerk = (label, multiplier) => {
    if (!Number.isFinite(multiplier)) {
      return;
    }

    const deltaPercent = Math.round((multiplier - 1) * 100);
    if (deltaPercent === 0) {
      return;
    }

    const prefix = deltaPercent > 0 ? '+' : '−';
    perks.push(`${label} ${prefix}${Math.abs(deltaPercent)}%`);
  };

  const addDeltaPerk = (label, value, { decimals = 0, unit = '' } = {}) => {
    if (!Number.isFinite(value)) {
      return;
    }

    const threshold = decimals > 0 ? 1 / 10 ** decimals : 1;
    if (Math.abs(value) < threshold) {
      return;
    }

    const prefix = value > 0 ? '+' : '−';
    const formatted = decimals > 0 ? Math.abs(value).toFixed(decimals) : Math.round(Math.abs(value));
    const suffix = unit ? unit : '';
    perks.push(`${label} ${prefix}${formatted}${suffix}`);
  };

  addPercentPerk('Payout', Number(modifiers.payoutMultiplier));

  if (Number.isFinite(modifiers.payoutDelta) && Math.abs(modifiers.payoutDelta) >= 1) {
    const currency = formatCurrency(Math.abs(modifiers.payoutDelta));
    const normalizedCurrency = currency.startsWith('$-') ? `$${currency.slice(2)}` : currency;
    perks.push(`Payout ${modifiers.payoutDelta >= 0 ? '+' : '−'}${normalizedCurrency}`);
  }

  addPercentPerk('Heat', Number(modifiers.heatMultiplier));
  addDeltaPerk('Heat', Number(modifiers.heatDelta), { decimals: 1 });

  addPercentPerk('Duration', Number(modifiers.durationMultiplier));
  addDeltaPerk('Duration', Number(modifiers.durationDelta), { unit: 's' });

  addPercentPerk('Success', Number(modifiers.successMultiplier));
  if (Number.isFinite(modifiers.successBonus) && Math.abs(modifiers.successBonus) >= 0.005) {
    const percent = Math.round(modifiers.successBonus * 100);
    if (percent !== 0) {
      perks.push(`Success ${percent > 0 ? '+' : '−'}${Math.abs(percent)}%`);
    }
  }
  if (Number.isFinite(modifiers.successDelta) && Math.abs(modifiers.successDelta) >= 0.005) {
    const percent = Math.round(modifiers.successDelta * 100);
    if (percent !== 0) {
      perks.push(`Success ${percent > 0 ? '+' : '−'}${Math.abs(percent)}%`);
    }
  }

  if (!perks.length) {
    return ['No unique perks detected.'];
  }

  return [...new Set(perks)];
};

const setCityIntelDetails = ({
  districtName,
  districtDescription,
  risk,
  poiName,
  poiDescription,
  poiPerks,
}) => {
  const {
    cityIntelDistrictName,
    cityIntelDistrictDescription,
    cityIntelRisk,
    cityIntelPoiName,
    cityIntelPoiDescription,
    cityIntelPoiPerks,
  } = missionControls;

  if (
    !(
      cityIntelDistrictName &&
      cityIntelDistrictDescription &&
      cityIntelRisk &&
      cityIntelPoiName &&
      cityIntelPoiDescription &&
      cityIntelPoiPerks
    )
  ) {
    return;
  }

  cityIntelDistrictName.textContent = districtName;
  cityIntelDistrictDescription.textContent = districtDescription;
  cityIntelRisk.textContent = risk;
  cityIntelPoiName.textContent = poiName;
  cityIntelPoiDescription.textContent = poiDescription;

  cityIntelPoiPerks.innerHTML = '';
  const perkLines = Array.isArray(poiPerks) && poiPerks.length ? poiPerks : ['No unique perks detected.'];
  perkLines.forEach((line) => {
    const item = document.createElement('li');
    item.textContent = line;
    cityIntelPoiPerks.appendChild(item);
  });
};

const resetCityIntelPanel = () => {
  setCityIntelDetails({
    districtName: 'District intel unavailable.',
    districtDescription: 'Select a contract to load local surveillance notes.',
    risk: 'Risk profile pending.',
    poiName: 'No special target flagged.',
    poiDescription: 'District sweep awaiting recon.',
    poiPerks: ['No unique perks detected.'],
  });
};

const normalizeDistrictKey = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const key = String(value).trim().toLowerCase();
  return key ? key : null;
};

const createDistrictKeyFromDistrict = (district) => {
  const idKey = normalizeDistrictKey(district?.id);
  if (idKey) {
    return `id:${idKey}`;
  }

  const nameKey = normalizeDistrictKey(district?.name);
  if (nameKey) {
    return `name:${nameKey}`;
  }

  return null;
};

const createDistrictKeyFromMission = (mission) => {
  if (!mission) {
    return null;
  }

  const idKey = normalizeDistrictKey(mission.districtId);
  if (idKey) {
    return `id:${idKey}`;
  }

  const nameKey = normalizeDistrictKey(mission.districtName);
  if (nameKey) {
    return `name:${nameKey}`;
  }

  return null;
};

const findDistrictForMission = (districts, mission) => {
  if (!Array.isArray(districts) || !mission) {
    return null;
  }

  const idKey = normalizeDistrictKey(mission.districtId);
  if (idKey) {
    const byId = districts.find((district) => normalizeDistrictKey(district?.id) === idKey);
    if (byId) {
      return byId;
    }
  }

  const nameKey = normalizeDistrictKey(mission.districtName);
  if (nameKey) {
    const byName = districts.find((district) => normalizeDistrictKey(district?.name) === nameKey);
    if (byName) {
      return byName;
    }
  }

  return null;
};

const DISTRICT_RISK_TIER_ORDER = ['low', 'moderate', 'high'];

const shiftRiskTier = (tier, shift = 0) => {
  const index = DISTRICT_RISK_TIER_ORDER.indexOf(tier);
  const baseIndex = index === -1 ? 0 : index;
  const offset = Number.isFinite(shift) ? Math.trunc(shift) : 0;
  const nextIndex = Math.max(0, Math.min(DISTRICT_RISK_TIER_ORDER.length - 1, baseIndex + offset));
  return DISTRICT_RISK_TIER_ORDER[nextIndex];
};

const determineDistrictRiskTier = (securityScore, notorietyProfile = null) => {
  const normalized = Number(securityScore);
  if (!Number.isFinite(normalized)) {
    return null;
  }

  let tier = 'low';
  if (normalized >= 4) {
    tier = 'high';
  } else if (normalized >= 3) {
    tier = 'moderate';
  }

  const missionSystem = getMissionSystem();
  const profile =
    notorietyProfile ??
    (missionSystem && typeof missionSystem.getPlayerNotorietyProfile === 'function'
      ? missionSystem.getPlayerNotorietyProfile()
      : getNotorietyProfile(getSharedState()?.player?.notoriety ?? 0));

  if (profile && Number.isFinite(profile.riskShift) && profile.riskShift > 0) {
    tier = shiftRiskTier(tier, profile.riskShift);
  }

  return tier;
};

const renderCityIntelMap = ({ districts = [], highlightedMission = null, activeMission = null } = {}) => {
  const canvas = missionControls.cityIntelCanvas;
  if (!canvas) {
    return;
  }

  const context =
    missionControls.cityIntelCanvasContext &&
    missionControls.cityIntelCanvasContext.canvas === canvas
      ? missionControls.cityIntelCanvasContext
      : canvas.getContext('2d');
  if (!context) {
    return;
  }

  missionControls.cityIntelCanvasContext = context;

  context.save();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#0b131d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = 'rgba(120, 190, 255, 0.45)';
  context.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

  const districtList = Array.isArray(districts) ? districts : [];
  if (!districtList.length) {
    context.fillStyle = '#9ac7ff';
    context.font = '14px "Segoe UI", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('City intel offline', canvas.width / 2, canvas.height / 2);
    context.restore();
    return;
  }

  const highlightKey = createDistrictKeyFromMission(highlightedMission);
  const activeKey = createDistrictKeyFromMission(activeMission);

  const paddingX = 12;
  const paddingY = 18;
  const availableHeight = Math.max(canvas.height - paddingY * 2, 20);
  const rowHeightRaw = availableHeight / Math.max(districtList.length, 1);
  const rowHeight = Math.max(26, Math.min(48, rowHeightRaw));
  const totalRowsHeight = rowHeight * districtList.length;
  const verticalOffset = paddingY + Math.max(0, (availableHeight - totalRowsHeight) / 2);

  context.font = '14px "Segoe UI", sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'top';

  districtList.forEach((district, index) => {
    const cellX = paddingX;
    const cellWidth = canvas.width - paddingX * 2;
    const cellY = verticalOffset + index * rowHeight;
    const cellHeight = rowHeight - 6;

    const districtKey = createDistrictKeyFromDistrict(district);
    const isHighlighted = Boolean(highlightKey && districtKey === highlightKey);
    const isActive = Boolean(activeKey && districtKey === activeKey);

    let fillColor = 'rgba(80, 120, 180, 0.18)';
    let borderColor = 'rgba(120, 190, 255, 0.3)';
    let nameColor = '#d1eaff';
    let detailColor = '#9ac7ff';

    if (isActive && !isHighlighted) {
      fillColor = 'rgba(120, 190, 255, 0.28)';
      borderColor = 'rgba(120, 190, 255, 0.55)';
      nameColor = '#c2e6ff';
    }

    if (isHighlighted) {
      fillColor = 'rgba(255, 214, 102, 0.38)';
      borderColor = 'rgba(255, 214, 102, 0.8)';
      nameColor = '#ffe27a';
      detailColor = '#ffd15c';
    }

    context.fillStyle = fillColor;
    context.fillRect(cellX, cellY, cellWidth, cellHeight);
    context.strokeStyle = borderColor;
    context.strokeRect(cellX + 0.5, cellY + 0.5, cellWidth - 1, cellHeight - 1);

    const riskTier = determineDistrictRiskTier(district?.security);
    const riskLabel = riskTier
      ? `${riskTier.charAt(0).toUpperCase() + riskTier.slice(1)} risk`
      : 'Risk unknown';

    const labelY = cellY + 6;
    context.fillStyle = nameColor;
    context.fillText(district?.name ?? 'Unknown District', cellX + 8, labelY);
    context.fillStyle = detailColor;
    context.fillText(riskLabel, cellX + 8, labelY + 16);
  });

  context.restore();
};

const updateCityIntelPanel = ({ missionSystem, highlightedMission, activeMission }) => {
  const city = missionSystem?.state?.city ?? null;
  const districts = Array.isArray(city?.districts) ? city.districts : [];

  const mission = highlightedMission ?? activeMission ?? null;
  if (!mission) {
    resetCityIntelPanel();
    renderCityIntelMap({ districts, highlightedMission: null, activeMission });
    return;
  }

  const district = findDistrictForMission(districts, mission);
  const districtName = district?.name ?? mission.districtName ?? 'Unknown District';
  const districtDescription =
    district?.description ?? mission.description ?? 'No additional intel available.';
  const riskTier = mission.riskTier ?? determineDistrictRiskTier(district?.security);
  const riskLabel = describeRiskTier(riskTier);
  const poi = mission.pointOfInterest ?? null;
  const poiName = poi?.name ?? 'No special target flagged.';
  const poiDescription = poi?.description ?? 'No notable point of interest for this contract.';
  const poiPerks = describePoiModifiers(poi?.modifiers ?? {});

  setCityIntelDetails({
    districtName,
    districtDescription,
    risk: riskLabel,
    poiName,
    poiDescription,
    poiPerks,
  });

  renderCityIntelMap({ districts, highlightedMission: mission, activeMission });
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
    case 'decision-required':
      return `${mission.name} needs direction — ${progressPercent}% complete (awaiting your call)`;
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

  if (report.outcome === 'upgrade') {
    const upgradeProfile = report.upgradeId ? VEHICLE_UPGRADE_CATALOG?.[report.upgradeId] : null;
    const upgradeLabel = report.upgradeLabel ?? upgradeProfile?.label ?? 'Upgrade';
    const costLabel = Number.isFinite(report.cost) && report.cost > 0
      ? ` (${formatCurrency(report.cost)})`
      : '';
    const detail = upgradeProfile?.summary ?? upgradeProfile?.description ?? '';
    const detailLabel = detail ? ` ${detail}` : '';
    return `${modelLabel} installed ${upgradeLabel}${costLabel}.${detailLabel}`.trim();
  }

  if (report.outcome === 'storage-blocked') {
    const capacity = Number.isFinite(report.storageCapacity) ? report.storageCapacity : null;
    const garageSize = Number.isFinite(report.garageSize) ? report.garageSize : null;
    if (capacity !== null && garageSize !== null) {
      return `${modelLabel} stalled — garage capacity ${garageSize}/${capacity}. Sell or scrap to free space.`;
    }
    return `${modelLabel} stalled — garage full. Sell or scrap to free space.`;
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

const setPlayerStatus = (message) => {
  if (!missionControls.playerStatus) {
    return;
  }

  missionControls.playerStatus.textContent = message ?? '';
};

const setMissionEventStatus = (message) => {
  const { eventStatus } = missionControls;
  if (!eventStatus) {
    return;
  }

  const detail = typeof message === 'string' ? message.trim() : '';
  missionControls.eventStatusDetail = detail;
  eventStatus.textContent = detail;
};

const formatEventEffectSummary = (effects) => {
  if (!effects || typeof effects !== 'object') {
    return '';
  }

  const parts = [];

  const payoutMultiplier = Number(effects.payoutMultiplier);
  if (Number.isFinite(payoutMultiplier) && Math.abs(payoutMultiplier - 1) >= 0.01) {
    parts.push(`Payout x${payoutMultiplier.toFixed(2)}`);
  }

  const payoutDelta = Number(effects.payoutDelta);
  if (Number.isFinite(payoutDelta) && Math.round(payoutDelta) !== 0) {
    const amount = Math.abs(Math.round(payoutDelta));
    parts.push(`Payout ${payoutDelta > 0 ? '+' : '-'}$${amount.toLocaleString()}`);
  }

  const heatMultiplier = Number(effects.heatMultiplier);
  if (Number.isFinite(heatMultiplier) && Math.abs(heatMultiplier - 1) >= 0.01) {
    parts.push(`Heat x${heatMultiplier.toFixed(2)}`);
  }

  const heatDelta = Number(effects.heatDelta);
  if (Number.isFinite(heatDelta) && Math.abs(heatDelta) >= 0.05) {
    parts.push(`Heat ${heatDelta > 0 ? '+' : ''}${heatDelta.toFixed(1)}`);
  }

  const successDelta = Number(effects.successDelta);
  if (Number.isFinite(successDelta) && Math.abs(successDelta) >= 0.005) {
    const percent = Math.round(successDelta * 100);
    parts.push(`Success ${successDelta > 0 ? '+' : ''}${percent}%`);
  }

  const durationMultiplier = Number(effects.durationMultiplier);
  if (Number.isFinite(durationMultiplier) && Math.abs(durationMultiplier - 1) >= 0.01) {
    const deltaPercent = Math.round((durationMultiplier - 1) * 100);
    parts.push(`Duration ${deltaPercent > 0 ? '+' : ''}${deltaPercent}%`);
  }

  const durationDelta = Number(effects.durationDelta);
  if (Number.isFinite(durationDelta) && Math.abs(durationDelta) >= 1) {
    parts.push(`Duration ${durationDelta > 0 ? '+' : ''}${Math.round(durationDelta)}s`);
  }

  const loyaltyDelta = Number(effects.crewLoyaltyDelta);
  if (Number.isFinite(loyaltyDelta) && loyaltyDelta !== 0) {
    parts.push(`Crew loyalty ${loyaltyDelta > 0 ? '+' : ''}${loyaltyDelta}`);
  }

  return parts.join(', ');
};

const updateSafehousePanel = () => {
  const {
    safehouseName,
    safehouseTier,
    safehouseEffects,
    safehouseList,
    safehouseUpgradeButton,
    safehouseStatus,
  } = missionControls;

  if (
    !safehouseName ||
    !safehouseTier ||
    !safehouseEffects ||
    !safehouseList ||
    !safehouseUpgradeButton ||
    !safehouseStatus
  ) {
    return;
  }

  const economySystem = getEconomySystem();
  const state = getSharedState();

  const renderEffects = (lines) => {
    safehouseEffects.innerHTML = '';
    if (!lines.length) {
      const item = document.createElement('li');
      item.textContent = 'No safehouse perks available.';
      safehouseEffects.appendChild(item);
      return;
    }

    lines.forEach((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      safehouseEffects.appendChild(item);
    });
  };

  const renderSafehouseCatalog = (
    entries,
    { activeId = null, funds = 0, canPurchase = false, canAssign = false } = {},
  ) => {
    safehouseList.innerHTML = '';

    const safehouseEntries = Array.isArray(entries) ? entries : [];
    if (!safehouseEntries.length) {
      const emptyMessage = document.createElement('p');
      emptyMessage.className = 'mission-safehouse__entry mission-safehouse__entry--empty';
      emptyMessage.textContent = 'No safehouses discovered yet. Keep progressing through the campaign.';
      safehouseList.appendChild(emptyMessage);
      return;
    }

    safehouseEntries.forEach((entry) => {
      if (!entry) {
        return;
      }

      const safehouseId = entry.id;
      const isOwned = Boolean(entry.isOwned?.() ?? entry.owned);
      const isActive = Boolean(activeId && safehouseId && activeId === safehouseId);
      const rawPurchaseCost =
        typeof entry.getPurchaseCost === 'function' ? entry.getPurchaseCost() : entry.purchaseCost;
      const purchaseCost = Number.isFinite(rawPurchaseCost) ? rawPurchaseCost : 0;
      const previewTier = isOwned ? entry.getCurrentTier?.() ?? entry.getTier?.(0) : entry.getTier?.(0);
      const perks = describeSafehouseTierEffects(previewTier, isOwned ? entry : null);

      const card = document.createElement('article');
      card.className = 'mission-safehouse__entry';

      const title = document.createElement('h3');
      title.className = 'mission-safehouse__entry-name';
      title.textContent = entry.name ?? 'Safehouse';
      card.appendChild(title);

      if (entry.location) {
        const location = document.createElement('p');
        location.className = 'mission-safehouse__entry-location';
        location.textContent = entry.location;
        card.appendChild(location);
      }

      const statusLine = document.createElement('p');
      statusLine.className = 'mission-safehouse__entry-status';
      if (isActive) {
        statusLine.textContent = 'Active safehouse';
      } else if (isOwned) {
        statusLine.textContent = 'Owned hideout — assign to make it your base.';
      } else if (Number.isFinite(purchaseCost) && purchaseCost > 0) {
        statusLine.textContent = `Locked — costs ${formatCurrency(purchaseCost)} to secure.`;
      } else {
        statusLine.textContent = 'Locked safehouse ready to claim.';
      }
      card.appendChild(statusLine);

      const perksList = document.createElement('ul');
      perksList.className = 'mission-safehouse__entry-perks';
      if (perks.length) {
        perks.forEach((perk) => {
          const item = document.createElement('li');
          item.textContent = perk;
          perksList.appendChild(item);
        });
      } else {
        const item = document.createElement('li');
        item.textContent = 'No perk data available yet.';
        perksList.appendChild(item);
      }
      card.appendChild(perksList);

      const actionButton = document.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'button button--secondary mission-safehouse__entry-action';
      actionButton.dataset.safehouseId = safehouseId ?? '';

      if (!safehouseId) {
        actionButton.disabled = true;
        actionButton.textContent = 'Unavailable';
        actionButton.title = 'This safehouse lacks a valid identifier.';
      } else if (isActive) {
        actionButton.disabled = true;
        actionButton.textContent = 'Assigned';
        actionButton.title = 'Currently designated as the crew’s base.';
      } else if (!isOwned) {
        const canEngage = Boolean(canPurchase);
        const canAfford = Number.isFinite(purchaseCost) ? funds >= purchaseCost : true;
        actionButton.dataset.action = 'purchase';
        actionButton.textContent =
          Number.isFinite(purchaseCost) && purchaseCost > 0
            ? `Purchase (${formatCurrency(purchaseCost)})`
            : 'Unlock';
        actionButton.disabled = !canEngage || !canAfford;
        if (!canEngage) {
          actionButton.title = 'Economy systems offline.';
        } else if (!canAfford) {
          actionButton.title = `Requires ${formatCurrency(purchaseCost)} — available ${formatCurrency(funds)}.`;
        } else {
          actionButton.title = `Secure ${entry.name ?? 'this safehouse'} for the crew.`;
        }
      } else {
        const canEngage = Boolean(canAssign);
        actionButton.dataset.action = 'assign';
        actionButton.textContent = 'Assign';
        actionButton.disabled = !canEngage;
        actionButton.title = canEngage
          ? `Move operations to ${entry.name ?? 'this safehouse'}.`
          : 'Crew roster unavailable for reassignment.';
      }

      card.appendChild(actionButton);
      safehouseList.appendChild(card);
    });
  };

  if (!state) {
    safehouseName.textContent = 'Safehouse network offline.';
    safehouseTier.textContent = '—';
    renderEffects(['Safehouse systems syncing…']);
    safehouseList.innerHTML = '';
    const placeholder = document.createElement('p');
    placeholder.className = 'mission-safehouse__entry mission-safehouse__entry--placeholder';
    placeholder.textContent = 'Safehouse manifest offline.';
    safehouseList.appendChild(placeholder);
    safehouseUpgradeButton.disabled = true;
    safehouseUpgradeButton.title = 'Safehouse systems offline.';
    safehouseUpgradeButton.textContent = 'Upgrade Safehouse';
    const detail = missionControls.safehouseStatusDetail?.trim();
    const summary = 'Safehouse telemetry unavailable.';
    safehouseStatus.textContent = [detail, summary].filter(Boolean).join(' ');
    return;
  }

  const safehouse = getActiveSafehouseFromState(state);
  const tier = safehouse?.getCurrentTier?.() ?? null;

  if (safehouse) {
    const nameLabel = `${safehouse.name}${safehouse.location ? ` — ${safehouse.location}` : ''}`;
    safehouseName.textContent = nameLabel;
    safehouseTier.textContent = tier?.label ?? 'Unranked';
    renderEffects(describeSafehouseTierEffects(tier, safehouse));
  } else {
    safehouseName.textContent = 'No safehouse assigned';
    safehouseTier.textContent = '—';
    renderEffects(['Assign a safehouse to unlock bonuses.']);
  }

  const funds = Number.isFinite(state.funds) ? state.funds : 0;
  const safehouseCollection = state.safehouses;
  const allSafehouses = typeof safehouseCollection?.toArray === 'function' ? safehouseCollection.toArray() : [];
  renderSafehouseCatalog(allSafehouses, {
    activeId: safehouse?.id ?? state.player?.safehouseId ?? null,
    funds,
    canPurchase: Boolean(economySystem),
    canAssign: Boolean(state.player),
  });

  const nextTier = safehouse?.getNextTier?.() ?? null;
  let summaryMessage;

  if (!economySystem) {
    safehouseUpgradeButton.disabled = true;
    safehouseUpgradeButton.title = safehouse ? 'Economy systems offline.' : 'Safehouse systems offline.';
    safehouseUpgradeButton.textContent = 'Upgrade Safehouse';
    summaryMessage = 'Economy systems offline.';
  } else if (!safehouse) {
    safehouseUpgradeButton.disabled = true;
    safehouseUpgradeButton.title = 'Assign a safehouse to unlock bonuses.';
    safehouseUpgradeButton.textContent = 'Upgrade Safehouse';
    summaryMessage = 'Assign a safehouse to unlock bonuses.';
  } else if (!(safehouse.isOwned?.() ?? safehouse.owned ?? false)) {
    safehouseUpgradeButton.disabled = true;
    safehouseUpgradeButton.title = 'Secure this safehouse before upgrading.';
    safehouseUpgradeButton.textContent = 'Upgrade Safehouse';
    summaryMessage = 'Purchase this safehouse to enable upgrades.';
  } else if (!nextTier) {
    safehouseUpgradeButton.disabled = true;
    safehouseUpgradeButton.title = 'Safehouse fully upgraded.';
    safehouseUpgradeButton.textContent = 'Max Tier Reached';
    summaryMessage = 'Safehouse fully upgraded.';
  } else {
    const upgradeCost = Number.isFinite(nextTier.upgradeCost) ? nextTier.upgradeCost : 0;
    const canAfford = funds >= upgradeCost;
    safehouseUpgradeButton.disabled = !canAfford;
    safehouseUpgradeButton.title = canAfford
      ? `Advance to ${nextTier.label ?? 'next tier'}`
      : 'Insufficient funds for upgrade.';
    safehouseUpgradeButton.textContent = `Upgrade (${formatCurrency(upgradeCost)})`;
    summaryMessage = canAfford
      ? `Upgrade to ${nextTier.label ?? 'next tier'} for ${formatCurrency(upgradeCost)}.`
      : `Requires ${formatCurrency(upgradeCost)} — available ${formatCurrency(funds)}.`;
  }

  const detail = missionControls.safehouseStatusDetail?.trim();
  safehouseStatus.textContent = [detail, summaryMessage].filter(Boolean).join(' ');
};

const clearMaintenanceStatusDetail = () => {
  missionControls.maintenanceStatusDetail = '';
};

const renderHeatMitigationHistory = (historyEntries) => {
  const list = missionControls.heatHistoryList;
  if (!list) {
    return;
  }

  list.innerHTML = '';

  const entries = Array.isArray(historyEntries) ? historyEntries.slice(0, 6) : [];

  if (!entries.length) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'mission-heat-history__item mission-heat-history__item--empty';
    emptyItem.textContent = 'No heat mitigation actions recorded yet.';
    list.appendChild(emptyItem);
    return;
  }

  entries.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'mission-heat-history__item';

    const header = document.createElement('div');
    header.className = 'mission-heat-history__row';

    const label = document.createElement('span');
    label.className = 'mission-heat-history__label';
    label.textContent = entry?.label ?? 'Heat mitigation';

    const normalizedDelta = Number.isFinite(entry?.reductionApplied)
      ? entry.reductionApplied
      : Number.isFinite(entry?.heatDelta)
        ? Math.abs(entry.heatDelta)
        : null;
    const delta = document.createElement('span');
    delta.className = 'mission-heat-history__delta';
    delta.textContent = Number.isFinite(normalizedDelta)
      ? `-${normalizedDelta.toFixed(1)} heat`
      : '—';

    header.append(label, delta);
    item.appendChild(header);

    const metaSegments = [];
    const timestampValue = Number.isFinite(entry?.timestamp) ? entry.timestamp : null;
    if (timestampValue) {
      const time = new Date(timestampValue).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      metaSegments.push(time);
    }

    const fundsSpent = Number.isFinite(entry?.fundsSpent) ? entry.fundsSpent : 0;
    metaSegments.push(`Spent ${formatCurrency(fundsSpent)}`);

    const heatAfter = Number.isFinite(entry?.heatAfter) ? entry.heatAfter : null;
    if (Number.isFinite(heatAfter)) {
      metaSegments.push(`Now ${formatHeatValue(heatAfter)} heat`);
    }

    const meta = document.createElement('div');
    meta.className = 'mission-heat-history__meta';
    meta.textContent = metaSegments.join(' • ');
    item.appendChild(meta);

    list.appendChild(item);
  });
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
  const mitigationLog = Array.isArray(state?.heatMitigationLog)
    ? state.heatMitigationLog
    : Array.isArray(heatSystem?.state?.heatMitigationLog)
      ? heatSystem.state.heatMitigationLog
      : [];

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
  renderHeatMitigationHistory(mitigationLog);
};

const updateMaintenancePanel = () => {
  const {
    maintenanceStatus,
    maintenanceRepairButton,
    maintenanceHeatButton,
    maintenanceUpgradeSelect,
    maintenanceUpgradeButton,
    maintenanceUpgradeList,
  } = missionControls;

  if (
    !maintenanceStatus
    || !maintenanceRepairButton
    || !maintenanceHeatButton
    || !maintenanceUpgradeSelect
    || !maintenanceUpgradeButton
    || !maintenanceUpgradeList
  ) {
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
  const latestVehicleReport = missionSystem?.state?.lastVehicleReport ?? null;

  const resolvedCapacity = (() => {
    if (economySystem && typeof economySystem.getActiveStorageCapacity === 'function') {
      const capacity = economySystem.getActiveStorageCapacity();
      if (Number.isFinite(capacity) && capacity >= 0) {
        return capacity;
      }
    }

    const fallback = getActiveStorageCapacityFromState(state);
    if (Number.isFinite(fallback) && fallback >= 0) {
      return fallback;
    }

    return null;
  })();

  const hasFiniteCapacity = Number.isFinite(resolvedCapacity);
  const garageSize = garage.length;
  const atCapacity = hasFiniteCapacity ? garageSize >= resolvedCapacity : false;
  const overCapacity = hasFiniteCapacity ? garageSize > resolvedCapacity : false;
  const capacitySegments = [];

  if (hasFiniteCapacity) {
    const baseLabel = `Garage capacity: ${garageSize}/${resolvedCapacity}.`;
    if (overCapacity) {
      capacitySegments.push(
        `${baseLabel} Over capacity — sell or scrap vehicles immediately.`,
      );
    } else if (atCapacity) {
      capacitySegments.push(
        `${baseLabel} Storage full — sell or scrap to claim new vehicles.`,
      );
    } else {
      const slotsFree = Math.max(0, resolvedCapacity - garageSize);
      capacitySegments.push(
        `${baseLabel} ${slotsFree === 1 ? '1 slot' : `${slotsFree} slots`} available.`,
      );
    }
  } else {
    capacitySegments.push(`Garage capacity telemetry unavailable — ${garageSize} vehicles stored.`);
  }

  if (latestVehicleReport?.outcome === 'storage-blocked') {
    const reportSummary = describeVehicleReportOutcome(latestVehicleReport);
    if (reportSummary) {
      capacitySegments.push(reportSummary);
    }
  }

  const capacityMessage = capacitySegments.join(' ').trim();

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

  const upgradeEntries = Object.values(VEHICLE_UPGRADE_CATALOG ?? {}).sort((a, b) => {
    const aLabel = (a?.label ?? '').toLowerCase();
    const bLabel = (b?.label ?? '').toLowerCase();
    return aLabel.localeCompare(bLabel);
  });

  const installedMods = hasSelection
    ? typeof selectedVehicle.getInstalledMods === 'function'
      ? selectedVehicle.getInstalledMods()
      : Array.isArray(selectedVehicle.installedMods)
        ? selectedVehicle.installedMods.slice()
        : []
    : [];

  maintenanceUpgradeList.innerHTML = '';
  if (!hasSelection) {
    const item = document.createElement('li');
    item.textContent = 'Select a vehicle to review installed upgrades.';
    item.className = 'mission-maintenance__upgrade-item mission-maintenance__upgrade-item--empty';
    maintenanceUpgradeList.appendChild(item);
  } else if (!installedMods.length) {
    const item = document.createElement('li');
    item.textContent = 'No upgrades installed yet.';
    item.className = 'mission-maintenance__upgrade-item mission-maintenance__upgrade-item--empty';
    maintenanceUpgradeList.appendChild(item);
  } else {
    installedMods.forEach((modId) => {
      const profile = VEHICLE_UPGRADE_CATALOG?.[modId] ?? null;
      const label = profile?.label ?? modId;
      const summary = profile?.summary ?? profile?.description ?? 'Effect profile unavailable.';
      const item = document.createElement('li');
      item.className = 'mission-maintenance__upgrade-item';
      item.textContent = `${label} — ${summary}`;
      maintenanceUpgradeList.appendChild(item);
    });
  }

  const previousUpgradeSelection = maintenanceUpgradeSelect.value;
  maintenanceUpgradeSelect.innerHTML = '';
  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = hasSelection
    ? 'Select an upgrade'
    : 'Select a vehicle to view upgrades';
  placeholderOption.disabled = true;
  placeholderOption.selected = true;
  maintenanceUpgradeSelect.appendChild(placeholderOption);

  upgradeEntries.forEach((upgrade) => {
    if (!upgrade?.id) {
      return;
    }
    const option = document.createElement('option');
    option.value = upgrade.id;
    const costLabel = Number.isFinite(upgrade.cost) && upgrade.cost > 0
      ? ` — ${formatCurrency(upgrade.cost)}`
      : '';
    option.textContent = `${upgrade.label ?? upgrade.id}${costLabel}`;
    if (installedMods.includes(upgrade.id)) {
      option.disabled = true;
      option.textContent = `${option.textContent} (Installed)`;
    }
    maintenanceUpgradeSelect.appendChild(option);
  });

  const hasUpgradeSelection = Boolean(
    hasSelection
      && previousUpgradeSelection
      && maintenanceUpgradeSelect.querySelector(`option[value="${previousUpgradeSelection}"]`)
      && !installedMods.includes(previousUpgradeSelection),
  );
  if (hasUpgradeSelection) {
    maintenanceUpgradeSelect.value = previousUpgradeSelection;
  } else {
    maintenanceUpgradeSelect.selectedIndex = 0;
  }

  maintenanceUpgradeSelect.disabled = !systemsReady || !hasSelection || !upgradeEntries.length;
  maintenanceUpgradeSelect.title = !hasSelection
    ? 'Select a garage vehicle to review upgrades.'
    : systemsReady
      ? ''
      : 'Maintenance systems offline.';

  const selectedUpgradeId = maintenanceUpgradeSelect.value || '';
  const selectedUpgrade = selectedUpgradeId ? VEHICLE_UPGRADE_CATALOG?.[selectedUpgradeId] ?? null : null;
  const upgradeInstalled = selectedUpgradeId ? installedMods.includes(selectedUpgradeId) : false;
  const upgradeCost = selectedUpgrade && Number.isFinite(selectedUpgrade.cost) && selectedUpgrade.cost > 0
    ? selectedUpgrade.cost
    : 0;

  const canInstallUpgrade = systemsReady
    && hasSelection
    && selectedUpgrade
    && !upgradeInstalled
    && funds >= upgradeCost;

  maintenanceUpgradeButton.disabled = !canInstallUpgrade;
  maintenanceUpgradeButton.textContent = selectedUpgrade
    ? `Install (${formatCurrency(upgradeCost)})`
    : 'Install Upgrade';

  if (!selectedUpgrade) {
    maintenanceUpgradeButton.title = hasSelection
      ? 'Select an upgrade to install.'
      : 'Select a garage vehicle to install upgrades.';
  } else if (upgradeInstalled) {
    maintenanceUpgradeButton.title = 'Upgrade already installed on this vehicle.';
  } else if (!systemsReady) {
    maintenanceUpgradeButton.title = 'Maintenance systems offline.';
  } else if (funds < upgradeCost) {
    maintenanceUpgradeButton.title = `Insufficient funds — requires ${formatCurrency(upgradeCost)}.`;
  } else {
    maintenanceUpgradeButton.title = '';
  }

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

  if (capacityMessage) {
    summaryMessage = `${summaryMessage} ${capacityMessage}`.trim();
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

  const upgradeSummarySegments = upgradeEntries.map((upgrade) => {
    if (!upgrade?.id) {
      return null;
    }
    if (installedMods.includes(upgrade.id)) {
      return `${upgrade.label ?? upgrade.id} installed`;
    }
    const costLabel = Number.isFinite(upgrade.cost) && upgrade.cost > 0
      ? formatCurrency(upgrade.cost)
      : formatCurrency(0);
    if (!systemsReady || !hasSelection) {
      return `${upgrade.label ?? upgrade.id} (${costLabel})`;
    }
    if (funds >= (upgrade.cost ?? 0)) {
      return `${upgrade.label ?? upgrade.id} ready (${costLabel})`;
    }
    return `${upgrade.label ?? upgrade.id} needs ${costLabel}`;
  }).filter(Boolean);

  const upgradeSummaryMessage = upgradeSummarySegments.length
    ? `Upgrades: ${upgradeSummarySegments.join('; ')}.`
    : upgradeEntries.length
      ? ''
      : 'No garage upgrades cataloged.';

  let focusUpgradeMessage = '';
  if (selectedUpgrade) {
    const summary = selectedUpgrade.summary ?? selectedUpgrade.description ?? '';
    const parts = [`${selectedUpgrade.label ?? selectedUpgrade.id}`];
    if (summary) {
      parts.push(summary);
    }
    if (upgradeInstalled) {
      parts.push('Already installed.');
    } else if (funds < upgradeCost) {
      parts.push(`Requires ${formatCurrency(upgradeCost)}.`);
    } else {
      parts.push(`Cost ${formatCurrency(upgradeCost)}.`);
    }
    focusUpgradeMessage = `${parts.join(' ')}`;
  }

  const detail = missionControls.maintenanceStatusDetail?.trim();
  maintenanceStatus.textContent = [
    detail,
    summaryMessage,
    upgradeSummaryMessage,
    focusUpgradeMessage,
  ]
    .filter(Boolean)
    .join(' ');
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

const handleMaintenanceUpgrade = () => {
  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();

  if (!missionSystem || !economySystem) {
    missionControls.maintenanceStatusDetail = 'Maintenance systems offline.';
    updateMaintenancePanel();
    return;
  }

  const vehicleId = missionControls.selectedVehicleId;
  if (!vehicleId) {
    missionControls.maintenanceStatusDetail = 'Select a garage vehicle before installing upgrades.';
    updateMaintenancePanel();
    return;
  }

  const upgradeSelect = missionControls.maintenanceUpgradeSelect;
  const upgradeId = upgradeSelect?.value;
  if (!upgradeId) {
    missionControls.maintenanceStatusDetail = 'Select an upgrade to install.';
    updateMaintenancePanel();
    return;
  }

  const result = missionSystem.purchaseVehicleUpgrade(vehicleId, upgradeId, economySystem);
  if (!result || !result.success) {
    let failureMessage = 'Upgrade could not be installed.';
    if (result?.reason === 'insufficient-funds') {
      const required = formatCurrency(result.cost ?? 0);
      const available = formatCurrency(result.fundsAvailable ?? missionSystem.state.funds ?? 0);
      failureMessage = `Insufficient funds — requires ${required}, available ${available}.`;
    } else if (result?.reason === 'vehicle-not-found') {
      failureMessage = 'Selected vehicle no longer in the garage.';
    } else if (result?.reason === 'already-installed') {
      failureMessage = 'Upgrade already installed on this vehicle.';
    } else if (result?.reason === 'unknown-upgrade') {
      failureMessage = 'Upgrade unavailable — refresh the catalog and try again.';
    }

    missionControls.maintenanceStatusDetail = failureMessage;
    updateMaintenancePanel();
    return;
  }

  const profile = result.upgradeId ? VEHICLE_UPGRADE_CATALOG?.[result.upgradeId] ?? null : null;
  const summary = profile?.summary ?? profile?.description ?? '';
  const segments = [
    `Installed ${result.upgradeLabel ?? 'upgrade'} on ${result.vehicleModel ?? 'vehicle'}`,
  ];
  if (Number.isFinite(result.cost) && result.cost > 0) {
    segments.push(`Cost ${formatCurrency(result.cost)}.`);
  }
  if (summary) {
    segments.push(summary);
  }

  missionControls.maintenanceStatusDetail = segments.join(' ');

  if (upgradeSelect) {
    upgradeSelect.selectedIndex = 0;
  }

  updateMissionControls();
  triggerHudRender();
};

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

  const finalizeMitigation = (mitigationResult) => {
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
    updateHeatManagementPanel();
    triggerHudRender();
  };

  const handleMitigationError = (error) => {
    console.error('Heat mitigation failed', error);
    missionControls.heatStatusDetail = 'Heat mitigation failed unexpectedly.';
    updateHeatManagementPanel();
  };

  try {
    const mitigationOutcome = executeHeatMitigation({
      heatSystem,
      missionSystem,
      economySystem,
      reduction: action.heatReduction,
      cost,
      label: action.label,
      metadata: { action: action.key },
    });

    if (mitigationOutcome && typeof mitigationOutcome.then === 'function') {
      mitigationOutcome.then(finalizeMitigation).catch(handleMitigationError);
    } else {
      finalizeMitigation(mitigationOutcome);
    }
  } catch (error) {
    handleMitigationError(error);
  }
};

const handleHeatLayLow = () => performHeatMitigation('layLow');
const handleHeatBribe = () => performHeatMitigation('bribeOfficials');

const handleSafehouseUpgrade = () => {
  const economySystem = getEconomySystem();
  const state = getSharedState();

  if (!economySystem || !state) {
    missionControls.safehouseStatusDetail = 'Safehouse systems offline.';
    updateSafehousePanel();
    return;
  }

  const safehouse = getActiveSafehouseFromState(state);
  if (!safehouse) {
    missionControls.safehouseStatusDetail = 'No safehouse assigned — expand operations to unlock one.';
    updateSafehousePanel();
    return;
  }

  if (!(safehouse.isOwned?.() ?? safehouse.owned ?? false)) {
    missionControls.safehouseStatusDetail = 'Purchase this safehouse before upgrading it.';
    updateSafehousePanel();
    return;
  }

  const nextTier = safehouse.getNextTier?.() ?? null;
  if (!nextTier) {
    missionControls.safehouseStatusDetail = 'Safehouse already at maximum tier.';
    updateSafehousePanel();
    return;
  }

  const upgradeCost = Number.isFinite(nextTier.upgradeCost) ? nextTier.upgradeCost : 0;
  const funds = Number.isFinite(state.funds) ? state.funds : 0;

  if (funds < upgradeCost) {
    missionControls.safehouseStatusDetail = `Insufficient funds — requires ${formatCurrency(upgradeCost)}, available ${formatCurrency(funds)}.`;
    updateSafehousePanel();
    return;
  }

  economySystem.adjustFunds(-upgradeCost);
  const result = safehouse.upgrade?.();
  if (result && result.success === false) {
    missionControls.safehouseStatusDetail = 'Safehouse upgrade failed to initialize.';
    updateSafehousePanel();
    return;
  }

  const tierLabel = result?.tier?.label ?? nextTier.label ?? 'new tier';
  missionControls.safehouseStatusDetail = `Upgraded safehouse to ${tierLabel} for ${formatCurrency(upgradeCost)}.`;
  updateMissionControls();
  triggerHudRender();
};

const handleSafehousePurchase = (safehouseId) => {
  const economySystem = getEconomySystem();
  const state = getSharedState();

  if (!economySystem || !state) {
    missionControls.safehouseStatusDetail = 'Safehouse systems offline.';
    updateSafehousePanel();
    return;
  }

  if (!safehouseId) {
    missionControls.safehouseStatusDetail = 'Safehouse identifier missing.';
    updateSafehousePanel();
    return;
  }

  getActiveSafehouseFromState(state);
  const collection = state.safehouses;
  const safehouse = typeof collection?.getById === 'function' ? collection.getById(safehouseId) : null;

  if (!safehouse) {
    missionControls.safehouseStatusDetail = 'Safehouse data unavailable.';
    updateSafehousePanel();
    return;
  }

  if (safehouse.isOwned?.() ?? safehouse.owned ?? false) {
    missionControls.safehouseStatusDetail = `${safehouse.name ?? 'Safehouse'} already secured.`;
    updateSafehousePanel();
    return;
  }

  const rawCost = typeof safehouse.getPurchaseCost === 'function' ? safehouse.getPurchaseCost() : safehouse.purchaseCost;
  const purchaseCost = Number.isFinite(rawCost) ? Math.max(0, rawCost) : 0;
  const funds = Number.isFinite(state.funds) ? state.funds : 0;

  if (funds < purchaseCost) {
    missionControls.safehouseStatusDetail = `Insufficient funds — requires ${formatCurrency(purchaseCost)}, available ${formatCurrency(funds)}.`;
    updateSafehousePanel();
    return;
  }

  economySystem.adjustFunds(-purchaseCost);

  if (typeof collection?.markOwned === 'function') {
    collection.markOwned(safehouseId, true);
  } else if (typeof safehouse.setOwned === 'function') {
    safehouse.setOwned(true);
  } else {
    safehouse.owned = true;
  }

  const player = state.player ?? null;
  if (player && !player.safehouseId) {
    if (typeof player.assignSafehouse === 'function') {
      player.assignSafehouse(safehouseId);
    } else {
      player.safehouseId = safehouseId;
    }
  }

  const label = safehouse.name ?? 'safehouse';
  missionControls.safehouseStatusDetail = `Secured ${label} for ${formatCurrency(purchaseCost)}.`;
  updateMissionControls();
  triggerHudRender();
};

const handleSafehouseAssign = (safehouseId) => {
  const state = getSharedState();

  if (!state || !state.player) {
    missionControls.safehouseStatusDetail = 'Safehouse systems offline.';
    updateSafehousePanel();
    return;
  }

  if (!safehouseId) {
    missionControls.safehouseStatusDetail = 'Safehouse identifier missing.';
    updateSafehousePanel();
    return;
  }

  getActiveSafehouseFromState(state);
  const collection = state.safehouses;
  const safehouse = typeof collection?.getById === 'function' ? collection.getById(safehouseId) : null;

  if (!safehouse) {
    missionControls.safehouseStatusDetail = 'Safehouse data unavailable.';
    updateSafehousePanel();
    return;
  }

  if (!(safehouse.isOwned?.() ?? safehouse.owned ?? false)) {
    missionControls.safehouseStatusDetail = 'Purchase this safehouse before assigning it.';
    updateSafehousePanel();
    return;
  }

  const player = state.player;
  if (player.safehouseId === safehouseId) {
    missionControls.safehouseStatusDetail = `${safehouse.name ?? 'Safehouse'} already active.`;
    updateSafehousePanel();
    return;
  }

  if (typeof player.assignSafehouse === 'function') {
    player.assignSafehouse(safehouseId);
  } else {
    player.safehouseId = safehouseId;
  }

  const label = safehouse.name ?? 'new safehouse';
  missionControls.safehouseStatusDetail = `Operations moved to ${label}.`;
  updateMissionControls();
  triggerHudRender();
};

const handleSafehouseListClick = (event) => {
  const rawTarget = event.target;
  const element =
    rawTarget && rawTarget.nodeType === 1 ? rawTarget : rawTarget?.parentElement ?? null;
  const button = element && typeof element.closest === 'function'
    ? element.closest('button[data-safehouse-id]')
    : null;
  if (!button || button.disabled) {
    return;
  }

  const action = button.dataset.action;
  const safehouseId = button.dataset.safehouseId;

  if (!action || !safehouseId) {
    return;
  }

  if (action === 'purchase') {
    handleSafehousePurchase(safehouseId);
  } else if (action === 'assign') {
    handleSafehouseAssign(safehouseId);
  }
};

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

  const profile = { ...candidate };
  delete profile.id;
  delete profile.hiringCost;
  delete profile.description;

  const newMember = new CrewMember(profile);

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
    card.appendChild(title);

    const description = document.createElement('p');
    description.className = 'mission-recruit__description';
    description.textContent = candidate.description ?? 'Eager to prove their worth on the next score.';
    card.appendChild(description);

    if (candidate.background?.name || candidate.background?.perkLabel) {
      const backgroundLine = document.createElement('p');
      backgroundLine.className = 'mission-recruit__background';
      const perkLabel = candidate.background?.perkLabel ?? '';
      const backgroundLabel = candidate.background?.name ?? '';
      backgroundLine.textContent = perkLabel
        ? `${backgroundLabel || 'Background'} — ${perkLabel}`
        : backgroundLabel;
      card.appendChild(backgroundLine);
    }

    const traitSummary = formatCrewTraitSummary(candidate, 4);
    if (traitSummary) {
      const traitsLine = document.createElement('p');
      traitsLine.className = 'mission-recruit__traits';
      traitsLine.textContent = `Attributes: ${traitSummary}`;
      card.appendChild(traitsLine);
    }

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
  const attributeSelect = missionControls.trainingAttributeSelect;
  const attributeButton = missionControls.trainingAttributeButton;
  const attributeList = missionControls.trainingAttributeList;
  const restCrewSelect = missionControls.trainingRestCrewSelect;
  const restDurationSelect = missionControls.trainingRestDurationSelect;
  const restButton = missionControls.trainingRestButton;

  if (
    !crewSelect ||
    !specialtySelect ||
    !loyaltyButton ||
    !specialtyButton ||
    !attributeSelect ||
    !attributeButton ||
    !attributeList ||
    !restCrewSelect ||
    !restDurationSelect ||
    !restButton
  ) {
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

  const previousRestSelection = restCrewSelect.value;
  restCrewSelect.innerHTML = '';

  const restPlaceholder = document.createElement('option');
  restPlaceholder.value = '';
  restPlaceholder.textContent = crew.length
    ? 'Select crew to rotate'
    : 'No crew available';
  restPlaceholder.disabled = true;
  restPlaceholder.selected = true;
  restCrewSelect.appendChild(restPlaceholder);

  crew.forEach((member) => {
    if (!member) {
      return;
    }

    const readiness = summarizeCrewReadiness(member);
    const stateLabelRaw = readiness?.state ?? (member.status ?? 'idle');
    const stateLabel = stateLabelRaw ? stateLabelRaw.replace(/-/g, ' ') : 'idle';
    const fatigueLabel = readiness?.fatiguePercent !== null
      ? `${readiness.fatiguePercent}% fatigue`
      : 'Fatigue unknown';
    const restPlan = readiness?.restPlan ?? null;
    const restLabel = restPlan?.remainingDays
      ? ` • resting ${restPlan.remainingDays}d remaining`
      : '';

    const option = document.createElement('option');
    option.value = member.id;
    option.textContent = `${member.name} — ${stateLabel} • ${fatigueLabel}${restLabel}`;
    if (readiness?.tooltip) {
      option.title = readiness.tooltip;
    }
    restCrewSelect.appendChild(option);
  });

  if (previousRestSelection && crew.some((member) => member?.id === previousRestSelection)) {
    restCrewSelect.value = previousRestSelection;
    restPlaceholder.selected = false;
  }

  const currentSelection = crew.find((member) => member?.id === crewSelect.value) ?? null;
  const restingSelection = crew.find((member) => member?.id === restCrewSelect.value) ?? null;
  const restingSummary = restingSelection ? summarizeCrewReadiness(restingSelection) : null;
  const restPlanActive = Boolean(restingSummary?.restPlan);
  const restEligible = restingSelection
    ? typeof restingSelection.isRestEligible === 'function'
      ? restingSelection.isRestEligible()
      : !['on-mission', 'captured'].includes((restingSelection.status ?? '').toLowerCase())
    : false;

  const previousRestDuration = restDurationSelect.value;
  restDurationSelect.innerHTML = '';
  CREW_REST_DURATION_OPTIONS.forEach((entry) => {
    const option = document.createElement('option');
    option.value = String(entry.value);
    option.textContent = entry.label;
    restDurationSelect.appendChild(option);
  });

  const durationValues = CREW_REST_DURATION_OPTIONS.map((entry) => String(entry.value));
  if (durationValues.includes(previousRestDuration)) {
    restDurationSelect.value = previousRestDuration;
  } else if (durationValues.length) {
    restDurationSelect.value = durationValues[0];
  }

  const restInteractionDisabled = !restingSelection || !restEligible;
  restDurationSelect.disabled = restInteractionDisabled;
  restButton.disabled = restInteractionDisabled;
  restButton.textContent = restPlanActive ? 'Extend Recovery' : 'Schedule Recovery';

  if (!restingSelection) {
    restButton.title = 'Select crew to rotate into rest.';
  } else if (!restEligible) {
    restButton.title = `${restingSelection.name} cannot stand down right now.`;
  } else {
    restButton.title = '';
  }

  renderCrewTraitList(attributeList, currentSelection);

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

  const previousAttribute = attributeSelect.value;
  attributeSelect.innerHTML = '';
  CREW_ATTRIBUTE_OPTIONS.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.value;
    const level = currentSelection ? Math.round(getCrewTraitLevel(currentSelection, entry.value)) : null;
    const levelLabel = level !== null ? ` L${level}/${entry.maxLevel}` : '';
    const descriptor = entry.description ? ` — ${entry.description}` : '';
    option.textContent = `${entry.label}${levelLabel}${descriptor}`;
    attributeSelect.appendChild(option);
  });

  if (CREW_ATTRIBUTE_OPTIONS.some((entry) => entry.value === previousAttribute)) {
    attributeSelect.value = previousAttribute;
  }

  if (!attributeSelect.value && CREW_ATTRIBUTE_OPTIONS.length) {
    attributeSelect.value = CREW_ATTRIBUTE_OPTIONS[0].value;
  }

  const isResting = currentSelection
    ? typeof currentSelection.hasActiveRestOrder === 'function'
      ? currentSelection.hasActiveRestOrder()
      : (currentSelection.status ?? '').toLowerCase() === 'resting'
    : false;
  const canTrain = Boolean(missionSystem && economySystem && currentSelection && !isResting);
  const atMaxLoyalty = currentSelection ? Number(currentSelection.loyalty) >= 5 : true;

  loyaltyButton.disabled = !canTrain || atMaxLoyalty || funds < LOYALTY_TRAINING_COST;
  loyaltyButton.textContent = `Boost Loyalty (${formatCurrency(LOYALTY_TRAINING_COST)})`;
  loyaltyButton.title = isResting && currentSelection
    ? `${currentSelection.name} is benched for recovery. Resume duty before training.`
    : '';

  const desiredSpecialty = (specialtySelect.value ?? '').toLowerCase();
  const alreadySpecialty = currentSelection
    ? (currentSelection.specialty ?? '').toLowerCase() === desiredSpecialty
    : false;
  specialtyButton.disabled = !canTrain || alreadySpecialty || funds < SPECIALTY_TRAINING_COST;
  specialtyButton.textContent = `Specialty Training (${formatCurrency(SPECIALTY_TRAINING_COST)})`;
  specialtyButton.title = isResting && currentSelection
    ? `${currentSelection.name} is benched for recovery. Resume duty before training.`
    : '';

  const selectedAttribute = attributeSelect.value;
  const attributeConfig = CREW_TRAIT_CONFIG[selectedAttribute];
  const attributeLevel = currentSelection ? Math.round(getCrewTraitLevel(currentSelection, selectedAttribute)) : 0;
  const attributeMax = Number.isFinite(attributeConfig?.maxLevel) ? attributeConfig.maxLevel : 6;
  const attributeCost = computeAttributeTrainingCost(selectedAttribute, attributeLevel);

  attributeSelect.disabled = !currentSelection || isResting;

  attributeButton.disabled =
    !canTrain ||
    !attributeConfig ||
    attributeLevel >= attributeMax ||
    funds < attributeCost;

  if (!currentSelection) {
    attributeButton.title = 'Select a crew member to train.';
  } else if (isResting) {
    attributeButton.title = `${currentSelection.name} is benched for recovery. Resume duty before training.`;
  } else if (!attributeConfig) {
    attributeButton.title = 'Select an attribute focus.';
  } else if (attributeLevel >= attributeMax) {
    attributeButton.title = `${attributeConfig.label} is already at peak potential.`;
  } else if (funds < attributeCost) {
    attributeButton.title = 'Insufficient funds for attribute training.';
  } else {
    attributeButton.title = '';
  }

  attributeButton.textContent = attributeConfig
    ? `Train ${attributeConfig.label} (${formatCurrency(attributeCost)})`
    : 'Train Attribute';
};

const handleCrewRestScheduling = () => {
  const missionSystem = getMissionSystem();
  const state = missionSystem?.state ?? getSharedState();
  const restCrewSelect = missionControls.trainingRestCrewSelect;
  const restDurationSelect = missionControls.trainingRestDurationSelect;

  if (!missionSystem || !state || !restCrewSelect || !restDurationSelect) {
    setTrainingStatus('Recovery scheduling unavailable.');
    return;
  }

  const crew = Array.isArray(state.crew) ? state.crew : [];
  const selectedId = restCrewSelect.value;
  const member = crew.find((entry) => entry?.id === selectedId);

  if (!member) {
    setTrainingStatus('Select crew to rotate into rest.');
    return;
  }

  const eligible = typeof member.isRestEligible === 'function'
    ? member.isRestEligible()
    : !['on-mission', 'captured'].includes((member.status ?? '').toLowerCase());
  if (!eligible) {
    setTrainingStatus(`${member.name} cannot stand down right now.`);
    return;
  }

  const rawDays = Number(restDurationSelect.value);
  const days = Number.isFinite(rawDays) ? Math.max(1, Math.round(rawDays)) : 1;

  const plan = typeof member.markRestOrder === 'function'
    ? member.markRestOrder({ days })
    : null;

  if (!plan) {
    setTrainingStatus('Unable to queue a recovery rotation.');
    return;
  }

  const totalDays = Number(plan.remainingDays);
  const dayLabel = Number.isFinite(totalDays) && totalDays === 1 ? '1 day' : `${totalDays} days`;
  setTrainingStatus(`${member.name} rotates to recovery duty for ${dayLabel}.`);

  updateTrainingOptions();
  updateCrewSelectionOptions();
  updateMissionControls();
  triggerHudRender();
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

const handleAttributeTraining = () => {
  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();
  const state = missionSystem?.state ?? getSharedState();
  const crewSelect = missionControls.trainingCrewSelect;
  const attributeSelect = missionControls.trainingAttributeSelect;

  if (!missionSystem || !economySystem || !state || !crewSelect || !attributeSelect) {
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

  const traitKey = attributeSelect.value;
  const traitConfig = CREW_TRAIT_CONFIG[traitKey];

  if (!traitKey || !traitConfig) {
    setTrainingStatus('Choose an attribute focus before training.');
    return;
  }

  const funds = Number.isFinite(state.funds) ? state.funds : 0;
  const currentLevel = Math.round(getCrewTraitLevel(member, traitKey));
  const maxLevel = Number.isFinite(traitConfig.maxLevel) ? traitConfig.maxLevel : 6;

  if (currentLevel >= maxLevel) {
    setTrainingStatus(`${member.name}'s ${traitConfig.label} is already at peak potential.`);
    return;
  }

  const cost = computeAttributeTrainingCost(traitKey, currentLevel);
  if (funds < cost) {
    setTrainingStatus('Insufficient funds for attribute training.');
    return;
  }

  economySystem.adjustFunds(-cost);

  if (typeof member.adjustTrait === 'function') {
    member.adjustTrait(traitKey, 1);
  } else {
    if (!member.traits || typeof member.traits !== 'object') {
      member.traits = {};
    }
    member.traits[traitKey] = Math.min(maxLevel, Math.max(0, Math.round((Number(member.traits[traitKey]) || 0) + 1)));
  }

  const updatedLevel = Math.round(getCrewTraitLevel(member, traitKey));
  setTrainingStatus(`${member.name}'s ${traitConfig.label} rises to ${updatedLevel}.`);
  updateTrainingOptions();
  updateCrewSelectionOptions();
  updateMissionControls();
  triggerHudRender();
};

const describePlayerSkillLevel = (skillKey, levelValue) => {
  const config = PLAYER_SKILL_CONFIG[skillKey];
  if (!config) {
    return null;
  }

  const safeLevel = Number.isFinite(levelValue) ? levelValue : config.baseLevel ?? 1;
  const baseLevel = Number.isFinite(config.baseLevel) ? config.baseLevel : 1;
  const aboveBase = Math.max(0, safeLevel - baseLevel);
  const effects = config.effects ?? {};
  const adjustments = [];

  if (effects.durationReductionPerLevel) {
    const cap = Math.max(0, effects.durationReductionCap ?? effects.durationReductionPerLevel * 4);
    const total = Math.min(cap, aboveBase * effects.durationReductionPerLevel);
    if (total > 0) {
      adjustments.push(`${Math.round(total * 100)}% faster`);
    }
  }

  if (effects.payoutBonusPerLevel) {
    const cap = Math.max(0, effects.payoutBonusCap ?? effects.payoutBonusPerLevel * 4);
    const total = Math.min(cap, aboveBase * effects.payoutBonusPerLevel);
    if (total > 0) {
      adjustments.push(`${Math.round(total * 100)}% more payout`);
    }
  }

  if (effects.successBonusPerLevel) {
    const cap = Math.max(0, effects.successBonusCap ?? effects.successBonusPerLevel * 6);
    const total = Math.min(cap, aboveBase * effects.successBonusPerLevel);
    if (total > 0) {
      adjustments.push(`+${Math.round(total * 100)}% success`);
    }
  }

  if (effects.heatReductionPerLevel) {
    const cap = Math.max(0, effects.heatReductionCap ?? effects.heatReductionPerLevel * 4);
    const total = Math.min(cap, aboveBase * effects.heatReductionPerLevel);
    if (total > 0) {
      adjustments.push(`${Math.round(total * 100)}% less heat`);
    }
  }

  const label = `${config.label} L${safeLevel}`;
  return adjustments.length ? `${label} — ${adjustments.join(', ')}` : `${label} — steady influence`;
};

const describeNotorietyLevel = (value) => {
  const notoriety = Number.isFinite(value) ? Math.max(0, value) : 0;
  const profile = getNotorietyProfile(notoriety);
  const nextProfile = getNextNotorietyProfile(notoriety);

  const effectParts = [];
  if (Number.isFinite(profile.payoutBonus) && profile.payoutBonus !== 0) {
    effectParts.push(`payout +${Math.round(profile.payoutBonus * 100)}%`);
  }
  if (Number.isFinite(profile.heatMultiplier) && profile.heatMultiplier !== 1) {
    const heatDeltaPercent = Math.round((profile.heatMultiplier - 1) * 100);
    effectParts.push(`heat +${heatDeltaPercent}%`);
  }
  if (Number.isFinite(profile.difficultyDelta) && profile.difficultyDelta !== 0) {
    effectParts.push(`difficulty +${profile.difficultyDelta}`);
  }
  if (Number.isFinite(profile.riskShift) && profile.riskShift > 0) {
    effectParts.push('risk tier jumps faster');
  }
  if (Number.isFinite(profile.crackdownPressure) && profile.crackdownPressure > 0) {
    effectParts.push(`crackdown heat bias +${profile.crackdownPressure.toFixed(1)}`);
  }

  const effectsSummary = effectParts.length
    ? ` Effects: ${effectParts.join(', ')}.`
    : ' Effects: Standard terms.';

  const nextTierSummary = nextProfile
    ? ` Next tier (${nextProfile.label}) at ${nextProfile.min} notoriety.`
    : ' Maximum notoriety tier reached.';

  const rounded = Math.round(notoriety);
  return `Notoriety: ${rounded} — ${profile.label}. ${profile.summary} ${effectsSummary}${nextTierSummary}`;
};

const updatePlayerDevelopmentPanel = () => {
  const {
    playerStatsList,
    playerSkillSelect,
    playerSkillButton,
    playerGearSelect,
    playerGearButton,
  } = missionControls;

  if (!playerStatsList || !playerSkillSelect || !playerSkillButton || !playerGearSelect || !playerGearButton) {
    return;
  }

  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();
  const state = missionSystem?.state ?? getSharedState();
  const player = state?.player ?? null;
  const funds = Number.isFinite(state?.funds) ? state.funds : 0;

  playerStatsList.innerHTML = '';

  if (!player) {
    const item = document.createElement('li');
    item.textContent = 'Player profile unavailable.';
    playerStatsList.appendChild(item);
  } else {
    const aliasItem = document.createElement('li');
    aliasItem.textContent = `Alias: ${player.name ?? 'Unknown Driver'}`;
    playerStatsList.appendChild(aliasItem);

    const notorietyValue = Number.isFinite(player.notoriety) ? player.notoriety : 0;
    const notorietyItem = document.createElement('li');
    notorietyItem.textContent = describeNotorietyLevel(notorietyValue);
    playerStatsList.appendChild(notorietyItem);

    PLAYER_SKILL_OPTIONS.forEach((option) => {
      const levelRaw = player?.skills?.[option.value];
      const level = Number.isFinite(levelRaw) ? levelRaw : option.baseLevel;
      const description = describePlayerSkillLevel(option.value, level);
      const item = document.createElement('li');
      item.textContent = description ?? `${option.label.split(' — ')[0]} — steady influence`;
      playerStatsList.appendChild(item);
    });

    const gearItem = document.createElement('li');
    const inventory = Array.isArray(player.inventory) ? [...new Set(player.inventory)] : [];
    if (!inventory.length) {
      gearItem.textContent = 'Gear: None equipped';
    } else {
      const gearLabels = inventory
        .map((gearId) => PLAYER_GEAR_CATALOG[gearId]?.label ?? gearId)
        .join(', ');
      gearItem.textContent = `Gear: ${gearLabels}`;
    }
    playerStatsList.appendChild(gearItem);
  }

  const previousSkill = playerSkillSelect.value;
  playerSkillSelect.innerHTML = '';
  const skillPlaceholder = document.createElement('option');
  skillPlaceholder.value = '';
  skillPlaceholder.textContent = PLAYER_SKILL_OPTIONS.length
    ? 'Select skill focus'
    : 'No skills available';
  skillPlaceholder.disabled = true;
  skillPlaceholder.selected = true;
  playerSkillSelect.appendChild(skillPlaceholder);

  PLAYER_SKILL_OPTIONS.forEach((option) => {
    const optionElement = document.createElement('option');
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    playerSkillSelect.appendChild(optionElement);
  });

  if (PLAYER_SKILL_OPTIONS.some((entry) => entry.value === previousSkill)) {
    playerSkillSelect.value = previousSkill;
    skillPlaceholder.selected = false;
  } else if (PLAYER_SKILL_OPTIONS.length) {
    playerSkillSelect.value = PLAYER_SKILL_OPTIONS[0].value;
    skillPlaceholder.selected = false;
  }

  const selectedSkillOption = PLAYER_SKILL_OPTIONS.find((entry) => entry.value === playerSkillSelect.value) ?? null;
  const selectedSkillConfig = selectedSkillOption ? PLAYER_SKILL_CONFIG[selectedSkillOption.value] : null;
  const skillCost = Number.isFinite(selectedSkillOption?.cost) ? selectedSkillOption.cost : 0;
  const maxLevel = Number.isFinite(selectedSkillOption?.maxLevel)
    ? selectedSkillOption.maxLevel
    : selectedSkillConfig?.maxLevel ?? 6;
  const baseLevel = Number.isFinite(selectedSkillOption?.baseLevel)
    ? selectedSkillOption.baseLevel
    : selectedSkillConfig?.baseLevel ?? 1;
  const currentSkillLevel = selectedSkillOption
    ? Number.isFinite(player?.skills?.[selectedSkillOption.value])
      ? player.skills[selectedSkillOption.value]
      : baseLevel
    : null;

  const canTrainSkill = Boolean(missionSystem && economySystem && player && selectedSkillOption);
  const skillAtCap = Number.isFinite(currentSkillLevel) && Number.isFinite(maxLevel)
    ? currentSkillLevel >= maxLevel
    : false;
  playerSkillButton.disabled =
    !canTrainSkill ||
    skillAtCap ||
    funds < skillCost;
  if (!canTrainSkill || skillAtCap || funds < skillCost) {
    playerSkillButton.title = !canTrainSkill
      ? 'Player training unavailable.'
      : skillAtCap
        ? 'Skill already mastered.'
        : 'Insufficient funds.';
  } else {
    playerSkillButton.removeAttribute('title');
  }

  if (selectedSkillOption && selectedSkillConfig) {
    playerSkillButton.textContent = `Train ${selectedSkillConfig.label} (${formatCurrency(skillCost)})`;
  } else {
    playerSkillButton.textContent = 'Train Skill';
  }

  const previousGear = playerGearSelect.value;
  playerGearSelect.innerHTML = '';
  const gearPlaceholder = document.createElement('option');
  gearPlaceholder.value = '';
  gearPlaceholder.textContent = PLAYER_GEAR_OPTIONS.length
    ? 'Select gear upgrade'
    : 'No gear available';
  gearPlaceholder.disabled = true;
  gearPlaceholder.selected = true;
  playerGearSelect.appendChild(gearPlaceholder);

  PLAYER_GEAR_OPTIONS.forEach((option) => {
    const optionElement = document.createElement('option');
    optionElement.value = option.value;
    const owned = Boolean(player && Array.isArray(player.inventory) && player.inventory.includes(option.value));
    optionElement.textContent = owned ? `${option.label} (owned)` : option.label;
    playerGearSelect.appendChild(optionElement);
  });

  if (PLAYER_GEAR_OPTIONS.some((entry) => entry.value === previousGear)) {
    playerGearSelect.value = previousGear;
    gearPlaceholder.selected = false;
  } else if (PLAYER_GEAR_OPTIONS.length) {
    playerGearSelect.value = PLAYER_GEAR_OPTIONS[0].value;
    gearPlaceholder.selected = false;
  }

  const selectedGearOption = PLAYER_GEAR_OPTIONS.find((entry) => entry.value === playerGearSelect.value) ?? null;
  const selectedGearConfig = selectedGearOption ? PLAYER_GEAR_CATALOG[selectedGearOption.value] : null;
  const ownsSelectedGear = Boolean(
    player &&
      selectedGearOption &&
      Array.isArray(player.inventory) &&
      player.inventory.includes(selectedGearOption.value),
  );
  const gearCost = Number.isFinite(selectedGearOption?.cost) ? selectedGearOption.cost : 0;
  const canAcquireGear = Boolean(missionSystem && economySystem && player && selectedGearOption);

  playerGearButton.disabled =
    !canAcquireGear ||
    ownsSelectedGear ||
    funds < gearCost;

  if (!canAcquireGear) {
    playerGearButton.title = 'Gear procurement unavailable.';
  } else if (ownsSelectedGear) {
    playerGearButton.title = 'Already equipped.';
  } else if (funds < gearCost) {
    playerGearButton.title = 'Insufficient funds.';
  } else {
    playerGearButton.removeAttribute('title');
  }

  if (selectedGearConfig) {
    playerGearButton.textContent = `Acquire ${selectedGearConfig.label} (${formatCurrency(gearCost)})`;
  } else {
    playerGearButton.textContent = 'Acquire Gear';
  }
};

const handlePlayerSkillTraining = () => {
  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();
  const state = missionSystem?.state ?? getSharedState();
  const select = missionControls.playerSkillSelect;

  if (!missionSystem || !economySystem || !state || !select) {
    setPlayerStatus('Player training systems unavailable.');
    return;
  }

  const player = state.player;
  if (!player) {
    setPlayerStatus('Player profile unavailable.');
    return;
  }

  const selectedValue = select.value;
  const option = PLAYER_SKILL_OPTIONS.find((entry) => entry.value === selectedValue) ?? null;
  const config = option ? PLAYER_SKILL_CONFIG[option.value] : null;
  if (!option || !config) {
    setPlayerStatus('Select a skill to train.');
    return;
  }

  const cost = Number.isFinite(option.cost) ? option.cost : config.trainingCost ?? 0;
  const funds = Number.isFinite(state.funds) ? state.funds : 0;
  if (funds < cost) {
    setPlayerStatus('Insufficient funds for skill training.');
    return;
  }

  const baseLevel = Number.isFinite(config.baseLevel) ? config.baseLevel : 1;
  const maxLevel = Number.isFinite(config.maxLevel) ? config.maxLevel : 6;
  const currentLevelRaw = Number(player?.skills?.[option.value]);
  const currentLevel = Number.isFinite(currentLevelRaw) ? currentLevelRaw : baseLevel;
  if (currentLevel >= maxLevel) {
    setPlayerStatus(`${config.label} is already mastered.`);
    return;
  }

  economySystem.adjustFunds(-cost);
  if (typeof player.improveSkill === 'function') {
    player.improveSkill(option.value, 1);
  } else {
    if (!player.skills || typeof player.skills !== 'object') {
      player.skills = {};
    }
    player.skills[option.value] = currentLevel + 1;
  }

  const newLevelRaw = Number(player.skills?.[option.value]);
  const newLevel = Number.isFinite(newLevelRaw) ? newLevelRaw : currentLevel + 1;
  setPlayerStatus(`${config.label} rises to L${newLevel}.`);
  updatePlayerDevelopmentPanel();
  updateMissionControls();
  triggerHudRender();
};

const handlePlayerGearAcquisition = () => {
  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();
  const state = missionSystem?.state ?? getSharedState();
  const select = missionControls.playerGearSelect;

  if (!missionSystem || !economySystem || !state || !select) {
    setPlayerStatus('Gear procurement unavailable.');
    return;
  }

  const player = state.player;
  if (!player) {
    setPlayerStatus('Player profile unavailable.');
    return;
  }

  const selectedValue = select.value;
  const option = PLAYER_GEAR_OPTIONS.find((entry) => entry.value === selectedValue) ?? null;
  const config = option ? PLAYER_GEAR_CATALOG[option.value] : null;
  if (!option || !config) {
    setPlayerStatus('Select gear to acquire.');
    return;
  }

  const cost = Number.isFinite(option.cost) ? option.cost : config.cost ?? 0;
  const funds = Number.isFinite(state.funds) ? state.funds : 0;
  if (funds < cost) {
    setPlayerStatus('Insufficient funds for this gear.');
    return;
  }

  const alreadyOwned = Array.isArray(player.inventory) && player.inventory.includes(config.id);
  if (alreadyOwned) {
    setPlayerStatus(`${config.label} is already equipped.`);
    return;
  }

  economySystem.adjustFunds(-cost);
  if (typeof player.addInventoryItem === 'function') {
    player.addInventoryItem(config.id);
  } else {
    if (!Array.isArray(player.inventory)) {
      player.inventory = [];
    }
    player.inventory.push(config.id);
  }

  setPlayerStatus(`${config.label} added to your kit.`);
  updatePlayerDevelopmentPanel();
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
    const missionReady = typeof member.isMissionReady === 'function'
      ? member.isMissionReady()
      : (member.status ?? 'idle') === 'idle';
    if (!missionReady) {
      selectedSet.delete(member.id);
    }
    checkbox.checked = selectedSet.has(member.id);
    checkbox.disabled = !missionReady;

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
    const readiness = summarizeCrewReadiness(member);
    const readinessLabel = readiness?.label ? ` • ${readiness.label}` : '';
    const backgroundName = member.background?.name || member.background?.perkLabel || '';
    const backgroundLabel = backgroundName ? ` • ${backgroundName}` : '';
    const traitSummary = formatCrewTraitSummary(member, 3);
    const traitsLabel = traitSummary ? ` • ${traitSummary}` : '';
    const descriptorText = `${member.name} — ${member.specialty} • ${loyaltyLabel} • ${statusLabel}${readinessLabel}${backgroundLabel}${traitsLabel}`;
    descriptor.textContent = descriptorText;
    if (readiness?.tooltip) {
      descriptor.title = readiness.tooltip;
      checkbox.title = readiness.tooltip;
    }

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

    const installedMods = typeof vehicle.getInstalledMods === 'function'
      ? vehicle.getInstalledMods()
      : Array.isArray(vehicle.installedMods)
        ? vehicle.installedMods.slice()
        : [];
    if (installedMods.length) {
      const upgradesLabel = installedMods
        .map((modId) => VEHICLE_UPGRADE_CATALOG?.[modId]?.label ?? modId)
        .join(', ');
      const upgradeBadge = document.createElement('span');
      upgradeBadge.className = 'mission-vehicle__upgrade-summary';
      upgradeBadge.textContent = `Upgrades: ${upgradesLabel}`;
      entry.appendChild(upgradeBadge);
    }

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

const formatCrackdownTierLabel = (tierName) => {
  if (!tierName) {
    return {
      id: 'calm',
      label: 'Calm',
    };
  }

  const normalized = `${tierName}`.toLowerCase();
  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return { id: normalized, label };
};

const describeCrackdownOperationContext = (mission, crackdownInfo) => {
  const tierName = mission?.crackdownTier ?? crackdownInfo?.tierName ?? 'calm';
  const { id, label } = formatCrackdownTierLabel(tierName);

  let contextMessage;
  if (id === 'calm') {
    contextMessage = 'Calm crackdown — keep patrols complacent with a soft-touch op.';
  } else if (id === 'alert') {
    contextMessage = 'Alert crackdown — strike to peel back the dragnet.';
  } else if (id === 'lockdown') {
    contextMessage = 'Lockdown crackdown — high-risk push to pry open the city.';
  } else {
    contextMessage = `Eligible under the ${label.toLowerCase()} crackdown.`;
  }

  return {
    tierId: id,
    tierLabel: label,
    contextMessage,
  };
};

const describeCrackdownPolicy = () => {
  const missionSystem = getMissionSystem();
  const heatSystem = getHeatSystem();

  if (!missionSystem && !heatSystem) {
    return null;
  }

  const policy = missionSystem?.getCurrentCrackdownPolicy?.();
  const tierName = missionSystem?.currentCrackdownTier ?? heatSystem?.getCurrentTier?.();

  const { id: tierId, label } = formatCrackdownTierLabel(tierName ?? policy?.label);
  let impact;

  if (!policy || !Number.isFinite(policy.maxMissionHeat)) {
    impact = 'All contracts are open.';
  } else {
    impact = `Contracts generating more than ${policy.maxMissionHeat} heat are grounded.`;
  }

  return {
    tierName: tierName ?? tierId ?? 'calm',
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
  renderMissionEvents();
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
    const details = [summary];
    const falloutSummary = entry?.falloutSummary ?? null;
    if (falloutSummary && !summary.includes(falloutSummary)) {
      details.push(`Fallout: ${falloutSummary}`);
    }
    const followUpSummary = entry?.followUpSummary ?? null;
    if (followUpSummary && !summary.includes(followUpSummary)) {
      details.push(`Follow-up: ${followUpSummary}`);
    }
    const timestamp = Number.isFinite(entry?.timestamp) ? new Date(entry.timestamp) : null;
    const timeLabel = timestamp ? ` @ ${timestamp.toLocaleTimeString([], options)}` : '';
    item.textContent = `${details.join(' — ')}${timeLabel}`;
    logList.appendChild(item);
  });
};

const renderMissionEvents = () => {
  const { eventPrompt, eventChoices, eventHistory } = missionControls;
  if (!eventPrompt || !eventChoices || !eventHistory) {
    return;
  }

  setMissionEventStatus(missionControls.eventStatusDetail ?? '');

  eventPrompt.textContent = 'No active mission. Event feed idle.';
  eventChoices.innerHTML = '';
  eventHistory.innerHTML = '';

  const missionSystem = getMissionSystem();
  const mission = missionSystem?.state?.activeMission ?? null;

  if (!mission || mission.status === 'completed') {
    const placeholder = document.createElement('li');
    placeholder.textContent = 'No event history yet.';
    eventHistory.appendChild(placeholder);
    return;
  }

  const pending = mission.pendingDecision ?? null;
  if (pending) {
    const description = pending.description ? ` — ${pending.description}` : '';
    const progressPercent = Number.isFinite(pending.triggerProgress)
      ? ` (${Math.round(pending.triggerProgress * 100)}%)`
      : '';
    eventPrompt.textContent = `${pending.label}${progressPercent}${description}`.trim();

    pending.choices
      .map((choice) => ({
        id: choice.id,
        label: choice.label,
        description: choice.description,
        effects: choice.effects,
      }))
      .forEach((choice) => {
        const option = document.createElement('div');
        option.className = 'mission-event__option';

        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.eventChoice = 'true';
        button.dataset.eventId = pending.eventId;
        button.dataset.choiceId = choice.id;
        button.textContent = choice.label;
        option.appendChild(button);

        if (choice.description) {
          const blurb = document.createElement('p');
          blurb.className = 'mission-event__option-desc';
          blurb.textContent = choice.description;
          option.appendChild(blurb);
        }

        const effectSummary = formatEventEffectSummary(choice.effects);
        if (effectSummary) {
          const effectLine = document.createElement('p');
          effectLine.className = 'mission-event__option-desc';
          effectLine.textContent = `Effects: ${effectSummary}`;
          option.appendChild(effectLine);
        }

        eventChoices.appendChild(option);
      });
  } else {
    const statusLabel = (() => {
      switch (mission.status) {
        case 'awaiting-resolution':
          return 'Awaiting final outcome…';
        case 'in-progress':
          return 'No decisions pending. Operation underway.';
        default:
          return 'Mission standing by.';
      }
    })();
    eventPrompt.textContent = statusLabel;

    const idleMessage = document.createElement('p');
    idleMessage.className = 'mission-event__option-desc';
    idleMessage.textContent = 'Crew will report in if complications or opportunities arise.';
    eventChoices.appendChild(idleMessage);
  }

  const historyEntries = Array.isArray(mission.eventHistory) ? mission.eventHistory : [];
  if (!historyEntries.length) {
    const placeholder = document.createElement('li');
    placeholder.textContent = 'No events resolved yet.';
    eventHistory.appendChild(placeholder);
    return;
  }

  historyEntries.slice(-5).forEach((entry) => {
    const item = document.createElement('li');
    const progressPercent = Number.isFinite(entry?.progressAt)
      ? `[${Math.round(entry.progressAt * 100)}%] `
      : '';
    const summary = entry?.summary ?? `${entry?.eventLabel ?? 'Event'} resolved.`;
    const effectSummary = typeof entry?.effectSummary === 'string' ? entry.effectSummary.trim() : '';
    const detail = effectSummary ? ` (${effectSummary})` : '';
    item.textContent = `${progressPercent}${summary}${detail}`;
    eventHistory.appendChild(item);
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
    detailPlayerImpact,
    cityIntelDistrictName,
    cityIntelDistrictDescription,
    cityIntelRisk,
    cityIntelPoiName,
    cityIntelPoiDescription,
    cityIntelPoiPerks,
    eventPrompt,
    eventChoices,
    eventHistory,
    eventStatus,
    crewList,
    vehicleList,
    crackdownText,
    logList,
    recruitList,
    safehouseName,
    safehouseTier,
    safehouseEffects,
    safehouseList,
    safehouseUpgradeButton,
    safehouseStatus,
    trainingCrewSelect,
    trainingSpecialtySelect,
    trainingLoyaltyButton,
    trainingSpecialtyButton,
    trainingAttributeSelect,
    trainingAttributeButton,
    trainingAttributeList,
    trainingRestCrewSelect,
    trainingRestDurationSelect,
    trainingRestButton,
    maintenanceRepairButton,
    maintenanceHeatButton,
    maintenanceUpgradeSelect,
    maintenanceUpgradeButton,
    maintenanceUpgradeList,
    maintenanceStatus,
    playerStatsList,
    playerSkillSelect,
    playerSkillButton,
    playerGearSelect,
    playerGearButton,
    playerStatus,
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
    detailPlayerImpact,
    cityIntelDistrictName,
    cityIntelDistrictDescription,
    cityIntelRisk,
    cityIntelPoiName,
    cityIntelPoiDescription,
    cityIntelPoiPerks,
    eventPrompt,
    eventChoices,
    eventHistory,
    eventStatus,
    crewList,
    vehicleList,
    crackdownText,
    logList,
    recruitList,
    safehouseName,
    safehouseTier,
    safehouseEffects,
    safehouseList,
    safehouseUpgradeButton,
    safehouseStatus,
    trainingCrewSelect,
    trainingSpecialtySelect,
    trainingLoyaltyButton,
    trainingSpecialtyButton,
    trainingAttributeSelect,
    trainingAttributeButton,
    trainingAttributeList,
    trainingRestCrewSelect,
    trainingRestDurationSelect,
    trainingRestButton,
    maintenanceRepairButton,
    maintenanceHeatButton,
    maintenanceUpgradeSelect,
    maintenanceUpgradeButton,
    maintenanceUpgradeList,
    maintenanceStatus,
    playerStatsList,
    playerSkillSelect,
    playerSkillButton,
    playerGearSelect,
    playerGearButton,
    playerStatus,
  ];
  const controlsReady = [...controls, ...detailElements].every(Boolean);

  if (!controlsReady) {
    return;
  }

  updateCrewSelectionOptions();
  updateVehicleSelectionOptions();
  updateRecruitmentOptions();
  updateTrainingOptions();
  updatePlayerDevelopmentPanel();
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
    resetCityIntelPanel();
    const fallbackDistricts = missionSystem?.state?.city?.districts ?? [];
    renderCityIntelMap({
      districts: fallbackDistricts,
      highlightedMission: null,
      activeMission: missionSystem?.state?.activeMission ?? null,
    });
    updateMissionStatusText();
    updateCrackdownIndicator();
    updateHeatManagementPanel();
    updateMaintenancePanel();
    updateSafehousePanel();
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

  let missionForIntel = null;

  if (!selectedMission) {
    resetMissionDetails('Select a mission to view its briefing.');
  } else {
    let missionDescription = selectedMission.description ?? 'No description available.';
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

    let missionPayout = selectedMission.status === 'available'
      ? formatAdjustedValue(basePayout, payoutValue, formatCurrency, formatCurrency, 1)
      : formatCurrency(payoutValue);
    let missionHeat = selectedMission.status === 'available'
      ? formatAdjustedValue(baseHeat, heatValue, formatHeatValue, formatHeatValue, 0.05)
      : formatHeatValue(heatValue);
    let missionDuration = selectedMission.status === 'available'
      ? formatAdjustedValue(baseDuration, durationValue, formatSeconds, formatSeconds, 1)
      : formatSeconds(durationValue);
    let missionSuccess = selectedMission.status === 'available'
      ? formatAdjustedValue(baseSuccess, successValue, formatPercent, formatPercent, 0.005)
      : formatPercent(successValue);
    const crackdownInfo = describeCrackdownPolicy();
    const crackdownContext =
      selectedMission.category === 'crackdown-operation'
        ? describeCrackdownOperationContext(selectedMission, crackdownInfo)
        : null;
    let restrictionMessage;
    if (selectedMission.restricted) {
      restrictionMessage =
        selectedMission.restrictionReason ?? 'This contract is locked by the current crackdown.';
    } else if (crackdownContext) {
      restrictionMessage = crackdownContext.contextMessage;
    } else if (crackdownInfo) {
      restrictionMessage = `Eligible under the ${crackdownInfo.label.toLowerCase()} crackdown.`;
    } else {
      restrictionMessage = 'All contracts are open.';
    }

    const crewImpactSummary = (() => {
      if (selectedMission.status === 'available') {
        const summary = Array.isArray(preview?.summary) ? preview.summary : [];
        return summary.length ? summary : ['No crew bonuses applied.'];
      }

      const summary = Array.isArray(selectedMission.crewEffectSummary)
        ? selectedMission.crewEffectSummary
        : [];
      return summary.length
        ? summary
        : ['Crew assignments locked in.', 'Vehicle assignment locked in.'];
    })();

    const crewPerkSummary = (() => {
      if (selectedMission.status === 'available') {
        return Array.isArray(preview?.perkSummary) ? preview.perkSummary : [];
      }

      if (Array.isArray(selectedMission.crewPerkSummary) && selectedMission.crewPerkSummary.length) {
        return selectedMission.crewPerkSummary;
      }

      if (Array.isArray(selectedMission.assignedCrewPerkSummary) && selectedMission.assignedCrewPerkSummary.length) {
        return selectedMission.assignedCrewPerkSummary;
      }

      return [];
    })();

    let crewImpact = crewImpactSummary.slice();
    if (!crewImpact.length) {
      crewImpact = ['Crew impact steady.'];
    }
    if (crewPerkSummary.length) {
      crewImpact = crewImpact.concat(['Perk bonuses triggered:'], crewPerkSummary);
    }

    let playerImpact = (() => {
      if (selectedMission.status === 'available') {
        const summary = Array.isArray(preview?.playerImpact?.summary)
          ? preview.playerImpact.summary
          : [];
        return summary.length
          ? summary
          : ['Player influence steady — train to unlock bonuses.'];
      }

      const summary = Array.isArray(selectedMission.playerEffectSummary)
        ? selectedMission.playerEffectSummary
        : [];
      return summary.length
        ? summary
        : ['Player expertise locked for this operation.'];
    })();

    const recoveryDetails = selectedMission.falloutRecovery ?? null;
    if (recoveryDetails) {
      const recoveryLabel = recoveryDetails.type === 'medical' ? 'medical response' : 'rescue operation';
      const targetName = recoveryDetails.crewName ?? 'a crew member';
      const sourceName = recoveryDetails.sourceMissionName
        ? ` following ${recoveryDetails.sourceMissionName}`
        : '';
      missionDescription = `${missionDescription} Priority ${recoveryLabel} to recover ${targetName}${sourceName}.`.trim();

      const statusLabel = (recoveryDetails.status ?? 'pending').replace(/-/g, ' ');
      const operationLabel = recoveryDetails.type === 'medical' ? 'Stabilize' : 'Rescue';
      crewImpact = [
        `${operationLabel} target: ${targetName} (${statusLabel}).`,
        ...crewImpact,
      ];
      playerImpact = [
        'No direct payout — restores crew availability.',
        ...playerImpact,
      ];
      restrictionMessage = 'Priority fallout response — crackdown limits waived.';

      if (Number.isFinite(payoutValue) && payoutValue === 0) {
        missionPayout = 'Support operation';
      }
    }

    setMissionDetails({
      description: missionDescription,
      payout: missionPayout,
      heat: missionHeat,
      duration: missionDuration,
      success: missionSuccess,
      restriction: restrictionMessage,
      crewImpact,
      playerImpact,
    });

    missionForIntel = selectedMission;
  }

  updateCityIntelPanel({
    missionSystem,
    highlightedMission: missionForIntel,
    activeMission,
  });

  updateMissionStatusText();
  updateHeatManagementPanel();
  updateMaintenancePanel();
  updateSafehousePanel();
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
  const crackdownInfo = describeCrackdownPolicy();
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
    } else if (mission.status === 'decision-required') {
      statusLabel = `decision pending (${progressPercent}%)`;
    }

    const restrictionLabel = mission.restricted ? ' [LOCKED]' : '';
    const payoutValue = Number.isFinite(mission.payout) ? mission.payout : 0;
    const isSupportOperation = mission.falloutRecovery && payoutValue === 0;
    const payoutLabel = isSupportOperation
      ? 'Support'
      : `$${Math.max(0, payoutValue).toLocaleString()}`;
    let categoryLabel = null;
    if (mission.category === 'crackdown-operation') {
      const crackdownContext = describeCrackdownOperationContext(mission, crackdownInfo);
      categoryLabel = crackdownContext
        ? `CRACKDOWN: ${crackdownContext.tierLabel.toUpperCase()}`
        : 'CRACKDOWN';
    } else if (mission.category === 'crew-loyalty') {
      categoryLabel = 'LOYALTY';
    } else if (mission.falloutRecovery) {
      categoryLabel = mission.falloutRecovery.type === 'medical' ? 'MEDICAL' : 'RESCUE';
    }
    const prefix = categoryLabel ? `[${categoryLabel}] ` : '';
    option.textContent = `${prefix}${mission.name} — ${payoutLabel} (${statusLabel})${restrictionLabel}`;
    option.selected = selectionStillValid && mission.id === previousSelection;
    select.appendChild(option);
  });

  if (selectionStillValid) {
    select.value = previousSelection;
  }

  renderMissionLog();
};

const handleMissionEventChoice = (event) => {
  const target = event?.target;
  const button = target?.closest ? target.closest('button[data-event-choice]') : null;
  if (!button) {
    return;
  }

  const { eventId, choiceId } = button.dataset;
  if (!eventId || !choiceId) {
    return;
  }

  const missionSystem = getMissionSystem();
  if (!missionSystem) {
    setMissionEventStatus('Mission control offline — unable to resolve event.');
    return;
  }

  const result = missionSystem.chooseMissionEventOption(eventId, choiceId);
  if (!result) {
    setMissionEventStatus('Decision could not be processed — event already resolved.');
  } else {
    setMissionEventStatus(result.summary ?? 'Decision recorded.');
  }

  renderMissionEvents();
  updateMissionStatusText();
  triggerHudRender();
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
  setMissionEventStatus('Crew standing by for mid-run updates.');
  economySystem.payCrew();
  updateMissionSelect();
  updateMissionControls();
  updateVehicleSelectionOptions();
  triggerHudRender();
};

const setupMissionControls = () => {
  const ensureCrewAttributeControls = () => {
    const trainingSection = document.querySelector('.mission-training');
    if (!trainingSection) {
      return;
    }

    if (trainingSection.querySelector('#mission-training-attribute')) {
      return;
    }

    const statusNode = trainingSection.querySelector('#mission-training-status');
    const insertBeforeNode = statusNode ?? null;

    const attributeLabel = document.createElement('label');
    attributeLabel.className = 'mission-training__label';
    attributeLabel.id = 'mission-training-attribute-label';
    attributeLabel.setAttribute('for', 'mission-training-attribute');
    attributeLabel.textContent = 'Attribute focus';

    const attributeSelect = document.createElement('select');
    attributeSelect.id = 'mission-training-attribute';
    attributeSelect.name = 'mission-training-attribute';

    const actions = document.createElement('div');
    actions.className = 'mission-training__actions';

    const attributeButton = document.createElement('button');
    attributeButton.id = 'mission-training-attribute-btn';
    attributeButton.type = 'button';
    attributeButton.textContent = 'Attribute Training';
    actions.appendChild(attributeButton);

    const attributeList = document.createElement('ul');
    attributeList.id = 'mission-training-attribute-list';
    attributeList.className = 'mission-details__list mission-training__traits';
    const placeholder = document.createElement('li');
    placeholder.textContent = 'Select a crew member to inspect their attributes.';
    attributeList.appendChild(placeholder);

    if (insertBeforeNode) {
      trainingSection.insertBefore(attributeLabel, insertBeforeNode);
      trainingSection.insertBefore(attributeSelect, insertBeforeNode);
      trainingSection.insertBefore(actions, insertBeforeNode);
      trainingSection.insertBefore(attributeList, insertBeforeNode);
    } else {
      trainingSection.append(attributeLabel, attributeSelect, actions, attributeList);
    }
  };

  const controlPanel = document.querySelector('.control-panel');
  if (controlPanel) {
    let safehouseSection = controlPanel.querySelector('.mission-safehouse');
    if (!safehouseSection) {
      safehouseSection = document.createElement('section');
      safehouseSection.className = 'mission-safehouse';
      safehouseSection.setAttribute('aria-labelledby', 'mission-safehouse-title');

      const title = document.createElement('h3');
      title.id = 'mission-safehouse-title';
      title.className = 'mission-details__title';
      title.textContent = 'Safehouse Operations';

      const hint = document.createElement('p');
      hint.className = 'mission-details__hint';
      hint.textContent = 'Upgrade the hideout to unlock passive income and daily heat reduction.';

      const grid = document.createElement('dl');
      grid.className = 'mission-details__grid mission-safehouse__grid';

      const createRow = (labelText, valueElement) => {
        const row = document.createElement('div');
        row.className = 'mission-details__row';
        const label = document.createElement('dt');
        label.textContent = labelText;
        const value = document.createElement('dd');
        value.appendChild(valueElement);
        row.append(label, value);
        return row;
      };

      const nameValue = document.createElement('span');
      nameValue.id = 'mission-safehouse-name';
      nameValue.textContent = 'Safehouse systems initializing…';
      grid.appendChild(createRow('Current Safehouse', nameValue));

      const tierValue = document.createElement('span');
      tierValue.id = 'mission-safehouse-tier';
      tierValue.textContent = '—';
      grid.appendChild(createRow('Tier', tierValue));

      const effectsList = document.createElement('ul');
      effectsList.id = 'mission-safehouse-effects';
      effectsList.className = 'mission-details__list mission-safehouse__effects';
      const effectsPlaceholder = document.createElement('li');
      effectsPlaceholder.textContent = 'Safehouse intel unavailable.';
      effectsList.appendChild(effectsPlaceholder);
      const effectsWrapper = document.createElement('dd');
      effectsWrapper.appendChild(effectsList);
      const effectsRow = document.createElement('div');
      effectsRow.className = 'mission-details__row';
      const effectsLabel = document.createElement('dt');
      effectsLabel.textContent = 'Perks';
      effectsRow.append(effectsLabel, effectsWrapper);
      grid.appendChild(effectsRow);

      const catalog = document.createElement('div');
      catalog.id = 'mission-safehouse-catalog';
      catalog.className = 'mission-safehouse__catalog';
      const catalogPlaceholder = document.createElement('p');
      catalogPlaceholder.className = 'mission-safehouse__entry mission-safehouse__entry--placeholder';
      catalogPlaceholder.textContent = 'Safehouse manifest loading…';
      catalog.appendChild(catalogPlaceholder);

      const upgradeButton = document.createElement('button');
      upgradeButton.id = 'mission-safehouse-upgrade-btn';
      upgradeButton.type = 'button';
      upgradeButton.textContent = 'Upgrade Safehouse';

      const status = document.createElement('p');
      status.id = 'mission-safehouse-status';
      status.className = 'control-panel__status mission-safehouse__status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');

      safehouseSection.append(title, hint, grid, catalog, upgradeButton, status);

      const heatSection = controlPanel.querySelector('.mission-heat');
      if (heatSection && heatSection.parentElement === controlPanel) {
        controlPanel.insertBefore(safehouseSection, heatSection);
      } else {
        controlPanel.appendChild(safehouseSection);
      }
    }

    missionControls.safehouseSection = safehouseSection;
    missionControls.safehouseName = safehouseSection.querySelector('#mission-safehouse-name');
    missionControls.safehouseTier = safehouseSection.querySelector('#mission-safehouse-tier');
    missionControls.safehouseEffects = safehouseSection.querySelector('#mission-safehouse-effects');
    missionControls.safehouseList = safehouseSection.querySelector('#mission-safehouse-catalog');
    missionControls.safehouseUpgradeButton = safehouseSection.querySelector('#mission-safehouse-upgrade-btn');
    missionControls.safehouseStatus = safehouseSection.querySelector('#mission-safehouse-status');
  }

  ensureCrewAttributeControls();

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
  missionControls.detailPlayerImpact = document.getElementById('mission-detail-player-impact');
  missionControls.cityIntelSection = document.querySelector('.mission-city-intel');
  missionControls.cityIntelDistrictName = document.getElementById('mission-city-intel-district-name');
  missionControls.cityIntelDistrictDescription = document.getElementById(
    'mission-city-intel-district-description',
  );
  missionControls.cityIntelRisk = document.getElementById('mission-city-intel-risk');
  missionControls.cityIntelPoiName = document.getElementById('mission-city-intel-poi-name');
  missionControls.cityIntelPoiDescription = document.getElementById('mission-city-intel-poi-description');
  missionControls.cityIntelPoiPerks = document.getElementById('mission-city-intel-poi-perks');
  missionControls.cityIntelCanvas = document.getElementById('mission-city-intel-map');
  if (missionControls.cityIntelCanvas) {
    missionControls.cityIntelCanvasContext = missionControls.cityIntelCanvas.getContext('2d');
  }
  missionControls.eventPrompt = document.getElementById('mission-event-prompt');
  missionControls.eventChoices = document.getElementById('mission-event-choices');
  missionControls.eventHistory = document.getElementById('mission-event-history');
  missionControls.eventStatus = document.getElementById('mission-event-status');
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
  missionControls.trainingAttributeSelect = document.getElementById('mission-training-attribute');
  missionControls.trainingAttributeButton = document.getElementById('mission-training-attribute-btn');
  missionControls.trainingAttributeList = document.getElementById('mission-training-attribute-list');
  missionControls.trainingRestCrewSelect = document.getElementById('mission-training-rest-crew');
  missionControls.trainingRestDurationSelect = document.getElementById('mission-training-rest-duration');
  missionControls.trainingRestButton = document.getElementById('mission-training-rest-btn');
  missionControls.trainingStatus = document.getElementById('mission-training-status');
  missionControls.playerStatsList = document.getElementById('mission-player-stats');
  missionControls.playerSkillSelect = document.getElementById('mission-player-skill');
  missionControls.playerSkillButton = document.getElementById('mission-player-train-btn');
  missionControls.playerGearSelect = document.getElementById('mission-player-gear');
  missionControls.playerGearButton = document.getElementById('mission-player-gear-btn');
  missionControls.playerStatus = document.getElementById('mission-player-status');
  missionControls.maintenanceRepairButton = document.getElementById('mission-maintenance-repair-btn');
  missionControls.maintenanceHeatButton = document.getElementById('mission-maintenance-heat-btn');
  missionControls.maintenanceUpgradeSelect = document.getElementById('mission-maintenance-upgrade-select');
  missionControls.maintenanceUpgradeButton = document.getElementById('mission-maintenance-upgrade-btn');
  missionControls.maintenanceUpgradeList = document.getElementById('mission-maintenance-upgrade-list');
  missionControls.maintenanceStatus = document.getElementById('mission-maintenance-status');
  missionControls.heatLayLowButton = document.getElementById('mission-heat-laylow-btn');
  missionControls.heatBribeButton = document.getElementById('mission-heat-bribe-btn');
  missionControls.heatStatus = document.getElementById('mission-heat-status');
  missionControls.heatHistoryList = document.getElementById('mission-heat-history-list');

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
    detailPlayerImpact,
    cityIntelDistrictName,
    cityIntelDistrictDescription,
    cityIntelRisk,
    cityIntelPoiName,
    cityIntelPoiDescription,
    cityIntelPoiPerks,
    eventPrompt,
    eventChoices,
    eventHistory,
    eventStatus,
    crewList,
    vehicleList,
    crackdownText,
    logList,
    recruitList,
    recruitStatus,
    safehouseName,
    safehouseTier,
    safehouseEffects,
    safehouseUpgradeButton,
    safehouseStatus,
    trainingCrewSelect,
    trainingSpecialtySelect,
    trainingLoyaltyButton,
    trainingSpecialtyButton,
    trainingAttributeSelect,
    trainingAttributeButton,
    trainingAttributeList,
    trainingRestCrewSelect,
    trainingRestDurationSelect,
    trainingRestButton,
    trainingStatus,
    playerStatsList,
    playerSkillSelect,
    playerSkillButton,
    playerGearSelect,
    playerGearButton,
    playerStatus,
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
    detailPlayerImpact,
    cityIntelDistrictName,
    cityIntelDistrictDescription,
    cityIntelRisk,
    cityIntelPoiName,
    cityIntelPoiDescription,
    cityIntelPoiPerks,
    crewList,
    vehicleList,
    crackdownText,
    logList,
    recruitList,
    recruitStatus,
    safehouseName,
    safehouseTier,
    safehouseEffects,
    safehouseUpgradeButton,
    safehouseStatus,
    trainingCrewSelect,
    trainingSpecialtySelect,
    trainingLoyaltyButton,
    trainingSpecialtyButton,
    trainingAttributeSelect,
    trainingAttributeButton,
    trainingAttributeList,
    trainingRestCrewSelect,
    trainingRestDurationSelect,
    trainingRestButton,
    trainingStatus,
    playerStatsList,
    playerSkillSelect,
    playerSkillButton,
    playerGearSelect,
    playerGearButton,
    playerStatus,
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
  missionControls.eventChoices?.addEventListener('click', handleMissionEventChoice);
  trainingCrewSelect.addEventListener('change', updateTrainingOptions);
  trainingSpecialtySelect.addEventListener('change', updateTrainingOptions);
  trainingAttributeSelect?.addEventListener('change', updateTrainingOptions);
  trainingRestCrewSelect?.addEventListener('change', updateTrainingOptions);
  trainingRestDurationSelect?.addEventListener('change', updateTrainingOptions);
  playerSkillSelect.addEventListener('change', updatePlayerDevelopmentPanel);
  playerGearSelect.addEventListener('change', updatePlayerDevelopmentPanel);
  trainingLoyaltyButton.addEventListener('click', handleLoyaltyTraining);
  trainingSpecialtyButton.addEventListener('click', handleSpecialtyTraining);
  trainingAttributeButton?.addEventListener('click', handleAttributeTraining);
  trainingRestButton?.addEventListener('click', handleCrewRestScheduling);
  playerSkillButton.addEventListener('click', handlePlayerSkillTraining);
  playerGearButton.addEventListener('click', handlePlayerGearAcquisition);
  maintenanceRepairButton.addEventListener('click', handleMaintenanceRepair);
  maintenanceHeatButton.addEventListener('click', handleMaintenanceHeat);
  maintenanceUpgradeButton?.addEventListener('click', handleMaintenanceUpgrade);
  maintenanceUpgradeSelect?.addEventListener('change', updateMaintenancePanel);
  heatLayLowButton.addEventListener('click', handleHeatLayLow);
  heatBribeButton.addEventListener('click', handleHeatBribe);
  missionControls.safehouseUpgradeButton?.addEventListener('click', handleSafehouseUpgrade);
  missionControls.safehouseList?.addEventListener('click', handleSafehouseListClick);

  setRecruitStatus('');
  setTrainingStatus('');
  setPlayerStatus('');
  setMissionEventStatus('');
  missionControls.safehouseStatusDetail = '';
  clearMaintenanceStatusDetail();
  updateRecruitmentOptions();
  updateTrainingOptions();
  updatePlayerDevelopmentPanel();
  missionControls.heatStatusDetail = '';
  updateMaintenancePanel();
  updateHeatManagementPanel();
  updateSafehousePanel();

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
