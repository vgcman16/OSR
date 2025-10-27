const generateId = () => `crew-${Math.random().toString(36).slice(2, 9)}`;

const CREW_TRAIT_CONFIG = {
  stealth: {
    key: 'stealth',
    label: 'Stealth',
    description: 'Keeps operations quiet, reducing heat and trimming execution time.',
    shortLabel: 'Stl',
    trainingCost: 3200,
    maxLevel: 6,
  },
  tech: {
    key: 'tech',
    label: 'Tech',
    description: 'Bypasses electronic locks to raise success odds and payouts.',
    shortLabel: 'Tec',
    trainingCost: 3300,
    maxLevel: 6,
  },
  driving: {
    key: 'driving',
    label: 'Driving',
    description: 'Controls the getaway, shaving duration and steadying outcomes.',
    shortLabel: 'Drv',
    trainingCost: 3200,
    maxLevel: 6,
  },
  tactics: {
    key: 'tactics',
    label: 'Tactics',
    description: 'Plans contingencies that stabilize odds and cool heat spikes.',
    shortLabel: 'Tac',
    trainingCost: 3100,
    maxLevel: 6,
  },
  charisma: {
    key: 'charisma',
    label: 'Charisma',
    description: 'Leverages contacts for better take and lower attention.',
    shortLabel: 'Cha',
    trainingCost: 3000,
    maxLevel: 6,
  },
  muscle: {
    key: 'muscle',
    label: 'Muscle',
    description: 'Provides intimidation and muscle to secure bigger cuts.',
    shortLabel: 'Mus',
    trainingCost: 3000,
    maxLevel: 6,
  },
};

const CREW_TRAIT_KEYS = Object.keys(CREW_TRAIT_CONFIG);

const clampTraitLevel = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(6, Math.round(numeric)));
};

const SPECIALTY_TRAIT_PROFILE = {
  wheelman: { driving: 3, tactics: 2, stealth: 1 },
  hacker: { tech: 3, stealth: 2, tactics: 1 },
  mechanic: { tech: 3, muscle: 1, tactics: 1 },
  face: { charisma: 3, tech: 1, stealth: 1 },
  infiltrator: { stealth: 3, tech: 2, tactics: 2 },
  tactician: { tactics: 3, tech: 1, charisma: 1 },
  spotter: { tactics: 2, stealth: 2, tech: 2 },
  default: { tactics: 1, stealth: 1 },
};

const CREW_BACKGROUNDS = [
  {
    id: 'ghost-operative',
    name: 'Ghost Operative',
    description: 'Former intelligence asset comfortable slipping through sensor nets.',
    perkLabel: 'Ghost Operative perk: -10% heat, +3% success.',
    traitAdjustments: { stealth: 2, tech: 1 },
    effects: {
      heatMultiplier: 0.9,
      successBonus: 0.03,
    },
    specialtyBias: { infiltrator: 1.6, hacker: 1.4, spotter: 1.2 },
  },
  {
    id: 'street-racer',
    name: 'Street Racer',
    description: 'Cut their teeth threading traffic and outrunning patrol cars.',
    perkLabel: 'Street Racer perk: -12% duration, +2% success.',
    traitAdjustments: { driving: 2, tactics: 1 },
    effects: {
      durationMultiplier: 0.88,
      successBonus: 0.02,
    },
    specialtyBias: { wheelman: 1.7, infiltrator: 1.2, tactician: 1.1 },
  },
  {
    id: 'syndicate-fixer',
    name: 'Syndicate Fixer',
    description: 'Brokered deals in back rooms and knows who to squeeze for favors.',
    perkLabel: 'Syndicate Fixer perk: +6% payout, -4% heat.',
    traitAdjustments: { charisma: 2, tech: 1 },
    effects: {
      payoutMultiplier: 1.06,
      heatMultiplier: 0.96,
    },
    specialtyBias: { face: 1.7, hacker: 1.2, spotter: 1.1 },
  },
  {
    id: 'garage-prodigy',
    name: 'Garage Prodigy',
    description: 'Built custom rigs and knows how to coax extra power from machines.',
    perkLabel: 'Garage Prodigy perk: +8% payout, +2% success.',
    traitAdjustments: { tech: 2, muscle: 1 },
    effects: {
      payoutMultiplier: 1.08,
      successBonus: 0.02,
    },
    specialtyBias: { mechanic: 1.8, wheelman: 1.2, tactician: 1.1 },
  },
  {
    id: 'street-enforcer',
    name: 'Street Enforcer',
    description: 'Handled collections and keeps things steady when jobs go sideways.',
    perkLabel: 'Street Enforcer perk: +5% payout, +2.5% success.',
    traitAdjustments: { muscle: 2, tactics: 1 },
    effects: {
      payoutMultiplier: 1.05,
      successBonus: 0.025,
    },
    specialtyBias: { mechanic: 1.2, tactician: 1.3, face: 1.1 },
  },
];

const pickWeightedBackground = (specialty) => {
  const normalizedSpecialty = typeof specialty === 'string' ? specialty.toLowerCase() : '';
  const weights = CREW_BACKGROUNDS.map((background) => {
    const bias = background.specialtyBias?.[normalizedSpecialty];
    if (Number.isFinite(bias) && bias > 0) {
      return bias;
    }
    if (normalizedSpecialty && background.specialtyBias?.default) {
      return background.specialtyBias.default;
    }
    return 1;
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) {
    const randomIndex = Math.floor(Math.random() * CREW_BACKGROUNDS.length);
    return CREW_BACKGROUNDS[randomIndex];
  }

  let roll = Math.random() * totalWeight;
  for (let index = 0; index < CREW_BACKGROUNDS.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) {
      return CREW_BACKGROUNDS[index];
    }
  }

  return CREW_BACKGROUNDS[CREW_BACKGROUNDS.length - 1];
};

const cloneBackground = (background) => {
  if (!background) {
    return null;
  }

  const clone = { ...background };
  if (background.traitAdjustments) {
    clone.traitAdjustments = { ...background.traitAdjustments };
  }
  if (background.effects) {
    clone.effects = { ...background.effects };
  }
  if (background.specialtyBias) {
    clone.specialtyBias = { ...background.specialtyBias };
  }
  return clone;
};

const pickTraitKey = (weights) => {
  const totalWeight = weights.reduce((sum, entry) => sum + (entry.weight > 0 ? entry.weight : 0), 0);
  if (totalWeight <= 0) {
    const randomIndex = Math.floor(Math.random() * weights.length);
    return weights[randomIndex]?.key ?? CREW_TRAIT_KEYS[0];
  }

  let roll = Math.random() * totalWeight;
  for (let index = 0; index < weights.length; index += 1) {
    const entry = weights[index];
    const weight = entry.weight > 0 ? entry.weight : 0;
    roll -= weight;
    if (roll <= 0) {
      return entry.key;
    }
  }

  return weights[weights.length - 1]?.key ?? CREW_TRAIT_KEYS[0];
};

const rollTraitSpread = ({ specialty, background } = {}) => {
  const normalizedSpecialty = typeof specialty === 'string' ? specialty.toLowerCase() : '';
  const profile = SPECIALTY_TRAIT_PROFILE[normalizedSpecialty] ?? SPECIALTY_TRAIT_PROFILE.default;
  const traitSpread = CREW_TRAIT_KEYS.reduce((accumulator, key) => {
    const profileValue = Number(profile?.[key]) || 0;
    const backgroundBoost = Number(background?.traitAdjustments?.[key]) || 0;
    const randomSwing = profileValue > 0 ? Math.random() * 1.5 : Math.random();
    const baseValue = 1 + profileValue + backgroundBoost + randomSwing;
    return { ...accumulator, [key]: clampTraitLevel(baseValue) };
  }, {});

  const extraPoints = 2 + Math.floor(Math.random() * 3);
  for (let point = 0; point < extraPoints; point += 1) {
    const weightedKeys = CREW_TRAIT_KEYS.map((key) => {
      const profileWeight = Number(profile?.[key]) || 0.2;
      const backgroundWeight = Number(background?.traitAdjustments?.[key]) || 0;
      return {
        key,
        weight: Math.max(0.1, profileWeight + backgroundWeight),
      };
    });

    const selectedKey = pickTraitKey(weightedKeys);
    traitSpread[selectedKey] = clampTraitLevel(traitSpread[selectedKey] + 1);
  }

  return traitSpread;
};

const getBackgroundById = (backgroundId) => {
  if (!backgroundId) {
    return null;
  }

  const normalizedId = String(backgroundId).toLowerCase();
  const match = CREW_BACKGROUNDS.find((entry) => entry.id === normalizedId);
  return match ? cloneBackground(match) : null;
};

const createCrewTemplate = ({
  id,
  name,
  specialty,
  upkeep = 0,
  loyalty = 1,
  traits = null,
  background = null,
  backgroundId = null,
  perks = null,
} = {}) => {
  const resolvedSpecialty = specialty ?? 'wheelman';
  const resolvedBackground = background
    ? cloneBackground(background)
    : backgroundId
    ? getBackgroundById(backgroundId)
    : cloneBackground(pickWeightedBackground(resolvedSpecialty));

  const resolvedTraits = traits
    ? CREW_TRAIT_KEYS.reduce(
        (accumulator, key) => ({
          ...accumulator,
          [key]: clampTraitLevel(traits[key] ?? 0),
        }),
        {},
      )
    : rollTraitSpread({ specialty: resolvedSpecialty, background: resolvedBackground });

  const resolvedPerks = Array.isArray(perks)
    ? [...perks]
    : resolvedBackground?.perkLabel
    ? [resolvedBackground.perkLabel]
    : [];

  return {
    id: id ?? generateId(),
    name: name ?? 'Crewmate',
    specialty: resolvedSpecialty,
    upkeep,
    loyalty,
    traits: resolvedTraits,
    background: resolvedBackground,
    perks: resolvedPerks,
  };
};

class CrewMember {
  constructor(options = {}) {
    const template = createCrewTemplate(options);
    this.id = template.id;
    this.name = template.name;
    this.specialty = template.specialty;
    this.upkeep = template.upkeep;
    this.loyalty = template.loyalty;
    this.traits = template.traits;
    this.background = template.background;
    this.perks = template.perks;
    this.status = 'idle';
  }

  setStatus(status) {
    this.status = status;
  }

  adjustLoyalty(amount) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric === 0) {
      return;
    }

    const current = Number.isFinite(this.loyalty) ? this.loyalty : 0;
    this.loyalty = Math.max(0, Math.min(5, current + numeric));
  }

  adjustTrait(traitKey, amount = 1) {
    const config = CREW_TRAIT_CONFIG[traitKey];
    if (!config) {
      return;
    }

    if (!this.traits || typeof this.traits !== 'object') {
      this.traits = {};
    }

    const currentValue = Number(this.traits[traitKey]) || 0;
    const delta = Number(amount);
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }

    const maxLevel = Number.isFinite(config.maxLevel) ? config.maxLevel : 6;
    const updatedValue = Math.max(0, Math.min(maxLevel, currentValue + delta));
    this.traits[traitKey] = Math.round(updatedValue);
  }
}

export {
  CrewMember,
  CREW_TRAIT_KEYS,
  CREW_TRAIT_CONFIG,
  CREW_BACKGROUNDS,
  createCrewTemplate,
  getBackgroundById,
};
