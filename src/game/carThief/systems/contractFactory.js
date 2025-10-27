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

const buildContractFromDistrict = (district) => {
  if (!district) {
    return null;
  }

  const wealthScore = normalizeNumber(district.wealth, 1, 0);
  const securityScore = normalizeNumber(district.security, 1, 0);

  const riskTier = determineRiskTier(securityScore);
  const basePayout = 6000;
  const payoutMultiplier = 1 + wealthScore * 0.6 + securityScore * 0.25;
  const payout = Math.round(basePayout * payoutMultiplier);

  const heat = Math.max(1, Math.round(1 + securityScore * 0.8));
  const difficulty = Math.max(1, Math.round((wealthScore + securityScore) / 2));
  const duration = Math.max(20, Math.round(25 + securityScore * 8 + difficulty * 4));

  return {
    id: createContractId(district),
    name: `${district.name ?? 'District'} Heist`,
    difficulty,
    payout,
    heat,
    duration,
    districtId: district.id ?? null,
    districtName: district.name ?? 'Unknown District',
    riskTier,
    description:
      district.description ??
      'Pull off a daring job tailored to the district\'s unique opportunities.',
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
