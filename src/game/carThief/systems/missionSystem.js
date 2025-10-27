import { Vehicle } from '../entities/vehicle.js';
import { CREW_TRAIT_KEYS, CREW_FATIGUE_CONFIG } from '../entities/crewMember.js';
import { HeatSystem } from './heatSystem.js';
import { generateContractsFromDistricts } from './contractFactory.js';
import { buildMissionEventDeck } from './missionEvents.js';
import { getActiveStorageCapacityFromState } from '../world/safehouse.js';

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

const REQUIRED_TEMPLATE_FIELDS = ['id', 'name'];

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

const computeCrewMemberTraitImpact = (member, mission) => {
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
    const contributionStrength = aboveBase * Math.max(0.5, synergy) * loyaltyBoost * difficultyFactor;

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

  const durationMultiplier = Math.max(
    0.3,
    (1 - totals.durationReduction) * (Number.isFinite(backgroundEffects.durationMultiplier)
      ? backgroundEffects.durationMultiplier
      : 1),
  );

  const payoutMultiplier = Math.max(
    0.4,
    (1 + totals.payoutBonus) * (Number.isFinite(backgroundEffects.payoutMultiplier)
      ? backgroundEffects.payoutMultiplier
      : 1),
  );

  const heatMultiplier = Math.max(
    0.2,
    Math.min(
      2.5,
      (1 - totals.heatReduction + totals.heatIncrease) * (Number.isFinite(backgroundEffects.heatMultiplier)
        ? backgroundEffects.heatMultiplier
        : 1),
    ),
  );

  const successBonus = totals.successBonus + (Number.isFinite(backgroundEffects.successBonus)
    ? backgroundEffects.successBonus
    : 0);

  const summary = summarizeCrewEffect(member, {
    durationDelta: durationMultiplier - 1,
    payoutDelta: payoutMultiplier - 1,
    successDelta: successBonus,
    heatDelta: heatMultiplier - 1,
  });

  const perkLabel = member?.background?.perkLabel;
  const summaryWithPerk = perkLabel ? `${summary} — ${perkLabel}` : summary;

  return {
    durationMultiplier,
    payoutMultiplier,
    heatMultiplier,
    successBonus,
    summary: summaryWithPerk,
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
  },
  {
    id: 'dockyard-swap',
    name: 'Dockyard Switcheroo',
    difficulty: 1,
    payout: 8000,
    heat: 1,
    duration: 28,
    description: 'Intercept a shipment of luxury SUVs before it leaves the harbor.',
  },
  {
    id: 'collector-estate',
    name: "Collector's Estate",
    difficulty: 3,
    payout: 22000,
    heat: 3,
    duration: 55,
    description: 'Infiltrate a fortified mansion and extract a mint condition classic.',
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

    this.currentCrackdownTier = this.heatSystem.getCurrentTier();

    if (!Array.isArray(this.state.missionLog)) {
      this.state.missionLog = [];
    }

    this.refreshContractPoolFromCity();
    this.applyHeatRestrictions();
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

    const payout = coerceFiniteNumber(template.payout, 0);
    const heat = coerceFiniteNumber(template.heat, 0);
    const difficulty = coerceFiniteNumber(template.difficulty, 1);
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
    const vehicleConfig =
      typeof template.vehicle === 'object' && template.vehicle !== null
        ? template.vehicle
        : { model: 'Target Vehicle' };

    return {
      ...template,
      pointOfInterest,
      payout,
      basePayout: payout,
      heat,
      baseHeat: heat,
      difficulty,
      vehicle: new Vehicle(vehicleConfig),
      status: 'available',
      restricted: false,
      restrictionReason: null,
      elapsedTime: 0,
      progress: 0,
      duration,
      baseDuration: duration,
      successChance: baseSuccessChance,
      baseSuccessChance,
      startedAt: null,
      completedAt: null,
      outcome: null,
      resolutionRoll: null,
      resolutionChance: null,
      pendingResolution: null,
      resolutionDetails: null,
      assignedCrewIds: [],
      assignedCrewImpact: null,
      crewEffectSummary: [],
      playerEffectSummary: [],
      assignedVehicleId: null,
      assignedVehicleImpact: null,
      assignedVehicleSnapshot: null,
      assignedVehicleLabel: null,
      eventDeck: [],
      eventHistory: [],
      pendingDecision: null,
    };
  }

  refreshContractPoolFromCity() {
    if (typeof this.contractFactory !== 'function') {
      return;
    }

    const districts = this.state?.city?.districts ?? [];
    if (!Array.isArray(districts) || !districts.length) {
      return;
    }

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
        this.contractPool.push({ ...template });
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

  initializeMissionEvents(mission) {
    if (!mission) {
      return;
    }

    const fallbackCrackdownTier =
      this.currentCrackdownTier ??
      (this.heatSystem && typeof this.heatSystem.getCurrentTier === 'function'
        ? this.heatSystem.getCurrentTier()
        : null);
    const crackdownTier = mission.crackdownTier ?? mission.activeCrackdownTier ?? fallbackCrackdownTier;

    if (crackdownTier) {
      mission.crackdownTier = crackdownTier;
    }

    mission.eventDeck = buildMissionEventDeck({ ...mission, crackdownTier });
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
      return null;
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
    if (crewLoyaltyDelta !== 0) {
      deltaParts.push(`Crew loyalty ${crewLoyaltyDelta > 0 ? '+' : ''}${crewLoyaltyDelta} total`);
    }

    const summaryParts = [];
    if (choice.narrative) {
      summaryParts.push(choice.narrative);
    }
    if (deltaParts.length) {
      summaryParts.push(deltaParts.join(', '));
    }

    const eventSummary = summaryParts.join(' ').trim() || `${choice.label} resolved.`;

    mission.eventHistory = Array.isArray(mission.eventHistory) ? mission.eventHistory : [];
    const historyEntry = {
      eventId: eventEntry.id,
      eventLabel: eventEntry.label,
      choiceId: choice.id,
      choiceLabel: choice.label,
      choiceNarrative: choice.narrative ?? null,
      triggeredAt: pending.triggeredAt ?? Date.now(),
      resolvedAt: Date.now(),
      progressAt: pending.triggerProgress ?? mission.progress,
      summary: eventSummary,
      effectSummary: deltaParts.length ? deltaParts.join(', ') : null,
      effects:
        typeof choice.effects === 'object' && choice.effects !== null
          ? { ...choice.effects }
          : {},
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

    this.advanceMissionEvents(mission);

    if (!mission.pendingDecision && mission.progress >= 1) {
      this.finalizeMissionProgress(mission);
    }

    return historyEntry;
  }

  recordMissionTelemetry(mission, outcome) {
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

    mission.resolutionDetails = {
      outcome,
      roll,
      successChance,
      automatic,
      timestamp,
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

    let durationMultiplier = 1;
    let payoutMultiplier = 1;
    let successBonus = 0;
    let heatMultiplier = 1;
    const summary = [];

    const playerImpact = computePlayerImpact(mission, this.state?.player ?? null);
    if (playerImpact) {
      durationMultiplier *= playerImpact.durationMultiplier ?? 1;
      payoutMultiplier *= playerImpact.payoutMultiplier ?? 1;
      successBonus += playerImpact.successBonus ?? 0;
      heatMultiplier *= playerImpact.heatMultiplier ?? 1;
    }

    crewMembers.forEach((member) => {
      if (!member) {
        return;
      }

      const impact = computeCrewMemberTraitImpact(member, mission);
      durationMultiplier *= impact?.durationMultiplier ?? 1;
      payoutMultiplier *= impact?.payoutMultiplier ?? 1;
      successBonus += impact?.successBonus ?? 0;
      heatMultiplier *= impact?.heatMultiplier ?? 1;

      if (impact?.summary) {
        summary.push(impact.summary);
      }
    });

    durationMultiplier = Math.max(0.5, durationMultiplier);
    payoutMultiplier = Math.max(0.5, payoutMultiplier);

    heatMultiplier = Math.max(0.2, Math.min(2.5, heatMultiplier));

    const crewAdjustedHeat = Math.max(0, baseHeat * heatMultiplier);
    let heatAdjustment = crewAdjustedHeat - baseHeat;
    let adjustedHeat = crewAdjustedHeat;
    let vehicleImpact = null;

    if (vehicle) {
      const safeSpeed = Math.max(60, coerceFiniteNumber(vehicle.topSpeed, 120));
      const safeAcceleration = Math.max(1, coerceFiniteNumber(vehicle.acceleration, 5));
      const safeHandling = Math.max(1, coerceFiniteNumber(vehicle.handling, 5));
      const rawCondition = Number(vehicle.condition);
      const safeCondition = Number.isFinite(rawCondition) ? clamp(rawCondition, 0, 1) : 1;
      const rawHeat = Number(vehicle.heat);
      const safeHeatRating = Number.isFinite(rawHeat) ? Math.max(0, rawHeat) : 0;

      const speedRatio = clamp(safeSpeed / 120, 0.5, 1.8);
      const accelerationRatio = clamp(safeAcceleration / 5, 0.5, 1.6);
      const handlingRatio = clamp(safeHandling / 5, 0.5, 1.6);
      const agilityScore = clamp(speedRatio * 0.6 + accelerationRatio * 0.4, 0.4, 2);
      const conditionPenalty = clamp(1 + (1 - safeCondition) * 0.6, 0.7, 1.6);
      const vehicleDurationMultiplier = clamp((1 / agilityScore) * conditionPenalty, 0.6, 1.4);

      durationMultiplier *= vehicleDurationMultiplier;
      durationMultiplier = Math.max(0.35, durationMultiplier);

      const handlingBonus = (handlingRatio - 1) * 0.12;
      const conditionBonus = (safeCondition - 0.6) * 0.08;
      successBonus += handlingBonus + conditionBonus;

      const difficulty = coerceFiniteNumber(mission.difficulty, 1);
      const conditionHeat = Math.max(0, (1 - safeCondition) * (0.8 + 0.2 * difficulty));
      const maneuverMitigation = Math.max(0, handlingRatio - 1) * 0.15;
      const vehicleHeatDelta = safeHeatRating * 0.3 + conditionHeat - maneuverMitigation;
      heatAdjustment = crewAdjustedHeat - baseHeat + vehicleHeatDelta;
      adjustedHeat = Math.max(0, crewAdjustedHeat + vehicleHeatDelta);

      const wearBaseline = 0.07 + 0.025 * difficulty;
      const wearModifier = clamp(
        1.1 - (handlingRatio - 1) * 0.35 - (safeCondition - 0.7) * 0.45,
        0.5,
        1.6,
      );
      const wearOnSuccess = clamp(wearBaseline * wearModifier, 0.02, 0.5);
      const wearOnFailure = clamp(wearOnSuccess * 1.35 + 0.05, 0.04, 0.7);

      const heatGainBase = Math.max(0, 0.12 * difficulty + safeHeatRating * 0.1);
      const heatGainMitigation = Math.max(0, (handlingRatio - 1) * 0.08);
      const heatGainOnSuccess = Math.max(0, heatGainBase + conditionHeat * 0.15 - heatGainMitigation);
      const heatGainOnFailure = heatGainOnSuccess + 0.15;

      const durationDeltaPercent = Math.round((1 - vehicleDurationMultiplier) * 100);
      const successDeltaPercent = Math.round((handlingBonus + conditionBonus) * 100);
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

      vehicleImpact = {
        vehicleId: vehicle.id,
        model: vehicle.model,
        durationMultiplier: vehicleDurationMultiplier,
        successContribution: handlingBonus + conditionBonus,
        heatAdjustment,
        wearOnSuccess,
        wearOnFailure,
        heatGainOnSuccess,
        heatGainOnFailure,
        conditionBefore: safeCondition,
        heatBefore: safeHeatRating,
      };
    } else {
      summary.push('Vehicle: No assignment selected.');
      adjustedHeat = crewAdjustedHeat;
      heatAdjustment = crewAdjustedHeat - baseHeat;
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
      durationMultiplier,
      payoutMultiplier,
      successBonus,
      heatMultiplier,
      vehicleImpact,
      playerImpact,
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

    this.syncHeatTier();
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
      mission.heat = crewImpact.adjustedHeat;
      mission.assignedVehicleImpact = assignedVehicle ? crewImpact.vehicleImpact : null;
      mission.playerEffectSummary = Array.isArray(crewImpact.playerImpact?.summary)
        ? crewImpact.playerImpact.summary
        : [];
    } else {
      mission.duration = sanitizeDuration(mission.baseDuration ?? mission.duration, mission.difficulty);
      mission.payout = coerceFiniteNumber(mission.basePayout ?? mission.payout, 0);
      mission.successChance = Number.isFinite(mission.baseSuccessChance)
        ? mission.baseSuccessChance
        : deriveBaseSuccessChance(mission.difficulty);
      mission.assignedCrewImpact = null;
      mission.heat = Number.isFinite(mission.baseHeat)
        ? mission.baseHeat
        : coerceFiniteNumber(mission.heat, 0);
      mission.assignedVehicleImpact = null;
      mission.playerEffectSummary = [];
    }

    mission.assignedCrewIds = assignedCrew.map((member) => member.id);
    mission.crewEffectSummary = crewImpact?.summary ?? [];
    mission.assignedVehicleId = assignedVehicle ? assignedVehicle.id : null;
    mission.assignedVehicleSnapshot = assignedVehicle
      ? {
          condition: Number.isFinite(assignedVehicle.condition) ? assignedVehicle.condition : null,
          heat: Number.isFinite(assignedVehicle.heat) ? assignedVehicle.heat : null,
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
    this.initializeMissionEvents(mission);
    this.advanceMissionEvents(mission);
    this.state.activeMission = mission;
    return mission;
  }

  resolveMission(missionId, outcome) {
    this.syncHeatTier();

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

    if (outcome === 'success') {
      this.state.funds += mission.payout;
      this.heatSystem.increase(mission.heat);
      let rewardVehicleAdded = false;
      const storageCapacity = getActiveStorageCapacityFromState(this.state);
      const hasFiniteCapacity = Number.isFinite(storageCapacity) && storageCapacity >= 0;
      const capacityLimit = hasFiniteCapacity ? storageCapacity : Infinity;
      const garageSize = garage.length;

      if (mission.vehicle) {
        if (!hasFiniteCapacity || garageSize < capacityLimit) {
          this.state.garage.push(mission.vehicle);
          rewardVehicleAdded = true;
        } else {
          const vehicleModel = mission.vehicle.model ?? 'Vehicle';
          const summary = `${vehicleModel} couldn't enter the garage — capacity ${garageSize}/${storageCapacity} reached. ` +
            'Sell or scrap a vehicle to free space.';
          storageBlockedReport = {
            outcome: 'storage-blocked',
            vehicleId: mission.vehicle.id ?? null,
            vehicleModel,
            garageSize,
            storageCapacity,
            summary,
            timestamp: Date.now(),
          };
        }
      }

      assignedCrew.forEach((member) => {
        if (typeof member.adjustLoyalty === 'function') {
          member.adjustLoyalty(1);
        }
      });

      if (rewardVehicleAdded && mission.vehicle && typeof mission.vehicle.applyWear === 'function') {
        const mechanicScore = assignedCrew
          .filter((member) => (member.specialty ?? '').toLowerCase() === 'mechanic')
          .reduce((total, member) => total + (Number(member.loyalty) || 0), 0);
        const wearReduction = Math.min(0.08, mechanicScore * 0.01);
        const wearAmount = Math.max(0.05, 0.18 - wearReduction);
        mission.vehicle.applyWear(wearAmount);
      }
      if (rewardVehicleAdded && mission.vehicle && typeof mission.vehicle.setStatus === 'function') {
        mission.vehicle.setStatus('idle');
      } else if (rewardVehicleAdded && mission.vehicle) {
        mission.vehicle.status = 'idle';
        mission.vehicle.inUse = false;
      }
      if (rewardVehicleAdded && typeof mission.vehicle?.markStolen === 'function') {
        mission.vehicle.markStolen();
      }
    } else if (outcome === 'failure') {
      const multiplier = crackdownPolicy.failureHeatMultiplier ?? 2;
      this.heatSystem.increase(mission.heat * multiplier);

      assignedCrew.forEach((member) => {
        if (typeof member.adjustLoyalty === 'function') {
          member.adjustLoyalty(-1);
        }
      });
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

      if (typeof member.finishMission === 'function') {
        member.finishMission({ fatigueImpact: missionFatigue, mission, outcome });
      } else if (typeof member.setStatus === 'function') {
        member.setStatus('idle');
      } else {
        member.status = 'idle';
      }
    });

    this.recordMissionTelemetry(mission, outcome);

    mission.pendingDecision = null;
    mission.eventDeck = [];
    mission.eventHistory = [];

    mission.assignedCrewIds = [];
    mission.assignedCrewImpact = null;
    mission.crewEffectSummary = [];
    mission.assignedVehicleId = null;
    mission.assignedVehicleImpact = null;
    mission.assignedVehicleSnapshot = null;
    mission.assignedVehicleLabel = null;
    mission.assignedCrewFatigue = null;

    if (vehicleReport) {
      this.state.lastVehicleReport = vehicleReport;
    }

    if (storageBlockedReport) {
      this.state.lastVehicleReport = storageBlockedReport;
    }

    this.respawnMissionTemplate(mission.id);
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
    };

    this.state.lastVehicleReport = report;
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
    this.syncHeatTier();

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

MissionSystem.prototype.syncHeatTier = function syncHeatTier() {
  const latestTier = this.heatSystem.getCurrentTier();
  if (this.currentCrackdownTier !== latestTier) {
    this.currentCrackdownTier = latestTier;
    this.applyHeatRestrictions();
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

    if (mission.heat > maxHeat) {
      mission.restricted = true;
      mission.restrictionReason = `Unavailable during ${policy.label.toLowerCase()} crackdown`;
    } else {
      mission.restricted = false;
      mission.restrictionReason = null;
    }
  });
};

export { MissionSystem, GARAGE_MAINTENANCE_CONFIG, PLAYER_SKILL_CONFIG, PLAYER_GEAR_CATALOG };
