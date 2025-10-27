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

const determineRiskTier = (securityScore) => {
  if (securityScore >= 4) {
    return 'high';
  }

  if (securityScore >= 3) {
    return 'moderate';
  }

  return 'low';
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
  };
};

const generateContractsFromDistricts = (districts = []) => {
  if (!Array.isArray(districts)) {
    return [];
  }

  const seenIds = new Set();
  const templates = [];

  districts.forEach((district) => {
    const contract = buildContractFromDistrict(district);
    if (!contract || !contract.id) {
      return;
    }

    if (seenIds.has(contract.id)) {
      return;
    }

    seenIds.add(contract.id);
    templates.push(contract);
  });

  return templates;
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
