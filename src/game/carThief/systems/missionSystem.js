import { Vehicle, VEHICLE_MOD_CATALOG, aggregateVehicleModBonuses } from '../entities/vehicle.js';
import {
  CREW_TRAIT_KEYS,
  CREW_FATIGUE_CONFIG,
  CREW_RELATIONSHIP_CONFIG,
  clampAffinityScore,
  computeRelationshipMultiplier,
} from '../entities/crewMember.js';
import { HeatSystem } from './heatSystem.js';
import { generateContractsFromDistricts, generateFalloutContracts } from './contractFactory.js';
import { buildMissionEventDeck } from './missionEvents.js';
import { buildSafehouseIncursionEvents } from './safehouseIncursionEvents.js';
import { getAvailableCrewStorylineMissions, applyCrewStorylineOutcome } from './crewStorylines.js';
import { getCrackdownOperationTemplates } from './crackdownOperations.js';
import {
  SafehouseCollection,
  getActiveStorageCapacityFromState,
  getActiveSafehouseFromState,
} from '../world/safehouse.js';
import { computeSafehouseFacilityBonuses } from '../world/safehouseEffects.js';
import { getCrewPerkEffect } from './crewPerks.js';
import { getCrewGearEffect } from './crewGear.js';
import { getVehicleModRecipe, assessVehicleModAffordability } from './vehicleModRecipes.js';
import { createCrewRelationshipService } from './crewRelationships.js';
import {
  applyInfiltrationChoice,
  createInfiltrationSequence,
  getNextInfiltrationStep,
  summarizeInfiltrationEffects,
} from './missionInfiltration.js';
import { createSafehouseDefenseManager } from './safehouseDefense.js';

const coerceFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) {
    return min;
  }

  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
};

const normalizeTextArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
};

const sanitizeFacilityDowntime = (
  downtime,
  { facilityId = null, label = null, currentDay = null } = {},
) => {
  if (!downtime || typeof downtime !== 'object') {
    return null;
  }

  const resolvedFacilityId =
    typeof downtime.facilityId === 'string' && downtime.facilityId.trim()
      ? downtime.facilityId.trim()
      : typeof facilityId === 'string' && facilityId.trim()
        ? facilityId.trim()
        : null;

  if (!resolvedFacilityId) {
    return null;
  }

  const penalties = normalizeTextArray(downtime.penalties ?? downtime.impact ?? downtime.effects);
  const penaltySummary =
    typeof downtime.penaltySummary === 'string' && downtime.penaltySummary.trim()
      ? downtime.penaltySummary.trim()
      : null;
  if (penaltySummary && !penalties.length) {
    penalties.push(penaltySummary);
  }

  const durationDays = Number.isFinite(downtime.durationDays)
    ? Math.max(0, Math.round(downtime.durationDays))
    : Number.isFinite(downtime.cooldownDays)
      ? Math.max(0, Math.round(downtime.cooldownDays))
      : null;
  const cooldownDays = Number.isFinite(downtime.cooldownDays)
    ? Math.max(0, Math.round(downtime.cooldownDays))
    : durationDays;

  let cooldownEndsOnDay = Number.isFinite(downtime.cooldownEndsOnDay)
    ? Math.round(downtime.cooldownEndsOnDay)
    : null;
  if (cooldownEndsOnDay === null && Number.isFinite(currentDay) && cooldownDays !== null) {
    cooldownEndsOnDay = currentDay + cooldownDays;
  }

  const startedAt = Number.isFinite(downtime.startedAt) ? downtime.startedAt : null;
  const summary =
    typeof downtime.summary === 'string' && downtime.summary.trim() ? downtime.summary.trim() : null;
  const resolvedLabel =
    typeof downtime.label === 'string' && downtime.label.trim()
      ? downtime.label.trim()
      : typeof label === 'string' && label.trim()
        ? label.trim()
        : null;
  const alertId =
    typeof downtime.alertId === 'string' && downtime.alertId.trim() ? downtime.alertId.trim() : null;

  return {
    facilityId: resolvedFacilityId,
    label: resolvedLabel,
    summary,
    penalties,
    penaltySummary,
    durationDays,
    cooldownDays,
    cooldownEndsOnDay,
    startedAt,
    alertId,
  };
};

const REQUIRED_TEMPLATE_FIELDS = ['id', 'name'];

const RISK_TIER_ORDER = ['low', 'moderate', 'high'];

const NOTORIETY_LEVELS = [
  {
    id: 'unknown',
    label: 'Unknown',
    min: 0,
    max: 14,
    payoutBonus: 0,
    heatMultiplier: 1,
    difficultyDelta: 0,
    riskShift: 0,
    crackdownPressure: 0,
    summary: 'Fixers barely know your name — contracts stay routine.',
  },
  {
    id: 'watched',
    label: 'Watched',
    min: 15,
    max: 29,
    payoutBonus: 0.05,
    heatMultiplier: 1.1,
    difficultyDelta: 0,
    riskShift: 0,
    crackdownPressure: 0.4,
    summary: 'Word travels. Expect ~5% richer scores but more patrol interest.',
  },
  {
    id: 'notorious',
    label: 'Notorious',
    min: 30,
    max: 49,
    payoutBonus: 0.12,
    heatMultiplier: 1.25,
    difficultyDelta: 1,
    riskShift: 1,
    crackdownPressure: 0.8,
    summary: 'Crews line up, but the city responds hard — payouts climb while risk escalates.',
  },
  {
    id: 'legendary',
    label: 'Legendary',
    min: 50,
    max: Infinity,
    payoutBonus: 0.2,
    heatMultiplier: 1.5,
    difficultyDelta: 2,
    riskShift: 1,
    crackdownPressure: 1.2,
    summary: 'Every move is headline news — massive paydays, crushing pressure.',
  },
];

const CRACKDOWN_NOTORIETY_PRESSURE = {
  calm: 0,
  alert: 4,
  lockdown: 8,
};

const normalizeNotoriety = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, numeric);
};

const getNotorietyProfile = (value) => {
  const notoriety = normalizeNotoriety(value);
  const profile = NOTORIETY_LEVELS.find((level) => notoriety >= level.min && notoriety <= level.max);
  if (profile) {
    return { ...profile, notoriety };
  }

  const last = NOTORIETY_LEVELS[NOTORIETY_LEVELS.length - 1];
  return { ...last, notoriety };
};

const getNextNotorietyProfile = (value) => {
  const notoriety = normalizeNotoriety(value);
  const index = NOTORIETY_LEVELS.findIndex((level) => notoriety >= level.min && notoriety <= level.max);
  if (index === -1) {
    return null;
  }

  return NOTORIETY_LEVELS[index + 1] ?? null;
};

const shiftRiskTier = (baseTier, shift = 0) => {
  const baseIndex = RISK_TIER_ORDER.indexOf(baseTier);
  const normalizedBase = baseIndex === -1 ? 0 : baseIndex;
  const offset = Number.isFinite(shift) ? Math.trunc(shift) : 0;
  const targetIndex = clamp(normalizedBase + offset, 0, RISK_TIER_ORDER.length - 1);
  return RISK_TIER_ORDER[targetIndex];
};

const clampDistrictMetric = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  if (numeric < 0) {
    return 0;
  }
  if (numeric > 100) {
    return 100;
  }
  return Math.round(numeric);
};

const cloneDistrictIntel = (intel) => {
  if (!intel || typeof intel !== 'object') {
    return null;
  }

  const influence = clampDistrictMetric(intel.influence);
  const intelLevel = clampDistrictMetric(intel.intelLevel);
  const crackdownPressure = clampDistrictMetric(intel.crackdownPressure);

  const snapshot = {};
  if (influence !== null) {
    snapshot.influence = influence;
  }
  if (intelLevel !== null) {
    snapshot.intelLevel = intelLevel;
  }
  if (crackdownPressure !== null) {
    snapshot.crackdownPressure = crackdownPressure;
  }

  return Object.keys(snapshot).length ? snapshot : null;
};

const cloneVehicleBlueprint = (blueprint) => {
  if (!blueprint || typeof blueprint !== 'object') {
    return null;
  }

  const sanitized = {};
  const copyIfDefined = (key) => {
    if (blueprint[key] !== undefined) {
      sanitized[key] = blueprint[key];
    }
  };

  copyIfDefined('model');
  copyIfDefined('topSpeed');
  copyIfDefined('acceleration');
  copyIfDefined('handling');
  copyIfDefined('heat');

  if (Array.isArray(blueprint.installedMods)) {
    sanitized.installedMods = blueprint.installedMods.slice();
  }

  return Object.keys(sanitized).length ? sanitized : null;
};

const cloneVehicleRewardProfile = (reward) => {
  if (!reward || typeof reward !== 'object') {
    return null;
  }

  const storageRequired = Number.isFinite(reward.storageRequired) && reward.storageRequired > 0
    ? Math.max(1, Math.round(reward.storageRequired))
    : 1;
  const label = typeof reward.label === 'string' ? reward.label.trim() : '';
  const summary = typeof reward.summary === 'string' ? reward.summary.trim() : '';
  const blueprintSource =
    typeof reward.vehicleBlueprint === 'object' && reward.vehicleBlueprint !== null
      ? reward.vehicleBlueprint
      : typeof reward.vehicle === 'object' && reward.vehicle !== null
        ? reward.vehicle
        : reward;

  const vehicleBlueprint = cloneVehicleBlueprint(blueprintSource);

  const profile = {
    storageRequired,
  };

  if (label) {
    profile.label = label;
  }

  if (summary) {
    profile.summary = summary;
  }

  if (vehicleBlueprint) {
    profile.vehicleBlueprint = vehicleBlueprint;
    if (!profile.label && typeof vehicleBlueprint.model === 'string') {
      profile.label = vehicleBlueprint.model;
    }
  }

  return profile;
};

const applyNotorietyModifiersToMission = (missionValues, notorietyProfile, crackdownPolicy) => {
  if (!notorietyProfile) {
    return {
      ...missionValues,
      notorietyLevelId: null,
      notorietyModifiers: null,
    };
  }

  const payoutBonus = Number.isFinite(notorietyProfile.payoutBonus) ? notorietyProfile.payoutBonus : 0;
  const heatMultiplier = Number.isFinite(notorietyProfile.heatMultiplier)
    ? notorietyProfile.heatMultiplier
    : 1;
  const difficultyDelta = Number.isFinite(notorietyProfile.difficultyDelta)
    ? notorietyProfile.difficultyDelta
    : 0;
  const riskShift = Number.isFinite(notorietyProfile.riskShift) ? notorietyProfile.riskShift : 0;
  const crackdownPressure = Number.isFinite(notorietyProfile.crackdownPressure)
    ? notorietyProfile.crackdownPressure
    : 0;

  const policyMultiplier = Number.isFinite(crackdownPolicy?.failureHeatMultiplier)
    ? crackdownPolicy.failureHeatMultiplier
    : 1;

  const basePayout = Math.max(0, Number(missionValues.payout) || 0);
  const baseHeat = Math.max(1, Math.round(Number(missionValues.heat) || 1));
  const baseDifficulty = Math.max(1, Math.round(Number(missionValues.difficulty) || 1));
  const baseRiskTier = missionValues.riskTier ?? 'low';

  const adjustedPayout = Math.round(basePayout * (1 + payoutBonus));
  const notorietyHeat = Math.round(baseHeat * heatMultiplier + crackdownPressure * policyMultiplier);
  const adjustedHeat = Math.max(1, notorietyHeat);
  const adjustedDifficulty = Math.max(1, Math.round(baseDifficulty + difficultyDelta));
  const adjustedRiskTier = shiftRiskTier(baseRiskTier, riskShift);

  return {
    payout: adjustedPayout,
    heat: adjustedHeat,
    difficulty: adjustedDifficulty,
    riskTier: adjustedRiskTier,
    notorietyLevelId: notorietyProfile.id,
    notorietyModifiers: {
      payoutBonus,
      heatMultiplier,
      difficultyDelta,
      riskShift,
      crackdownPressure,
    },
  };
};

const computeMissionNotorietyDelta = (mission, outcome, crackdownPolicy) => {
  if (!mission) {
    return 0;
  }

  const baseHeat = Number.isFinite(mission.baseHeat)
    ? Math.max(0, mission.baseHeat)
    : Math.max(0, Number(mission.heat) || 0);
  const appliedHeat = Math.max(0, Number(mission.heat) || baseHeat);
  const difficulty = Math.max(0, Number(mission.difficulty) || 0);
  const payout = Math.max(0, Number(mission.payout) || 0);
  const crackdownMultiplier = Number.isFinite(crackdownPolicy?.failureHeatMultiplier)
    ? crackdownPolicy.failureHeatMultiplier
    : 1;

  if (mission.category === 'crackdown-operation' && outcome === 'success') {
    return -Math.max(1, Math.round(baseHeat * 1.5));
  }

  const payoutWeight = Math.log10(payout + 10);
  const baseScore = appliedHeat * 1.2 + difficulty * 0.8 + payoutWeight;

  if (outcome === 'success') {
    return Math.round(baseScore * 10) / 10;
  }

  if (outcome === 'failure') {
    const amplified = baseScore * (0.75 + crackdownMultiplier * 0.4);
    return Math.round(amplified * 10) / 10;
  }

  return 0;
};

const CREW_TRAIT_EFFECTS = {
  stealth: {
    durationReduction: 0.01,
    heatReduction: 0.055,
    successBonus: 0.012,
  },
  tech: {
    durationReduction: 0.006,
    payoutBonus: 0.018,
    successBonus: 0.028,
  },
  driving: {
    durationReduction: 0.045,
    successBonus: 0.01,
    heatReduction: 0.01,
  },
  tactics: {
    durationReduction: 0.01,
    successBonus: 0.022,
    heatReduction: 0.02,
  },
  charisma: {
    payoutBonus: 0.024,
    heatReduction: 0.012,
    successBonus: 0.008,
  },
  muscle: {
    payoutBonus: 0.022,
    successBonus: 0.012,
    heatIncrease: 0.006,
  },
};

const CREW_SPECIALTY_SYNERGIES = {
  wheelman: { driving: 1.6, tactics: 1.2, stealth: 0.9 },
  hacker: { tech: 1.6, stealth: 1.2, charisma: 0.8 },
  mechanic: { tech: 1.4, muscle: 1.2, tactics: 1.1 },
  face: { charisma: 1.7, tech: 0.9, tactics: 1.1 },
  infiltrator: { stealth: 1.7, tech: 1.3, tactics: 1.2 },
  tactician: { tactics: 1.8, charisma: 1.2, stealth: 1.1 },
  spotter: { tactics: 1.5, stealth: 1.3, tech: 1.3 },
};

const getCrewTraitLevel = (member, traitKey) => {
  const traits = member?.traits ?? {};
  const rawValue = Number(traits[traitKey]);
  if (!Number.isFinite(rawValue)) {
    return 0;
  }

  return Math.max(0, rawValue);
};

const buildCrewTraitSupport = (crewMembers = []) => {
  const support = {};
  crewMembers.forEach((member) => {
    if (!member) {
      return;
    }
    CREW_TRAIT_KEYS.forEach((traitKey) => {
      if (getCrewTraitLevel(member, traitKey) >= 3) {
        if (!Array.isArray(support[traitKey])) {
          support[traitKey] = [];
        }
        support[traitKey].push(member);
      }
    });
  });
  return support;
};

const evaluateCrewChemistry = (crewMembers = []) => {
  const members = crewMembers.filter(Boolean);
  const getMemberId = (member) => {
    if (!member) {
      return null;
    }
    const rawId = member.id;
    if (rawId === undefined || rawId === null) {
      return null;
    }
    const normalized = String(rawId).trim();
    return normalized || null;
  };

  if (!members.length) {
    return {
      memberMultipliers: new Map(),
      memberDetails: [],
      pairSummaries: [],
      teamAverageAffinity: 0,
      teamMultiplier: 1,
      summary: null,
      highlight: null,
      warning: null,
      bestPair: null,
      worstPair: null,
      band: 'neutral',
      milestones: {
        enteredSynergyBand: false,
        enteredStrainBand: false,
      },
    };
  }

  const memberTracker = new Map();
  members.forEach((member) => {
    const memberId = getMemberId(member);
    if (!memberId) {
      return;
    }
    memberTracker.set(memberId, {
      name: typeof member.name === 'string' ? member.name : 'Crew member',
      total: 0,
      count: 0,
    });
  });

  const pairSummaries = [];
  let totalAffinity = 0;
  let pairCount = 0;

  for (let indexA = 0; indexA < members.length; indexA += 1) {
    const memberA = members[indexA];
    const idA = getMemberId(memberA);
    if (!idA) {
      continue;
    }

    for (let indexB = indexA + 1; indexB < members.length; indexB += 1) {
      const memberB = members[indexB];
      const idB = getMemberId(memberB);
      if (!idB) {
        continue;
      }

      const scores = [];
      if (typeof memberA.getAffinityForCrewmate === 'function') {
        const score = memberA.getAffinityForCrewmate(idB);
        if (Number.isFinite(score)) {
          scores.push(score);
        }
      }
      if (typeof memberB.getAffinityForCrewmate === 'function') {
        const score = memberB.getAffinityForCrewmate(idA);
        if (Number.isFinite(score)) {
          scores.push(score);
        }
      }

      const averageAffinity = scores.length
        ? scores.reduce((sum, value) => sum + value, 0) / scores.length
        : 0;
      const clampedAffinity = clampAffinityScore(averageAffinity);
      const multiplier = computeRelationshipMultiplier(clampedAffinity);

      totalAffinity += clampedAffinity;
      pairCount += 1;

      const trackerA = memberTracker.get(idA);
      if (trackerA) {
        trackerA.total += clampedAffinity;
        trackerA.count += 1;
      }
      const trackerB = memberTracker.get(idB);
      if (trackerB) {
        trackerB.total += clampedAffinity;
        trackerB.count += 1;
      }

      pairSummaries.push({
        ids: [idA, idB],
        names: [
          typeof memberA.name === 'string' ? memberA.name : 'Crew member',
          typeof memberB.name === 'string' ? memberB.name : 'Crew member',
        ],
        affinity: clampedAffinity,
        multiplier,
      });
    }
  }

  const teamAverageAffinity = pairCount ? clampAffinityScore(totalAffinity / pairCount) : 0;
  const teamMultiplier = computeRelationshipMultiplier(teamAverageAffinity);

  const synergyThreshold = Number.isFinite(CREW_RELATIONSHIP_CONFIG.synergyThreshold)
    ? CREW_RELATIONSHIP_CONFIG.synergyThreshold
    : 35;
  const strainThreshold = Number.isFinite(CREW_RELATIONSHIP_CONFIG.strainThreshold)
    ? CREW_RELATIONSHIP_CONFIG.strainThreshold
    : -35;

  const percentShift = Math.round((teamMultiplier - 1) * 100);
  const chemistryBand = teamAverageAffinity >= synergyThreshold
    ? 'synergy'
    : teamAverageAffinity <= strainThreshold
      ? 'strain'
      : 'neutral';
  const milestones = {
    enteredSynergyBand: chemistryBand === 'synergy',
    enteredStrainBand: chemistryBand === 'strain',
  };
  let summary;
  if (members.length <= 1) {
    summary = 'Solo operative — chemistry steady.';
  } else if (!pairCount) {
    summary = 'Chemistry steady (insufficient history).';
  } else if (teamAverageAffinity >= synergyThreshold) {
    summary = `Strong synergy (+${percentShift}% effectiveness).`;
  } else if (teamAverageAffinity <= strainThreshold) {
    summary = `Strained chemistry (${percentShift}% to effectiveness).`;
  } else if (Math.abs(percentShift) >= 1) {
    summary = `Chemistry shift ${percentShift > 0 ? `+${percentShift}` : `${percentShift}`}% to effectiveness.`;
  } else {
    summary = 'Chemistry steady (no change).';
  }

  const bestPair = pairSummaries.length
    ? pairSummaries.reduce(
        (best, pair) => (pair.affinity > (best?.affinity ?? -Infinity) ? pair : best),
        null,
      )
    : null;
  const worstPair = pairSummaries.length
    ? pairSummaries.reduce(
        (worst, pair) => (pair.affinity < (worst?.affinity ?? Infinity) ? pair : worst),
        null,
      )
    : null;

  const highlight = bestPair && bestPair.affinity >= synergyThreshold
    ? `${bestPair.names[0]} and ${bestPair.names[1]} operate smoothly (+${Math.round((bestPair.multiplier - 1) * 100)}%).`
    : null;

  const penaltyPercent = worstPair ? Math.round((1 - worstPair.multiplier) * 100) : 0;
  const warning = worstPair && worstPair.affinity <= strainThreshold
    ? `${worstPair.names[0]} and ${worstPair.names[1]} are clashing (${penaltyPercent > 0 ? `-${penaltyPercent}` : penaltyPercent}% penalty).`
    : null;

  const memberMultipliers = new Map();
  members.forEach((member) => {
    const memberId = getMemberId(member);
    if (!memberId) {
      return;
    }

    const tracker = memberTracker.get(memberId) ?? {
      name: typeof member.name === 'string' ? member.name : 'Crew member',
      total: 0,
      count: 0,
    };
    const averageAffinity = tracker.count ? tracker.total / tracker.count : teamAverageAffinity;
    const clampedAverage = clampAffinityScore(averageAffinity);
    const multiplier = computeRelationshipMultiplier(clampedAverage);
    tracker.averageAffinity = clampedAverage;
    tracker.multiplier = multiplier;
    tracker.name = tracker.name ?? (typeof member.name === 'string' ? member.name : 'Crew member');
    memberTracker.set(memberId, tracker);
    memberMultipliers.set(memberId, multiplier);
  });

  const memberDetails = members
    .map((member) => {
      const memberId = getMemberId(member);
      if (!memberId) {
        return null;
      }
      const tracker = memberTracker.get(memberId);
      if (!tracker) {
        return null;
      }
      return {
        id: memberId,
        name: tracker.name ?? (typeof member.name === 'string' ? member.name : 'Crew member'),
        averageAffinity: clampAffinityScore(tracker.averageAffinity ?? teamAverageAffinity),
        multiplier: tracker.multiplier ?? computeRelationshipMultiplier(teamAverageAffinity),
      };
    })
    .filter(Boolean);

  return {
    memberMultipliers,
    memberDetails,
    pairSummaries,
    teamAverageAffinity,
    teamMultiplier,
    summary,
    highlight,
    warning,
    bestPair,
    worstPair,
    band: chemistryBand,
    milestones,
  };
};

const serializeChemistryProfile = (profile) => {
  if (!profile) {
    return null;
  }

  const toSerializablePair = (pair) => {
    if (!pair) {
      return null;
    }
    return {
      ids: Array.isArray(pair.ids) ? pair.ids.slice() : [],
      names: Array.isArray(pair.names) ? pair.names.slice() : [],
      affinity: pair.affinity,
      multiplier: pair.multiplier,
    };
  };

  return {
    summary: profile.summary ?? null,
    highlight: profile.highlight ?? null,
    warning: profile.warning ?? null,
    teamAverageAffinity: profile.teamAverageAffinity,
    teamMultiplier: profile.teamMultiplier,
    band: profile.band ?? 'neutral',
    milestones: {
      enteredSynergyBand: Boolean(profile?.milestones?.enteredSynergyBand),
      enteredStrainBand: Boolean(profile?.milestones?.enteredStrainBand),
    },
    memberDetails: Array.isArray(profile.memberDetails)
      ? profile.memberDetails.map((entry) => ({
          id: entry.id,
          name: entry.name,
          averageAffinity: entry.averageAffinity,
          multiplier: entry.multiplier,
        }))
      : [],
    pairSummaries: Array.isArray(profile.pairSummaries)
      ? profile.pairSummaries.map((entry) => ({
          ids: Array.isArray(entry.ids) ? entry.ids.slice() : [],
          names: Array.isArray(entry.names) ? entry.names.slice() : [],
          affinity: entry.affinity,
          multiplier: entry.multiplier,
        }))
      : [],
    bestPair: toSerializablePair(profile.bestPair),
    worstPair: toSerializablePair(profile.worstPair),
  };
};

const computeMissionStressLevel = (mission, { outcome = 'success', falloutByCrewId = null } = {}) => {
  const difficulty = Number.isFinite(mission?.difficulty)
    ? Math.max(0, mission.difficulty)
    : Number.isFinite(mission?.baseDifficulty)
      ? Math.max(0, mission.baseDifficulty)
      : 1;
  const baseHeatValue = Number.isFinite(mission?.baseHeat)
    ? Math.max(0, mission.baseHeat)
    : Number.isFinite(mission?.heat)
      ? Math.max(0, mission.heat)
      : 0;
  const adjustedHeatValue = Number.isFinite(mission?.assignedCrewImpact?.adjustedHeat)
    ? Math.max(0, mission.assignedCrewImpact.adjustedHeat)
    : baseHeatValue;
  const effectiveHeat = Math.max(baseHeatValue, adjustedHeatValue);
  const falloutCount = (() => {
    if (!falloutByCrewId) {
      return 0;
    }
    if (falloutByCrewId instanceof Map) {
      return falloutByCrewId.size;
    }
    if (Array.isArray(falloutByCrewId)) {
      return falloutByCrewId.length;
    }
    if (typeof falloutByCrewId === 'object') {
      return Object.keys(falloutByCrewId).length;
    }
    return 0;
  })();
  const failureStress = outcome === 'failure' ? 1.2 : 0;
  const stressScore = 0.3 + difficulty * 0.45 + Math.min(effectiveHeat, 80) * 0.012 + falloutCount * 0.9 + failureStress;
  return clamp(stressScore, 0, 5);
};

const computeCrewPerkImpact = (member, mission, context = {}) => {
  const perks = Array.isArray(member?.perks) ? member.perks : [];
  if (!perks.length) {
    return {
      durationMultiplier: 1,
      payoutMultiplier: 1,
      heatMultiplier: 1,
      successBonus: 0,
      summaries: [],
    };
  }

  let durationMultiplier = 1;
  let payoutMultiplier = 1;
  let heatMultiplier = 1;
  let successBonus = 0;
  const summaries = [];

  perks.forEach((perkLabel) => {
    const effect = getCrewPerkEffect(perkLabel, { ...context, member, mission });
    if (!effect) {
      return;
    }
    durationMultiplier *= effect.durationMultiplier ?? 1;
    payoutMultiplier *= effect.payoutMultiplier ?? 1;
    heatMultiplier *= effect.heatMultiplier ?? 1;
    successBonus += effect.successBonus ?? 0;
    if (effect.summary) {
      summaries.push(effect.summary);
    }
  });

  return {
    durationMultiplier,
    payoutMultiplier,
    heatMultiplier,
    successBonus,
    summaries,
  };
};

const GARAGE_MAINTENANCE_CONFIG = {
  repair: {
    cost: 4000,
    conditionBoost: 0.4,
  },
  heat: {
    cost: 2500,
    heatReduction: 1.5,
  },
};

const VEHICLE_UPGRADE_CATALOG = VEHICLE_MOD_CATALOG;

const PLAYER_SKILL_CONFIG = {
  driving: {
    key: 'driving',
    label: 'Driving',
    description: 'Sharper getaway lines reduce duration and bolster odds.',
    trainingCost: 3200,
    baseLevel: 1,
    maxLevel: 6,
    effects: {
      durationReductionPerLevel: 0.04,
      durationReductionCap: 0.32,
      successBonusPerLevel: 0.02,
      successBonusCap: 0.24,
    },
  },
  stealth: {
    key: 'stealth',
    label: 'Stealth',
    description: 'Quieter infiltration trims heat and steadies outcomes.',
    trainingCost: 3000,
    baseLevel: 1,
    maxLevel: 6,
    effects: {
      heatReductionPerLevel: 0.06,
      heatReductionCap: 0.42,
      successBonusPerLevel: 0.015,
      successBonusCap: 0.18,
    },
  },
  engineering: {
    key: 'engineering',
    label: 'Engineering',
    description: 'Mechanical savvy squeezes extra payout and reliability.',
    trainingCost: 3400,
    baseLevel: 1,
    maxLevel: 6,
    effects: {
      payoutBonusPerLevel: 0.05,
      payoutBonusCap: 0.35,
      successBonusPerLevel: 0.01,
      successBonusCap: 0.14,
    },
  },
  charisma: {
    key: 'charisma',
    label: 'Charisma',
    description: 'Greases negotiations to lift payouts and cool heat.',
    trainingCost: 3600,
    baseLevel: 1,
    maxLevel: 6,
    effects: {
      payoutBonusPerLevel: 0.03,
      payoutBonusCap: 0.24,
      heatReductionPerLevel: 0.02,
      heatReductionCap: 0.22,
      successBonusPerLevel: 0.01,
      successBonusCap: 0.12,
    },
  },
};

const PLAYER_GEAR_CATALOG = {
  'signal-scrambler': {
    id: 'signal-scrambler',
    label: 'Signal Scrambler',
    description: 'Jams trackers to cut mission heat and steady success odds.',
    cost: 4200,
    effects: {
      heatMultiplier: 0.88,
      successBonus: 0.03,
    },
  },
  'lockbreaker-kit': {
    id: 'lockbreaker-kit',
    label: 'Lockbreaker Kit',
    description: 'Precision tools shorten entry time and improve outcomes.',
    cost: 3800,
    effects: {
      durationMultiplier: 0.92,
      successBonus: 0.02,
    },
  },
  'insider-contacts': {
    id: 'insider-contacts',
    label: 'Insider Contacts',
    description: 'Favors owed boost payouts and shade heat signatures.',
    cost: 4600,
    effects: {
      payoutMultiplier: 1.08,
      heatMultiplier: 0.93,
      successBonus: 0.015,
    },
  },
  'overwatch-suite': {
    id: 'overwatch-suite',
    label: 'Overwatch Suite',
    description: 'Command uplinks steer ops in real time, compressing timelines and steadying risks.',
    cost: 4400,
    effects: {
      durationMultiplier: 0.93,
      heatMultiplier: 0.97,
      successBonus: 0.025,
    },
  },
  'deep-cover-ledger': {
    id: 'deep-cover-ledger',
    label: 'Deep Cover Ledger',
    description: 'Layered shell accounts launder payouts while muting the crackdown\'s focus.',
    cost: 5000,
    effects: {
      payoutMultiplier: 1.06,
      heatMultiplier: 0.9,
      successBonus: 0.01,
    },
  },
  'emergency-evac-beacon': {
    id: 'emergency-evac-beacon',
    label: 'Emergency Evac Beacon',
    description: 'Pre-cleared air corridors yank crews out when ops stall, salvaging shaky runs.',
    cost: 4700,
    effects: {
      durationMultiplier: 0.9,
      heatMultiplier: 1.02,
      successBonus: 0.035,
    },
  },
};

const DEFAULT_DISPOSITION_CONFIG = {
  saleMultiplier: 0.68,
  scrapMultiplier: 0.32,
  partsPerTenThousandValue: 3,
};

const normalizeFunds = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0;
};

const formatFunds = (value) => {
  if (!Number.isFinite(value)) {
    return '$0';
  }

  return `$${Math.round(value).toLocaleString()}`;
};

const computeVehicleBaseValue = (vehicle) => {
  if (!vehicle || typeof vehicle !== 'object') {
    return 0;
  }

  const explicitValue = Number(vehicle.baseValue);
  if (Number.isFinite(explicitValue) && explicitValue > 0) {
    return explicitValue;
  }

  const topSpeed = Number(vehicle.topSpeed);
  const acceleration = Number(vehicle.acceleration);
  const handling = Number(vehicle.handling);

  const normalizedSpeed = Number.isFinite(topSpeed) ? topSpeed : 110;
  const normalizedAcceleration = Number.isFinite(acceleration) ? acceleration : 5.5;
  const normalizedHandling = Number.isFinite(handling) ? handling : 6;

  const performanceScore =
    normalizedSpeed * 85 + normalizedAcceleration * 1150 + normalizedHandling * 850;

  return Math.max(5500, Math.round(performanceScore));
};

const sanitizeDuration = (durationValue, difficultyValue) => {
  const numericDuration = coerceFiniteNumber(durationValue, NaN);
  const numericDifficulty = coerceFiniteNumber(difficultyValue, 1);
  const fallback = Math.max(numericDifficulty * 20, 20);

  if (Number.isFinite(numericDuration) && numericDuration > 0) {
    return numericDuration;
  }

  return fallback;
};

const computeMissionFatigueImpact = (mission) => {
  if (!mission || typeof mission !== 'object') {
    return CREW_FATIGUE_CONFIG.missionFatigueBase;
  }

  const duration = sanitizeDuration(mission.duration ?? mission.baseDuration, mission.difficulty);
  const durationReference = CREW_FATIGUE_CONFIG.missionDurationReference;
  const durationFactor = Number.isFinite(durationReference) && durationReference > 0
    ? clamp(duration / durationReference, 0.5, 2.2)
    : 1;

  const difficultyReference = CREW_FATIGUE_CONFIG.missionDifficultyReference;
  const difficultyValue = coerceFiniteNumber(mission.difficulty, difficultyReference);
  const difficultyOffset = difficultyValue - difficultyReference;
  const difficultyFactor = clamp(1 + difficultyOffset * 0.1, 0.6, 1.8);

  const base = CREW_FATIGUE_CONFIG.missionFatigueBase;
  const fatigue = Math.round(base * durationFactor * difficultyFactor);
  return clamp(fatigue, 8, Math.round(CREW_FATIGUE_CONFIG.maxFatigue * 0.6));
};

const deriveBaseSuccessChance = (difficultyValue) => {
  const difficulty = coerceFiniteNumber(difficultyValue, 1);
  const baseline = 0.75 - difficulty * 0.08;
  return Math.max(0.3, Math.min(0.85, baseline));
};

const summarizeCrewEffect = (
  member,
  { durationDelta = 0, payoutDelta = 0, successDelta = 0, heatDelta = 0 },
) => {
  const adjustments = [];
  if (durationDelta) {
    const label = durationDelta < 0 ? 'faster' : 'slower';
    adjustments.push(`${Math.abs(Math.round(durationDelta * 100))}% ${label}`);
  }
  if (payoutDelta) {
    const label = payoutDelta > 0 ? 'more' : 'less';
    adjustments.push(`${Math.abs(Math.round(payoutDelta * 100))}% ${label} payout`);
  }
  if (successDelta) {
    adjustments.push(`${successDelta > 0 ? '+' : '-'}${Math.abs(Math.round(successDelta * 100))}% success`);
  }
  if (heatDelta) {
    const label = heatDelta < 0 ? 'less' : 'more';
    adjustments.push(`${Math.abs(Math.round(heatDelta * 100))}% ${label} heat`);
  }

  if (!adjustments.length) {
    return `${member.name}: steady support.`;
  }

  return `${member.name}: ${adjustments.join(', ')}`;
};

const computeCrewGearImpact = (member, mission, context = {}) => {
  const gearIds = typeof member?.getEquippedGearIds === 'function'
    ? member.getEquippedGearIds()
    : Array.isArray(member?.equippedGear)
      ? member.equippedGear.filter((gearId) => gearId)
      : [];

  if (!gearIds.length) {
    return {
      durationMultiplier: 1,
      payoutMultiplier: 1,
      heatMultiplier: 1,
      successBonus: 0,
      summaries: [],
    };
  }

  let durationMultiplier = 1;
  let payoutMultiplier = 1;
  let heatMultiplier = 1;
  let successBonus = 0;
  const summaries = [];

  gearIds.forEach((gearId) => {
    const effect = getCrewGearEffect(gearId, {
      member,
      mission,
      baseHeat: context.baseHeat,
      vehicle: context.vehicle,
      support: context.support,
    });
    if (!effect) {
      return;
    }

    durationMultiplier *= effect.durationMultiplier ?? 1;
    payoutMultiplier *= effect.payoutMultiplier ?? 1;
    heatMultiplier *= effect.heatMultiplier ?? 1;
    successBonus += effect.successBonus ?? 0;

    const detail = effect.summary || effect.label || String(gearId);
    if (detail) {
      summaries.push(detail);
    }
  });

  return {
    durationMultiplier: Math.max(0.35, Math.min(1.8, durationMultiplier)),
    payoutMultiplier: Math.max(0.5, Math.min(2.2, payoutMultiplier)),
    heatMultiplier: Math.max(0.2, Math.min(2.5, heatMultiplier)),
    successBonus,
    summaries,
  };
};

const computeCrewMemberTraitImpact = (member, mission, context = {}) => {
  const normalizedSpecialty = typeof member?.specialty === 'string'
    ? member.specialty.toLowerCase()
    : '';
  const synergyProfile = CREW_SPECIALTY_SYNERGIES[normalizedSpecialty] ?? {};
  const missionDifficulty = Number(mission?.difficulty);
  const difficultyFactor = Number.isFinite(missionDifficulty)
    ? clamp(1 + (missionDifficulty - 2) * 0.08, 0.8, 1.2)
    : 1;
  const loyaltyValue = Number(member?.loyalty);
  const loyaltyBoost = Number.isFinite(loyaltyValue)
    ? 1 + Math.max(0, loyaltyValue) * 0.05
    : 1;
  const minChemistryMultiplier = Number.isFinite(CREW_RELATIONSHIP_CONFIG.minimumTraitMultiplier)
    ? CREW_RELATIONSHIP_CONFIG.minimumTraitMultiplier
    : 0.6;
  const maxChemistryMultiplier = Number.isFinite(CREW_RELATIONSHIP_CONFIG.maximumTraitMultiplier)
    ? CREW_RELATIONSHIP_CONFIG.maximumTraitMultiplier
    : 1.3;
  const chemistryMultiplier = Number.isFinite(context?.chemistryMultiplier)
    ? clamp(context.chemistryMultiplier, minChemistryMultiplier, maxChemistryMultiplier)
    : 1;

  const totals = {
    durationReduction: 0,
    payoutBonus: 0,
    heatReduction: 0,
    heatIncrease: 0,
    successBonus: 0,
  };

  CREW_TRAIT_KEYS.forEach((traitKey) => {
    const traitLevel = getCrewTraitLevel(member, traitKey);
    const aboveBase = Math.max(0, traitLevel - 1);
    if (aboveBase <= 0) {
      return;
    }

    const traitEffect = CREW_TRAIT_EFFECTS[traitKey];
    if (!traitEffect) {
      return;
    }

    const synergy = Number.isFinite(synergyProfile[traitKey]) ? synergyProfile[traitKey] : 1;
    const contributionStrength =
      aboveBase * Math.max(0.5, synergy) * loyaltyBoost * difficultyFactor * chemistryMultiplier;

    if (traitEffect.durationReduction) {
      totals.durationReduction += traitEffect.durationReduction * contributionStrength;
    }
    if (traitEffect.payoutBonus) {
      totals.payoutBonus += traitEffect.payoutBonus * contributionStrength;
    }
    if (traitEffect.heatReduction) {
      totals.heatReduction += traitEffect.heatReduction * contributionStrength;
    }
    if (traitEffect.heatIncrease) {
      totals.heatIncrease += traitEffect.heatIncrease * contributionStrength;
    }
    if (traitEffect.successBonus) {
      totals.successBonus += traitEffect.successBonus * contributionStrength;
    }
  });

  totals.durationReduction = Math.max(0, Math.min(0.55, totals.durationReduction));
  totals.payoutBonus = Math.max(-0.2, Math.min(0.7, totals.payoutBonus));
  totals.heatReduction = Math.max(0, Math.min(0.75, totals.heatReduction));
  totals.heatIncrease = Math.max(0, Math.min(0.6, totals.heatIncrease));
  totals.successBonus = Math.max(-0.1, Math.min(0.45, totals.successBonus));

  const backgroundEffects = (member?.background?.effects && typeof member.background.effects === 'object')
    ? member.background.effects
    : {};
  const backgroundPerkLabel = typeof member?.background?.perkLabel === 'string'
    ? member.background.perkLabel
    : null;
  const hasBackgroundPerk = backgroundPerkLabel
    && Array.isArray(member?.perks)
    && member.perks.includes(backgroundPerkLabel);

  const baseDurationMultiplier = Math.max(0.3, 1 - totals.durationReduction);
  const basePayoutMultiplier = Math.max(0.4, 1 + totals.payoutBonus);
  const baseHeatMultiplier = Math.max(0.2, Math.min(2.5, 1 - totals.heatReduction + totals.heatIncrease));
  const baseSuccessBonus = totals.successBonus;

  const fallbackDurationMultiplier = Number.isFinite(backgroundEffects.durationMultiplier)
    ? backgroundEffects.durationMultiplier
    : 1;
  const fallbackPayoutMultiplier = Number.isFinite(backgroundEffects.payoutMultiplier)
    ? backgroundEffects.payoutMultiplier
    : 1;
  const fallbackHeatMultiplier = Number.isFinite(backgroundEffects.heatMultiplier)
    ? backgroundEffects.heatMultiplier
    : 1;
  const fallbackSuccessBonus = Number.isFinite(backgroundEffects.successBonus)
    ? backgroundEffects.successBonus
    : 0;

  let durationMultiplier = baseDurationMultiplier * (hasBackgroundPerk ? 1 : fallbackDurationMultiplier);
  let payoutMultiplier = basePayoutMultiplier * (hasBackgroundPerk ? 1 : fallbackPayoutMultiplier);
  let heatMultiplier = Math.max(0.2, Math.min(2.5, baseHeatMultiplier * (hasBackgroundPerk ? 1 : fallbackHeatMultiplier)));
  let successBonus = baseSuccessBonus + (hasBackgroundPerk ? 0 : fallbackSuccessBonus);

  const perkImpact = computeCrewPerkImpact(member, mission, context);
  const gearImpact = computeCrewGearImpact(member, mission, context);
  durationMultiplier *= perkImpact.durationMultiplier ?? 1;
  durationMultiplier *= gearImpact.durationMultiplier ?? 1;
  payoutMultiplier *= perkImpact.payoutMultiplier ?? 1;
  payoutMultiplier *= gearImpact.payoutMultiplier ?? 1;
  heatMultiplier = Math.max(
    0.2,
    Math.min(2.5, heatMultiplier * (perkImpact.heatMultiplier ?? 1)),
  );
  heatMultiplier = Math.max(
    0.2,
    Math.min(2.5, heatMultiplier * (gearImpact.heatMultiplier ?? 1)),
  );
  successBonus += (perkImpact.successBonus ?? 0) + (gearImpact.successBonus ?? 0);

  const summary = summarizeCrewEffect(member, {
    durationDelta: durationMultiplier - 1,
    payoutDelta: payoutMultiplier - 1,
    successDelta: successBonus,
    heatDelta: heatMultiplier - 1,
  });
  const perkSummaries = Array.isArray(perkImpact.summaries) ? perkImpact.summaries : [];
  const gearSummaries = Array.isArray(gearImpact.summaries) ? gearImpact.summaries : [];
  const detailSegments = [];
  if (perkSummaries.length) {
    detailSegments.push(`Perks: ${perkSummaries.join('; ')}`);
  }
  if (gearSummaries.length) {
    detailSegments.push(`Gear: ${gearSummaries.join('; ')}`);
  }

  const baseSummary = summary.endsWith('.') ? summary.slice(0, -1) : summary;
  const summaryWithDetails = detailSegments.length
    ? `${baseSummary} — ${detailSegments.join(' • ')}.`
    : summary;
  const combinedSummaries = [
    ...perkSummaries.map((entry) => `Perk — ${entry}`),
    ...gearSummaries.map((entry) => `Gear — ${entry}`),
  ];

  return {
    durationMultiplier,
    payoutMultiplier,
    heatMultiplier,
    successBonus,
    summary: summaryWithDetails,
    perkSummaries: combinedSummaries,
  };
};

const summarizePlayerContribution = (
  label,
  { durationDelta = 0, payoutDelta = 0, successDelta = 0, heatDelta = 0 },
) => {
  const adjustments = [];
  if (durationDelta) {
    const labelText = durationDelta < 0 ? 'faster' : 'slower';
    adjustments.push(`${Math.abs(Math.round(durationDelta * 100))}% ${labelText}`);
  }
  if (payoutDelta) {
    const payoutLabel = payoutDelta > 0 ? 'more' : 'less';
    adjustments.push(`${Math.abs(Math.round(payoutDelta * 100))}% ${payoutLabel} payout`);
  }
  if (successDelta) {
    adjustments.push(`${successDelta > 0 ? '+' : '-'}${Math.abs(Math.round(successDelta * 100))}% success`);
  }
  if (heatDelta) {
    const heatLabel = heatDelta < 0 ? 'less' : 'more';
    adjustments.push(`${Math.abs(Math.round(heatDelta * 100))}% ${heatLabel} heat`);
  }

  if (!adjustments.length) {
    return `${label}: steady influence.`;
  }

  return `${label}: ${adjustments.join(', ')}`;
};

const computeSkillImpact = (skillKey, levelValue, { difficulty }) => {
  const config = PLAYER_SKILL_CONFIG[skillKey];
  if (!config) {
    return null;
  }

  const safeLevel = Number.isFinite(levelValue) ? levelValue : config.baseLevel ?? 1;
  const baseLevel = Number.isFinite(config.baseLevel) ? config.baseLevel : 1;
  const aboveBase = Math.max(0, safeLevel - baseLevel);
  if (aboveBase <= 0) {
    return null;
  }

  const contribution = {
    durationMultiplier: 1,
    payoutMultiplier: 1,
    successBonus: 0,
    heatMultiplier: 1,
    summary: [],
  };
  const aggregated = { durationDelta: 0, payoutDelta: 0, successDelta: 0, heatDelta: 0 };

  const effects = config.effects ?? {};

  if (effects.durationReductionPerLevel) {
    const cap = Math.max(0, effects.durationReductionCap ?? effects.durationReductionPerLevel * 4);
    const totalReduction = Math.min(cap, aboveBase * effects.durationReductionPerLevel);
    if (totalReduction > 0) {
      contribution.durationMultiplier *= Math.max(0.2, 1 - totalReduction);
      aggregated.durationDelta -= totalReduction;
    }
  }

  if (effects.payoutBonusPerLevel) {
    const cap = Math.max(0, effects.payoutBonusCap ?? effects.payoutBonusPerLevel * 4);
    const totalBonus = Math.min(cap, aboveBase * effects.payoutBonusPerLevel);
    if (totalBonus > 0) {
      contribution.payoutMultiplier += totalBonus;
      aggregated.payoutDelta += totalBonus;
    }
  }

  if (effects.successBonusPerLevel) {
    const cap = Math.max(0, effects.successBonusCap ?? effects.successBonusPerLevel * 6);
    const totalBonus = Math.min(cap, aboveBase * effects.successBonusPerLevel);
    if (totalBonus !== 0) {
      contribution.successBonus += totalBonus;
      aggregated.successDelta += totalBonus;
    }
  }

  if (effects.heatReductionPerLevel) {
    const cap = Math.max(0, effects.heatReductionCap ?? effects.heatReductionPerLevel * 4);
    const totalReduction = Math.min(cap, aboveBase * effects.heatReductionPerLevel);
    if (totalReduction > 0) {
      contribution.heatMultiplier *= Math.max(0.2, 1 - totalReduction);
      aggregated.heatDelta -= totalReduction;
    }
  }

  const hasChange =
    aggregated.durationDelta || aggregated.payoutDelta || aggregated.successDelta || aggregated.heatDelta;
  if (hasChange) {
    contribution.summary.push(
      summarizePlayerContribution(`${config.label} L${safeLevel}`, aggregated),
    );
  }

  return contribution;
};

const computeGearImpact = (gearId) => {
  const config = PLAYER_GEAR_CATALOG[gearId];
  if (!config) {
    return null;
  }

  const effects = config.effects ?? {};
  const durationMultiplier = Number.isFinite(effects.durationMultiplier)
    ? clamp(effects.durationMultiplier, 0.35, 1.25)
    : 1;
  const payoutMultiplier = Number.isFinite(effects.payoutMultiplier)
    ? clamp(effects.payoutMultiplier, 0.5, 1.6)
    : 1;
  const heatMultiplier = Number.isFinite(effects.heatMultiplier)
    ? clamp(effects.heatMultiplier, 0.2, 1.6)
    : 1;
  const successBonus = Number.isFinite(effects.successBonus) ? effects.successBonus : 0;

  const contribution = {
    durationMultiplier,
    payoutMultiplier,
    successBonus,
    heatMultiplier,
    summary: summarizePlayerContribution(config.label, {
      durationDelta: durationMultiplier - 1,
      payoutDelta: payoutMultiplier - 1,
      successDelta: successBonus,
      heatDelta: heatMultiplier - 1,
    }),
  };

  return contribution;
};

const computePlayerImpact = (mission, player) => {
  const result = {
    durationMultiplier: 1,
    payoutMultiplier: 1,
    successBonus: 0,
    heatMultiplier: 1,
    summary: [],
    skillsApplied: [],
    gearApplied: [],
  };

  if (!player) {
    result.summary.push('Player expertise unavailable.');
    return result;
  }

  const skills = player.skills ?? {};
  Object.entries(PLAYER_SKILL_CONFIG).forEach(([skillKey, config]) => {
    const levelValue = skills[skillKey];
    const impact = computeSkillImpact(skillKey, levelValue, mission ?? {});
    if (!impact) {
      return;
    }

    result.durationMultiplier *= impact.durationMultiplier;
    result.payoutMultiplier += impact.payoutMultiplier - 1;
    result.successBonus += impact.successBonus;
    result.heatMultiplier *= impact.heatMultiplier;
    result.summary.push(...impact.summary);
    result.skillsApplied.push({
      key: skillKey,
      level: Number.isFinite(levelValue) ? levelValue : config.baseLevel ?? 1,
    });
  });

  const inventory = Array.isArray(player.inventory) ? [...new Set(player.inventory)] : [];
  inventory.forEach((gearId) => {
    const impact = computeGearImpact(gearId);
    if (!impact) {
      return;
    }

    result.durationMultiplier *= impact.durationMultiplier;
    result.payoutMultiplier *= impact.payoutMultiplier;
    result.successBonus += impact.successBonus;
    result.heatMultiplier *= impact.heatMultiplier;
    if (impact.summary) {
      result.summary.push(impact.summary);
    }
    result.gearApplied.push(gearId);
  });

  if (!result.summary.length) {
    result.summary.push('Player influence steady — train or equip to unlock bonuses.');
  }

  return result;
};

const crackdownPolicies = {
  calm: {
    label: 'Calm',
    maxMissionHeat: Infinity,
    failureHeatMultiplier: 2,
  },
  alert: {
    label: 'Alert',
    maxMissionHeat: 2,
    failureHeatMultiplier: 3,
  },
  lockdown: {
    label: 'Lockdown',
    maxMissionHeat: 1,
    failureHeatMultiplier: 4,
  },
};

const defaultMissionTemplates = [
  {
    id: 'showroom-heist',
    name: 'Showroom Smash-and-Grab',
    difficulty: 2,
    payout: 15000,
    heat: 2,
    duration: 40,
    description: 'Swipe a prototype from a downtown showroom under heavy surveillance.',
    category: 'vehicle-heist',
    vehicleReward: {
      label: 'Showroom Prototype',
      summary: 'High-acceleration prototype tuned for downtown escapes.',
      storageRequired: 1,
      vehicleBlueprint: {
        model: 'Showroom Prototype',
        topSpeed: 160,
        acceleration: 6.4,
        handling: 6.1,
        heat: 1,
      },
    },
  },
  {
    id: 'dockyard-swap',
    name: 'Dockyard Switcheroo',
    difficulty: 1,
    payout: 8000,
    heat: 1,
    duration: 28,
    description: 'Intercept a shipment of luxury SUVs before it leaves the harbor.',
    category: 'vehicle-heist',
    vehicleReward: {
      label: 'Dockyard Interceptor SUV',
      summary: 'Versatile high-torque SUV intercepted before export.',
      storageRequired: 1,
      vehicleBlueprint: {
        model: 'Dockyard Interceptor SUV',
        topSpeed: 148,
        acceleration: 5.8,
        handling: 5.9,
        heat: 0.8,
      },
    },
  },
  {
    id: 'collector-estate',
    name: "Collector's Estate",
    difficulty: 3,
    payout: 22000,
    heat: 3,
    duration: 55,
    description: 'Infiltrate a fortified mansion and extract a mint condition classic.',
    category: 'vehicle-heist',
    vehicleReward: {
      label: "Collector's Classic Supercar",
      summary: 'Concours-ready classic with clandestine performance mods.',
      storageRequired: 1,
      vehicleBlueprint: {
        model: "Collector's Classic Supercar",
        topSpeed: 165,
        acceleration: 6.6,
        handling: 6.4,
        heat: 1.1,
      },
    },
  },
];

class MissionSystem {
  constructor(
    state,
    {
      heatSystem = new HeatSystem(state),
      missionTemplates = defaultMissionTemplates,
      contractPool = [],
      contractFactory = generateContractsFromDistricts,
      falloutContractFactory = generateFalloutContracts,
    } = {},
  ) {
    this.state = state;
    this.availableMissions = [];
    this.heatSystem = heatSystem;
    this.missionTemplates = missionTemplates.map((template) => ({ ...template }));
    this.templateMap = new Map(
      this.missionTemplates.map((template) => [template.id, template]),
    );
    this.contractPool = contractPool.map((template) => ({ ...template }));
    this.contractFactory = contractFactory;
    this.falloutContractFactory = falloutContractFactory;
    this.relationshipService = createCrewRelationshipService(this.state);
    this.safehouseDefenseManager = createSafehouseDefenseManager(this.state);

    this.currentCrackdownTier = this.heatSystem.getCurrentTier();
    if (!Number.isFinite(this.state.followUpSequence)) {
      this.state.followUpSequence = 0;
    }

    if (!Array.isArray(this.state.missionLog)) {
      this.state.missionLog = [];
    }

    if (!Array.isArray(this.state.pendingDebts)) {
      this.state.pendingDebts = [];
    }

    if (!Number.isFinite(this.state.partsInventory)) {
      this.state.partsInventory = 0;
    } else {
      this.state.partsInventory = Math.max(0, Math.round(this.state.partsInventory));
    }

    if (!Array.isArray(this.state.garageActivityLog)) {
      this.state.garageActivityLog = [];
    }

    if (!Array.isArray(this.state.crackdownHistory)) {
      this.state.crackdownHistory = [];
    }

    this.refreshContractPoolFromCity();
    this.ensureCrewStorylineContracts();
    this.ensureCrackdownOperations(this.currentCrackdownTier);
    this.applyHeatRestrictions();
  }

  recordGarageActivity(entry = {}) {
    const summary = typeof entry.summary === 'string' ? entry.summary.trim() : '';
    if (!summary) {
      return null;
    }

    const timestamp = Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now();
    const details = Array.isArray(entry.details)
      ? entry.details
          .map((detail) => (typeof detail === 'string' ? detail.trim() : ''))
          .filter(Boolean)
      : [];
    const type = typeof entry.type === 'string' && entry.type.trim()
      ? entry.type.trim()
      : 'garage';

    if (!Array.isArray(this.state.garageActivityLog)) {
      this.state.garageActivityLog = [];
    }

    const partsInventory = Number.isFinite(entry.partsInventory)
      ? Math.max(0, Math.round(entry.partsInventory))
      : Number.isFinite(this.state.partsInventory)
        ? Math.max(0, Math.round(this.state.partsInventory))
        : undefined;

    const normalized = {
      id: entry.id ?? `garage-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      summary,
      details,
      timestamp,
    };

    if (partsInventory !== undefined) {
      normalized.partsInventory = partsInventory;
    }

    if (entry.metadata && typeof entry.metadata === 'object') {
      normalized.metadata = { ...entry.metadata };
    }

    this.state.garageActivityLog.unshift(normalized);
    if (this.state.garageActivityLog.length > 30) {
      this.state.garageActivityLog.length = 30;
    }

    return normalized;
  }

  getPendingRelationshipEvents() {
    if (!this.relationshipService || typeof this.relationshipService.getPendingEvents !== 'function') {
      return [];
    }
    return this.relationshipService.getPendingEvents();
  }

  resolveRelationshipEvent(eventId, choiceId) {
    if (!this.relationshipService || typeof this.relationshipService.resolveEventChoice !== 'function') {
      return null;
    }
    return this.relationshipService.resolveEventChoice(eventId, choiceId);
  }

  recordCrewRelationshipMilestone(crewMembers = [], chemistryProfile = null, missionContext = null) {
    if (
      !this.relationshipService
      || typeof this.relationshipService.recordChemistryMilestones !== 'function'
    ) {
      return null;
    }

    const crewIds = Array.isArray(crewMembers)
      ? crewMembers
          .map((member) => {
            if (!member) {
              return null;
            }
            const rawId = member.id;
            if (rawId === undefined || rawId === null) {
              return null;
            }
            const normalized = String(rawId).trim();
            return normalized || null;
          })
          .filter(Boolean)
      : [];

    if (crewIds.length < 2 || !chemistryProfile) {
      return null;
    }

    return this.relationshipService.recordChemistryMilestones({
      crewIds,
      crewMembers,
      chemistryProfile,
      missionContext,
    });
  }

  getMissionDistrict(source) {
    if (!source) {
      return null;
    }

    const districts = this.state?.city?.districts;
    if (!Array.isArray(districts)) {
      return null;
    }

    const districtId = source.districtId ?? null;
    if (districtId) {
      const match = districts.find((district) => district?.id === districtId);
      if (match) {
        return match;
      }
    }

    const districtName = typeof source.districtName === 'string' ? source.districtName.trim() : '';
    if (districtName) {
      const normalized = districtName.toLowerCase();
      return (
        districts.find((district) => (district?.name ?? '').trim().toLowerCase() === normalized) ?? null
      );
    }

    return null;
  }

  getDistrictIntelSnapshot(source) {
    const district = this.getMissionDistrict(source ?? {});
    if (district && typeof district.getIntelSnapshot === 'function') {
      return district.getIntelSnapshot();
    }

    return cloneDistrictIntel(source?.districtIntel ?? null);
  }

  cloneTemplateForQueue(template) {
    if (!template) {
      return null;
    }

    const stored = this.templateMap.get(template.id);
    const reference = stored ?? template;

    const pointOfInterest =
      typeof reference.pointOfInterest === 'object' && reference.pointOfInterest !== null
        ? {
            ...reference.pointOfInterest,
            modifiers:
              typeof reference.pointOfInterest.modifiers === 'object' &&
              reference.pointOfInterest.modifiers !== null
                ? { ...reference.pointOfInterest.modifiers }
                : undefined,
          }
        : null;

    const storyline =
      typeof reference.storyline === 'object' && reference.storyline !== null
        ? { ...reference.storyline }
        : undefined;

    const crackdownEffects =
      typeof reference.crackdownEffects === 'object' && reference.crackdownEffects !== null
        ? { ...reference.crackdownEffects }
        : undefined;

    const falloutRecovery =
      typeof reference.falloutRecovery === 'object' && reference.falloutRecovery !== null
        ? { ...reference.falloutRecovery }
        : undefined;

    const vehicleReward = reference.vehicleReward
      ? cloneVehicleRewardProfile(reference.vehicleReward)
      : undefined;

    const campaignMilestone =
      typeof reference.campaignMilestone === 'object' && reference.campaignMilestone !== null
        ? { ...reference.campaignMilestone }
        : undefined;

    const districtIntel = this.getDistrictIntelSnapshot(reference);

    return {
      ...reference,
      pointOfInterest,
      storyline,
      crackdownEffects,
      falloutRecovery,
      vehicleReward,
      districtIntel,
      campaignMilestone,
    };
  }

  purgeCampaignMilestoneTemplates(milestoneId) {
    if (!milestoneId) {
      return;
    }

    for (let index = this.availableMissions.length - 1; index >= 0; index -= 1) {
      const mission = this.availableMissions[index];
      if (mission?.campaignMilestone?.milestoneId === milestoneId) {
        this.availableMissions.splice(index, 1);
      }
    }

    for (let index = this.contractPool.length - 1; index >= 0; index -= 1) {
      const template = this.contractPool[index];
      if (template?.campaignMilestone?.milestoneId === milestoneId) {
        this.contractPool.splice(index, 1);
      }
    }

    for (let index = this.missionTemplates.length - 1; index >= 0; index -= 1) {
      const template = this.missionTemplates[index];
      if (template?.campaignMilestone?.milestoneId === milestoneId) {
        this.missionTemplates.splice(index, 1);
      }
    }

    for (const [key, template] of this.templateMap.entries()) {
      if (template?.campaignMilestone?.milestoneId === milestoneId) {
        this.templateMap.delete(key);
      }
    }
  }

  updateCachedDistrictIntel(districtId, snapshot) {
    if (!districtId) {
      return;
    }

    const sanitized = cloneDistrictIntel(snapshot);
    if (!sanitized) {
      return;
    }

    this.availableMissions.forEach((mission) => {
      if (mission?.districtId === districtId) {
        mission.districtIntel = { ...sanitized };
      }
    });

    this.contractPool = this.contractPool.map((template) => {
      if (template?.districtId === districtId) {
        return { ...template, districtIntel: { ...sanitized } };
      }
      return template;
    });

    const updatedTemplates = new Map();
    for (const [key, template] of this.templateMap.entries()) {
      if (template?.districtId === districtId) {
        const updated = { ...template, districtIntel: { ...sanitized } };
        this.templateMap.set(key, updated);
        updatedTemplates.set(key, updated);
      }
    }

    this.missionTemplates = this.missionTemplates.map((template) => {
      if (template?.districtId !== districtId) {
        return template;
      }
      if (template?.id && updatedTemplates.has(template.id)) {
        return updatedTemplates.get(template.id);
      }
      return { ...template, districtIntel: { ...sanitized } };
    });
  }

  registerTemplate(template) {
    if (!template || !template.id) {
      return;
    }

    if (!this.templateMap.has(template.id)) {
      const storedTemplate = {
        ...template,
        pointOfInterest:
          typeof template.pointOfInterest === 'object' && template.pointOfInterest !== null
            ? {
                ...template.pointOfInterest,
                modifiers:
                  typeof template.pointOfInterest.modifiers === 'object' && template.pointOfInterest.modifiers !== null
                    ? { ...template.pointOfInterest.modifiers }
                    : undefined,
              }
            : null,
      };
      if (template.storyline) {
        storedTemplate.storyline = { ...template.storyline };
      }
      if (template.crackdownEffects) {
        storedTemplate.crackdownEffects = { ...template.crackdownEffects };
      }
      if (template.category) {
        storedTemplate.category = template.category;
      }
      if (template.vehicleReward) {
        const rewardProfile = cloneVehicleRewardProfile(template.vehicleReward);
        if (rewardProfile) {
          storedTemplate.vehicleReward = rewardProfile;
        }
      }
      if (template.ignoreCrackdownRestrictions) {
        storedTemplate.ignoreCrackdownRestrictions = Boolean(template.ignoreCrackdownRestrictions);
      }
      if (template.crackdownTier) {
        storedTemplate.crackdownTier = template.crackdownTier;
      }
      if (template.campaignMilestone) {
        storedTemplate.campaignMilestone = { ...template.campaignMilestone };
      }
      const districtIntel = this.getDistrictIntelSnapshot(template);
      if (districtIntel) {
        storedTemplate.districtIntel = districtIntel;
      }
      this.templateMap.set(template.id, storedTemplate);
      this.missionTemplates.push(storedTemplate);
    }
  }

  createMissionFromTemplate(template) {
    if (!template) {
      return null;
    }

    const missingFields = REQUIRED_TEMPLATE_FIELDS.filter(
      (field) => template[field] === undefined || template[field] === null,
    );

    if (missingFields.length) {
      const formattedMissingFields = missingFields.join(', ');
      console.warn(
        `Mission template "${template.id ?? '<unknown>'}" missing required fields: ${formattedMissingFields}`,
      );
      return null;
    }

    const basePayout = coerceFiniteNumber(template.payout, 0);
    const baseHeat = coerceFiniteNumber(template.heat, 0);
    const baseDifficulty = coerceFiniteNumber(template.difficulty, 1);
    const notorietyProfile = getNotorietyProfile(this.state?.player?.notoriety);
    const crackdownPolicy = this.getCurrentCrackdownPolicy();
    const notorietyAdjusted = applyNotorietyModifiersToMission(
      {
        payout: basePayout,
        heat: baseHeat,
        difficulty: baseDifficulty,
        riskTier: template.riskTier ?? 'low',
      },
      notorietyProfile,
      crackdownPolicy,
    );

    const payout = notorietyAdjusted.payout;
    const heat = notorietyAdjusted.heat;
    const difficulty = notorietyAdjusted.difficulty;
    const duration = sanitizeDuration(template.duration, difficulty);
    const baseSuccessChance = deriveBaseSuccessChance(difficulty);
    const pointOfInterest =
      typeof template.pointOfInterest === 'object' && template.pointOfInterest !== null
        ? {
            ...template.pointOfInterest,
            modifiers:
              typeof template.pointOfInterest.modifiers === 'object' && template.pointOfInterest.modifiers !== null
                ? { ...template.pointOfInterest.modifiers }
                : undefined,
          }
        : null;
    const falloutRecovery =
      typeof template.falloutRecovery === 'object' && template.falloutRecovery !== null
        ? { ...template.falloutRecovery }
        : null;
    const storyline =
      typeof template.storyline === 'object' && template.storyline !== null
        ? { ...template.storyline }
        : null;
    const crackdownEffects =
      typeof template.crackdownEffects === 'object' && template.crackdownEffects !== null
        ? { ...template.crackdownEffects }
        : null;
    const templateVehicleBlueprint = cloneVehicleBlueprint(template.vehicle ?? null);

    let vehicleRewardProfile = cloneVehicleRewardProfile(template.vehicleReward ?? null);
    if (vehicleRewardProfile && !vehicleRewardProfile.vehicleBlueprint && templateVehicleBlueprint) {
      vehicleRewardProfile.vehicleBlueprint = templateVehicleBlueprint;
      if (!vehicleRewardProfile.label && templateVehicleBlueprint?.model) {
        vehicleRewardProfile.label = templateVehicleBlueprint.model;
      }
    }

    if (!vehicleRewardProfile && (template.category ?? '').toLowerCase() === 'vehicle-heist') {
      const fallbackBlueprint = templateVehicleBlueprint ?? { model: 'Target Vehicle' };
      vehicleRewardProfile = cloneVehicleRewardProfile({
        vehicleBlueprint: fallbackBlueprint,
        label: fallbackBlueprint?.model ?? 'Target Vehicle',
        storageRequired: 1,
      });
    }

    const districtIntel = this.getDistrictIntelSnapshot(template);
    const campaignMilestone =
      typeof template.campaignMilestone === 'object' && template.campaignMilestone !== null
        ? { ...template.campaignMilestone }
        : null;

    return {
      ...template,
      pointOfInterest,
      falloutRecovery,
      storyline,
      crackdownEffects,
      campaignMilestone,
      payout,
      basePayout,
      heat,
      baseHeat,
      difficulty,
      baseDifficulty,
      riskTier: notorietyAdjusted.riskTier,
      notorietyLevel: notorietyAdjusted.notorietyLevelId ?? null,
      notorietyModifiers: notorietyAdjusted.notorietyModifiers,
      vehicle: null,
      vehicleReward: vehicleRewardProfile ?? null,
      vehicleRewardGranted: false,
      vehicleRewardOutcome: null,
      vehicleRewardDeliveredAt: null,
      vehicleRewardVehicleId: null,
      status: 'available',
      restricted: false,
      restrictionReason: null,
      elapsedTime: 0,
      progress: 0,
      duration,
      baseDuration: duration,
      successChance: baseSuccessChance,
      baseSuccessChance,
      category: template.category ?? null,
      ignoreCrackdownRestrictions: Boolean(template.ignoreCrackdownRestrictions),
      startedAt: null,
      completedAt: null,
      outcome: null,
      resolutionRoll: null,
      resolutionChance: null,
      pendingResolution: null,
      resolutionDetails: null,
      assignedCrewIds: [],
      assignedCrewImpact: null,
      assignedCrewPerkSummary: [],
      crewEffectSummary: [],
      crewPerkSummary: [],
      playerEffectSummary: [],
      assignedVehicleId: null,
      assignedVehicleImpact: null,
      assignedVehicleSnapshot: null,
      assignedVehicleLabel: null,
      eventDeck: [],
      eventHistory: [],
      pendingDecision: null,
      districtIntel,
      districtIntelBefore: null,
      districtIntelAfter: null,
    };
  }

  refreshContractPoolFromCity(options = {}) {
    if (typeof this.contractFactory !== 'function') {
      return;
    }

    const { resolvedMission = null } = options ?? {};
    const districts = this.state?.city?.districts ?? [];
    if (!Array.isArray(districts) || !districts.length) {
      return;
    }

    if (resolvedMission?.campaignMilestone) {
      const missionDistrict = this.getMissionDistrict(resolvedMission);
      if (missionDistrict) {
        if (resolvedMission.outcome === 'success') {
          if (typeof missionDistrict.completeCampaignMilestone === 'function') {
            const completed = missionDistrict.completeCampaignMilestone(
              resolvedMission.campaignMilestone.milestoneId,
              { outcome: resolvedMission.outcome },
            );
            if (completed && typeof missionDistrict.getCampaignSnapshot === 'function') {
              missionDistrict.getCampaignSnapshot();
            }
          }
        } else if (typeof missionDistrict.getCampaignSnapshot === 'function') {
          missionDistrict.getCampaignSnapshot();
        }
      }
    }

    districts.forEach((district) => {
      if (district && typeof district.getCampaignSnapshot === 'function') {
        district.getCampaignSnapshot();
      }
    });

    const generatedContracts = this.contractFactory(districts);
    generatedContracts.forEach((template) => {
      if (!template || !template.id) {
        return;
      }

      if (!this.templateMap.has(template.id)) {
        this.registerTemplate(template);
      }

      const alreadyAvailable = this.availableMissions.some((mission) => mission.id === template.id);
      const alreadyQueued = this.contractPool.some((mission) => mission.id === template.id);
      if (!alreadyAvailable && !alreadyQueued) {
        const sanitizedTemplate = this.cloneTemplateForQueue(template);
        this.contractPool.push(sanitizedTemplate ?? { ...template });
      }
    });
  }

  respawnMissionTemplate(missionId) {
    const missionIndex = this.availableMissions.findIndex((entry) => entry.id === missionId);
    if (missionIndex === -1) {
      return;
    }

    const template = this.templateMap.get(missionId);
    if (!template) {
      this.availableMissions.splice(missionIndex, 1);
      return;
    }

    const refreshedMission = this.createMissionFromTemplate(template);
    if (refreshedMission) {
      this.availableMissions.splice(missionIndex, 1, refreshedMission);
      this.applyHeatRestrictions();
    }
  }

  drawContractFromPool() {
    if (!this.contractPool.length) {
      this.refreshContractPoolFromCity();
    }

    if (!this.contractPool.length) {
      return null;
    }

    const nextTemplate = this.contractPool.shift();
    if (!nextTemplate) {
      return null;
    }

    this.registerTemplate(nextTemplate);
    const mission = this.createMissionFromTemplate(nextTemplate);
    if (mission) {
      const existingIndex = this.availableMissions.findIndex(
        (entry) => entry.id === mission.id,
      );
      if (existingIndex === -1) {
        this.availableMissions.push(mission);
      } else {
        this.availableMissions.splice(existingIndex, 1, mission);
      }
      this.applyHeatRestrictions();
    }

    return mission;
  }

  queueFalloutContracts(templates = []) {
    if (!Array.isArray(templates) || !templates.length) {
      return [];
    }

    const queued = [];

    templates.forEach((template) => {
      if (!template || !template.id) {
        return;
      }

      const mission = this.createMissionFromTemplate(template);
      if (!mission) {
        return;
      }

      mission.isFalloutRecovery = true;
      if (mission.falloutRecovery) {
        mission.falloutRecovery = { ...mission.falloutRecovery };
      }
      mission.restricted = false;
      mission.restrictionReason = 'Priority crew fallout response.';

      const existingIndex = this.availableMissions.findIndex((entry) => entry.id === mission.id);
      if (existingIndex !== -1) {
        this.availableMissions.splice(existingIndex, 1);
      }

      this.availableMissions.unshift(mission);
      queued.push(mission);
    });

    if (queued.length) {
      this.applyHeatRestrictions();
    }

    return queued;
  }

  ensureCrewStorylineContracts() {
    const crew = Array.isArray(this.state?.crew) ? this.state.crew : [];
    const templates = getAvailableCrewStorylineMissions(crew);
    const desiredIds = new Set();

    templates.forEach((template) => {
      if (template?.id) {
        desiredIds.add(template.id);
      }
    });

    const activeMissionId = this.state?.activeMission?.id ?? null;

    this.availableMissions = this.availableMissions.filter((mission) => {
      if (!mission || mission.category !== 'crew-loyalty') {
        return true;
      }

      if (desiredIds.has(mission.id)) {
        return true;
      }

      if (mission.status !== 'available' || mission.id === activeMissionId) {
        return true;
      }

      return false;
    });

    this.contractPool = this.contractPool.filter((template) => template?.category !== 'crew-loyalty');

    templates.forEach((template) => {
      if (!template || !template.id) {
        return;
      }

      this.registerTemplate(template);

      const existing = this.availableMissions.find((mission) => mission.id === template.id);
      if (existing) {
        existing.category = 'crew-loyalty';
        existing.ignoreCrackdownRestrictions = true;
        existing.restricted = false;
        existing.restrictionReason = null;
        existing.storyline = template.storyline ? { ...template.storyline } : existing.storyline;
        return;
      }

      const mission = this.createMissionFromTemplate(template);
      if (!mission) {
        return;
      }

      mission.category = 'crew-loyalty';
      mission.ignoreCrackdownRestrictions = true;
      mission.restricted = false;
      mission.restrictionReason = null;
      this.availableMissions.unshift(mission);
    });
  }

  ensureCrackdownOperations(tier = this.currentCrackdownTier) {
    const templates = getCrackdownOperationTemplates(tier);
    const desiredIds = new Set();

    templates.forEach((template) => {
      if (template?.id) {
        desiredIds.add(template.id);
      }
    });

    const activeMissionId = this.state?.activeMission?.id ?? null;

    this.availableMissions = this.availableMissions.filter((mission) => {
      if (!mission || mission.category !== 'crackdown-operation') {
        return true;
      }

      if (desiredIds.has(mission.id)) {
        return true;
      }

      if (mission.status !== 'available' || mission.id === activeMissionId) {
        return true;
      }

      return false;
    });

    this.contractPool = this.contractPool.filter((template) => template?.category !== 'crackdown-operation');

    templates.forEach((template) => {
      if (!template || !template.id) {
        return;
      }

      this.registerTemplate(template);

      const existing = this.availableMissions.find((mission) => mission.id === template.id);
      if (existing) {
        existing.category = 'crackdown-operation';
        existing.ignoreCrackdownRestrictions = true;
        existing.crackdownTier = template.crackdownTier ?? tier;
        existing.crackdownEffects = template.crackdownEffects
          ? { ...template.crackdownEffects }
          : existing.crackdownEffects;
        existing.restricted = false;
        existing.restrictionReason = null;
        return;
      }

      const mission = this.createMissionFromTemplate(template);
      if (!mission) {
        return;
      }

      mission.category = 'crackdown-operation';
      mission.ignoreCrackdownRestrictions = true;
      mission.crackdownTier = template.crackdownTier ?? tier;
      mission.crackdownEffects = template.crackdownEffects ? { ...template.crackdownEffects } : null;
      mission.restricted = false;
      mission.restrictionReason = null;
      this.availableMissions.unshift(mission);
    });
  }

  normalizeSuccessChance(mission) {
    if (!mission) {
      return 0;
    }

    const candidate = Number(mission.successChance);
    if (Number.isFinite(candidate)) {
      return Math.max(0, Math.min(1, candidate));
    }

    const fallback = Number.isFinite(mission.baseSuccessChance)
      ? mission.baseSuccessChance
      : deriveBaseSuccessChance(mission.difficulty);
    return Math.max(0, Math.min(1, fallback));
  }

  prepareAutomaticResolution(mission) {
    const successChance = this.normalizeSuccessChance(mission);
    const roll = Math.random();
    const outcome = roll <= successChance ? 'success' : 'failure';

    mission.resolutionRoll = roll;
    mission.resolutionChance = successChance;
    mission.pendingResolution = {
      roll,
      successChance,
      resolvedAutomatically: true,
      evaluatedAt: Date.now(),
    };

    return { outcome, roll, successChance };
  }

  _getSafehouseCollection() {
    if (!this.state) {
      return null;
    }

    if (this.state.safehouses instanceof SafehouseCollection) {
      return this.state.safehouses;
    }

    const collection = new SafehouseCollection(this.state.safehouses ?? []);
    this.state.safehouses = collection;
    return collection;
  }

  _syncSafehouseDowntimeFromAlert(alert, { currentDay = null } = {}) {
    if (!alert || !this.state) {
      return;
    }

    const collection = this._getSafehouseCollection();
    if (!collection) {
      return;
    }

    if (typeof collection.pruneFacilityDowntimes === 'function' && Number.isFinite(currentDay)) {
      collection.pruneFacilityDowntimes(currentDay);
    }

    const safehouseId = alert.safehouseId ?? null;
    const facilityId = alert.facilityId ?? null;
    if (!safehouseId || !facilityId) {
      return;
    }

    const status = typeof alert.status === 'string' ? alert.status : 'alert';

    if (status === 'cooldown') {
      if (typeof collection.applyFacilityDowntime !== 'function') {
        return;
      }

      const downtimeSource = alert.downtime ?? alert.facilityDowntime ?? null;
      const normalizedDowntime =
        sanitizeFacilityDowntime(downtimeSource ?? {}, {
          facilityId,
          label: alert.facilityName ?? null,
          currentDay,
        }) ?? {
          facilityId,
          label: alert.facilityName ?? null,
          penalties: [],
        };

      const resolvedDowntime = {
        ...normalizedDowntime,
        facilityId,
        label: normalizedDowntime.label ?? alert.facilityName ?? null,
        summary: normalizedDowntime.summary ?? alert.summary ?? null,
        penalties: Array.isArray(normalizedDowntime.penalties)
          ? normalizedDowntime.penalties
          : [],
        penaltySummary: normalizedDowntime.penaltySummary ?? null,
        cooldownDays: Number.isFinite(alert.cooldownDays)
          ? Math.max(0, alert.cooldownDays)
          : normalizedDowntime.cooldownDays ?? null,
        cooldownEndsOnDay: Number.isFinite(alert.cooldownEndsOnDay)
          ? alert.cooldownEndsOnDay
          : normalizedDowntime.cooldownEndsOnDay ?? null,
        startedAt: Number.isFinite(alert.resolvedAt)
          ? alert.resolvedAt
          : normalizedDowntime.startedAt ?? null,
        alertId: normalizedDowntime.alertId ?? alert.id ?? null,
      };

      if (
        !Number.isFinite(resolvedDowntime.cooldownEndsOnDay) &&
        Number.isFinite(currentDay) &&
        Number.isFinite(resolvedDowntime.cooldownDays)
      ) {
        resolvedDowntime.cooldownEndsOnDay = currentDay + resolvedDowntime.cooldownDays;
      }

      collection.applyFacilityDowntime(safehouseId, resolvedDowntime, currentDay);
    } else if (typeof collection.clearFacilityDowntime === 'function') {
      collection.clearFacilityDowntime(safehouseId, facilityId, { currentDay });
    }
  }

  _buildSafehouseAlertDetailLines(alertEntry, choice, { effectSummary = null, facilityDowntime = null } = {}) {
    const details = [];

    if (choice?.description) {
      details.push(choice.description);
    }

    if (effectSummary && typeof effectSummary === 'string') {
      const trimmed = effectSummary.trim();
      if (trimmed) {
        details.push(`Effects: ${trimmed}`);
      }
    }

    const downtime = facilityDowntime ?? choice?.effects?.facilityDowntime ?? null;
    const summary = typeof downtime?.summary === 'string' ? downtime.summary.trim() : '';
    if (summary) {
      details.push(summary);
    }

    const penalties = Array.isArray(downtime?.penalties)
      ? downtime.penalties.map((line) => (typeof line === 'string' ? line.trim() : '')).filter(Boolean)
      : [];
    if (penalties.length) {
      details.push(...penalties);
    }

    if (this.safehouseDefenseManager) {
      const defenseLines = this.safehouseDefenseManager.getScenarioSummaryLines(
        alertEntry?.id ?? alertEntry?.safehouseAlertId ?? null,
      );
      if (Array.isArray(defenseLines) && defenseLines.length) {
        details.push(...defenseLines);
      }
    }

    return details.filter(Boolean);
  }

  _recordSafehouseAlertGarageActivity(alertEntry, choice, { summary, detailLines = [], resolvedAt = Date.now() } = {}) {
    if (!Array.isArray(this.state?.garageActivityLog)) {
      this.state.garageActivityLog = [];
    }

    const summaryLine = typeof summary === 'string' && summary.trim()
      ? summary.trim()
      : `${alertEntry?.label ?? 'Safehouse alert'} resolved.`;
    const details = Array.isArray(detailLines)
      ? detailLines.map((line) => (typeof line === 'string' ? line.trim() : '')).filter(Boolean)
      : [];

    if (this.safehouseDefenseManager) {
      const defenseLines = this.safehouseDefenseManager.getScenarioSummaryLines(
        alertEntry?.id ?? alertEntry?.safehouseAlertId ?? null,
      );
      if (Array.isArray(defenseLines) && defenseLines.length) {
        defenseLines.forEach((line) => {
          if (typeof line === 'string' && line.trim()) {
            details.push(line.trim());
          }
        });
      }
    }

    const metadata = {};
    if (alertEntry?.id) {
      metadata.alertId = alertEntry.id;
    }
    if (choice?.id) {
      metadata.choiceId = choice.id;
    }
    if (alertEntry?.safehouseId) {
      metadata.safehouseId = alertEntry.safehouseId;
    }

    this.recordGarageActivity({
      type: 'safehouse-alert',
      summary: summaryLine,
      details,
      timestamp: resolvedAt,
      metadata: Object.keys(metadata).length ? metadata : undefined,
    });
  }

  normalizeSafehouseIncursions(currentDay = this.state?.day ?? 1) {
    const numericDay = Number.isFinite(currentDay) ? currentDay : null;
    const entries = Array.isArray(this.state?.safehouseIncursions)
      ? this.state.safehouseIncursions
      : [];

    const normalized = entries
      .filter((entry) => entry && typeof entry === 'object' && entry.id)
      .reduce((list, entry) => {
        const status = typeof entry.status === 'string' ? entry.status : 'alert';
        const cooldownEndsOnDay = Number.isFinite(entry.cooldownEndsOnDay)
          ? entry.cooldownEndsOnDay
          : null;

        if (
          status === 'cooldown' &&
          cooldownEndsOnDay !== null &&
          numericDay !== null &&
          numericDay >= cooldownEndsOnDay
        ) {
          this._syncSafehouseDowntimeFromAlert(
            { ...entry, status: 'resolved' },
            { currentDay: numericDay },
          );
          return list;
        }

        const cloned = { ...entry, status };
        list.push(cloned);
        return list;
      }, []);

    if (this.state) {
      this.state.safehouseIncursions = normalized;
    }

    if (numericDay !== null) {
      normalized.forEach((entry) => this._syncSafehouseDowntimeFromAlert(entry, { currentDay: numericDay }));
    }

    return normalized;
  }

  upsertSafehouseAlerts(alerts = []) {
    if (!Array.isArray(alerts) || !alerts.length) {
      return this.normalizeSafehouseIncursions();
    }

    const currentDay = Number.isFinite(this.state?.day) ? this.state.day : null;
    const normalized = this.normalizeSafehouseIncursions(currentDay ?? undefined);
    const indexMap = new Map();
    normalized.forEach((entry, index) => {
      if (entry?.id) {
        indexMap.set(entry.id, index);
      }
    });

    let mutated = false;

    alerts.forEach((alert) => {
      if (!alert || typeof alert !== 'object' || !alert.id) {
        return;
      }

      const payload = {
        id: alert.id,
        label: typeof alert.label === 'string' ? alert.label : alert.id,
        summary: typeof alert.summary === 'string' ? alert.summary : '',
        status: typeof alert.status === 'string' ? alert.status : 'alert',
        severity: typeof alert.severity === 'string' ? alert.severity : 'warning',
        facilityId: alert.facilityId ?? null,
        facilityName: typeof alert.facilityName === 'string' ? alert.facilityName : null,
        heatTier: typeof alert.heatTier === 'string' ? alert.heatTier : null,
        safehouseId: alert.safehouseId ?? null,
        safehouseLabel: typeof alert.safehouseLabel === 'string' ? alert.safehouseLabel : null,
        cooldownDays: Number.isFinite(alert.cooldownDays) ? Math.max(0, alert.cooldownDays) : null,
        triggeredAt: Number.isFinite(alert.triggeredAt) ? alert.triggeredAt : Date.now(),
        resolvedAt: Number.isFinite(alert.resolvedAt) ? alert.resolvedAt : null,
        lastResolutionSummary:
          typeof alert.lastResolutionSummary === 'string' ? alert.lastResolutionSummary : null,
      };

      const downtime = sanitizeFacilityDowntime(alert.downtime ?? alert.facilityDowntime, {
        facilityId: payload.facilityId ?? alert.facilityId ?? null,
        label: payload.facilityName ?? null,
        currentDay,
      });
      payload.downtime = downtime ?? null;
      if (payload.downtime && payload.cooldownDays === null && Number.isFinite(payload.downtime.cooldownDays)) {
        payload.cooldownDays = payload.downtime.cooldownDays;
      }

      if (payload.status === 'alert') {
        payload.resolvedAt = null;
        payload.cooldownEndsOnDay = null;
      } else if (payload.status === 'cooldown') {
        if (Number.isFinite(alert.cooldownEndsOnDay)) {
          payload.cooldownEndsOnDay = alert.cooldownEndsOnDay;
        } else if (payload.downtime && Number.isFinite(payload.downtime.cooldownEndsOnDay)) {
          payload.cooldownEndsOnDay = payload.downtime.cooldownEndsOnDay;
        } else if (payload.cooldownDays !== null && Number.isFinite(currentDay)) {
          payload.cooldownEndsOnDay = currentDay + payload.cooldownDays;
        } else {
          payload.cooldownEndsOnDay = null;
        }
      } else {
        payload.cooldownEndsOnDay = Number.isFinite(alert.cooldownEndsOnDay)
          ? alert.cooldownEndsOnDay
          : null;
      }

      if (payload.downtime) {
        if (!Number.isFinite(payload.downtime.cooldownDays) && Number.isFinite(payload.cooldownDays)) {
          payload.downtime.cooldownDays = payload.cooldownDays;
        }
        if (!Number.isFinite(payload.downtime.cooldownEndsOnDay) && Number.isFinite(payload.cooldownEndsOnDay)) {
          payload.downtime.cooldownEndsOnDay = payload.cooldownEndsOnDay;
        }
        if (!payload.downtime.label && payload.facilityName) {
          payload.downtime.label = payload.facilityName;
        }
        if (!payload.downtime.alertId) {
          payload.downtime.alertId = payload.id;
        }
      }

      if (indexMap.has(payload.id)) {
        const index = indexMap.get(payload.id);
        const existing = { ...normalized[index], ...payload };
        if (payload.downtime === null && normalized[index]?.downtime) {
          existing.downtime = { ...normalized[index].downtime };
        }
        normalized[index] = existing;
        this._syncSafehouseDowntimeFromAlert(existing, { currentDay });
      } else {
        normalized.push(payload);
        indexMap.set(payload.id, normalized.length - 1);
        this._syncSafehouseDowntimeFromAlert(payload, { currentDay });
      }

      mutated = true;
    });

    if (mutated) {
      normalized.sort((a, b) => (b.triggeredAt ?? 0) - (a.triggeredAt ?? 0));
      if (this.state) {
        this.state.safehouseIncursions = normalized;
        this.state.needsHudRefresh = true;
      }
    }

    return normalized;
  }

  markSafehouseAlertResolved(
    alertId,
    { summary = null, resolvedAt = Date.now(), downtime = null } = {},
  ) {
    if (!alertId || !this.state) {
      return null;
    }

    const alerts = Array.isArray(this.state.safehouseIncursions) ? this.state.safehouseIncursions : [];
    const index = alerts.findIndex((entry) => entry?.id === alertId);
    if (index === -1) {
      return null;
    }

    const currentDay = Number.isFinite(this.state.day) ? this.state.day : null;
    const entry = { ...alerts[index] };
    entry.status = 'cooldown';
    entry.resolvedAt = Number.isFinite(resolvedAt) ? resolvedAt : Date.now();
    if (typeof summary === 'string' && summary.trim()) {
      entry.lastResolutionSummary = summary.trim();
    }
    const sanitizedDowntime = sanitizeFacilityDowntime(downtime, {
      facilityId: entry.facilityId ?? null,
      label: entry.facilityName ?? null,
      currentDay,
    });
    if (sanitizedDowntime) {
      if (!Number.isFinite(sanitizedDowntime.startedAt) && Number.isFinite(entry.resolvedAt)) {
        sanitizedDowntime.startedAt = entry.resolvedAt;
      }
      entry.downtime = sanitizedDowntime;
      if (
        !Number.isFinite(entry.cooldownDays) &&
        Number.isFinite(sanitizedDowntime.cooldownDays)
      ) {
        entry.cooldownDays = sanitizedDowntime.cooldownDays;
      }
    } else {
      entry.downtime = null;
    }
    const cooldownDays = Number.isFinite(entry.cooldownDays) ? entry.cooldownDays : null;
    if (cooldownDays !== null && Number.isFinite(currentDay)) {
      entry.cooldownEndsOnDay = currentDay + cooldownDays;
    } else if (!Number.isFinite(entry.cooldownEndsOnDay)) {
      entry.cooldownEndsOnDay = null;
    }

    alerts[index] = entry;
    this.state.safehouseIncursions = alerts;
    this.state.needsHudRefresh = true;
    this._syncSafehouseDowntimeFromAlert(entry, { currentDay });
    if (this.safehouseDefenseManager) {
      this.safehouseDefenseManager.recordResolution(entry, null, {
        summary: summary ?? entry.lastResolutionSummary ?? null,
        resolvedAt: entry.resolvedAt,
      });
    }
    return entry;
  }

  resolveSafehouseAlertChoice(alertId, choiceId) {
    if (!alertId || !choiceId || !this.state) {
      return null;
    }

    const alerts = Array.isArray(this.state.safehouseIncursions) ? this.state.safehouseIncursions : [];
    const index = alerts.findIndex((entry) => entry?.id === alertId);
    if (index === -1) {
      return null;
    }

    const alertEntry = alerts[index];
    const choices = Array.isArray(alertEntry?.choices) ? alertEntry.choices : [];
    const choice = choices.find((entry) => entry?.id === choiceId);
    if (!choice) {
      return null;
    }

    const currentStatus = typeof alertEntry.status === 'string' ? alertEntry.status : 'alert';
    if (currentStatus !== 'alert') {
      return null;
    }

    const mission = this.state.activeMission ?? null;
    if (mission?.pendingDecision?.eventId === alertId) {
      const historyEntry = this.chooseMissionEventOption(alertId, choiceId);
      if (!historyEntry) {
        return null;
      }

      const updatedAlerts = Array.isArray(this.state.safehouseIncursions)
        ? this.state.safehouseIncursions
        : alerts;
      const refreshedIndex = updatedAlerts.findIndex((entry) => entry?.id === alertId);
      const resolvedAlert = refreshedIndex !== -1
        ? { ...updatedAlerts[refreshedIndex] }
        : { ...alertEntry };

      resolvedAlert.lastResolutionChoiceId = choice.id;
      resolvedAlert.lastResolutionChoiceLabel = choice.label ?? null;
      resolvedAlert.updatedAt = Date.now();

      if (refreshedIndex !== -1) {
        updatedAlerts[refreshedIndex] = resolvedAlert;
        this.state.safehouseIncursions = updatedAlerts;
      }

      const facilityDowntimeEffect = historyEntry.effects?.facilityDowntime ?? null;
      const detailLines = this._buildSafehouseAlertDetailLines(resolvedAlert, choice, {
        effectSummary: historyEntry.effectSummary,
        facilityDowntime: facilityDowntimeEffect,
      });

      this._recordSafehouseAlertGarageActivity(resolvedAlert, choice, {
        summary: historyEntry.summary,
        detailLines,
        resolvedAt: historyEntry.resolvedAt ?? Date.now(),
      });

      if (this.safehouseDefenseManager) {
        this.safehouseDefenseManager.recordResolution(resolvedAlert, choice, {
          summary: historyEntry.summary,
          resolvedAt: historyEntry.resolvedAt ?? Date.now(),
        });
      }

      return {
        summary: historyEntry.summary,
        details: detailLines,
      };
    }

    const effects = typeof choice.effects === 'object' && choice.effects !== null ? { ...choice.effects } : {};
    const currentDay = Number.isFinite(this.state?.day) ? this.state.day : null;
    const facilityDowntimeEffect = sanitizeFacilityDowntime(effects.facilityDowntime, {
      facilityId: alertEntry.facilityId ?? null,
      label: alertEntry.facilityName ?? null,
      currentDay,
    });

    const resolvedAt = Date.now();
    const deltaParts = [];
    let heatDeltaApplied = 0;

    if (Number.isFinite(effects.heatDelta) && effects.heatDelta !== 0) {
      const beforeHeat = Number.isFinite(this.state.heat) ? this.state.heat : 0;
      const targetHeat = Math.max(0, Math.min(10, beforeHeat + effects.heatDelta));
      this.state.heat = targetHeat;
      heatDeltaApplied = targetHeat - beforeHeat;
      if (this.heatSystem && typeof this.heatSystem.updateHeatTier === 'function') {
        this.heatSystem.updateHeatTier();
      }
    }

    if (Math.abs(heatDeltaApplied) >= 0.05) {
      deltaParts.push(`${heatDeltaApplied > 0 ? '+' : ''}${heatDeltaApplied.toFixed(1)} heat`);
    }

    if (facilityDowntimeEffect) {
      const downtimeLabel = facilityDowntimeEffect.label ?? alertEntry.facilityName ?? alertEntry.label;
      const downtimeDays = Number.isFinite(facilityDowntimeEffect.cooldownDays)
        ? facilityDowntimeEffect.cooldownDays
        : Number.isFinite(facilityDowntimeEffect.durationDays)
          ? facilityDowntimeEffect.durationDays
          : null;
      if (downtimeDays !== null) {
        deltaParts.push(`${downtimeLabel} offline ${downtimeDays} day${downtimeDays === 1 ? '' : 's'}`);
      } else if (facilityDowntimeEffect.summary) {
        deltaParts.push(facilityDowntimeEffect.summary);
      }
    }

    const summaryParts = [`${alertEntry.label ?? 'Safehouse Alert'}: ${choice.label}`];
    if (choice.narrative) {
      summaryParts.push(choice.narrative);
    }
    if (deltaParts.length) {
      summaryParts.push(deltaParts.join(', '));
    }

    const summary = summaryParts.join(' ').trim() || `${choice.label} resolved.`;
    const downtimeForAlert = facilityDowntimeEffect
      ? { ...facilityDowntimeEffect, startedAt: resolvedAt }
      : null;
    this.markSafehouseAlertResolved(alertId, {
      summary,
      resolvedAt,
      downtime: downtimeForAlert,
    });

    const updatedAlerts = Array.isArray(this.state.safehouseIncursions)
      ? this.state.safehouseIncursions
      : alerts;
    const resolvedAlert = updatedAlerts[index] ? { ...updatedAlerts[index] } : { ...alertEntry };
    resolvedAlert.lastResolutionChoiceId = choice.id;
    resolvedAlert.lastResolutionChoiceLabel = choice.label ?? null;
    resolvedAlert.updatedAt = resolvedAt;
    resolvedAlert.resolvedAt = resolvedAlert.resolvedAt ?? resolvedAt;
    if (!resolvedAlert.choices && choices.length) {
      resolvedAlert.choices = choices;
    }

    updatedAlerts[index] = resolvedAlert;
    this.state.safehouseIncursions = updatedAlerts;
    this.state.needsHudRefresh = true;

    const effectSummary = deltaParts.length ? deltaParts.join(', ') : null;
    const historyEffects = { ...effects };
    if (facilityDowntimeEffect) {
      historyEffects.facilityDowntime = { ...facilityDowntimeEffect };
    }

    const historyEntry = {
      eventId: alertEntry.id,
      eventLabel: alertEntry.label ?? 'Safehouse Alert',
      choiceId: choice.id,
      choiceLabel: choice.label,
      choiceNarrative: choice.narrative ?? null,
      triggeredAt: alertEntry.triggeredAt ?? resolvedAt,
      resolvedAt,
      progressAt: mission ? mission.progress ?? null : null,
      summary,
      effectSummary,
      eventBadges: Array.isArray(alertEntry.badges)
        ? alertEntry.badges.map((badge) => ({ ...badge }))
        : [],
      effects: historyEffects,
      deltas: {
        payout: 0,
        heat: heatDeltaApplied,
        successChance: 0,
        duration: 0,
        crewLoyalty: 0,
      },
    };

    if (mission) {
      mission.eventHistory = Array.isArray(mission.eventHistory) ? mission.eventHistory : [];
      mission.eventHistory.push(historyEntry);
      if (mission.eventHistory.length > 10) {
        mission.eventHistory = mission.eventHistory.slice(-10);
      }
    }

    const detailLines = this._buildSafehouseAlertDetailLines(resolvedAlert, choice, {
      effectSummary,
      facilityDowntime: facilityDowntimeEffect,
    });

    this._recordSafehouseAlertGarageActivity(resolvedAlert, choice, {
      summary,
      detailLines,
      resolvedAt,
    });

    return {
      summary,
      details: detailLines,
    };
  }

  initializeMissionEvents(mission, context = {}) {
    if (!mission) {
      return;
    }

    if (mission.infiltrationState && mission.infiltrationState.status !== 'resolved') {
      mission.infiltrationState = null;
    }
    mission.infiltrationSummary = Array.isArray(mission.infiltrationSummary)
      ? mission.infiltrationSummary.slice(-3)
      : [];

    const fallbackCrackdownTier =
      this.currentCrackdownTier ??
      (this.heatSystem && typeof this.heatSystem.getCurrentTier === 'function'
        ? this.heatSystem.getCurrentTier()
        : null);
    const crackdownTier = mission.crackdownTier ?? mission.activeCrackdownTier ?? fallbackCrackdownTier;

    if (crackdownTier) {
      mission.crackdownTier = crackdownTier;
    }

    let assignedCrew = Array.isArray(context.assignedCrew) ? context.assignedCrew.slice() : null;
    if (!assignedCrew || !assignedCrew.length) {
      const crewPool = Array.isArray(this.state?.crew) ? this.state.crew : [];
      assignedCrew = crewPool.filter((member) => mission.assignedCrewIds?.includes(member?.id));
    }

    const safehouse =
      context.safehouse ?? (this.state ? getActiveSafehouseFromState(this.state) : null);
    const heatTier =
      typeof this.state?.heatTier === 'string'
        ? this.state.heatTier
        : this.heatSystem && typeof this.heatSystem.getCurrentTier === 'function'
          ? this.heatSystem.getCurrentTier()
          : null;

    const missionContext = { ...mission, crackdownTier };
    const baseDeck = buildMissionEventDeck(missionContext, { assignedCrew, safehouse });

    this.normalizeSafehouseIncursions();
    const safehouseEventPayload = buildSafehouseIncursionEvents(missionContext, {
      assignedCrew,
      safehouse,
      heatTier,
    });

    if (Array.isArray(safehouseEventPayload?.alerts) && safehouseEventPayload.alerts.length) {
      this.upsertSafehouseAlerts(safehouseEventPayload.alerts);
    }

    const defenseScenarioByAlert = new Map();
    if (this.safehouseDefenseManager && Array.isArray(safehouseEventPayload?.alerts)) {
      safehouseEventPayload.alerts.forEach((alert) => {
        if (!alert || typeof alert !== 'object') {
          return;
        }
        const scenario = this.safehouseDefenseManager.activateScenario(alert, {
          safehouse,
          heatTier,
          cooldownDays: alert.cooldownDays ?? null,
        });
        if (scenario) {
          alert.defenseScenario = scenario;
          if (alert.id) {
            defenseScenarioByAlert.set(alert.id, scenario);
          }
        }
      });
    }

    const combinedDeck = Array.isArray(baseDeck) ? baseDeck.slice() : [];
    if (Array.isArray(safehouseEventPayload?.events)) {
      safehouseEventPayload.events.forEach((event) => {
        if (!event || typeof event !== 'object') {
          return;
        }

        const cloned = {
          ...event,
          choices: Array.isArray(event.choices) ? event.choices.map((choice) => ({ ...choice })) : [],
          badges: Array.isArray(event.badges) ? event.badges.map((badge) => ({ ...badge })) : [],
          triggered: Boolean(event.triggered),
          resolved: Boolean(event.resolved),
          selectionWeight: Number.isFinite(event.selectionWeight)
            ? event.selectionWeight
            : Number.isFinite(event.baseWeight)
              ? event.baseWeight
              : 1,
        };
        if (event.safehouseAlertId && defenseScenarioByAlert.has(event.safehouseAlertId)) {
          cloned.defenseScenario = defenseScenarioByAlert.get(event.safehouseAlertId);
        }
        combinedDeck.push(cloned);
      });
    }

    combinedDeck.sort((a, b) => {
      if (a.triggerProgress === b.triggerProgress) {
        return (b.selectionWeight ?? 0) - (a.selectionWeight ?? 0);
      }
      return (Number.isFinite(a.triggerProgress) ? a.triggerProgress : 0.5) -
        (Number.isFinite(b.triggerProgress) ? b.triggerProgress : 0.5);
    });

    mission.eventDeck = combinedDeck;
    mission.eventHistory = [];
    mission.pendingDecision = null;
  }

  advanceMissionEvents(mission) {
    if (!mission) {
      return null;
    }

    if (mission.pendingDecision) {
      mission.status = 'decision-required';
      return mission.pendingDecision;
    }

    const deck = Array.isArray(mission.eventDeck) ? mission.eventDeck : [];
    const progress = Number.isFinite(mission.progress) ? mission.progress : 0;

    const nextEvent = deck.find((event) => !event.resolved && progress >= event.triggerProgress);
    if (!nextEvent) {
      return null;
    }

    nextEvent.triggered = true;
    const pendingDecision = {
      eventId: nextEvent.id,
      label: nextEvent.label,
      description: nextEvent.description,
      triggerProgress: nextEvent.triggerProgress,
      triggeredAt: Date.now(),
      poiContext: nextEvent.poiContext ?? null,
      badges: Array.isArray(nextEvent.badges)
        ? nextEvent.badges.map((badge) => ({ ...badge }))
        : [],
      choices: nextEvent.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        description: choice.description,
        narrative: choice.narrative ?? null,
        effects:
          typeof choice.effects === 'object' && choice.effects !== null
            ? { ...choice.effects }
            : {},
      })),
    };

    mission.pendingDecision = pendingDecision;
    mission.status = 'decision-required';
    return pendingDecision;
  }

  _getAssignedCrewMembers(mission) {
    if (!mission) {
      return [];
    }

    const crewPool = Array.isArray(this.state?.crew) ? this.state.crew : [];
    const assignedIds = Array.isArray(mission.assignedCrewIds)
      ? mission.assignedCrewIds
      : [];

    return crewPool.filter((member) => assignedIds.includes(member?.id));
  }

  _maybeTriggerInfiltrationSequence(mission, { assignedCrew = null } = {}) {
    if (!mission) {
      return false;
    }

    const crewMembers = Array.isArray(assignedCrew) ? assignedCrew : this._getAssignedCrewMembers(mission);
    const crewNames = crewMembers.map((member) => member?.name ?? 'Crew member');

    if (!mission.infiltrationState || mission.infiltrationState.status === 'completed') {
      const sequence = createInfiltrationSequence(mission, { crewMembers, crewNames });
      if (!sequence) {
        mission.infiltrationState = null;
        return false;
      }
      mission.infiltrationState = sequence;
      mission.infiltrationSummary = [];
    } else if (Array.isArray(crewNames) && crewNames.length) {
      mission.infiltrationState.crewNames = crewNames.slice();
    }

    const sequence = mission.infiltrationState;
    if (!sequence) {
      return false;
    }

    const nextStep = getNextInfiltrationStep(sequence);
    if (!nextStep) {
      sequence.status = 'resolved';
      sequence.completedAt = sequence.completedAt ?? Date.now();
      return false;
    }

    const pendingDecision = {
      eventId: `${sequence.id}:${nextStep.id}`,
      label: nextStep.label,
      description: nextStep.prompt,
      triggerProgress: 1,
      triggeredAt: Date.now(),
      source: 'infiltration-minigame',
      infiltrationStepId: nextStep.id,
      badges: [
        { type: 'infiltration', icon: nextStep.badgeIcon ?? '🎯', label: 'Infiltration' },
        { type: 'phase', icon: '🗺️', label: nextStep.phaseLabel ?? 'Sequence' },
      ],
      choices: nextStep.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        description: choice.description,
        narrative: choice.narrative ?? null,
        effects: choice.effects ? { ...choice.effects } : {},
      })),
    };

    mission.pendingDecision = pendingDecision;
    mission.status = 'decision-required';
    return true;
  }

  _resolveInfiltrationChoice(mission, pendingDecision, choiceId) {
    if (!mission || !pendingDecision?.infiltrationStepId || !mission.infiltrationState) {
      mission.pendingDecision = null;
      return null;
    }

    const crewMembers = this._getAssignedCrewMembers(mission);
    const resolution = applyInfiltrationChoice(
      mission.infiltrationState,
      pendingDecision.infiltrationStepId,
      choiceId,
    );

    if (!resolution) {
      mission.pendingDecision = null;
      return null;
    }

    const effects = resolution.choice.effects ?? {};
    const before = {
      payout: Number.isFinite(mission.payout) ? mission.payout : 0,
      heat: Number.isFinite(mission.heat) ? mission.heat : 0,
      successChance: this.normalizeSuccessChance(mission),
      duration: sanitizeDuration(mission.duration, mission.difficulty),
    };

    if (Number.isFinite(effects.payoutMultiplier)) {
      mission.payout = Math.max(0, Math.round(before.payout * effects.payoutMultiplier));
    }

    if (Number.isFinite(effects.payoutDelta)) {
      mission.payout = Math.max(0, Math.round((Number.isFinite(mission.payout) ? mission.payout : before.payout) + effects.payoutDelta));
    }

    if (Number.isFinite(effects.heatMultiplier)) {
      mission.heat = Math.max(0, (Number.isFinite(mission.heat) ? mission.heat : before.heat) * effects.heatMultiplier);
    }

    if (Number.isFinite(effects.heatDelta)) {
      mission.heat = Math.max(0, (Number.isFinite(mission.heat) ? mission.heat : before.heat) + effects.heatDelta);
    }

    if (Number.isFinite(effects.successDelta)) {
      mission.successChance = clamp((mission.successChance ?? before.successChance) + effects.successDelta, 0.01, 0.99);
    }

    if (Number.isFinite(effects.durationMultiplier)) {
      const duration = sanitizeDuration(mission.duration, mission.difficulty);
      mission.duration = sanitizeDuration(Math.max(5, Math.round(duration * effects.durationMultiplier)), mission.difficulty);
    }

    if (Number.isFinite(effects.durationDelta)) {
      const duration = sanitizeDuration(mission.duration, mission.difficulty);
      mission.duration = sanitizeDuration(duration + effects.durationDelta, mission.difficulty);
    }

    let crewLoyaltyDelta = 0;
    if (Number.isFinite(effects.crewLoyaltyDelta) && crewMembers.length) {
      const delta = Math.round(effects.crewLoyaltyDelta);
      if (delta !== 0) {
        crewMembers.forEach((member) => {
          if (!member) {
            return;
          }
          if (typeof member.adjustLoyalty === 'function') {
            member.adjustLoyalty(delta);
          } else if (Number.isFinite(member.loyalty)) {
            member.loyalty += delta;
          }
        });
        crewLoyaltyDelta += delta;
      }
    }

    const after = {
      payout: Number.isFinite(mission.payout) ? mission.payout : before.payout,
      heat: Number.isFinite(mission.heat) ? mission.heat : before.heat,
      successChance: this.normalizeSuccessChance(mission),
      duration: sanitizeDuration(mission.duration, mission.difficulty),
    };

    const payoutDelta = after.payout - before.payout;
    const heatDelta = after.heat - before.heat;
    const successDelta = after.successChance - before.successChance;
    const durationDelta = after.duration - before.duration;

    const deltaParts = [];
    if (Math.round(payoutDelta) !== 0) {
      const amount = Math.abs(Math.round(payoutDelta));
      deltaParts.push(`Payout ${payoutDelta > 0 ? '+' : '-'}$${amount.toLocaleString()}`);
    }
    if (Math.abs(heatDelta) >= 0.05) {
      deltaParts.push(`${heatDelta > 0 ? '+' : ''}${heatDelta.toFixed(1)} heat`);
    }
    if (Math.abs(successDelta) >= 0.005) {
      deltaParts.push(`${successDelta > 0 ? '+' : ''}${Math.round(successDelta * 100)}% success`);
    }
    if (Math.abs(durationDelta) >= 1) {
      deltaParts.push(`Duration ${durationDelta > 0 ? '+' : ''}${Math.round(durationDelta)}s`);
    }
    if (crewLoyaltyDelta !== 0) {
      deltaParts.push(`Crew loyalty ${crewLoyaltyDelta > 0 ? '+' : ''}${crewLoyaltyDelta}`);
    }

    const summaryParts = [resolution.historyEntry?.summary ?? `${pendingDecision.label}: ${resolution.choice.label}`];
    if (deltaParts.length) {
      summaryParts.push(deltaParts.join(', '));
    }
    const summary = summaryParts.join(' ').trim();

    mission.pendingDecision = null;
    mission.status = mission.progress >= 1 ? 'awaiting-resolution' : 'in-progress';

    mission.eventHistory = Array.isArray(mission.eventHistory) ? mission.eventHistory : [];
    const historyEntry = {
      eventId: pendingDecision.eventId,
      eventLabel: pendingDecision.label,
      choiceId: resolution.choice.id,
      choiceLabel: resolution.choice.label,
      choiceNarrative: resolution.choice.narrative ?? null,
      triggeredAt: pendingDecision.triggeredAt ?? Date.now(),
      resolvedAt: Date.now(),
      progressAt: mission.progress ?? 1,
      summary,
      effectSummary: deltaParts.length
        ? deltaParts.join(', ')
        : summarizeInfiltrationEffects(effects),
      eventBadges: Array.isArray(pendingDecision.badges)
        ? pendingDecision.badges.map((badge) => ({ ...badge }))
        : [],
      effects: { ...effects },
      deltas: {
        payout: payoutDelta,
        heat: heatDelta,
        successChance: successDelta,
        duration: durationDelta,
        crewLoyalty: crewLoyaltyDelta,
      },
    };
    mission.eventHistory.push(historyEntry);
    if (mission.eventHistory.length > 10) {
      mission.eventHistory = mission.eventHistory.slice(-10);
    }

    mission.infiltrationSummary = Array.isArray(mission.infiltrationState?.history)
      ? mission.infiltrationState.history.map((entry) => entry.summary)
      : [];

    if (this._maybeTriggerInfiltrationSequence(mission, { assignedCrew: crewMembers })) {
      return historyEntry;
    }

    if (mission.progress >= 1) {
      mission.status = 'awaiting-resolution';
      if (!mission.pendingResolution) {
        const { outcome } = this.prepareAutomaticResolution(mission);
        this.resolveMission(mission.id, outcome);
      }
    }

    return historyEntry;
  }

  finalizeMissionProgress(mission) {
    if (!mission) {
      return;
    }

    const duration = sanitizeDuration(mission.duration, mission.difficulty);
    mission.duration = duration;

    const elapsed = Number.isFinite(mission.elapsedTime) ? mission.elapsedTime : 0;
    const reachedEnd = elapsed >= duration || (mission.progress ?? 0) >= 1;

    if (!reachedEnd) {
      mission.progress = Math.min(elapsed / duration, 1);
      return;
    }

    mission.progress = 1;
    mission.elapsedTime = duration;
    mission.completedAt = mission.completedAt ?? Date.now();

    if (mission.pendingDecision) {
      mission.status = 'decision-required';
      return;
    }

    mission.status = 'awaiting-resolution';

    if (this._maybeTriggerInfiltrationSequence(mission)) {
      return;
    }

    if (!mission.pendingResolution) {
      const { outcome } = this.prepareAutomaticResolution(mission);
      this.resolveMission(mission.id, outcome);
    }
  }

  chooseMissionEventOption(eventId, choiceId) {
    const mission = this.state.activeMission;
    if (!mission || mission.status === 'completed') {
      return null;
    }

    const pending = mission.pendingDecision;
    if (!pending || pending.eventId !== eventId) {
      if (pending?.infiltrationStepId) {
        return this._resolveInfiltrationChoice(mission, pending, choiceId);
      }
      return null;
    }

    if (pending?.source === 'infiltration-minigame' || pending?.infiltrationStepId) {
      return this._resolveInfiltrationChoice(mission, pending, choiceId);
    }

    const deck = Array.isArray(mission.eventDeck) ? mission.eventDeck : [];
    const eventEntry = deck.find((entry) => entry.id === eventId);
    if (!eventEntry) {
      return null;
    }

    const choice = eventEntry.choices.find((entry) => entry.id === choiceId);
    if (!choice) {
      return null;
    }

    const crewPool = Array.isArray(this.state?.crew) ? this.state.crew : [];
    const assignedCrew = crewPool.filter((member) => mission.assignedCrewIds?.includes(member.id));

    const before = {
      payout: Number.isFinite(mission.payout) ? mission.payout : 0,
      heat: Number.isFinite(mission.heat) ? mission.heat : 0,
      successChance: this.normalizeSuccessChance(mission),
      duration: sanitizeDuration(mission.duration, mission.difficulty),
    };

    const effects = choice.effects ?? {};
    const currentDay = Number.isFinite(this.state?.day) ? this.state.day : null;
    const futureDebtNotices = [];
    const facilityDowntimeEffect = sanitizeFacilityDowntime(effects.facilityDowntime, {
      facilityId: eventEntry.facilityId ?? null,
      label: eventEntry.facilityName ?? null,
      currentDay,
    });

    if (Number.isFinite(effects.payoutMultiplier)) {
      mission.payout = Math.max(0, Math.round(mission.payout * effects.payoutMultiplier));
    }

    if (Number.isFinite(effects.payoutDelta)) {
      mission.payout = Math.max(0, Math.round(mission.payout + effects.payoutDelta));
    }

    if (Number.isFinite(effects.heatMultiplier)) {
      mission.heat = Math.max(0, mission.heat * effects.heatMultiplier);
    }

    if (Number.isFinite(effects.heatDelta)) {
      mission.heat = Math.max(0, mission.heat + effects.heatDelta);
    }

    if (Number.isFinite(effects.successDelta)) {
      mission.successChance = clamp(mission.successChance + effects.successDelta, 0.01, 0.99);
    }

    if (Number.isFinite(effects.durationMultiplier)) {
      const newDuration = Math.max(5, Math.round(before.duration * effects.durationMultiplier));
      mission.duration = sanitizeDuration(newDuration, mission.difficulty);
    }

    if (Number.isFinite(effects.durationDelta)) {
      const newDuration = before.duration + effects.durationDelta;
      mission.duration = sanitizeDuration(newDuration, mission.difficulty);
    }

    if (effects.futureDebt) {
      const effect = effects.futureDebt;
      const rawAmount =
        typeof effect === 'object' && effect !== null
          ? Number.isFinite(effect.amount)
            ? effect.amount
            : Number(effect.value)
          : Number(effect);
      const amount = Number.isFinite(rawAmount) ? Math.max(0, Math.round(rawAmount)) : 0;
      if (amount > 0) {
        const timestamp = Number.isFinite(effect?.createdAt) ? effect.createdAt : Date.now();
        const debtEntry = {
          id:
            typeof effect?.id === 'string' && effect.id.trim()
              ? effect.id.trim()
              : `debt-${eventEntry.id ?? 'event'}-${timestamp}`,
          amount,
          remaining:
            Number.isFinite(effect?.remaining) && effect.remaining > 0
              ? Math.round(effect.remaining)
              : amount,
          sourceEventId: eventEntry.id ?? null,
          sourceEventLabel: eventEntry.label ?? null,
          sourceChoiceId: choice.id ?? null,
          sourceChoiceLabel: choice.label ?? null,
          notes: typeof effect?.notes === 'string' ? effect.notes : null,
          createdAt: timestamp,
        };
        if (!Array.isArray(this.state.pendingDebts)) {
          this.state.pendingDebts = [];
        }
        this.state.pendingDebts.push(debtEntry);
        futureDebtNotices.push(`Future debt -$${amount.toLocaleString()}`);
      }
    }

    let crewLoyaltyDelta = 0;
    if (Number.isFinite(effects.crewLoyaltyDelta) && effects.crewLoyaltyDelta !== 0) {
      assignedCrew.forEach((member) => {
        if (!member) {
          return;
        }

        if (typeof member.adjustLoyalty === 'function') {
          member.adjustLoyalty(effects.crewLoyaltyDelta);
        } else if (Number.isFinite(member.loyalty)) {
          member.loyalty += effects.crewLoyaltyDelta;
        }

        crewLoyaltyDelta += effects.crewLoyaltyDelta;
      });
    }

    const updatedDuration = sanitizeDuration(mission.duration, mission.difficulty);
    mission.duration = updatedDuration;
    const elapsed = Number.isFinite(mission.elapsedTime) ? mission.elapsedTime : 0;
    mission.progress = Math.min(updatedDuration > 0 ? elapsed / updatedDuration : 0, 1);

    eventEntry.resolved = true;
    eventEntry.resolvedChoiceId = choice.id;
    mission.pendingDecision = null;
    mission.status = 'in-progress';

    const after = {
      payout: Number.isFinite(mission.payout) ? mission.payout : 0,
      heat: Number.isFinite(mission.heat) ? mission.heat : 0,
      successChance: this.normalizeSuccessChance(mission),
      duration: updatedDuration,
    };

    const payoutDelta = after.payout - before.payout;
    const heatDelta = after.heat - before.heat;
    const successDelta = after.successChance - before.successChance;
    const durationDelta = after.duration - before.duration;

    const deltaParts = [];
    if (Math.round(payoutDelta) !== 0) {
      const amount = Math.abs(Math.round(payoutDelta));
      deltaParts.push(`Payout ${payoutDelta > 0 ? '+' : '-'}$${amount.toLocaleString()}`);
    }
    if (Math.abs(heatDelta) >= 0.05) {
      deltaParts.push(`${heatDelta > 0 ? '+' : ''}${heatDelta.toFixed(1)} heat`);
    }
    if (Math.abs(successDelta) >= 0.005) {
      deltaParts.push(`${successDelta > 0 ? '+' : ''}${Math.round(successDelta * 100)}% success`);
    }
    if (Math.abs(durationDelta) >= 1) {
      deltaParts.push(`Duration ${durationDelta > 0 ? '+' : ''}${Math.round(durationDelta)}s`);
    }
    if (facilityDowntimeEffect) {
      const downtimeLabel = facilityDowntimeEffect.label ?? eventEntry.facilityName ?? eventEntry.label;
      const downtimeDays = Number.isFinite(facilityDowntimeEffect.cooldownDays)
        ? facilityDowntimeEffect.cooldownDays
        : Number.isFinite(facilityDowntimeEffect.durationDays)
          ? facilityDowntimeEffect.durationDays
          : null;
      if (downtimeDays !== null) {
        deltaParts.push(
          `${downtimeLabel} offline ${downtimeDays} day${downtimeDays === 1 ? '' : 's'}`,
        );
      } else {
        deltaParts.push(`${downtimeLabel} offline until systems recover`);
      }
    }
    if (crewLoyaltyDelta !== 0) {
      deltaParts.push(`Crew loyalty ${crewLoyaltyDelta > 0 ? '+' : ''}${crewLoyaltyDelta} total`);
    }
    futureDebtNotices.forEach((notice) => {
      if (notice) {
        deltaParts.push(notice);
      }
    });

    const summaryParts = [`${eventEntry.label ?? 'Event'}: ${choice.label}`];
    if (choice.narrative) {
      summaryParts.push(choice.narrative);
    }
    if (deltaParts.length) {
      summaryParts.push(deltaParts.join(', '));
    }
    if (facilityDowntimeEffect) {
      const penaltyLines = Array.isArray(facilityDowntimeEffect.penalties)
        ? facilityDowntimeEffect.penalties
        : [];
      if (penaltyLines.length) {
        summaryParts.push(`Impact: ${penaltyLines.join(' ')}`);
      } else if (facilityDowntimeEffect.summary) {
        summaryParts.push(facilityDowntimeEffect.summary);
      }
    }

    const eventSummary = summaryParts.join(' ').trim() || `${choice.label} resolved.`;

    mission.eventHistory = Array.isArray(mission.eventHistory) ? mission.eventHistory : [];
    const historyEffects =
      typeof choice.effects === 'object' && choice.effects !== null ? { ...choice.effects } : {};
    if (facilityDowntimeEffect) {
      historyEffects.facilityDowntime = { ...facilityDowntimeEffect };
    }

    const resolvedAtTimestamp = Date.now();

    const historyEntry = {
      eventId: eventEntry.id,
      eventLabel: eventEntry.label,
      choiceId: choice.id,
      choiceLabel: choice.label,
      choiceNarrative: choice.narrative ?? null,
      triggeredAt: pending.triggeredAt ?? Date.now(),
      resolvedAt: resolvedAtTimestamp,
      progressAt: pending.triggerProgress ?? mission.progress,
      summary: eventSummary,
      effectSummary: deltaParts.length ? deltaParts.join(', ') : null,
      eventBadges: Array.isArray(eventEntry.badges)
        ? eventEntry.badges.map((badge) => ({ ...badge }))
        : [],
      effects: historyEffects,
      deltas: {
        payout: payoutDelta,
        heat: heatDelta,
        successChance: successDelta,
        duration: durationDelta,
        crewLoyalty: crewLoyaltyDelta,
      },
    };
    mission.eventHistory.push(historyEntry);

    if (mission.eventHistory.length > 10) {
      mission.eventHistory = mission.eventHistory.slice(-10);
    }

    if (eventEntry.safehouseAlertId) {
      const downtimeForAlert = facilityDowntimeEffect
        ? { ...facilityDowntimeEffect, startedAt: resolvedAtTimestamp }
        : null;
      this.markSafehouseAlertResolved(eventEntry.safehouseAlertId, {
        summary: eventSummary,
        resolvedAt: historyEntry.resolvedAt,
        downtime: downtimeForAlert,
      });
    }

    this.advanceMissionEvents(mission);

    if (!mission.pendingDecision && mission.progress >= 1) {
      this.finalizeMissionProgress(mission);
    }

    return historyEntry;
  }

  recordMissionTelemetry(mission, outcome, extras = {}) {
    if (!mission) {
      return null;
    }

    const pending = mission.pendingResolution ?? null;
    const successChance = Number.isFinite(pending?.successChance)
      ? pending.successChance
      : this.normalizeSuccessChance(mission);
    const roll = Number.isFinite(pending?.roll) ? pending.roll : null;
    const automatic = Boolean(pending?.resolvedAutomatically);
    const timestamp = Date.now();

    const outcomeLabel = outcome === 'success' ? 'Success' : 'Failure';
    const chancePercent = Number.isFinite(successChance)
      ? Math.round(successChance * 100)
      : null;
    const rollPercent = Number.isFinite(roll) ? Math.round(roll * 100) : null;

    let summary = `${mission.name} — ${outcomeLabel}`;
    if (rollPercent !== null && chancePercent !== null) {
      summary = `${summary} (rolled ${rollPercent}% vs ${chancePercent}% odds)`;
    }
    if (!automatic) {
      summary = `${summary} (manual resolution)`;
    }

    const eventHistory = Array.isArray(mission.eventHistory) ? mission.eventHistory : [];
    if (eventHistory.length) {
      const highlights = eventHistory
        .map((entry) => {
          const eventLabel = entry?.eventLabel ?? 'Event';
          const choiceLabel = entry?.choiceLabel ?? 'choice';
          return `${eventLabel}: ${choiceLabel}`;
        })
        .join('; ');
      summary = `${summary} — Events: ${highlights}`;
    }

    if (Array.isArray(mission.infiltrationSummary) && mission.infiltrationSummary.length) {
      summary = `${summary} — Infiltration: ${mission.infiltrationSummary.join('; ')}`;
    }

    const falloutEntries = Array.isArray(extras?.fallout) ? extras.fallout : [];
    const followUpEntries = Array.isArray(extras?.followUps) ? extras.followUps : [];
    const debtSettlementEntries = Array.isArray(extras?.debtSettlements)
      ? extras.debtSettlements
      : [];

    const formatFalloutLine = (entry) => {
      if (!entry) {
        return null;
      }

      const name = entry.crewName ?? 'Crew member';
      const status = (entry.status ?? '').toLowerCase();
      if (status === 'captured') {
        return `${name} captured`;
      }
      if (status === 'injured') {
        return `${name} injured`;
      }
      if (status === 'recovered') {
        return `${name} recovered`;
      }
      return null;
    };

    const falloutSummaryLines = falloutEntries
      .map((entry) => formatFalloutLine(entry))
      .filter(Boolean);
    const falloutSummary = falloutSummaryLines.length ? falloutSummaryLines.join('; ') : null;
    if (falloutSummary) {
      summary = `${summary} — Fallout: ${falloutSummary}`;
    }

    const followUpSummaryLines = followUpEntries
      .map((entry) => entry?.name ?? null)
      .filter(Boolean);
    const followUpSummary = followUpSummaryLines.length ? followUpSummaryLines.join('; ') : null;
    if (followUpSummary) {
      summary = `${summary} — Follow-up queued: ${followUpSummary}`;
    }

    if (debtSettlementEntries.length) {
      const totalSettled = debtSettlementEntries.reduce(
        (total, entry) => total + (Number.isFinite(entry?.amount) ? entry.amount : 0),
        0,
      );
      const detailLines = debtSettlementEntries
        .map((entry) => {
          const parts = [];
          if (entry?.sourceEventLabel) {
            parts.push(entry.sourceEventLabel);
          }
          if (entry?.sourceChoiceLabel && entry.sourceChoiceLabel !== entry.sourceEventLabel) {
            parts.push(entry.sourceChoiceLabel);
          }
          if (entry?.notes) {
            parts.push(entry.notes);
          }
          const label = parts.length ? parts.join(' — ') : 'Debt';
          const amountLabel = Number.isFinite(entry?.amount)
            ? `$${Math.round(Math.abs(entry.amount)).toLocaleString()}`
            : '$0';
          const suffix = entry?.fullySettled ? 'cleared' : `remaining $${Math.max(0, Math.round(entry?.remaining ?? 0)).toLocaleString()}`;
          return `${label} (-${amountLabel}, ${suffix})`;
        })
        .filter(Boolean);
      const totalLabel = `$${Math.round(Math.abs(totalSettled)).toLocaleString()}`;
      const detailSummary = detailLines.length ? ` ${detailLines.join('; ')}` : '';
      summary = `${summary} — Debts settled -${totalLabel}.${detailSummary}`;
    }

    if (extras?.storylineSummary) {
      summary = `${summary} — ${extras.storylineSummary}`;
    }

    if (extras?.crackdownSummary) {
      summary = `${summary} — ${extras.crackdownSummary}`;
    }
    if (extras?.notorietySummary) {
      summary = `${summary} — ${extras.notorietySummary}`;
    }
    if (extras?.districtSummary) {
      summary = `${summary} — ${extras.districtSummary}`;
    }

    const clonedFallout = falloutEntries.map((entry) => ({ ...entry }));
    const clonedFollowUps = followUpEntries.map((entry) => ({ ...entry }));

    mission.resolutionDetails = {
      outcome,
      roll,
      successChance,
      automatic,
      timestamp,
      fallout: clonedFallout,
      followUps: clonedFollowUps,
      debtSettlements: debtSettlementEntries.map((entry) => ({ ...entry })),
      districtIntelBefore: mission.districtIntelBefore ? { ...mission.districtIntelBefore } : null,
      districtIntelAfter: mission.districtIntelAfter ? { ...mission.districtIntelAfter } : null,
    };
    mission.pendingResolution = null;
    mission.resolutionRoll = roll;
    mission.resolutionChance = successChance;

    if (!Array.isArray(this.state.missionLog)) {
      this.state.missionLog = [];
    }

    const entry = {
      id: `${mission.id}-${timestamp}`,
      missionId: mission.id,
      missionName: mission.name,
      outcome,
      roll,
      successChance,
      automatic,
      timestamp,
      summary,
      events: eventHistory.map((entry) => ({
        eventId: entry?.eventId ?? null,
        eventLabel: entry?.eventLabel ?? null,
        choiceId: entry?.choiceId ?? null,
        choiceLabel: entry?.choiceLabel ?? null,
        choiceNarrative: entry?.choiceNarrative ?? null,
        effectSummary: entry?.effectSummary ?? null,
        summary: entry?.summary ?? null,
        resolvedAt: entry?.resolvedAt ?? null,
      })),
      fallout: clonedFallout,
      followUps: clonedFollowUps,
      falloutSummary,
      followUpSummary,
      storylineSummary: extras?.storylineSummary ?? null,
      crackdownSummary: extras?.crackdownSummary ?? null,
      notorietySummary: extras?.notorietySummary ?? null,
      districtSummary: extras?.districtSummary ?? null,
      debtSettlements: debtSettlementEntries.map((entry) => ({ ...entry })),
      infiltrationHistory: Array.isArray(mission?.infiltrationState?.history)
        ? mission.infiltrationState.history
            .map((historyEntry) => {
              if (!historyEntry || typeof historyEntry !== 'object') {
                return null;
              }
              return {
                stepId: historyEntry.stepId ?? null,
                stepLabel: historyEntry.stepLabel ?? null,
                choiceId: historyEntry.choiceId ?? null,
                choiceLabel: historyEntry.choiceLabel ?? null,
                narrative: historyEntry.narrative ?? null,
                resolvedAt: historyEntry.resolvedAt ?? null,
                effectSummary: historyEntry.effectSummary ?? null,
                summary: historyEntry.summary ?? null,
                effects: historyEntry.effects && typeof historyEntry.effects === 'object'
                  ? { ...historyEntry.effects }
                  : {},
              };
            })
            .filter(Boolean)
        : Array.isArray(mission?.infiltrationSummary)
        ? mission.infiltrationSummary
            .map((summaryText) =>
              typeof summaryText === 'string' && summaryText.trim()
                ? { summary: summaryText.trim() }
                : null,
            )
            .filter(Boolean)
        : [],
      infiltrationAggregateEffects:
        mission?.infiltrationState?.aggregateEffects &&
        typeof mission.infiltrationState.aggregateEffects === 'object'
          ? { ...mission.infiltrationState.aggregateEffects }
          : null,
      infiltrationSummary: Array.isArray(mission?.infiltrationSummary)
        ? mission.infiltrationSummary.slice()
        : [],
    };

    this.state.missionLog.unshift(entry);
    if (this.state.missionLog.length > 20) {
      this.state.missionLog.length = 20;
    }

    return entry;
  }

  computeCrewImpact(mission, crewMembers = [], vehicle = null) {
    if (!mission) {
      return null;
    }

    const baseDuration = sanitizeDuration(mission.baseDuration ?? mission.duration, mission.difficulty);
    const basePayout = coerceFiniteNumber(mission.basePayout ?? mission.payout, 0);
    const baseSuccessChance = Number.isFinite(mission.baseSuccessChance)
      ? mission.baseSuccessChance
      : deriveBaseSuccessChance(mission.difficulty);
    const baseHeat = Number.isFinite(mission.baseHeat)
      ? mission.baseHeat
      : coerceFiniteNumber(mission.heat, 0);

    const safehouse = this.state ? getActiveSafehouseFromState(this.state) : null;
    const facilityBonuses = safehouse ? computeSafehouseFacilityBonuses(safehouse) : null;

    let durationMultiplier = 1;
    let payoutMultiplier = 1;
    let successBonus = 0;
    let heatMultiplier = 1;
    const summary = [];
    const perkSummary = [];

    const support = buildCrewTraitSupport(crewMembers);
    const chemistryProfile = evaluateCrewChemistry(crewMembers);
    const chemistryMultipliers = chemistryProfile?.memberMultipliers instanceof Map
      ? chemistryProfile.memberMultipliers
      : new Map();

    const playerImpact = computePlayerImpact(mission, this.state?.player ?? null);
    if (playerImpact) {
      durationMultiplier *= playerImpact.durationMultiplier ?? 1;
      payoutMultiplier *= playerImpact.payoutMultiplier ?? 1;
      successBonus += playerImpact.successBonus ?? 0;
      heatMultiplier *= playerImpact.heatMultiplier ?? 1;
    }

    const facilityDurationMultiplier = Number.isFinite(facilityBonuses?.missionDurationMultiplier)
      && facilityBonuses.missionDurationMultiplier > 0
      ? facilityBonuses.missionDurationMultiplier
      : 1;
    const facilityPayoutMultiplier = Number.isFinite(facilityBonuses?.missionPayoutMultiplier)
      && facilityBonuses.missionPayoutMultiplier > 0
      ? facilityBonuses.missionPayoutMultiplier
      : 1;
    const facilitySuccessBonus = Number.isFinite(facilityBonuses?.missionSuccessBonus)
      ? facilityBonuses.missionSuccessBonus
      : 0;
    const facilityHeatMultiplier = Number.isFinite(facilityBonuses?.missionHeatMultiplier)
      && facilityBonuses.missionHeatMultiplier > 0
      ? facilityBonuses.missionHeatMultiplier
      : 1;

    durationMultiplier *= facilityDurationMultiplier;
    payoutMultiplier *= facilityPayoutMultiplier;
    successBonus += facilitySuccessBonus;
    heatMultiplier *= facilityHeatMultiplier;

    crewMembers.forEach((member) => {
      if (!member) {
        return;
      }

      const memberId = member.id !== undefined && member.id !== null ? String(member.id).trim() : null;
      const chemistryMultiplier = memberId && chemistryMultipliers.has(memberId)
        ? chemistryMultipliers.get(memberId)
        : 1;

      const impact = computeCrewMemberTraitImpact(member, mission, {
        support,
        baseHeat,
        vehicle,
        chemistryMultiplier,
      });
      durationMultiplier *= impact?.durationMultiplier ?? 1;
      payoutMultiplier *= impact?.payoutMultiplier ?? 1;
      successBonus += impact?.successBonus ?? 0;
      heatMultiplier *= impact?.heatMultiplier ?? 1;

      if (impact?.summary) {
        summary.push(impact.summary);
      }
      if (Array.isArray(impact?.perkSummaries) && impact.perkSummaries.length) {
        impact.perkSummaries.forEach((entry) => {
          perkSummary.push(`${member.name}: ${entry}`);
        });
      }
    });

    const chemistryLines = [];
    if (chemistryProfile?.summary) {
      chemistryLines.push(`Chemistry: ${chemistryProfile.summary}`);
    }
    if (chemistryProfile?.highlight) {
      chemistryLines.push(`Chemistry boost: ${chemistryProfile.highlight}`);
    }
    if (chemistryProfile?.warning) {
      chemistryLines.push(`⚠️ Chemistry warning: ${chemistryProfile.warning}`);
    }
    for (let index = chemistryLines.length - 1; index >= 0; index -= 1) {
      summary.unshift(chemistryLines[index]);
    }

    durationMultiplier = Math.max(0.5, durationMultiplier);
    payoutMultiplier = Math.max(0.5, payoutMultiplier);

    let combinedHeatMultiplier = heatMultiplier;
    let crewAdjustedHeat = 0;
    let heatAdjustment = 0;
    let adjustedHeat = 0;
    let vehicleImpact = null;

    if (vehicle) {
      const safeSpeed = Math.max(60, coerceFiniteNumber(vehicle.topSpeed, 120));
      const safeAcceleration = Math.max(1, coerceFiniteNumber(vehicle.acceleration, 5));
      const safeHandling = Math.max(1, coerceFiniteNumber(vehicle.handling, 5));
      const rawCondition = Number(vehicle.condition);
      const safeCondition = Number.isFinite(rawCondition) ? clamp(rawCondition, 0, 1) : 1;
      const rawHeat = Number(vehicle.heat);
      const safeHeatRating = Number.isFinite(rawHeat) ? Math.max(0, rawHeat) : 0;

      const modBonuses = typeof vehicle.getModBonuses === 'function'
        ? vehicle.getModBonuses(VEHICLE_UPGRADE_CATALOG)
        : aggregateVehicleModBonuses(vehicle.installedMods, VEHICLE_UPGRADE_CATALOG);

      const effectiveSpeed = Math.max(
        60,
        safeSpeed + (Number.isFinite(modBonuses.topSpeedBonus) ? modBonuses.topSpeedBonus : 0),
      );
      const effectiveAcceleration = Math.max(
        1,
        safeAcceleration
          + (Number.isFinite(modBonuses.accelerationBonus) ? modBonuses.accelerationBonus : 0),
      );
      const effectiveHandling = Math.max(
        1,
        safeHandling + (Number.isFinite(modBonuses.handlingBonus) ? modBonuses.handlingBonus : 0),
      );

      const speedRatio = clamp(effectiveSpeed / 120, 0.5, 1.8);
      const accelerationRatio = clamp(effectiveAcceleration / 5, 0.5, 1.6);
      const handlingRatio = clamp(effectiveHandling / 5, 0.5, 1.6);
      const agilityScore = clamp(speedRatio * 0.6 + accelerationRatio * 0.4, 0.4, 2);
      const conditionPenalty = clamp(1 + (1 - safeCondition) * 0.6, 0.7, 1.6);

      const modDurationMultiplier = Number.isFinite(modBonuses.durationMultiplier)
        && modBonuses.durationMultiplier > 0
        ? clamp(modBonuses.durationMultiplier, 0.25, 1.6)
        : 1;
      durationMultiplier *= modDurationMultiplier;

      const vehicleDurationMultiplier = clamp((1 / agilityScore) * conditionPenalty, 0.6, 1.4);
      durationMultiplier *= vehicleDurationMultiplier;
      durationMultiplier = Math.max(0.35, durationMultiplier);

      const handlingBonus = (handlingRatio - 1) * 0.12;
      const conditionBonus = (safeCondition - 0.6) * 0.08;
      const modSuccessContribution = Number.isFinite(modBonuses.successBonus)
        ? modBonuses.successBonus
        : 0;
      successBonus += handlingBonus + conditionBonus + modSuccessContribution;

      const difficulty = coerceFiniteNumber(mission.difficulty, 1);
      const conditionHeat = Math.max(0, (1 - safeCondition) * (0.8 + 0.2 * difficulty));
      const maneuverMitigation = Math.max(0, handlingRatio - 1) * 0.15;

      const modHeatMultiplier = Number.isFinite(modBonuses.heatMultiplier) && modBonuses.heatMultiplier > 0
        ? clamp(modBonuses.heatMultiplier, 0.2, 2)
        : 1;
      combinedHeatMultiplier *= modHeatMultiplier;
      combinedHeatMultiplier = Math.max(0.2, Math.min(2.5, combinedHeatMultiplier));
      crewAdjustedHeat = Math.max(0, baseHeat * combinedHeatMultiplier);

      const heatFlatAdjustment = Number.isFinite(modBonuses.heatFlatAdjustment)
        ? modBonuses.heatFlatAdjustment
        : 0;
      const vehicleHeatDelta = safeHeatRating * 0.3 + conditionHeat - maneuverMitigation + heatFlatAdjustment;
      heatAdjustment = crewAdjustedHeat - baseHeat + vehicleHeatDelta;
      adjustedHeat = Math.max(0, crewAdjustedHeat + vehicleHeatDelta);

      const wearBaseline = 0.07 + 0.025 * difficulty;
      const wearMitigation = Number.isFinite(modBonuses.wearMitigation)
        ? clamp(modBonuses.wearMitigation, -0.5, 0.75)
        : 0;
      const wearModifierBase = clamp(
        1.1 - (handlingRatio - 1) * 0.35 - (safeCondition - 0.7) * 0.45,
        0.5,
        1.6,
      );
      const wearMitigationFactor = clamp(1 - wearMitigation, 0.3, 1.5);
      const wearOnSuccess = clamp(wearBaseline * wearModifierBase * wearMitigationFactor, 0.02, 0.5);
      const wearOnFailure = clamp(wearOnSuccess * 1.35 + 0.05, 0.04, 0.7);

      const heatGainBase = Math.max(0, 0.12 * difficulty + safeHeatRating * 0.1);
      const heatGainMitigation = Math.max(0, (handlingRatio - 1) * 0.08);
      const modHeatGainMultiplier = Number.isFinite(modBonuses.heatGainMultiplier)
        && modBonuses.heatGainMultiplier > 0
        ? clamp(modBonuses.heatGainMultiplier, 0.2, 2.2)
        : 1;
      const modHeatGainFlat = Number.isFinite(modBonuses.heatGainFlat) ? modBonuses.heatGainFlat : 0;
      const baseHeatGainSuccess = Math.max(0, heatGainBase + conditionHeat * 0.15 - heatGainMitigation);
      const baseHeatGainFailure = baseHeatGainSuccess + 0.15;
      const heatGainOnSuccess = Math.max(
        0,
        baseHeatGainSuccess * modHeatGainMultiplier + modHeatGainFlat,
      );
      const heatGainOnFailure = Math.max(
        0,
        baseHeatGainFailure * modHeatGainMultiplier + modHeatGainFlat,
      );

      const combinedVehicleDurationMultiplier = vehicleDurationMultiplier * modDurationMultiplier;
      const durationDeltaPercent = Math.round((1 - combinedVehicleDurationMultiplier) * 100);
      const successDeltaPercent = Math.round(
        (handlingBonus + conditionBonus + modSuccessContribution) * 100,
      );
      const heatDeltaLabel = Math.abs(heatAdjustment) >= 0.05
        ? `${heatAdjustment > 0 ? '+' : '-'}${Math.abs(heatAdjustment).toFixed(1)} heat`
        : null;

      const vehicleSummaryParts = [];
      if (Math.abs(durationDeltaPercent) >= 1) {
        vehicleSummaryParts.push(
          `${Math.abs(durationDeltaPercent)}% ${durationDeltaPercent > 0 ? 'faster' : 'slower'}`,
        );
      }
      if (Math.abs(successDeltaPercent) >= 1) {
        vehicleSummaryParts.push(
          `${successDeltaPercent > 0 ? '+' : ''}${successDeltaPercent}% success`,
        );
      }
      if (heatDeltaLabel) {
        vehicleSummaryParts.push(heatDeltaLabel);
      }
      if (!vehicleSummaryParts.length) {
        vehicleSummaryParts.push('steady performance');
      }
      summary.push(
        `Vehicle (${vehicle.model ?? 'Crew wheels'}): ${vehicleSummaryParts.join(', ')}.`,
      );

      const installedMods = typeof vehicle.getInstalledMods === 'function'
        ? vehicle.getInstalledMods()
        : Array.isArray(vehicle.installedMods)
          ? vehicle.installedMods.slice()
          : [];
      if (installedMods.length) {
        const upgradeLabels = installedMods
          .map((modId) => VEHICLE_UPGRADE_CATALOG?.[modId]?.label ?? modId)
          .join(', ');
        summary.push(`Vehicle upgrades: ${upgradeLabels}.`);
      }

      const effectivePerformance = typeof vehicle.getEffectivePerformance === 'function'
        ? vehicle.getEffectivePerformance(VEHICLE_UPGRADE_CATALOG)
        : {
            topSpeed: effectiveSpeed,
            acceleration: effectiveAcceleration,
            handling: effectiveHandling,
          };

      vehicleImpact = {
        vehicleId: vehicle.id,
        model: vehicle.model,
        durationMultiplier: combinedVehicleDurationMultiplier,
        durationMultiplierFromVehicle: vehicleDurationMultiplier,
        durationMultiplierFromMods: modDurationMultiplier,
        successContribution: handlingBonus + conditionBonus + modSuccessContribution,
        heatAdjustment,
        heatMultiplier: combinedHeatMultiplier,
        heatMultiplierFromMods: modHeatMultiplier,
        heatFlatFromMods: heatFlatAdjustment,
        wearOnSuccess,
        wearOnFailure,
        heatGainOnSuccess,
        heatGainOnFailure,
        heatGainModifiers: {
          multiplier: modHeatGainMultiplier,
          flat: modHeatGainFlat,
        },
        conditionBefore: safeCondition,
        heatBefore: safeHeatRating,
        installedMods,
        modBonuses,
        effectivePerformance,
      };
    } else {
      combinedHeatMultiplier = Math.max(0.2, Math.min(2.5, combinedHeatMultiplier));
      crewAdjustedHeat = Math.max(0, baseHeat * combinedHeatMultiplier);
      summary.push('Vehicle: No assignment selected.');
      adjustedHeat = crewAdjustedHeat;
      heatAdjustment = crewAdjustedHeat - baseHeat;
    }

    const facilityHeatFlatAdjustment = Number.isFinite(facilityBonuses?.missionHeatFlatAdjustment)
      ? facilityBonuses.missionHeatFlatAdjustment
      : 0;
    if (facilityHeatFlatAdjustment !== 0) {
      adjustedHeat = Math.max(0, adjustedHeat + facilityHeatFlatAdjustment);
      heatAdjustment += facilityHeatFlatAdjustment;
      if (vehicleImpact) {
        vehicleImpact.heatAdjustment = (vehicleImpact.heatAdjustment ?? 0) + facilityHeatFlatAdjustment;
      }
    }

    heatMultiplier = combinedHeatMultiplier;

    if (Array.isArray(facilityBonuses?.missionEffectSummaries) && facilityBonuses.missionEffectSummaries.length) {
      facilityBonuses.missionEffectSummaries.forEach((line) => {
        if (line) {
          summary.push(`Safehouse: ${line}`);
        }
      });
    }

    const adjustedDuration = Math.max(5, Math.round(baseDuration * durationMultiplier));
    const adjustedPayout = Math.round(basePayout * payoutMultiplier);
    const adjustedSuccessChance = Math.max(0.05, Math.min(0.98, baseSuccessChance + successBonus));

    return {
      baseDuration,
      adjustedDuration,
      basePayout,
      adjustedPayout,
      baseSuccessChance,
      adjustedSuccessChance,
      baseHeat,
      adjustedHeat,
      heatAdjustment,
      summary,
      perkSummary,
      durationMultiplier,
      payoutMultiplier,
      successBonus,
      heatMultiplier,
      vehicleImpact,
      playerImpact,
      chemistry: serializeChemistryProfile(chemistryProfile),
    };
  }

  previewCrewAssignment(missionId, crewIds = [], vehicleId = null) {
    const mission = this.availableMissions.find((entry) => entry.id === missionId);
    if (!mission) {
      return null;
    }

    const crewPool = Array.isArray(this.state?.crew) ? this.state.crew : [];
    const crewMembers = crewPool.filter((member) => crewIds.includes(member.id));
    const garage = Array.isArray(this.state?.garage) ? this.state.garage : [];
    const vehicle = vehicleId ? garage.find((entry) => entry?.id === vehicleId) ?? null : null;
    return this.computeCrewImpact(mission, crewMembers, vehicle) ?? null;
  }

  generateInitialContracts() {
    this.availableMissions = this.missionTemplates
      .map((template) => this.createMissionFromTemplate(template))
      .filter(Boolean);

    if (!this.availableMissions.length) {
      this.refreshContractPoolFromCity();
    }

    while (this.availableMissions.length < 3) {
      const mission = this.drawContractFromPool();
      if (!mission) {
        break;
      }
    }

    this.applyHeatRestrictions();
  }

  startMission(missionId, crewIds = [], vehicleId = null) {
    if (this.state.activeMission && this.state.activeMission.status !== 'completed') {
      return null;
    }

    this.syncHeatTier('mission-start');
    this.state.lastVehicleReport = null;

    const mission = this.availableMissions.find((entry) => entry.id === missionId);
    if (!mission || mission.status !== 'available' || mission.restricted) {
      return null;
    }

    const crewPool = Array.isArray(this.state?.crew) ? this.state.crew : [];
    const requestedCrewIds = Array.isArray(crewIds) ? crewIds : [];
    const assignedCrew = crewPool.filter((member) => requestedCrewIds.includes(member.id));

    const crewUnavailable = assignedCrew.some((member) => {
      if (!member) {
        return true;
      }

      if (typeof member.isMissionReady === 'function') {
        return !member.isMissionReady();
      }

      const statusLabel = (member.status ?? 'idle').toLowerCase();
      return statusLabel !== 'idle';
    });
    if (crewUnavailable) {
      return null;
    }

    const garage = Array.isArray(this.state?.garage) ? this.state.garage : [];
    let assignedVehicle = null;

    if (vehicleId) {
      assignedVehicle = garage.find((entry) => entry?.id === vehicleId) ?? null;
      if (!assignedVehicle) {
        return null;
      }
    } else {
      assignedVehicle = garage.find((vehicle) => {
        if (!vehicle) {
          return false;
        }

        const statusLabel = (vehicle.status ?? 'idle').toLowerCase();
        const inUse = Boolean(vehicle.inUse) || statusLabel === 'in-mission';
        const conditionValue = Number(vehicle.condition);
        const operational = !Number.isFinite(conditionValue) || conditionValue > 0.05;
        return operational && !inUse;
      }) ?? null;
    }

    if (assignedVehicle) {
      const vehicleStatus = (assignedVehicle.status ?? 'idle').toLowerCase();
      const vehicleInUse = Boolean(assignedVehicle.inUse) || vehicleStatus === 'in-mission';
      const conditionValue = Number(assignedVehicle.condition);
      const vehicleOperational = !Number.isFinite(conditionValue) || conditionValue > 0.05;

      if (vehicleInUse || !vehicleOperational) {
        if (vehicleId) {
          return null;
        }

        assignedVehicle = null;
      }
    }

    const crewImpact = this.computeCrewImpact(mission, assignedCrew, assignedVehicle ?? null);
    if (crewImpact) {
      mission.duration = crewImpact.adjustedDuration;
      mission.payout = crewImpact.adjustedPayout;
      mission.successChance = crewImpact.adjustedSuccessChance;
      mission.assignedCrewImpact = crewImpact;
      mission.assignedChemistry = crewImpact.chemistry ?? null;
      mission.heat = crewImpact.adjustedHeat;
      mission.assignedVehicleImpact = assignedVehicle ? crewImpact.vehicleImpact : null;
      mission.playerEffectSummary = Array.isArray(crewImpact.playerImpact?.summary)
        ? crewImpact.playerImpact.summary
        : [];
      mission.assignedCrewPerkSummary = Array.isArray(crewImpact.perkSummary)
        ? crewImpact.perkSummary.slice()
        : [];
    } else {
      mission.duration = sanitizeDuration(mission.baseDuration ?? mission.duration, mission.difficulty);
      mission.payout = coerceFiniteNumber(mission.basePayout ?? mission.payout, 0);
      mission.successChance = Number.isFinite(mission.baseSuccessChance)
        ? mission.baseSuccessChance
        : deriveBaseSuccessChance(mission.difficulty);
      mission.assignedCrewImpact = null;
      mission.assignedChemistry = null;
      mission.heat = Number.isFinite(mission.baseHeat)
        ? mission.baseHeat
        : coerceFiniteNumber(mission.heat, 0);
      mission.assignedVehicleImpact = null;
      mission.playerEffectSummary = [];
      mission.assignedCrewPerkSummary = [];
    }

    mission.assignedCrewIds = assignedCrew.map((member) => member.id);
    mission.crewEffectSummary = crewImpact?.summary ?? [];
    mission.crewPerkSummary = crewImpact?.perkSummary ?? [];
    mission.assignedVehicleId = assignedVehicle ? assignedVehicle.id : null;
    mission.assignedVehicleSnapshot = assignedVehicle
      ? {
          condition: Number.isFinite(assignedVehicle.condition) ? assignedVehicle.condition : null,
          heat: Number.isFinite(assignedVehicle.heat) ? assignedVehicle.heat : null,
          installedMods: typeof assignedVehicle.getInstalledMods === 'function'
            ? assignedVehicle.getInstalledMods()
            : Array.isArray(assignedVehicle.installedMods)
              ? assignedVehicle.installedMods.slice()
              : [],
        }
      : null;
    mission.assignedVehicleLabel = assignedVehicle ? assignedVehicle.model ?? 'Assigned vehicle' : null;
    mission.assignedCrewFatigue = computeMissionFatigueImpact(mission);

    assignedCrew.forEach((member) => {
      if (!member) {
        return;
      }

      if (typeof member.beginMission === 'function') {
        member.beginMission();
      } else if (typeof member.setStatus === 'function') {
        member.setStatus('on-mission');
      } else {
        member.status = 'on-mission';
      }
    });

    if (assignedVehicle) {
      if (typeof assignedVehicle.setStatus === 'function') {
        assignedVehicle.setStatus('in-mission');
      } else {
        assignedVehicle.status = 'in-mission';
        assignedVehicle.inUse = true;
      }
    }

    mission.resolutionRoll = null;
    mission.resolutionChance = null;
    mission.pendingResolution = null;
    mission.resolutionDetails = null;
    mission.status = 'in-progress';
    mission.startedAt = Date.now();
    mission.elapsedTime = 0;
    mission.progress = 0;
    const activeSafehouse = getActiveSafehouseFromState(this.state);
    this.initializeMissionEvents(mission, { assignedCrew, safehouse: activeSafehouse });
    this.advanceMissionEvents(mission);
    this.state.activeMission = mission;
    return mission;
  }

  resolveMission(missionId, outcome) {
    this.syncHeatTier(`mission-outcome-${outcome ?? 'resolved'}`);

    const mission = this.availableMissions.find((entry) => entry.id === missionId);
    if (!mission || mission.status === 'available' || mission.status === 'completed') {
      return null;
    }

    const isSuccess = outcome === 'success' && mission.status === 'awaiting-resolution';
    const isFailure =
      outcome === 'failure' &&
      (mission.status === 'awaiting-resolution' || mission.status === 'in-progress');

    if (!(isSuccess || isFailure)) {
      return null;
    }

    mission.status = 'completed';
    mission.outcome = outcome;
    mission.completedAt = Date.now();
    mission.progress = 1;
    mission.elapsedTime = mission.duration;
    this.state.activeMission = null;

    const crackdownPolicy = this.getCurrentCrackdownPolicy();

    const missionDistrict = this.getMissionDistrict(mission);
    const liveDistrictIntel =
      missionDistrict && typeof missionDistrict.getIntelSnapshot === 'function'
        ? missionDistrict.getIntelSnapshot()
        : null;
    const districtIntelBefore = liveDistrictIntel ?? cloneDistrictIntel(mission.districtIntel);

    const crewPool = Array.isArray(this.state?.crew) ? this.state.crew : [];
    const assignedCrew = crewPool.filter((member) => mission.assignedCrewIds?.includes(member.id));
    const garage = Array.isArray(this.state?.garage) ? this.state.garage : [];
    const assignedVehicleId = mission.assignedVehicleId ?? null;
    const assignedVehicle = assignedVehicleId
      ? garage.find((vehicle) => vehicle?.id === assignedVehicleId) ?? null
      : null;
    const vehicleImpact = mission.assignedCrewImpact?.vehicleImpact ?? mission.assignedVehicleImpact ?? null;
    const snapshot = mission.assignedVehicleSnapshot ?? {};
    const preMissionCondition = Number.isFinite(snapshot.condition)
      ? clamp(snapshot.condition, 0, 1)
      : Number.isFinite(assignedVehicle?.condition)
        ? clamp(assignedVehicle.condition, 0, 1)
        : null;
    const preMissionHeat = Number.isFinite(snapshot.heat)
      ? snapshot.heat
      : Number.isFinite(assignedVehicle?.heat)
        ? assignedVehicle.heat
        : null;

    let storageBlockedReport = null;
    let rewardVehicleSummary = null;
    let rewardVehicleReport = null;
    const crewFalloutRecords = [];
    const falloutByCrewId = new Map();
    let queuedFollowUps = [];
    let storylineOutcome = null;
    let crackdownOutcome = null;
    let districtSummary = null;

    const debtSettlements = [];

    if (outcome === 'success') {
      const grossPayout = Number.isFinite(mission.payout) ? Math.max(0, mission.payout) : 0;
      let netPayout = grossPayout;
      const pendingDebts = Array.isArray(this.state.pendingDebts) ? this.state.pendingDebts : [];
      const updatedDebts = [];

      mission.vehicleRewardGranted = false;
      mission.vehicleRewardOutcome = null;
      mission.vehicleRewardDeliveredAt = null;
      mission.vehicleRewardVehicleId = null;

      pendingDebts.forEach((debt) => {
        const outstanding = Number.isFinite(debt?.remaining)
          ? Math.max(0, Math.round(debt.remaining))
          : Number.isFinite(debt?.amount)
            ? Math.max(0, Math.round(debt.amount))
            : 0;
        if (outstanding <= 0) {
          return;
        }
        if (netPayout <= 0) {
          updatedDebts.push({ ...debt, remaining: outstanding });
          return;
        }

        const applied = Math.min(netPayout, outstanding);
        netPayout -= applied;
        const remaining = Math.max(0, outstanding - applied);
        const settlementTimestamp = Date.now();
        debtSettlements.push({
          debtId: debt?.id ?? null,
          amount: applied,
          remaining,
          sourceEventId: debt?.sourceEventId ?? null,
          sourceEventLabel: debt?.sourceEventLabel ?? null,
          sourceChoiceId: debt?.sourceChoiceId ?? null,
          sourceChoiceLabel: debt?.sourceChoiceLabel ?? null,
          notes: debt?.notes ?? null,
          createdAt: debt?.createdAt ?? null,
          settledAt: settlementTimestamp,
          fullySettled: remaining === 0,
        });

        if (remaining > 0) {
          updatedDebts.push({ ...debt, remaining });
        }
      });

      this.state.pendingDebts = updatedDebts;
      this.state.funds += netPayout;
      this.heatSystem.increase(mission.heat);
      if (mission.category === 'crackdown-operation') {
        const effects = mission.crackdownEffects ?? {};
        const heatReduction = Number(effects?.heatReduction);
        if (Number.isFinite(heatReduction) && heatReduction > 0) {
          const mitigation = this.heatSystem.applyMitigation(heatReduction, {
            label: mission.name ?? 'Crackdown operation',
            metadata: {
              category: 'crackdown-operation',
              missionId: mission.id ?? null,
            },
          });
          const appliedReduction = Number.isFinite(mitigation?.reductionApplied)
            ? Math.abs(mitigation.reductionApplied)
            : heatReduction;
          crackdownOutcome = `Crackdown eased — heat -${appliedReduction.toFixed(2)}.`;
        }
      }
      let rewardVehicleAdded = false;
      const rewardProfile = mission.vehicleReward ?? null;
      const storageCapacity = getActiveStorageCapacityFromState(this.state);
      const hasFiniteCapacity = Number.isFinite(storageCapacity) && storageCapacity >= 0;
      const capacityLimit = hasFiniteCapacity ? storageCapacity : Infinity;
      const garageSize = garage.length;

      if (rewardProfile) {
        const storageRequired = Number.isFinite(rewardProfile.storageRequired)
          ? Math.max(1, Math.round(rewardProfile.storageRequired))
          : 1;
        const projectedSize = garageSize + storageRequired;
        const vehicleBlueprint =
          cloneVehicleBlueprint(rewardProfile.vehicleBlueprint ?? null) ??
          { model: rewardProfile.label ?? 'Target Vehicle' };
        const rewardLabel = rewardProfile.label ?? vehicleBlueprint?.model ?? 'Vehicle';

        if (!hasFiniteCapacity || projectedSize <= capacityLimit) {
          const rewardVehicle = new Vehicle(vehicleBlueprint);
          rewardVehicleAdded = true;

          const mechanicScore = assignedCrew
            .filter((member) => (member.specialty ?? '').toLowerCase() === 'mechanic')
            .reduce((total, member) => total + (Number(member.loyalty) || 0), 0);
          const wearReduction = Math.min(0.08, mechanicScore * 0.01);
          const wearAmount = Math.max(0.05, 0.18 - wearReduction);
          if (typeof rewardVehicle.applyWear === 'function') {
            rewardVehicle.applyWear(wearAmount);
          } else if (Number.isFinite(rewardVehicle.condition)) {
            rewardVehicle.condition = Math.max(0, Math.min(1, rewardVehicle.condition - wearAmount));
          }

          if (typeof rewardVehicle.setStatus === 'function') {
            rewardVehicle.setStatus('idle');
          } else {
            rewardVehicle.status = 'idle';
            rewardVehicle.inUse = false;
          }
          if (typeof rewardVehicle.markStolen === 'function') {
            rewardVehicle.markStolen();
          } else {
            rewardVehicle.isStolen = true;
          }

          this.state.garage.push(rewardVehicle);

          const updatedGarageSize = this.state.garage.length;
          const timestamp = Date.now();
          rewardVehicleReport = {
            outcome: 'vehicle-acquired',
            vehicleId: rewardVehicle.id ?? null,
            vehicleModel: rewardLabel,
            missionId: mission.id ?? null,
            missionName: mission.name ?? null,
            garageSize: updatedGarageSize,
            storageCapacity,
            storageRequired,
            timestamp,
            summary: `${rewardLabel} secured from ${mission.name ?? 'the operation'}. ` +
              `${storageRequired === 1 ? 'Requires 1 garage slot.' : `Requires ${storageRequired} garage slots.`}`,
          };
          rewardVehicleSummary = rewardVehicleReport.summary;
          mission.vehicleRewardGranted = true;
          mission.vehicleRewardDeliveredAt = timestamp;
          mission.vehicleRewardVehicleId = rewardVehicle.id ?? null;
        } else {
          const storageNote = storageRequired === 1
            ? 'Requires 1 garage slot.'
            : `Requires ${storageRequired} garage slots.`;
          const summary = `${rewardLabel} couldn't enter the garage — capacity ${garageSize}/${storageCapacity} reached. ` +
            `${storageNote} Sell or scrap a vehicle to free space.`;
          storageBlockedReport = {
            outcome: 'storage-blocked',
            vehicleId: null,
            vehicleModel: rewardLabel,
            garageSize,
            storageCapacity,
            storageRequired,
            summary,
            timestamp: Date.now(),
          };
          rewardVehicleSummary = summary;
          mission.vehicleRewardOutcome = 'blocked';
        }
      }

      assignedCrew.forEach((member) => {
        if (typeof member.adjustLoyalty === 'function') {
          member.adjustLoyalty(1);
        }
      });

      if (rewardVehicleAdded) {
        mission.vehicleRewardOutcome = 'acquired';
      }

      const recoveryTarget = mission.falloutRecovery ?? null;
      if (recoveryTarget?.crewId) {
        const targetCrew = crewPool.find((member) => member?.id === recoveryTarget.crewId) ?? null;
        if (targetCrew) {
          const fallbackStatus = recoveryTarget.type === 'medical' ? 'needs-rest' : 'idle';
          if (typeof targetCrew.clearMissionFallout === 'function') {
            targetCrew.clearMissionFallout({ fallbackStatus });
          } else {
            targetCrew.status = fallbackStatus;
            targetCrew.falloutStatus = null;
            targetCrew.falloutDetails = null;
          }
          if (typeof targetCrew.adjustLoyalty === 'function') {
            targetCrew.adjustLoyalty(1);
          }
          crewFalloutRecords.push({
            crewId: targetCrew.id ?? null,
            crewName: targetCrew.name ?? 'Crew member',
            status: 'recovered',
            recoveryType: recoveryTarget.type ?? 'rescue',
            missionId: mission.id ?? null,
            timestamp: Date.now(),
          });
        }
      }
    } else if (outcome === 'failure') {
      const multiplier = crackdownPolicy.failureHeatMultiplier ?? 2;
      this.heatSystem.increase(mission.heat * multiplier);
      if (mission.category === 'crackdown-operation') {
        const penalty = Number(mission.crackdownEffects?.heatPenaltyOnFailure);
        if (Number.isFinite(penalty) && penalty > 0) {
          this.heatSystem.increase(penalty);
          crackdownOutcome = `Crackdown retaliation — heat +${penalty.toFixed(2)}.`;
        }
      }

      const pending = mission.pendingResolution ?? {};
      const failureSeverity = (() => {
        const roll = Number.isFinite(pending.roll)
          ? pending.roll
          : Number.isFinite(mission.resolutionRoll)
            ? mission.resolutionRoll
            : null;
        const chance = Number.isFinite(pending.successChance)
          ? pending.successChance
          : Number.isFinite(mission.resolutionChance)
            ? mission.resolutionChance
            : Number.isFinite(mission.baseSuccessChance)
              ? mission.baseSuccessChance
              : null;
        if (roll === null || chance === null) {
          const fallback = 0.35 + Math.min(0.4, (mission.difficulty ?? 1) * 0.05);
          return clamp(fallback, 0, 1);
        }
        return clamp(Math.max(0, roll - chance), 0, 1);
      })();
      const captureChance = Math.min(
        0.75,
        0.2 + failureSeverity * 0.6 + Math.max(0, (mission.difficulty ?? 1) - 1) * 0.08,
      );
      const injuryChance = Math.min(
        0.9,
        0.4 + failureSeverity * 0.5 + Math.max(0, (mission.difficulty ?? 1) - 1) * 0.1,
      );
      const severityLabel = failureSeverity > 0.6 ? 'severe' : failureSeverity > 0.3 ? 'moderate' : 'minor';
      const timestamp = Date.now();
      let flaggedCount = 0;

      assignedCrew.forEach((member) => {
        if (!member) {
          return;
        }

        if (typeof member.adjustLoyalty === 'function') {
          member.adjustLoyalty(-1);
        }

        let fallout = null;
        const captureRoll = Math.random();
        if (captureRoll <= captureChance) {
          fallout = {
            crewId: member.id ?? null,
            crewName: member.name ?? 'Crew member',
            status: 'captured',
            severity: severityLabel,
            missionId: mission.id ?? null,
            timestamp,
          };
        } else if (Math.random() <= injuryChance) {
          fallout = {
            crewId: member.id ?? null,
            crewName: member.name ?? 'Crew member',
            status: 'injured',
            severity: severityLabel,
            missionId: mission.id ?? null,
            timestamp,
          };
        }

        if (fallout) {
          flaggedCount += 1;
          crewFalloutRecords.push(fallout);
          if (member.id) {
            falloutByCrewId.set(member.id, fallout);
          }
        }
      });

      if (flaggedCount === 0 && assignedCrew.length) {
        const fallbackMember = assignedCrew.find(Boolean);
        if (fallbackMember) {
          const fallbackEntry = {
            crewId: fallbackMember.id ?? null,
            crewName: fallbackMember.name ?? 'Crew member',
            status: 'injured',
            severity: 'moderate',
            missionId: mission.id ?? null,
            timestamp,
          };
          crewFalloutRecords.push(fallbackEntry);
          if (fallbackMember.id) {
            falloutByCrewId.set(fallbackMember.id, fallbackEntry);
          }
        }
      }

      const recoveryTarget = mission.falloutRecovery ?? null;
      if (recoveryTarget?.crewId) {
        const targetCrew = crewPool.find((member) => member?.id === recoveryTarget.crewId) ?? null;
        if (targetCrew) {
          const normalizedStatus = recoveryTarget.status === 'injured' ? 'injured' : 'captured';
          const targetEntry = {
            crewId: targetCrew.id ?? null,
            crewName: targetCrew.name ?? 'Crew member',
            status: normalizedStatus,
            severity: 'severe',
            missionId: mission.id ?? null,
            timestamp,
            notes: 'Follow-up objective remains unresolved.',
          };
          crewFalloutRecords.push(targetEntry);
          if (typeof targetCrew.applyMissionFallout === 'function') {
            targetCrew.applyMissionFallout(targetEntry);
          } else {
            targetCrew.status = normalizedStatus;
            targetCrew.falloutStatus = normalizedStatus;
            targetCrew.falloutDetails = targetEntry;
          }
        }
      }

      const dedupedFallout = new Map();
      crewFalloutRecords.forEach((entry) => {
        const key = entry?.crewId ?? `${entry?.crewName ?? 'crew'}-${dedupedFallout.size}`;
        dedupedFallout.set(key, entry);
      });
      crewFalloutRecords.splice(0, crewFalloutRecords.length, ...dedupedFallout.values());

      const idGenerator = () => {
        this.state.followUpSequence += 1;
        return `fallout-${this.state.followUpSequence}`;
      };
      const falloutTemplates =
        typeof this.falloutContractFactory === 'function'
          ? this.falloutContractFactory({
              mission,
              falloutEntries: crewFalloutRecords,
              createId: idGenerator,
            })
          : [];
      queuedFollowUps = this.queueFalloutContracts(falloutTemplates);
    }

    if (mission.storyline?.type === 'crew-loyalty') {
      const targetCrew = crewPool.find((member) => member?.id === mission.storyline.crewId) ?? null;
      if (targetCrew) {
        const storylineResult = applyCrewStorylineOutcome(targetCrew, mission.storyline.stepId, outcome);
        if (storylineResult) {
          const parts = [];
          if (mission.storyline.crewName) {
            parts.push(mission.storyline.crewName);
          }
          if (storylineResult.summary) {
            parts.push(storylineResult.summary);
          }
          if (Number.isFinite(storylineResult.loyaltyDelta) && storylineResult.loyaltyDelta !== 0) {
            parts.push(`Loyalty ${storylineResult.loyaltyDelta > 0 ? '+' : ''}${storylineResult.loyaltyDelta}`);
          }
          const traitAdjustments = Object.entries(storylineResult.traitBoosts ?? {})
            .filter(([, delta]) => Number.isFinite(delta) && delta !== 0)
            .map(([trait, delta]) => `${trait}+${delta}`);
          if (traitAdjustments.length) {
            parts.push(`Traits ${traitAdjustments.join(', ')}`);
          }
          if (storylineResult.perkAwarded) {
            parts.push(`Perk unlocked: ${storylineResult.perkAwarded}`);
          }
          storylineOutcome = parts.join(' — ');
        }
      }
    }

    if (mission.category === 'crackdown-operation') {
      this.syncHeatTier('crackdown-operation');
    }

    const notorietyChange = computeMissionNotorietyDelta(mission, outcome, crackdownPolicy);
    const notorietyBefore = this.getPlayerNotoriety();
    let notorietyAfter = notorietyBefore;
    if (notorietyChange !== 0) {
      notorietyAfter = this.adjustPlayerNotoriety(notorietyChange, { reason: `mission-${outcome}` });
      mission.notorietyDelta = notorietyChange;
      mission.notorietyBefore = notorietyBefore;
      mission.notorietyAfter = notorietyAfter;
    }

    if (missionDistrict && typeof missionDistrict.applyMissionOutcome === 'function') {
      const shift = missionDistrict.applyMissionOutcome(outcome, {
        difficulty: mission.baseDifficulty ?? mission.difficulty,
        heat: mission.baseHeat ?? mission.heat,
        payout: mission.basePayout ?? mission.payout,
        notorietyDelta: notorietyChange ?? 0,
      });
      const afterSnapshot = shift?.after ?? missionDistrict.getIntelSnapshot?.() ?? null;
      const beforeSnapshot = shift?.before ?? districtIntelBefore ?? null;

      if (afterSnapshot) {
        mission.districtIntelAfter = { ...afterSnapshot };
        mission.districtIntel = { ...afterSnapshot };
        const targetDistrictId = missionDistrict?.id ?? mission.districtId;
        this.updateCachedDistrictIntel(targetDistrictId, afterSnapshot);
      }

      if (beforeSnapshot) {
        mission.districtIntelBefore = { ...beforeSnapshot };
      }

      const summaryParts = [];
      const recordDelta = (label, key, invert = false) => {
        const beforeValue = beforeSnapshot?.[key];
        const afterValue = afterSnapshot?.[key];
        if (!Number.isFinite(beforeValue) || !Number.isFinite(afterValue)) {
          return;
        }
        const difference = afterValue - beforeValue;
        if (!difference) {
          return;
        }
        const adjustedDifference = invert ? -difference : difference;
        const formattedDelta =
          adjustedDifference > 0
            ? `+${Math.round(adjustedDifference)}`
            : Math.round(adjustedDifference).toString();
        summaryParts.push(`${label} ${formattedDelta}`);
      };

      recordDelta('Influence', 'influence');
      recordDelta('Intel', 'intelLevel');
      recordDelta('Crackdown', 'crackdownPressure', true);

      if (summaryParts.length) {
        const districtLabel = missionDistrict.name ?? mission.districtName ?? 'District';
        districtSummary = `${districtLabel} — ${summaryParts.join(', ')}`;
      }
    } else if (districtIntelBefore) {
      mission.districtIntelBefore = { ...districtIntelBefore };
    }

    let vehicleReport = null;
    if (assignedVehicle) {
      const wearAmount = (() => {
        const value = Number.isFinite(
          outcome === 'success' ? vehicleImpact?.wearOnSuccess : vehicleImpact?.wearOnFailure,
        )
          ? outcome === 'success'
            ? vehicleImpact.wearOnSuccess
            : vehicleImpact.wearOnFailure
          : 0.12;
        return Math.max(0, value);
      })();

      const heatGainAmount = (() => {
        const value = Number.isFinite(
          outcome === 'success' ? vehicleImpact?.heatGainOnSuccess : vehicleImpact?.heatGainOnFailure,
        )
          ? outcome === 'success'
            ? vehicleImpact.heatGainOnSuccess
            : vehicleImpact.heatGainOnFailure
          : 0.2;
        return Math.max(0, value);
      })();

      const originalCondition = Number.isFinite(assignedVehicle.condition)
        ? clamp(assignedVehicle.condition, 0, 1)
        : null;
      const originalHeat = Number.isFinite(assignedVehicle.heat) ? assignedVehicle.heat : null;

      if (typeof assignedVehicle.applyWear === 'function') {
        assignedVehicle.applyWear(wearAmount);
      } else if (Number.isFinite(assignedVehicle.condition)) {
        assignedVehicle.condition = clamp(assignedVehicle.condition - wearAmount, 0, 1);
      }

      if (typeof assignedVehicle.modifyHeat === 'function') {
        assignedVehicle.modifyHeat(heatGainAmount);
      } else if (Number.isFinite(assignedVehicle.heat)) {
        assignedVehicle.heat = Math.max(0, assignedVehicle.heat + heatGainAmount);
      }

      if (typeof assignedVehicle.setStatus === 'function') {
        assignedVehicle.setStatus('idle');
      } else {
        assignedVehicle.status = 'idle';
        assignedVehicle.inUse = false;
      }

      const finalCondition = Number.isFinite(assignedVehicle.condition)
        ? clamp(assignedVehicle.condition, 0, 1)
        : null;
      const finalHeat = Number.isFinite(assignedVehicle.heat) ? assignedVehicle.heat : null;

      vehicleReport = {
        vehicleId: assignedVehicle.id,
        vehicleModel: assignedVehicle.model,
        missionName: mission.name,
        outcome,
        conditionBefore: preMissionCondition ?? originalCondition,
        conditionAfter: finalCondition,
        conditionDelta:
          finalCondition !== null && (preMissionCondition ?? originalCondition) !== null
            ? finalCondition - (preMissionCondition ?? originalCondition)
            : null,
        heatBefore: preMissionHeat ?? originalHeat,
        heatAfter: finalHeat,
        heatDelta:
          finalHeat !== null && (preMissionHeat ?? originalHeat) !== null
            ? finalHeat - (preMissionHeat ?? originalHeat)
            : null,
      };
    }

    const missionFatigue = Number.isFinite(mission.assignedCrewFatigue)
      ? mission.assignedCrewFatigue
      : computeMissionFatigueImpact(mission);

    assignedCrew.forEach((member) => {
      if (!member) {
        return;
      }

      const fallout = member?.id ? falloutByCrewId.get(member.id) ?? null : null;

      if (typeof member.finishMission === 'function') {
        member.finishMission({ fatigueImpact: missionFatigue, mission, outcome, fallout });
      } else if (typeof member.setStatus === 'function') {
        if (fallout?.status) {
          member.setStatus(fallout.status);
          member.falloutStatus = fallout.status;
          member.falloutDetails = fallout;
        } else {
          member.setStatus('idle');
        }
      } else {
        if (fallout?.status) {
          member.status = fallout.status;
          member.falloutStatus = fallout.status;
          member.falloutDetails = fallout;
        } else {
          member.status = 'idle';
        }
      }
    });

    const participantIds = assignedCrew
      .map((member) => (member?.id !== undefined && member?.id !== null ? String(member.id).trim() : null))
      .filter((id) => id);
    if (participantIds.length >= 2) {
      const stressLevel = computeMissionStressLevel(mission, { outcome, falloutByCrewId });
      assignedCrew.forEach((member) => {
        if (!member || typeof member.applyMissionRelationshipShift !== 'function') {
          return;
        }
        member.applyMissionRelationshipShift({
          crewIds: participantIds,
          outcome,
          falloutByCrewId,
          stressLevel,
        });
      });
      const chemistryProfile = evaluateCrewChemistry(assignedCrew);
      this.recordCrewRelationshipMilestone(assignedCrew, chemistryProfile, {
        missionId: mission.id ?? null,
        missionName: mission.name ?? null,
        outcome,
      });
    }

    const followUpSummaries = queuedFollowUps.map((entry) => ({
      id: entry?.id ?? null,
      name: entry?.name ?? null,
      type: entry?.falloutRecovery?.type ?? null,
      crewId: entry?.falloutRecovery?.crewId ?? null,
      crewName: entry?.falloutRecovery?.crewName ?? null,
    }));

    const telemetryExtras = {
      fallout: crewFalloutRecords,
      followUps: followUpSummaries,
    };

    if (debtSettlements.length) {
      telemetryExtras.debtSettlements = debtSettlements.map((entry) => ({ ...entry }));
      mission.debtSettlements = debtSettlements.map((entry) => ({ ...entry }));
    } else {
      mission.debtSettlements = [];
    }

    if (storylineOutcome) {
      telemetryExtras.storylineSummary = storylineOutcome;
    }
    if (crackdownOutcome) {
      telemetryExtras.crackdownSummary = crackdownOutcome;
    }
    if (notorietyChange !== 0) {
      const formattedChange = notorietyChange > 0 ? `+${notorietyChange.toFixed(1)}` : notorietyChange.toFixed(1);
      telemetryExtras.notorietySummary = `Notoriety ${formattedChange} (now ${notorietyAfter.toFixed(1)})`;
    }
    if (districtSummary) {
      telemetryExtras.districtSummary = districtSummary;
    }
    if (rewardVehicleSummary) {
      telemetryExtras.vehicleRewardSummary = rewardVehicleSummary;
    }

    this.recordMissionTelemetry(mission, outcome, telemetryExtras);

    mission.pendingDecision = null;
    mission.eventDeck = [];
    mission.eventHistory = [];

    mission.assignedCrewIds = [];
    mission.assignedCrewImpact = null;
    mission.assignedCrewPerkSummary = [];
    mission.crewEffectSummary = [];
    mission.crewPerkSummary = [];
    mission.assignedVehicleId = null;
    mission.assignedVehicleImpact = null;
    mission.assignedVehicleSnapshot = null;
    mission.assignedVehicleLabel = null;
    mission.assignedCrewFatigue = null;

    if (vehicleReport) {
      this.state.lastVehicleReport = vehicleReport;
    }

    if (rewardVehicleReport) {
      this.state.lastVehicleReport = rewardVehicleReport;
    }

    if (storageBlockedReport) {
      this.state.lastVehicleReport = storageBlockedReport;
    }

    const isCampaignMilestoneMission = Boolean(mission.campaignMilestone?.milestoneId);
    if (isCampaignMilestoneMission && mission.outcome === 'success') {
      this.purgeCampaignMilestoneTemplates(mission.campaignMilestone.milestoneId);
    } else {
      this.respawnMissionTemplate(mission.id);
    }

    this.refreshContractPoolFromCity({ resolvedMission: mission });
    this.ensureCrewStorylineContracts();
    this.ensureCrackdownOperations(this.currentCrackdownTier);
    this.drawContractFromPool();
    this.applyHeatRestrictions();

    return mission;
  }

  getVehicleFromGarage(vehicleId) {
    if (!vehicleId) {
      return null;
    }

    const garage = Array.isArray(this.state?.garage) ? this.state.garage : [];
    return garage.find((vehicle) => vehicle?.id === vehicleId) ?? null;
  }

  performMaintenance(vehicleId, type, economySystem, overrides = {}) {
    if (!type || (type !== 'repair' && type !== 'heat')) {
      return {
        success: false,
        reason: 'unsupported-maintenance',
        type,
      };
    }

    const vehicle = this.getVehicleFromGarage(vehicleId);
    if (!vehicle) {
      return {
        success: false,
        reason: 'vehicle-not-found',
        type,
      };
    }

    if (!Number.isFinite(this.state?.funds)) {
      this.state.funds = 0;
    }

    const profile = {
      ...(GARAGE_MAINTENANCE_CONFIG[type] ?? {}),
      ...(overrides ?? {}),
    };
    const rawCost = Number(profile.cost);
    const cost = Number.isFinite(rawCost) && rawCost > 0 ? rawCost : 0;
    const fundsAvailable = this.state.funds;

    if (fundsAvailable < cost) {
      return {
        success: false,
        reason: 'insufficient-funds',
        type,
        cost,
        fundsAvailable,
      };
    }

    if (cost > 0) {
      if (economySystem && typeof economySystem.adjustFunds === 'function') {
        economySystem.adjustFunds(-cost);
      } else {
        this.state.funds -= cost;
      }
    }

    const originalCondition = Number.isFinite(vehicle.condition)
      ? clamp(vehicle.condition, 0, 1)
      : 1;
    const originalHeat = Number.isFinite(vehicle.heat) ? Math.max(0, vehicle.heat) : 0;

    let conditionAfter = originalCondition;
    let heatAfter = originalHeat;

    if (type === 'repair') {
      const boost = Number(profile.conditionBoost);
      const normalizedBoost = Number.isFinite(boost) && boost > 0 ? boost : 0;
      const targetCondition = clamp(originalCondition + normalizedBoost, 0, 1);
      vehicle.condition = targetCondition;
      conditionAfter = targetCondition;
    }

    if (type === 'heat') {
      const reduction = Number(profile.heatReduction);
      const normalizedReduction = Number.isFinite(reduction) && reduction > 0 ? reduction : 0;
      if (typeof vehicle.modifyHeat === 'function') {
        vehicle.modifyHeat(-normalizedReduction);
        heatAfter = Number.isFinite(vehicle.heat) ? Math.max(0, vehicle.heat) : 0;
      } else {
        const nextHeat = Math.max(0, originalHeat - normalizedReduction);
        vehicle.heat = nextHeat;
        heatAfter = nextHeat;
      }
    }

    const conditionDelta = conditionAfter - originalCondition;
    const heatDelta = heatAfter - originalHeat;

    this.state.lastVehicleReport = {
      vehicleId: vehicle.id,
      vehicleModel: vehicle.model,
      outcome: 'maintenance',
      maintenanceType: type,
      maintenanceCost: cost,
      conditionBefore: originalCondition,
      conditionAfter,
      conditionDelta,
      heatBefore: originalHeat,
      heatAfter,
      heatDelta,
      timestamp: Date.now(),
    };

    return {
      success: true,
      type,
      cost,
      conditionBefore: originalCondition,
      conditionAfter,
      conditionDelta,
      heatBefore: originalHeat,
      heatAfter,
      heatDelta,
    };
  }

  repairVehicleCondition(vehicleId, economySystem, overrides = {}) {
    return this.performMaintenance(vehicleId, 'repair', economySystem, overrides);
  }

  reduceVehicleHeat(vehicleId, economySystem, overrides = {}) {
    return this.performMaintenance(vehicleId, 'heat', economySystem, overrides);
  }

  purchaseVehicleUpgrade(vehicleId, upgradeId, economySystem, overrides = {}) {
    if (!upgradeId) {
      return {
        success: false,
        reason: 'unknown-upgrade',
        upgradeId,
      };
    }

    const vehicle = this.getVehicleFromGarage(vehicleId);
    if (!vehicle) {
      return {
        success: false,
        reason: 'vehicle-not-found',
        vehicleId,
        upgradeId,
      };
    }

    const profile = {
      ...(VEHICLE_UPGRADE_CATALOG?.[upgradeId] ?? {}),
      ...(overrides ?? {}),
    };

    if (!profile.id) {
      return {
        success: false,
        reason: 'unknown-upgrade',
        vehicleId,
        upgradeId,
      };
    }

    const installedMods = typeof vehicle.getInstalledMods === 'function'
      ? vehicle.getInstalledMods()
      : Array.isArray(vehicle.installedMods)
        ? vehicle.installedMods.slice()
        : [];

    if (installedMods.includes(profile.id)) {
      return {
        success: false,
        reason: 'already-installed',
        vehicleId,
        upgradeId: profile.id,
      };
    }

    if (!Number.isFinite(this.state?.funds)) {
      this.state.funds = 0;
    }

    const rawCost = Number(profile.cost);
    const cost = Number.isFinite(rawCost) && rawCost > 0 ? Math.round(rawCost) : 0;
    const fundsAvailable = this.state.funds;

    if (fundsAvailable < cost) {
      return {
        success: false,
        reason: 'insufficient-funds',
        vehicleId,
        upgradeId: profile.id,
        cost,
        fundsAvailable,
      };
    }

    if (cost > 0) {
      if (economySystem && typeof economySystem.adjustFunds === 'function') {
        economySystem.adjustFunds(-cost);
      } else {
        this.state.funds -= cost;
      }
    }

    if (typeof vehicle.installMod === 'function') {
      vehicle.installMod(profile.id, VEHICLE_UPGRADE_CATALOG);
    } else {
      const nextMods = new Set(installedMods);
      nextMods.add(profile.id);
      vehicle.installedMods = Array.from(nextMods);
      if (typeof vehicle.refreshModBonuses === 'function') {
        vehicle.refreshModBonuses(VEHICLE_UPGRADE_CATALOG);
      }
    }

    const refreshedMods = typeof vehicle.getInstalledMods === 'function'
      ? vehicle.getInstalledMods()
      : Array.isArray(vehicle.installedMods)
        ? vehicle.installedMods.slice()
        : [];

    const modBonuses = typeof vehicle.getModBonuses === 'function'
      ? vehicle.getModBonuses(VEHICLE_UPGRADE_CATALOG)
      : aggregateVehicleModBonuses(refreshedMods, VEHICLE_UPGRADE_CATALOG);

    this.state.lastVehicleReport = {
      vehicleId: vehicle.id,
      vehicleModel: vehicle.model,
      outcome: 'upgrade',
      upgradeId: profile.id,
      upgradeLabel: profile.label ?? profile.id,
      cost,
      installedMods: refreshedMods,
      modBonuses,
      timestamp: Date.now(),
    };

    const logDetails = [];
    if (cost > 0) {
      logDetails.push(`Spent ${formatFunds(cost)}`);
    }

    this.recordGarageActivity({
      type: 'upgrade-purchase',
      summary: `Installed ${profile.label ?? profile.id} on ${vehicle.model ?? 'vehicle'} via purchase.`,
      details: logDetails,
      timestamp: this.state.lastVehicleReport.timestamp,
    });

    return {
      success: true,
      vehicleId: vehicle.id,
      vehicleModel: vehicle.model,
      upgradeId: profile.id,
      upgradeLabel: profile.label ?? profile.id,
      cost,
      installedMods: refreshedMods,
      modBonuses,
    };
  }

  craftVehicleMod(vehicleId, modId, economySystem, overrides = {}) {
    if (!modId) {
      return {
        success: false,
        reason: 'unknown-upgrade',
        modId,
        vehicleId,
      };
    }

    const vehicle = this.getVehicleFromGarage(vehicleId);
    if (!vehicle) {
      return {
        success: false,
        reason: 'vehicle-not-found',
        vehicleId,
        modId,
      };
    }

    const baseRecipe = getVehicleModRecipe(modId);
    if (!baseRecipe) {
      return {
        success: false,
        reason: 'unknown-upgrade',
        vehicleId,
        modId,
      };
    }

    const recipe = {
      ...baseRecipe,
      partsCost: Number.isFinite(overrides?.partsCost)
        ? Math.max(0, Math.round(overrides.partsCost))
        : baseRecipe.partsCost,
      fundsCost: Number.isFinite(overrides?.fundsCost)
        ? Math.max(0, Math.round(overrides.fundsCost))
        : baseRecipe.fundsCost,
    };

    const installedMods = typeof vehicle.getInstalledMods === 'function'
      ? vehicle.getInstalledMods()
      : Array.isArray(vehicle.installedMods)
        ? vehicle.installedMods.slice()
        : [];

    if (installedMods.includes(recipe.modId)) {
      return {
        success: false,
        reason: 'already-installed',
        vehicleId,
        modId: recipe.modId,
      };
    }

    if (!Number.isFinite(this.state.partsInventory)) {
      this.state.partsInventory = 0;
    } else {
      this.state.partsInventory = Math.max(0, Math.round(this.state.partsInventory));
    }

    if (!Number.isFinite(this.state.funds)) {
      this.state.funds = 0;
    }

    const partsAvailable = this.state.partsInventory;
    const fundsAvailable = this.state.funds;

    const affordability = assessVehicleModAffordability(recipe, {
      partsAvailable,
      fundsAvailable,
    });

    if (!affordability.affordable) {
      const reason = affordability.partsShortfall > 0 ? 'insufficient-parts' : 'insufficient-funds';
      return {
        success: false,
        reason,
        vehicleId,
        modId: recipe.modId,
        partsRequired: recipe.partsCost,
        fundsRequired: recipe.fundsCost,
        partsAvailable,
        fundsAvailable,
        partsShortfall: affordability.partsShortfall,
        fundsShortfall: affordability.fundsShortfall,
      };
    }

    if (recipe.fundsCost > 0) {
      if (economySystem && typeof economySystem.adjustFunds === 'function') {
        economySystem.adjustFunds(-recipe.fundsCost);
      } else {
        this.state.funds -= recipe.fundsCost;
      }
    }

    if (recipe.partsCost > 0) {
      this.state.partsInventory = Math.max(0, this.state.partsInventory - recipe.partsCost);
    }

    if (typeof vehicle.installMod === 'function') {
      vehicle.installMod(recipe.modId, VEHICLE_UPGRADE_CATALOG);
    } else {
      const nextMods = new Set(installedMods);
      nextMods.add(recipe.modId);
      vehicle.installedMods = Array.from(nextMods);
      if (typeof vehicle.refreshModBonuses === 'function') {
        vehicle.refreshModBonuses(VEHICLE_UPGRADE_CATALOG);
      }
    }

    const refreshedMods = typeof vehicle.getInstalledMods === 'function'
      ? vehicle.getInstalledMods()
      : Array.isArray(vehicle.installedMods)
        ? vehicle.installedMods.slice()
        : [];

    const modBonuses = typeof vehicle.getModBonuses === 'function'
      ? vehicle.getModBonuses(VEHICLE_UPGRADE_CATALOG)
      : aggregateVehicleModBonuses(refreshedMods, VEHICLE_UPGRADE_CATALOG);

    const modProfile = VEHICLE_UPGRADE_CATALOG?.[recipe.modId] ?? null;

    const report = {
      vehicleId: vehicle.id,
      vehicleModel: vehicle.model,
      outcome: 'crafting',
      upgradeId: recipe.modId,
      upgradeLabel: modProfile?.label ?? recipe.modId,
      cost: recipe.fundsCost,
      partsSpent: recipe.partsCost,
      fundsSpent: recipe.fundsCost,
      partsRemaining: this.state.partsInventory,
      installedMods: refreshedMods,
      modBonuses,
      timestamp: Date.now(),
    };

    this.state.lastVehicleReport = report;

    const logDetails = [];
    if (recipe.partsCost > 0) {
      logDetails.push(`${recipe.partsCost} parts consumed`);
    }
    if (recipe.fundsCost > 0) {
      logDetails.push(`Spent ${formatFunds(recipe.fundsCost)}`);
    }
    logDetails.push(`Parts remaining: ${this.state.partsInventory}`);

    this.recordGarageActivity({
      type: 'crafting',
      summary: `Fabricated ${modProfile?.label ?? recipe.modId} for ${vehicle.model ?? 'vehicle'}.`,
      details: logDetails,
      timestamp: report.timestamp,
      partsInventory: this.state.partsInventory,
    });

    return {
      success: true,
      vehicleId: vehicle.id,
      vehicleModel: vehicle.model,
      modId: recipe.modId,
      upgradeLabel: modProfile?.label ?? recipe.modId,
      cost: recipe.fundsCost,
      partsSpent: recipe.partsCost,
      fundsSpent: recipe.fundsCost,
      partsRemaining: this.state.partsInventory,
      installedMods: refreshedMods,
      modBonuses,
      report,
    };
  }

  estimateVehicleDisposition(vehicleOrId, overrides = {}) {
    const vehicle =
      typeof vehicleOrId === 'object' && vehicleOrId !== null
        ? vehicleOrId
        : this.getVehicleFromGarage(vehicleOrId);

    if (!vehicle) {
      return {
        success: false,
        reason: 'vehicle-not-found',
        vehicleId: typeof vehicleOrId === 'object' ? vehicleOrId?.id ?? null : vehicleOrId,
      };
    }

    const config = {
      ...DEFAULT_DISPOSITION_CONFIG,
      ...(overrides ?? {}),
    };

    const baseValueOverride = Number(config.baseValue);
    const baseValue = Number.isFinite(baseValueOverride) && baseValueOverride > 0
      ? Math.round(baseValueOverride)
      : computeVehicleBaseValue(vehicle);

    const condition = Number.isFinite(vehicle.condition) ? clamp(vehicle.condition, 0, 1) : 1;

    const saleMultiplier = Number.isFinite(config.saleMultiplier) ? config.saleMultiplier : 0.68;
    const scrapMultiplier = Number.isFinite(config.scrapMultiplier) ? config.scrapMultiplier : 0.32;

    const saleValue = normalizeFunds(baseValue * condition * Math.max(0, saleMultiplier));
    const scrapValue = normalizeFunds(baseValue * condition * Math.max(0, scrapMultiplier));

    const partsFactor = Number.isFinite(config.partsPerTenThousandValue)
      ? Math.max(0, config.partsPerTenThousandValue)
      : DEFAULT_DISPOSITION_CONFIG.partsPerTenThousandValue;

    const partsRecovered = Math.max(
      0,
      Math.round(((baseValue / 10000) * condition * partsFactor) || 0),
    );

    return {
      success: true,
      vehicleId: vehicle.id,
      vehicleModel: vehicle.model,
      baseValue,
      condition,
      saleValue,
      scrapValue,
      partsRecovered,
    };
  }

  finalizeVehicleDisposition(vehicle, {
    outcome,
    fundsDelta = null,
    salePrice = null,
    scrapValue = null,
    partsRecovered = null,
  }) {
    if (!vehicle) {
      return null;
    }

    const normalizedSalePrice = Number.isFinite(salePrice) && salePrice >= 0
      ? Math.round(salePrice)
      : null;
    const normalizedScrapValue = Number.isFinite(scrapValue) && scrapValue >= 0
      ? Math.round(scrapValue)
      : null;
    const normalizedParts = Number.isFinite(partsRecovered) && partsRecovered >= 0
      ? Math.round(partsRecovered)
      : null;

    let normalizedFunds = Number.isFinite(fundsDelta) ? Math.round(fundsDelta) : null;
    if (!Number.isFinite(normalizedFunds)) {
      normalizedFunds = normalizedSalePrice ?? normalizedScrapValue ?? 0;
    }
    const creditedFunds = Math.max(0, normalizedFunds ?? 0);

    if (!Number.isFinite(this.state?.funds)) {
      this.state.funds = 0;
    }

    if (creditedFunds) {
      this.state.funds += creditedFunds;
    }

    if (!Number.isFinite(this.state.partsInventory)) {
      this.state.partsInventory = 0;
    }

    const appliedParts = normalizedParts !== null && normalizedParts > 0 ? normalizedParts : 0;
    if (appliedParts > 0) {
      this.state.partsInventory = Math.max(0, Math.round(this.state.partsInventory + appliedParts));
    }

    const conditionBefore = Number.isFinite(vehicle.condition)
      ? clamp(vehicle.condition, 0, 1)
      : null;
    const heatBefore = Number.isFinite(vehicle.heat) ? vehicle.heat : null;

    const report = {
      vehicleId: vehicle.id,
      vehicleModel: vehicle.model,
      outcome,
      salePrice: normalizedSalePrice,
      scrapValue: normalizedScrapValue,
      partsRecovered: normalizedParts,
      fundsDelta: creditedFunds,
      conditionBefore,
      conditionAfter: null,
      conditionDelta: null,
      heatBefore,
      heatAfter: null,
      heatDelta: null,
      timestamp: Date.now(),
      partsRemaining: Number.isFinite(this.state.partsInventory)
        ? this.state.partsInventory
        : null,
    };

    this.state.lastVehicleReport = report;

    const details = [];
    if (appliedParts > 0) {
      details.push(`${appliedParts} parts recovered (now ${this.state.partsInventory})`);
    }
    if (creditedFunds > 0) {
      details.push(`Credited ${formatFunds(creditedFunds)}`);
    }

    const actionLabel = (() => {
      if (outcome === 'sale') {
        return 'Sold';
      }
      if (outcome === 'scrap') {
        return 'Scrapped';
      }
      return 'Processed';
    })();

    this.recordGarageActivity({
      type: outcome ?? 'disposition',
      summary: `${actionLabel} ${vehicle.model ?? 'vehicle'}.`,
      details,
      timestamp: report.timestamp,
      partsInventory: this.state.partsInventory,
    });
    return report;
  }

  sellVehicle(vehicleId, overrides = {}) {
    const garage = Array.isArray(this.state?.garage) ? this.state.garage : [];
    const vehicleIndex = garage.findIndex((vehicle) => vehicle?.id === vehicleId);

    if (vehicleIndex === -1) {
      return { success: false, reason: 'vehicle-not-found', vehicleId };
    }

    const vehicle = garage[vehicleIndex];
    const statusLabel = (vehicle.status ?? '').toLowerCase();
    const vehicleInUse = Boolean(vehicle.inUse) || statusLabel === 'in-mission';
    const activeMissionVehicleId = this.state?.activeMission?.assignedVehicleId ?? null;

    if (vehicleInUse || activeMissionVehicleId === vehicleId) {
      return { success: false, reason: 'vehicle-in-use', vehicleId };
    }

    const disposition = this.estimateVehicleDisposition(vehicle, overrides);
    const saleOverride = Number(overrides?.salePrice);
    const salePrice = Number.isFinite(saleOverride) && saleOverride >= 0
      ? Math.round(saleOverride)
      : disposition.saleValue;

    garage.splice(vehicleIndex, 1);

    const payout = Math.max(0, salePrice);
    const report = this.finalizeVehicleDisposition(vehicle, {
      outcome: 'sale',
      salePrice: salePrice,
      fundsDelta: payout,
    });

    return {
      success: true,
      vehicleId: vehicle.id,
      vehicleModel: vehicle.model,
      salePrice: payout,
      fundsDelta: report?.fundsDelta ?? payout,
      condition: Number.isFinite(vehicle.condition) ? clamp(vehicle.condition, 0, 1) : null,
      report,
    };
  }

  dismantleVehicle(vehicleId, overrides = {}) {
    const garage = Array.isArray(this.state?.garage) ? this.state.garage : [];
    const vehicleIndex = garage.findIndex((vehicle) => vehicle?.id === vehicleId);

    if (vehicleIndex === -1) {
      return { success: false, reason: 'vehicle-not-found', vehicleId };
    }

    const vehicle = garage[vehicleIndex];
    const statusLabel = (vehicle.status ?? '').toLowerCase();
    const vehicleInUse = Boolean(vehicle.inUse) || statusLabel === 'in-mission';
    const activeMissionVehicleId = this.state?.activeMission?.assignedVehicleId ?? null;

    if (vehicleInUse || activeMissionVehicleId === vehicleId) {
      return { success: false, reason: 'vehicle-in-use', vehicleId };
    }

    const disposition = this.estimateVehicleDisposition(vehicle, overrides);

    const scrapOverride = Number(overrides?.scrapValue);
    const scrapValue = Number.isFinite(scrapOverride) && scrapOverride >= 0
      ? Math.round(scrapOverride)
      : disposition.scrapValue;

    const partsOverride = Number(overrides?.partsRecovered);
    const partsRecovered = Number.isFinite(partsOverride) && partsOverride >= 0
      ? Math.round(partsOverride)
      : disposition.partsRecovered;

    garage.splice(vehicleIndex, 1);

    const payout = Math.max(0, scrapValue);
    const report = this.finalizeVehicleDisposition(vehicle, {
      outcome: 'scrap',
      scrapValue: scrapValue,
      partsRecovered,
      fundsDelta: payout,
    });

    return {
      success: true,
      vehicleId: vehicle.id,
      vehicleModel: vehicle.model,
      scrapValue: payout,
      partsRecovered,
      fundsDelta: report?.fundsDelta ?? payout,
      condition: Number.isFinite(vehicle.condition) ? clamp(vehicle.condition, 0, 1) : null,
      report,
    };
  }

  update(delta) {
    this.syncHeatTier('mission-tick');

    const mission = this.state.activeMission;
    if (!mission || mission.status === 'completed') {
      return;
    }

    if (mission.pendingDecision) {
      mission.status = 'decision-required';
      return;
    }

    if (mission.status === 'awaiting-resolution') {
      if (!mission.pendingResolution) {
        const { outcome } = this.prepareAutomaticResolution(mission);
        this.resolveMission(mission.id, outcome);
      }
      return;
    }

    if (mission.status === 'decision-required') {
      return;
    }

    mission.elapsedTime = (mission.elapsedTime ?? 0) + delta;
    const duration = sanitizeDuration(mission.duration, mission.difficulty);
    mission.duration = duration;
    mission.progress = Math.min(mission.elapsedTime / duration, 1);

    this.advanceMissionEvents(mission);

    if (mission.pendingDecision) {
      mission.status = 'decision-required';
      return;
    }

    if (mission.progress >= 1) {
      this.finalizeMissionProgress(mission);
    }
  }
}

MissionSystem.prototype.getCurrentCrackdownPolicy = function getCurrentCrackdownPolicy() {
  const tier = this.currentCrackdownTier ?? this.heatSystem.getCurrentTier();
  return crackdownPolicies[tier] ?? crackdownPolicies.calm;
};

MissionSystem.prototype.syncHeatTier = function syncHeatTier(reason = 'system-sync') {
  const latestTier = this.heatSystem.getCurrentTier();
  if (this.currentCrackdownTier !== latestTier) {
    const previousTier = typeof this.currentCrackdownTier === 'string'
      ? this.currentCrackdownTier.toLowerCase()
      : 'unknown';
    this.currentCrackdownTier = latestTier;
    this.ensureCrackdownOperations(latestTier);
    this.applyHeatRestrictions();
    this.applyCrackdownNotorietyShift(previousTier, latestTier);

    if (!Array.isArray(this.state.crackdownHistory)) {
      this.state.crackdownHistory = [];
    }

    const normalizedReason = typeof reason === 'string' && reason.trim()
      ? reason.trim()
      : 'system-sync';
    const normalizedLatestTier = typeof latestTier === 'string' ? latestTier.toLowerCase() : 'unknown';

    this.state.crackdownHistory.unshift({
      timestamp: Date.now(),
      previousTier,
      newTier: normalizedLatestTier,
      reason: normalizedReason,
    });

    if (this.state.crackdownHistory.length > 30) {
      this.state.crackdownHistory.length = 30;
    }
  } else {
    this.ensureCrackdownOperations(latestTier);
  }
};

MissionSystem.prototype.applyHeatRestrictions = function applyHeatRestrictions() {
  const policy = this.getCurrentCrackdownPolicy();
  const maxHeat = policy.maxMissionHeat ?? Infinity;

  this.availableMissions.forEach((mission) => {
    if (!mission || mission.status !== 'available') {
      mission.restricted = false;
      mission.restrictionReason = null;
      return;
    }

    if (mission.falloutRecovery) {
      mission.restricted = false;
      mission.restrictionReason = 'Priority crew fallout response.';
      return;
    }

    if (mission.ignoreCrackdownRestrictions) {
      mission.restricted = false;
      mission.restrictionReason = null;
      return;
    }

    if (mission.heat > maxHeat) {
      mission.restricted = true;
      mission.restrictionReason = `Unavailable during ${policy.label.toLowerCase()} crackdown`;
    } else {
      mission.restricted = false;
      mission.restrictionReason = null;
    }
  });
};

MissionSystem.prototype.getPlayerNotoriety = function getPlayerNotoriety() {
  if (!this.state.player || typeof this.state.player !== 'object') {
    this.state.player = { notoriety: 0 };
  }

  const notoriety = normalizeNotoriety(this.state.player.notoriety);
  this.state.player.notoriety = notoriety;
  return notoriety;
};

MissionSystem.prototype.adjustPlayerNotoriety = function adjustPlayerNotoriety(delta, options = {}) {
  if (!Number.isFinite(delta) || delta === 0) {
    return this.getPlayerNotoriety();
  }

  const cap = Number.isFinite(options.cap) ? options.cap : null;
  const current = this.getPlayerNotoriety();
  let next = current + delta;
  if (cap !== null) {
    next = Math.min(next, cap);
  }
  next = Math.max(0, Math.round(next * 10) / 10);

  this.state.player.notoriety = next;
  this.state.lastNotorietyUpdate = {
    timestamp: Date.now(),
    delta,
    notoriety: next,
    reason: options.reason ?? null,
  };

  return next;
};

MissionSystem.prototype.getPlayerNotorietyProfile = function getPlayerNotorietyProfile() {
  const notoriety = this.getPlayerNotoriety();
  return getNotorietyProfile(notoriety);
};

MissionSystem.prototype.applyCrackdownNotorietyShift = function applyCrackdownNotorietyShift(
  previousTier,
  nextTier,
) {
  const previousPressure = CRACKDOWN_NOTORIETY_PRESSURE[previousTier] ?? 0;
  const nextPressure = CRACKDOWN_NOTORIETY_PRESSURE[nextTier] ?? 0;
  const delta = nextPressure - previousPressure;

  if (!delta) {
    return this.getPlayerNotoriety();
  }

  return this.adjustPlayerNotoriety(delta, {
    reason: 'crackdown-shift',
  });
};

export {
  MissionSystem,
  GARAGE_MAINTENANCE_CONFIG,
  PLAYER_SKILL_CONFIG,
  PLAYER_GEAR_CATALOG,
  VEHICLE_UPGRADE_CATALOG,
  NOTORIETY_LEVELS,
  getNotorietyProfile,
  getNextNotorietyProfile,
  CRACKDOWN_NOTORIETY_PRESSURE,
};
