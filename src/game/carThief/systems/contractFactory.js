const normalizeNumber = (value, fallback = 1, min = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  if (Number.isFinite(min)) {
    return Math.max(min, numeric);
  }

  return numeric;
};

const createContractId = (district) => {
  const baseId = district.id ?? district.name ?? 'district';
  return `contract-${String(baseId).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.replace(/-+/g, '-');
};

const slugifyId = (value, fallback = 'campaign') => {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
};

const determineRiskTier = (securityScore) => {
  if (securityScore >= 4) {
    return 'high';
  }

  if (securityScore >= 3) {
    return 'moderate';
  }

  return 'low';
};

const VEHICLE_REWARD_PRESETS = Object.freeze({
  low: {
    model: 'Street-Tuned Coupe',
    topSpeed: 142,
    acceleration: 5.6,
    handling: 5.8,
    heat: 0.6,
  },
  moderate: {
    model: 'Interceptor Sedan',
    topSpeed: 154,
    acceleration: 6.1,
    handling: 6.2,
    heat: 0.8,
  },
  high: {
    model: 'Prototype Hypercar',
    topSpeed: 168,
    acceleration: 6.7,
    handling: 6.5,
    heat: 1.1,
  },
});

const buildVehicleRewardProfile = (district, poi, riskTier) => {
  const preset = VEHICLE_REWARD_PRESETS[riskTier] ?? VEHICLE_REWARD_PRESETS.low;
  const districtLabel = typeof district?.name === 'string' ? district.name.trim() : '';
  const poiLabel = typeof poi?.name === 'string' ? poi.name.trim() : '';
  const territoryLabel = poiLabel || districtLabel || 'the district';
  const modelLabel = (() => {
    if (poiLabel && districtLabel) {
      return `${poiLabel} ${preset.model}`;
    }
    if (poiLabel) {
      return `${poiLabel} ${preset.model}`;
    }
    if (districtLabel) {
      return `${districtLabel} ${preset.model}`;
    }
    return preset.model;
  })();

  const summary = `Secure a high-end ride seized from ${territoryLabel}.`;
  const storageRequired = riskTier === 'high' ? 2 : 1;

  return {
    label: modelLabel,
    summary,
    storageRequired,
    vehicleBlueprint: {
      model: modelLabel,
      topSpeed: preset.topSpeed,
      acceleration: preset.acceleration,
      handling: preset.handling,
      heat: preset.heat,
    },
  };
};

const clonePointOfInterest = (poi) => {
  if (!poi || typeof poi !== 'object') {
    return null;
  }

  return {
    ...poi,
    modifiers: typeof poi.modifiers === 'object' && poi.modifiers !== null ? { ...poi.modifiers } : undefined,
  };
};

const pickPointOfInterest = (district) => {
  if (!district || !Array.isArray(district.pointsOfInterest) || !district.pointsOfInterest.length) {
    return null;
  }

  const index = Math.floor(Math.random() * district.pointsOfInterest.length);
  return clonePointOfInterest(district.pointsOfInterest[index]);
};

const applyPoiModifier = (baseValue, poi, { multiplierKey, deltaKey, minValue }) => {
  if (!Number.isFinite(baseValue)) {
    return Number.isFinite(minValue) ? minValue : 0;
  }

  const modifiers = poi?.modifiers ?? {};
  const multiplier = Number.isFinite(modifiers?.[multiplierKey]) ? modifiers[multiplierKey] : 1;
  const delta = Number.isFinite(modifiers?.[deltaKey]) ? modifiers[deltaKey] : 0;

  const modified = (baseValue + delta) * multiplier;
  if (!Number.isFinite(modified)) {
    return Number.isFinite(minValue) ? minValue : baseValue;
  }

  const rounded = Math.round(modified);
  if (!Number.isFinite(minValue)) {
    return rounded;
  }

  return Math.max(minValue, rounded);
};

const buildContractFromDistrict = (district) => {
  if (!district) {
    return null;
  }

  const wealthScore = normalizeNumber(district.wealth, 1, 0);
  const securityScore = normalizeNumber(district.security, 1, 0);

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

  const normalizeMeter = (value, fallback = 50) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return clamp(numeric, 0, 100);
  };

  const influenceScore = normalizeMeter(district.influence, 50);
  const intelScore = normalizeMeter(district.intelLevel, 45);
  const crackdownScore = normalizeMeter(district.crackdownPressure, 40);

  const influenceModifier = 1 + ((influenceScore - 50) / 100) * 0.45;
  const intelHeatModifier = 1 - ((intelScore - 50) / 100) * 0.5;
  const intelDurationModifier = 1 - ((intelScore - 50) / 100) * 0.35;
  const crackdownHeatModifier = 1 + (Math.max(0, crackdownScore - 50) / 100) * 0.65;
  const crackdownRiskShift = crackdownScore > 70 ? 1 : crackdownScore < 35 ? -1 : 0;

  const adjustedSecurity = Math.max(0, securityScore + crackdownRiskShift * 0.6);
  const riskTier = determineRiskTier(adjustedSecurity);
  const basePayout = 6000;
  const payoutMultiplier = 1 + wealthScore * 0.6 + adjustedSecurity * 0.25;
  const basePayoutValue = Math.round(basePayout * payoutMultiplier * influenceModifier);

  const rawBaseHeat = Math.round(1 + adjustedSecurity * 0.8);
  const baseHeat = Math.max(1, Math.round(rawBaseHeat * intelHeatModifier * crackdownHeatModifier));
  const difficulty = Math.max(
    1,
    Math.round((wealthScore + adjustedSecurity) / 2 + Math.max(0, crackdownScore - 60) / 25),
  );
  const baseDuration = Math.round(25 + adjustedSecurity * 8 + difficulty * 4);

  const poi = pickPointOfInterest(district);

  const payout = applyPoiModifier(basePayoutValue, poi, {
    multiplierKey: 'payoutMultiplier',
    deltaKey: 'payoutDelta',
    minValue: 0,
  });
  const heat = applyPoiModifier(Math.max(1, baseHeat), poi, {
    multiplierKey: 'heatMultiplier',
    deltaKey: 'heatDelta',
    minValue: 1,
  });
  const duration = applyPoiModifier(Math.max(20, Math.round(baseDuration * intelDurationModifier)), poi, {
    multiplierKey: 'durationMultiplier',
    deltaKey: 'durationDelta',
    minValue: 20,
  });

  const missionName = poi ? `Score at ${poi.name}` : `${district.name ?? 'District'} Heist`;
  const missionDescriptionParts = [
    district.description,
    poi ? `Intel flags ${poi.name}: ${poi.description}` : null,
  ].filter(Boolean);
  const missionDescription =
    missionDescriptionParts.join(' ') ||
    "Pull off a daring job tailored to the district's unique opportunities.";

  const districtIntel = {
    influence: Math.round(influenceScore),
    intelLevel: Math.round(intelScore),
    crackdownPressure: Math.round(crackdownScore),
  };

  const vehicleReward = buildVehicleRewardProfile(district, poi, riskTier);

  return {
    id: createContractId(district),
    name: missionName,
    difficulty,
    payout,
    heat,
    duration,
    districtId: district.id ?? null,
    districtName: district.name ?? 'Unknown District',
    riskTier,
    description: missionDescription,
    pointOfInterest: poi,
    districtIntel,
    category: 'vehicle-heist',
    vehicleReward,
  };
};

const generateContractsFromDistricts = (districts = []) => {
  if (!Array.isArray(districts)) {
    return [];
  }

  const seenIds = new Set();
  const templates = [];

  districts.forEach((district) => {
    if (!district) {
      return;
    }

    let campaignSnapshot = null;
    if (typeof district.getCampaignSnapshot === 'function') {
      campaignSnapshot = district.getCampaignSnapshot();
    }

    const activeMilestone =
      typeof district.getActiveCampaignMilestone === 'function'
        ? district.getActiveCampaignMilestone()
        : null;

    let contract = null;
    if (activeMilestone && campaignSnapshot?.activeMilestone?.ready) {
      contract = buildCampaignContractTemplate(district, activeMilestone);
    }

    if (!contract) {
      contract = buildContractFromDistrict(district);
    }

    if (!contract || !contract.id || seenIds.has(contract.id)) {
      return;
    }

    seenIds.add(contract.id);
    templates.push(contract);
  });

  return templates;
};

const cloneVehicleReward = (reward) => {
  if (!reward || typeof reward !== 'object') {
    return undefined;
  }

  const vehicleBlueprint =
    reward.vehicleBlueprint && typeof reward.vehicleBlueprint === 'object'
      ? { ...reward.vehicleBlueprint }
      : undefined;

  return {
    ...reward,
    vehicleBlueprint,
  };
};

const buildCampaignContractTemplate = (district, milestone) => {
  if (!district || !milestone || typeof milestone !== 'object') {
    return null;
  }

  const blueprint = milestone.contract ?? {};
  const baseId = blueprint.id ?? `${district.id ?? district.name ?? 'district'}-${milestone.id ?? 'campaign'}`;
  const id = `campaign-${slugifyId(baseId)}`;
  const name = blueprint.name ?? milestone.name ?? `${district.name ?? 'District'} Campaign`;
  const description = blueprint.description ?? milestone.description ?? 'Coordinate a bespoke district campaign operation.';
  const difficulty = normalizeNumber(blueprint.difficulty, Math.max(2, milestone.stage + 2), 1);
  const payout = normalizeNumber(blueprint.payout, 25000, 0);
  const heat = normalizeNumber(blueprint.heat, 2, 0);
  const duration = normalizeNumber(blueprint.duration, 48, 20);
  const category = blueprint.category ?? 'campaign-operation';
  const riskTier = blueprint.riskTier ?? 'high';

  const explicitPoi = blueprint.pointOfInterest ? clonePointOfInterest(blueprint.pointOfInterest) : null;
  const pointOfInterest = explicitPoi ?? pickPointOfInterest(district);

  const vehicleReward = cloneVehicleReward(blueprint.vehicleReward);

  return {
    id,
    name,
    description,
    difficulty,
    payout,
    heat,
    duration,
    districtId: district.id ?? null,
    districtName: district.name ?? 'Unknown District',
    riskTier,
    category,
    pointOfInterest,
    vehicleReward:
      vehicleReward || (category === 'vehicle-heist' ? buildVehicleRewardProfile(district, pointOfInterest, riskTier) : undefined),
    campaignMilestone: {
      districtId: district.id ?? null,
      districtName: district.name ?? null,
      milestoneId: milestone.id,
      stage: milestone.stage,
      name: milestone.name ?? null,
      rewardPreview: milestone.rewardPreview ?? null,
      requirements: milestone.requirements ?? {},
    },
  };
};

const buildFalloutContractIdFactory = (createId) => {
  if (typeof createId === 'function') {
    return createId;
  }

  let counter = 0;
  return () => {
    counter += 1;
    return `fallout-${counter}`;
  };
};

const buildRescueContractTemplate = (fallout, mission, createId) => {
  if (!fallout || !mission) {
    return null;
  }

  const id = createId();
  const crewName = fallout.crewName ?? 'Crew member';
  const missionName = mission.name ?? 'the failed operation';
  const difficulty = Math.max(1, Math.round((mission.difficulty ?? 1) + 1));
  const heat = Math.max(1, Math.round((mission.heat ?? 1) * 0.75 + 1));
  const duration = Math.max(24, Math.round((mission.duration ?? 30) * 0.8));

  return {
    id,
    name: `Rescue ${crewName}`,
    difficulty,
    payout: 0,
    heat,
    duration,
    description: `Mount an urgent extraction to free ${crewName}, captured during ${missionName}.`,
    falloutRecovery: {
      type: 'rescue',
      crewId: fallout.crewId ?? null,
      crewName,
      status: fallout.status ?? 'captured',
      sourceMissionId: mission.id ?? null,
      sourceMissionName: mission.name ?? null,
    },
    vehicle: { model: 'Extraction Van' },
  };
};

const buildMedicalContractTemplate = (fallout, mission, createId) => {
  if (!fallout || !mission) {
    return null;
  }

  const id = createId();
  const crewName = fallout.crewName ?? 'Crew member';
  const missionName = mission.name ?? 'the failed operation';
  const difficulty = Math.max(1, Math.round(mission.difficulty ?? 1));
  const heat = Math.max(0, Math.round((mission.heat ?? 1) * 0.4));
  const duration = Math.max(18, Math.round((mission.duration ?? 30) * 0.6));

  return {
    id,
    name: `Stabilize ${crewName}`,
    difficulty,
    payout: 0,
    heat,
    duration,
    description: `Coordinate medical aid to stabilize ${crewName} after ${missionName}.`,
    falloutRecovery: {
      type: 'medical',
      crewId: fallout.crewId ?? null,
      crewName,
      status: fallout.status ?? 'injured',
      sourceMissionId: mission.id ?? null,
      sourceMissionName: mission.name ?? null,
    },
    vehicle: { model: 'Support Ambulance' },
  };
};

const generateFalloutContracts = ({ mission, falloutEntries = [], createId } = {}) => {
  if (!mission || !Array.isArray(falloutEntries) || !falloutEntries.length) {
    return [];
  }

  const idFactory = buildFalloutContractIdFactory(createId);
  const templates = falloutEntries
    .map((fallout) => {
      const status = String(fallout?.status ?? '').toLowerCase();
      if (status === 'captured') {
        return buildRescueContractTemplate(fallout, mission, idFactory);
      }
      if (status === 'injured') {
        return buildMedicalContractTemplate(fallout, mission, idFactory);
      }
      return null;
    })
    .filter(Boolean);

  return templates;
};

export { generateContractsFromDistricts, generateFalloutContracts };
