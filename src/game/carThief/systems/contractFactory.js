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

  const riskTier = determineRiskTier(securityScore);
  const basePayout = 6000;
  const payoutMultiplier = 1 + wealthScore * 0.6 + securityScore * 0.25;
  const basePayoutValue = Math.round(basePayout * payoutMultiplier);

  const baseHeat = Math.round(1 + securityScore * 0.8);
  const difficulty = Math.max(1, Math.round((wealthScore + securityScore) / 2));
  const baseDuration = Math.round(25 + securityScore * 8 + difficulty * 4);

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
  const duration = applyPoiModifier(Math.max(20, baseDuration), poi, {
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

export { generateContractsFromDistricts };
