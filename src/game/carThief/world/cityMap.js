const clampMetric = (value, { min = 0, max = 100, fallback = 50 } = {}) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  if (numeric < min) {
    return min;
  }

  if (numeric > max) {
    return max;
  }

  return numeric;
};

class CityDistrict {
  constructor({
    id,
    name,
    wealth = 1,
    security = 1,
    description = '',
    pointsOfInterest = [],
    influence = 50,
    intelLevel = 45,
    crackdownPressure = 40,
  } = {}) {
    this.id = id ?? `district-${Math.random().toString(36).slice(2, 9)}`;
    this.name = name ?? 'Downtown';
    this.wealth = wealth;
    this.security = security;
    this.description = description;
    this.pointsOfInterest = Array.isArray(pointsOfInterest)
      ? pointsOfInterest.map((poi) => ({ ...poi }))
      : [];
    this.influence = clampMetric(influence);
    this.intelLevel = clampMetric(intelLevel);
    this.crackdownPressure = clampMetric(crackdownPressure);
  }

  addPointOfInterest(poi) {
    if (!poi) {
      return;
    }

    this.pointsOfInterest.push({ ...poi });
  }

  setInfluence(value) {
    this.influence = clampMetric(value);
    return this.influence;
  }

  adjustInfluence(delta = 0) {
    const next = clampMetric((this.influence ?? 0) + delta);
    this.influence = next;
    return next;
  }

  setIntelLevel(value) {
    this.intelLevel = clampMetric(value);
    return this.intelLevel;
  }

  adjustIntelLevel(delta = 0) {
    const next = clampMetric((this.intelLevel ?? 0) + delta);
    this.intelLevel = next;
    return next;
  }

  setCrackdownPressure(value) {
    this.crackdownPressure = clampMetric(value);
    return this.crackdownPressure;
  }

  adjustCrackdownPressure(delta = 0) {
    const next = clampMetric((this.crackdownPressure ?? 0) + delta);
    this.crackdownPressure = next;
    return next;
  }

  getIntelSnapshot() {
    return {
      influence: Math.round(this.influence ?? 0),
      intelLevel: Math.round(this.intelLevel ?? 0),
      crackdownPressure: Math.round(this.crackdownPressure ?? 0),
    };
  }

  applyMissionOutcome(outcome, context = {}) {
    if (outcome !== 'success' && outcome !== 'failure') {
      return null;
    }

    const before = this.getIntelSnapshot();

    const difficulty = Number.isFinite(context.difficulty) ? Math.max(1, context.difficulty) : 1;
    const heat = Number.isFinite(context.heat) ? Math.max(0, context.heat) : 0;
    const payout = Number.isFinite(context.payout) ? Math.max(0, context.payout) : 0;
    const notorietyDelta = Number.isFinite(context.notorietyDelta) ? context.notorietyDelta : 0;

    if (outcome === 'success') {
      const influenceGain = Math.max(1, Math.round(2 + difficulty * 0.7 + payout / 15000));
      const intelGain = Math.max(1, Math.round(1 + difficulty * 0.5 + heat * 0.3));
      let crackdownReduction = 1 + heat * 0.25;
      if (notorietyDelta < 0) {
        crackdownReduction += Math.abs(notorietyDelta) * 0.5;
      }
      if (notorietyDelta > 0) {
        crackdownReduction -= notorietyDelta * 0.4;
      }
      const normalizedReduction = Math.max(1, Math.round(crackdownReduction));

      this.adjustInfluence(influenceGain);
      this.adjustIntelLevel(intelGain);
      this.adjustCrackdownPressure(-normalizedReduction);
    } else {
      const influenceLoss = Math.max(1, Math.round(2 + difficulty * 0.6 + heat * 0.4));
      const intelLoss = Math.max(1, Math.round(1 + heat * 0.5));
      let crackdownIncrease = 2 + difficulty * 0.7 + heat * 0.45;
      if (notorietyDelta > 0) {
        crackdownIncrease += notorietyDelta * 0.5;
      }
      const normalizedIncrease = Math.max(2, Math.round(crackdownIncrease));

      this.adjustInfluence(-influenceLoss);
      this.adjustIntelLevel(-intelLoss);
      this.adjustCrackdownPressure(normalizedIncrease);
    }

    const after = this.getIntelSnapshot();

    return {
      before,
      after,
      delta: {
        influence: after.influence - before.influence,
        intelLevel: after.intelLevel - before.intelLevel,
        crackdownPressure: after.crackdownPressure - before.crackdownPressure,
      },
    };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      wealth: this.wealth,
      security: this.security,
      description: this.description,
      pointsOfInterest: this.pointsOfInterest.map((poi) => ({ ...poi })),
      influence: this.influence,
      intelLevel: this.intelLevel,
      crackdownPressure: this.crackdownPressure,
    };
  }
}

class CityMap {
  constructor({ name = 'Metro Harbor', districts = [] } = {}) {
    this.name = name;
    this.districts = districts.map((district) => new CityDistrict(district));
    if (this.districts.length === 0) {
      this._seedDefaultDistricts();
    }
  }

  _seedDefaultDistricts() {
    this.districts = [
      new CityDistrict({
        name: 'Downtown',
        wealth: 3,
        security: 4,
        description: 'Corporate high-rises and high-profile targets.',
        influence: 62,
        intelLevel: 48,
        crackdownPressure: 58,
        pointsOfInterest: [
          {
            id: 'downtown-vault-row',
            name: 'Vault Row Depository',
            type: 'vault',
            description: 'A private bank mezzanine lined with biometric vault pods.',
            modifiers: { payoutMultiplier: 1.35, heatDelta: 2 },
          },
          {
            id: 'downtown-skytech-spire',
            name: 'SkyTech Innovation Spire',
            type: 'tech-hub',
            description: 'A research tower bristling with prototyped circuitry and security drones.',
            modifiers: { payoutMultiplier: 1.15, heatDelta: 1, durationDelta: 6 },
          },
        ],
      }),
      new CityDistrict({
        name: 'Industrial Docks',
        wealth: 2,
        security: 2,
        description: 'Warehouses, shipping containers, and shady deals.',
        influence: 55,
        intelLevel: 42,
        crackdownPressure: 44,
        pointsOfInterest: [
          {
            id: 'docks-freeport-yard',
            name: 'Freeport Rail Yard',
            type: 'rail-yard',
            description: 'Intermodal tracks crawling with cargo haulers and minimal oversight.',
            modifiers: { payoutMultiplier: 1.1, heatDelta: 0, durationDelta: -4 },
          },
          {
            id: 'docks-contraband-silos',
            name: 'Contraband Silos',
            type: 'smuggling-cache',
            description: 'Cold storage silos hiding confiscated shipments waiting for pickup.',
            modifiers: { payoutMultiplier: 1.2, heatDelta: 1 },
          },
        ],
      }),
      new CityDistrict({
        name: 'Suburban Hills',
        wealth: 4,
        security: 3,
        description: 'Gated communities with prized collections.',
        influence: 50,
        intelLevel: 44,
        crackdownPressure: 63,
        pointsOfInterest: [
          {
            id: 'hills-heritage-vault',
            name: 'Heritage Vault Estate',
            type: 'vault',
            description: 'Antique vault hidden below an old-money mansion with rotating staff.',
            modifiers: { payoutMultiplier: 1.4, heatDelta: 1 },
          },
          {
            id: 'hills-collector-hangar',
            name: 'Collector Hangar 7',
            type: 'showroom',
            description: 'Private vehicle showroom stocked with concept rides and drones.',
            modifiers: { payoutMultiplier: 1.25, heatDelta: 0.5, durationDelta: 4 },
          },
        ],
      }),
      new CityDistrict({
        name: 'Old Town',
        wealth: 1,
        security: 1,
        description: 'Tight streets and low police presence.',
        influence: 68,
        intelLevel: 56,
        crackdownPressure: 32,
        pointsOfInterest: [
          {
            id: 'oldtown-market-catacombs',
            name: 'Market Catacombs',
            type: 'smuggling-cache',
            description: 'Hidden vaults beneath the bazaar where crews fence contraband.',
            modifiers: { payoutMultiplier: 1.05, heatDelta: -1 },
          },
          {
            id: 'oldtown-community-hub',
            name: 'Community Hackspace',
            type: 'tech-hub',
            description: 'Volunteer tech lab with civic surveillance overrides tucked away.',
            modifiers: { payoutMultiplier: 1.08, heatDelta: -0.5, durationDelta: -2 },
          },
        ],
      }),
    ];
  }

  findDistrict(id) {
    return this.districts.find((district) => district.id === id) ?? null;
  }
}

export { CityMap, CityDistrict };
