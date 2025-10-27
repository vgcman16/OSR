const normalizeNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const STORYLINE_DEFINITIONS = {
  'ghost-operative': [
    {
      id: 'ghost-operative-signal-cut',
      label: 'Silence the Signal Net',
      loyaltyRequirement: 3,
      mission: {
        difficulty: 2,
        payout: 9000,
        heat: 1,
        duration: 32,
        description: 'Trace a covert surveillance uplink and crash it before the crackdown locks you out.',
      },
      rewards: {
        loyalty: 1,
        traitBoosts: { stealth: 1 },
        perk: 'Signal Scrambler: Gains +5% success when stealth support is assigned.',
      },
      failurePenalty: {
        loyalty: -1,
      },
      successSummary: 'Ghost network restored — stealth routines strengthened.',
      failureSummary: 'Asset compromised — loyalty shaken until you rebuild trust.',
    },
    {
      id: 'ghost-operative-shadow-web',
      label: 'Restore the Shadow Web',
      loyaltyRequirement: 4,
      mission: {
        difficulty: 3,
        payout: 12000,
        heat: 1,
        duration: 44,
        description: 'Broker encrypted backchannels so the crew can vanish after priority heists.',
      },
      rewards: {
        loyalty: 1,
        traitBoosts: { tech: 1 },
        perk: 'Phantom Overwatch: Adds a light heat reduction bonus when deployed.',
      },
      failurePenalty: {
        loyalty: -1,
      },
      successSummary: 'Shadow web rebuilt — tech instincts sharpened.',
      failureSummary: 'The counter-intel seed money burned; loyalty falters.',
    },
  ],
  'garage-prodigy': [
    {
      id: 'garage-prodigy-salvage',
      label: 'Secure Prototype Salvage',
      loyaltyRequirement: 3,
      mission: {
        difficulty: 2,
        payout: 8500,
        heat: 1,
        duration: 36,
        description: 'Lift a crate of prototype parts before corporate recovery crews arrive.',
      },
      rewards: {
        loyalty: 1,
        traitBoosts: { tech: 1 },
        perk: 'Custom Fabrication: Unlocks bonus vehicle mod options.',
      },
      failurePenalty: {
        loyalty: -1,
      },
      successSummary: 'Prototype haul secured — fabrication talent surges.',
      failureSummary: 'Parts lost to a sweep — confidence dips.',
    },
    {
      id: 'garage-prodigy-testbed',
      label: 'Stress-Test the New Rig',
      loyaltyRequirement: 4,
      mission: {
        difficulty: 3,
        payout: 14000,
        heat: 1,
        duration: 48,
        description: 'Run a midnight shakedown sprint to prove the new drivetrain concept.',
      },
      rewards: {
        loyalty: 1,
        traitBoosts: { driving: 1 },
        perk: 'Dyno Whisperer: Vehicle wear reduced after missions they lead.',
      },
      failurePenalty: {
        loyalty: -1,
      },
      successSummary: 'Dyno data locked — driving instincts dialed in.',
      failureSummary: 'Test rig flames out — trust takes a hit.',
    },
  ],
  'syndicate-fixer': [
    {
      id: 'syndicate-fixer-blackmail',
      label: 'Collect the Blackmail Ledger',
      loyaltyRequirement: 3,
      mission: {
        difficulty: 2,
        payout: 10000,
        heat: 1,
        duration: 34,
        description: 'Raid a private banker and seize leverage on the crackdown task force.',
      },
      rewards: {
        loyalty: 1,
        traitBoosts: { charisma: 1 },
        perk: 'Favors on Call: Adds a small payout bonus when negotiating.',
      },
      failurePenalty: {
        loyalty: -1,
      },
      successSummary: 'Ledger secured — new favors flood in.',
      failureSummary: 'The mark escaped — crew trust rattled.',
    },
    {
      id: 'syndicate-fixer-courier',
      label: 'Broker the Courier Truce',
      loyaltyRequirement: 4,
      mission: {
        difficulty: 3,
        payout: 15000,
        heat: 1,
        duration: 46,
        description: 'Cut a deal between rival crews so high-value jobs stay off the crackdown radar.',
      },
      rewards: {
        loyalty: 1,
        traitBoosts: { tactics: 1 },
        perk: 'Smokescreen Retainer: Crackdown heat gains eased after successful missions.',
      },
      failurePenalty: {
        loyalty: -1,
      },
      successSummary: 'Courier truce forged — tactical planning sharpens.',
      failureSummary: 'Talks collapse — loyalty cools.',
    },
  ],
  'street-enforcer': [
    {
      id: 'street-enforcer-protection',
      label: 'Shield the Safehouse Ring',
      loyaltyRequirement: 3,
      mission: {
        difficulty: 2,
        payout: 9000,
        heat: 1,
        duration: 38,
        description: 'Intercept a crackdown strike team hunting your satellite safehouses.',
      },
      rewards: {
        loyalty: 1,
        traitBoosts: { muscle: 1 },
        perk: 'Frontline Veteran: Crew heat spikes drop when they anchor the team.',
      },
      failurePenalty: {
        loyalty: -1,
      },
      successSummary: 'Safehouse ring defended — frontline grit reinforced.',
      failureSummary: 'Strike team broke through — loyalty sours.',
    },
    {
      id: 'street-enforcer-insurgency',
      label: 'Stage the Counter-Insurgency',
      loyaltyRequirement: 4,
      mission: {
        difficulty: 3,
        payout: 13000,
        heat: 1,
        duration: 50,
        description: 'Lead a night raid that forces the crackdown to redeploy.',
      },
      rewards: {
        loyalty: 1,
        traitBoosts: { tactics: 1 },
        perk: 'Zone Commander: Adds success momentum against high-heat jobs.',
      },
      failurePenalty: {
        loyalty: -1,
      },
      successSummary: 'Counter-strike lands — tactical instincts refined.',
      failureSummary: 'Offensive stalled — loyalty dips.',
    },
  ],
  'street-racer': [
    {
      id: 'street-racer-hijack',
      label: 'Hijack the Crackdown Convoy',
      loyaltyRequirement: 3,
      mission: {
        difficulty: 2,
        payout: 9500,
        heat: 1,
        duration: 30,
        description: 'Ambush a task force convoy to reclaim impounded performance parts.',
      },
      rewards: {
        loyalty: 1,
        traitBoosts: { driving: 1 },
        perk: 'Convoy Raider: Unlocks bonus getaway options.',
      },
      failurePenalty: {
        loyalty: -1,
      },
      successSummary: 'Convoy cracked — wheelman instincts sharpened.',
      failureSummary: 'Convoy slipped away — loyalty shaken.',
    },
    {
      id: 'street-racer-rally',
      label: 'Win the Midnight Rally',
      loyaltyRequirement: 4,
      mission: {
        difficulty: 3,
        payout: 13500,
        heat: 1,
        duration: 42,
        description: 'Outrun crackdown interceptors during a midnight showcase to restore cred.',
      },
      rewards: {
        loyalty: 1,
        traitBoosts: { stealth: 1 },
        perk: 'Ghost Lines: Adds a modest success boost on high-speed exits.',
      },
      failurePenalty: {
        loyalty: -1,
      },
      successSummary: 'Rally domination — stealth instincts tuned for motion.',
      failureSummary: 'Crash-out broadcast — morale rattled.',
    },
  ],
  default: [
    {
      id: 'crew-default-trust',
      label: 'Earned Trust Operation',
      loyaltyRequirement: 3,
      mission: {
        difficulty: 2,
        payout: 8000,
        heat: 1,
        duration: 32,
        description: 'Complete a precision contract that cements the crew member\'s loyalty.',
      },
      rewards: {
        loyalty: 1,
      },
      failurePenalty: {
        loyalty: -1,
      },
      successSummary: 'Trust secured — loyalty climbs.',
      failureSummary: 'Operation faltered — loyalty slips.',
    },
  ],
};

const getStorylineForBackground = (backgroundId) => {
  const normalizedId = typeof backgroundId === 'string' ? backgroundId.toLowerCase() : '';
  return STORYLINE_DEFINITIONS[normalizedId] ?? STORYLINE_DEFINITIONS.default;
};

const getNextEligibleStep = (member) => {
  if (!member) {
    return null;
  }
  const backgroundId = member.background?.id ?? 'default';
  const storyline = getStorylineForBackground(backgroundId);
  if (!Array.isArray(storyline) || !storyline.length) {
    return null;
  }
  const completed = new Set(
    typeof member.getCompletedStorySteps === 'function'
      ? member.getCompletedStorySteps()
      : Array.isArray(member.storyProgress?.completedSteps)
        ? member.storyProgress.completedSteps
        : [],
  );
  const loyalty = normalizeNumber(member.loyalty, 0);
  return storyline.find((step) => !completed.has(step.id) && loyalty >= normalizeNumber(step.loyaltyRequirement, 0)) ?? null;
};

const buildStorylineMissionTemplate = (member, step) => {
  if (!member || !step) {
    return null;
  }

  const missionId = `loyalty-${member.id}-${step.id}`;
  const description = step.mission?.description ?? 'Run a precision op to strengthen loyalty.';

  return {
    id: missionId,
    name: `${member.name ?? 'Crew member'}: ${step.label}`,
    difficulty: normalizeNumber(step.mission?.difficulty, 2),
    payout: normalizeNumber(step.mission?.payout, 0),
    heat: normalizeNumber(step.mission?.heat, 1),
    duration: normalizeNumber(step.mission?.duration, 32),
    description,
    category: 'crew-loyalty',
    ignoreCrackdownRestrictions: true,
    storyline: {
      type: 'crew-loyalty',
      crewId: member.id ?? null,
      crewName: member.name ?? 'Crew member',
      backgroundId: member.background?.id ?? 'default',
      stepId: step.id,
    },
  };
};

const getAvailableCrewStorylineMissions = (crewMembers = []) => {
  if (!Array.isArray(crewMembers) || !crewMembers.length) {
    return [];
  }

  return crewMembers
    .map((member) => {
      const step = getNextEligibleStep(member);
      if (!step) {
        return null;
      }
      const mission = buildStorylineMissionTemplate(member, step);
      return mission;
    })
    .filter(Boolean);
};

const applyTraitBoosts = (member, traitBoosts = {}) => {
  if (!member || typeof traitBoosts !== 'object' || traitBoosts === null) {
    return {};
  }

  const applied = {};
  Object.entries(traitBoosts).forEach(([trait, delta]) => {
    const numericDelta = Number(delta);
    if (!Number.isFinite(numericDelta) || numericDelta === 0) {
      return;
    }
    const currentValue = normalizeNumber(member.traits?.[trait], 0);
    const nextValue = Math.max(0, currentValue + Math.round(numericDelta));
    if (member.traits) {
      member.traits[trait] = nextValue;
    }
    applied[trait] = nextValue - currentValue;
  });
  return applied;
};

const applyCrewStorylineOutcome = (member, stepId, outcome) => {
  if (!member || !stepId) {
    return null;
  }

  const backgroundId = member.background?.id ?? 'default';
  const storyline = getStorylineForBackground(backgroundId);
  const step = storyline.find((entry) => entry.id === stepId);
  if (!step) {
    return null;
  }

  const success = outcome === 'success';
  const payload = success ? step.rewards ?? {} : step.failurePenalty ?? {};
  const summary = success ? step.successSummary : step.failureSummary;

  let loyaltyDelta = 0;
  const loyaltyChange = normalizeNumber(payload.loyalty, 0);
  if (Number.isFinite(loyaltyChange) && loyaltyChange !== 0) {
    if (typeof member.adjustLoyalty === 'function') {
      member.adjustLoyalty(loyaltyChange);
    } else {
      member.loyalty = normalizeNumber(member.loyalty, 0) + loyaltyChange;
    }
    loyaltyDelta = loyaltyChange;
  }

  const traitBoosts = success ? applyTraitBoosts(member, payload.traitBoosts) : {};

  let perkAwarded = null;
  if (success && payload.perk) {
    if (typeof member.addPerk === 'function') {
      member.addPerk(payload.perk);
    } else {
      member.perks = Array.isArray(member.perks) ? member.perks : [];
      if (!member.perks.includes(payload.perk)) {
        member.perks.push(payload.perk);
      }
    }
    perkAwarded = payload.perk;
  }

  if (success && typeof member.markStoryStepComplete === 'function') {
    member.markStoryStepComplete(stepId);
  }

  return {
    success,
    loyaltyDelta,
    traitBoosts,
    perkAwarded,
    summary,
  };
};

export { getAvailableCrewStorylineMissions, applyCrewStorylineOutcome };
