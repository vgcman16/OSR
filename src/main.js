import { createCarThiefGame, createGameSerializer } from './game/carThief/index.js';
import { createSoundboard } from './game/carThief/audio/soundboard.js';
import {
  CrewMember,
  CREW_TRAIT_CONFIG,
  CREW_FATIGUE_CONFIG,
  CREW_RELATIONSHIP_CONFIG,
  clampAffinityScore,
  computeRelationshipMultiplier,
} from './game/carThief/entities/crewMember.js';
import {
  GARAGE_MAINTENANCE_CONFIG,
  PLAYER_SKILL_CONFIG,
  PLAYER_GEAR_CATALOG,
  VEHICLE_UPGRADE_CATALOG,
  getNotorietyProfile,
  getNextNotorietyProfile,
  CRACKDOWN_NOTORIETY_PRESSURE,
} from './game/carThief/systems/missionSystem.js';
import { getVehicleModRecipes, assessVehicleModAffordability } from './game/carThief/systems/vehicleModRecipes.js';
import {
  RECON_APPROACH_CONFIG,
  createApproachModifierSnapshot,
} from './game/carThief/systems/reconSystem.js';
import { executeHeatMitigation } from './game/carThief/systems/heatMitigationService.js';
import { getAvailableCrewStorylineMissions } from './game/carThief/systems/crewStorylines.js';
import { getActiveSafehouseFromState, getActiveStorageCapacityFromState } from './game/carThief/world/safehouse.js';
import { computeSafehouseFacilityBonuses, getFacilityEffectConfig } from './game/carThief/world/safehouseEffects.js';
import { createOnboardingTour } from './game/carThief/ui/onboarding.js';
import { CREW_GEAR_CATALOG } from './game/carThief/systems/crewGear.js';
import { getCrewGearVendorOptions, purchaseCrewGearFromVendor } from './game/carThief/systems/crewGearVendors.js';

let gameInstance = null;
let onboardingTour = null;

const settingsSerializer = createGameSerializer({ key: 'osr.car-thief.settings.v1' });
const DEFAULT_PLAYER_SETTINGS = { audio: { muted: false } };

const loadPlayerSettings = () => {
  const payload = settingsSerializer.load();
  if (!payload || typeof payload !== 'object') {
    return { ...DEFAULT_PLAYER_SETTINGS };
  }

  const audioSettings = payload.audio && typeof payload.audio === 'object' ? payload.audio : {};
  const muted = Boolean(audioSettings.muted);

  return {
    ...DEFAULT_PLAYER_SETTINGS,
    ...payload,
    audio: { ...DEFAULT_PLAYER_SETTINGS.audio, ...audioSettings, muted },
  };
};

let playerSettings = loadPlayerSettings();
const soundboard = createSoundboard({ muted: playerSettings?.audio?.muted });

const persistPlayerSettings = () => {
  playerSettings = {
    ...DEFAULT_PLAYER_SETTINGS,
    ...playerSettings,
    audio: {
      ...DEFAULT_PLAYER_SETTINGS.audio,
      ...(playerSettings?.audio ?? {}),
      muted: Boolean(playerSettings?.audio?.muted),
    },
  };

  settingsSerializer.save(playerSettings);
};

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
  detailVehicleReward: null,
  detailCrewImpact: null,
  detailPlayerImpact: null,
  detailBreakdown: null,
  cityIntelSection: null,
  cityIntelDistrictName: null,
  cityIntelDistrictDescription: null,
  cityIntelRisk: null,
  cityIntelInfluence: null,
  cityIntelIntelLevel: null,
  cityIntelCrackdown: null,
  cityIntelPoiName: null,
  cityIntelPoiDescription: null,
  cityIntelPoiPerks: null,
  campaignSection: null,
  campaignStageLabel: null,
  campaignReadiness: null,
  campaignRequirementsList: null,
  campaignReward: null,
  cityIntelCanvas: null,
  cityIntelCanvasContext: null,
  reconCrewSelect: null,
  reconDistrictSelect: null,
  reconDurationSelect: null,
  reconApproachSelect: null,
  reconAssignButton: null,
  reconApproachDetail: null,
  reconStatus: null,
  reconList: null,
  reconStatusDetail: '',
  reconStatusTone: 'neutral',
  reconStatusSource: 'system',
  reconStatusTimestamp: 0,
  reconSelectedCrewIds: [],
  lastReconCompletionKey: null,
  crewList: null,
  crewChemistryList: null,
  relationshipEventList: null,
  relationshipEventStatus: null,
  relationshipEventStatusDetail: '',
  vehicleList: null,
  crackdownText: null,
  crackdownForecast: null,
  crackdownForecastSummary: '',
  crackdownHistoryList: null,
  crackdownHistoryDetail: '',
  lastCrackdownHistorySignature: null,
  logList: null,
  recruitList: null,
  recruitStatus: null,
  eventPrompt: null,
  eventChoices: null,
  eventHistory: null,
  eventStatus: null,
  eventStatusDetail: '',
  lastEventPromptId: null,
  debtList: null,
  debtStatus: null,
  debtStatusDetail: '',
  operationsSection: null,
  operationsExpensesValue: null,
  operationsExpensesStatus: null,
  operationsPassiveIncomeValue: null,
  operationsPassiveIncomeStatus: null,
  operationsPayrollValue: null,
  operationsPayrollStatus: null,
  operationsStorageValue: null,
  operationsStorageStatus: null,
  operationsCrewFatigueValue: null,
  operationsCrewFatigueStatus: null,
  operationsHistoryContainer: null,
  operationsHistoryList: null,
  operationsHistoryEmpty: null,
  operationsHistoryStatus: null,
  operationsHistorySignature: '',
  trainingCrewSelect: null,
  trainingSpecialtySelect: null,
  trainingLoyaltyButton: null,
  trainingSpecialtyButton: null,
  trainingAttributeSelect: null,
  trainingAttributeButton: null,
  trainingAttributeList: null,
  trainingGearSelect: null,
  trainingGearAcquireButton: null,
  trainingGearEquipButton: null,
  trainingGearVendorStatus: null,
  trainingGearList: null,
  trainingRestCrewSelect: null,
  trainingRestDurationSelect: null,
  trainingRestButton: null,
  trainingStatus: null,
  crewStorylineSection: null,
  crewStorylineList: null,
  crewStorylineStatus: null,
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
  maintenancePartsStockpile: null,
  maintenanceCraftingList: null,
  maintenanceStatus: null,
  maintenanceStatusDetail: '',
  garageActivityList: null,
  heatActionContainer: null,
  heatActionButtons: new Map(),
  heatStatus: null,
  heatStatusDetail: '',
  heatHistoryList: null,
  audioToggle: null,
  lastMissionLogEntryId: null,
  safehouseSection: null,
  safehouseName: null,
  safehouseTier: null,
  safehouseEffects: null,
  safehouseList: null,
  safehouseProjects: null,
  safehouseUpgradeButton: null,
  safehouseProjectButton: null,
  safehouseRushButton: null,
  safehouseStatus: null,
  safehouseStatusDetail: '',
  safehouseAlertPrompt: null,
  safehouseAlertsList: null,
  safehouseAlertStatus: null,
  safehouseSelectedProjectId: null,
  lastSafehouseAlertSignature: null,
  selectedCrewIds: [],
  selectedVehicleId: null,
  lastGarageStatusTimestamp: 0,
  lastCrackdownTierName: null,
  lastMissionStatusKey: null,
};

const CITY_INTEL_CANVAS_ARIA_LABEL = 'City districts map — hover or use arrow keys to preview intel.';
const RECON_COOLDOWN_WINDOW_MS = 3 * 60 * 1000;

let cityIntelDistrictRects = [];
let cityIntelLastRenderedDistricts = [];
let cityIntelDistrictReconStatuses = new Map();
let cityIntelLastRenderContext = { districts: [], highlightedMission: null, activeMission: null };
let cityIntelInteractionOverride = null;
let cityIntelKeyboardIndex = -1;

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

const evaluateChemistryFromAffinity = (affinity) => {
  const normalizedAffinity = Number.isFinite(affinity) ? affinity : 0;
  const clampedAffinity = clampAffinityScore(normalizedAffinity);
  const multiplier = computeRelationshipMultiplier(clampedAffinity);
  const percentShift = Math.round((multiplier - 1) * 100);
  const percentLabel = percentShift > 0 ? `+${percentShift}%` : `${percentShift}%`;
  const synergyThreshold = Number.isFinite(CREW_RELATIONSHIP_CONFIG.synergyThreshold)
    ? CREW_RELATIONSHIP_CONFIG.synergyThreshold
    : 35;
  const strainThreshold = Number.isFinite(CREW_RELATIONSHIP_CONFIG.strainThreshold)
    ? CREW_RELATIONSHIP_CONFIG.strainThreshold
    : -35;

  let label = 'Chemistry steady';
  let status = 'steady';
  let isWarning = false;
  if (clampedAffinity >= synergyThreshold) {
    label = `Chemistry strong (${percentLabel})`;
    status = 'synergy';
  } else if (clampedAffinity <= strainThreshold) {
    label = `Chemistry strained (${percentLabel})`;
    status = 'strain';
    isWarning = true;
  } else if (Math.abs(percentShift) >= 1) {
    label = `Chemistry shifting (${percentLabel})`;
    status = 'shifting';
  }

  return { label, percentLabel, affinity: clampedAffinity, multiplier, isWarning, status };
};

const summarizeSelectedChemistry = (member, squadMembers = []) => {
  if (!member) {
    return null;
  }

  const memberId = member.id !== undefined && member.id !== null ? String(member.id).trim() : null;
  if (!memberId) {
    return null;
  }

  const peers = Array.isArray(squadMembers)
    ? squadMembers
        .map((peer) => {
          if (!peer || peer === member) {
            return null;
          }
          const peerId = peer.id !== undefined && peer.id !== null ? String(peer.id).trim() : null;
          return peerId ? { id: peerId, entity: peer } : null;
        })
        .filter(Boolean)
    : [];

  if (!peers.length) {
    return null;
  }

  const affinityScores = peers
    .map((peer) => {
      if (typeof member.getAffinityForCrewmate === 'function') {
        const score = member.getAffinityForCrewmate(peer.id);
        if (Number.isFinite(score)) {
          return score;
        }
      }
      return null;
    })
    .filter((value) => Number.isFinite(value));

  if (!affinityScores.length) {
    const crewName = member.name ?? 'Crew member';
    return {
      label: 'Chemistry intel pending',
      tooltip: `${crewName} has no recorded rapport with the selected crew yet.`,
      isWarning: false,
      affinity: 0,
      multiplier: 1,
    };
  }

  const averageAffinity = affinityScores.reduce((sum, value) => sum + value, 0) / affinityScores.length;
  const summary = evaluateChemistryFromAffinity(averageAffinity);

  const crewName = member.name ?? 'Crew member';
  const tooltip = `${crewName} rapport average ${Math.round(summary.affinity)} — trait impact ${summary.percentLabel}.`;

  return {
    label: summary.label,
    tooltip,
    isWarning: summary.isWarning,
    affinity: summary.affinity,
    multiplier: summary.multiplier,
  };
};

const getCrewGearInventory = (member) => {
  if (!member) {
    return [];
  }

  const raw = typeof member.getGearInventory === 'function'
    ? member.getGearInventory()
    : Array.isArray(member.gearInventory)
      ? member.gearInventory
      : [];

  const seen = new Set();
  const normalized = [];
  raw.forEach((gearId) => {
    if (!gearId && gearId !== 0) {
      return;
    }
    const id = String(gearId);
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    normalized.push(id);
  });

  return normalized;
};

const getCrewEquippedGearIds = (member) => {
  if (!member) {
    return [];
  }

  const raw = typeof member.getEquippedGearIds === 'function'
    ? member.getEquippedGearIds()
    : Array.isArray(member.equippedGear)
      ? member.equippedGear
      : [];

  const inventory = new Set(getCrewGearInventory(member));
  const seen = new Set();
  const normalized = [];
  raw.forEach((gearId) => {
    if (!gearId && gearId !== 0) {
      return;
    }
    const id = String(gearId);
    if (!id || seen.has(id) || !inventory.has(id)) {
      return;
    }
    seen.add(id);
    normalized.push(id);
  });

  return normalized;
};

const crewOwnsGear = (member, gearId) => {
  if (!gearId) {
    return false;
  }
  const normalized = String(gearId);
  return getCrewGearInventory(member).includes(normalized);
};

const crewHasEquippedGear = (member, gearId) => {
  if (!gearId) {
    return false;
  }
  const normalized = String(gearId);
  return getCrewEquippedGearIds(member).includes(normalized);
};

const describeCrewGearLoadout = (member) => {
  const equipped = getCrewEquippedGearIds(member);
  if (!equipped.length) {
    return 'Gear: None equipped';
  }

  const labels = equipped.map((gearId) => CREW_GEAR_CATALOG[gearId]?.label ?? gearId);
  return `Gear: ${labels.join(', ')}`;
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

  const fundingRemaining =
    Number.isFinite(facility.cost) && Number.isFinite(facility.fundedAmount)
      ? Math.max(0, facility.cost - facility.fundedAmount)
      : null;
  if (fundingRemaining !== null && fundingRemaining > 0) {
    effectParts.push(`${formatCurrency(fundingRemaining)} funding needed`);
  }

  const durationValue = Number.isFinite(facility.durationDays) ? Math.max(0, facility.durationDays) : null;
  const timeInvestedValue = Number.isFinite(facility.timeInvested) ? Math.max(0, facility.timeInvested) : null;
  if (
    durationValue !== null &&
    timeInvestedValue !== null &&
    durationValue > 0 &&
    fundingRemaining !== null &&
    fundingRemaining <= 0
  ) {
    const remaining = Math.max(0, durationValue - timeInvestedValue);
    if (remaining > 0) {
      const dayLabel = remaining === 1 ? '1 day' : `${remaining} days`;
      effectParts.push(`${dayLabel} remaining`);
    }
  }

  if (Number.isFinite(facility.progress) && facility.progress > 0 && facility.progress < 1) {
    effectParts.push(`${Math.round(facility.progress * 100)}% complete`);
  }

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

const renderCrewGearList = (container, member) => {
  if (!container) {
    return;
  }

  container.innerHTML = '';

  if (!member) {
    const placeholder = document.createElement('li');
    placeholder.textContent = 'Select a crew member to review their gear.';
    container.appendChild(placeholder);
    return;
  }

  const inventory = getCrewGearInventory(member);
  const equippedSet = new Set(getCrewEquippedGearIds(member));

  if (!inventory.length) {
    const placeholder = document.createElement('li');
    placeholder.textContent = 'No crew gear acquired yet.';
    container.appendChild(placeholder);
    return;
  }

  inventory.forEach((gearId) => {
    const config = CREW_GEAR_CATALOG[gearId] ?? null;
    const label = config?.label ?? gearId;
    const status = equippedSet.has(gearId) ? 'Equipped' : 'Stowed';
    const description = config?.description ? ` — ${config.description}` : '';
    const item = document.createElement('li');
    item.textContent = `${label} (${status})${description}`;
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
    description: 'Rotate crews through low-profile covers to let the city forget your faces.',
    crackdownBonus: {
      tierBonuses: { alert: 0.3, lockdown: 0.5 },
      inactiveSummary: 'Bonus climbs when the crackdown escalates to alert or lockdown.',
    },
  },
  bribeOfficials: {
    key: 'bribeOfficials',
    label: 'Bribe Officials',
    cost: 9000,
    heatReduction: 4.5,
    description: 'Slide thick envelopes across command desks to stall investigations.',
    crackdownBonus: {
      tierBonuses: { alert: 0.6, lockdown: 1.2 },
      inactiveSummary: 'Bribes hit harder during alert or lockdown crackdowns.',
    },
    facilityBonus: {
      ids: ['informant-dead-drops'],
      heatReductionBonus: 0.6,
      activeSummary: 'Informant Dead Drops add -0.6 heat to every payoff.',
      inactiveSummary: 'Fund Informant Dead Drops to boost bribery heat drops.',
    },
  },
  informantDeadDrops: {
    key: 'informantDeadDrops',
    label: 'Activate Dead Drops',
    cost: 6500,
    heatReduction: 3.2,
    description: 'Trigger informant leverage dumps to smother precinct chatter.',
    crackdownBonus: {
      tierBonuses: { alert: 0.3, lockdown: 0.7 },
      inactiveSummary: 'Lockdown pushes the bonus to its full potential.',
    },
    facilityBonus: {
      ids: ['informant-dead-drops'],
      heatReductionBonus: 0.8,
      activeSummary: 'Safehouse dead drops add -0.8 heat to the sweep.',
      inactiveSummary: 'Dead drop investments unlock another -0.8 heat.',
    },
  },
  sanctuarySweep: {
    key: 'sanctuarySweep',
    label: 'Sanctuary Sweep',
    cost: 7800,
    heatReduction: 3.6,
    description: 'Deploy counter-surveillance teams to re-route crackdown patrols around your turf.',
    crackdownBonus: {
      tierBonuses: { alert: 0.4, lockdown: 1 },
      inactiveSummary: 'Crackdown pressure adds up to -1.0 heat during lockdown.',
    },
    facilityBonus: {
      ids: ['escape-tunnel-grid'],
      heatReductionBonus: 0.6,
      activeSummary: 'Escape Tunnel Grid amplifies the sweep by -0.6 heat.',
      inactiveSummary: 'Build the Escape Tunnel Grid to unlock the sweep bonus.',
    },
  },
  signalSpoof: {
    key: 'signalSpoof',
    label: 'Spoof Crackdown Broadcasts',
    cost: 5600,
    heatReduction: 2.8,
    description: 'Hijack precinct bulletins to stall raids and redirect officers.',
    crackdownBonus: {
      tierBonuses: { alert: 0.4, lockdown: 0.8 },
      activeSummary: 'Crackdown tier {tier} adds -{bonus} heat to the spoof.',
      inactiveSummary: 'Bonus scales up once the crackdown escalates.',
    },
    facilityBonus: {
      ids: ['quiet-network', 'ghost-terminal-core'],
      heatReductionBonus: 0.5,
      activeSummary: 'Quiet Network lines add -0.5 heat to the broadcast.',
      inactiveSummary: 'Wire the Quiet Network to unlock another -0.5 heat.',
    },
  },
  frontCompanyBlitz: {
    key: 'frontCompanyBlitz',
    label: 'Front Company Blitz',
    cost: 8600,
    heatReduction: 3.9,
    description: 'Overwhelm auditors with shell company paperwork to bury leads.',
    crackdownBonus: {
      tierBonuses: { alert: 0.5, lockdown: 1 },
      activeSummary: 'Crackdown tier {tier} diverts -{bonus} heat into shell firms.',
      inactiveSummary: 'Unlock higher crackdown tiers to unleash the paperwork dragnet.',
    },
    facilityBonus: {
      ids: ['shell-company-hub', 'shell-finance-desk'],
      heatReductionBonus: 0.7,
      activeSummary: 'Shell financiers launder an extra -0.7 heat.',
      inactiveSummary: 'Fund shell finance upgrades for another -0.7 heat.',
    },
  },
  phantomSweep: {
    key: 'phantomSweep',
    label: 'Phantom Sweep',
    cost: 11800,
    heatReduction: 5.1,
    description: 'Deploy the full counter-intel syndicate to scrub every trace.',
    crackdownBonus: {
      tierBonuses: { alert: 0.8, lockdown: 1.5 },
      activeSummary: 'Crackdown tier {tier} hands the sweep another -{bonus} heat.',
      inactiveSummary: 'Wait for alert or lockdown pressure to magnify the sweep.',
    },
    facilityBonus: {
      ids: ['phantom-syndicate-suite'],
      heatReductionBonus: 1.2,
      activeSummary: 'Phantom Syndicate teams add -1.2 heat to the sweep.',
      inactiveSummary: 'Complete the Phantom Syndicate suite to unlock the final drop.',
    },
  },
};

const RECON_DURATION_OPTIONS = [
  { value: 'quick', label: 'Quick sweep — 30s', seconds: 30 },
  { value: 'standard', label: 'Standard sweep — 45s', seconds: 45 },
  { value: 'deep', label: 'Deep infiltration — 60s', seconds: 60 },
];

const RECON_APPROACH_OPTIONS = [
  {
    value: 'stealth',
    label: 'Stealth infiltration — safer intel haul',
    summary: 'Stealth',
    description: 'Lower detection risk and richer intel in exchange for a longer, low-profile sweep.',
    actionSummary: 'Stealth infiltration slows the op for better intel while trimming setbacks and fatigue.',
  },
  {
    value: 'surveillance',
    label: 'Surveillance lock-in — patient intel surge',
    summary: 'Surveillance',
    description: 'Perch lookouts for an extended watch that wrings out intel and lightens crackdown pressure.',
    actionSummary: 'Surveillance lock-in runs the team longer for a big intel bump and mild crackdown relief.',
  },
  {
    value: 'balanced',
    label: 'Balanced sweep — standard tempo',
    summary: 'Balanced',
    description: 'Default pacing with an even mix of intel gains, risk, and recovery.',
    actionSummary: 'Balanced sweep sticks with the default recon tempo and risk profile.',
  },
  {
    value: 'liaison',
    label: 'Shadow diplomacy — influence play',
    summary: 'Liaison',
    description: 'Lean on contacts to amplify influence and decent intel while risking more attention.',
    actionSummary: 'Shadow diplomacy invests time to spike influence, accepting extra fatigue and crackdown heat.',
  },
  {
    value: 'aggressive',
    label: 'Aggressive breach — fast strike',
    summary: 'Aggressive',
    description: 'Finish quickly while risking higher detection, setbacks, and lighter intel packages.',
    actionSummary: 'Aggressive breach resolves faster but spikes detection risk, setbacks, and crew fatigue.',
  },
  {
    value: 'decoy',
    label: 'Decoy saturation — crackdown bleed-off',
    summary: 'Decoy',
    description: 'Flood the zone with misdirection to shed crackdown pressure while sacrificing haul quality.',
    actionSummary: 'Decoy saturation runs short distractions that ease crackdown pressure but blunt rewards.',
  },
];

const getMissionSystem = () => gameInstance?.systems?.mission ?? null;
const getEconomySystem = () => gameInstance?.systems?.economy ?? null;
const getHeatSystem = () => gameInstance?.systems?.heat ?? null;
const getReconSystem = () => gameInstance?.systems?.recon ?? null;
const getSharedState = () => gameInstance?.state ?? getMissionSystem()?.state ?? null;

const triggerHudRender = () => {
  if (gameInstance?.loop?.render) {
    gameInstance.loop.render();
  }
};

const formatCrackdownEffectsSummary = (effects) => {
  if (!effects || typeof effects !== 'object') {
    return '';
  }

  const entries = [];
  const addEntry = (label, value, { prefix = null, decimals = 1 } = {}) => {
    if (!Number.isFinite(value)) {
      return;
    }

    const precision = Math.max(0, Math.min(3, Math.round(decimals)));
    const magnitude = Math.abs(value);
    const threshold = precision > 0 ? 1 / 10 ** precision : 1;
    if (magnitude < threshold) {
      return;
    }

    const formattedMagnitude = magnitude.toFixed(precision);
    const resolvedPrefix = prefix
      ? prefix
      : value > 0
        ? '+'
        : '−';
    entries.push(`${label} ${resolvedPrefix}${formattedMagnitude}`);
  };

  const primaryHeatRelief = Number(effects.heatReduction);
  addEntry('Heat relief', primaryHeatRelief, { prefix: '−', decimals: 1 });
  addEntry('Failure penalty', Number(effects.heatPenaltyOnFailure), { prefix: '+', decimals: 1 });
  if (!Number.isFinite(primaryHeatRelief)) {
    addEntry('Heat relief', Number(effects.heatRelief), { prefix: '−', decimals: 1 });
  }

  const successBonus = Number(effects.successBonus);
  if (Number.isFinite(successBonus)) {
    const percentValue = successBonus * 100;
    const decimals = Math.abs(percentValue) < 10 ? 1 : 0;
    const threshold = decimals > 0 ? 1 / 10 ** decimals : 1;
    if (Math.abs(percentValue) >= threshold) {
      const formattedMagnitude = Math.abs(percentValue).toFixed(decimals);
      const prefix = percentValue >= 0 ? '+' : '−';
      entries.push(`Success bonus ${prefix}${formattedMagnitude}%`);
    }
  }

  Object.entries(effects).forEach(([key, rawValue]) => {
    if (['heatReduction', 'heatPenaltyOnFailure', 'heatRelief', 'successBonus'].includes(key)) {
      return;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      return;
    }

    const decimals = Math.abs(value) < 10 ? 1 : 0;
    const parts = key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[-_]+/g, ' ')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
    if (!parts.length) {
      return;
    }

    const label = parts.join(' ');
    addEntry(label, value, { decimals });
  });

  return entries.join(', ');
};

const resolveCrackdownEffectsForMission = (missionId) => {
  const missionSystem = getMissionSystem();
  if (!missionSystem || missionId === undefined || missionId === null) {
    return null;
  }

  const normalizedId = `${missionId}`.trim();
  if (!normalizedId) {
    return null;
  }

  const checkMission = (mission) => {
    if (!mission || mission.id === undefined || mission.id === null) {
      return null;
    }
    const candidateId = `${mission.id}`.trim();
    if (!candidateId || candidateId !== normalizedId) {
      return null;
    }
    if (mission.crackdownEffects && typeof mission.crackdownEffects === 'object') {
      return mission.crackdownEffects;
    }
    if (mission.template && typeof mission.template === 'object') {
      const templateEffects = mission.template.crackdownEffects;
      if (templateEffects && typeof templateEffects === 'object') {
        return templateEffects;
      }
    }
    return null;
  };

  const inspectSource = (source) => {
    if (!source) {
      return null;
    }
    if (Array.isArray(source)) {
      for (let index = 0; index < source.length; index += 1) {
        const found = checkMission(source[index]);
        if (found) {
          return found;
        }
      }
      return null;
    }
    return checkMission(source);
  };

  const sources = [
    missionSystem.state?.activeMission ?? null,
    missionSystem.availableMissions ?? null,
    missionSystem.contractPool ?? null,
    missionSystem.missionTemplates ?? null,
  ];

  for (let index = 0; index < sources.length; index += 1) {
    const effects = inspectSource(sources[index]);
    if (effects) {
      return effects;
    }
  }

  if (missionSystem.templateMap instanceof Map && missionSystem.templateMap.has(normalizedId)) {
    const template = missionSystem.templateMap.get(normalizedId);
    if (template?.crackdownEffects && typeof template.crackdownEffects === 'object') {
      return template.crackdownEffects;
    }
  }

  return null;
};

const appendUniqueBreakdownLine = (collection, line) => {
  const normalized = typeof line === 'string' ? line.trim() : '';
  if (!normalized) {
    return;
  }

  const alreadyPresent = collection.some((entry) => {
    if (typeof entry !== 'string') {
      return false;
    }
    return entry.trim().toLowerCase() === normalized.toLowerCase();
  });

  if (!alreadyPresent) {
    collection.push(normalized);
  }
};

const describeDurationDelta = (multiplier) => {
  if (!Number.isFinite(multiplier)) {
    return null;
  }

  const deltaPercent = Math.round((1 - multiplier) * 100);
  if (Math.abs(deltaPercent) < 1) {
    return null;
  }

  return `${Math.abs(deltaPercent)}% ${deltaPercent > 0 ? 'faster' : 'slower'}`;
};

const describePercentDelta = (multiplier) => {
  if (!Number.isFinite(multiplier)) {
    return null;
  }

  const deltaPercent = Math.round((multiplier - 1) * 100);
  if (Math.abs(deltaPercent) < 1) {
    return null;
  }

  return `${deltaPercent > 0 ? '+' : ''}${deltaPercent}%`;
};

const buildMissionBreakdown = ({
  summaryLines = [],
  perkSummary = [],
  vehicleImpact = null,
  playerImpact = null,
  chemistry = null,
} = {}) => {
  const crewModifiers = [];
  const vehicleEffects = [];
  const safehousePerks = [];
  const playerBoosts = [];
  const chemistryWarnings = [];

  const normalizedSummary = Array.isArray(summaryLines) ? summaryLines : [];
  normalizedSummary.forEach((rawLine) => {
    const trimmed = typeof rawLine === 'string' ? rawLine.trim() : '';
    if (!trimmed) {
      return;
    }

    if (/^safehouse:/i.test(trimmed)) {
      const cleanLine = trimmed.replace(/^Safehouse:\s*/i, '');
      appendUniqueBreakdownLine(safehousePerks, cleanLine);
      return;
    }

    if (/^vehicle(\b|\s)/i.test(trimmed) || /^vehicle upgrades:/i.test(trimmed)) {
      appendUniqueBreakdownLine(vehicleEffects, trimmed);
      return;
    }

    if (/chemistry/i.test(trimmed)) {
      return;
    }

    appendUniqueBreakdownLine(crewModifiers, trimmed);
  });

  const normalizedPerks = Array.isArray(perkSummary) ? perkSummary : [];
  normalizedPerks.forEach((line) => {
    appendUniqueBreakdownLine(crewModifiers, line);
  });

  const playerImpactSummary = Array.isArray(playerImpact?.summary)
    ? playerImpact.summary
    : [];
  playerImpactSummary.forEach((line) => {
    appendUniqueBreakdownLine(playerBoosts, line);
  });

  if (playerImpact && typeof playerImpact === 'object') {
    const durationLine = describeDurationDelta(playerImpact.durationMultiplier);
    if (durationLine) {
      appendUniqueBreakdownLine(playerBoosts, `Timeline: ${durationLine}.`);
    }

    const payoutLine = describePercentDelta(playerImpact.payoutMultiplier);
    if (payoutLine) {
      appendUniqueBreakdownLine(playerBoosts, `Payout modifier: ${payoutLine}.`);
    }

    const successBonusPercent = Number.isFinite(playerImpact.successBonus)
      ? Math.round(playerImpact.successBonus * 100)
      : 0;
    if (successBonusPercent) {
      const successLabel = successBonusPercent > 0 ? '+' : '';
      appendUniqueBreakdownLine(
        playerBoosts,
        `Success bonus: ${successLabel}${successBonusPercent}%.`,
      );
    }

    const heatLine = describePercentDelta(playerImpact.heatMultiplier);
    if (heatLine) {
      appendUniqueBreakdownLine(playerBoosts, `Heat modifier: ${heatLine}.`);
    }

    if (Array.isArray(playerImpact.skillsApplied) && playerImpact.skillsApplied.length) {
      const skillLabels = playerImpact.skillsApplied.map((entry) => {
        const config = PLAYER_SKILL_CONFIG?.[entry?.key];
        const label = typeof config?.label === 'string' ? config.label : `${entry?.key ?? 'Skill'}`;
        const levelValue = Number.isFinite(entry?.level)
          ? entry.level
          : Number.isFinite(config?.baseLevel)
            ? config.baseLevel
            : 1;
        return `${label} (Lv ${levelValue})`;
      });
      appendUniqueBreakdownLine(playerBoosts, `Skills leveraged: ${skillLabels.join(', ')}.`);
    }

    if (Array.isArray(playerImpact.gearApplied) && playerImpact.gearApplied.length) {
      const gearLabels = playerImpact.gearApplied.map((gearId) => {
        const gearEntry = PLAYER_GEAR_CATALOG?.[gearId];
        return typeof gearEntry?.label === 'string' ? gearEntry.label : `${gearId}`;
      });
      appendUniqueBreakdownLine(playerBoosts, `Gear readied: ${gearLabels.join(', ')}.`);
    }
  }

  if (vehicleImpact && typeof vehicleImpact === 'object') {
    if (vehicleImpact.model) {
      appendUniqueBreakdownLine(
        vehicleEffects,
        `Assigned vehicle: ${vehicleImpact.model}.`,
      );
    }

    const vehicleDuration = describeDurationDelta(vehicleImpact.durationMultiplier);
    if (vehicleDuration) {
      appendUniqueBreakdownLine(
        vehicleEffects,
        `Timeline impact: ${vehicleDuration}.`,
      );
    }

    const vehicleSuccessPercent = Number.isFinite(vehicleImpact.successContribution)
      ? Math.round(vehicleImpact.successContribution * 100)
      : 0;
    if (vehicleSuccessPercent) {
      const label = vehicleSuccessPercent > 0 ? '+' : '';
      appendUniqueBreakdownLine(
        vehicleEffects,
        `Success odds: ${label}${vehicleSuccessPercent}%.`,
      );
    }

    if (Number.isFinite(vehicleImpact.heatAdjustment) && Math.abs(vehicleImpact.heatAdjustment) >= 0.05) {
      const heatLabel = vehicleImpact.heatAdjustment > 0 ? '+' : '';
      appendUniqueBreakdownLine(
        vehicleEffects,
        `Heat adjustment: ${heatLabel}${vehicleImpact.heatAdjustment.toFixed(1)}.`,
      );
    }

    if (
      Number.isFinite(vehicleImpact.wearOnSuccess)
      && Number.isFinite(vehicleImpact.wearOnFailure)
    ) {
      appendUniqueBreakdownLine(
        vehicleEffects,
        `Wear: ${(vehicleImpact.wearOnSuccess * 100).toFixed(0)}% on success, ${(vehicleImpact.wearOnFailure * 100).toFixed(0)}% on failure.`,
      );
    }

    if (
      Number.isFinite(vehicleImpact.heatGainOnSuccess)
      && Number.isFinite(vehicleImpact.heatGainOnFailure)
    ) {
      appendUniqueBreakdownLine(
        vehicleEffects,
        `Heat gain: ${vehicleImpact.heatGainOnSuccess.toFixed(1)} on success, ${vehicleImpact.heatGainOnFailure.toFixed(1)} on failure.`,
      );
    }

    if (Array.isArray(vehicleImpact.installedMods) && vehicleImpact.installedMods.length) {
      const modLabels = vehicleImpact.installedMods.map((modId) => {
        const modEntry = VEHICLE_UPGRADE_CATALOG?.[modId];
        return typeof modEntry?.label === 'string' ? modEntry.label : `${modId}`;
      });
      appendUniqueBreakdownLine(
        vehicleEffects,
        `Installed upgrades: ${modLabels.join(', ')}.`,
      );
    }
  }

  if (chemistry && typeof chemistry === 'object') {
    if (chemistry.summary) {
      appendUniqueBreakdownLine(chemistryWarnings, `Status: ${chemistry.summary}`);
    }
    if (chemistry.highlight) {
      appendUniqueBreakdownLine(chemistryWarnings, `Boost: ${chemistry.highlight}`);
    }
    if (chemistry.warning) {
      appendUniqueBreakdownLine(chemistryWarnings, `⚠️ Warning: ${chemistry.warning}`);
    }
  }

  return {
    crewModifiers,
    vehicleEffects,
    safehousePerks,
    playerBoosts,
    chemistryWarnings,
  };
};

const renderMissionBreakdown = (breakdown) => {
  const { detailBreakdown } = missionControls;
  if (!detailBreakdown) {
    return;
  }

  detailBreakdown.innerHTML = '';

  const normalized = breakdown && typeof breakdown === 'object' ? breakdown : {};
  const getLines = (key) => {
    const value = normalized[key];
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((line) => (typeof line === 'string' ? line.trim() : ''))
      .filter(Boolean);
  };

  const sections = [
    {
      key: 'crewModifiers',
      label: 'Crew modifiers',
      hint: 'Trait boosts, loadouts, and situational crew effects applied to this mission.',
      empty: 'No crew modifiers applied yet.',
    },
    {
      key: 'vehicleEffects',
      label: 'Vehicle effects',
      hint: 'Vehicle condition, upgrades, and performance adjustments currently in play.',
      empty: 'No vehicle assigned or no vehicle effects detected.',
    },
    {
      key: 'safehousePerks',
      label: 'Safehouse perks',
      hint: 'Facility bonuses impacting timeline, payout, success, or heat.',
      empty: 'No safehouse perks influencing this mission.',
    },
    {
      key: 'playerBoosts',
      label: 'Player boosts',
      hint: 'Training and gear modifiers contributed by the player character.',
      empty: 'No player boosts active.',
    },
    {
      key: 'chemistryWarnings',
      label: 'Chemistry alerts',
      hint: 'Team chemistry highlights, boosts, or warnings to monitor.',
      empty: 'No chemistry alerts detected.',
    },
  ];

  sections.forEach((section) => {
    const lines = getLines(section.key);
    const sectionElement = document.createElement('section');
    sectionElement.className = 'mission-breakdown__section';
    sectionElement.setAttribute('role', 'group');

    const headingId = `${detailBreakdown.id}-${section.key}-label`;
    const heading = document.createElement('h4');
    heading.className = 'mission-breakdown__heading';
    heading.id = headingId;
    heading.textContent = section.label;
    if (section.hint) {
      heading.title = section.hint;
      heading.setAttribute('aria-label', `${section.label}. ${section.hint}`);
    }
    sectionElement.appendChild(heading);

    sectionElement.setAttribute('aria-labelledby', headingId);

    const list = document.createElement('ul');
    list.className = 'mission-breakdown__list';
    list.setAttribute('role', 'list');

    if (!lines.length) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'mission-breakdown__item mission-breakdown__item--empty';
      emptyItem.textContent = section.empty;
      list.appendChild(emptyItem);
    } else {
      lines.forEach((line) => {
        const item = document.createElement('li');
        item.className = 'mission-breakdown__item';
        item.textContent = line;
        list.appendChild(item);
      });
    }

    sectionElement.appendChild(list);
    detailBreakdown.appendChild(sectionElement);
  });
};

const setMissionDetails = ({
  description,
  payout,
  heat,
  duration,
  success,
  restriction,
  vehicleReward,
  crewImpact,
  playerImpact,
  crackdownEffects,
  crackdownEffectsSummary,
  breakdown = null,
}) => {
  const {
    detailDescription,
    detailPayout,
    detailHeat,
    detailDuration,
    detailSuccess,
    detailRestriction,
    detailVehicleReward,
    detailCrewImpact,
    detailPlayerImpact,
    detailBreakdown,
  } = missionControls;

  if (
    !(
      detailDescription &&
      detailPayout &&
      detailHeat &&
      detailDuration &&
      detailSuccess &&
      detailRestriction &&
      detailVehicleReward &&
      detailCrewImpact &&
      detailPlayerImpact &&
      detailBreakdown
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

  const rewardLines = (() => {
    if (!vehicleReward) {
      return [];
    }

    if (Array.isArray(vehicleReward)) {
      return vehicleReward;
    }

    if (typeof vehicleReward === 'string') {
      return [vehicleReward];
    }

    if (typeof vehicleReward === 'object') {
      const lines = [];
      const label = typeof vehicleReward.label === 'string' ? vehicleReward.label.trim() : '';
      if (label) {
        lines.push(label);
      }

      if (Array.isArray(vehicleReward.lines)) {
        vehicleReward.lines.forEach((entry) => {
          if (typeof entry === 'string' && entry.trim()) {
            lines.push(entry.trim());
          }
        });
      }

      if (typeof vehicleReward.storage === 'string' && vehicleReward.storage.trim()) {
        lines.push(vehicleReward.storage.trim());
      } else if (Number.isFinite(vehicleReward.storageRequired)) {
        const storageRequired = Math.max(1, Math.round(vehicleReward.storageRequired));
        const storageLabel = storageRequired === 1
          ? 'Storage: requires 1 garage slot.'
          : `Storage: requires ${storageRequired} garage slots.`;
        lines.push(storageLabel);
      }

      const summaryLine = typeof vehicleReward.summary === 'string' ? vehicleReward.summary.trim() : '';
      if (summaryLine) {
        lines.push(summaryLine);
      }

      const statusLine = typeof vehicleReward.status === 'string' ? vehicleReward.status.trim() : '';
      if (statusLine) {
        lines.push(statusLine);
      }

      return lines;
    }

    return [];
  })();

  const normalizedRewardLines = rewardLines
    .map((line) => (typeof line === 'string' ? line.trim() : ''))
    .filter(Boolean);

  const fallbackRewardLines = normalizedRewardLines.length
    ? normalizedRewardLines
    : ['Vehicle reward intel pending.'];

  detailVehicleReward.innerHTML = '';
  fallbackRewardLines.forEach((line) => {
    const item = document.createElement('li');
    item.textContent = line;
    detailVehicleReward.appendChild(item);
  });

  detailCrewImpact.innerHTML = '';
  const impactItems = Array.isArray(crewImpact)
    ? crewImpact
    : [crewImpact ?? 'No crew assigned.'];
  const formattedCrackdownSummary = (() => {
    if (typeof crackdownEffectsSummary === 'string' && crackdownEffectsSummary.trim()) {
      return crackdownEffectsSummary.trim();
    }
    const derived = formatCrackdownEffectsSummary(crackdownEffects);
    return derived ? `Crackdown effects: ${derived}` : '';
  })();
  const normalizedImpactItems = impactItems
    .map((line) => (typeof line === 'string' ? line.trim() : ''))
    .filter(Boolean);
  if (formattedCrackdownSummary) {
    const summaryCore = formattedCrackdownSummary.replace(/^Crackdown effects:\s*/, '');
    const alreadyCovered = normalizedImpactItems.some((line) => {
      if (!line) {
        return false;
      }
      if (line.includes(formattedCrackdownSummary)) {
        return true;
      }
      return summaryCore && line.includes(summaryCore);
    });
    if (!alreadyCovered) {
      normalizedImpactItems.push(formattedCrackdownSummary);
    }
  }
  normalizedImpactItems.forEach((line) => {
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

  renderMissionBreakdown(breakdown);
};

const resetMissionDetails = (descriptionText) => {
  setMissionDetails({
    description: descriptionText,
    payout: '—',
    heat: '—',
    duration: '—',
    success: '—',
    restriction: 'All contracts are currently open.',
    vehicleReward: ['Vehicle reward intel pending.'],
    crewImpact: ['No crew assigned.', 'No vehicle selected.'],
    playerImpact: ['Player expertise steady — train to unlock bonuses.'],
    breakdown: null,
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

const clampDistrictMeter = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.round(Math.max(0, Math.min(100, numeric)));
};

const describeDistrictMeter = (value, thresholds = [], fallback = 'Data pending.') => {
  const numeric = clampDistrictMeter(value);
  if (numeric === null) {
    return fallback;
  }

  const tier = thresholds.find((entry) => numeric <= entry.max) ?? thresholds[thresholds.length - 1];
  const descriptor = tier ? tier.label : null;
  return descriptor ? `${numeric} — ${descriptor}` : `${numeric}`;
};

const describeDistrictInfluence = (value) =>
  describeDistrictMeter(
    value,
    [
      { max: 29, label: 'Fragmented foothold' },
      { max: 54, label: 'Steady network' },
      { max: 79, label: 'Strong syndicate sway' },
      { max: Infinity, label: 'Dominant control' },
    ],
    'Influence readings pending.',
  );

const describeDistrictIntelLevel = (value) =>
  describeDistrictMeter(
    value,
    [
      { max: 24, label: 'Blind spots everywhere' },
      { max: 49, label: 'Partial surveillance' },
      { max: 74, label: 'Mapped routes' },
      { max: Infinity, label: 'Ghosted oversight' },
    ],
    'Intel sweep pending.',
  );

const describeDistrictCrackdown = (value) =>
  describeDistrictMeter(
    value,
    [
      { max: 24, label: 'Calm patrol rotations' },
      { max: 49, label: 'Raised alertness' },
      { max: 74, label: 'Intensified sweeps' },
      { max: Infinity, label: 'Severe pressure' },
    ],
    'Crackdown telemetry pending.',
  );

const CAMPAIGN_REQUIREMENT_LABELS = {
  influence: 'Influence',
  intelLevel: 'Intel',
  crackdownPressure: 'Crackdown',
};

const formatCampaignRequirementLine = (entry) => {
  if (!entry) {
    return null;
  }

  const label = CAMPAIGN_REQUIREMENT_LABELS[entry.key] ?? entry.key;
  const required = Number.isFinite(entry.required) ? Math.round(entry.required) : null;
  const current = Number.isFinite(entry.current) ? Math.round(entry.current) : null;

  if (required === null || current === null) {
    return `${label}: intel unavailable`;
  }

  if (entry.key === 'crackdownPressure') {
    if (entry.met) {
      return `${label} ${current} ≤ ${required}`;
    }
    const reduction = Number.isFinite(entry.delta)
      ? Math.max(1, Math.round(entry.delta))
      : Math.max(1, current - required);
    return `${label} ${current} → reduce by ${reduction} to ${required}`;
  }

  if (entry.met) {
    return `${label} ${current}/${required}`;
  }

  const delta = Number.isFinite(entry.delta)
    ? Math.max(1, Math.round(entry.delta))
    : Math.max(1, required - current);

  return `${label} ${current}/${required} (needs +${delta})`;
};

const buildCampaignIntelLines = ({ district, mission }) => {
  let snapshot = null;
  if (district && typeof district.getCampaignSnapshot === 'function') {
    snapshot = district.getCampaignSnapshot();
  }

  if (!snapshot && mission?.campaignMilestone) {
    const milestone = mission.campaignMilestone;
    snapshot = {
      stage: Number.isFinite(milestone?.stage) ? milestone.stage : null,
      totalStages: null,
      status: 'active',
      activeMilestone: {
        stage: Number.isFinite(milestone?.stage) ? milestone.stage : null,
        name: milestone?.name ?? null,
        rewardPreview: milestone?.rewardPreview ?? null,
        readiness: 1,
        ready: true,
        requirements: Object.entries(milestone?.requirements ?? {}).map(([key, value]) => ({
          key,
          required: Number.isFinite(value) ? value : null,
          current: null,
          met: true,
          delta: 0,
        })),
      },
    };
  }

  if (!snapshot) {
    return { snapshot: null, lines: [] };
  }

  if (snapshot.status === 'complete') {
    return {
      snapshot,
      lines: ['Campaign: All milestones cleared — district fully liberated.'],
    };
  }

  const milestone = snapshot.activeMilestone;
  if (!milestone) {
    return { snapshot, lines: [] };
  }

  const stageIndex = Number.isFinite(milestone.stage) ? milestone.stage : null;
  const totalStages = Number.isFinite(snapshot.totalStages) ? snapshot.totalStages : null;
  const headerParts = [];
  if (stageIndex !== null) {
    const stageLabel = stageIndex + 1;
    headerParts.push(`Stage ${totalStages ? `${stageLabel}/${totalStages}` : stageLabel}`);
  }
  if (milestone.name) {
    headerParts.push(milestone.name);
  }

  const header = headerParts.length ? headerParts.join(' — ') : 'Campaign milestone';
  const lines = [`Campaign: ${header}`];

  if (milestone.rewardPreview) {
    lines.push(`Campaign reward: ${milestone.rewardPreview}`);
  }

  if (milestone.ready) {
    lines.push('Milestone ready — special contract available now.');
    return lines;
  }

  const readinessPercent = Number.isFinite(milestone.readiness)
    ? Math.round(Math.min(1, Math.max(0, milestone.readiness)) * 100)
    : null;
  if (readinessPercent !== null) {
    lines.push(`Progress: ${readinessPercent}% toward unlock.`);
  }

  const requirements = Array.isArray(milestone.requirements) ? milestone.requirements : [];
  requirements.forEach((requirement) => {
    const formatted = formatCampaignRequirementLine(requirement);
    if (!formatted) {
      return;
    }
    if (requirement.met) {
      lines.push(`Ready: ${formatted}`);
    } else {
      lines.push(`Needs ${formatted}`);
    }
  });

  return { snapshot, lines };
};

const renderCampaignProgress = (snapshot) => {
  const {
    campaignSection,
    campaignStageLabel,
    campaignReadiness,
    campaignRequirementsList,
    campaignReward,
  } = missionControls;

  if (!campaignStageLabel || !campaignReadiness || !campaignRequirementsList || !campaignReward) {
    return;
  }

  const requirementEntries = [];

  const applySectionState = (state) => {
    if (campaignSection) {
      if (state) {
        campaignSection.dataset.state = state;
      } else {
        delete campaignSection.dataset.state;
      }
    }
  };

  let stageText = 'No district campaign is currently tracked.';
  let readinessText = 'Campaign readiness intel pending.';
  let readinessState = 'idle';
  let rewardText = 'Reward preview pending.';

  if (!snapshot) {
    applySectionState('empty');
    requirementEntries.push({ text: 'Requirement intel pending.', met: false });
  } else if (snapshot.status === 'complete') {
    applySectionState('complete');
    stageText = 'Campaign complete — district liberated.';
    readinessText = 'All milestones cleared.';
    readinessState = 'ready';
    rewardText = snapshot.completeReward
      ? `Reward secured: ${snapshot.completeReward}`
      : 'District benefits active.';
    requirementEntries.push({ text: 'No further requirements.', met: true });
  } else {
    applySectionState('active');
    const milestone = snapshot.activeMilestone ?? null;
    if (milestone) {
      const stageIndex = Number.isFinite(milestone.stage) ? milestone.stage : null;
      const totalStages = Number.isFinite(snapshot.totalStages) ? snapshot.totalStages : null;
      if (stageIndex !== null) {
        const stageLabel = stageIndex + 1;
        stageText = totalStages ? `Stage ${stageLabel} of ${totalStages}` : `Stage ${stageLabel}`;
      } else {
        stageText = 'Campaign milestone';
      }
      if (milestone.name) {
        stageText = `${stageText} — ${milestone.name}`;
      }

      if (milestone.rewardPreview) {
        rewardText = `Reward: ${milestone.rewardPreview}`;
      } else {
        rewardText = 'Reward intel pending.';
      }

      if (milestone.ready) {
        readinessText = 'Milestone ready — launch the special contract.';
        readinessState = 'ready';
      } else {
        const readinessPercent = Number.isFinite(milestone.readiness)
          ? Math.round(Math.min(1, Math.max(0, milestone.readiness)) * 100)
          : null;
        readinessText =
          readinessPercent !== null
            ? `Progress: ${readinessPercent}% toward unlock.`
            : 'Progress intel pending.';
        readinessState = 'locked';
      }

      const requirements = Array.isArray(milestone.requirements) ? milestone.requirements : [];
      requirements.forEach((entry) => {
        const label = formatCampaignRequirementLine(entry);
        if (!label) {
          return;
        }
        requirementEntries.push({ text: label, met: Boolean(entry?.met) });
      });

      if (!requirementEntries.length) {
        requirementEntries.push({
          text: milestone.ready ? 'Awaiting final confirmation.' : 'Requirement intel pending.',
          met: Boolean(milestone.ready),
        });
      }
    } else {
      stageText = 'Campaign data syncing.';
      readinessText = 'Awaiting active milestone.';
      readinessState = 'idle';
      requirementEntries.push({ text: 'Requirement intel pending.', met: false });
    }
  }

  campaignStageLabel.textContent = stageText;
  campaignReadiness.textContent = readinessText;
  campaignReadiness.dataset.state = readinessState;
  campaignReward.textContent = rewardText;

  campaignRequirementsList.innerHTML = '';
  requirementEntries.forEach(({ text, met }) => {
    const item = document.createElement('li');
    item.textContent = text;
    item.dataset.state = met ? 'ready' : 'locked';
    campaignRequirementsList.appendChild(item);
  });
};

const setCityIntelDetails = ({
  districtName,
  districtDescription,
  risk,
  influence,
  intelLevel,
  crackdownPressure,
  poiName,
  poiDescription,
  poiPerks,
}) => {
  const {
    cityIntelDistrictName,
    cityIntelDistrictDescription,
    cityIntelRisk,
    cityIntelInfluence,
    cityIntelIntelLevel,
    cityIntelCrackdown,
    cityIntelPoiName,
    cityIntelPoiDescription,
    cityIntelPoiPerks,
  } = missionControls;

  if (
    !(
      cityIntelDistrictName &&
      cityIntelDistrictDescription &&
      cityIntelRisk &&
      cityIntelInfluence &&
      cityIntelIntelLevel &&
      cityIntelCrackdown &&
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
  cityIntelInfluence.textContent = influence;
  cityIntelIntelLevel.textContent = intelLevel;
  cityIntelCrackdown.textContent = crackdownPressure;
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
    influence: 'Influence readings pending.',
    intelLevel: 'Intel sweep pending.',
    crackdownPressure: 'Crackdown telemetry pending.',
    poiName: 'No special target flagged.',
    poiDescription: 'District sweep awaiting recon.',
    poiPerks: ['No unique perks detected.'],
  });
  renderCampaignProgress(null);
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

const createDistrictKeysFromReconAssignment = (assignment) => {
  if (!assignment) {
    return [];
  }

  const keys = [];
  const idKey = normalizeDistrictKey(assignment.districtId);
  if (idKey) {
    keys.push(`id:${idKey}`);
  }

  const nameKey = normalizeDistrictKey(assignment.districtName);
  if (nameKey) {
    keys.push(`name:${nameKey}`);
  }

  if (!keys.length && assignment.district && typeof assignment.district === 'object') {
    const fallbackKey = createDistrictKeyFromDistrict(assignment.district);
    if (fallbackKey) {
      keys.push(fallbackKey);
    }
  }

  return [...new Set(keys)];
};

const getDistrictIndexByKey = (key) => {
  if (!key) {
    return -1;
  }

  return cityIntelDistrictRects.find((entry) => entry?.key === key)?.index ?? -1;
};

const getCityIntelInteractionOverrideMission = () => cityIntelInteractionOverride?.mission ?? null;

const updateCityIntelCanvasAriaLabel = ({ districtName = null, districtKey = null } = {}) => {
  const canvas = missionControls.cityIntelCanvas;
  if (!canvas) {
    return;
  }

  let resolvedName = typeof districtName === 'string' && districtName.trim() ? districtName.trim() : null;
  let resolvedKey = districtKey ?? null;

  if (!resolvedKey && cityIntelInteractionOverride?.key) {
    resolvedKey = cityIntelInteractionOverride.key;
  }

  if (!resolvedName && cityIntelInteractionOverride?.districtName) {
    resolvedName = cityIntelInteractionOverride.districtName;
  }

  if (!resolvedKey && resolvedName) {
    const normalizedName = normalizeDistrictKey(resolvedName);
    if (normalizedName) {
      const nameKey = `name:${normalizedName}`;
      if (cityIntelDistrictReconStatuses.has(nameKey)) {
        resolvedKey = nameKey;
      }
    }
  }

  if (!resolvedKey && cityIntelKeyboardIndex >= 0) {
    const fallback = cityIntelLastRenderedDistricts[cityIntelKeyboardIndex];
    if (fallback) {
      resolvedKey = createDistrictKeyFromDistrict(fallback);
      if (!resolvedName) {
        resolvedName = fallback?.name ?? null;
      }
    }
  }

  if (resolvedKey && !cityIntelDistrictReconStatuses.has(resolvedKey)) {
    const alternateKey = (() => {
      if (!resolvedKey) {
        return null;
      }
      if (resolvedKey.startsWith('id:')) {
        const district = cityIntelLastRenderedDistricts.find(
          (entry) => normalizeDistrictKey(entry?.id) === resolvedKey.slice(3),
        );
        return district ? createDistrictKeyFromDistrict(district) : null;
      }
      if (resolvedKey.startsWith('name:')) {
        const district = cityIntelLastRenderedDistricts.find(
          (entry) => normalizeDistrictKey(entry?.name) === resolvedKey.slice(5),
        );
        return district ? createDistrictKeyFromDistrict(district) : null;
      }
      return null;
    })();
    if (alternateKey && cityIntelDistrictReconStatuses.has(alternateKey)) {
      resolvedKey = alternateKey;
    }
  }

  let ariaLabel = CITY_INTEL_CANVAS_ARIA_LABEL;
  if (resolvedName) {
    ariaLabel = `${ariaLabel} Active district: ${resolvedName}.`;
  }

  if (resolvedKey && cityIntelDistrictReconStatuses.has(resolvedKey)) {
    const reconStatus = cityIntelDistrictReconStatuses.get(resolvedKey);
    const statusLabel = reconStatus?.label ?? reconStatus?.state ?? null;
    if (statusLabel) {
      ariaLabel = `${ariaLabel} Recon status: ${statusLabel}.`;
    }
  }

  canvas.setAttribute('aria-label', ariaLabel.trim());
};

const createMissionPreviewFromDistrict = (district) => {
  if (!district) {
    return null;
  }

  const districtKey = createDistrictKeyFromDistrict(district);
  if (!districtKey) {
    return null;
  }

  const intelSnapshot = (() => {
    if (typeof district.getIntelSnapshot === 'function') {
      return district.getIntelSnapshot();
    }

    const influence = Number.isFinite(district?.influence) ? Math.round(district.influence) : null;
    const intelLevel = Number.isFinite(district?.intelLevel) ? Math.round(district.intelLevel) : null;
    const crackdownPressure = Number.isFinite(district?.crackdownPressure)
      ? Math.round(district.crackdownPressure)
      : null;

    if (influence === null && intelLevel === null && crackdownPressure === null) {
      return null;
    }

    return { influence, intelLevel, crackdownPressure };
  })();

  const pointOfInterest = (() => {
    const list = Array.isArray(district?.pointsOfInterest) ? district.pointsOfInterest : [];
    if (!list.length) {
      return null;
    }

    const [primary] = list;
    if (!primary || typeof primary !== 'object') {
      return null;
    }

    const clone = { ...primary };
    clone.modifiers = typeof clone.modifiers === 'object' && clone.modifiers !== null ? { ...clone.modifiers } : {};
    return clone;
  })();

  return {
    districtId: district.id ?? null,
    districtName: district.name ?? null,
    description: district.description ?? '',
    riskTier: determineDistrictRiskTier(district.security),
    pointOfInterest,
    districtIntel: intelSnapshot,
  };
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

const renderCityIntelMap = ({
  districts = [],
  highlightedMission = null,
  activeMission = null,
  reconAssignments = [],
} = {}) => {
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
  cityIntelLastRenderedDistricts = districtList.slice();
  cityIntelDistrictRects = [];
  cityIntelDistrictReconStatuses = new Map();
  cityIntelLastRenderContext = { districts: districtList.slice(), highlightedMission, activeMission };

  const normalizedAssignments = Array.isArray(reconAssignments)
    ? reconAssignments.filter((entry) => entry && typeof entry === 'object')
    : [];

  const assignmentsByKey = new Map();
  const registerAssignmentForKey = (key, assignment) => {
    if (!key) {
      return;
    }
    const bucket = assignmentsByKey.get(key) ?? [];
    bucket.push(assignment);
    assignmentsByKey.set(key, bucket);
  };

  normalizedAssignments.forEach((assignment) => {
    const keys = createDistrictKeysFromReconAssignment(assignment);
    if (!keys.length) {
      return;
    }
    keys.forEach((key) => registerAssignmentForKey(key, assignment));
  });

  if (!districtList.length) {
    context.fillStyle = '#9ac7ff';
    context.font = '14px "Segoe UI", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('City intel offline', canvas.width / 2, canvas.height / 2);
    context.restore();
    cityIntelKeyboardIndex = -1;
    updateCityIntelCanvasAriaLabel();
    return;
  }

  const highlightKey = createDistrictKeyFromMission(highlightedMission);
  const activeKey = createDistrictKeyFromMission(activeMission);

  const now = Date.now();
  const buildReconStatus = (assignments) => {
    if (!Array.isArray(assignments) || !assignments.length) {
      return null;
    }

    const normalized = assignments
      .map((entry) => (entry && typeof entry === 'object' ? entry : null))
      .filter(Boolean);
    if (!normalized.length) {
      return null;
    }

    const activeAssignments = normalized
      .filter((entry) => (entry.status ?? '').toLowerCase() === 'in-progress')
      .sort((a, b) => {
        const timeA = a?.updatedAt ?? a?.startedAt ?? 0;
        const timeB = b?.updatedAt ?? b?.startedAt ?? 0;
        return timeB - timeA;
      });

    if (activeAssignments.length) {
      return {
        state: 'active',
        label: 'Recon in progress',
        icon: '▶',
        fill: 'rgba(52, 211, 153, 0.35)',
        stroke: '#34d399',
      };
    }

    const sorted = normalized
      .slice()
      .sort((a, b) => {
        const timeA = a?.updatedAt ?? a?.completedAt ?? a?.startedAt ?? 0;
        const timeB = b?.updatedAt ?? b?.completedAt ?? b?.startedAt ?? 0;
        return timeB - timeA;
      });
    const latest = sorted[0];
    if (!latest) {
      return null;
    }

    const latestStatus = (latest.status ?? '').toLowerCase();
    if (latestStatus === 'failed') {
      return {
        state: 'failed',
        label: 'Recon failed',
        icon: '⚠',
        fill: 'rgba(248, 113, 113, 0.35)',
        stroke: '#f87171',
      };
    }

    if (latestStatus === 'completed') {
      const completedAt = latest.completedAt ?? latest.updatedAt ?? latest.startedAt ?? null;
      const withinCooldown =
        !Number.isFinite(completedAt) || completedAt === null
          ? true
          : now - completedAt <= RECON_COOLDOWN_WINDOW_MS;
      if (withinCooldown) {
        return {
          state: 'cooldown',
          label: 'Recon cooling down',
          icon: '⏳',
          fill: 'rgba(251, 191, 36, 0.28)',
          stroke: '#fbbf24',
        };
      }
    }

    return null;
  };

  const gatherAssignmentsForKeys = (keys) => {
    const unique = new Map();
    keys
      .filter(Boolean)
      .forEach((key) => {
        const bucket = assignmentsByKey.get(key);
        if (!Array.isArray(bucket)) {
          return;
        }
        bucket.forEach((assignment) => {
          if (!assignment || typeof assignment !== 'object') {
            return;
          }
          const identifier = assignment.id ?? `${assignment.districtId ?? 'district'}-${assignment.startedAt ?? 0}`;
          if (!unique.has(identifier)) {
            unique.set(identifier, assignment);
          }
        });
      });
    return Array.from(unique.values());
  };

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

    const districtKeys = (() => {
      const keys = [];
      if (districtKey) {
        keys.push(districtKey);
      }
      const idKey = normalizeDistrictKey(district?.id);
      if (idKey) {
        keys.push(`id:${idKey}`);
      }
      const nameKey = normalizeDistrictKey(district?.name);
      if (nameKey) {
        keys.push(`name:${nameKey}`);
      }
      return [...new Set(keys)];
    })();

    const reconStatus = buildReconStatus(gatherAssignmentsForKeys(districtKeys));
    if (reconStatus) {
      districtKeys.forEach((key) => {
        if (key) {
          cityIntelDistrictReconStatuses.set(key, reconStatus);
        }
      });
    }

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

    if (reconStatus) {
      const indicatorWidth = Math.max(Math.min(cellWidth * 0.1, 28), 14);
      const indicatorHeight = Math.max(cellHeight - 12, 12);
      const indicatorX = cellX + cellWidth - indicatorWidth - 8;
      const indicatorY = cellY + (cellHeight - indicatorHeight) / 2;

      context.save();
      context.fillStyle = reconStatus.fill;
      context.fillRect(indicatorX, indicatorY, indicatorWidth, indicatorHeight);
      context.strokeStyle = reconStatus.stroke;
      context.strokeRect(indicatorX + 0.5, indicatorY + 0.5, indicatorWidth - 1, indicatorHeight - 1);

      if (reconStatus.state === 'cooldown') {
        context.lineWidth = 1;
        context.strokeStyle = reconStatus.stroke;
        for (let offset = -indicatorHeight; offset < indicatorWidth; offset += 4) {
          context.beginPath();
          context.moveTo(indicatorX + offset, indicatorY);
          context.lineTo(indicatorX + offset + indicatorHeight, indicatorY + indicatorHeight);
          context.stroke();
        }
      }

      if (reconStatus.icon) {
        context.fillStyle = '#0b131d';
        context.font = '12px "Segoe UI", sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(reconStatus.icon, indicatorX + indicatorWidth / 2, indicatorY + indicatorHeight / 2 + 1);
      }

      context.restore();
    }

    cityIntelDistrictRects.push({
      key: districtKey,
      index,
      district,
      x: cellX,
      y: cellY,
      width: cellWidth,
      height: cellHeight,
      reconState: reconStatus?.state ?? null,
    });
  });

  if (cityIntelKeyboardIndex >= districtList.length) {
    cityIntelKeyboardIndex = districtList.length ? districtList.length - 1 : -1;
  }

  context.restore();
};

const updateCityIntelPanel = ({ missionSystem, highlightedMission, activeMission }) => {
  const city = missionSystem?.state?.city ?? null;
  const districts = Array.isArray(city?.districts) ? city.districts : [];
  const reconSystem = getReconSystem();
  const reconAssignments = reconSystem?.state?.reconAssignments
    ?? missionSystem?.state?.reconAssignments
    ?? [];

  const overrideMission = getCityIntelInteractionOverrideMission();
  const mission = overrideMission ?? highlightedMission ?? activeMission ?? null;
  if (!mission) {
    resetCityIntelPanel();
    renderCityIntelMap({ districts, highlightedMission: null, activeMission, reconAssignments });
    if (!overrideMission) {
      updateCityIntelCanvasAriaLabel();
    }
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
  const { snapshot: campaignSnapshot, lines: campaignIntelLines } = buildCampaignIntelLines({
    district,
    mission,
  });
  renderCampaignProgress(campaignSnapshot);
  let poiDetails = Array.isArray(poiPerks) ? [...poiPerks] : [];
  if (
    poiDetails.length === 1 &&
    poiDetails[0] === 'No unique perks detected.' &&
    campaignIntelLines.length
  ) {
    poiDetails = [];
  }
  poiDetails.push(...campaignIntelLines);
  if (!poiDetails.length) {
    poiDetails = ['No unique perks detected.'];
  }

  const districtIntelSnapshot = (() => {
    if (district && typeof district.getIntelSnapshot === 'function') {
      return district.getIntelSnapshot();
    }
    if (mission.districtIntel && typeof mission.districtIntel === 'object') {
      return { ...mission.districtIntel };
    }
    if (mission.districtIntelAfter) {
      return { ...mission.districtIntelAfter };
    }
    if (mission.districtIntelBefore) {
      return { ...mission.districtIntelBefore };
    }
    return null;
  })();

  const influenceLabel = describeDistrictInfluence(districtIntelSnapshot?.influence);
  const intelLabel = describeDistrictIntelLevel(districtIntelSnapshot?.intelLevel);
  const crackdownLabel = describeDistrictCrackdown(districtIntelSnapshot?.crackdownPressure);

  setCityIntelDetails({
    districtName,
    districtDescription,
    risk: riskLabel,
    influence: influenceLabel,
    intelLevel: intelLabel,
    crackdownPressure: crackdownLabel,
    poiName,
    poiDescription,
    poiPerks: poiDetails,
  });

  renderCityIntelMap({ districts, highlightedMission: mission, activeMission, reconAssignments });

  if (!overrideMission) {
    const districtKey = district
      ? createDistrictKeyFromDistrict(district)
      : createDistrictKeyFromMission(mission);
    updateCityIntelCanvasAriaLabel({ districtName, districtKey });
  }
};

const refreshCityIntelPanelWithOverride = () => {
  const missionSystem = getMissionSystem();
  if (!missionSystem) {
    resetCityIntelPanel();
    cityIntelDistrictRects = [];
    cityIntelLastRenderedDistricts = [];
    cityIntelKeyboardIndex = -1;
    updateCityIntelCanvasAriaLabel();
    renderCityIntelMap({ districts: [], highlightedMission: null, activeMission: null, reconAssignments: [] });
    return;
  }

  updateCityIntelPanel({
    missionSystem,
    highlightedMission: getCityIntelInteractionOverrideMission(),
    activeMission: missionSystem.state?.activeMission ?? null,
  });
};

const setCityIntelInteractionOverrideFromDistrict = (district, { reason = 'hover', index = null } = {}) => {
  if (!district) {
    return;
  }

  const districtKey = createDistrictKeyFromDistrict(district);
  if (!districtKey) {
    return;
  }

  const normalizedReason = reason || 'hover';
  const previousKey = cityIntelInteractionOverride?.key ?? null;
  const previousReason = cityIntelInteractionOverride?.reason ?? null;

  if (previousKey === districtKey && previousReason === normalizedReason) {
    if (normalizedReason === 'keyboard' && typeof index === 'number') {
      cityIntelKeyboardIndex = index;
    }
    updateCityIntelCanvasAriaLabel({ districtName: district?.name ?? null, districtKey });
    return;
  }

  const missionPreview = createMissionPreviewFromDistrict(district);
  if (!missionPreview) {
    return;
  }

  const resolvedIndex =
    typeof index === 'number' && index >= 0 ? index : getDistrictIndexByKey(districtKey);

  cityIntelInteractionOverride = {
    mission: missionPreview,
    key: districtKey,
    reason: normalizedReason,
    index: resolvedIndex,
    districtName: district?.name ?? null,
  };

  if (normalizedReason === 'keyboard') {
    cityIntelKeyboardIndex = resolvedIndex;
  }

  updateCityIntelCanvasAriaLabel({ districtName: district?.name ?? null, districtKey });
  refreshCityIntelPanelWithOverride();
};

const clearCityIntelInteractionOverride = (reason = null) => {
  if (!cityIntelInteractionOverride) {
    if (!reason || reason === 'keyboard') {
      cityIntelKeyboardIndex = reason === 'keyboard' ? -1 : cityIntelKeyboardIndex;
      updateCityIntelCanvasAriaLabel();
      refreshCityIntelPanelWithOverride();
    }
    return;
  }

  if (reason && cityIntelInteractionOverride.reason !== reason) {
    return;
  }

  cityIntelInteractionOverride = null;

  if (!reason || reason === 'keyboard') {
    cityIntelKeyboardIndex = -1;
  }

  updateCityIntelCanvasAriaLabel();
  refreshCityIntelPanelWithOverride();
};

const resolveCityIntelPointerTarget = (event) => {
  const canvas = missionControls.cityIntelCanvas;
  if (!canvas || !event) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) {
    return null;
  }

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  return (
    cityIntelDistrictRects.find(
      (entry) =>
        entry &&
        typeof entry.x === 'number' &&
        typeof entry.y === 'number' &&
        typeof entry.width === 'number' &&
        typeof entry.height === 'number' &&
        x >= entry.x &&
        x <= entry.x + entry.width &&
        y >= entry.y &&
        y <= entry.y + entry.height,
    ) ?? null
  );
};

const armReconTargetFromDistrict = (district) => {
  const districtId = district?.id ?? null;
  if (!districtId) {
    return;
  }

  const { reconDistrictSelect } = missionControls;
  if (!reconDistrictSelect) {
    return;
  }

  reconDistrictSelect.value = districtId;
  updateReconPanel();

  if (missionControls.reconDistrictSelect?.value !== districtId) {
    return;
  }

  const reconSection = reconDistrictSelect.closest('.mission-recon');
  if (reconSection && typeof reconSection.scrollIntoView === 'function') {
    reconSection.scrollIntoView({ block: 'nearest' });
  }

  const districtLabel = district?.name ?? 'District';
  setReconStatus(`Recon target armed: ${districtLabel}.`, { tone: 'info', source: 'system' });
};

const handleCityIntelCanvasPointerMove = (event) => {
  const target = resolveCityIntelPointerTarget(event);
  if (!target) {
    if (cityIntelInteractionOverride?.reason === 'hover') {
      clearCityIntelInteractionOverride('hover');
    }
    return;
  }

  setCityIntelInteractionOverrideFromDistrict(target.district, {
    reason: 'hover',
    index: target.index,
  });
};

const handleCityIntelCanvasPointerDown = (event) => {
  const canvas = missionControls.cityIntelCanvas;
  if (canvas && document.activeElement !== canvas) {
    canvas.focus({ preventScroll: true });
  }

  const target = resolveCityIntelPointerTarget(event);
  if (target) {
    setCityIntelInteractionOverrideFromDistrict(target.district, {
      reason: 'hover',
      index: target.index,
    });
    armReconTargetFromDistrict(target.district);
  }
};

const handleCityIntelCanvasPointerLeave = () => {
  if (cityIntelInteractionOverride?.reason === 'hover') {
    clearCityIntelInteractionOverride('hover');
    if (cityIntelKeyboardIndex >= 0) {
      const fallback = cityIntelLastRenderedDistricts[cityIntelKeyboardIndex];
      if (fallback) {
        setCityIntelInteractionOverrideFromDistrict(fallback, {
          reason: 'keyboard',
          index: cityIntelKeyboardIndex,
        });
      }
    }
  }
};

const handleCityIntelCanvasFocus = () => {
  const canvas = missionControls.cityIntelCanvas;
  if (!canvas) {
    return;
  }

  canvas.style.outline = '2px solid rgba(255, 214, 102, 0.85)';
  canvas.style.outlineOffset = '2px';

  if (cityIntelKeyboardIndex < 0) {
    const currentKey = cityIntelInteractionOverride?.key ?? null;
    let startIndex = currentKey ? getDistrictIndexByKey(currentKey) : -1;

    if (startIndex < 0) {
      const missionSystem = getMissionSystem();
      const missionState = missionSystem?.state ?? {};
      const activeMission = missionState.activeMission ?? null;
      const selectValue = missionControls.select?.value ?? null;
      const highlightedMission = (() => {
        if (!missionSystem) {
          return activeMission;
        }
        if (selectValue) {
          return (
            missionSystem.availableMissions?.find((mission) => mission.id === selectValue) ?? activeMission ?? null
          );
        }
        return activeMission;
      })();

      startIndex = getDistrictIndexByKey(createDistrictKeyFromMission(highlightedMission));
    }

    if (startIndex >= 0) {
      cityIntelKeyboardIndex = startIndex;
    }
  }
};

const handleCityIntelCanvasBlur = () => {
  const canvas = missionControls.cityIntelCanvas;
  if (canvas) {
    canvas.style.outline = 'none';
  }

  if (cityIntelInteractionOverride?.reason === 'keyboard') {
    clearCityIntelInteractionOverride('keyboard');
  }
};

const handleCityIntelCanvasKeyDown = (event) => {
  const { key } = event;
  const totalDistricts = cityIntelLastRenderedDistricts.length;
  if (!totalDistricts) {
    return;
  }

  let nextIndex = cityIntelKeyboardIndex >= 0 ? cityIntelKeyboardIndex : getDistrictIndexByKey(cityIntelInteractionOverride?.key);
  let handled = false;

  if (key === 'ArrowDown' || key === 'ArrowRight') {
    nextIndex = Math.min(totalDistricts - 1, (nextIndex ?? -1) + 1);
    handled = true;
  } else if (key === 'ArrowUp' || key === 'ArrowLeft') {
    nextIndex = Math.max(0, (nextIndex ?? totalDistricts) - 1);
    handled = true;
  } else if (key === 'Home') {
    nextIndex = 0;
    handled = true;
  } else if (key === 'End') {
    nextIndex = totalDistricts - 1;
    handled = true;
  } else if (key === 'Escape') {
    clearCityIntelInteractionOverride('keyboard');
    handled = true;
  }

  if (!handled) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (key === 'Escape') {
    return;
  }

  if (nextIndex < 0 || nextIndex >= totalDistricts) {
    return;
  }

  const district = cityIntelLastRenderedDistricts[nextIndex];
  if (district) {
    setCityIntelInteractionOverrideFromDistrict(district, { reason: 'keyboard', index: nextIndex });
    armReconTargetFromDistrict(district);
  }
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

const getDebtPrincipal = (debt) => {
  if (!debt || typeof debt !== 'object') {
    return 0;
  }

  const amount = Number(debt.amount);
  if (Number.isFinite(amount) && amount > 0) {
    return Math.round(amount);
  }

  const remaining = Number(debt.remaining);
  if (Number.isFinite(remaining) && remaining > 0) {
    return Math.round(remaining);
  }

  return 0;
};

const getDebtOutstanding = (debt) => {
  if (!debt || typeof debt !== 'object') {
    return 0;
  }

  const remaining = Number(debt.remaining);
  if (Number.isFinite(remaining) && remaining > 0) {
    return Math.round(remaining);
  }

  return getDebtPrincipal(debt);
};

const formatDebtSource = (debt) => {
  if (!debt || typeof debt !== 'object') {
    return 'outstanding debt';
  }

  const parts = [];

  const eventLabel = typeof debt.sourceEventLabel === 'string' ? debt.sourceEventLabel.trim() : '';
  if (eventLabel) {
    parts.push(eventLabel);
  }

  const choiceLabel = typeof debt.sourceChoiceLabel === 'string' ? debt.sourceChoiceLabel.trim() : '';
  if (choiceLabel && choiceLabel !== eventLabel) {
    parts.push(choiceLabel);
  }

  if (parts.length) {
    return parts.join(' — ');
  }

  return 'outstanding debt';
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

  if (report.outcome === 'crafting') {
    const upgradeProfile = report.upgradeId ? VEHICLE_UPGRADE_CATALOG?.[report.upgradeId] : null;
    const upgradeLabel = report.upgradeLabel ?? upgradeProfile?.label ?? 'Upgrade';
    const partsSpent = Number.isFinite(report.partsSpent) ? Math.max(0, report.partsSpent) : 0;
    const fundsSpent = Number.isFinite(report.fundsSpent) ? Math.max(0, report.fundsSpent) : 0;
    const partsRemaining = Number.isFinite(report.partsRemaining) ? Math.max(0, report.partsRemaining) : null;
    const detail = upgradeProfile?.summary ?? upgradeProfile?.description ?? '';
    const segments = [`${modelLabel} fabricated ${upgradeLabel}.`];
    if (partsSpent > 0) {
      segments.push(`${partsSpent} parts consumed.`);
    }
    if (fundsSpent > 0) {
      segments.push(`Spent ${formatCurrency(fundsSpent)}.`);
    }
    if (partsRemaining !== null) {
      segments.push(`Parts remaining: ${partsRemaining}.`);
    }
    if (detail) {
      segments.push(detail);
    }
    return segments.join(' ').trim();
  }

  if (report.outcome === 'vehicle-acquired') {
    const summary = typeof report.summary === 'string' ? report.summary.trim() : '';
    if (summary) {
      return summary;
    }
    const missionLabel = report.missionName ?? 'the latest mission';
    const storageRequired = Number.isFinite(report.storageRequired)
      ? Math.max(1, Math.round(report.storageRequired))
      : null;
    const storageLabel = storageRequired
      ? ` Requires ${storageRequired === 1 ? '1 garage slot' : `${storageRequired} garage slots`}.`
      : '';
    return `${modelLabel} secured from ${missionLabel}.${storageLabel}`.trim();
  }

  if (report.outcome === 'storage-blocked') {
    const capacity = Number.isFinite(report.storageCapacity) ? report.storageCapacity : null;
    const garageSize = Number.isFinite(report.garageSize) ? report.garageSize : null;
    const storageRequired = Number.isFinite(report.storageRequired)
      ? Math.max(1, Math.round(report.storageRequired))
      : null;
    const storageLabel = storageRequired !== null
      ? ` Requires ${storageRequired === 1 ? '1 garage slot' : `${storageRequired} garage slots`}.`
      : '';
    if (capacity !== null && garageSize !== null) {
      return `${modelLabel} stalled — garage capacity ${garageSize}/${capacity}.${storageLabel} Sell or scrap to free space.`.trim();
    }
    return `${modelLabel} stalled — garage full.${storageLabel} Sell or scrap to free space.`.trim();
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

const setReconStatus = (message, options = {}) => {
  const {
    tone = 'neutral',
    source = 'system',
    force = true,
  } = options ?? {};

  if (!force && missionControls.reconStatusSource && missionControls.reconStatusSource !== source) {
    return;
  }

  const normalizedMessage = typeof message === 'string'
    ? message
    : message === null || message === undefined
      ? ''
      : String(message);

  missionControls.reconStatusDetail = normalizedMessage;
  missionControls.reconStatusTone = tone;
  missionControls.reconStatusSource = source;
  missionControls.reconStatusTimestamp = Date.now();

  if (!missionControls.reconStatus) {
    return;
  }

  missionControls.reconStatus.textContent = normalizedMessage;
  if (tone && tone !== 'neutral') {
    missionControls.reconStatus.dataset.tone = tone;
  } else if (missionControls.reconStatus.dataset) {
    delete missionControls.reconStatus.dataset.tone;
  }
};

const setPlayerStatus = (message) => {
  if (!missionControls.playerStatus) {
    return;
  }

  missionControls.playerStatus.textContent = message ?? '';
};

const resolveReconDurationOption = (value) => {
  if (!value) {
    return RECON_DURATION_OPTIONS.find((option) => option.value === 'standard') ?? RECON_DURATION_OPTIONS[0];
  }

  return RECON_DURATION_OPTIONS.find((option) => option.value === value)
    ?? RECON_DURATION_OPTIONS.find((option) => option.value === 'standard')
    ?? RECON_DURATION_OPTIONS[0];
};

const resolveReconApproachOption = (value) => {
  if (!value) {
    return RECON_APPROACH_OPTIONS.find((option) => option.value === 'balanced') ?? RECON_APPROACH_OPTIONS[0];
  }

  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : value;
  return RECON_APPROACH_OPTIONS.find((option) => option.value === normalized)
    ?? RECON_APPROACH_OPTIONS.find((option) => option.value === 'balanced')
    ?? RECON_APPROACH_OPTIONS[0];
};

const resolveReconApproachConfig = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized && RECON_APPROACH_CONFIG[normalized]) {
    return RECON_APPROACH_CONFIG[normalized];
  }

  if (RECON_APPROACH_CONFIG.balanced) {
    return RECON_APPROACH_CONFIG.balanced;
  }

  const [, fallbackConfig] = Object.entries(RECON_APPROACH_CONFIG ?? {}).find(() => true) ?? [];
  return fallbackConfig ?? null;
};

const createReconApproachSummaryEntries = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') {
    return [];
  }

  const entries = [];

  const pushEntry = ({ key, label, value, formatter, penaltyCheck, bonusCheck }) => {
    const formattedValue = formatter ? formatter(value) : value;
    if (formattedValue === null || formattedValue === undefined || formattedValue === '') {
      return;
    }

    const isPenalty = typeof penaltyCheck === 'function' ? penaltyCheck(value) : false;
    const isBonus = typeof bonusCheck === 'function' ? bonusCheck(value) : false;

    entries.push({
      key,
      label,
      value,
      displayValue: formattedValue,
      isPenalty,
      isBonus,
    });
  };

  const formatPercent = (value) => {
    if (!Number.isFinite(value)) {
      return '—';
    }
    return `${Math.round(value)}%`;
  };

  const formatSignedPercent = (value) => {
    if (!Number.isFinite(value)) {
      return '—';
    }
    if (value === 0) {
      return '±0%';
    }
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${Math.round(value)}%`;
  };

  const formatSignedNumber = (value) => {
    if (!Number.isFinite(value)) {
      return '0';
    }
    if (value === 0) {
      return '±0';
    }
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${Math.round(value)}`;
  };

  pushEntry({
    key: 'duration',
    label: 'Duration',
    value: snapshot.durationDeltaPercent,
    formatter: formatSignedPercent,
    penaltyCheck: (value) => Number.isFinite(value) && value > 0,
    bonusCheck: (value) => Number.isFinite(value) && value < 0,
  });

  pushEntry({
    key: 'intel',
    label: 'Intel',
    value: snapshot.intelPercent,
    formatter: formatPercent,
    penaltyCheck: (value) => Number.isFinite(value) && value < 100,
    bonusCheck: (value) => Number.isFinite(value) && value > 100,
  });

  pushEntry({
    key: 'influence',
    label: 'Influence',
    value: snapshot.influencePercent,
    formatter: formatPercent,
    penaltyCheck: (value) => Number.isFinite(value) && value < 100,
    bonusCheck: (value) => Number.isFinite(value) && value > 100,
  });

  pushEntry({
    key: 'crackdown',
    label: 'Crackdown',
    value: snapshot.crackdownDeltaPercent,
    formatter: formatSignedPercent,
    penaltyCheck: (value) => Number.isFinite(value) && value > 0,
    bonusCheck: (value) => Number.isFinite(value) && value < 0,
  });

  pushEntry({
    key: 'setback',
    label: 'Setback odds',
    value: snapshot.setbackDeltaPercent,
    formatter: formatSignedPercent,
    penaltyCheck: (value) => Number.isFinite(value) && value > 0,
    bonusCheck: (value) => Number.isFinite(value) && value < 0,
  });

  pushEntry({
    key: 'severity',
    label: 'Setback severity',
    value: snapshot.severityDeltaPercent,
    formatter: formatSignedPercent,
    penaltyCheck: (value) => Number.isFinite(value) && value > 0,
    bonusCheck: (value) => Number.isFinite(value) && value < 0,
  });

  pushEntry({
    key: 'fatigue',
    label: 'Fatigue',
    value: snapshot.fatigueDelta,
    formatter: formatSignedNumber,
    penaltyCheck: (value) => Number.isFinite(value) && value > 0,
    bonusCheck: (value) => Number.isFinite(value) && value < 0,
  });

  return entries;
};

const formatReconModifierSnapshot = (snapshot) => {
  const entries = createReconApproachSummaryEntries(snapshot);
  if (!entries.length) {
    return '';
  }

  return entries
    .map((entry) => `${entry.label} ${entry.displayValue}`)
    .join(', ');
};

const buildReconAssignmentLabel = (assignment, crewById) => {
  if (!assignment) {
    return 'Recon assignment';
  }

  const districtLabel = assignment.districtName ?? 'District';
  const statusLabel = (assignment.status ?? '').toLowerCase();
  const approachOption = resolveReconApproachOption(assignment.approach);
  const approachSummary = approachOption?.summary ?? approachOption?.label ?? null;
  const withApproach = (label) => (approachSummary ? `${label} — Approach: ${approachSummary}` : label);
  const withModifiers = (label) => {
    const modifierSummary = formatReconModifierSnapshot(assignment.modifiersSnapshot);
    if (!modifierSummary) {
      return label;
    }
    return `${label} — ${modifierSummary}`;
  };
  if (statusLabel === 'failed') {
    const summaryLabel = assignment.resultSummary ?? 'Recon failed.';
    const timestamp = Number.isFinite(assignment.completedAt)
      ? assignment.completedAt
      : Number.isFinite(assignment.failedAt)
        ? assignment.failedAt
        : null;
    const timeLabel = Number.isFinite(timestamp)
      ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : null;
    const baseLabel = timeLabel
      ? `${districtLabel} — ${summaryLabel} @ ${timeLabel}`
      : `${districtLabel} — ${summaryLabel}`;
    return withApproach(withModifiers(baseLabel));
  }

  if (statusLabel === 'completed') {
    const summaryLabel = assignment.resultSummary ?? 'Recon completed.';
    const timeLabel = Number.isFinite(assignment.completedAt)
      ? new Date(assignment.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : null;
    const baseLabel = timeLabel
      ? `${districtLabel} — ${summaryLabel} @ ${timeLabel}`
      : `${districtLabel} — ${summaryLabel}`;
    return withApproach(withModifiers(baseLabel));
  }

  if (statusLabel === 'cancelled') {
    const progressPercent = Math.round((assignment.progress ?? 0) * 100);
    const remainingSeconds = Number.isFinite(assignment.remainingSeconds)
      ? Math.ceil(Math.max(0, assignment.remainingSeconds))
      : null;
    const statusSegments = [
      'Cancelled',
      progressPercent ? `${progressPercent}% complete` : null,
      remainingSeconds !== null ? `${remainingSeconds}s early` : null,
    ].filter(Boolean);
    const baseLabel = `${districtLabel} — ${statusSegments.join(' — ')}`;
    return withApproach(withModifiers(baseLabel));
  }

  const progressPercent = Math.round((assignment.progress ?? 0) * 100);
  const remainingSeconds = Number.isFinite(assignment.remainingSeconds)
    ? Math.ceil(Math.max(0, assignment.remainingSeconds))
    : null;
  const statusSegments = [
    'In progress',
    progressPercent ? `${progressPercent}%` : null,
    remainingSeconds !== null ? `${remainingSeconds}s remaining` : null,
  ].filter(Boolean);

  const crewNames = Array.isArray(assignment.crewIds)
    ? assignment.crewIds
        .map((crewId) => crewById.get(crewId)?.name ?? null)
        .filter(Boolean)
    : [];

  const crewSegment = crewNames.length ? `Crew: ${crewNames.join(', ')}` : null;
  const baseLabel = [districtLabel, ...statusSegments, crewSegment].filter(Boolean).join(' — ');
  return withApproach(withModifiers(baseLabel));
};

const buildReconAssignmentBadges = (assignment) => {
  if (!assignment) {
    return [];
  }

  const badges = [];
  const approachOption = resolveReconApproachOption(assignment.approach);
  if (approachOption) {
    const iconByApproach = {
      stealth: '🕶️',
      balanced: '⚖️',
      aggressive: '⚡',
    };
    badges.push({
      type: 'approach',
      icon: iconByApproach[approachOption.value] ?? '🎯',
      label: approachOption.summary ?? approachOption.label,
    });
  }
  const statusLabel = (assignment.status ?? '').toLowerCase();
  if (statusLabel === 'failed') {
    badges.push({ type: 'failed', icon: '⚠️', label: 'Failed' });
  } else if (statusLabel === 'completed') {
    badges.push({ type: 'success', icon: '✅', label: 'Complete' });
  } else if (statusLabel === 'in-progress') {
    badges.push({ type: 'active', icon: '🛰️', label: 'In Progress' });
  } else if (statusLabel === 'cancelled') {
    badges.push({ type: 'cancelled', icon: '⏹️', label: 'Cancelled' });
  }

  const result = assignment.result ?? {};
  const setbacks = result.setbacks ?? {};
  const failureStates = Array.isArray(assignment.failureStates)
    ? assignment.failureStates.map((state) => (typeof state === 'string' ? state.toLowerCase() : String(state)))
    : [];

  const intelLost = setbacks.intelCompromised || failureStates.includes('intel-compromised');
  if (intelLost) {
    badges.push({ type: 'intel', icon: '📉', label: 'Intel Lost' });
  }

  const injuredIds = Array.isArray(setbacks.injuredCrewIds) ? setbacks.injuredCrewIds.filter(Boolean) : [];
  const capturedIds = Array.isArray(setbacks.capturedCrewIds) ? setbacks.capturedCrewIds.filter(Boolean) : [];

  if (injuredIds.length) {
    badges.push({
      type: 'injury',
      icon: '🩸',
      label: injuredIds.length > 1 ? `${injuredIds.length} Injured` : 'Crew Injured',
    });
  }

  if (capturedIds.length) {
    badges.push({
      type: 'capture',
      icon: '🚔',
      label: capturedIds.length > 1 ? `${capturedIds.length} Captured` : 'Crew Captured',
    });
  }

  const crackdownDelta = Number.isFinite(result.crackdownDelta) ? Number(result.crackdownDelta) : null;
  if (Number.isFinite(crackdownDelta) && crackdownDelta > 0) {
    badges.push({ type: 'heat', icon: '🔥', label: `Crackdown +${Math.round(crackdownDelta)}` });
  }

  if (!intelLost && !injuredIds.length && !capturedIds.length && setbacks.triggered) {
    badges.push({ type: 'warning', icon: '⚠️', label: 'Setback' });
  }

  return badges;
};

const normalizeReconSeverity = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const aliasMap = {
    danger: 'critical',
    emergency: 'critical',
    severe: 'critical',
    critical: 'critical',
    fatal: 'critical',
    high: 'critical',
    warning: 'warning',
    caution: 'warning',
    alert: 'warning',
    moderate: 'warning',
    minor: 'info',
    info: 'info',
    informational: 'info',
    notice: 'info',
    neutral: 'info',
    success: 'success',
    positive: 'success',
    bonus: 'success',
    resolved: 'success',
  };

  return aliasMap[normalized] ?? null;
};

const resolveReconSeverityIcon = (severity, fallbackIcon = '🔍') => {
  const iconMap = {
    critical: '🚨',
    warning: '⚠️',
    success: '✅',
    info: 'ℹ️',
  };

  return iconMap[severity] ?? fallbackIcon;
};

const buildReconCrewNotes = (assignment, crewById) => {
  if (!assignment) {
    return [];
  }

  const crewEffects = Array.isArray(assignment.result?.crewEffects)
    ? assignment.result.crewEffects
    : [];

  if (!crewEffects.length) {
    return [];
  }

  const notes = crewEffects
    .map((effect) => {
      if (!effect || typeof effect !== 'object') {
        return null;
      }

      const crewId = effect.id ?? null;
      const crewMember = crewId ? crewById.get(crewId) : null;
      const name = crewMember?.name ?? effect.name ?? 'Crew Member';

      const segments = [];
      if (Number.isFinite(effect.fatigueDelta) && effect.fatigueDelta !== 0) {
        const prefix = effect.fatigueDelta > 0 ? '+' : '';
        segments.push(`Fatigue ${prefix}${effect.fatigueDelta}`);
      }
      if (effect.fallout === 'injured') {
        segments.push('Injured');
      }
      if (effect.fallout === 'captured') {
        segments.push('Captured');
      }
      const statusLabel = typeof effect.status === 'string' ? effect.status.toLowerCase() : '';
      if (!effect.fallout && statusLabel === 'needs-rest') {
        segments.push('Needs rest');
      }

      if (!segments.length) {
        return null;
      }

      return `${name} — ${segments.join(', ')}`;
    })
    .filter(Boolean);

  return notes.filter((note, index) => notes.indexOf(note) === index);
};

const buildReconActivityEntries = (assignment) => {
  if (!assignment) {
    return [];
  }

  const collectDetailSegments = (raw, summaryText) => {
    const segments = [];
    const seen = new Set();

    const addString = (value) => {
      if (typeof value !== 'string') {
        return;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        return;
      }
      if (summaryText && trimmed === summaryText) {
        return;
      }
      if (seen.has(trimmed)) {
        return;
      }
      seen.add(trimmed);
      segments.push(trimmed);
    };

    const candidates = [raw.detail, raw.description, raw.effectSummary, raw.message];
    candidates.forEach((candidate) => {
      if (Array.isArray(candidate)) {
        candidate.forEach(addString);
      } else {
        addString(candidate);
      }
    });

    if (Array.isArray(raw.details)) {
      raw.details.forEach(addString);
    }

    if (Array.isArray(raw.notes)) {
      raw.notes.forEach(addString);
    } else if (typeof raw.notes === 'string') {
      addString(raw.notes);
    }

    return segments.join(' • ');
  };

  const resolveTimestamp = (raw, fallbackTimestamp) => {
    const candidates = [
      raw.timestamp,
      raw.resolvedAt,
      raw.completedAt,
      raw.updatedAt,
      raw.triggeredAt,
      raw.occurredAt,
      raw.loggedAt,
      raw.createdAt,
      raw.time,
    ];

    const match = candidates.find((value) => Number.isFinite(value));
    if (Number.isFinite(match)) {
      return match;
    }

    return Number.isFinite(fallbackTimestamp) ? fallbackTimestamp : null;
  };

  const normalizeEntry = (raw, fallbackTimestamp) => {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const summaryCandidates = [
      raw.summary,
      raw.title,
      raw.label,
      raw.eventLabel,
      raw.name,
      raw.type,
    ];
    const summary = summaryCandidates.find((value) => typeof value === 'string' && value.trim())
      ?.trim() ?? null;

    const detail = collectDetailSegments(raw, summary);
    const primaryText = summary || detail;
    if (!primaryText) {
      return null;
    }

    const severity = normalizeReconSeverity(raw.severity) ?? normalizeReconSeverity(raw.tone)
      ?? normalizeReconSeverity(raw.level) ?? null;
    const icon = typeof raw.icon === 'string' && raw.icon.trim()
      ? raw.icon.trim()
      : resolveReconSeverityIcon(severity);

    const timestamp = resolveTimestamp(raw, fallbackTimestamp);
    const timeLabel = Number.isFinite(timestamp)
      ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : null;

    return {
      summary: summary ?? detail,
      detail: summary && detail && detail !== summary ? detail : null,
      severity,
      icon,
      timestamp,
      timeLabel,
    };
  };

  const fallbackTimestamp = assignment.updatedAt ?? assignment.completedAt ?? assignment.startedAt ?? null;
  const rawEntries = [
    ...(Array.isArray(assignment.history) ? assignment.history : []),
    ...(Array.isArray(assignment.events) ? assignment.events : []),
  ];

  const normalized = rawEntries
    .map((entry) => normalizeEntry(entry, fallbackTimestamp))
    .filter(Boolean)
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

  if (normalized.length > 5) {
    return normalized.slice(0, 5);
  }

  return normalized;
};

const updateReconPanel = () => {
  const {
    reconCrewSelect,
    reconDistrictSelect,
    reconDurationSelect,
    reconApproachSelect,
    reconAssignButton,
    reconStatus,
    reconList,
  } = missionControls;

  if (
    !reconCrewSelect
    || !reconDistrictSelect
    || !reconDurationSelect
    || !reconApproachSelect
    || !reconAssignButton
    || !reconStatus
    || !reconList
  ) {
    return;
  }

  const missionSystem = getMissionSystem();
  const reconSystem = getReconSystem();
  const state = reconSystem?.state ?? missionSystem?.state ?? getSharedState();
  const systemsReady = Boolean(reconSystem && missionSystem && state);

  const crewRoster = Array.isArray(state?.crew) ? state.crew : [];
  const previousSelection = new Set(missionControls.reconSelectedCrewIds ?? []);

  reconCrewSelect.innerHTML = '';

  if (!crewRoster.length) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.textContent = systemsReady ? 'No crew recruited yet.' : 'Recon systems offline.';
    reconCrewSelect.appendChild(placeholder);
  } else {
    crewRoster.forEach((member) => {
      if (!member) {
        return;
      }

      const option = document.createElement('option');
      option.value = member.id;
      const statusLabel = (member.status ?? 'idle').replace(/-/g, ' ');
      const readinessSummary = typeof member.getReadinessState === 'function'
        ? member.getReadinessState()
        : null;
      const readinessLabel = readinessSummary && readinessSummary !== 'ready' ? ` • ${readinessSummary}` : '';
      option.textContent = `${member.name} — ${member.specialty} • ${statusLabel}${readinessLabel}`;
      const available = typeof member.isMissionReady === 'function'
        ? member.isMissionReady()
        : (member.status ?? 'idle').toLowerCase() === 'idle';
      option.disabled = !available;
      if (!option.disabled && previousSelection.has(member.id)) {
        option.selected = true;
      }
      reconCrewSelect.appendChild(option);
    });
  }

  reconCrewSelect.size = Math.min(Math.max(crewRoster.length, 1), 6);
  reconCrewSelect.disabled = !systemsReady || !crewRoster.length;
  if (!systemsReady) {
    reconCrewSelect.title = 'Recon systems offline.';
  } else if (!crewRoster.length) {
    reconCrewSelect.title = 'Recruit crew before deploying recon teams.';
  } else {
    reconCrewSelect.title = 'Select idle crew to deploy.';
  }

  const selectedCrewIds = Array.from(reconCrewSelect.selectedOptions ?? [])
    .map((option) => option.value)
    .filter(Boolean);
  missionControls.reconSelectedCrewIds = selectedCrewIds;

  const previousDistrict = reconDistrictSelect.value;
  reconDistrictSelect.innerHTML = '';
  const districtPlaceholder = document.createElement('option');
  districtPlaceholder.value = '';
  districtPlaceholder.disabled = true;
  districtPlaceholder.textContent = systemsReady ? 'Select a district' : 'Recon systems offline';
  reconDistrictSelect.appendChild(districtPlaceholder);

  const districts = Array.isArray(state?.city?.districts) ? state.city.districts : [];
  districts.forEach((district) => {
    if (!district) {
      return;
    }
    const option = document.createElement('option');
    option.value = district.id;
    option.textContent = district.name ?? 'District';
    if (previousDistrict && district.id === previousDistrict) {
      option.selected = true;
    }
    reconDistrictSelect.appendChild(option);
  });

  if (previousDistrict && reconDistrictSelect.querySelector(`option[value="${previousDistrict}"]`)) {
    reconDistrictSelect.value = previousDistrict;
  }

  reconDistrictSelect.disabled = !systemsReady || !districts.length;
  reconDistrictSelect.title = !systemsReady
    ? 'Recon systems offline.'
    : !districts.length
      ? 'No districts catalogued.'
      : '';

  const previousDuration = reconDurationSelect.value;
  reconDurationSelect.innerHTML = '';
  RECON_DURATION_OPTIONS.forEach((option) => {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    node.selected = option.value === previousDuration;
    reconDurationSelect.appendChild(node);
  });
  reconDurationSelect.value = resolveReconDurationOption(reconDurationSelect.value).value;
  reconDurationSelect.disabled = !systemsReady;
  reconDurationSelect.title = systemsReady ? '' : 'Recon systems offline.';

  const previousApproach = reconApproachSelect.value;
  reconApproachSelect.innerHTML = '';
  RECON_APPROACH_OPTIONS.forEach((option) => {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    node.selected = option.value === previousApproach;
    if (option.description) {
      node.title = option.description;
    }
    reconApproachSelect.appendChild(node);
  });
  reconApproachSelect.value = resolveReconApproachOption(reconApproachSelect.value).value;
  reconApproachSelect.disabled = !systemsReady;
  if (!systemsReady) {
    reconApproachSelect.title = 'Recon systems offline.';
  } else {
    const selectedApproach = resolveReconApproachOption(reconApproachSelect.value);
    reconApproachSelect.title = selectedApproach?.description ?? '';
  }

  const durationOption = resolveReconDurationOption(reconDurationSelect.value);
  const approachOption = resolveReconApproachOption(reconApproachSelect.value);
  const approachConfig = resolveReconApproachConfig(approachOption?.value);
  const approachSnapshot = systemsReady && approachConfig
    ? createApproachModifierSnapshot(
      approachConfig,
      { durationSeconds: durationOption?.seconds },
    )
    : null;
  const approachSummaryEntries = createReconApproachSummaryEntries(approachSnapshot);

  let approachDetailList = missionControls.reconApproachDetail;
  if (!approachDetailList || !(approachDetailList instanceof HTMLElement)) {
    approachDetailList = document.createElement('ul');
    approachDetailList.className = 'mission-recon__approach-detail';
    reconAssignButton.insertAdjacentElement('afterend', approachDetailList);
    missionControls.reconApproachDetail = approachDetailList;
  }

  if (approachDetailList) {
    approachDetailList.innerHTML = '';
    if (!systemsReady || !approachSummaryEntries.length) {
      approachDetailList.hidden = true;
    } else {
      approachDetailList.hidden = false;
      approachSummaryEntries.forEach((entry) => {
        if (!entry) {
          return;
        }
        const item = document.createElement('li');
        item.className = 'mission-recon__approach-detail-item';
        if (entry.isPenalty) {
          item.dataset.state = 'penalty';
        } else if (entry.isBonus) {
          item.dataset.state = 'bonus';
        }
        item.textContent = `${entry.label}: ${entry.displayValue}`;
        approachDetailList.appendChild(item);
      });
    }
  }

  const hasPenalty = approachSummaryEntries.some((entry) => entry?.isPenalty);
  const hasBonus = approachSummaryEntries.some((entry) => entry?.isBonus);
  const previewTone = hasPenalty ? 'warning' : hasBonus ? 'bonus' : 'info';
  const previewSegments = approachSummaryEntries.map((entry) => `${entry.label} ${entry.displayValue}`);
  const previewMessage = systemsReady && previewSegments.length
    ? `${approachOption?.summary ?? approachOption?.label ?? 'Approach'} forecast — ${previewSegments.join(' • ')}.`
    : '';
  const holdSystemStatus = missionControls.reconStatusSource === 'system'
    && Date.now() - (missionControls.reconStatusTimestamp ?? 0) < 3500;

  if (!systemsReady) {
    setReconStatus('Recon systems offline.', { tone: 'warning', source: 'system', force: true });
  } else if (previewMessage && (!holdSystemStatus || hasPenalty)) {
    setReconStatus(previewMessage, { tone: previewTone, source: 'preview', force: true });
  } else if (!previewMessage && missionControls.reconStatusSource === 'preview') {
    setReconStatus('', { tone: 'neutral', source: 'preview', force: true });
  }

  const canSchedule = systemsReady && selectedCrewIds.length > 0 && reconDistrictSelect.value;

  reconAssignButton.disabled = !canSchedule;
  const buttonDetailSegments = [];
  if (durationOption) {
    buttonDetailSegments.push(`${durationOption.seconds}s`);
  }
  if (approachOption?.summary) {
    buttonDetailSegments.push(approachOption.summary);
  }
  reconAssignButton.textContent = buttonDetailSegments.length
    ? `Deploy Recon (${buttonDetailSegments.join(' • ')})`
    : 'Deploy Recon';
  reconAssignButton.title = (() => {
    if (!systemsReady) {
      return 'Recon systems offline.';
    }
    if (!selectedCrewIds.length) {
      return 'Select idle crew for the recon team.';
    }
    if (!reconDistrictSelect.value) {
      return 'Select a district to scout.';
    }
    return approachOption?.actionSummary ?? 'Deploy recon team with the selected approach.';
  })();

  const crewById = new Map(crewRoster.map((member) => [member?.id, member]));
  const reconAssignments = reconSystem?.state?.reconAssignments ?? state?.reconAssignments ?? [];

  reconList.innerHTML = '';

  if (!Array.isArray(reconAssignments) || !reconAssignments.length) {
    const item = document.createElement('li');
    item.textContent = systemsReady ? 'No recon assignments scheduled.' : 'Recon network idle.';
    reconList.appendChild(item);
  } else {
    const sortedAssignments = reconAssignments
      .slice()
      .sort((a, b) => {
        if ((a?.status === 'in-progress') !== (b?.status === 'in-progress')) {
          return a?.status === 'in-progress' ? -1 : 1;
        }
        const timeA = a?.updatedAt ?? a?.startedAt ?? 0;
        const timeB = b?.updatedAt ?? b?.startedAt ?? 0;
        return timeB - timeA;
      });

    sortedAssignments.slice(0, 8).forEach((assignment) => {
      if (!assignment) {
        return;
      }

      const item = document.createElement('li');
      item.className = 'mission-recon__item';

      const summaryLabel = buildReconAssignmentLabel(assignment, crewById);
      const header = document.createElement('div');
      header.className = 'mission-recon__header';

      const summarySpan = document.createElement('span');
      summarySpan.className = 'mission-recon__summary';
      summarySpan.textContent = summaryLabel;
      header.appendChild(summarySpan);

      if (assignment.status === 'in-progress') {
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'mission-recon__cancel-btn';
        cancelButton.dataset.reconCancel = assignment.id;
        cancelButton.textContent = 'Cancel';
        cancelButton.title = `Abort recon in ${assignment.districtName ?? 'district'}`;
        header.appendChild(cancelButton);
      }

      item.appendChild(header);

      if (assignment.resultSummary && assignment.status !== 'in-progress') {
        item.title = assignment.resultSummary;
      } else {
        item.removeAttribute('title');
      }

      const badges = buildReconAssignmentBadges(assignment);
      if (badges.length) {
        const badgeRow = document.createElement('div');
        badgeRow.className = 'mission-recon__badges';
        badges.forEach((badge) => {
          if (!badge) {
            return;
          }

          const badgeEl = document.createElement('span');
          badgeEl.className = 'mission-recon__badge';
          if (badge.type) {
            badgeEl.classList.add(`mission-recon__badge--${badge.type}`);
          }
          const icon = typeof badge.icon === 'string' && badge.icon.trim() ? badge.icon.trim() : '';
          const label = typeof badge.label === 'string' && badge.label.trim() ? badge.label.trim() : '';
          badgeEl.textContent = icon && label ? `${icon} ${label}` : label || icon;
          badgeRow.appendChild(badgeEl);
        });
        if (badgeRow.childNodes.length) {
          item.appendChild(badgeRow);
        }
      }

      const crewNotes = buildReconCrewNotes(assignment, crewById);
      if (crewNotes.length) {
        const notesList = document.createElement('ul');
        notesList.className = 'mission-recon__crew-notes';
        crewNotes.forEach((note) => {
          if (!note) {
            return;
          }
          const noteItem = document.createElement('li');
          noteItem.textContent = note;
          notesList.appendChild(noteItem);
        });
        if (notesList.childNodes.length) {
          item.appendChild(notesList);
        }
      }

      const activityEntries = buildReconActivityEntries(assignment);
      if (activityEntries.length) {
        const activityList = document.createElement('ul');
        activityList.className = 'mission-recon__activity';
        activityEntries.forEach((entry) => {
          if (!entry) {
            return;
          }

          const { icon, timeLabel, summary, detail, severity } = entry;
          const entryItem = document.createElement('li');
          entryItem.className = 'mission-recon__activity-item';
          if (severity) {
            entryItem.dataset.severity = severity;
          }

          const iconSpan = document.createElement('span');
          iconSpan.className = 'mission-recon__activity-icon';
          iconSpan.textContent = icon ?? '';
          entryItem.appendChild(iconSpan);

          const contentWrapper = document.createElement('div');
          contentWrapper.className = 'mission-recon__activity-content';

          const headerRow = document.createElement('div');
          headerRow.className = 'mission-recon__activity-header';

          if (timeLabel) {
            const timeSpan = document.createElement('span');
            timeSpan.className = 'mission-recon__activity-time';
            timeSpan.textContent = timeLabel;
            headerRow.appendChild(timeSpan);
          }

          const summarySpan = document.createElement('span');
          summarySpan.className = 'mission-recon__activity-summary';
          summarySpan.textContent = summary;
          headerRow.appendChild(summarySpan);

          contentWrapper.appendChild(headerRow);

          if (detail) {
            const detailSpan = document.createElement('div');
            detailSpan.className = 'mission-recon__activity-detail';
            detailSpan.textContent = detail;
            contentWrapper.appendChild(detailSpan);
          }

          entryItem.appendChild(contentWrapper);
          activityList.appendChild(entryItem);
        });

        if (activityList.childNodes.length) {
          item.appendChild(activityList);
        }
      }

      reconList.appendChild(item);
    });
  }

  const latestResolved = Array.isArray(reconAssignments)
    ? reconAssignments
        .filter((assignment) => ['completed', 'failed'].includes((assignment?.status ?? '').toLowerCase()))
        .sort((a, b) => {
          const timeA = a?.completedAt ?? a?.failedAt ?? a?.updatedAt ?? 0;
          const timeB = b?.completedAt ?? b?.failedAt ?? b?.updatedAt ?? 0;
          return (timeB ?? 0) - (timeA ?? 0);
        })[0]
    : null;
  const completionKey = latestResolved
    ? `${latestResolved.id}-${(latestResolved.status ?? '').toLowerCase()}-${latestResolved.completedAt ?? latestResolved.failedAt ?? latestResolved.updatedAt ?? 0}`
    : null;

  if (completionKey && completionKey !== missionControls.lastReconCompletionKey) {
    const summaryLabel = latestResolved.resultSummary
      ?? ((latestResolved.status ?? '').toLowerCase() === 'failed' ? 'Recon failed.' : 'Recon completed.');
    const districtLabel = latestResolved.districtName ?? 'District';
    const statusWord = (latestResolved.status ?? '').toLowerCase() === 'failed' ? 'failed' : 'completed';
    const trimmedSummary = typeof summaryLabel === 'string'
      ? summaryLabel.trim().replace(/[.]+$/, '')
      : summaryLabel;
    const displaySummary = trimmedSummary || ((latestResolved.status ?? '').toLowerCase() === 'failed'
      ? 'Recon failed'
      : 'Recon completed');
    const message = `Recon in ${districtLabel} ${statusWord} — ${displaySummary}.`;
    const tone = (latestResolved.status ?? '').toLowerCase() === 'failed' ? 'warning' : 'success';
    setReconStatus(message, { tone, source: 'system' });
    missionControls.lastReconCompletionKey = completionKey;
  } else if (!completionKey) {
    missionControls.lastReconCompletionKey = null;
  }

  const statusTone = systemsReady
    ? missionControls.reconStatusTone ?? 'neutral'
    : 'warning';
  const statusMessage = systemsReady
    ? missionControls.reconStatusDetail ?? ''
    : 'Recon systems offline.';

  reconStatus.textContent = statusMessage;
  if (statusTone && statusTone !== 'neutral') {
    reconStatus.dataset.tone = statusTone;
  } else if (reconStatus.dataset) {
    delete reconStatus.dataset.tone;
  }

  if (!systemsReady) {
    missionControls.reconStatusDetail = statusMessage;
    missionControls.reconStatusTone = 'warning';
    missionControls.reconStatusSource = 'system';
  }

  const overlayContext = cityIntelLastRenderContext ?? {};
  const overlayState = reconSystem?.state ?? missionSystem?.state ?? getSharedState() ?? {};
  const overlayDistricts = overlayContext.districts && overlayContext.districts.length
    ? overlayContext.districts
    : Array.isArray(overlayState?.city?.districts)
      ? overlayState.city.districts
      : [];

  if (missionControls.cityIntelCanvas) {
    renderCityIntelMap({
      districts: overlayDistricts,
      highlightedMission: cityIntelInteractionOverride?.mission ?? overlayContext.highlightedMission ?? null,
      activeMission:
        missionSystem?.state?.activeMission ?? overlayContext.activeMission ?? null,
      reconAssignments,
    });

    if (cityIntelInteractionOverride?.key || cityIntelInteractionOverride?.districtName) {
      updateCityIntelCanvasAriaLabel({
        districtName: cityIntelInteractionOverride?.districtName ?? null,
        districtKey: cityIntelInteractionOverride?.key ?? null,
      });
    } else if (cityIntelKeyboardIndex >= 0) {
      const focusDistrict = cityIntelLastRenderedDistricts[cityIntelKeyboardIndex];
      if (focusDistrict) {
        updateCityIntelCanvasAriaLabel({
          districtName: focusDistrict?.name ?? null,
          districtKey: createDistrictKeyFromDistrict(focusDistrict),
        });
      } else {
        updateCityIntelCanvasAriaLabel();
      }
    } else {
      updateCityIntelCanvasAriaLabel();
    }
  }
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

const updateAudioToggleLabel = () => {
  const toggle = missionControls.audioToggle;
  if (!toggle) {
    return;
  }

  const muted = soundboard.isMuted();
  toggle.textContent = muted ? 'Unmute Audio' : 'Mute Audio';
  toggle.setAttribute('aria-pressed', muted ? 'true' : 'false');
  toggle.dataset.muted = muted ? 'true' : 'false';
  toggle.title = muted ? 'Sound effects muted.' : 'Sound effects enabled.';
};

const handleAudioToggle = () => {
  const nextMuted = !soundboard.isMuted();
  soundboard.setMuted(nextMuted);

  playerSettings = {
    ...playerSettings,
    audio: { ...(playerSettings?.audio ?? {}), muted: nextMuted },
  };

  persistPlayerSettings();
  updateAudioToggleLabel();
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

const formatEventBadgeLabel = (badge) => {
  if (!badge || typeof badge !== 'object') {
    return '';
  }

  const icon = typeof badge.icon === 'string' && badge.icon.trim() ? badge.icon.trim() : '';
  const label = typeof badge.label === 'string' && badge.label.trim() ? badge.label.trim() : '';
  if (icon && label) {
    return `${icon} ${label}`;
  }
  if (label) {
    return label;
  }
  if (icon) {
    return icon;
  }
  const type = typeof badge.type === 'string' && badge.type.trim() ? badge.type.trim() : '';
  return type;
};

const updateSafehousePanel = () => {
  const {
    safehouseName,
    safehouseTier,
    safehouseEffects,
    safehouseList,
    safehouseProjects,
    safehouseUpgradeButton,
    safehouseProjectButton,
    safehouseRushButton,
    safehouseStatus,
    safehouseAlertPrompt,
    safehouseAlertsList,
    safehouseAlertStatus,
  } = missionControls;

  if (
    !safehouseName ||
    !safehouseTier ||
    !safehouseEffects ||
    !safehouseList ||
    !safehouseProjects ||
    !safehouseUpgradeButton ||
    !safehouseStatus ||
    !safehouseAlertPrompt ||
    !safehouseAlertsList ||
    !safehouseAlertStatus
  ) {
    return;
  }

  const economySystem = getEconomySystem();
  const state = getSharedState();
  let alertSummaryLine = '';

  const renderSafehouseAlerts = (alerts, { day } = {}) => {
    safehouseAlertsList.innerHTML = '';

    const entries = Array.isArray(alerts) ? alerts.filter((entry) => entry && entry.id) : [];
    if (!entries.length) {
      safehouseAlertPrompt.textContent = 'Safehouse quiet — no alerts active.';
      const item = document.createElement('li');
      item.className = 'mission-safehouse__alerts-item mission-safehouse__alerts-item--empty';
      item.textContent = 'No incursions detected. Keep crew pressure low to stay hidden.';
      safehouseAlertsList.appendChild(item);
      safehouseAlertStatus.textContent = '';
      return { summaryLine: '' };
    }

    const activeAlerts = entries.filter((entry) => (entry.status ?? 'alert') === 'alert');
    safehouseAlertPrompt.textContent = activeAlerts.length
      ? 'Safehouse systems flag live incursions requiring attention.'
      : 'Safehouse teams are cooling down after recent incursions.';

    const numericDay = Number.isFinite(day) ? day : null;
    const summarySegments = [];

    entries.forEach((entry) => {
      const status = typeof entry.status === 'string' ? entry.status : 'alert';
      const label = entry.label ?? entry.id;
      const baseSummary = entry.summary ?? '';
      const choices = Array.isArray(entry.choices)
        ? entry.choices.filter((choice) => choice && choice.id)
        : [];
      const resolutionSummary =
        typeof entry.lastResolutionSummary === 'string' && entry.lastResolutionSummary.trim()
          ? entry.lastResolutionSummary.trim()
          : '';
      const item = document.createElement('li');
      item.className = 'mission-safehouse__alerts-item';
      item.dataset.status = status;

      const downtime =
        status === 'cooldown' && entry.downtime && typeof entry.downtime === 'object'
          ? entry.downtime
          : null;
      const downtimeLabel = downtime?.label ?? entry.facilityName ?? null;
      const downtimePenalties = Array.isArray(downtime?.penalties)
        ? downtime.penalties.filter((line) => typeof line === 'string' && line.trim())
        : [];
      const downtimeSummary =
        typeof downtime?.summary === 'string' && downtime.summary.trim()
          ? downtime.summary.trim()
          : typeof downtime?.penaltySummary === 'string' && downtime.penaltySummary.trim()
            ? downtime.penaltySummary.trim()
            : '';

      let displayLine = baseSummary ? `${label} — ${baseSummary}` : `${label} alert active.`;
      let summaryLine = '';

      if (status === 'cooldown') {
        const cooldownEndsOnDay = Number.isFinite(entry.cooldownEndsOnDay) ? entry.cooldownEndsOnDay : null;
        const remaining =
          cooldownEndsOnDay !== null && numericDay !== null ? cooldownEndsOnDay - numericDay : null;
        let timerDetail = '';
        if (remaining !== null) {
          if (remaining > 0) {
            timerDetail = `Cooldown ${remaining} day${remaining === 1 ? '' : 's'} remaining.`;
          } else {
            timerDetail = 'Cooldown complete. Systems ready.';
          }
        } else if (baseSummary) {
          timerDetail = 'Cooldown active.';
        } else {
          timerDetail = 'Cooldown active.';
        }

        const impactDetail = downtimePenalties.length
          ? `Impact: ${downtimePenalties.join(' ')}`
          : downtimeSummary;

        const detailSegments = [];
        if (resolutionSummary) {
          detailSegments.push(resolutionSummary);
        } else if (baseSummary) {
          detailSegments.push(`${label} — ${baseSummary}`);
        } else {
          detailSegments.push(`${label} cooldown active.`);
        }
        if (downtimeLabel) {
          detailSegments.push(`${downtimeLabel} offline.`);
        }
        if (timerDetail) {
          detailSegments.push(timerDetail);
        }
        if (impactDetail) {
          detailSegments.push(impactDetail);
        }
        displayLine = detailSegments.filter(Boolean).join(' ');
        const timerSummary = timerDetail ? timerDetail.replace(/\.$/, '') : '';
        summaryLine = resolutionSummary
          ? `${resolutionSummary}${timerSummary ? ` — ${timerSummary}` : ''}`
          : timerSummary
            ? `${downtimeLabel ?? label} ${timerSummary}`
            : `${downtimeLabel ?? label} cooldown active.`;
        if (downtimeLabel) {
          item.dataset.downtime = downtimeLabel;
        }
      } else {
        summaryLine = `${label} alert active.`;
      }

      const icon = status === 'alert' ? '⚠️' : status === 'cooldown' ? '⏳' : 'ℹ️';
      const summaryContent = icon ? `${icon} ${displayLine}` : displayLine;
      const summarySpan = document.createElement('span');
      summarySpan.className = 'mission-safehouse__alerts-summary';
      summarySpan.textContent = summaryContent;
      item.appendChild(summarySpan);

      if (status === 'alert' && choices.length) {
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'mission-safehouse__alerts-options';
        choices.forEach((choice) => {
          const optionWrapper = document.createElement('div');
          optionWrapper.className = 'mission-safehouse__alerts-option';

          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'button button--secondary mission-safehouse__alerts-choice-btn';
          button.dataset.safehouseAlertChoice = 'true';
          button.dataset.alertId = entry.id;
          button.dataset.choiceId = choice.id;
          button.textContent = choice.label ?? 'Select';
          optionWrapper.appendChild(button);

          if (choice.description) {
            const description = document.createElement('p');
            description.className = 'mission-safehouse__alerts-choice-desc';
            description.textContent = choice.description;
            optionWrapper.appendChild(description);
          }

          const effectSummary = formatEventEffectSummary(choice.effects);
          if (effectSummary) {
            const effectLine = document.createElement('p');
            effectLine.className = 'mission-safehouse__alerts-choice-desc';
            effectLine.textContent = `Effects: ${effectSummary}`;
            optionWrapper.appendChild(effectLine);
          }

          optionsContainer.appendChild(optionWrapper);
        });
        item.appendChild(optionsContainer);
      }

      safehouseAlertsList.appendChild(item);
      if (summaryLine) {
        summarySegments.push(summaryLine);
      }
    });

    safehouseAlertStatus.textContent = summarySegments.join(' ');
    return { summaryLine: summarySegments[0] ?? '' };
  };

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

  const renderSafehouseProjects = (
    entries,
    { selectedId = null, emptyMessage = 'No safehouse projects available.' } = {},
  ) => {
    safehouseProjects.innerHTML = '';

    const projects = Array.isArray(entries) ? entries.filter((entry) => entry && entry.id) : [];
    if (!projects.length) {
      missionControls.safehouseSelectedProjectId = null;
      safehouseProjects.dataset.selectedProjectId = '';
      const placeholder = document.createElement('p');
      placeholder.className = 'mission-safehouse__projects-empty';
      placeholder.textContent = emptyMessage;
      safehouseProjects.appendChild(placeholder);
      return { selectedProject: null, otherProjects: [] };
    }

    let activeId = selectedId && projects.some((project) => project.id === selectedId) ? selectedId : null;
    if (!activeId) {
      const fundingCandidate = projects.find(
        (project) => Number.isFinite(project?.fundingRemaining) && project.fundingRemaining > 0,
      );
      const timeCandidate = projects.find(
        (project) =>
          Number.isFinite(project?.timeRemaining) &&
          project.timeRemaining > 0 &&
          (!Number.isFinite(project?.fundingRemaining) || project.fundingRemaining <= 0),
      );
      activeId = fundingCandidate?.id ?? timeCandidate?.id ?? projects[0]?.id ?? null;
    }

    missionControls.safehouseSelectedProjectId = activeId ?? null;
    safehouseProjects.dataset.selectedProjectId = activeId ?? '';

    const table = document.createElement('table');
    table.className = 'mission-safehouse__projects-table';

    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Project', 'Funding Remaining', 'Days Left', 'Facility Perk'].forEach((label) => {
      const cell = document.createElement('th');
      cell.textContent = label;
      headerRow.appendChild(cell);
    });
    head.appendChild(headerRow);
    table.appendChild(head);

    const body = document.createElement('tbody');
    projects.forEach((project) => {
      const row = document.createElement('tr');
      row.className = 'mission-safehouse__projects-row';
      row.dataset.projectId = project.id ?? '';
      const isSelected = project.id === activeId;
      row.setAttribute('tabindex', '0');
      row.setAttribute('data-selected', isSelected ? 'true' : 'false');
      row.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      if (isSelected) {
        row.classList.add('mission-safehouse__projects-row--selected');
      }

      const nameCell = document.createElement('th');
      nameCell.scope = 'row';
      nameCell.className = 'mission-safehouse__projects-name';
      nameCell.textContent = project.name ?? 'Project';
      if (project.summary) {
        const summary = document.createElement('div');
        summary.className = 'mission-safehouse__projects-summary';
        summary.textContent = project.summary;
        nameCell.appendChild(summary);
      }
      row.appendChild(nameCell);

      const remainingCost = Number.isFinite(project?.fundingRemaining)
        ? Math.max(0, project.fundingRemaining)
        : null;
      const fundingCell = document.createElement('td');
      fundingCell.className = 'mission-safehouse__projects-funding';
      fundingCell.textContent =
        remainingCost === null ? '—' : remainingCost > 0 ? formatCurrency(remainingCost) : 'Funded';
      row.appendChild(fundingCell);

      const remainingTime = Number.isFinite(project?.timeRemaining)
        ? Math.max(0, project.timeRemaining)
        : null;
      const daysCell = document.createElement('td');
      daysCell.className = 'mission-safehouse__projects-time';
      if (remainingTime === null) {
        daysCell.textContent = '—';
      } else if (remainingTime <= 0) {
        daysCell.textContent = 'Ready';
      } else {
        const daysLabel = Math.ceil(remainingTime);
        daysCell.textContent = `${daysLabel} day${daysLabel === 1 ? '' : 's'}`;
      }
      row.appendChild(daysCell);

      const perkCell = document.createElement('td');
      perkCell.className = 'mission-safehouse__projects-perk';
      const facility = getFacilityEffectConfig(project.id);
      const perkSummary = facility?.summary ?? project.summary ?? 'Perk details pending.';
      perkCell.textContent = facility?.name ? `${facility.name} — ${perkSummary}` : perkSummary;
      row.appendChild(perkCell);

      body.appendChild(row);
    });
    table.appendChild(body);
    safehouseProjects.appendChild(table);

    const selectedProject = projects.find((project) => project.id === activeId) ?? null;
    const otherProjects = projects.filter((project) => project.id !== activeId);

    return { selectedProject, otherProjects };
  };

  const setProjectButtonState = (button, {
    text,
    title,
    disabled = true,
    projectId = '',
  } = {}) => {
    if (!button) {
      return;
    }

    if (typeof text === 'string') {
      button.textContent = text;
    }
    if (typeof title === 'string') {
      button.title = title;
    }
    button.disabled = Boolean(disabled);
    if (button.dataset) {
      button.dataset.projectId = projectId ?? '';
    }
  };

  const summarizeOtherProjects = (projects) => {
    if (!Array.isArray(projects) || !projects.length) {
      return '';
    }

    const counts = { funding: 0, building: 0, ready: 0 };
    projects.forEach((project) => {
      const remainingCost = Number.isFinite(project?.fundingRemaining)
        ? Math.max(0, project.fundingRemaining)
        : 0;
      const remainingTime = Number.isFinite(project?.timeRemaining)
        ? Math.max(0, project.timeRemaining)
        : 0;

      if (remainingCost > 0) {
        counts.funding += 1;
      } else if (remainingTime > 0) {
        counts.building += 1;
      } else {
        counts.ready += 1;
      }
    });

    const segments = [];
    const formatCount = (count, phrase) => `${count} project${count === 1 ? '' : 's'} ${phrase}`;
    if (counts.funding) {
      segments.push(formatCount(counts.funding, 'awaiting funding'));
    }
    if (counts.building) {
      segments.push(formatCount(counts.building, 'under construction'));
    }
    if (counts.ready) {
      segments.push(formatCount(counts.ready, 'ready to activate'));
    }

    if (!segments.length) {
      return '';
    }

    return `Other projects: ${segments.join(', ')}.`;
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
    setProjectButtonState(safehouseProjectButton, {
      text: 'Fund Project',
      title: 'Safehouse systems offline.',
      disabled: true,
    });
    setProjectButtonState(safehouseRushButton, {
      text: 'Rush Project',
      title: 'Safehouse systems offline.',
      disabled: true,
    });
    safehouseAlertPrompt.textContent = 'Safehouse telemetry offline.';
    safehouseAlertsList.innerHTML = '';
    const offlineAlert = document.createElement('li');
    offlineAlert.className = 'mission-safehouse__alerts-item mission-safehouse__alerts-item--empty';
    offlineAlert.textContent = 'Reconnect the command uplink to monitor incursions.';
    safehouseAlertsList.appendChild(offlineAlert);
    safehouseAlertStatus.textContent = '';
    const detail = missionControls.safehouseStatusDetail?.trim();
    const summary = 'Safehouse telemetry unavailable.';
    safehouseStatus.textContent = [detail, alertSummaryLine, summary].filter(Boolean).join(' ');
    missionControls.lastSafehouseAlertSignature = 'none';
    return;
  }

  const safehouse = getActiveSafehouseFromState(state);
  const safehouseOwned = safehouse?.isOwned?.() ?? safehouse?.owned ?? false;
  const tier = safehouse?.getCurrentTier?.() ?? null;

  const dayValue = Number.isFinite(state.day) ? state.day : null;
  const safehouseAlerts = Array.isArray(state.safehouseIncursions) ? state.safehouseIncursions : [];
  const trackedAlerts = Array.isArray(safehouseAlerts)
    ? safehouseAlerts.filter((entry) => entry && entry.id)
    : [];
  const nextAlertSignature = trackedAlerts.length
    ? trackedAlerts
        .map((entry) => {
          const status = typeof entry.status === 'string' ? entry.status.trim().toLowerCase() : 'alert';
          const cooldownEndsOnDay = Number.isFinite(entry.cooldownEndsOnDay)
            ? entry.cooldownEndsOnDay
            : '';
          const updatedAt = Number.isFinite(entry.updatedAt) ? entry.updatedAt : '';
          return `${entry.id}:${status}:${cooldownEndsOnDay}:${updatedAt}`;
        })
        .join('|')
    : 'none';
  if (nextAlertSignature !== missionControls.lastSafehouseAlertSignature) {
    if (
      missionControls.lastSafehouseAlertSignature !== null &&
      trackedAlerts.some((entry) => {
        const status = typeof entry.status === 'string' ? entry.status.trim().toLowerCase() : 'alert';
        return status === 'alert';
      })
    ) {
      soundboard.playSafehouseAlert();
    }
    missionControls.lastSafehouseAlertSignature = nextAlertSignature;
  }
  const alertRenderResult = renderSafehouseAlerts(safehouseAlerts, { day: dayValue });
  alertSummaryLine = alertRenderResult?.summaryLine ?? '';

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
  let selectedProjectSummaryLine = '';
  let otherProjectsSummaryLine = '';

  const projectSummaries = safehouse?.getActiveProjectSummaries?.()
    ? safehouse.getActiveProjectSummaries()
    : [];
  const emptyProjectsMessage = !safehouse
    ? 'Assign a safehouse to unlock facility projects.'
    : !safehouseOwned
      ? 'Purchase this safehouse to activate facility projects.'
      : 'No safehouse projects available at this tier.';

  const projectRenderResult = renderSafehouseProjects(projectSummaries, {
    selectedId: missionControls.safehouseSelectedProjectId,
    emptyMessage: emptyProjectsMessage,
  });
  const selectedProject = projectRenderResult.selectedProject;
  const otherProjects = projectRenderResult.otherProjects;
  otherProjectsSummaryLine = summarizeOtherProjects(otherProjects);

  if (selectedProject) {
    const remainingCost = Number.isFinite(selectedProject?.fundingRemaining)
      ? Math.max(0, selectedProject.fundingRemaining)
      : null;
    const remainingTime = Number.isFinite(selectedProject?.timeRemaining)
      ? Math.max(0, selectedProject.timeRemaining)
      : null;
    const facilityConfig = getFacilityEffectConfig(selectedProject.id);
    const perkDescription = facilityConfig?.summary ?? selectedProject.summary ?? '';

    if (remainingCost !== null && remainingCost > 0) {
      selectedProjectSummaryLine = `${selectedProject.name ?? 'Project'} needs ${formatCurrency(remainingCost)} in funding.`;
    } else if (remainingTime !== null && remainingTime > 0) {
      const daysLabel = Math.ceil(remainingTime);
      selectedProjectSummaryLine = `${selectedProject.name ?? 'Project'} finishes in ${
        daysLabel === 1 ? '1 day' : `${daysLabel} days`
      }.`;
    } else {
      selectedProjectSummaryLine = `${selectedProject.name ?? 'Project'} complete.`;
    }

    if (perkDescription) {
      selectedProjectSummaryLine = selectedProjectSummaryLine
        ? `${selectedProjectSummaryLine} Perk: ${perkDescription}`
        : `Perk: ${perkDescription}`;
    }
  }

  if (!economySystem || !safehouse || !safehouseOwned) {
    const baseTitle = !economySystem
      ? 'Economy systems offline.'
      : !safehouse
        ? 'Assign a safehouse to manage projects.'
        : 'Purchase this safehouse before investing in projects.';
    setProjectButtonState(safehouseProjectButton, {
      text: 'Fund Project',
      title: baseTitle,
      disabled: true,
      projectId: selectedProject?.id ?? '',
    });
    setProjectButtonState(safehouseRushButton, {
      text: 'Rush Project',
      title: baseTitle,
      disabled: true,
      projectId: selectedProject?.id ?? '',
    });
  } else if (!projectSummaries.length || !selectedProject) {
    setProjectButtonState(safehouseProjectButton, {
      text: 'Fund Project',
      title: 'No safehouse projects available at this tier.',
      disabled: true,
      projectId: selectedProject?.id ?? '',
    });
    setProjectButtonState(safehouseRushButton, {
      text: 'Rush Project',
      title: 'No safehouse projects available at this tier.',
      disabled: true,
      projectId: selectedProject?.id ?? '',
    });
  } else {
    const remainingCost = Number.isFinite(selectedProject.fundingRemaining)
      ? Math.max(0, selectedProject.fundingRemaining)
      : null;
    if (remainingCost !== null && remainingCost > 0) {
      const canInvest = funds > 0;
      const title = canInvest
        ? `${selectedProject.name ?? 'Project'} requires ${formatCurrency(remainingCost)}.`
        : `${selectedProject.name ?? 'Project'} needs ${formatCurrency(remainingCost)} in funding.`;
      setProjectButtonState(safehouseProjectButton, {
        text: `Fund ${selectedProject.name ?? 'Project'} (${formatCurrency(remainingCost)})`,
        title,
        disabled: !canInvest,
        projectId: selectedProject.id ?? '',
      });
    } else if (remainingCost !== null) {
      setProjectButtonState(safehouseProjectButton, {
        text: 'Fund Project',
        title: 'All funding applied to the selected project.',
        disabled: true,
        projectId: selectedProject.id ?? '',
      });
    } else {
      setProjectButtonState(safehouseProjectButton, {
        text: 'Fund Project',
        title: 'Funding data unavailable.',
        disabled: true,
        projectId: selectedProject.id ?? '',
      });
    }

    const remainingTime = Number.isFinite(selectedProject.timeRemaining)
      ? Math.max(0, selectedProject.timeRemaining)
      : null;
    if (remainingCost !== null && remainingCost > 0) {
      setProjectButtonState(safehouseRushButton, {
        text: 'Rush Project',
        title: `Fund ${selectedProject.name ?? 'the project'} before rushing construction.`,
        disabled: true,
        projectId: selectedProject.id ?? '',
      });
    } else if (remainingTime !== null && remainingTime > 0) {
      const rushQuote = safehouse.getProjectRushQuote?.(selectedProject.id) ?? null;
      const rushCostPerDay = Number.isFinite(rushQuote?.rushCostPerDay) ? rushQuote.rushCostPerDay : null;
      if (rushCostPerDay && rushCostPerDay > 0) {
        const canRush = funds >= rushCostPerDay;
        const rushTitle = canRush
          ? `${selectedProject.name ?? 'Project'} has ${Math.ceil(remainingTime)} days remaining.`
          : `Requires ${formatCurrency(rushCostPerDay)} to accelerate a day — available ${formatCurrency(funds)}.`;
        setProjectButtonState(safehouseRushButton, {
          text: `Rush ${selectedProject.name ?? 'Project'} (${formatCurrency(rushCostPerDay)}/day)`,
          title: rushTitle,
          disabled: !canRush,
          projectId: selectedProject.id ?? '',
        });
      } else {
        setProjectButtonState(safehouseRushButton, {
          text: 'Rush Project',
          title: `${selectedProject.name ?? 'Project'} cannot be rushed further.`,
          disabled: true,
          projectId: selectedProject.id ?? '',
        });
      }
    } else if (remainingTime === 0) {
      setProjectButtonState(safehouseRushButton, {
        text: 'Rush Project',
        title: `${selectedProject.name ?? 'Project'} already complete.`,
        disabled: true,
        projectId: selectedProject.id ?? '',
      });
    } else {
      setProjectButtonState(safehouseRushButton, {
        text: 'Rush Project',
        title: 'Rush cost data unavailable.',
        disabled: true,
        projectId: selectedProject.id ?? '',
      });
    }
  }

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
  } else if (!safehouseOwned) {
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
  safehouseStatus.textContent = [
    detail,
    alertSummaryLine,
    selectedProjectSummaryLine,
    otherProjectsSummaryLine,
    summaryMessage,
  ]
    .filter(Boolean)
    .join(' ');
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

const CRACKDOWN_REASON_LABELS = {
  'system-sync': 'System update',
  'mission-start': 'Mission launched',
  'mission-outcome-success': 'Mission success',
  'mission-outcome-failure': 'Mission failure',
  'mission-outcome-resolved': 'Mission resolved',
  'crackdown-operation': 'Crackdown operation',
  'mission-tick': 'City patrol shift',
  'heat-mitigation': 'Heat mitigation',
};

const describeCrackdownHistoryReason = (reason) => {
  if (!reason && reason !== 0) {
    return 'Update recorded';
  }

  const normalized = `${reason}`.trim().toLowerCase();
  if (!normalized) {
    return 'Update recorded';
  }

  if (CRACKDOWN_REASON_LABELS[normalized]) {
    return CRACKDOWN_REASON_LABELS[normalized];
  }

  return normalized
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const describeCrackdownHistoryTier = (tierName, fallback = 'Unknown') => {
  if (typeof tierName === 'string' && tierName.trim()) {
    const normalized = tierName.trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  return fallback;
};

const buildCrackdownHistoryAnnouncement = (entry) => {
  if (!entry) {
    return '';
  }

  const fromLabel = describeCrackdownHistoryTier(entry.previousTier, 'Unknown');
  const toLabel = describeCrackdownHistoryTier(entry.newTier, 'Unknown');
  const reasonLabel = describeCrackdownHistoryReason(entry.reason);
  return `Crackdown shift: ${fromLabel} → ${toLabel} — ${reasonLabel}.`;
};

const renderCrackdownHistory = (historyEntries) => {
  const list = missionControls.crackdownHistoryList;
  if (!list) {
    return;
  }

  list.innerHTML = '';

  const entries = Array.isArray(historyEntries) ? historyEntries.slice(0, 5) : [];

  if (!entries.length) {
    const placeholder = document.createElement('li');
    placeholder.className =
      'mission-crackdown-history__item mission-crackdown-history__item--empty';
    placeholder.textContent = 'No crackdown shifts recorded yet.';
    list.appendChild(placeholder);
    missionControls.lastCrackdownHistorySignature = null;
    missionControls.crackdownHistoryDetail = '';
    return;
  }

  const timestampOptions = { hour: '2-digit', minute: '2-digit' };

  const forecastSummary = missionControls.crackdownForecastSummary?.trim();

  entries.forEach((entry) => {
    if (!entry) {
      return;
    }

    const item = document.createElement('li');
    item.className = 'mission-crackdown-history__item';
    const announcement = buildCrackdownHistoryAnnouncement(entry);
    const tooltipParts = [announcement, forecastSummary].filter(Boolean);
    if (tooltipParts.length) {
      item.title = tooltipParts.join(' ');
    }

    const header = document.createElement('div');
    header.className = 'mission-crackdown-history__header';

    const timestampLabel = document.createElement('span');
    timestampLabel.className = 'mission-crackdown-history__timestamp';
    const timestampValue = Number.isFinite(entry.timestamp) ? entry.timestamp : null;
    timestampLabel.textContent = timestampValue
      ? new Date(timestampValue).toLocaleTimeString([], timestampOptions)
      : '—';

    const shiftLabel = document.createElement('span');
    shiftLabel.className = 'mission-crackdown-history__shift';
    const fromLabel = describeCrackdownHistoryTier(entry.previousTier, 'Unknown');
    const toLabel = describeCrackdownHistoryTier(entry.newTier, 'Unknown');
    shiftLabel.textContent = `${fromLabel} → ${toLabel}`;

    header.append(timestampLabel, shiftLabel);
    item.appendChild(header);

    const reason = document.createElement('div');
    reason.className = 'mission-crackdown-history__reason';
    reason.textContent = describeCrackdownHistoryReason(entry.reason);
    item.appendChild(reason);

    list.appendChild(item);
  });

  const latestEntry = entries[0] ?? null;
  const latestSignature = latestEntry
    ? `${Number.isFinite(latestEntry.timestamp) ? latestEntry.timestamp : Date.now()}:${
        latestEntry.newTier ?? ''
      }:${latestEntry.reason ?? ''}`
    : null;

  if (latestSignature && latestSignature !== missionControls.lastCrackdownHistorySignature) {
    missionControls.lastCrackdownHistorySignature = latestSignature;
    missionControls.crackdownHistoryDetail = buildCrackdownHistoryAnnouncement(latestEntry);
  } else if (!latestSignature) {
    missionControls.lastCrackdownHistorySignature = null;
    missionControls.crackdownHistoryDetail = '';
  }
};

const handleDebtPayment = (debtId, requestedPayment = null) => {
  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();
  const state = missionSystem?.state ?? getSharedState();

  renderGarageActivityLog();

  if (!missionSystem || !economySystem || !state) {
    missionControls.debtStatusDetail = 'Economy systems offline — unable to settle debts.';
    updateMissionControls();
    return;
  }

  const pendingDebts = Array.isArray(state.pendingDebts) ? state.pendingDebts.slice() : [];
  const debtIndex = pendingDebts.findIndex((entry) => entry?.id === debtId);
  if (debtIndex === -1) {
    missionControls.debtStatusDetail = 'Debt record not found — refresh the ledger.';
    updateMissionControls();
    return;
  }

  const debt = pendingDebts[debtIndex];
  const outstanding = getDebtOutstanding(debt);
  if (outstanding <= 0) {
    missionControls.debtStatusDetail = `${formatDebtSource(debt)} already settled.`;
    updateMissionControls();
    return;
  }

  const funds = Number.isFinite(state.funds) ? state.funds : 0;
  const availableFunds = Math.max(0, Math.round(funds));
  let payment = Number.isFinite(requestedPayment) ? Math.round(requestedPayment) : outstanding;
  payment = Math.min(payment, outstanding);
  payment = Math.min(payment, availableFunds);

  if (payment <= 0) {
    const required = formatCurrency(outstanding);
    const available = formatCurrency(availableFunds);
    missionControls.debtStatusDetail = `Insufficient funds — requires ${required}, available ${available}.`;
    updateMissionControls();
    return;
  }

  economySystem.adjustFunds(-payment);

  const remaining = Math.max(0, outstanding - payment);
  const updatedEntry = { ...debt, remaining };
  if (remaining <= 0) {
    updatedEntry.remaining = 0;
    updatedEntry.settledAt = Date.now();
  } else {
    updatedEntry.updatedAt = Date.now();
  }

  if (remaining <= 0) {
    pendingDebts.splice(debtIndex, 1);
  } else {
    pendingDebts[debtIndex] = updatedEntry;
  }

  missionSystem.state.pendingDebts = pendingDebts;
  if (state !== missionSystem.state) {
    state.pendingDebts = pendingDebts;
  }

  if (missionSystem.state) {
    missionSystem.state.needsHudRefresh = true;
  }

  const sourceLabel = formatDebtSource(debt);
  const messageSegments = [`Paid ${formatCurrency(payment)} toward ${sourceLabel}.`];
  if (remaining > 0) {
    messageSegments.push(`Remaining balance ${formatCurrency(remaining)}.`);
  } else {
    messageSegments.push('Debt settled.');
  }

  missionControls.debtStatusDetail = messageSegments.join(' ');
  updateMissionControls();
  triggerHudRender();
};

const handleDebtListClick = (event) => {
  const button = event.target.closest('button[data-debt-id]');
  if (!button) {
    return;
  }

  event.preventDefault();

  const debtId = button.dataset.debtId;
  if (!debtId) {
    missionControls.debtStatusDetail = 'Debt record not found — refresh the ledger.';
    updateMissionControls();
    return;
  }

  const requestedAmount = Number(button.dataset.paymentAmount);
  const paymentAmount = Number.isFinite(requestedAmount) ? requestedAmount : null;
  handleDebtPayment(debtId, paymentAmount);
};

const updateDebtPanel = () => {
  const { debtList, debtStatus } = missionControls;
  if (!debtList || !debtStatus) {
    return;
  }

  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();
  const state = missionSystem?.state ?? getSharedState();

  debtList.innerHTML = '';

  if (!missionSystem || !state) {
    const placeholder = document.createElement('li');
    placeholder.className = 'mission-debt__item mission-debt__item--empty';
    placeholder.textContent = 'Debt ledger syncing…';
    debtList.appendChild(placeholder);

    const detail = missionControls.debtStatusDetail?.trim();
    debtStatus.textContent = detail || 'Debt ledger syncing…';
    return;
  }

  const pendingDebts = Array.isArray(state.pendingDebts) ? state.pendingDebts : [];
  const ledgerEntries = pendingDebts
    .map((debt) => ({
      debt,
      outstanding: getDebtOutstanding(debt),
      principal: getDebtPrincipal(debt),
    }))
    .filter((entry) => entry.outstanding > 0)
    .sort((a, b) => {
      const aTime = Number.isFinite(a.debt?.createdAt) ? a.debt.createdAt : 0;
      const bTime = Number.isFinite(b.debt?.createdAt) ? b.debt.createdAt : 0;
      return aTime - bTime;
    });

  if (!ledgerEntries.length) {
    const placeholder = document.createElement('li');
    placeholder.className = 'mission-debt__item mission-debt__item--empty';
    placeholder.textContent = 'No outstanding debts.';
    debtList.appendChild(placeholder);
  } else {
    const funds = Number.isFinite(state.funds) ? state.funds : 0;
    const availableFunds = Math.max(0, Math.round(funds));

    ledgerEntries.forEach(({ debt, outstanding, principal }) => {
      const item = document.createElement('li');
      item.className = 'mission-debt__item';

      const header = document.createElement('div');
      header.className = 'mission-debt__row';

      const label = document.createElement('span');
      label.className = 'mission-debt__label';
      label.textContent = formatDebtSource(debt);
      header.appendChild(label);

      const amount = document.createElement('span');
      amount.className = 'mission-debt__amount';
      amount.textContent = formatCurrency(outstanding);
      header.appendChild(amount);

      item.appendChild(header);

      const metaSegments = [];
      if (principal > 0 && principal !== outstanding) {
        metaSegments.push(`Original ${formatCurrency(principal)}`);
      }
      const timestampValue = Number.isFinite(debt?.createdAt) ? debt.createdAt : null;
      if (timestampValue) {
        try {
          const timeLabel = new Date(timestampValue).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
          metaSegments.push(`Logged @ ${timeLabel}`);
        } catch (error) {
          // Ignore date formatting issues
        }
      }

      if (metaSegments.length) {
        const meta = document.createElement('div');
        meta.className = 'mission-debt__meta';
        meta.textContent = metaSegments.join(' • ');
        item.appendChild(meta);
      }

      if (typeof debt?.notes === 'string' && debt.notes.trim()) {
        const notes = document.createElement('div');
        notes.className = 'mission-debt__notes';
        notes.textContent = debt.notes.trim();
        item.appendChild(notes);
      }

      const actions = document.createElement('div');
      actions.className = 'mission-debt__actions';

      const paymentAmount = Math.min(outstanding, availableFunds);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mission-debt__pay-btn';
      button.dataset.debtId = debt?.id ?? '';
      button.dataset.paymentAmount = String(Math.max(0, paymentAmount));

      const hasEconomy = Boolean(economySystem);
      const canPay = hasEconomy && paymentAmount > 0;

      if (paymentAmount > 0) {
        const partial = paymentAmount < outstanding;
        button.textContent = partial
          ? `Pay ${formatCurrency(paymentAmount)} (partial)`
          : `Pay ${formatCurrency(paymentAmount)}`;
        button.title = partial
          ? `Apply ${formatCurrency(paymentAmount)} — ${formatCurrency(outstanding - paymentAmount)} remains.`
          : 'Settle this debt in full.';
      } else {
        button.textContent = 'Pay Debt';
        button.title = hasEconomy
          ? 'Insufficient funds to make a payment.'
          : 'Economy systems offline.';
      }

      button.disabled = !canPay;
      if (!hasEconomy) {
        button.title = 'Economy systems offline.';
      }

      actions.appendChild(button);
      item.appendChild(actions);

      debtList.appendChild(item);
    });
  }

  const totalOutstanding = ledgerEntries.reduce((sum, entry) => sum + entry.outstanding, 0);
  const funds = Number.isFinite(state.funds) ? state.funds : 0;

  let summaryMessage;
  if (!economySystem) {
    summaryMessage = 'Economy systems offline — manual payments unavailable.';
  } else if (!ledgerEntries.length) {
    summaryMessage = 'All debts settled.';
  } else {
    summaryMessage = `Total outstanding: ${formatCurrency(totalOutstanding)} • Funds available: ${formatCurrency(funds)}.`;
  }

  const detailMessage = missionControls.debtStatusDetail?.trim();
  debtStatus.textContent = detailMessage || summaryMessage;
};

const setOperationsDashboardValue = (valueNode, statusNode, { text, riskLevel, statusText }) => {
  if (valueNode) {
    valueNode.textContent = text ?? '—';
    valueNode.dataset.riskLevel = riskLevel ?? 'unknown';
  }

  if (statusNode) {
    statusNode.textContent = statusText ?? '';
  }
};

const deriveHeatActionContext = (action, { heatSystem, facilityBonuses } = {}) => {
  if (!action) {
    return {
      baseReduction: 0,
      reduction: 0,
      potentialReduction: 0,
      activeBonuses: [],
      potentialBonuses: [],
      description: '',
      crackdownTier: 'calm',
    };
  }

  const baseReduction = Number.isFinite(action.heatReduction) && action.heatReduction > 0
    ? action.heatReduction
    : 0;
  let reduction = baseReduction;
  const activeBonuses = [];
  const potentialBonuses = [];

  const crackdownTierRaw = typeof heatSystem?.getCurrentTier === 'function'
    ? heatSystem.getCurrentTier()
    : typeof heatSystem?.state?.heatTier === 'string'
      ? heatSystem.state.heatTier
      : 'calm';
  const crackdownTier = crackdownTierRaw ? crackdownTierRaw.toLowerCase() : 'calm';

  let maxCrackdownBonus = 0;
  if (action.crackdownBonus?.tierBonuses && typeof action.crackdownBonus.tierBonuses === 'object') {
    Object.entries(action.crackdownBonus.tierBonuses).forEach(([tierKey, value]) => {
      const normalizedTier = typeof tierKey === 'string' ? tierKey.toLowerCase() : tierKey;
      const numericValue = Number(value) || 0;
      maxCrackdownBonus = Math.max(maxCrackdownBonus, numericValue);
      if (normalizedTier === crackdownTier && numericValue > 0) {
        reduction += numericValue;
        if (action.crackdownBonus.activeSummary) {
          const formatted = action.crackdownBonus.activeSummary
            .replace('{bonus}', numericValue.toFixed(1))
            .replace('{tier}', normalizedTier);
          activeBonuses.push(formatted);
        } else {
          activeBonuses.push(`+${numericValue.toFixed(1)} heat relief during ${normalizedTier} crackdowns.`);
        }
      }
    });

    if (maxCrackdownBonus > 0 && reduction < baseReduction + maxCrackdownBonus) {
      potentialBonuses.push(
        action.crackdownBonus.inactiveSummary
          ?? `Bonus grows to -${maxCrackdownBonus.toFixed(1)} heat when the crackdown tightens.`,
      );
    }
  }

  let facilityBonusValue = 0;
  if (action.facilityBonus) {
    const facilityIds = Array.isArray(action.facilityBonus.ids)
      ? action.facilityBonus.ids
      : action.facilityBonus.ids
        ? [action.facilityBonus.ids]
        : [];
    facilityBonusValue = Number(action.facilityBonus.heatReductionBonus) || 0;
    const activeFacilityIds = new Set(facilityBonuses?.activeFacilityIds ?? []);
    const facilityActive = facilityIds.some((id) => activeFacilityIds.has(id));

    if (facilityActive && facilityBonusValue > 0) {
      reduction += facilityBonusValue;
      if (action.facilityBonus.activeSummary) {
        activeBonuses.push(action.facilityBonus.activeSummary);
      } else {
        activeBonuses.push(`Safehouse bonus adds -${facilityBonusValue.toFixed(1)} heat.`);
      }
    } else if (facilityBonusValue > 0) {
      potentialBonuses.push(
        action.facilityBonus.inactiveSummary
          ?? `Unlock the linked facility for another -${facilityBonusValue.toFixed(1)} heat.`,
      );
    }
  }

  const potentialReduction = baseReduction + Math.max(0, maxCrackdownBonus) + Math.max(0, facilityBonusValue);

  return {
    baseReduction,
    reduction,
    potentialReduction,
    activeBonuses,
    potentialBonuses,
    description: action.description ?? '',
    crackdownTier,
  };
};

const resetOperationsDashboard = () => {
  const {
    operationsExpensesValue,
    operationsExpensesStatus,
    operationsPassiveIncomeValue,
    operationsPassiveIncomeStatus,
    operationsPayrollValue,
    operationsPayrollStatus,
    operationsStorageValue,
    operationsStorageStatus,
    operationsCrewFatigueValue,
    operationsCrewFatigueStatus,
    operationsHistoryList,
    operationsHistoryEmpty,
    operationsHistoryStatus,
  } = missionControls;

  setOperationsDashboardValue(operationsExpensesValue, operationsExpensesStatus, {
    text: '—',
    riskLevel: 'unknown',
    statusText: 'Expense telemetry syncing.',
  });
  setOperationsDashboardValue(operationsPassiveIncomeValue, operationsPassiveIncomeStatus, {
    text: '—',
    riskLevel: 'unknown',
    statusText: 'Passive income telemetry syncing.',
  });
  setOperationsDashboardValue(operationsPayrollValue, operationsPayrollStatus, {
    text: '—',
    riskLevel: 'unknown',
    statusText: 'Payroll telemetry syncing.',
  });
  setOperationsDashboardValue(operationsStorageValue, operationsStorageStatus, {
    text: '—',
    riskLevel: 'unknown',
    statusText: 'Storage telemetry syncing.',
  });
  setOperationsDashboardValue(operationsCrewFatigueValue, operationsCrewFatigueStatus, {
    text: '—',
    riskLevel: 'unknown',
    statusText: 'Fatigue telemetry syncing.',
  });

  if (operationsHistoryList && operationsHistoryEmpty && operationsHistoryStatus) {
    operationsHistoryList.innerHTML = '';
    operationsHistoryEmpty.hidden = false;
    operationsHistoryStatus.textContent = 'Economy history syncing.';
  }
  missionControls.operationsHistorySignature = '';
};

const describeRelativeTime = (timestamp) => {
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const now = Date.now();
  const delta = Math.max(0, now - timestamp);
  const minutes = Math.floor(delta / 60000);

  if (minutes <= 0) {
    return 'moments ago';
  }

  if (minutes === 1) {
    return '1 minute ago';
  }

  if (minutes < 60) {
    return `${minutes} minutes ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours === 1) {
    return '1 hour ago';
  }

  if (hours < 48) {
    return `${hours} hours ago`;
  }

  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
};

const updateOperationsDashboard = () => {
  const {
    operationsExpensesValue,
    operationsExpensesStatus,
    operationsPassiveIncomeValue,
    operationsPassiveIncomeStatus,
    operationsPayrollValue,
    operationsPayrollStatus,
    operationsStorageValue,
    operationsStorageStatus,
    operationsCrewFatigueValue,
    operationsCrewFatigueStatus,
    operationsHistoryList,
    operationsHistoryEmpty,
    operationsHistoryStatus,
  } = missionControls;

  const elementsReady = [
    operationsExpensesValue,
    operationsExpensesStatus,
    operationsPassiveIncomeValue,
    operationsPassiveIncomeStatus,
    operationsPayrollValue,
    operationsPayrollStatus,
    operationsStorageValue,
    operationsStorageStatus,
    operationsCrewFatigueValue,
    operationsCrewFatigueStatus,
    operationsHistoryList,
    operationsHistoryEmpty,
    operationsHistoryStatus,
  ].every(Boolean);

  if (!elementsReady) {
    return;
  }

  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();

  if (!missionSystem || !economySystem) {
    resetOperationsDashboard();
    return;
  }

  const state = missionSystem.state ?? getSharedState();
  const funds = Number.isFinite(state?.funds) ? Math.max(0, state.funds) : 0;

  const projectedExpensesRaw = economySystem.getProjectedDailyExpenses();
  const payrollRaw = economySystem.getCrewPayroll();
  const passiveIncomeRaw =
    typeof economySystem.getSafehousePassiveIncome === 'function'
      ? economySystem.getSafehousePassiveIncome()
      : 0;

  if (typeof economySystem.recoverCrewFatigue === 'function') {
    economySystem.recoverCrewFatigue(0);
  }

  const formatPerDay = (value, { signed = false } = {}) => {
    if (!Number.isFinite(value)) {
      return '—';
    }

    const absoluteLabel = formatCurrency(Math.abs(value));
    const prefix = signed ? (value >= 0 ? '+' : '-') : '';
    return `${prefix}${absoluteLabel}/day`;
  };

  const projectedExpenses = Number.isFinite(projectedExpensesRaw)
    ? Math.max(0, Math.round(projectedExpensesRaw))
    : null;
  const payroll = Number.isFinite(payrollRaw) ? Math.max(0, Math.round(payrollRaw)) : null;
  const passiveIncome = Number.isFinite(passiveIncomeRaw) ? Math.round(passiveIncomeRaw) : null;

  const expenseLabel = projectedExpenses !== null ? formatPerDay(projectedExpenses) : '—';
  let expenseRisk = 'unknown';
  let expenseStatus = 'Expense telemetry unavailable.';
  if (projectedExpenses !== null) {
    if (funds <= 0 && projectedExpenses > 0) {
      expenseRisk = 'high';
      expenseStatus = 'No reserves available to cover daily expenses.';
    } else if (projectedExpenses === 0) {
      expenseRisk = 'low';
      expenseStatus = 'Daily overhead neutralized for now.';
    } else {
      const ratio = funds > 0 ? projectedExpenses / funds : Infinity;
      if (ratio >= 0.8) {
        expenseRisk = 'high';
        expenseStatus = 'Daily burn will drain reserves rapidly — schedule payouts carefully.';
      } else if (ratio >= 0.45) {
        expenseRisk = 'medium';
        expenseStatus = 'Monitor cash flow — reserves are tightening.';
      } else {
        expenseRisk = 'low';
        expenseStatus = 'Daily burn sustainable with current reserves.';
      }
    }
  }

  setOperationsDashboardValue(operationsExpensesValue, operationsExpensesStatus, {
    text: expenseLabel,
    riskLevel: expenseRisk,
    statusText: expenseStatus,
  });

  const passiveLabel = formatPerDay(passiveIncome ?? NaN, { signed: true });
  let passiveRisk = 'unknown';
  let passiveStatus = 'Passive income telemetry unavailable.';
  if (Number.isFinite(passiveIncomeRaw)) {
    if ((passiveIncome ?? 0) > 0) {
      passiveRisk = 'positive';
      passiveStatus = 'Safehouse assets are covering part of the daily burn.';
    } else if (passiveIncome === 0) {
      passiveRisk = 'medium';
      passiveStatus = 'No passive income online — invest in amenities to offset expenses.';
    } else {
      passiveRisk = 'high';
      passiveStatus = 'Passive income deficit — amenities are draining reserves.';
    }
  }

  setOperationsDashboardValue(operationsPassiveIncomeValue, operationsPassiveIncomeStatus, {
    text: passiveLabel,
    riskLevel: passiveRisk,
    statusText: passiveStatus,
  });

  const payrollLabel = payroll !== null ? formatPerDay(payroll) : '—';
  let payrollRisk = 'unknown';
  let payrollStatus = 'Payroll telemetry unavailable.';
  if (payroll !== null) {
    if (payroll === 0) {
      payrollRisk = 'low';
      payrollStatus = 'No active payroll commitments.';
    } else {
      const ratio = funds > 0 ? payroll / funds : Infinity;
      if (ratio >= 0.6) {
        payrollRisk = 'high';
        payrollStatus = 'Crew payroll will strain reserves — consider new contracts or downsizing.';
      } else if (ratio >= 0.35) {
        payrollRisk = 'medium';
        payrollStatus = 'Payroll is manageable but should be monitored.';
      } else {
        payrollRisk = 'low';
        payrollStatus = 'Payroll covered comfortably by reserves.';
      }
    }
  }

  setOperationsDashboardValue(operationsPayrollValue, operationsPayrollStatus, {
    text: payrollLabel,
    riskLevel: payrollRisk,
    statusText: payrollStatus,
  });

  const garage = Array.isArray(state?.garage) ? state.garage : [];
  const resolvedCapacity = (() => {
    if (typeof economySystem.getActiveStorageCapacity === 'function') {
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

  let storageRisk = 'unknown';
  let storageStatus = 'Storage telemetry unavailable.';
  let storageLabel = `${garage.length} vehicles`;

  if (Number.isFinite(resolvedCapacity) && resolvedCapacity >= 0) {
    const garageSize = garage.length;
    const usageRatio = resolvedCapacity > 0 ? garageSize / resolvedCapacity : Infinity;
    if (resolvedCapacity === 0) {
      storageLabel = `${garageSize} stored / 0 capacity`;
      storageRisk = garageSize > 0 ? 'high' : 'medium';
      storageStatus = garageSize > 0
        ? 'No garage capacity available — liquidate vehicles immediately.'
        : 'Garage not yet expanded — secure upgrades to store vehicles.';
    } else {
      storageLabel = `${garageSize}/${resolvedCapacity} slots`;
      if (usageRatio >= 1) {
        storageRisk = 'high';
        storageStatus = 'Garage full — sell or scrap vehicles before accepting new assets.';
      } else if (usageRatio >= 0.75) {
        storageRisk = 'medium';
        const slotsFree = Math.max(0, resolvedCapacity - garageSize);
        storageStatus = `${slotsFree === 1 ? '1 slot' : `${slotsFree} slots`} remaining — plan a sale soon.`;
      } else {
        storageRisk = 'low';
        const slotsFree = Math.max(0, resolvedCapacity - garageSize);
        storageStatus = `${slotsFree === 1 ? '1 slot' : `${slotsFree} slots`} ready for new acquisitions.`;
      }
    }
  } else {
    storageRisk = 'medium';
    storageStatus = `Garage telemetry offline — tracking ${garage.length} vehicles manually.`;
  }

  setOperationsDashboardValue(operationsStorageValue, operationsStorageStatus, {
    text: storageLabel,
    riskLevel: storageRisk,
    statusText: storageStatus,
  });

  const crew = Array.isArray(state?.crew)
    ? state.crew
    : Array.isArray(economySystem?.state?.crew)
      ? economySystem.state.crew
      : [];
  const readinessSummaries = crew.map((member) => summarizeCrewReadiness(member));
  const fatigueValues = readinessSummaries
    .map((summary) => (Number.isFinite(summary.fatiguePercent) ? summary.fatiguePercent : null))
    .filter((value) => value !== null);

  const crewCount = crew.length;
  const averageFatigue =
    fatigueValues.length > 0
      ? Math.round(fatigueValues.reduce((total, value) => total + value, 0) / fatigueValues.length)
      : null;
  const highestFatigue = fatigueValues.length > 0 ? Math.max(...fatigueValues) : null;
  const tiredThreshold = Number.isFinite(CREW_FATIGUE_CONFIG?.tiredThreshold)
    ? CREW_FATIGUE_CONFIG.tiredThreshold
    : 45;
  const exhaustionThreshold = Number.isFinite(CREW_FATIGUE_CONFIG?.exhaustionThreshold)
    ? CREW_FATIGUE_CONFIG.exhaustionThreshold
    : 80;

  let fatigueRisk = 'unknown';
  let fatigueStatus = 'Fatigue telemetry unavailable.';
  let fatigueLabel = crewCount === 0 ? 'No crew' : '—';

  if (crewCount > 0) {
    if (averageFatigue === null || highestFatigue === null) {
      fatigueRisk = 'unknown';
      fatigueLabel = `${crewCount} crew`;
      fatigueStatus = 'Crew fatigue data unavailable.';
    } else {
      fatigueLabel = `${averageFatigue}% avg • ${highestFatigue}% peak`;
      if (highestFatigue >= exhaustionThreshold) {
        fatigueRisk = 'high';
        fatigueStatus = 'Crew exhaustion imminent — rotate squads or assign rest orders.';
      } else if (highestFatigue >= tiredThreshold) {
        fatigueRisk = 'medium';
        fatigueStatus = 'Crew showing fatigue — stagger missions to recover.';
      } else {
        fatigueRisk = 'low';
        fatigueStatus = 'Crew rested and ready for operations.';
      }
    }
  } else {
    fatigueRisk = 'medium';
    fatigueStatus = 'Recruit crew to run missions.';
  }

  const lastRecoveryTimestamp = Number.isFinite(economySystem?.state?.lastCrewRecoveryTimestamp)
    ? economySystem.state.lastCrewRecoveryTimestamp
    : Number.isFinite(state?.lastCrewRecoveryTimestamp)
      ? state.lastCrewRecoveryTimestamp
      : null;
  const lastRecoveryLabel = describeRelativeTime(lastRecoveryTimestamp);
  if (lastRecoveryLabel) {
    fatigueStatus = `${fatigueStatus} Last recovery pulse ${lastRecoveryLabel}.`;
  }

  setOperationsDashboardValue(operationsCrewFatigueValue, operationsCrewFatigueStatus, {
    text: fatigueLabel,
    riskLevel: fatigueRisk,
    statusText: fatigueStatus,
  });

  if (operationsHistoryList && operationsHistoryEmpty && operationsHistoryStatus) {
    const historySource = Array.isArray(state?.economyHistory)
      ? state.economyHistory
      : Array.isArray(economySystem?.state?.economyHistory)
        ? economySystem.state.economyHistory
        : [];

    const recentHistory = historySource.slice(-8).reverse();

    if (recentHistory.length === 0) {
      operationsHistoryEmpty.hidden = false;
      operationsHistoryStatus.textContent =
        'No economy pulses recorded yet — complete a day cycle to populate telemetry.';
      if (missionControls.operationsHistorySignature !== 'empty') {
        missionControls.operationsHistorySignature = 'empty';
        operationsHistoryList.innerHTML = '';
      }
    } else {
      operationsHistoryEmpty.hidden = true;
      const latestTimestamp = Number.isFinite(recentHistory[0]?.timestamp)
        ? recentHistory[0].timestamp
        : null;
      const relativeUpdate = latestTimestamp ? describeRelativeTime(latestTimestamp) : null;
      operationsHistoryStatus.textContent = relativeUpdate
        ? `Last economy pulse ${relativeUpdate}.`
        : 'Recent economy pulses available.';

      const signature = recentHistory
        .map((entry) => {
          const day = Number.isFinite(entry?.day) ? Math.max(1, Math.round(entry.day)) : 0;
          const total = Number.isFinite(entry?.total) ? Math.round(entry.total) : 0;
          const timestamp = Number.isFinite(entry?.timestamp) ? entry.timestamp : 0;
          const recencyBucket = timestamp
            ? Math.floor(Math.max(0, Date.now() - timestamp) / 60000)
            : 0;
          return `${day}:${total}:${timestamp}:${recencyBucket}`;
        })
        .join('|');

      if (signature !== missionControls.operationsHistorySignature) {
        missionControls.operationsHistorySignature = signature;
        operationsHistoryList.innerHTML = '';

        const prefixSignedCurrency = (value) => {
          if (!Number.isFinite(value) || value === 0) {
            return formatCurrency(0);
          }

          const absolute = formatCurrency(Math.abs(value));
          return `${value >= 0 ? '+' : '-'}${absolute}`;
        };

        const fragment = document.createDocumentFragment();
        recentHistory.forEach((entry) => {
          const day = Number.isFinite(entry?.day) ? Math.max(1, Math.round(entry.day)) : null;
          const base = Number.isFinite(entry?.base) ? Math.round(entry.base) : 0;
          const payrollAmount = Number.isFinite(entry?.payroll) ? Math.round(entry.payroll) : 0;
          const overhead = Number.isFinite(entry?.safehouseOverhead)
            ? Math.round(entry.safehouseOverhead)
            : 0;
          const income = Number.isFinite(entry?.safehouseIncome)
            ? Math.round(entry.safehouseIncome)
            : 0;
          const total = Number.isFinite(entry?.total)
            ? Math.round(entry.total)
            : base + payrollAmount + overhead - income;
          const timestamp = Number.isFinite(entry?.timestamp) ? entry.timestamp : null;

          const item = document.createElement('li');
          item.className = 'mission-operations__history-item';
          const trend = total < 0 ? 'surplus' : total > 0 ? 'outflow' : 'even';
          item.dataset.trend = trend;

          const netLabel = total > 0
            ? `-${formatCurrency(total)}`
            : total < 0
              ? `+${formatCurrency(Math.abs(total))}`
              : formatCurrency(0);
          const summarySegments = [day ? `Day ${day}` : 'Day —', `${netLabel} net`];
          const relative = timestamp ? describeRelativeTime(timestamp) : null;
          if (relative) {
            summarySegments.push(relative);
          }

          const summary = document.createElement('span');
          summary.className = 'mission-operations__history-summary';
          summary.textContent = summarySegments.join(' • ');

          const detailSegments = [
            `Base ${formatCurrency(Math.abs(base))}`,
            `Payroll ${formatCurrency(Math.abs(payrollAmount))}`,
            `Overhead ${prefixSignedCurrency(overhead)}`,
            `Passive ${prefixSignedCurrency(income)}`,
          ];
          const detail = document.createElement('span');
          detail.className = 'mission-operations__history-detail';
          detail.textContent = detailSegments.join(' • ');

          item.setAttribute(
            'aria-label',
            `${summarySegments.join(', ')}. ${detailSegments.join(', ')}.`,
          );

          item.append(summary, detail);
          fragment.appendChild(item);
        });

        operationsHistoryList.append(fragment);
      }
    }
  }
};

const updateHeatManagementPanel = () => {
  const { heatActionButtons, heatStatus } = missionControls;
  if (!heatStatus) {
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
  const crackdownHistory = Array.isArray(state?.crackdownHistory)
    ? state.crackdownHistory
    : Array.isArray(heatSystem?.state?.crackdownHistory)
      ? heatSystem.state.crackdownHistory
      : [];

  const safehouse = state ? getActiveSafehouseFromState(state) : null;
  const facilityBonuses = safehouse ? computeSafehouseFacilityBonuses(safehouse) : null;
  const mitigationMultiplier = Number.isFinite(facilityBonuses?.heatMitigationMultiplier)
    && facilityBonuses.heatMitigationMultiplier > 0
    ? facilityBonuses.heatMitigationMultiplier
    : 1;
  const mitigationBonus = Number.isFinite(facilityBonuses?.heatMitigationBonus)
    ? facilityBonuses.heatMitigationBonus
    : 0;
  const costDiscount = Number.isFinite(facilityBonuses?.heatMitigationCostReduction)
    ? facilityBonuses.heatMitigationCostReduction
    : 0;

  const actions = Object.values(HEAT_MANAGEMENT_ACTIONS);
  const systemsReady = Boolean(missionSystem && heatSystem && economySystem);
  const buttons = heatActionButtons instanceof Map ? heatActionButtons : new Map();

  const actionSummaries = [];
  const shortages = [];

  actions.forEach((action) => {
    const ui = buttons.get(action.key);
    const button = ui?.button ?? null;
    const baseCost = Number.isFinite(action.cost) && action.cost > 0 ? action.cost : 0;
    const adjustedCost = Math.max(0, baseCost - costDiscount);
    const context = deriveHeatActionContext(action, { heatSystem, facilityBonuses });
    const projectedReduction = Math.max(0, context.reduction * mitigationMultiplier + mitigationBonus);
    const potentialReduction = Math.max(0, context.potentialReduction * mitigationMultiplier + mitigationBonus);
    const baseReduction = Math.max(0, context.baseReduction);

    const canPerform = systemsReady && funds >= adjustedCost;
    if (button) {
      button.disabled = !canPerform;
      button.title = canPerform
        ? ''
        : `Requires ${formatCurrency(adjustedCost)} and operational systems.`;
    }

    if (funds < adjustedCost) {
      shortages.push(`${action.label} needs ${formatCurrency(adjustedCost)}`);
    }

    let summary = `${action.label} costs ${formatCurrency(adjustedCost)} to drop heat by ${projectedReduction.toFixed(1)}.`;
    if (context.description) {
      summary = `${summary} ${context.description}`;
    }
    if (context.activeBonuses.length) {
      summary = `${summary} ${context.activeBonuses.join(' ')}`;
    }
    if (context.potentialBonuses.length && potentialReduction > projectedReduction + 0.05) {
      summary = `${summary} Potential ${potentialReduction.toFixed(1)} with ${context.potentialBonuses.join(' / ')}.`;
    }

    if (ui) {
      if (ui.base) {
        ui.base.textContent = `${baseReduction.toFixed(1)} heat`;
      }
      if (ui.projected) {
        ui.projected.textContent = `${projectedReduction.toFixed(1)} heat`;
      }
      if (ui.potential) {
        ui.potential.textContent = `${potentialReduction.toFixed(1)} heat`;
      }
      if (ui.cost) {
        ui.cost.textContent = formatCurrency(adjustedCost);
      }
      if (ui.crackdown) {
        const crackdownLabel = context.crackdownTier
          ? `${context.crackdownTier.charAt(0).toUpperCase()}${context.crackdownTier.slice(1)}`
          : 'Calm';
        ui.crackdown.textContent = crackdownLabel;
      }
      if (ui.active) {
        ui.active.textContent = context.activeBonuses.length
          ? `Active bonuses: ${context.activeBonuses.join(' ')}`
          : 'Active bonuses: none yet.';
      }
      if (ui.potentialNotes) {
        ui.potentialNotes.textContent = context.potentialBonuses.length
          ? `Potential bonuses: ${context.potentialBonuses.join(' ')}`
          : 'Potential bonuses: none remaining.';
      }
      if (ui.status) {
        let statusText;
        if (!systemsReady) {
          statusText = 'Mitigation systems offline.';
        } else if (!canPerform) {
          const shortfall = Math.max(0, adjustedCost - funds);
          statusText = shortfall > 0
            ? `Short ${formatCurrency(shortfall)}.`
            : 'Action unavailable.';
        } else {
          statusText = 'Ready to deploy.';
        }

        const statusExtras = [];
        if (costDiscount > 0) {
          statusExtras.push(`Discount ${formatCurrency(costDiscount)} applied.`);
        }
        if (mitigationMultiplier !== 1 || mitigationBonus > 0) {
          const multiplierLabel = mitigationMultiplier !== 1
            ? `${Math.round((mitigationMultiplier - 1) * 100)}% boost`
            : null;
          const bonusLabel = mitigationBonus > 0 ? `+${mitigationBonus.toFixed(1)} flat heat` : null;
          statusExtras.push(['Safehouse boost', multiplierLabel, bonusLabel].filter(Boolean).join(' '));
        }

        ui.status.textContent = statusExtras.length
          ? `${statusText} ${statusExtras.join(' ')}`
          : statusText;
      }
    }

    actionSummaries.push(summary);
  });

  let summaryMessage;
  if (!systemsReady) {
    summaryMessage = 'Heat abatement network syncing…';
  } else if (!actionSummaries.length) {
    summaryMessage = 'No heat mitigation actions configured.';
  } else {
    summaryMessage = actionSummaries.join(' ');
    if (shortages.length) {
      summaryMessage = `${summaryMessage} Funds short — ${shortages.join(' and ')}.`;
    } else {
      summaryMessage = `${summaryMessage} Available funds: ${formatCurrency(funds)}.`;
    }
    const bonusSegments = [];
    if (costDiscount > 0) {
      bonusSegments.push(`Safehouse perks shave ${formatCurrency(costDiscount)} off each operation.`);
    }
    if (mitigationMultiplier !== 1 || mitigationBonus > 0) {
      const multiplierLabel = mitigationMultiplier !== 1
        ? `${Math.round((mitigationMultiplier - 1) * 100)}% boost`
        : null;
      const bonusLabel = mitigationBonus > 0
        ? `+${mitigationBonus.toFixed(1)} flat heat`
        : null;
      bonusSegments.push(
        ['Safehouse bonuses amplify mitigation', multiplierLabel, bonusLabel]
          .filter(Boolean)
          .join(' ')
          .concat('.'),
      );
    }
    if (bonusSegments.length) {
      summaryMessage = `${summaryMessage} ${bonusSegments.join(' ')}`;
    }
  }

  renderHeatMitigationHistory(mitigationLog);
  renderCrackdownHistory(crackdownHistory);

  const crackdownInfo = describeCrackdownPolicy();
  const historyDetail = missionControls.crackdownHistoryDetail?.trim();
  const forecastSummary = missionControls.crackdownForecastSummary?.trim();
  const crackdownMessage = crackdownInfo
    ? [
        `Crackdown level: ${crackdownInfo.label} — ${crackdownInfo.impact}`,
        forecastSummary ? `Forecast — ${forecastSummary}` : null,
        historyDetail,
      ]
        .filter(Boolean)
        .join(' ')
    : [
        'Crackdown status unavailable.',
        forecastSummary ? `Forecast — ${forecastSummary}` : null,
        historyDetail,
      ]
        .filter(Boolean)
        .join(' ');

  const detail = missionControls.heatStatusDetail?.trim();
  const leadMessage = detail || summaryMessage;

  heatStatus.textContent = [leadMessage, crackdownMessage].filter(Boolean).join(' ');
};

const updateMaintenancePanel = () => {
  const {
    maintenanceStatus,
    maintenanceRepairButton,
    maintenanceHeatButton,
    maintenanceUpgradeSelect,
    maintenanceUpgradeButton,
    maintenanceUpgradeList,
    maintenancePartsStockpile,
    maintenanceCraftingList,
    garageActivityList,
  } = missionControls;

  if (
    !maintenanceStatus
    || !maintenanceRepairButton
    || !maintenanceHeatButton
    || !maintenanceUpgradeSelect
    || !maintenanceUpgradeButton
    || !maintenanceUpgradeList
    || !maintenancePartsStockpile
    || !maintenanceCraftingList
    || !garageActivityList
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
  const partsInventory = Number.isFinite(state?.partsInventory)
    ? Math.max(0, Math.round(state.partsInventory))
    : 0;
  maintenancePartsStockpile.textContent = `Parts in storage: ${partsInventory}`;
  const latestVehicleReport = missionSystem?.state?.lastVehicleReport ?? null;

  if (latestVehicleReport) {
    const toastOutcomes = new Set(['vehicle-acquired', 'storage-blocked']);
    let eventTimestamp = Number.isFinite(latestVehicleReport.timestamp)
      ? latestVehicleReport.timestamp
      : null;
    const lastToast = Number.isFinite(missionControls.lastGarageStatusTimestamp)
      ? missionControls.lastGarageStatusTimestamp
      : 0;
    if (!eventTimestamp) {
      eventTimestamp = lastToast || Date.now();
    }
    if (toastOutcomes.has(latestVehicleReport.outcome) && eventTimestamp > lastToast) {
      const reportSummary = describeVehicleReportOutcome(latestVehicleReport);
      if (reportSummary) {
        missionControls.maintenanceStatusDetail = reportSummary;
        missionControls.lastGarageStatusTimestamp = eventTimestamp;
      }
    }
  }

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

  if (
    latestVehicleReport &&
    (latestVehicleReport.outcome === 'storage-blocked' || latestVehicleReport.outcome === 'vehicle-acquired')
  ) {
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

  const fabricationRecipes = getVehicleModRecipes()
    .map((recipe) => ({
      ...recipe,
      label: VEHICLE_UPGRADE_CATALOG?.[recipe.modId]?.label ?? recipe.modId,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  maintenanceCraftingList.innerHTML = '';
  if (!fabricationRecipes.length) {
    const item = document.createElement('li');
    item.className = 'mission-maintenance__crafting-item mission-maintenance__crafting-item--empty';
    item.textContent = 'No fabrication schematics available.';
    maintenanceCraftingList.appendChild(item);
  } else {
    fabricationRecipes.forEach((recipe) => {
      const modProfile = VEHICLE_UPGRADE_CATALOG?.[recipe.modId] ?? null;
      const label = recipe.label ?? modProfile?.label ?? recipe.modId;
      const summary = modProfile?.summary ?? modProfile?.description ?? 'Effect profile unavailable.';
      const descriptionText = modProfile?.description && modProfile.description !== summary
        ? modProfile.description
        : null;
      const availabilityNote = typeof recipe.availabilityNote === 'string' ? recipe.availabilityNote : '';
      const costSegments = [
        `${recipe.partsCost} parts`,
        ...(recipe.fundsCost > 0 ? [formatCurrency(recipe.fundsCost)] : []),
      ];
      const affordability = assessVehicleModAffordability(recipe, {
        partsAvailable: partsInventory,
        fundsAvailable: funds,
      });

      const item = document.createElement('li');
      item.className = 'mission-maintenance__crafting-item';

      const header = document.createElement('div');
      header.className = 'mission-maintenance__crafting-header';

      const name = document.createElement('span');
      name.className = 'mission-maintenance__crafting-name';
      name.textContent = label;
      header.appendChild(name);

      const cost = document.createElement('span');
      cost.className = 'mission-maintenance__crafting-cost';
      cost.textContent = costSegments.join(' + ');
      header.appendChild(cost);

      const description = document.createElement('p');
      description.className = 'mission-maintenance__crafting-summary';
      description.textContent = summary;

      const detail = document.createElement('p');
      detail.className = 'mission-maintenance__crafting-detail';
      detail.textContent = descriptionText ?? '';

      if (!descriptionText) {
        detail.remove();
      }

      const status = document.createElement('p');
      status.className = 'mission-maintenance__crafting-status';

      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'mission-maintenance__crafting-action';
      action.dataset.modId = recipe.modId;
      action.textContent = `Fabricate (${costSegments.join(' + ')})`;

      let statusMessage = '';
      let disabledReason = '';

      if (!systemsReady) {
        statusMessage = 'Maintenance systems offline.';
        disabledReason = statusMessage;
        action.disabled = true;
      } else if (!hasSelection) {
        statusMessage = 'Select a garage vehicle to craft upgrades.';
        disabledReason = statusMessage;
        action.disabled = true;
        action.textContent = 'Select a vehicle to craft';
      } else if (installedMods.includes(recipe.modId)) {
        statusMessage = 'Already installed on this vehicle.';
        disabledReason = statusMessage;
        action.disabled = true;
      } else if (!affordability.affordable) {
        const shortfalls = [];
        if (affordability.partsShortfall > 0) {
          shortfalls.push(`${affordability.partsShortfall} more parts`);
        }
        if (affordability.fundsShortfall > 0) {
          shortfalls.push(`another ${formatCurrency(affordability.fundsShortfall)}`);
        }
        if (shortfalls.length) {
          statusMessage = `Need ${shortfalls.join(' and ')}.`;
        } else {
          statusMessage = 'Requirements not met yet.';
        }
        disabledReason = statusMessage;
        action.disabled = true;
        action.textContent = 'Insufficient resources';
      } else {
        statusMessage = 'Ready to fabricate and install.';
        action.disabled = false;
        action.title = `Consume ${costSegments.join(' + ')} to install immediately.`;
      }

      if (disabledReason && !action.disabled) {
        action.title = disabledReason;
      } else if (disabledReason) {
        action.title = disabledReason;
      }

      status.textContent = statusMessage;

      item.appendChild(header);
      item.appendChild(description);
      if (descriptionText) {
        item.appendChild(detail);
      }
      if (availabilityNote) {
        const note = document.createElement('p');
        note.className = 'mission-maintenance__crafting-note';
        note.textContent = availabilityNote;
        item.appendChild(note);
      }
      item.appendChild(status);
      item.appendChild(action);
      maintenanceCraftingList.appendChild(item);
    });
  }

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

  const partsMessage = `Workshop inventory: ${partsInventory} parts on hand.`;
  summaryMessage = `${summaryMessage} ${partsMessage}`.trim();

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

const handleCraftVehicleMod = (modId) => {
  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();

  if (!missionSystem || !economySystem) {
    missionControls.maintenanceStatusDetail = 'Maintenance systems offline.';
    updateMaintenancePanel();
    return;
  }

  const vehicleId = missionControls.selectedVehicleId;
  if (!vehicleId) {
    missionControls.maintenanceStatusDetail = 'Select a garage vehicle before fabricating upgrades.';
    updateMaintenancePanel();
    return;
  }

  if (!modId) {
    missionControls.maintenanceStatusDetail = 'Select a schematic before fabricating an upgrade.';
    updateMaintenancePanel();
    return;
  }

  const result = missionSystem.craftVehicleMod(vehicleId, modId, economySystem);
  if (!result?.success) {
    let failureMessage = 'Unable to fabricate upgrade.';
    switch (result?.reason) {
      case 'vehicle-not-found':
        failureMessage = 'Selected vehicle no longer in the garage.';
        break;
      case 'already-installed':
        failureMessage = 'Upgrade already installed on this vehicle.';
        break;
      case 'unknown-upgrade':
        failureMessage = 'Fabrication plan unavailable — refresh schematics.';
        break;
      case 'insufficient-parts': {
        const required = Number.isFinite(result.partsRequired) ? result.partsRequired : null;
        const available = Number.isFinite(result.partsAvailable) ? result.partsAvailable : null;
        failureMessage = `Insufficient parts — requires ${required ?? '?'} (available ${available ?? 0}).`;
        break;
      }
      case 'insufficient-funds': {
        const required = Number.isFinite(result.fundsRequired)
          ? formatCurrency(result.fundsRequired)
          : null;
        const available = Number.isFinite(result.fundsAvailable)
          ? formatCurrency(result.fundsAvailable)
          : null;
        failureMessage = `Insufficient funds — requires ${required ?? 'funds'}, available ${available ?? formatCurrency(0)}.`;
        break;
      }
      default:
        break;
    }

    missionControls.maintenanceStatusDetail = failureMessage;
    updateMaintenancePanel();
    return;
  }

  const segments = [
    `Fabricated ${result.upgradeLabel ?? 'upgrade'} for ${result.vehicleModel ?? 'vehicle'}.`,
  ];
  if (Number.isFinite(result.partsSpent) && result.partsSpent > 0) {
    segments.push(`${result.partsSpent} parts used.`);
  }
  if (Number.isFinite(result.fundsSpent) && result.fundsSpent > 0) {
    segments.push(`Spent ${formatCurrency(result.fundsSpent)}.`);
  }
  if (Number.isFinite(result.partsRemaining)) {
    segments.push(`Parts remaining: ${result.partsRemaining}.`);
  }
  const profile = result.modId ? VEHICLE_UPGRADE_CATALOG?.[result.modId] ?? null : null;
  const detail = profile?.summary ?? profile?.description ?? '';
  if (detail) {
    segments.push(detail);
  }

  missionControls.maintenanceStatusDetail = segments.join(' ');

  updateMissionControls();
  triggerHudRender();
};

const handleMaintenanceCraftingClick = (event) => {
  const button = event.target?.closest('button[data-mod-id]');
  if (!button) {
    return;
  }

  const modId = button.dataset.modId;
  if (modId) {
    handleCraftVehicleMod(modId);
  }
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
  const safehouse = state ? getActiveSafehouseFromState(state) : null;
  const facilityBonuses = safehouse ? computeSafehouseFacilityBonuses(safehouse) : null;
  const costDiscount = Number.isFinite(facilityBonuses?.heatMitigationCostReduction)
    ? facilityBonuses.heatMitigationCostReduction
    : 0;
  const adjustedCost = Math.max(0, cost - costDiscount);

  if (funds < adjustedCost) {
    const required = formatCurrency(adjustedCost);
    const available = formatCurrency(funds);
    missionControls.heatStatusDetail = `Insufficient funds — requires ${required}, available ${available}.`;
    updateHeatManagementPanel();
    return;
  }

  const context = deriveHeatActionContext(action, { heatSystem, facilityBonuses });
  const mitigationMultiplier = Number.isFinite(facilityBonuses?.heatMitigationMultiplier)
    && facilityBonuses.heatMitigationMultiplier > 0
    ? facilityBonuses.heatMitigationMultiplier
    : 1;
  const mitigationBonus = Number.isFinite(facilityBonuses?.heatMitigationBonus)
    ? facilityBonuses.heatMitigationBonus
    : 0;
  const plannedReduction = Math.max(0, context.reduction);
  const heatReduction = Math.max(0, plannedReduction * mitigationMultiplier + mitigationBonus);

  const finalizeMitigation = (mitigationResult) => {
    if (!mitigationResult?.success) {
      let failureMessage = 'Unable to mitigate heat.';
      if (mitigationResult?.reason === 'insufficient-funds') {
        const required = formatCurrency(mitigationResult.cost ?? adjustedCost);
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

    const messageSegments = [`Spent ${formatCurrency(mitigationResult.cost ?? adjustedCost)} to ${action.label.toLowerCase()}`];
    const adjustmentNotes = [];
    if (context.activeBonuses.length) {
      adjustmentNotes.push(context.activeBonuses.join(' '));
    }
    if (mitigationMultiplier !== 1 || mitigationBonus > 0) {
      const pieces = [];
      if (mitigationMultiplier !== 1) {
        pieces.push(`${Math.round((mitigationMultiplier - 1) * 100)}% safehouse boost`);
      }
      if (mitigationBonus > 0) {
        pieces.push(`+${mitigationBonus.toFixed(1)} flat heat`);
      }
      adjustmentNotes.push(pieces.join(' '));
    }
    if (costDiscount > 0) {
      adjustmentNotes.push(`Discount applied — saved ${formatCurrency(costDiscount)}.`);
    }

    messageSegments.push(`— heat ${formatHeatValue(heatBefore)} → ${formatHeatValue(heatAfter)}.`);
    if (adjustmentNotes.length) {
      messageSegments.push(adjustmentNotes.join(' '));
    }

    missionControls.heatStatusDetail = messageSegments.join(' ');

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
      reduction: heatReduction,
      cost: adjustedCost,
      label: action.label,
      metadata: {
        action: action.key,
        baseReduction: context.baseReduction,
        bonusesApplied: context.activeBonuses,
        facilityMultiplier: mitigationMultiplier,
        facilityBonus: mitigationBonus,
        costDiscount,
      },
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

const initializeHeatActionButtons = () => {
  const container = missionControls.heatActionContainer;
  if (!container) {
    missionControls.heatActionButtons = new Map();
    return;
  }

  container.innerHTML = '';
  const entries = new Map();

  Object.values(HEAT_MANAGEMENT_ACTIONS).forEach((action) => {
    if (!action?.key) {
      return;
    }

    const baseId = `mission-heat-${action.key}`;
    const card = document.createElement('article');
    card.className = 'mission-heat__action-card';
    card.setAttribute('role', 'listitem');

    const labelId = `${baseId}-title`;
    const descriptionId = `${baseId}-description`;
    const statusId = `${baseId}-status`;
    card.setAttribute('aria-labelledby', labelId);
    card.setAttribute('aria-describedby', `${descriptionId} ${statusId}`.trim());

    const title = document.createElement('h4');
    title.className = 'mission-heat__action-title';
    title.id = labelId;
    title.textContent = action.label ?? action.key;
    card.appendChild(title);

    const description = document.createElement('p');
    description.className = 'mission-heat__action-description';
    description.id = descriptionId;
    description.textContent = action.description ?? '';
    card.appendChild(description);

    const stats = document.createElement('dl');
    stats.className = 'mission-heat__action-stats';

    const createStat = (label, className) => {
      const row = document.createElement('div');
      row.className = 'mission-heat__action-stat';
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.className = className;
      row.appendChild(dt);
      row.appendChild(dd);
      stats.appendChild(row);
      return dd;
    };

    const baseValue = createStat('Base Drop', 'mission-heat__action-value mission-heat__action-value--base');
    const projectedValue = createStat(
      'Projected Drop',
      'mission-heat__action-value mission-heat__action-value--projected',
    );
    const potentialValue = createStat(
      'Max Drop',
      'mission-heat__action-value mission-heat__action-value--potential',
    );
    const crackdownValue = createStat(
      'Current Crackdown',
      'mission-heat__action-value mission-heat__action-value--crackdown',
    );
    const costValue = createStat('Current Cost', 'mission-heat__action-value mission-heat__action-value--cost');

    [baseValue, projectedValue, potentialValue, crackdownValue, costValue].forEach((node) => {
      if (node) {
        node.textContent = '—';
      }
    });

    card.appendChild(stats);

    const activeNote = document.createElement('p');
    activeNote.className = 'mission-heat__action-note mission-heat__action-note--active';
    activeNote.textContent = 'Active bonuses: syncing…';
    card.appendChild(activeNote);

    const potentialNote = document.createElement('p');
    potentialNote.className = 'mission-heat__action-note mission-heat__action-note--potential';
    potentialNote.textContent = 'Potential bonuses: syncing…';
    card.appendChild(potentialNote);

    const status = document.createElement('p');
    status.className = 'mission-heat__action-note mission-heat__action-note--status';
    status.id = statusId;
    status.textContent = 'Mitigation telemetry syncing.';
    card.appendChild(status);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mission-heat__action-button';
    button.id = `${baseId}-btn`;
    button.dataset.actionKey = action.key;
    button.textContent = action.label ?? action.key;
    button.setAttribute('aria-describedby', `${descriptionId} ${statusId}`.trim());
    button.addEventListener('click', () => performHeatMitigation(action.key));
    card.appendChild(button);

    container.appendChild(card);

    entries.set(action.key, {
      button,
      card,
      base: baseValue,
      projected: projectedValue,
      potential: potentialValue,
      cost: costValue,
      crackdown: crackdownValue,
      active: activeNote,
      potentialNotes: potentialNote,
      status,
    });
  });

  missionControls.heatActionButtons = entries;
};

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

const handleSafehouseProjectFunding = () => {
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
    missionControls.safehouseStatusDetail = 'Purchase this safehouse before funding projects.';
    updateSafehousePanel();
    return;
  }

  const projectSummaries = safehouse.getActiveProjectSummaries?.() ?? [];
  if (!projectSummaries.length) {
    missionControls.safehouseStatusDetail = 'No safehouse projects available to fund.';
    updateSafehousePanel();
    return;
  }

  const preferredId = missionControls.safehouseSelectedProjectId ?? '';
  let targetProject = preferredId
    ? projectSummaries.find((project) => project?.id === preferredId)
    : null;
  if (!targetProject) {
    targetProject = projectSummaries.find(
      (project) => Number.isFinite(project?.fundingRemaining) && project.fundingRemaining > 0,
    );
    if (targetProject) {
      missionControls.safehouseSelectedProjectId = targetProject.id ?? null;
    }
  }

  if (!targetProject) {
    missionControls.safehouseStatusDetail = 'All safehouse projects already fully funded.';
    updateSafehousePanel();
    return;
  }

  const funds = Number.isFinite(state.funds) ? state.funds : 0;
  const remainingCost = Math.max(0, Number(targetProject.fundingRemaining) || 0);

  if (remainingCost <= 0) {
    missionControls.safehouseStatusDetail = `${targetProject.name ?? 'Project'} already funded.`;
    updateSafehousePanel();
    return;
  }

  if (funds <= 0) {
    missionControls.safehouseStatusDetail = `Insufficient funds — ${formatCurrency(remainingCost)} needed to fund ${
      targetProject.name ?? 'this project'
    }.`;
    updateSafehousePanel();
    return;
  }

  const fundsToInvest = Math.min(funds, remainingCost);
  const result = safehouse.startProject?.(targetProject.id, { fundsAvailable: fundsToInvest }) ?? null;

  if (!result || result.success === false) {
    let message = 'Unable to fund project.';
    if (result?.reason === 'locked') {
      message = 'Unlock this safehouse tier before funding projects.';
    } else if (result?.reason === 'insufficient-funds') {
      const required = formatCurrency(result.required ?? remainingCost);
      message = `Requires ${required} to fund ${targetProject.name ?? 'this project'}.`;
    }
    missionControls.safehouseStatusDetail = message;
    updateSafehousePanel();
    return;
  }

  if (Number.isFinite(result.fundsSpent) && result.fundsSpent > 0) {
    economySystem.adjustFunds(-result.fundsSpent);
  }

  let statusMessage;
  if (result.completed) {
    const amenityName = result.amenity?.name ?? targetProject.name ?? 'Project';
    statusMessage = `${amenityName} completed and brought online.`;
  } else if (Number.isFinite(result.remainingCost) && result.remainingCost > 0) {
    statusMessage = `Allocated ${formatCurrency(result.fundsSpent ?? fundsToInvest)} to ${
      targetProject.name ?? 'the project'
    } — ${formatCurrency(result.remainingCost)} still required.`;
  } else {
    statusMessage = `Funded ${targetProject.name ?? 'the project'} for ${formatCurrency(
      result.fundsSpent ?? fundsToInvest,
    )}.`;
  }

  missionControls.safehouseStatusDetail = statusMessage;
  updateMissionControls();
  triggerHudRender();
};

const handleSafehouseProjectRush = () => {
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
    missionControls.safehouseStatusDetail = 'Purchase this safehouse before accelerating projects.';
    updateSafehousePanel();
    return;
  }

  const projectSummaries = safehouse.getActiveProjectSummaries?.() ?? [];
  if (!projectSummaries.length) {
    missionControls.safehouseStatusDetail = 'No safehouse projects currently in progress.';
    updateSafehousePanel();
    return;
  }

  const preferredId = missionControls.safehouseSelectedProjectId ?? '';
  let targetProject = preferredId
    ? projectSummaries.find((project) => project?.id === preferredId)
    : null;
  if (!targetProject) {
    targetProject = projectSummaries.find(
      (project) =>
        Number.isFinite(project?.timeRemaining) &&
        project.timeRemaining > 0 &&
        (!Number.isFinite(project?.fundingRemaining) || project.fundingRemaining <= 0),
    );
    if (targetProject) {
      missionControls.safehouseSelectedProjectId = targetProject.id ?? null;
    }
  }

  if (!targetProject) {
    missionControls.safehouseStatusDetail = 'No eligible projects to accelerate — fund a project first.';
    updateSafehousePanel();
    return;
  }

  if (Number.isFinite(targetProject.fundingRemaining) && targetProject.fundingRemaining > 0) {
    missionControls.safehouseStatusDetail = `Fund ${targetProject.name ?? 'the project'} before rushing construction.`;
    updateSafehousePanel();
    return;
  }

  const funds = Number.isFinite(state.funds) ? state.funds : 0;
  const rushQuote = safehouse.getProjectRushQuote?.(targetProject.id) ?? null;
  const rushCostPerDay = Number.isFinite(rushQuote?.rushCostPerDay) ? rushQuote.rushCostPerDay : null;

  if (!rushCostPerDay || rushCostPerDay <= 0) {
    missionControls.safehouseStatusDetail = `${targetProject.name ?? 'Project'} cannot be rushed.`;
    updateSafehousePanel();
    return;
  }

  if (funds < rushCostPerDay) {
    missionControls.safehouseStatusDetail = `Requires ${formatCurrency(rushCostPerDay)} to rush ${
      targetProject.name ?? 'this project'
    }.`;
    updateSafehousePanel();
    return;
  }

  const result = safehouse.advanceProject?.(targetProject.id, { fundsAvailable: funds }) ?? null;

  if (!result || result.success === false) {
    let message = 'Unable to accelerate project.';
    if (result?.reason === 'needs-funding') {
      message = `Fund ${targetProject.name ?? 'the project'} before accelerating it.`;
    } else if (result?.reason === 'not-started') {
      message = `Begin construction on ${targetProject.name ?? 'the project'} before rushing it.`;
    } else if (result?.reason === 'locked') {
      message = 'Unlock this safehouse tier before accelerating projects.';
    }
    missionControls.safehouseStatusDetail = message;
    updateSafehousePanel();
    return;
  }

  if (Number.isFinite(result.fundsSpent) && result.fundsSpent > 0) {
    economySystem.adjustFunds(-result.fundsSpent);
  }

  let statusMessage;
  if (result.completed) {
    const amenityName = result.amenity?.name ?? targetProject.name ?? 'Project';
    statusMessage = `${amenityName} completed and brought online.`;
  } else if (Number.isFinite(result.daysAdvanced) && result.daysAdvanced > 0) {
    const daysLabel = result.daysAdvanced === 1 ? '1 day' : `${result.daysAdvanced} days`;
    statusMessage = `Accelerated ${targetProject.name ?? 'the project'} by ${daysLabel} for ${formatCurrency(
      result.fundsSpent ?? rushCostPerDay,
    )}.`;
    if (Number.isFinite(result.remainingTime) && result.remainingTime > 0) {
      statusMessage += ` ${Math.ceil(result.remainingTime)} days remaining.`;
    }
  } else {
    statusMessage = `Invested ${formatCurrency(result.fundsSpent ?? rushCostPerDay)} into ${
      targetProject.name ?? 'the project'
    }.`;
  }

  missionControls.safehouseStatusDetail = statusMessage;
  updateMissionControls();
  triggerHudRender();
};

const handleSafehouseProjectSelection = (projectId) => {
  if (!projectId || missionControls.safehouseSelectedProjectId === projectId) {
    return;
  }

  missionControls.safehouseSelectedProjectId = projectId;
  updateSafehousePanel();
};

const handleSafehouseProjectListClick = (event) => {
  const target = event.target?.closest?.('[data-project-id]');
  if (!target) {
    return;
  }

  const projectId = target.dataset.projectId;
  if (!projectId) {
    return;
  }

  handleSafehouseProjectSelection(projectId);
};

const handleSafehouseProjectListKeydown = (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  const target = event.target?.closest?.('[data-project-id]');
  if (!target) {
    return;
  }

  event.preventDefault();
  const projectId = target.dataset.projectId;
  if (!projectId) {
    return;
  }

  handleSafehouseProjectSelection(projectId);
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

const handleSafehouseAlertChoice = (event) => {
  const button =
    event?.target && typeof event.target.closest === 'function'
      ? event.target.closest('button[data-safehouse-alert-choice]')
      : null;
  if (!button) {
    return;
  }

  const { alertId, choiceId } = button.dataset;
  if (!alertId || !choiceId) {
    return;
  }

  const missionSystem = getMissionSystem();
  const statusNode = missionControls.safehouseAlertStatus;

  if (!missionSystem || typeof missionSystem.resolveSafehouseAlertChoice !== 'function') {
    if (statusNode) {
      statusNode.textContent = 'Safehouse systems offline — unable to resolve alert.';
    }
    return;
  }

  const result = missionSystem.resolveSafehouseAlertChoice(alertId, choiceId);
  let statusMessage = '';

  if (!result) {
    statusMessage = 'Safehouse alert already resolved or unavailable.';
  } else {
    const detailParts = [result.summary];
    if (Array.isArray(result.details) && result.details.length) {
      detailParts.push(result.details.join(' '));
    }
    statusMessage = detailParts.filter(Boolean).join(' — ');
  }

  updateSafehousePanel();
  renderMissionEvents();
  renderGarageActivityLog();
  updateHeatManagementPanel();

  if (statusNode && statusMessage) {
    statusNode.textContent = statusMessage;
  }

  triggerHudRender();
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
  const gearSelect = missionControls.trainingGearSelect;
  const gearAcquireButton = missionControls.trainingGearAcquireButton;
  const gearEquipButton = missionControls.trainingGearEquipButton;
  const gearList = missionControls.trainingGearList;
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
    !gearSelect ||
    !gearAcquireButton ||
    !gearEquipButton ||
    !gearList ||
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
  const vendorOptions = getCrewGearVendorOptions(state ?? {});

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
      : !['on-mission', 'on-recon', 'captured'].includes((restingSelection.status ?? '').toLowerCase())
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

  const previousGearSelection = gearSelect.value;
  gearSelect.innerHTML = '';
  const gearPlaceholder = document.createElement('option');
  gearPlaceholder.value = '';
  gearPlaceholder.textContent = vendorOptions.length
    ? 'Select crew gear'
    : 'No vendor stock available';
  gearPlaceholder.disabled = true;
  gearPlaceholder.selected = true;
  gearSelect.appendChild(gearPlaceholder);

  vendorOptions.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.gearId;
    const owned = currentSelection ? crewOwnsGear(currentSelection, entry.gearId) : false;
    const equipped = currentSelection ? crewHasEquippedGear(currentSelection, entry.gearId) : false;
    const statusSegments = [];
    if (entry.locked) {
      statusSegments.push('locked');
    } else if (entry.soldOut) {
      statusSegments.push('restocking');
    } else if (Number.isFinite(entry.quantity)) {
      statusSegments.push(`${entry.quantity} in stock`);
    }
    if (owned) {
      statusSegments.push(equipped ? 'equipped' : 'owned');
    }
    const statusLabel = statusSegments.length ? ` (${statusSegments.join(', ')})` : '';
    option.textContent = `${entry.label}${statusLabel}`;
    option.dataset.available = entry.available ? 'true' : 'false';
    option.dataset.locked = entry.locked ? 'true' : 'false';
    option.dataset.soldOut = entry.soldOut ? 'true' : 'false';
    option.dataset.messages = entry.messages.join(' ');
    option.dataset.cost = entry.cost;
    gearSelect.appendChild(option);
  });

  if (currentSelection && vendorOptions.some((entry) => entry.gearId === previousGearSelection)) {
    gearSelect.value = previousGearSelection;
    gearPlaceholder.selected = false;
  } else if (currentSelection && vendorOptions.length) {
    const preferred = vendorOptions.find((entry) => entry.available) ?? vendorOptions[0];
    gearSelect.value = preferred?.gearId ?? '';
    gearPlaceholder.selected = false;
  } else {
    gearSelect.value = '';
    gearPlaceholder.selected = true;
  }

  gearSelect.disabled = !currentSelection || !vendorOptions.length;

  const selectedVendorOption = vendorOptions.find((entry) => entry.gearId === gearSelect.value) ?? null;
  const vendorStatusNode = missionControls.trainingGearVendorStatus;
  if (vendorStatusNode) {
    if (selectedVendorOption?.messages?.length) {
      vendorStatusNode.textContent = selectedVendorOption.messages.join(' ');
    } else if (vendorOptions.length) {
      vendorStatusNode.textContent = 'Select crew gear to view stock and unlock requirements.';
    } else {
      vendorStatusNode.textContent = 'No crew gear vendors are currently stocked.';
    }
  }

  const selectedGearConfig = selectedVendorOption ? CREW_GEAR_CATALOG[selectedVendorOption.gearId] : null;
  const gearCost = Number.isFinite(selectedVendorOption?.cost)
    ? selectedVendorOption.cost
    : selectedGearConfig?.cost ?? 0;
  const ownsSelectedGear = currentSelection && selectedVendorOption
    ? crewOwnsGear(currentSelection, selectedVendorOption.gearId)
    : false;
  const gearEquipped = currentSelection && selectedVendorOption
    ? crewHasEquippedGear(currentSelection, selectedVendorOption.gearId)
    : false;

  gearAcquireButton.disabled =
    !missionSystem
    || !economySystem
    || !currentSelection
    || !selectedVendorOption
    || !selectedVendorOption.available
    || ownsSelectedGear
    || funds < gearCost;

  if (!currentSelection) {
    gearAcquireButton.title = 'Select a crew member to outfit.';
  } else if (!selectedVendorOption) {
    gearAcquireButton.title = 'Select gear to acquire.';
  } else if (selectedVendorOption.locked) {
    gearAcquireButton.title = selectedVendorOption.messages.join(' ') || 'Complete objectives to unlock this gear.';
  } else if (selectedVendorOption.soldOut) {
    gearAcquireButton.title = selectedVendorOption.messages.join(' ') || 'Vendor is currently sold out.';
  } else if (ownsSelectedGear) {
    gearAcquireButton.title = `${currentSelection.name} already owns this gear.`;
  } else if (funds < gearCost) {
    gearAcquireButton.title = 'Insufficient funds for this gear.';
  } else {
    gearAcquireButton.title = '';
  }

  if (selectedGearConfig) {
    gearAcquireButton.textContent = `Acquire ${selectedGearConfig.label} (${formatCurrency(gearCost)})`;
  } else {
    gearAcquireButton.textContent = 'Acquire Gear';
  }

  const canToggleGear = Boolean(currentSelection && selectedVendorOption && ownsSelectedGear);
  gearEquipButton.disabled = !canToggleGear;

  if (!currentSelection) {
    gearEquipButton.title = 'Select a crew member to outfit.';
  } else if (!selectedVendorOption) {
    gearEquipButton.title = 'Select gear to equip.';
  } else if (!ownsSelectedGear) {
    gearEquipButton.title = `${currentSelection.name} must acquire this gear before equipping it.`;
  } else {
    gearEquipButton.title = '';
  }

  if (selectedGearConfig) {
    gearEquipButton.textContent = gearEquipped
      ? `Unequip ${selectedGearConfig.label}`
      : `Equip ${selectedGearConfig.label}`;
  } else {
    gearEquipButton.textContent = 'Equip Gear';
  }

  renderCrewGearList(gearList, currentSelection);
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

const handleCrewGearAcquisition = () => {
  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();
  const state = missionSystem?.state ?? getSharedState();
  const crewSelect = missionControls.trainingCrewSelect;
  const gearSelect = missionControls.trainingGearSelect;

  if (!missionSystem || !economySystem || !state || !crewSelect || !gearSelect) {
    setTrainingStatus('Gear procurement unavailable.');
    return;
  }

  const crew = Array.isArray(state.crew) ? state.crew : [];
  const member = crew.find((entry) => entry?.id === crewSelect.value);

  if (!member) {
    setTrainingStatus('Select a crew member to outfit.');
    return;
  }

  const gearId = gearSelect.value;
  const config = gearId ? CREW_GEAR_CATALOG[gearId] : null;
  const vendorOptions = getCrewGearVendorOptions(state ?? {});
  const vendorEntry = vendorOptions.find((entry) => entry.gearId === gearId) ?? null;

  if (!vendorEntry || !config) {
    setTrainingStatus('Select gear to acquire.');
    return;
  }

  if (vendorEntry.locked) {
    setTrainingStatus(vendorEntry.messages.join(' ') || 'Meet the unlock requirements to access this gear.');
    return;
  }

  if (vendorEntry.soldOut || !vendorEntry.available) {
    setTrainingStatus(vendorEntry.messages.join(' ') || 'Vendor is currently sold out.');
    return;
  }

  if (crewOwnsGear(member, gearId)) {
    setTrainingStatus(`${member.name} already owns ${config.label}.`);
    return;
  }

  const cost = Number.isFinite(vendorEntry.cost) ? vendorEntry.cost : config.cost ?? 0;
  const funds = Number.isFinite(state.funds) ? state.funds : 0;
  if (funds < cost) {
    setTrainingStatus('Insufficient funds for this gear.');
    return;
  }

  const purchaseResult = purchaseCrewGearFromVendor(state, gearId);
  if (!purchaseResult?.success) {
    if (purchaseResult?.reason === 'locked') {
      const message = Array.isArray(purchaseResult.requirements)
        ? purchaseResult.requirements
            .filter((req) => req && req.fulfilled === false && req.message)
            .map((req) => req.message)
            .join(' ')
        : '';
      setTrainingStatus(message || 'Gear remains locked.');
      return;
    }
    if (purchaseResult?.reason === 'sold-out') {
      const restockLabel = Number.isFinite(purchaseResult.restockDay)
        ? `Restocks Day ${purchaseResult.restockDay}.`
        : 'Vendor is sold out.';
      setTrainingStatus(restockLabel);
      return;
    }
    setTrainingStatus('Unable to secure this gear from the vendor right now.');
    return;
  }

  economySystem.adjustFunds(-cost);
  if (typeof member.addGear === 'function') {
    member.addGear(gearId);
  } else {
    if (!Array.isArray(member.gearInventory)) {
      member.gearInventory = [];
    }
    if (!member.gearInventory.includes(gearId)) {
      member.gearInventory.push(gearId);
    }
  }

  if (typeof member.equipGear === 'function') {
    member.equipGear(gearId);
  } else {
    if (!Array.isArray(member.equippedGear)) {
      member.equippedGear = [];
    }
    if (!member.equippedGear.includes(gearId)) {
      member.equippedGear.push(gearId);
    }
  }

  const restockMessage = Number.isFinite(purchaseResult?.nextRestockDay)
    ? `Vendor restocks Day ${purchaseResult.nextRestockDay}.`
    : '';
  setTrainingStatus(`${member.name} acquires ${config.label}.${restockMessage ? ` ${restockMessage}` : ''}`);
  updateTrainingOptions();
  updateCrewSelectionOptions();
  updateMissionControls();
  triggerHudRender();
};

const handleCrewGearToggle = () => {
  const missionSystem = getMissionSystem();
  const state = missionSystem?.state ?? getSharedState();
  const crewSelect = missionControls.trainingCrewSelect;
  const gearSelect = missionControls.trainingGearSelect;

  if (!missionSystem || !state || !crewSelect || !gearSelect) {
    setTrainingStatus('Gear management unavailable.');
    return;
  }

  const crew = Array.isArray(state.crew) ? state.crew : [];
  const member = crew.find((entry) => entry?.id === crewSelect.value);

  if (!member) {
    setTrainingStatus('Select a crew member to outfit.');
    return;
  }

  const gearId = gearSelect.value;
  const config = gearId ? CREW_GEAR_CATALOG[gearId] : null;

  if (!gearId || !config) {
    setTrainingStatus('Select crew gear to toggle.');
    return;
  }

  if (!crewOwnsGear(member, gearId)) {
    setTrainingStatus(`${member.name} must acquire ${config.label} before equipping it.`);
    return;
  }

  const equipped = crewHasEquippedGear(member, gearId);
  if (equipped) {
    if (typeof member.unequipGear === 'function') {
      member.unequipGear(gearId);
    } else if (Array.isArray(member.equippedGear)) {
      member.equippedGear = member.equippedGear.filter((entry) => String(entry) !== gearId);
    }
    setTrainingStatus(`${member.name} stows ${config.label}.`);
  } else {
    if (typeof member.equipGear === 'function') {
      member.equipGear(gearId);
    } else {
      if (!Array.isArray(member.equippedGear)) {
        member.equippedGear = [];
      }
      if (!member.equippedGear.includes(gearId)) {
        member.equippedGear.push(gearId);
      }
    }
    setTrainingStatus(`${member.name} equips ${config.label}.`);
  }

  updateTrainingOptions();
  updateCrewSelectionOptions();
  updateMissionControls();
  triggerHudRender();
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
    : !['on-mission', 'on-recon', 'captured'].includes((member.status ?? '').toLowerCase());
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

const handleReconCrewSelectionChange = () => {
  const select = missionControls.reconCrewSelect;
  if (!select) {
    return;
  }

  missionControls.reconSelectedCrewIds = Array.from(select.selectedOptions ?? [])
    .map((option) => option.value)
    .filter(Boolean);
  updateReconPanel();
};

const handleReconSchedule = () => {
  const reconSystem = getReconSystem();
  const missionSystem = getMissionSystem();
  const state = reconSystem?.state ?? missionSystem?.state ?? getSharedState();

  if (!reconSystem || !state) {
    setReconStatus('Recon systems offline.', { tone: 'warning' });
    updateReconPanel();
    return;
  }

  const crewIds = Array.isArray(missionControls.reconSelectedCrewIds)
    ? missionControls.reconSelectedCrewIds.filter(Boolean)
    : [];

  if (!crewIds.length) {
    setReconStatus('Select idle crew to deploy.', { tone: 'warning' });
    updateReconPanel();
    return;
  }

  const crewRoster = Array.isArray(state.crew) ? state.crew : [];
  const unavailableMember = crewRoster
    .filter((member) => crewIds.includes(member?.id))
    .find((member) => {
      if (!member) {
        return false;
      }
      if (typeof member.isMissionReady === 'function') {
        return !member.isMissionReady();
      }
      return (member.status ?? '').toLowerCase() !== 'idle';
    });

  if (unavailableMember) {
    setReconStatus(`${unavailableMember.name ?? 'Crew member'} is unavailable for recon duty.`, { tone: 'warning' });
    updateReconPanel();
    return;
  }

  const districtSelect = missionControls.reconDistrictSelect;
  const districtId = districtSelect?.value;
  if (!districtId) {
    setReconStatus('Select a district to scout.', { tone: 'warning' });
    updateReconPanel();
    return;
  }

  const durationOption = resolveReconDurationOption(missionControls.reconDurationSelect?.value);
  const approachOption = resolveReconApproachOption(missionControls.reconApproachSelect?.value);
  const result = reconSystem.scheduleAssignment({
    crewIds,
    districtId,
    durationSeconds: durationOption?.seconds,
    approach: approachOption?.value,
  });

  if (!result?.success) {
    setReconStatus(result?.message ?? 'Unable to deploy recon team.', { tone: 'warning' });
    updateReconPanel();
    return;
  }

  missionControls.reconSelectedCrewIds = [];
  if (missionControls.reconCrewSelect) {
    Array.from(missionControls.reconCrewSelect.options).forEach((option) => {
      option.selected = false;
    });
  }

  setReconStatus(result.message ?? 'Recon team deployed.', { tone: 'success' });
  updateMissionControls();
  triggerHudRender();
};

const handleReconCancel = (assignmentId) => {
  if (!assignmentId) {
    return;
  }

  const reconSystem = getReconSystem();
  if (!reconSystem) {
    setReconStatus('Recon systems offline.', { tone: 'warning' });
    updateReconPanel();
    return;
  }

  const result = reconSystem.cancelAssignment(assignmentId);
  if (!result?.success) {
    setReconStatus(result?.message ?? 'Unable to abort recon assignment.', { tone: 'warning' });
    updateReconPanel();
    return;
  }

  setReconStatus(result.message ?? 'Recon assignment cancelled.', { tone: 'info' });
  updateMissionControls();
  triggerHudRender();
};

const handleReconListClick = (event) => {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) {
    return;
  }

  const button = target.closest('[data-recon-cancel]');
  if (!button) {
    return;
  }

  event.preventDefault();
  const assignmentId = button.getAttribute('data-recon-cancel');
  if (!assignmentId) {
    return;
  }

  handleReconCancel(assignmentId);
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

const renderCrewChemistrySummary = (roster, { missionReady = false } = {}) => {
  const chemistryList = missionControls.crewChemistryList;
  if (!chemistryList) {
    return;
  }

  const relationshipList = missionControls.relationshipEventList;
  const relationshipStatus = missionControls.relationshipEventStatus;
  if (relationshipStatus) {
    relationshipStatus.textContent = missionControls.relationshipEventStatusDetail ?? '';
  }

  const renderRelationshipEventsPanel = () => {
    if (!relationshipList) {
      return;
    }

    relationshipList.innerHTML = '';

    const missionSystem = getMissionSystem();
    const pendingEvents = missionSystem?.getPendingRelationshipEvents?.()
      ?? missionSystem?.relationshipService?.getPendingEvents?.()
      ?? [];

    if (!pendingEvents.length) {
      const placeholder = document.createElement('li');
      placeholder.className = 'mission-crew__relationship-event mission-crew__relationship-event--placeholder';
      placeholder.textContent = missionReady
        ? 'No relationship events queued.'
        : 'Relationship monitoring offline.';
      relationshipList.appendChild(placeholder);
      return;
    }

    pendingEvents.forEach((eventEntry) => {
      if (!eventEntry) {
        return;
      }
      const item = document.createElement('li');
      item.className = 'mission-crew__relationship-event';
      item.dataset.eventId = eventEntry.id ?? '';

      const heading = document.createElement('p');
      heading.className = 'mission-crew__relationship-heading';
      heading.textContent = Array.isArray(eventEntry.crewNames)
        ? eventEntry.crewNames.join(' & ')
        : 'Crew cohort';
      item.appendChild(heading);

      const prompt = document.createElement('p');
      prompt.className = 'mission-crew__relationship-prompt';
      prompt.textContent = eventEntry.prompt ?? 'Relationship milestone detected.';
      item.appendChild(prompt);

      const metaParts = [];
      if (eventEntry.band === 'synergy') {
        metaParts.push('Synergy milestone');
      } else if (eventEntry.band === 'strain') {
        metaParts.push('Strain warning');
      }
      const missionName = eventEntry?.missionContext?.missionName;
      if (missionName) {
        metaParts.push(`Triggered on ${missionName}`);
      }
      if (metaParts.length) {
        const meta = document.createElement('p');
        meta.className = 'mission-crew__relationship-meta';
        meta.textContent = metaParts.join(' • ');
        item.appendChild(meta);
      }

      const choices = Array.isArray(eventEntry.choices) ? eventEntry.choices : [];
      if (choices.length) {
        const choiceBar = document.createElement('div');
        choiceBar.className = 'mission-crew__relationship-choices';
        choices.forEach((choice) => {
          if (!choice) {
            return;
          }
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'mission-crew__relationship-choice';
          button.dataset.relationshipChoice = 'true';
          if (eventEntry.id) {
            button.dataset.eventId = eventEntry.id;
          }
          if (choice.id) {
            button.dataset.choiceId = choice.id;
          }
          button.textContent = choice.label ?? 'Select';
          if (choice.description) {
            button.title = choice.description;
          }
          choiceBar.appendChild(button);
        });
        item.appendChild(choiceBar);
      }

      relationshipList.appendChild(item);
    });
  };

  const appendPlaceholder = (text) => {
    const item = document.createElement('li');
    item.className = 'mission-crew__chemistry-item mission-crew__chemistry-item--placeholder';
    item.textContent = text;
    chemistryList.appendChild(item);
  };

  chemistryList.innerHTML = '';

  if (!missionReady) {
    appendPlaceholder('Chemistry intel initializing…');
    renderRelationshipEventsPanel();
    return;
  }

  const normalizedRoster = Array.isArray(roster)
    ? roster
        .map((member) => {
          if (!member) {
            return null;
          }
          const memberId = member.id !== undefined && member.id !== null ? String(member.id).trim() : null;
          return memberId ? { id: memberId, entity: member } : null;
        })
        .filter(Boolean)
    : [];

  if (normalizedRoster.length < 2) {
    appendPlaceholder('Recruit at least two specialists to unlock chemistry intel.');
    renderRelationshipEventsPanel();
    return;
  }

  const entries = [];

  normalizedRoster.forEach((memberWrapper, index) => {
    const { id: memberId, entity: member } = memberWrapper;
    const memberName = member.name ?? 'Crew member';

    for (let peerIndex = index + 1; peerIndex < normalizedRoster.length; peerIndex += 1) {
      const { id: peerId, entity: peer } = normalizedRoster[peerIndex];
      const peerName = peer.name ?? 'Crew member';

      const directionalScores = [];
      if (typeof member.getAffinityForCrewmate === 'function') {
        const score = member.getAffinityForCrewmate(peerId);
        if (Number.isFinite(score)) {
          directionalScores.push({ label: `${memberName} → ${peerName}`, value: score });
        }
      }
      if (typeof peer.getAffinityForCrewmate === 'function') {
        const score = peer.getAffinityForCrewmate(memberId);
        if (Number.isFinite(score)) {
          directionalScores.push({ label: `${peerName} → ${memberName}`, value: score });
        }
      }

      const pairLabel = `${memberName} ↔ ${peerName}`;
      if (!directionalScores.length) {
        entries.push({
          key: `${memberId}::${peerId}`,
          pairLabel,
          summary: null,
          tooltip: `${memberName} and ${peerName} have not worked together enough to gauge chemistry.`,
        });
        continue;
      }

      const averageAffinity =
        directionalScores.reduce((sum, entry) => sum + entry.value, 0) / directionalScores.length;
      const summary = evaluateChemistryFromAffinity(averageAffinity);
      const tooltipParts = [
        `${pairLabel} rapport average ${Math.round(summary.affinity)} — trait impact ${summary.percentLabel}.`,
      ];
      if (directionalScores.length > 1) {
        directionalScores.forEach((entry) => {
          tooltipParts.push(`${entry.label}: ${Math.round(clampAffinityScore(entry.value))}`);
        });
      } else {
        tooltipParts.push('Only one side of this relationship has reported affinity data so far.');
      }

      entries.push({
        key: `${memberId}::${peerId}`,
        pairLabel,
        summary,
        tooltip: tooltipParts.join('\n'),
      });
    }
  });

  if (!entries.length) {
    appendPlaceholder('No chemistry intel available yet.');
    renderRelationshipEventsPanel();
    return;
  }

  entries.sort((a, b) => {
    const aHasAffinity = Number.isFinite(a?.summary?.affinity);
    const bHasAffinity = Number.isFinite(b?.summary?.affinity);
    if (aHasAffinity && bHasAffinity) {
      if (a.summary.affinity === b.summary.affinity) {
        return a.pairLabel.localeCompare(b.pairLabel);
      }
      return a.summary.affinity - b.summary.affinity;
    }
    if (aHasAffinity) {
      return -1;
    }
    if (bHasAffinity) {
      return 1;
    }
    return a.pairLabel.localeCompare(b.pairLabel);
  });

  entries.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'mission-crew__chemistry-item';
    const summaryLabel = entry.summary ? entry.summary.label : 'Chemistry intel pending';
    item.textContent = `${entry.pairLabel} — ${summaryLabel}`;
    if (entry.tooltip) {
      item.title = entry.tooltip;
    }
    if (!entry.summary) {
      item.classList.add('mission-crew__chemistry-item--pending');
    }
    if (entry.summary?.isWarning) {
      item.classList.add('mission-crew__chemistry-item--warning');
    }
    if (entry.summary?.status === 'synergy') {
      item.classList.add('mission-crew__chemistry-item--synergy');
    }
    chemistryList.appendChild(item);
  });

  renderRelationshipEventsPanel();
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

  const storylineTemplates = getAvailableCrewStorylineMissions(crewRoster);
  const storylineByCrewId = new Map();
  storylineTemplates.forEach((template) => {
    const crewId = template?.storyline?.crewId;
    if (crewId) {
      storylineByCrewId.set(crewId, template);
    }
  });

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
    const nextStoryMission = storylineByCrewId.get(member.id) ?? null;
    const storySummary = summarizeCrewStorylineProgress(member, nextStoryMission);
    const storyLabel = storySummary?.label ? ` • ${storySummary.label}` : '';
    const backgroundName = member.background?.name || member.background?.perkLabel || '';
    const backgroundLabel = backgroundName ? ` • ${backgroundName}` : '';
    const traitSummary = formatCrewTraitSummary(member, 3);
    const traitsLabel = traitSummary ? ` • ${traitSummary}` : '';
    const gearLabel = ` • ${describeCrewGearLoadout(member)}`;
    const squadSnapshot = crewRoster.filter((entry) => selectedSet.has(entry.id));
    const chemistrySummary = selectedSet.has(member.id)
      ? summarizeSelectedChemistry(member, squadSnapshot)
      : null;
    let descriptorText = `${member.name} — ${member.specialty} • ${loyaltyLabel} • ${statusLabel}${readinessLabel}${storyLabel}${backgroundLabel}${traitsLabel}${gearLabel}`;
    if (chemistrySummary?.label) {
      descriptorText = `${descriptorText} • ${chemistrySummary.label}`;
    }
    descriptor.textContent = descriptorText;
    const tooltipParts = [];
    if (readiness?.tooltip) {
      tooltipParts.push(readiness.tooltip);
    }
    if (storySummary?.tooltip) {
      tooltipParts.push(storySummary.tooltip);
    }
    if (chemistrySummary?.tooltip) {
      tooltipParts.push(chemistrySummary.tooltip);
    }
    const combinedTooltip = tooltipParts.join('\n\n');
    if (combinedTooltip) {
      descriptor.title = combinedTooltip;
      checkbox.title = combinedTooltip;
    } else {
      descriptor.removeAttribute('title');
      checkbox.removeAttribute('title');
    }

    if (chemistrySummary?.isWarning) {
      optionLabel.classList.add('mission-crew__option--chemistry-warning');
    }

    optionLabel.appendChild(checkbox);
    optionLabel.appendChild(descriptor);
    crewContainer.appendChild(optionLabel);
  });

  missionControls.selectedCrewIds = Array.from(selectedSet);
};

const summarizeCrewStorylineProgress = (member, nextMission = null) => {
  if (!member) {
    return { label: '', tooltip: '' };
  }

  const completedSteps = Array.isArray(member.storyProgress?.completedSteps)
    ? member.storyProgress.completedSteps.length
    : 0;
  const crewName = member.name ?? 'Crew member';

  const tooltipParts = [
    `${crewName} has completed ${completedSteps} storyline step${completedSteps === 1 ? '' : 's'}.`,
  ];

  if (nextMission) {
    const missionLabel = (() => {
      const fullName = nextMission.name ?? 'Storyline mission';
      if (crewName && fullName.startsWith(`${crewName}: `)) {
        return fullName.slice(crewName.length + 2).trim();
      }
      return fullName;
    })();
    if (nextMission.description) {
      tooltipParts.push(nextMission.description);
    }
    tooltipParts.push(`Next mission: ${missionLabel}.`);
    return {
      label: 'Story: Next mission ready',
      tooltip: tooltipParts.join(' '),
    };
  }

  if (completedSteps > 0) {
    tooltipParts.push('No storyline mission is currently queued.');
    return {
      label: `Story: ${completedSteps} completed`,
      tooltip: tooltipParts.join(' '),
    };
  }

  tooltipParts.push('Earn loyalty to unlock the first storyline mission.');
  return {
    label: 'Story: Not started',
    tooltip: tooltipParts.join(' '),
  };
};

const updateCrewStorylinePanel = () => {
  const list = missionControls.crewStorylineList;
  if (!list) {
    return;
  }

  list.innerHTML = '';

  const statusNode = missionControls.crewStorylineStatus;
  if (statusNode) {
    statusNode.textContent = '';
  }

  const missionSystem = getMissionSystem();
  if (!missionSystem) {
    const placeholder = document.createElement('li');
    placeholder.textContent = 'Storyline intel syncing…';
    list.appendChild(placeholder);
    if (statusNode) {
      statusNode.textContent = 'Crew storylines will appear once mission control is online.';
    }
    return;
  }

  const crewRoster = Array.isArray(missionSystem.state?.crew) ? missionSystem.state.crew : [];
  if (!crewRoster.length) {
    const placeholder = document.createElement('li');
    placeholder.textContent = 'Recruit specialists to unlock crew storylines.';
    list.appendChild(placeholder);
    if (statusNode) {
      statusNode.textContent = 'No crew available — hire specialists to begin their story arcs.';
    }
    return;
  }

  const storylineMissions = getAvailableCrewStorylineMissions(crewRoster);
  if (!storylineMissions.length) {
    const placeholder = document.createElement('li');
    placeholder.textContent = 'No storyline missions ready. Raise loyalty to unlock new chapters.';
    list.appendChild(placeholder);
    if (statusNode) {
      statusNode.textContent = 'Boost crew loyalty to surface the next storyline opportunities.';
    }
    return;
  }

  storylineMissions
    .slice()
    .sort((a, b) => {
      const nameA = a?.storyline?.crewName ?? '';
      const nameB = b?.storyline?.crewName ?? '';
      return nameA.localeCompare(nameB);
    })
    .forEach((mission) => {
      const crewName = mission.storyline?.crewName ?? 'Crew member';
      const member = crewRoster.find((entry) => entry?.id === mission.storyline?.crewId) ?? null;
      const completedSteps = Array.isArray(member?.storyProgress?.completedSteps)
        ? member.storyProgress.completedSteps.length
        : 0;
      const missionLabel = (() => {
        const fullName = mission.name ?? 'Storyline mission';
        if (crewName && fullName.startsWith(`${crewName}: `)) {
          return fullName.slice(crewName.length + 2).trim();
        }
        return fullName;
      })();

      const detailParts = [];
      if (Number.isFinite(mission.payout)) {
        detailParts.push(`Payout ${mission.payout > 0 ? formatCurrency(mission.payout) : 'Support'}`);
      }
      if (Number.isFinite(mission.duration)) {
        detailParts.push(`Duration ${formatSeconds(mission.duration)}`);
      }
      if (Number.isFinite(mission.heat)) {
        detailParts.push(`Heat ${formatHeatValue(mission.heat)}`);
      }
      detailParts.push(`Progress ${completedSteps} step${completedSteps === 1 ? '' : 's'} completed`);

      const item = document.createElement('li');
      item.className = 'mission-storyline__item';
      const summary = detailParts.length
        ? `${crewName} — ${missionLabel} (${detailParts.join(' • ')})`
        : `${crewName} — ${missionLabel}`;
      item.textContent = summary;
      if (mission.description) {
        item.title = mission.description;
      }
      list.appendChild(item);
    });

  if (statusNode) {
    statusNode.textContent = 'Storyline missions refresh automatically after each chapter resolves.';
  }
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

const formatApproximateDays = (value) => {
  if (!Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.max(1, Math.round(value));
  return `~${rounded} day${rounded === 1 ? '' : 's'}`;
};

const computeCrackdownForecast = () => {
  const heatSystem = getHeatSystem();
  if (!heatSystem) {
    return null;
  }

  const tiers = Array.isArray(heatSystem?.tiers) ? [...heatSystem.tiers] : [];
  if (!tiers.length) {
    return null;
  }

  tiers.sort((a, b) => (a?.threshold ?? 0) - (b?.threshold ?? 0));

  const heatValue = Number.isFinite(heatSystem?.state?.heat) ? heatSystem.state.heat : 0;

  let currentTierConfig = typeof heatSystem.getCurrentTierConfig === 'function'
    ? heatSystem.getCurrentTierConfig()
    : null;

  if (!currentTierConfig) {
    currentTierConfig = tiers.reduce((active, tier) => (heatValue >= tier.threshold ? tier : active), tiers[0]);
  }

  let currentTierIndex = tiers.findIndex((tier) => tier?.name === currentTierConfig?.name);
  if (currentTierIndex === -1) {
    currentTierIndex = tiers.reduce(
      (activeIndex, tier, index) => (heatValue >= tier.threshold ? index : activeIndex),
      0,
    );
  }

  const normalizedIndex = Math.max(0, currentTierIndex);
  const currentTier = tiers[normalizedIndex] ?? tiers[0];
  const nextTier = tiers[normalizedIndex + 1] ?? null;
  const previousTier = normalizedIndex > 0 ? tiers[normalizedIndex - 1] : null;

  const safehouseMitigation = typeof heatSystem.getSafehouseHeatReduction === 'function'
    ? heatSystem.getSafehouseHeatReduction()
    : 0;
  const mitigationPerDay = Math.max(0, Number.isFinite(safehouseMitigation) ? safehouseMitigation : 0);

  const passiveBleed = Number.isFinite(heatSystem.decayRate) && Number.isFinite(heatSystem.dayLengthSeconds)
    ? Math.max(0, heatSystem.decayRate * heatSystem.dayLengthSeconds)
    : 0;
  const totalMitigationPerDay = mitigationPerDay + passiveBleed;

  const state = getSharedState();
  const notorietyValue = Number.isFinite(state?.player?.notoriety) ? state.player.notoriety : 0;
  const notorietyProfile = getNotorietyProfile(notorietyValue);
  const notorietyPressurePerDay = Number.isFinite(notorietyProfile?.crackdownPressure)
    ? notorietyProfile.crackdownPressure
    : 0;

  const netPressurePerDay = notorietyPressurePerDay - totalMitigationPerDay;
  const roundedNetPressure = Math.abs(netPressurePerDay) < 0.05
    ? 0
    : Math.round(netPressurePerDay * 10) / 10;

  const currentHeat = Math.max(0, Number.isFinite(heatValue) ? heatValue : 0);
  const nextThreshold = Number.isFinite(nextTier?.threshold) ? nextTier.threshold : null;
  const distanceToNextTier = nextThreshold !== null ? Math.max(0, nextThreshold - currentHeat) : null;
  const currentThreshold = Number.isFinite(currentTier?.threshold) ? currentTier.threshold : 0;
  const distanceToPreviousTier = previousTier
    ? Math.max(0, currentHeat - currentThreshold)
    : null;

  const baselineTimeToNext = nextTier && notorietyPressurePerDay > 0
    ? distanceToNextTier / notorietyPressurePerDay
    : nextTier
      ? Infinity
      : null;

  const netTimeToNext = nextTier && netPressurePerDay > 0
    ? distanceToNextTier / netPressurePerDay
    : nextTier
      ? Infinity
      : null;

  const mitigationDelay = (() => {
    if (!nextTier || !Number.isFinite(baselineTimeToNext)) {
      return 0;
    }
    if (!Number.isFinite(netTimeToNext)) {
      return baselineTimeToNext;
    }
    return Math.max(0, netTimeToNext - baselineTimeToNext);
  })();

  const coolingTime = netPressurePerDay < 0 && distanceToPreviousTier !== null && netPressurePerDay !== 0
    ? distanceToPreviousTier / Math.abs(netPressurePerDay)
    : null;

  const currentTierName = typeof currentTier?.name === 'string'
    ? currentTier.name.toLowerCase()
    : `${currentTier?.label ?? 'calm'}`.toLowerCase();
  const nextTierName = typeof nextTier?.name === 'string'
    ? nextTier.name.toLowerCase()
    : null;
  const previousTierName = typeof previousTier?.name === 'string'
    ? previousTier.name.toLowerCase()
    : null;

  const currentTierPressure = CRACKDOWN_NOTORIETY_PRESSURE[currentTierName] ?? 0;
  const nextTierPressure = nextTierName
    ? CRACKDOWN_NOTORIETY_PRESSURE[nextTierName] ?? currentTierPressure
    : currentTierPressure;
  const notorietySpike = Math.max(0, nextTierPressure - currentTierPressure);

  const nextTierLabel = nextTier ? formatCrackdownTierLabel(nextTier.name).label : null;
  const previousTierLabel = previousTier ? formatCrackdownTierLabel(previousTier.name).label : null;

  const pressureLabel = roundedNetPressure === 0
    ? '±0.0 pressure/day'
    : `${roundedNetPressure > 0 ? '+' : ''}${roundedNetPressure.toFixed(1)} pressure/day`;

  const summary = {
    headline: '',
    detail: '',
    netPressurePerDay: Math.round(netPressurePerDay * 10) / 10,
    notorietyPressurePerDay: Math.round(notorietyPressurePerDay * 10) / 10,
    mitigationPerDay: Math.round(totalMitigationPerDay * 10) / 10,
    nextTier: nextTierName,
    notorietySpike,
  };

  if (nextTier && netPressurePerDay > 0) {
    const approxDaysLabel = formatApproximateDays(netTimeToNext);
    const tierLabelLower = nextTierLabel?.toLowerCase() ?? 'the next crackdown';
    const positivePressureLabel = pressureLabel === '±0.0 pressure/day' ? '+0.0 pressure/day' : pressureLabel;
    summary.headline = `${positivePressureLabel} — ${tierLabelLower} in ${approxDaysLabel ?? '~a few days'}`;

    const detailParts = ['at current notoriety'];
    if (mitigationDelay > 0.5) {
      const pushedDays = Math.max(1, Math.round(mitigationDelay));
      detailParts.push(`safehouse bleed slows escalation by ${pushedDays} day${pushedDays === 1 ? '' : 's'}`);
    }
    if (notorietySpike > 0) {
      detailParts.push(`escalation adds +${notorietySpike} notoriety`);
    }
    summary.detail = detailParts.join('; ');
    return summary;
  }

  if (nextTier && netPressurePerDay <= 0 && notorietyPressurePerDay > 0) {
    const pushedDays = Math.max(1, Math.round(Math.max(mitigationDelay, baselineTimeToNext || 0)));
    const tierLabelLower = nextTierLabel?.toLowerCase() ?? 'the next crackdown';
    summary.headline = `Cooling — safehouse bleed pushes ${tierLabelLower} back ${pushedDays} day${
      pushedDays === 1 ? '' : 's'
    }.`;

    const detailParts = [];
    if (totalMitigationPerDay > 0) {
      detailParts.push(`Net change ${pressureLabel}`);
    }
    if (notorietySpike > 0) {
      detailParts.push(`Escalation would add +${notorietySpike} notoriety`);
    }
    summary.detail = detailParts.join(' — ');
    return summary;
  }

  if (!nextTier && netPressurePerDay < 0) {
    const approxDaysLabel = formatApproximateDays(coolingTime);
    const fallbackLabel = previousTierLabel?.toLowerCase() ?? 'lower tiers';
    const coolingLabel = pressureLabel === '±0.0 pressure/day' ? '-0.0 pressure/day' : pressureLabel;
    summary.headline = `Cooling — ${coolingLabel}`;
    summary.detail = approxDaysLabel
      ? `${fallbackLabel} in ${approxDaysLabel}`
      : 'Crackdown easing toward calmer patrols.';
    return summary;
  }

  if (!nextTier && netPressurePerDay >= 0) {
    const tierLabelLower = formatCrackdownTierLabel(currentTier?.name ?? 'lockdown').label.toLowerCase();
    const holdingLabel = pressureLabel === '±0.0 pressure/day' ? '+0.0 pressure/day' : pressureLabel;
    summary.headline = `${holdingLabel} — holding at ${tierLabelLower}`;
    summary.detail = notorietySpike > 0
      ? `Relief would still dump +${notorietySpike} notoriety when it hits.`
      : 'Maintain mitigation to unlock a lower crackdown.';
    return summary;
  }

  if (netPressurePerDay < 0 && previousTier) {
    const approxDaysLabel = formatApproximateDays(coolingTime);
    const coolingLabel = pressureLabel === '±0.0 pressure/day' ? '-0.0 pressure/day' : pressureLabel;
    summary.headline = `Cooling — ${coolingLabel}`;
    summary.detail = approxDaysLabel
      ? `${formatCrackdownTierLabel(previousTier.name).label.toLowerCase()} in ${approxDaysLabel}`
      : 'Crackdown pressure is draining away.';
    return summary;
  }

  summary.headline = 'Forecast steady — crackdown pressure balanced.';
  summary.detail = totalMitigationPerDay > 0
    ? `Mitigation ${totalMitigationPerDay.toFixed(1)} vs notoriety ${notorietyPressurePerDay.toFixed(1)}.`
    : 'Minimal pressure registered.';

  return summary;
};

const updateMissionStatusText = () => {
  if (!missionControls.statusText) {
    return;
  }

  const missionSystem = getMissionSystem();
  if (!missionSystem) {
    missionControls.statusText.textContent = 'Game initializing…';
    missionControls.lastMissionStatusKey = null;
    return;
  }

  const activeMission = missionSystem.state.activeMission;
  const missionStatusKey = activeMission
    ? `${activeMission.id ?? 'mission'}:${activeMission.status ?? 'active'}`
    : 'none';
  if (missionStatusKey !== missionControls.lastMissionStatusKey) {
    if (missionControls.lastMissionStatusKey !== null) {
      soundboard.playMissionUpdate();
    }
    missionControls.lastMissionStatusKey = missionStatusKey;
  }
  let statusMessage = formatMissionStatusMessage(activeMission);

  const crackdownInfo = describeCrackdownPolicy();
  if (crackdownInfo) {
    const crackdownSentence = `Crackdown: ${crackdownInfo.label} — ${crackdownInfo.impact}`;
    statusMessage = `${statusMessage} ${crackdownSentence}`.trim();
  }

  missionControls.statusText.textContent = statusMessage;
  renderMissionEvents();
  renderMissionLog();
  renderGarageActivityLog();
};

const updateCrackdownIndicator = () => {
  const { crackdownText, crackdownForecast } = missionControls;
  if (!crackdownText && !crackdownForecast) {
    return;
  }

  const crackdownInfo = describeCrackdownPolicy();
  const forecast = computeCrackdownForecast();
  const forecastSummary = forecast
    ? [forecast.headline, forecast.detail].filter(Boolean).join(' ')
    : '';
  missionControls.crackdownForecastSummary = forecastSummary;

  if (!crackdownInfo) {
    if (crackdownText) {
      crackdownText.textContent = 'Crackdown systems calibrating…';
    }
    if (crackdownForecast) {
      crackdownForecast.textContent = 'Forecast — calibrating crackdown telemetry…';
    }
    missionControls.lastCrackdownTierName = null;
    return;
  }

  if (crackdownForecast) {
    crackdownForecast.textContent = forecastSummary
      ? `Forecast — ${forecastSummary}`
      : 'Forecast — monitoring crackdown drift.';
  }

  const tierName = crackdownInfo.tierName ?? crackdownInfo.label ?? 'calm';
  if (tierName !== missionControls.lastCrackdownTierName) {
    if (missionControls.lastCrackdownTierName !== null) {
      soundboard.playCrackdownShift();
    }
    missionControls.lastCrackdownTierName = tierName;
  }

  if (crackdownText) {
    const historyDetail = missionControls.crackdownHistoryDetail?.trim();
    const messageParts = [`Crackdown level: ${crackdownInfo.label} — ${crackdownInfo.impact}`];
    if (forecast?.headline) {
      messageParts.push(forecast.headline);
    }
    if (historyDetail) {
      messageParts.push(historyDetail);
    }
    crackdownText.textContent = messageParts.join(' ');
  }
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

  const latestEntry = logEntries[0] ?? null;
  const latestKey = (() => {
    if (latestEntry?.id) {
      return latestEntry.id;
    }

    if (Number.isFinite(latestEntry?.timestamp)) {
      return `ts-${latestEntry.timestamp}`;
    }

    return null;
  })();
  const previousKey = missionControls.lastMissionLogEntryId ?? null;

  if (latestKey) {
    if (previousKey && previousKey !== latestKey) {
      soundboard.playMissionOutcome(latestEntry?.outcome);
    }
    missionControls.lastMissionLogEntryId = latestKey;
  } else if (previousKey) {
    missionControls.lastMissionLogEntryId = null;
  }

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
    const crewSummary = entry?.crewSummary ?? null;
    if (crewSummary && !summary.includes(crewSummary)) {
      details.push(crewSummary);
    }
    const crackdownEffectsLine = (() => {
      const directSummary = formatCrackdownEffectsSummary(entry?.crackdownEffects);
      if (directSummary) {
        return directSummary;
      }
      const effects = resolveCrackdownEffectsForMission(entry?.missionId ?? null);
      const fallbackSummary = formatCrackdownEffectsSummary(effects);
      return fallbackSummary;
    })();
    if (crackdownEffectsLine) {
      const formattedLine = `Crackdown effects: ${crackdownEffectsLine}`;
      if (!details.some((line) => line.includes(crackdownEffectsLine))) {
        details.push(formattedLine);
      }
    }
    const reconSummary = entry?.reconSummary ?? null;
    if (reconSummary && !summary.includes(reconSummary)) {
      details.push(`Recon: ${reconSummary}`);
    }
    const relationshipEvents = Array.isArray(entry?.events) ? entry.events : [];
    relationshipEvents.forEach((eventEntry) => {
      if (!eventEntry) {
        return;
      }
      const eventLabel = eventEntry.eventLabel ?? 'Event';
      const choiceLabel = eventEntry.choiceLabel ?? 'Choice';
      const highlight = `${eventLabel}: ${choiceLabel}`;
      if (!details.some((line) => line.includes(highlight))) {
        details.push(`Event: ${highlight}`);
      }
      if (eventEntry.effectSummary && !details.some((line) => line.includes(eventEntry.effectSummary))) {
        details.push(`Event impact: ${eventEntry.effectSummary}`);
      }
    });
    const timestamp = Number.isFinite(entry?.timestamp) ? new Date(entry.timestamp) : null;
    const timeLabel = timestamp ? ` @ ${timestamp.toLocaleTimeString([], options)}` : '';
    item.textContent = `${details.join(' — ')}${timeLabel}`;
    logList.appendChild(item);
  });
};

const renderGarageActivityLog = () => {
  const list = missionControls.garageActivityList;
  if (!list) {
    return;
  }

  const missionSystem = getMissionSystem();
  const activityEntries = Array.isArray(missionSystem?.state?.garageActivityLog)
    ? missionSystem.state.garageActivityLog
    : [];

  list.innerHTML = '';

  if (!activityEntries.length) {
    const placeholder = document.createElement('li');
    placeholder.className = 'mission-garage-activity__item mission-garage-activity__item--empty';
    placeholder.textContent = 'No garage activity recorded yet.';
    list.appendChild(placeholder);
    return;
  }

  const options = { hour: '2-digit', minute: '2-digit' };

  activityEntries.slice(0, 6).forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'mission-garage-activity__item';
    const segments = [];
    const summary = typeof entry?.summary === 'string' ? entry.summary.trim() : '';
    if (summary) {
      segments.push(summary);
    }
    const details = Array.isArray(entry?.details) ? entry.details : [];
    details.forEach((detail) => {
      if (typeof detail === 'string' && detail.trim()) {
        segments.push(detail.trim());
      }
    });
    const timestamp = Number.isFinite(entry?.timestamp) ? new Date(entry.timestamp) : null;
    const timeLabel = timestamp ? ` @ ${timestamp.toLocaleTimeString([], options)}` : '';
    item.textContent = `${segments.join(' — ') || 'Garage activity recorded.'}${timeLabel}`;
    list.appendChild(item);
  });
};

const MISSION_EVENT_HISTORY_DISPLAY_LIMIT = 10;

const formatMissionEventClock = (timestamp, baseline) => {
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const baseTime = Number.isFinite(baseline) ? baseline : null;
  const deltaMs = baseTime ? Math.max(0, timestamp - baseTime) : null;
  const millis = Number.isFinite(deltaMs) ? deltaMs : null;

  if (millis === null) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatMissionEventDuration = (milliseconds) => {
  if (!Number.isFinite(milliseconds)) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (remainingHours === 0 && remainingMinutes === 0 && seconds === 0) {
      return `${days}d`;
    }
    const parts = [`${days}d`];
    if (remainingHours) {
      parts.push(`${remainingHours}h`);
    }
    if (remainingMinutes) {
      parts.push(`${remainingMinutes}m`);
    }
    if (seconds) {
      parts.push(`${seconds}s`);
    }
    return parts.join(' ');
  }

  const parts = [`${hours}h`];
  if (remainingMinutes) {
    parts.push(`${remainingMinutes}m`);
  }
  if (seconds) {
    parts.push(`${seconds}s`);
  }
  return parts.join(' ');
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
    missionControls.lastEventPromptId = null;
    const placeholder = document.createElement('li');
    placeholder.textContent = 'No event history yet.';
    eventHistory.appendChild(placeholder);
    return;
  }

  const pending = mission.pendingDecision ?? null;
  if (pending) {
    const pendingId = pending.eventId ?? null;
    if (pendingId && missionControls.lastEventPromptId !== pendingId) {
      missionControls.lastEventPromptId = pendingId;
      soundboard.playEventPrompt();
    } else if (!pendingId) {
      missionControls.lastEventPromptId = null;
    }

    const description = pending.description ? ` — ${pending.description}` : '';
    const progressPercent = Number.isFinite(pending.triggerProgress)
      ? ` (${Math.round(pending.triggerProgress * 100)}%)`
      : '';
    eventPrompt.textContent = `${pending.label}${progressPercent}${description}`.trim();

    if (Array.isArray(pending.badges) && pending.badges.length) {
      const badgeRow = document.createElement('div');
      badgeRow.className = 'mission-event__badges';
      pending.badges.forEach((badge) => {
        const label = formatEventBadgeLabel(badge);
        if (!label) {
          return;
        }
        const badgeEl = document.createElement('span');
        badgeEl.className = 'mission-event__badge';
        if (badge?.type) {
          badgeEl.className += ` mission-event__badge--${badge.type}`;
        }
        badgeEl.textContent = label;
        badgeRow.appendChild(badgeEl);
      });
      if (badgeRow.childNodes.length) {
        eventChoices.appendChild(badgeRow);
      }
    }

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
    missionControls.lastEventPromptId = null;
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

  const missionStartedAt = Number.isFinite(mission?.startedAt) ? mission.startedAt : null;

  historyEntries.slice(-MISSION_EVENT_HISTORY_DISPLAY_LIMIT).forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'mission-events__history-item';
    const progressPercent = Number.isFinite(entry?.progressAt)
      ? `[${Math.round(entry.progressAt * 100)}%] `
      : '';
    const summary = entry?.summary ?? `${entry?.eventLabel ?? 'Event'} resolved.`;
    const effectSummary = typeof entry?.effectSummary === 'string' ? entry.effectSummary.trim() : '';
    const badgeSummary = Array.isArray(entry?.eventBadges) && entry.eventBadges.length
      ? entry.eventBadges
          .map((badge) => formatEventBadgeLabel(badge))
          .filter((label) => label)
          .join(' | ')
      : '';
    const detail = effectSummary ? ` (${effectSummary})` : '';
    const badgeDetail = badgeSummary ? ` [${badgeSummary}]` : '';
    const metaTokens = [];

    if (Number.isFinite(entry?.resolvedAt)) {
      const resolvedLabel = formatMissionEventClock(entry.resolvedAt, missionStartedAt);
      if (resolvedLabel) {
        metaTokens.push(`@ ${resolvedLabel}`);
      }
    }

    if (Number.isFinite(entry?.triggeredAt) && Number.isFinite(entry?.resolvedAt)) {
      const durationLabel = formatMissionEventDuration(entry.resolvedAt - entry.triggeredAt);
      if (durationLabel) {
        metaTokens.push(`Δ ${durationLabel}`);
      }
    }

    const metadata = metaTokens.join(' • ');
    if (metadata) {
      const metaEl = document.createElement('span');
      metaEl.className = 'mission-events__history-meta';
      metaEl.textContent = metadata;
      item.appendChild(metaEl);
    }

    const summaryEl = document.createElement('span');
    summaryEl.className = 'mission-events__history-summary';
    summaryEl.textContent = `${progressPercent}${summary}${badgeDetail}${detail}`;
    item.appendChild(summaryEl);
    const ariaLabel = metadata
      ? `${metadata} — ${summaryEl.textContent}`
      : summaryEl.textContent;
    if (ariaLabel) {
      item.setAttribute('aria-label', ariaLabel);
    }
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
    detailVehicleReward,
    detailCrewImpact,
    detailPlayerImpact,
    detailBreakdown,
    cityIntelDistrictName,
    cityIntelDistrictDescription,
    cityIntelRisk,
    cityIntelInfluence,
    cityIntelIntelLevel,
    cityIntelCrackdown,
    cityIntelPoiName,
    cityIntelPoiDescription,
    cityIntelPoiPerks,
    reconCrewSelect,
    reconDistrictSelect,
    reconDurationSelect,
    reconAssignButton,
    reconStatus,
    reconList,
    eventPrompt,
    eventChoices,
    eventHistory,
    eventStatus,
    debtList,
    debtStatus,
    operationsExpensesValue,
    operationsExpensesStatus,
    operationsPassiveIncomeValue,
    operationsPassiveIncomeStatus,
    operationsPayrollValue,
    operationsPayrollStatus,
    operationsStorageValue,
    operationsStorageStatus,
    operationsCrewFatigueValue,
    operationsCrewFatigueStatus,
    crewList,
    crewChemistryList,
    vehicleList,
    crackdownText,
    crackdownHistoryList,
    logList,
    recruitList,
    safehouseName,
    safehouseTier,
    safehouseEffects,
    safehouseList,
    safehouseUpgradeButton,
    safehouseProjectButton,
    safehouseRushButton,
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
    maintenancePartsStockpile,
    maintenanceCraftingList,
    maintenanceStatus,
    garageActivityList,
    crewStorylineList,
    crewStorylineStatus,
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
    detailVehicleReward,
    detailCrewImpact,
    detailPlayerImpact,
    detailBreakdown,
    cityIntelDistrictName,
    cityIntelDistrictDescription,
    cityIntelRisk,
    cityIntelInfluence,
    cityIntelIntelLevel,
    cityIntelCrackdown,
    cityIntelPoiName,
    cityIntelPoiDescription,
    cityIntelPoiPerks,
    reconCrewSelect,
    reconDistrictSelect,
    reconDurationSelect,
    reconAssignButton,
    reconStatus,
    reconList,
    eventPrompt,
    eventChoices,
    eventHistory,
    eventStatus,
    debtList,
    debtStatus,
    operationsExpensesValue,
    operationsExpensesStatus,
    operationsPassiveIncomeValue,
    operationsPassiveIncomeStatus,
    operationsPayrollValue,
    operationsPayrollStatus,
    operationsStorageValue,
    operationsStorageStatus,
    operationsCrewFatigueValue,
    operationsCrewFatigueStatus,
    crewList,
    crewChemistryList,
    vehicleList,
    crackdownText,
    crackdownHistoryList,
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
    maintenancePartsStockpile,
    maintenanceCraftingList,
    maintenanceStatus,
    garageActivityList,
    crewStorylineList,
    crewStorylineStatus,
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

  const chemistryRoster = Array.isArray(missionSystem?.state?.crew) ? missionSystem.state.crew : [];
  renderCrewChemistrySummary(chemistryRoster, { missionReady: Boolean(missionSystem) });

  updateCrewSelectionOptions();
  updateCrewStorylinePanel();
  updateVehicleSelectionOptions();
  updateRecruitmentOptions();
  updateTrainingOptions();
  updatePlayerDevelopmentPanel();
  updateMaintenancePanel();
  updateDebtPanel();
  updateOperationsDashboard();
  updateReconPanel();

  const isReady = Boolean(missionSystem && economySystem);
  controls.forEach((control) => {
    // Keep select enabled separately to allow mission browsing once ready.
    if (control !== select) {
      control.disabled = !isReady;
    }
  });

  if (startButton) {
    startButton.removeAttribute('title');
  }

  if (!isReady) {
    const descriptionText = missionSystem
      ? 'Select a mission to view its briefing.'
      : 'Mission database initializing…';
    resetMissionDetails(descriptionText);
    resetCityIntelPanel();
    const fallbackDistricts = missionSystem?.state?.city?.districts ?? [];
    const fallbackReconSystem = getReconSystem();
    const fallbackReconAssignments = fallbackReconSystem?.state?.reconAssignments
      ?? missionSystem?.state?.reconAssignments
      ?? [];
    renderCityIntelMap({
      districts: fallbackDistricts,
      highlightedMission: null,
      activeMission: missionSystem?.state?.activeMission ?? null,
      reconAssignments: fallbackReconAssignments,
    });
    const fallbackState = missionSystem?.state ?? getSharedState() ?? {};
    const fallbackHistory = Array.isArray(fallbackState.crackdownHistory)
      ? fallbackState.crackdownHistory
      : [];
    renderCrackdownHistory(fallbackHistory);
    updateMissionStatusText();
    updateCrackdownIndicator();
    updateDebtPanel();
    updateHeatManagementPanel();
    updateMaintenancePanel();
    updateSafehousePanel();
    return;
  }

  renderCrackdownHistory(missionSystem.state.crackdownHistory);
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

    if (startButton && preview?.chemistry?.warning) {
      startButton.title = `Chemistry warning: ${preview.chemistry.warning}`;
    }

    const impactDetails = (() => {
      if (selectedMission.status === 'available') {
        return preview ?? null;
      }
      return selectedMission.assignedCrewImpact ?? null;
    })();

    const chemistryDetails = (() => {
      if (impactDetails?.chemistry) {
        return impactDetails.chemistry;
      }
      if (selectedMission.status === 'available') {
        return preview?.chemistry ?? null;
      }
      return selectedMission.assignedChemistry ?? null;
    })();

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

    const storedCrewSummary = Array.isArray(selectedMission.crewEffectSummary)
      ? selectedMission.crewEffectSummary
      : [];

    const summaryForBreakdown = Array.isArray(impactDetails?.summary)
      ? impactDetails.summary
      : selectedMission.status === 'available'
        ? Array.isArray(preview?.summary)
          ? preview.summary
          : []
        : storedCrewSummary;

    const crewImpactSummary = (() => {
      if (summaryForBreakdown.length) {
        return summaryForBreakdown;
      }

      if (selectedMission.status === 'available') {
        return ['No crew bonuses applied.'];
      }

      if (storedCrewSummary.length) {
        return storedCrewSummary;
      }

      return ['Crew assignments locked in.', 'Vehicle assignment locked in.'];
    })();

    const crewPerkSummary = (() => {
      if (Array.isArray(impactDetails?.perkSummary) && impactDetails.perkSummary.length) {
        return impactDetails.perkSummary;
      }

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
    if (
      chemistryDetails &&
      !crewImpact.some((line) => typeof line === 'string' && line.toLowerCase().includes('chemistry'))
    ) {
      const chemistryLines = [];
      if (chemistryDetails.summary) {
        chemistryLines.push(`Chemistry — ${chemistryDetails.summary}`);
      }
      if (chemistryDetails.highlight) {
        chemistryLines.push(`Chemistry boost — ${chemistryDetails.highlight}`);
      }
      if (chemistryDetails.warning) {
        chemistryLines.push(`⚠️ Chemistry warning — ${chemistryDetails.warning}`);
      }
      if (chemistryLines.length) {
        crewImpact = chemistryLines.concat(crewImpact);
      }
    }
    if (!crewImpact.length) {
      crewImpact = ['Crew impact steady.'];
    }
    if (crewPerkSummary.length) {
      crewImpact = crewImpact.concat(['Perk bonuses triggered:'], crewPerkSummary);
    }

    const playerImpactDetails = (() => {
      if (impactDetails?.playerImpact) {
        return impactDetails.playerImpact;
      }

      if (selectedMission.status === 'available') {
        return preview?.playerImpact ?? null;
      }

      if (Array.isArray(selectedMission.playerEffectSummary)) {
        return { summary: selectedMission.playerEffectSummary };
      }

      return null;
    })();

    const vehicleImpactDetails = impactDetails?.vehicleImpact
      ?? (selectedMission.status !== 'available' ? selectedMission.assignedVehicleImpact ?? null : null);

    let playerImpact = (() => {
      const summary = Array.isArray(playerImpactDetails?.summary)
        ? playerImpactDetails.summary
        : [];

      if (summary.length) {
        return summary;
      }

      return selectedMission.status === 'available'
        ? ['Player influence steady — train to unlock bonuses.']
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

    const vehicleRewardProfile = selectedMission.vehicleReward ?? null;
    const vehicleRewardDetails = (() => {
      if (!vehicleRewardProfile) {
        if (selectedMission.falloutRecovery) {
          return ['Support response — no vehicle reward.'];
        }
        if ((selectedMission.category ?? '').toLowerCase() === 'vehicle-heist') {
          return ['Vehicle reward intel unavailable.'];
        }
        return ['No vehicle reward for this mission.'];
      }

      const storageRequired = Number.isFinite(vehicleRewardProfile.storageRequired)
        ? Math.max(1, Math.round(vehicleRewardProfile.storageRequired))
        : null;
      const baseLabel = vehicleRewardProfile.label ?? 'Vehicle reward';
      const summaryLine = typeof vehicleRewardProfile.summary === 'string'
        ? vehicleRewardProfile.summary
        : '';
      const storageLine = storageRequired === null
        ? 'Storage: requirement unknown — gather more intel.'
        : '';

      const statusLine = (() => {
        const outcome = selectedMission.vehicleRewardOutcome ?? '';
        if (outcome === 'blocked') {
          const state = missionSystem?.state ?? {};
          const capacity = getActiveStorageCapacityFromState(state);
          const garage = Array.isArray(state?.garage) ? state.garage : [];
          if (Number.isFinite(capacity)) {
            return `Status: Blocked — garage capacity ${garage.length}/${capacity}.`;
          }
          return 'Status: Blocked — garage full.';
        }
        if (outcome === 'acquired') {
          return 'Status: Secured in garage.';
        }
        if (selectedMission.status === 'in-progress') {
          return 'Status: Mission in progress — reward pending.';
        }
        if (selectedMission.status === 'awaiting-resolution') {
          return 'Status: Awaiting resolution — reward pending.';
        }
        return 'Status: Secure on mission success.';
      })();

      return {
        label: baseLabel,
        storageRequired,
        storage: storageLine,
        summary: summaryLine,
        status: statusLine,
      };
    })();

    setMissionDetails({
      description: missionDescription,
      payout: missionPayout,
      heat: missionHeat,
      duration: missionDuration,
      success: missionSuccess,
      restriction: restrictionMessage,
      vehicleReward: vehicleRewardDetails,
      crewImpact,
      playerImpact,
      breakdown: buildMissionBreakdown({
        summaryLines: summaryForBreakdown,
        perkSummary: crewPerkSummary,
        vehicleImpact: vehicleImpactDetails,
        playerImpact: playerImpactDetails,
        chemistry: chemistryDetails,
      }),
      crackdownEffects: selectedMission.crackdownEffects ?? null,
    });

    missionForIntel = selectedMission;
  }

  updateCityIntelPanel({
    missionSystem,
    highlightedMission: missionForIntel,
    activeMission,
  });

  updateMissionStatusText();
  updateDebtPanel();
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
    let optionLabel = `${prefix}${mission.name} — ${payoutLabel} (${statusLabel})${restrictionLabel}`;
    const crackdownEffectSummary = formatCrackdownEffectsSummary(mission.crackdownEffects);
    if (crackdownEffectSummary) {
      option.title = `Crackdown effects: ${crackdownEffectSummary}`;
      if (mission.category === 'crackdown-operation') {
        optionLabel = `${optionLabel} — ${crackdownEffectSummary}`;
      }
    } else {
      option.removeAttribute('title');
    }
    option.textContent = optionLabel;
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

const handleRelationshipEventChoice = (event) => {
  const target = event?.target;
  const button = target?.closest ? target.closest('button[data-relationship-choice]') : null;
  if (!button) {
    return;
  }

  const { eventId, choiceId } = button.dataset;
  if (!eventId || !choiceId) {
    return;
  }

  const missionSystem = getMissionSystem();
  const statusNode = missionControls.relationshipEventStatus;

  if (!missionSystem) {
    missionControls.relationshipEventStatusDetail = 'Relationship service offline — unable to resolve event.';
    if (statusNode) {
      statusNode.textContent = missionControls.relationshipEventStatusDetail;
    }
    return;
  }

  const result = missionSystem.resolveRelationshipEvent(eventId, choiceId);
  if (!result) {
    missionControls.relationshipEventStatusDetail = 'Relationship event already handled.';
  } else {
    const detailParts = [result.summary];
    if (Array.isArray(result.details) && result.details.length) {
      detailParts.push(result.details.join(', '));
    }
    missionControls.relationshipEventStatusDetail = detailParts.filter(Boolean).join(' — ');
  }

  if (statusNode) {
    statusNode.textContent = missionControls.relationshipEventStatusDetail ?? '';
  }

  const roster = Array.isArray(missionSystem.state?.crew) ? missionSystem.state.crew : [];
  renderCrewChemistrySummary(roster, { missionReady: Boolean(missionSystem) });
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
  missionControls.lastEventPromptId = null;
  clearMaintenanceStatusDetail();
  setMissionEventStatus('Crew standing by for mid-run updates.');
  soundboard.playMissionStart();
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

  const ensureCrewGearControls = () => {
    const trainingSection = document.querySelector('.mission-training');
    if (!trainingSection) {
      return;
    }

    if (trainingSection.querySelector('#mission-training-gear')) {
      return;
    }

    const statusNode = trainingSection.querySelector('#mission-training-status');
    const insertBeforeNode = statusNode ?? null;

    const gearLabel = document.createElement('label');
    gearLabel.className = 'mission-training__label';
    gearLabel.id = 'mission-training-gear-label';
    gearLabel.setAttribute('for', 'mission-training-gear');
    gearLabel.textContent = 'Gear loadout';

    const gearSelect = document.createElement('select');
    gearSelect.id = 'mission-training-gear';
    gearSelect.name = 'mission-training-gear';

    const vendorStatus = document.createElement('div');
    vendorStatus.id = 'mission-training-gear-vendor-status';
    vendorStatus.className = 'mission-training__vendor-status';
    vendorStatus.textContent = 'Select gear to view vendor stock and unlocks.';

    const actions = document.createElement('div');
    actions.className = 'mission-training__actions';

    const acquireButton = document.createElement('button');
    acquireButton.id = 'mission-training-gear-buy-btn';
    acquireButton.type = 'button';
    acquireButton.textContent = 'Acquire Gear';
    actions.appendChild(acquireButton);

    const equipButton = document.createElement('button');
    equipButton.id = 'mission-training-gear-equip-btn';
    equipButton.type = 'button';
    equipButton.textContent = 'Equip Gear';
    actions.appendChild(equipButton);

    const gearList = document.createElement('ul');
    gearList.id = 'mission-training-gear-list';
    gearList.className = 'mission-details__list mission-training__gear';
    const placeholder = document.createElement('li');
    placeholder.textContent = 'Select a crew member to review their gear.';
    gearList.appendChild(placeholder);

    if (insertBeforeNode) {
      trainingSection.insertBefore(gearLabel, insertBeforeNode);
      trainingSection.insertBefore(gearSelect, insertBeforeNode);
      trainingSection.insertBefore(vendorStatus, insertBeforeNode);
      trainingSection.insertBefore(actions, insertBeforeNode);
      trainingSection.insertBefore(gearList, insertBeforeNode);
    } else {
      trainingSection.append(gearLabel, gearSelect, vendorStatus, actions, gearList);
    }
  };

  const controlPanel = document.querySelector('.control-panel');
  if (controlPanel) {
    let audioControls = controlPanel.querySelector('.mission-audio');
    if (!audioControls) {
      audioControls = document.createElement('div');
      audioControls.className = 'mission-audio';

      const toggle = document.createElement('button');
      toggle.id = 'mission-audio-toggle';
      toggle.type = 'button';
      toggle.className = 'button button--secondary mission-audio__toggle';
      audioControls.appendChild(toggle);

      const referenceNode = controlPanel.firstElementChild ?? controlPanel.firstChild;
      if (referenceNode) {
        controlPanel.insertBefore(audioControls, referenceNode);
      } else {
        controlPanel.appendChild(audioControls);
      }
    }

    const toggleButton = audioControls.querySelector('#mission-audio-toggle');
    if (toggleButton) {
      if (missionControls.audioToggle && missionControls.audioToggle !== toggleButton) {
        missionControls.audioToggle.removeEventListener('click', handleAudioToggle);
      }

      missionControls.audioToggle = toggleButton;
      if (!toggleButton.dataset.audioBound) {
        toggleButton.addEventListener('click', handleAudioToggle);
        toggleButton.dataset.audioBound = 'true';
      }
      updateAudioToggleLabel();
    }

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

      const alertsContainer = document.createElement('div');
      alertsContainer.className = 'mission-safehouse__alerts';

      const alertsTitle = document.createElement('h4');
      alertsTitle.className = 'mission-details__title mission-safehouse__alerts-title';
      alertsTitle.textContent = 'Safehouse Alerts';

      const alertsPrompt = document.createElement('p');
      alertsPrompt.id = 'mission-safehouse-alert-prompt';
      alertsPrompt.className = 'mission-safehouse__alerts-prompt';
      alertsPrompt.textContent = 'No safehouse telemetry available yet.';

      const alertsList = document.createElement('ul');
      alertsList.id = 'mission-safehouse-alerts';
      alertsList.className = 'mission-details__list mission-safehouse__alerts-list';
      const alertsPlaceholder = document.createElement('li');
      alertsPlaceholder.className = 'mission-safehouse__alerts-item mission-safehouse__alerts-item--empty';
      alertsPlaceholder.textContent = 'Alerts will appear here when the safehouse reacts to city pressure.';
      alertsList.appendChild(alertsPlaceholder);

      const alertsStatus = document.createElement('p');
      alertsStatus.id = 'mission-safehouse-alert-status';
      alertsStatus.className = 'control-panel__status mission-safehouse__alerts-status';
      alertsStatus.setAttribute('role', 'status');
      alertsStatus.setAttribute('aria-live', 'polite');

      alertsContainer.append(alertsTitle, alertsPrompt, alertsList, alertsStatus);

      const projectsContainer = document.createElement('div');
      projectsContainer.className = 'mission-safehouse__projects';

      const projectsTitle = document.createElement('h4');
      projectsTitle.className = 'mission-details__title mission-safehouse__projects-title';
      projectsTitle.textContent = 'Facility Projects';

      const projectsList = document.createElement('div');
      projectsList.id = 'mission-safehouse-projects';
      projectsList.className = 'mission-safehouse__projects-list';
      const projectsPlaceholder = document.createElement('p');
      projectsPlaceholder.className = 'mission-safehouse__projects-empty';
      projectsPlaceholder.textContent = 'Project manifest syncing…';
      projectsList.appendChild(projectsPlaceholder);

      projectsContainer.append(projectsTitle, projectsList);

      const projectButton = document.createElement('button');
      projectButton.id = 'mission-safehouse-project-btn';
      projectButton.type = 'button';
      projectButton.className = 'button button--secondary mission-safehouse__project-btn';
      projectButton.textContent = 'Fund Project';
      projectButton.disabled = true;

      const rushButton = document.createElement('button');
      rushButton.id = 'mission-safehouse-rush-btn';
      rushButton.type = 'button';
      rushButton.className = 'button button--secondary mission-safehouse__rush-btn';
      rushButton.textContent = 'Rush Project';
      rushButton.disabled = true;

      const upgradeButton = document.createElement('button');
      upgradeButton.id = 'mission-safehouse-upgrade-btn';
      upgradeButton.type = 'button';
      upgradeButton.textContent = 'Upgrade Safehouse';

      const status = document.createElement('p');
      status.id = 'mission-safehouse-status';
      status.className = 'control-panel__status mission-safehouse__status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');

      safehouseSection.append(
        title,
        hint,
        grid,
        catalog,
        alertsContainer,
        projectsContainer,
        projectButton,
        rushButton,
        upgradeButton,
        status,
      );

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
    missionControls.safehouseProjects = safehouseSection.querySelector('#mission-safehouse-projects');
    missionControls.safehouseProjectButton = safehouseSection.querySelector('#mission-safehouse-project-btn');
    missionControls.safehouseRushButton = safehouseSection.querySelector('#mission-safehouse-rush-btn');
    missionControls.safehouseUpgradeButton = safehouseSection.querySelector('#mission-safehouse-upgrade-btn');
    missionControls.safehouseStatus = safehouseSection.querySelector('#mission-safehouse-status');
    missionControls.safehouseAlertPrompt = safehouseSection.querySelector('#mission-safehouse-alert-prompt');
    missionControls.safehouseAlertsList = safehouseSection.querySelector('#mission-safehouse-alerts');
    missionControls.safehouseAlertStatus = safehouseSection.querySelector('#mission-safehouse-alert-status');
  }

  ensureCrewAttributeControls();
  ensureCrewGearControls();

  missionControls.select = document.getElementById('mission-select');
  missionControls.startButton = document.getElementById('start-mission-btn');
  missionControls.statusText = document.getElementById('mission-status-text');
  missionControls.detailDescription = document.getElementById('mission-detail-description');
  missionControls.detailPayout = document.getElementById('mission-detail-payout');
  missionControls.detailHeat = document.getElementById('mission-detail-heat');
  missionControls.detailDuration = document.getElementById('mission-detail-duration');
  missionControls.detailSuccess = document.getElementById('mission-detail-success');
  missionControls.detailRestriction = document.getElementById('mission-detail-restriction');
  missionControls.detailVehicleReward = document.getElementById('mission-detail-vehicle-reward');
  missionControls.detailCrewImpact = document.getElementById('mission-detail-crew-impact');
  missionControls.detailPlayerImpact = document.getElementById('mission-detail-player-impact');
  missionControls.detailBreakdown = document.getElementById('mission-detail-breakdown');
  missionControls.cityIntelSection = document.querySelector('.mission-city-intel');
  missionControls.cityIntelDistrictName = document.getElementById('mission-city-intel-district-name');
  missionControls.cityIntelDistrictDescription = document.getElementById(
    'mission-city-intel-district-description',
  );
  missionControls.cityIntelRisk = document.getElementById('mission-city-intel-risk');
  missionControls.cityIntelInfluence = document.getElementById('mission-city-intel-influence');
  missionControls.cityIntelIntelLevel = document.getElementById('mission-city-intel-intel');
  missionControls.cityIntelCrackdown = document.getElementById('mission-city-intel-crackdown');
  missionControls.cityIntelPoiName = document.getElementById('mission-city-intel-poi-name');
  missionControls.cityIntelPoiDescription = document.getElementById('mission-city-intel-poi-description');
  missionControls.cityIntelPoiPerks = document.getElementById('mission-city-intel-poi-perks');
  missionControls.campaignSection = document.querySelector('.mission-campaign');
  missionControls.campaignStageLabel = document.getElementById('mission-campaign-stage');
  missionControls.campaignReadiness = document.getElementById('mission-campaign-readiness');
  missionControls.campaignRequirementsList = document.getElementById('mission-campaign-requirements');
  missionControls.campaignReward = document.getElementById('mission-campaign-reward');
  missionControls.reconCrewSelect = document.getElementById('mission-recon-crew');
  missionControls.reconDistrictSelect = document.getElementById('mission-recon-district');
  missionControls.reconDurationSelect = document.getElementById('mission-recon-duration');
  missionControls.reconApproachSelect = document.getElementById('mission-recon-approach');
  missionControls.reconAssignButton = document.getElementById('mission-recon-deploy-btn');
  missionControls.reconStatus = document.getElementById('mission-recon-status');
  missionControls.reconList = document.getElementById('mission-recon-list');
  missionControls.operationsSection = document.querySelector('.mission-operations');
  missionControls.operationsExpensesValue = document.getElementById('mission-ops-expenses');
  missionControls.operationsExpensesStatus = document.getElementById('mission-ops-expenses-status');
  missionControls.operationsPassiveIncomeValue = document.getElementById('mission-ops-passive-income');
  missionControls.operationsPassiveIncomeStatus = document.getElementById('mission-ops-passive-income-status');
  missionControls.operationsPayrollValue = document.getElementById('mission-ops-payroll');
  missionControls.operationsPayrollStatus = document.getElementById('mission-ops-payroll-status');
  missionControls.operationsStorageValue = document.getElementById('mission-ops-storage');
  missionControls.operationsStorageStatus = document.getElementById('mission-ops-storage-status');
  missionControls.operationsCrewFatigueValue = document.getElementById('mission-ops-fatigue');
  missionControls.operationsCrewFatigueStatus = document.getElementById('mission-ops-fatigue-status');
  missionControls.operationsHistoryContainer = document.querySelector('.mission-operations__history');
  missionControls.operationsHistoryList = document.getElementById('mission-ops-history');
  missionControls.operationsHistoryEmpty = document.getElementById('mission-ops-history-empty');
  missionControls.operationsHistoryStatus = document.getElementById('mission-ops-history-status');
  missionControls.cityIntelCanvas = document.getElementById('mission-city-intel-map');
  if (missionControls.cityIntelCanvas) {
    missionControls.cityIntelCanvasContext = missionControls.cityIntelCanvas.getContext('2d');
    missionControls.cityIntelCanvas.tabIndex = 0;
    missionControls.cityIntelCanvas.setAttribute('role', 'listbox');
    missionControls.cityIntelCanvas.setAttribute('aria-label', CITY_INTEL_CANVAS_ARIA_LABEL);
    missionControls.cityIntelCanvas.setAttribute('aria-describedby', 'mission-city-intel-district-name');
    missionControls.cityIntelCanvas.addEventListener('pointermove', handleCityIntelCanvasPointerMove);
    missionControls.cityIntelCanvas.addEventListener('pointerleave', handleCityIntelCanvasPointerLeave);
    missionControls.cityIntelCanvas.addEventListener('pointerdown', handleCityIntelCanvasPointerDown);
    missionControls.cityIntelCanvas.addEventListener('focus', handleCityIntelCanvasFocus);
    missionControls.cityIntelCanvas.addEventListener('blur', handleCityIntelCanvasBlur);
    missionControls.cityIntelCanvas.addEventListener('keydown', handleCityIntelCanvasKeyDown);
  }
  missionControls.eventPrompt = document.getElementById('mission-event-prompt');
  missionControls.eventChoices = document.getElementById('mission-event-choices');
  missionControls.eventHistory = document.getElementById('mission-event-history');
  missionControls.eventStatus = document.getElementById('mission-event-status');
  missionControls.debtList = document.getElementById('mission-debt-list');
  missionControls.debtStatus = document.getElementById('mission-debt-status');
  missionControls.crewList = document.getElementById('mission-crew-list');
  missionControls.crewChemistryList = document.getElementById('mission-crew-chemistry');
  missionControls.relationshipEventList = document.getElementById('mission-crew-relationship-events');
  missionControls.relationshipEventStatus = document.getElementById('mission-crew-relationship-status');
  if (missionControls.relationshipEventList) {
    missionControls.relationshipEventList.addEventListener('click', handleRelationshipEventChoice);
  }
  missionControls.vehicleList = document.getElementById('mission-vehicle-list');
  missionControls.crackdownText = document.getElementById('mission-crackdown-text');
  missionControls.crackdownForecast = document.getElementById('mission-crackdown-forecast');
  missionControls.crackdownHistoryList = document.getElementById('mission-crackdown-history-list');
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
  missionControls.trainingGearSelect = document.getElementById('mission-training-gear');
  missionControls.trainingGearAcquireButton = document.getElementById('mission-training-gear-buy-btn');
  missionControls.trainingGearEquipButton = document.getElementById('mission-training-gear-equip-btn');
  missionControls.trainingGearVendorStatus = document.getElementById('mission-training-gear-vendor-status');
  missionControls.trainingGearList = document.getElementById('mission-training-gear-list');
  missionControls.trainingRestCrewSelect = document.getElementById('mission-training-rest-crew');
  missionControls.trainingRestDurationSelect = document.getElementById('mission-training-rest-duration');
  missionControls.trainingRestButton = document.getElementById('mission-training-rest-btn');
  missionControls.trainingStatus = document.getElementById('mission-training-status');
  missionControls.crewStorylineSection = document.querySelector('.mission-storyline');
  missionControls.crewStorylineList = document.getElementById('mission-storyline-list');
  missionControls.crewStorylineStatus = document.getElementById('mission-storyline-status');
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
  missionControls.maintenancePartsStockpile = document.getElementById('mission-maintenance-parts');
  missionControls.maintenanceCraftingList = document.getElementById('mission-maintenance-crafting-list');
  missionControls.maintenanceStatus = document.getElementById('mission-maintenance-status');
  missionControls.garageActivityList = document.getElementById('mission-garage-activity-list');
  missionControls.heatActionContainer = document.getElementById('mission-heat-actions');
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
    cityIntelInfluence,
    cityIntelIntelLevel,
    cityIntelCrackdown,
    cityIntelPoiName,
    cityIntelPoiDescription,
    cityIntelPoiPerks,
    eventPrompt,
    eventChoices,
    eventHistory,
    eventStatus,
    debtList,
    debtStatus,
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
    missionControls.trainingGearSelect,
    missionControls.trainingGearAcquireButton,
    missionControls.trainingGearEquipButton,
    missionControls.trainingGearList,
    trainingRestCrewSelect,
    trainingRestDurationSelect,
    trainingRestButton,
    trainingStatus,
    crewStorylineList,
    crewStorylineStatus,
    playerStatsList,
    playerSkillSelect,
    playerSkillButton,
    playerGearSelect,
    playerGearButton,
    playerStatus,
    maintenanceRepairButton,
    maintenanceHeatButton,
    maintenanceStatus,
    heatActionContainer,
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
    cityIntelInfluence,
    cityIntelIntelLevel,
    cityIntelCrackdown,
    cityIntelPoiName,
    cityIntelPoiDescription,
    cityIntelPoiPerks,
    missionControls.reconCrewSelect,
    missionControls.reconDistrictSelect,
    missionControls.reconDurationSelect,
    missionControls.reconApproachSelect,
    missionControls.reconAssignButton,
    missionControls.reconStatus,
    missionControls.reconList,
    crewList,
    vehicleList,
    crackdownText,
    logList,
    recruitList,
    recruitStatus,
    debtList,
    debtStatus,
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
    heatActionContainer,
    heatStatus,
  ].every(Boolean);

  if (!controlsReady) {
    return;
  }

  startButton.addEventListener('click', handleMissionStart);
  missionControls.reconCrewSelect.addEventListener('change', handleReconCrewSelectionChange);
  missionControls.reconDistrictSelect.addEventListener('change', updateReconPanel);
  missionControls.reconDurationSelect.addEventListener('change', updateReconPanel);
  missionControls.reconApproachSelect.addEventListener('change', updateReconPanel);
  missionControls.reconAssignButton.addEventListener('click', handleReconSchedule);
  missionControls.reconList.addEventListener('click', handleReconListClick);
  select.addEventListener('change', () => {
    missionControls.selectedCrewIds = [];
    missionControls.selectedVehicleId = null;
    clearMaintenanceStatusDetail();
    updateMissionControls();
  });
  missionControls.eventChoices?.addEventListener('click', handleMissionEventChoice);
  missionControls.debtList?.addEventListener('click', handleDebtListClick);
  trainingCrewSelect.addEventListener('change', updateTrainingOptions);
  trainingSpecialtySelect.addEventListener('change', updateTrainingOptions);
  trainingAttributeSelect?.addEventListener('change', updateTrainingOptions);
  missionControls.trainingGearSelect?.addEventListener('change', updateTrainingOptions);
  trainingRestCrewSelect?.addEventListener('change', updateTrainingOptions);
  trainingRestDurationSelect?.addEventListener('change', updateTrainingOptions);
  playerSkillSelect.addEventListener('change', updatePlayerDevelopmentPanel);
  playerGearSelect.addEventListener('change', updatePlayerDevelopmentPanel);
  trainingLoyaltyButton.addEventListener('click', handleLoyaltyTraining);
  trainingSpecialtyButton.addEventListener('click', handleSpecialtyTraining);
  trainingAttributeButton?.addEventListener('click', handleAttributeTraining);
  missionControls.trainingGearAcquireButton?.addEventListener('click', handleCrewGearAcquisition);
  missionControls.trainingGearEquipButton?.addEventListener('click', handleCrewGearToggle);
  trainingRestButton?.addEventListener('click', handleCrewRestScheduling);
  playerSkillButton.addEventListener('click', handlePlayerSkillTraining);
  playerGearButton.addEventListener('click', handlePlayerGearAcquisition);
  maintenanceRepairButton.addEventListener('click', handleMaintenanceRepair);
  maintenanceHeatButton.addEventListener('click', handleMaintenanceHeat);
  maintenanceUpgradeButton?.addEventListener('click', handleMaintenanceUpgrade);
  maintenanceUpgradeSelect?.addEventListener('change', updateMaintenancePanel);
  maintenanceCraftingList?.addEventListener('click', handleMaintenanceCraftingClick);
  initializeHeatActionButtons();
  missionControls.safehouseProjects?.addEventListener('click', handleSafehouseProjectListClick);
  missionControls.safehouseProjects?.addEventListener('keydown', handleSafehouseProjectListKeydown);
  missionControls.safehouseProjectButton?.addEventListener('click', handleSafehouseProjectFunding);
  missionControls.safehouseRushButton?.addEventListener('click', handleSafehouseProjectRush);
  missionControls.safehouseUpgradeButton?.addEventListener('click', handleSafehouseUpgrade);
  missionControls.safehouseList?.addEventListener('click', handleSafehouseListClick);
  missionControls.safehouseAlertsList?.addEventListener('click', handleSafehouseAlertChoice);

  setRecruitStatus('');
  setTrainingStatus('');
  missionControls.reconSelectedCrewIds = [];
  missionControls.lastReconCompletionKey = null;
  setReconStatus('');
  setPlayerStatus('');
  setMissionEventStatus('');
  missionControls.debtStatusDetail = '';
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

  const onboardingSerializer = createGameSerializer({ key: 'osr.car-thief.onboarding.v1' });
  onboardingTour = createOnboardingTour({ missionControls, serializer: onboardingSerializer });

  const tutorialToggle = document.getElementById('show-tutorial-btn');
  if (tutorialToggle) {
    tutorialToggle.addEventListener('click', () => {
      onboardingTour?.start({ force: true });
    });
  }

  window.requestAnimationFrame(() => {
    onboardingTour?.start();
  });

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
