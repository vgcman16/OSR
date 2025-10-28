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

const CREW_FATIGUE_CONFIG = {
  maxFatigue: 100,
  tiredThreshold: 45,
  exhaustionThreshold: 80,
  missionFatigueBase: 26,
  missionDurationReference: 30,
  missionDifficultyReference: 3,
  recoveryPerDay: 35,
};

const CREW_REST_CONFIG = {
  maxDurationDays: 4,
  recoveryMultiplier: 1.6,
};

const clampFatigue = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(CREW_FATIGUE_CONFIG.maxFatigue, Math.round(numeric)));
};

const resolveRecoveryRate = (value) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  return CREW_FATIGUE_CONFIG.recoveryPerDay;
};

const clampTraitLevel = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(6, Math.round(numeric)));
};

const normalizeRestPlan = (plan) => {
  if (!plan || typeof plan !== 'object') {
    return null;
  }

  const remainingDaysRaw = Number(plan.remainingDays);
  const safeRemaining = Number.isFinite(remainingDaysRaw)
    ? Math.max(0, Math.min(CREW_REST_CONFIG.maxDurationDays, Math.round(remainingDaysRaw)))
    : 0;

  if (safeRemaining <= 0) {
    return null;
  }

  const multiplierRaw = Number(plan.recoveryMultiplier);
  const normalizedMultiplier = Number.isFinite(multiplierRaw) && multiplierRaw > 0
    ? multiplierRaw
    : CREW_REST_CONFIG.recoveryMultiplier;

  const orderedAtRaw = Number(plan.orderedAt);
  const orderedAt = Number.isFinite(orderedAtRaw) ? orderedAtRaw : Date.now();

  return {
    remainingDays: safeRemaining,
    recoveryMultiplier: normalizedMultiplier,
    orderedAt,
  };
};

const normalizeStoryProgress = (progress) => {
  if (!progress || typeof progress !== 'object') {
    return { completedSteps: [] };
  }

  const completed = Array.isArray(progress.completedSteps)
    ? progress.completedSteps
        .map((step) => (step ? String(step) : null))
        .filter((step, index, array) => step && array.indexOf(step) === index)
    : [];

  return { completedSteps: completed };
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
  storyProgress = null,
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
  const resolvedStoryProgress = normalizeStoryProgress(storyProgress ?? {});

  return {
    id: id ?? generateId(),
    name: name ?? 'Crewmate',
    specialty: resolvedSpecialty,
    upkeep,
    loyalty,
    traits: resolvedTraits,
    background: resolvedBackground,
    perks: resolvedPerks,
    storyProgress: resolvedStoryProgress,
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
    this.storyProgress = normalizeStoryProgress(options.storyProgress ?? template.storyProgress ?? {});
    this.status = 'idle';
    this.falloutStatus = options.falloutStatus ?? null;
    this.falloutDetails =
      typeof options.falloutDetails === 'object' && options.falloutDetails !== null
        ? { ...options.falloutDetails }
        : null;
    const fatigueValue = Number(options.fatigue);
    this.fatigue = clampFatigue(Number.isFinite(fatigueValue) ? fatigueValue : 0);
    this.fatigueRecoveryPerDay = resolveRecoveryRate(options.fatigueRecoveryPerDay);
    const lastRestedAt = Number(options.lastRestedAt);
    this.lastRestedAt = Number.isFinite(lastRestedAt) ? lastRestedAt : Date.now();
    const lastMissionCompletedAt = Number(options.lastMissionCompletedAt);
    this.lastMissionCompletedAt = Number.isFinite(lastMissionCompletedAt)
      ? lastMissionCompletedAt
      : null;
    const restPlan = options.restPlan ?? null;
    this.restPlan = normalizeRestPlan(restPlan);
    if (this.isExhausted()) {
      this.status = 'needs-rest';
    }
  }

  setStatus(status) {
    this.status = status;
  }

  getFatigueLevel() {
    this.fatigue = clampFatigue(this.fatigue);
    return this.fatigue;
  }

  getFatigueRecoveryRate() {
    this.fatigueRecoveryPerDay = resolveRecoveryRate(this.fatigueRecoveryPerDay);
    return this.fatigueRecoveryPerDay;
  }

  getReadinessState() {
    const statusLabel = (this.status ?? '').toLowerCase();
    if (this.hasActiveRestOrder() && !['on-mission', 'on-recon'].includes(statusLabel)) {
      return 'resting';
    }
    const fatigue = this.getFatigueLevel();
    if (fatigue >= CREW_FATIGUE_CONFIG.exhaustionThreshold) {
      return 'exhausted';
    }

    if (fatigue >= CREW_FATIGUE_CONFIG.tiredThreshold) {
      return 'tired';
    }

    return 'ready';
  }

  getReadinessSummary() {
    return {
      fatigue: this.getFatigueLevel(),
      state: this.getReadinessState(),
      recoveryPerDay: this.getFatigueRecoveryRate(),
      maxFatigue: CREW_FATIGUE_CONFIG.maxFatigue,
      restPlan: this.restPlan && this.restPlan.remainingDays > 0 ? { ...this.restPlan } : null,
    };
  }

  isExhausted() {
    return this.getFatigueLevel() >= CREW_FATIGUE_CONFIG.exhaustionThreshold;
  }

  hasActiveRestOrder() {
    return Boolean(this.restPlan && this.restPlan.remainingDays > 0);
  }

  isResting() {
    const statusLabel = (this.status ?? '').toLowerCase();
    return this.hasActiveRestOrder() && statusLabel === 'resting';
  }

  isRestEligible() {
    const statusLabel = (this.status ?? '').toLowerCase();
    if (['on-mission', 'on-recon', 'captured'].includes(statusLabel)) {
      return false;
    }

    return true;
  }

  markRestOrder({ days = 1, recoveryMultiplier = CREW_REST_CONFIG.recoveryMultiplier } = {}) {
    if (!this.isRestEligible()) {
      return null;
    }

    const normalizedDays = Number.isFinite(days) ? Math.max(1, Math.round(days)) : 1;
    const normalizedMultiplier = Number.isFinite(recoveryMultiplier)
      ? Math.max(1, recoveryMultiplier)
      : CREW_REST_CONFIG.recoveryMultiplier;

    if (!this.restPlan || this.restPlan.remainingDays <= 0) {
      this.restPlan = {
        remainingDays: Math.min(normalizedDays, CREW_REST_CONFIG.maxDurationDays),
        recoveryMultiplier: normalizedMultiplier,
        orderedAt: Date.now(),
      };
    } else {
      const combinedDays = this.restPlan.remainingDays + normalizedDays;
      this.restPlan.remainingDays = Math.min(combinedDays, CREW_REST_CONFIG.maxDurationDays);
      this.restPlan.recoveryMultiplier = normalizedMultiplier;
      this.restPlan.orderedAt = Date.now();
    }

    if (!['on-mission', 'on-recon'].includes((this.status ?? '').toLowerCase())) {
      this.setStatus('resting');
    }

    return { ...this.restPlan };
  }

  clearRestOrder({ keepStatus = false } = {}) {
    this.restPlan = null;

    if (keepStatus) {
      return;
    }

    if (this.isExhausted()) {
      this.setStatus('needs-rest');
    } else {
      this.setStatus('idle');
    }
  }

  getCompletedStorySteps() {
    return Array.isArray(this.storyProgress?.completedSteps)
      ? [...this.storyProgress.completedSteps]
      : [];
  }

  hasCompletedStoryStep(stepId) {
    if (!stepId) {
      return false;
    }
    const normalizedId = String(stepId);
    return this.getCompletedStorySteps().includes(normalizedId);
  }

  markStoryStepComplete(stepId) {
    if (!stepId) {
      return this.getStoryProgressSnapshot();
    }

    const normalizedId = String(stepId);
    const completed = new Set(this.getCompletedStorySteps());
    completed.add(normalizedId);
    this.storyProgress = {
      completedSteps: Array.from(completed),
    };
    return this.getStoryProgressSnapshot();
  }

  getStoryProgressSnapshot() {
    return {
      completedSteps: this.getCompletedStorySteps(),
    };
  }

  addPerk(perk) {
    if (!perk) {
      return Array.isArray(this.perks) ? this.perks.slice() : [];
    }

    const normalizedPerk = String(perk);
    if (!Array.isArray(this.perks)) {
      this.perks = [];
    }

    if (!this.perks.includes(normalizedPerk)) {
      this.perks.push(normalizedPerk);
    }

    return this.perks.slice();
  }

  applyRestRecovery(days = 1, { recoveryMultiplier = 1 } = {}) {
    const normalizedDays = Number.isFinite(days) ? Math.max(0, days) : 0;
    if (normalizedDays <= 0) {
      return this.getFatigueLevel();
    }

    if (!this.hasActiveRestOrder()) {
      return this.recoverFatigue(normalizedDays, { recoveryMultiplier });
    }

    const plan = this.restPlan;
    const restMultiplier = Number.isFinite(plan.recoveryMultiplier)
      ? Math.max(1, plan.recoveryMultiplier)
      : CREW_REST_CONFIG.recoveryMultiplier;
    const normalizedRecoveryMultiplier = Number.isFinite(recoveryMultiplier) && recoveryMultiplier > 0
      ? recoveryMultiplier
      : 1;
    const combinedMultiplier = restMultiplier * normalizedRecoveryMultiplier;

    let remainingDays = normalizedDays;
    const acceleratedDays = Math.min(plan.remainingDays, remainingDays);
    if (acceleratedDays > 0) {
      this.recoverFatigue(acceleratedDays, {
        recoveryMultiplier: combinedMultiplier,
        preserveStatus: true,
      });
      plan.remainingDays -= acceleratedDays;
      remainingDays -= acceleratedDays;
    }

    if (remainingDays > 0) {
      this.recoverFatigue(remainingDays, {
        recoveryMultiplier: normalizedRecoveryMultiplier,
        preserveStatus: true,
      });
    }

    if (plan.remainingDays <= 0 || this.getFatigueLevel() === 0) {
      this.clearRestOrder();
    } else if (!['on-mission', 'on-recon'].includes((this.status ?? '').toLowerCase())) {
      this.setStatus('resting');
    }

    return this.getFatigueLevel();
  }

  isMissionReady() {
    const statusLabel = (this.status ?? 'idle').toLowerCase();
    if (statusLabel !== 'idle') {
      return false;
    }

    return !this.isExhausted();
  }

  beginMission() {
    if (this.hasActiveRestOrder()) {
      this.clearRestOrder({ keepStatus: true });
    }
    this.setStatus('on-mission');
  }

  beginRecon() {
    if (this.hasActiveRestOrder()) {
      this.clearRestOrder({ keepStatus: true });
    }
    this.setStatus('on-recon');
    return this.status;
  }

  applyMissionFatigue(impact = CREW_FATIGUE_CONFIG.missionFatigueBase) {
    const normalizedImpact = Number(impact);
    const fatigueDelta = Number.isFinite(normalizedImpact)
      ? normalizedImpact
      : CREW_FATIGUE_CONFIG.missionFatigueBase;
    const nextFatigue = clampFatigue(this.getFatigueLevel() + fatigueDelta);
    this.fatigue = nextFatigue;
    this.lastMissionCompletedAt = Date.now();
    return this.fatigue;
  }

  applyMissionFallout(fallout = {}) {
    if (!fallout || typeof fallout !== 'object') {
      return null;
    }

    const timestamp = Number.isFinite(fallout.timestamp) ? fallout.timestamp : Date.now();
    const normalizedStatus = String(fallout.status ?? fallout.state ?? '')
      .trim()
      .toLowerCase();
    if (!normalizedStatus) {
      return null;
    }

    const details = {
      ...fallout,
      status: normalizedStatus,
      timestamp,
    };

    this.falloutStatus = normalizedStatus;
    this.falloutDetails = details;

    if (normalizedStatus === 'captured') {
      this.setStatus('captured');
      this.capturedAt = timestamp;
    } else if (normalizedStatus === 'injured') {
      this.setStatus('injured');
      this.injuredAt = timestamp;
    } else {
      this.setStatus(normalizedStatus);
    }

    return details;
  }

  clearMissionFallout({ fallbackStatus = null } = {}) {
    this.falloutStatus = null;
    this.falloutDetails = null;

    if (fallbackStatus) {
      this.setStatus(fallbackStatus);
      return this.status;
    }

    if (this.isExhausted()) {
      this.setStatus('needs-rest');
    } else {
      this.setStatus('idle');
    }

    return this.status;
  }

  finishMission({ fatigueImpact = CREW_FATIGUE_CONFIG.missionFatigueBase, fallout = null } = {}) {
    const resultingFatigue = this.applyMissionFatigue(fatigueImpact);
    if (fallout && fallout.status) {
      this.applyMissionFallout(fallout);
      return resultingFatigue;
    }

    if (resultingFatigue >= CREW_FATIGUE_CONFIG.exhaustionThreshold) {
      this.setStatus('needs-rest');
    } else {
      this.setStatus('idle');
    }
    return resultingFatigue;
  }

  recoverFatigue(days = 1, { recoveryMultiplier = 1, preserveStatus = false } = {}) {
    if (['on-mission', 'on-recon'].includes((this.status ?? '').toLowerCase())) {
      return this.getFatigueLevel();
    }

    const normalizedDays = Number(days);
    const safeDays = Number.isFinite(normalizedDays) && normalizedDays > 0 ? normalizedDays : 0;
    if (safeDays <= 0) {
      return this.getFatigueLevel();
    }

    const normalizedMultiplier = Number.isFinite(recoveryMultiplier) && recoveryMultiplier > 0
      ? recoveryMultiplier
      : 1;
    const recoveryPerDay = this.getFatigueRecoveryRate() * normalizedMultiplier;
    const totalRecovery = Math.max(0, recoveryPerDay * safeDays);
    if (totalRecovery <= 0) {
      return this.getFatigueLevel();
    }

    const nextFatigue = clampFatigue(this.getFatigueLevel() - totalRecovery);
    this.fatigue = nextFatigue;

    if (nextFatigue === 0) {
      this.lastRestedAt = Date.now();
    }

    if (!preserveStatus) {
      if (this.status === 'needs-rest' && nextFatigue < CREW_FATIGUE_CONFIG.exhaustionThreshold) {
        this.setStatus('idle');
      } else if (nextFatigue === 0) {
        this.setStatus('idle');
      }
    }

    return this.fatigue;
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

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      specialty: this.specialty,
      upkeep: this.upkeep,
      loyalty: this.loyalty,
      traits: { ...this.traits },
      background: this.background ? { ...this.background } : null,
      perks: Array.isArray(this.perks) ? [...this.perks] : [],
      status: this.status,
      falloutStatus: this.falloutStatus,
      falloutDetails:
        typeof this.falloutDetails === 'object' && this.falloutDetails !== null
          ? { ...this.falloutDetails }
          : null,
      fatigue: this.fatigue,
      fatigueRecoveryPerDay: this.fatigueRecoveryPerDay,
      lastRestedAt: this.lastRestedAt,
      lastMissionCompletedAt: this.lastMissionCompletedAt,
      restPlan: this.restPlan ? { ...this.restPlan } : null,
      storyProgress: this.getStoryProgressSnapshot(),
    };
  }

  static fromJSON(data) {
    if (data instanceof CrewMember) {
      return data;
    }

    if (!data || typeof data !== 'object') {
      return null;
    }

    return new CrewMember({
      ...data,
      perks: Array.isArray(data.perks) ? [...data.perks] : data.perks,
      restPlan:
        data.restPlan && typeof data.restPlan === 'object'
          ? { ...data.restPlan }
          : null,
      storyProgress:
        data.storyProgress && typeof data.storyProgress === 'object'
          ? { ...data.storyProgress }
          : undefined,
    });
  }
}

export {
  CrewMember,
  CREW_TRAIT_KEYS,
  CREW_TRAIT_CONFIG,
  CREW_BACKGROUNDS,
  createCrewTemplate,
  getBackgroundById,
  CREW_FATIGUE_CONFIG,
  CREW_REST_CONFIG,
};
