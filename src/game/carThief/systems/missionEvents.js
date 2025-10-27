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

const clamp01 = (value) => clamp(value, 0, 1);

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeString = (value) => (typeof value === 'string' ? value.toLowerCase() : null);

const normalizeTierList = (list, normalizer = normalizeString) => {
  if (!Array.isArray(list)) {
    return null;
  }

  const normalized = list
    .map((item) => normalizer(item))
    .filter((item) => typeof item === 'string');

  if (!normalized.length) {
    return null;
  }

  return Array.from(new Set(normalized));
};

const normalizeWeightMap = (mapping, normalizer = normalizeString) => {
  if (!mapping || typeof mapping !== 'object') {
    return {};
  }

  return Object.entries(mapping).reduce((result, [key, value]) => {
    const normalizedKey = normalizer(key);
    const numeric = Number(value);
    if (typeof normalizedKey === 'string' && Number.isFinite(numeric)) {
      result[normalizedKey] = Math.max(0, numeric);
    }
    return result;
  }, {});
};

const determineDifficultyBand = (difficulty) => {
  if (difficulty >= 5) {
    return 'high';
  }

  if (difficulty >= 3) {
    return 'mid';
  }

  return 'low';
};

const normalizeRiskTier = (value) => {
  const normalized = normalizeString(value);
  if (normalized === 'moderate' || normalized === 'high' || normalized === 'low') {
    return normalized;
  }
  return null;
};

const normalizeCrackdownTier = (value) => {
  const normalized = normalizeString(value);
  if (normalized === 'calm' || normalized === 'alert' || normalized === 'lockdown') {
    return normalized;
  }
  return null;
};

const missionEventTable = [
  {
    id: 'security-sweep',
    label: 'Security Sweep',
    description:
      'A surprise patrol sweeps the block just as the crew breaches the perimeter.',
    triggerProgress: 0.25,
    minDifficulty: 1,
    maxDifficulty: 4,
    riskTiers: ['moderate', 'high'],
    crackdownTiers: ['calm', 'alert'],
    baseWeight: 1.1,
    difficultyBandWeights: { mid: 1.2, high: 0.85 },
    crackdownTierWeights: { alert: 1.2 },
    choices: [
      {
        id: 'security-sweep-burn-gear',
        label: 'Burn backup gear for stealth',
        description: 'Spend spare tools to stay invisible and steady the crew.',
        narrative: 'Crew burned backup gear to ghost past the sweep.',
        effects: {
          payoutMultiplier: 0.9,
          heatDelta: -1.5,
          successDelta: 0.05,
        },
      },
      {
        id: 'security-sweep-push-through',
        label: 'Punch through the checkpoint',
        description: 'Gun it past patrols to save time at the cost of extra attention.',
        narrative: 'They redlined the engines to beat the sweep.',
        effects: {
          durationMultiplier: 0.85,
          heatDelta: 1.2,
          successDelta: -0.04,
        },
      },
    ],
  },
  {
    id: 'vault-cache',
    label: 'Hidden Cache',
    description: 'The crew spots an unlisted stash locker near the objective.',
    triggerProgress: 0.55,
    minDifficulty: 2,
    maxDifficulty: 5,
    riskTiers: ['moderate', 'high'],
    crackdownTiers: ['calm'],
    baseWeight: 1.05,
    difficultyBandWeights: { mid: 1.1, high: 1.2 },
    choices: [
      {
        id: 'vault-cache-grab',
        label: 'Crack it for a bigger score',
        description: 'Divert time to raid the cache for extra payout but heat rises.',
        narrative: 'Crew cracked the side cache for extra loot.',
        effects: {
          payoutMultiplier: 1.2,
          heatDelta: 1,
          successDelta: -0.03,
          durationMultiplier: 1.05,
        },
      },
      {
        id: 'vault-cache-mark',
        label: 'Tag it for later',
        description: 'Log the stash for a future run, keeping the mission tight.',
        narrative: 'They logged the cache for later and stayed on-plan.',
        effects: {
          successDelta: 0.03,
        },
      },
    ],
  },
  {
    id: 'exit-ambush',
    label: 'Exit Ambush',
    description: 'An unmarked cruiser blocks the getaway route moments before extraction.',
    triggerProgress: 0.85,
    minDifficulty: 1,
    maxDifficulty: 6,
    riskTiers: ['low', 'moderate', 'high'],
    crackdownTiers: ['calm', 'alert', 'lockdown'],
    baseWeight: 1.2,
    difficultyBandWeights: { low: 0.9, mid: 1.1, high: 1.3 },
    crackdownTierWeights: { alert: 1.2, lockdown: 1.4 },
    choices: [
      {
        id: 'exit-ambush-favors',
        label: 'Call in favors for extraction',
        description: 'Burn goodwill to stay safe, hurting loyalty but cooling heat.',
        narrative: 'Burned a stack of favors for a clean extraction.',
        effects: {
          heatDelta: -1,
          successDelta: 0.04,
          crewLoyaltyDelta: -1,
        },
      },
      {
        id: 'exit-ambush-hold',
        label: 'Hold the line and push through',
        description: 'Fight through the block, risking more attention for better loot.',
        narrative: 'They muscled through the blockade and kept the haul intact.',
        effects: {
          payoutMultiplier: 1.1,
          heatDelta: 1.3,
          successDelta: -0.02,
          durationMultiplier: 1.1,
        },
      },
    ],
  },
  {
    id: 'street-intel',
    label: 'Street Intel Surge',
    description: 'Lookouts flag extra patrol rotations across nearby blocks.',
    triggerProgress: 0.18,
    minDifficulty: 1,
    maxDifficulty: 3,
    riskTiers: ['low', 'moderate'],
    crackdownTiers: ['calm', 'alert'],
    baseWeight: 1.3,
    difficultyBandWeights: { low: 1.4, mid: 1.1 },
    riskTierWeights: { low: 1.25 },
    choices: [
      {
        id: 'street-intel-bribe',
        label: 'Pay the watchers to redirect heat',
        description: 'Kick cash to lookouts so patrols shadow another block.',
        narrative: 'Cash peeled patrols away before the job ramped up.',
        effects: {
          payoutMultiplier: 0.92,
          heatDelta: -1.1,
          successDelta: 0.03,
        },
      },
      {
        id: 'street-intel-ignore',
        label: 'Ignore the chatter and press on',
        description: 'Stay on schedule, risking extra attention to keep the haul intact.',
        narrative: 'Crew stuck to the plan despite the chatter.',
        effects: {
          heatDelta: 0.8,
          successDelta: -0.02,
          payoutMultiplier: 1.04,
        },
      },
    ],
  },
  {
    id: 'syndicate-tithe',
    label: 'Syndicate Tithe',
    description: 'A rival outfit wants a slice to keep their crew off your back.',
    triggerProgress: 0.68,
    minDifficulty: 2,
    maxDifficulty: 5,
    riskTiers: ['moderate', 'high'],
    crackdownTiers: ['calm', 'alert'],
    baseWeight: 1.15,
    riskTierWeights: { high: 1.2 },
    choices: [
      {
        id: 'syndicate-tithe-pay',
        label: 'Pay the tithe',
        description: 'Hand over a cut for a quieter extraction window.',
        narrative: 'They tossed the rivals a bundle and coasted through contested turf.',
        effects: {
          payoutMultiplier: 0.85,
          heatDelta: -1.4,
          successDelta: 0.04,
        },
      },
      {
        id: 'syndicate-tithe-refuse',
        label: 'Refuse and double down',
        description: 'Keep every credit, daring the rivals to interfere.',
        narrative: 'Crew stiffed the tithe and dared anyone to step in.',
        effects: {
          payoutMultiplier: 1.16,
          heatDelta: 1.6,
          successDelta: -0.05,
        },
      },
    ],
  },
  {
    id: 'armored-response',
    label: 'Armored Response',
    description: 'Citywide crackdown diverts an armored quick-response team to the scene.',
    triggerProgress: 0.78,
    minDifficulty: 3,
    maxDifficulty: 6,
    riskTiers: ['high'],
    crackdownTiers: ['alert', 'lockdown'],
    baseWeight: 0.9,
    difficultyBandWeights: { high: 1.5 },
    crackdownTierWeights: { alert: 1.3, lockdown: 1.6 },
    choices: [
      {
        id: 'armored-response-decoy',
        label: 'Deploy decoy convoys',
        description: 'Sacrifice stolen beaters to lure the armored team away.',
        narrative: 'They baited the armored response with sacrificial decoys.',
        effects: {
          payoutMultiplier: 0.88,
          heatDelta: -1.8,
          successDelta: 0.05,
        },
      },
      {
        id: 'armored-response-break',
        label: 'Break through the cordon',
        description: 'Ram the armored line, risking crew harm for a bigger haul.',
        narrative: 'Crew shattered the cordon and dragged the score out under fire.',
        effects: {
          payoutMultiplier: 1.22,
          durationMultiplier: 1.15,
          heatDelta: 2,
          successDelta: -0.07,
        },
      },
    ],
  },
  {
    id: 'undercover-sting',
    label: 'Undercover Sting',
    description: 'Plainclothes units embed inside the target as the crackdown ramps up.',
    triggerProgress: 0.47,
    minDifficulty: 2,
    maxDifficulty: 6,
    riskTiers: ['moderate', 'high'],
    crackdownTiers: ['alert', 'lockdown'],
    baseWeight: 1.05,
    difficultyBandWeights: { mid: 1.15, high: 1.3 },
    crackdownTierWeights: { lockdown: 1.4 },
    choices: [
      {
        id: 'undercover-sting-expose',
        label: 'Expose the sting quietly',
        description: 'Leverage disguises to neutralize undercover units without alarms.',
        narrative: 'They quietly exposed the undercover plants before slipping past.',
        effects: {
          durationMultiplier: 1.08,
          heatDelta: -1.2,
          successDelta: 0.04,
        },
      },
      {
        id: 'undercover-sting-smash',
        label: 'Smash the sting and go loud',
        description: 'Blitz the plants, embracing collateral to keep the timeline tight.',
        narrative: 'Crew smashed the sting and went loud across the district.',
        effects: {
          durationMultiplier: 0.9,
          heatDelta: 1.7,
          successDelta: -0.03,
        },
      },
    ],
  },
  {
    id: 'black-market-favor',
    label: 'Black Market Favor',
    description: 'A fence offers an emergency exit in exchange for a future cut.',
    triggerProgress: 0.32,
    minDifficulty: 1,
    maxDifficulty: 4,
    riskTiers: ['low', 'moderate'],
    crackdownTiers: ['calm'],
    baseWeight: 1.1,
    riskTierWeights: { low: 1.1 },
    choices: [
      {
        id: 'black-market-favor-accept',
        label: 'Take the favor',
        description: 'Secure the exit but promise a slice of the next payout.',
        narrative: 'They banked a black-market favor for a cleaner escape.',
        effects: {
          successDelta: 0.05,
          futureDebt: 1,
        },
      },
      {
        id: 'black-market-favor-decline',
        label: 'Decline the favor',
        description: 'Keep independence, risking a rougher route.',
        narrative: 'Crew declined the favor and kept their autonomy.',
        effects: {
          successDelta: -0.03,
          payoutMultiplier: 1.06,
        },
      },
    ],
  },
];

const cloneChoice = (choice) => ({
  ...choice,
  effects: { ...choice.effects },
});

const cloneEvent = (event) => ({
  id: event.id,
  label: event.label,
  description: event.description,
  triggerProgress: clamp01(toFiniteNumber(event.triggerProgress, 0.5)),
  minDifficulty: toFiniteNumber(event.minDifficulty, 0),
  maxDifficulty: toFiniteNumber(event.maxDifficulty, Infinity),
  choices: Array.isArray(event.choices) ? event.choices.map((choice) => cloneChoice(choice)) : [],
  baseWeight: Number.isFinite(event.baseWeight) ? Math.max(0, event.baseWeight) : 1,
  difficultyBandWeights: normalizeWeightMap(event.difficultyBandWeights),
  riskTierWeights: normalizeWeightMap(event.riskTierWeights, normalizeRiskTier),
  crackdownTierWeights: normalizeWeightMap(event.crackdownTierWeights, normalizeCrackdownTier),
  riskTiers: normalizeTierList(event.riskTiers, normalizeRiskTier),
  crackdownTiers: normalizeTierList(event.crackdownTiers, normalizeCrackdownTier),
  poiContext:
    typeof event.poiContext === 'object' && event.poiContext !== null
      ? { ...event.poiContext }
      : null,
  triggered: false,
  resolved: false,
  selectionWeight: Number.isFinite(event.selectionWeight) ? Math.max(0, event.selectionWeight) : null,
});

const poiEventBuilders = {
  vault: (poi) => ({
    id: `poi-${poi.id ?? 'vault'}-failsafe`,
    label: 'Failsafe Countdown',
    description: `Emergency shutters begin to seal ${poi.name}, threatening to trap the crew and loot inside.`,
    triggerProgress: 0.62,
    minDifficulty: 1,
    maxDifficulty: 5,
    riskTiers: ['moderate', 'high'],
    crackdownTiers: ['calm', 'alert'],
    baseWeight: 1.1,
    choices: [
      {
        id: `poi-${poi.id ?? 'vault'}-overload`,
        label: 'Overload the failsafe',
        description: 'Burn charge packs to stall the lockdown and keep the vault open.',
        narrative: `They overloaded the failsafe at ${poi.name} long enough to finish the pull.`,
        effects: {
          payoutMultiplier: 0.97,
          heatDelta: -1,
          successDelta: 0.06,
        },
      },
      {
        id: `poi-${poi.id ?? 'vault'}-cut-losses`,
        label: 'Cut the haul and bail',
        description: 'Grab the smallest crates and punch out before the shutters seal.',
        narrative: `Crew bailed early with a lean haul from ${poi.name}.`,
        effects: {
          payoutMultiplier: 0.78,
          durationMultiplier: 0.85,
          successDelta: 0.1,
        },
      },
    ],
    poiContext: { id: poi.id ?? null, name: poi.name ?? null, type: poi.type ?? 'vault' },
  }),
  'tech-hub': (poi) => ({
    id: `poi-${poi.id ?? 'tech'}-datafork`,
    label: 'Prototype Firewall',
    description: `An experimental AI firewall flags the intrusion at ${poi.name}.`,
    triggerProgress: 0.48,
    minDifficulty: 2,
    maxDifficulty: 6,
    riskTiers: ['moderate', 'high'],
    crackdownTiers: ['calm', 'alert', 'lockdown'],
    baseWeight: 1.05,
    crackdownTierWeights: { lockdown: 1.25 },
    choices: [
      {
        id: `poi-${poi.id ?? 'tech'}-recode`,
        label: 'Spin up a counter-script',
        description: 'Pause the lift and let your hacker duel the AI for cleaner exfil.',
        narrative: `The crew duelled ${poi.name}'s firewall and slipped out ghost-clean.`,
        effects: {
          durationMultiplier: 1.12,
          heatDelta: -1.5,
          successDelta: 0.04,
        },
      },
      {
        id: `poi-${poi.id ?? 'tech'}-scramble`,
        label: 'Scramble the drives',
        description: 'Torch a cache of prototypes to blind the system and bolt.',
        narrative: `They torched prototype racks inside ${poi.name} to cover their retreat.`,
        effects: {
          payoutMultiplier: 0.9,
          heatDelta: 1.4,
          successDelta: -0.03,
        },
      },
    ],
    poiContext: { id: poi.id ?? null, name: poi.name ?? null, type: poi.type ?? 'tech-hub' },
  }),
  'rail-yard': (poi) => ({
    id: `poi-${poi.id ?? 'rail'}-switch`,
    label: 'Switchyard Shuffle',
    description: `A dispatcher reroutes locomotives near ${poi.name}, threatening the getaway lane.`,
    triggerProgress: 0.35,
    minDifficulty: 1,
    maxDifficulty: 4,
    riskTiers: ['low', 'moderate'],
    crackdownTiers: ['calm', 'alert'],
    baseWeight: 1.05,
    choices: [
      {
        id: `poi-${poi.id ?? 'rail'}-bribe`,
        label: 'Bribe the dispatcher',
        description: 'Grease the yard chief to freeze the rail grid in your favor.',
        narrative: `Crew greased the dispatcher and kept ${poi.name} running quiet.`,
        effects: {
          heatDelta: -0.5,
          payoutMultiplier: 0.95,
        },
      },
      {
        id: `poi-${poi.id ?? 'rail'}-barge-through`,
        label: 'Gun engines through the maze',
        description: 'Ride the chaos, risking a pile-up for a faster exit.',
        narrative: `They blasted through the rail maze around ${poi.name}.`,
        effects: {
          durationMultiplier: 0.75,
          heatDelta: 1.1,
          successDelta: -0.05,
        },
      },
    ],
    poiContext: { id: poi.id ?? null, name: poi.name ?? null, type: poi.type ?? 'rail-yard' },
  }),
  'smuggling-cache': (poi) => ({
    id: `poi-${poi.id ?? 'cache'}-doublecross`,
    label: 'Inside Contact',
    description: `A fixer tied to ${poi.name} demands a cut to stay quiet.`,
    triggerProgress: 0.52,
    minDifficulty: 1,
    maxDifficulty: 5,
    riskTiers: ['low', 'moderate', 'high'],
    crackdownTiers: ['calm', 'alert'],
    baseWeight: 1.15,
    riskTierWeights: { high: 1.1 },
    choices: [
      {
        id: `poi-${poi.id ?? 'cache'}-payoff`,
        label: 'Cut them in',
        description: 'Hand over a slice of the score to keep the network friendly.',
        narrative: `They cut the fixer at ${poi.name} into the score.`,
        effects: {
          payoutMultiplier: 0.88,
          heatDelta: -1.2,
          crewLoyaltyDelta: 1,
        },
      },
      {
        id: `poi-${poi.id ?? 'cache'}-ghost`,
        label: 'Ghost the contact',
        description: 'Ice the fixer and race the inevitable retaliation.',
        narrative: `Crew ghosted the fixer near ${poi.name} and kicked the hornet nest.`,
        effects: {
          heatDelta: 1.6,
          successDelta: -0.04,
          payoutMultiplier: 1.12,
        },
      },
    ],
    poiContext: { id: poi.id ?? null, name: poi.name ?? null, type: poi.type ?? 'smuggling-cache' },
  }),
  showroom: (poi) => ({
    id: `poi-${poi.id ?? 'showroom'}-demo`,
    label: 'Surprise Demo Night',
    description: `Investors swing by ${poi.name} for an unscheduled product demo.`,
    triggerProgress: 0.42,
    minDifficulty: 2,
    maxDifficulty: 5,
    riskTiers: ['moderate'],
    crackdownTiers: ['calm', 'alert'],
    baseWeight: 1.08,
    choices: [
      {
        id: `poi-${poi.id ?? 'showroom'}-blend`,
        label: 'Blend with the crowd',
        description: 'Throw on glam threads and mingle to stay off sensors.',
        narrative: `They blended with the crowd touring ${poi.name} and kept things cool.`,
        effects: {
          heatDelta: -0.8,
          durationMultiplier: 1.08,
        },
      },
      {
        id: `poi-${poi.id ?? 'showroom'}-flash`,
        label: 'Flash a reckless showcase',
        description: 'Turn the demo into cover for loading the prize ride. Loud but lucrative.',
        narrative: `Crew hijacked the demo at ${poi.name} for a bigger payoff.`,
        effects: {
          payoutMultiplier: 1.18,
          heatDelta: 1.3,
          successDelta: -0.02,
        },
      },
    ],
    poiContext: { id: poi.id ?? null, name: poi.name ?? null, type: poi.type ?? 'showroom' },
  }),
  'impound-lot': (poi) => ({
    id: `poi-${poi.id ?? 'impound'}-clampdown`,
    label: 'Impound Clampdown',
    description: `Lockdown orders flood ${poi.name} with officers guarding seized rides.`,
    triggerProgress: 0.29,
    minDifficulty: 2,
    maxDifficulty: 6,
    riskTiers: ['moderate', 'high'],
    crackdownTiers: ['alert', 'lockdown'],
    baseWeight: 1.2,
    crackdownTierWeights: { alert: 1.2, lockdown: 1.45 },
    choices: [
      {
        id: `poi-${poi.id ?? 'impound'}-riot`,
        label: 'Stage a diversion riot',
        description: 'Spark chaos at the front gate, burning favors for breathing room.',
        narrative: `They staged a riot at ${poi.name} to peel the officers away.`,
        effects: {
          heatDelta: -1.4,
          successDelta: 0.04,
          crewLoyaltyDelta: -1,
        },
      },
      {
        id: `poi-${poi.id ?? 'impound'}-force`,
        label: 'Force the depot gates',
        description: 'Breach the clamps with explosives, risking fallout but holding payout.',
        narrative: `Crew blew the clamps at ${poi.name} and hauled the rides into waiting trucks.`,
        effects: {
          payoutMultiplier: 1.14,
          heatDelta: 2,
          successDelta: -0.06,
        },
      },
    ],
    poiContext: { id: poi.id ?? null, name: poi.name ?? null, type: poi.type ?? 'impound-lot' },
  }),
  'megacorp-lab': (poi) => ({
    id: `poi-${poi.id ?? 'lab'}-failsafe`,
    label: 'Gen-Lab Failover',
    description: `Biohazard failsafes trip at ${poi.name}, threatening to seal the vault wing.`,
    triggerProgress: 0.58,
    minDifficulty: 3,
    maxDifficulty: 6,
    riskTiers: ['high'],
    crackdownTiers: ['alert', 'lockdown'],
    baseWeight: 1.25,
    difficultyBandWeights: { high: 1.3 },
    choices: [
      {
        id: `poi-${poi.id ?? 'lab'}-stabilize`,
        label: 'Stabilize the failover',
        description: 'Divert techs to spoof diagnostics and slow the lockdown.',
        narrative: `They stabilized ${poi.name}'s failover just long enough to rip the prototype free.`,
        effects: {
          durationMultiplier: 1.12,
          successDelta: 0.05,
          heatDelta: -1,
        },
      },
      {
        id: `poi-${poi.id ?? 'lab'}-vent`,
        label: 'Vent the wing',
        description: 'Purge the wing, risking alerts for a faster extraction.',
        narrative: `Crew purged ${poi.name}'s wing and stormed the vault under the alarms.`,
        effects: {
          durationMultiplier: 0.88,
          heatDelta: 1.5,
          successDelta: -0.04,
        },
      },
    ],
    poiContext: { id: poi.id ?? null, name: poi.name ?? null, type: poi.type ?? 'megacorp-lab' },
  }),
};

const buildPoiEvent = (poi) => {
  if (!poi || !poi.type) {
    return null;
  }

  const builder = poiEventBuilders[poi.type];
  if (typeof builder === 'function') {
    return builder(poi);
  }

  return {
    id: `poi-${poi.id ?? 'site'}-opportunity`,
    label: `${poi.name ?? 'Site'} Opportunity`,
    description: `A fleeting opportunity presents itself inside ${poi.name ?? 'the site'}.`,
    triggerProgress: 0.5,
    minDifficulty: 1,
    maxDifficulty: 6,
    riskTiers: ['low', 'moderate', 'high'],
    baseWeight: 1,
    choices: [
      {
        id: `poi-${poi.id ?? 'site'}-capitalize`,
        label: 'Capitalize on the moment',
        description: 'Press the advantage for more score while drawing attention.',
        narrative: `Crew pressed their luck at ${poi.name ?? 'the site'}.`,
        effects: {
          payoutMultiplier: 1.1,
          heatDelta: 1,
        },
      },
      {
        id: `poi-${poi.id ?? 'site'}-withdraw`,
        label: 'Stick to the plan',
        description: 'Ignore the distraction and keep the mission tight.',
        narrative: `They ignored the side hustle inside ${poi.name ?? 'the site'}.`,
        effects: {
          successDelta: 0.05,
        },
      },
    ],
    poiContext: { id: poi.id ?? null, name: poi.name ?? null, type: poi.type ?? null },
  };
};

const buildMissionEventDeck = (mission) => {
  const difficulty = toFiniteNumber(mission?.difficulty, 1);
  const riskTier = normalizeRiskTier(mission?.riskTier) ?? 'low';
  const crackdownTier =
    normalizeCrackdownTier(mission?.crackdownTier ?? mission?.activeCrackdownTier ?? mission?.crackdownLevel) ??
    'calm';
  const difficultyBand = determineDifficultyBand(difficulty);

  const candidateEvents = [];

  const addCandidateEvent = (event) => {
    if (!event) {
      return;
    }

    const withinDifficulty =
      difficulty >= event.minDifficulty &&
      difficulty <= (Number.isFinite(event.maxDifficulty) ? event.maxDifficulty : Infinity);
    if (!withinDifficulty) {
      return;
    }

    const allowedRisk = !event.riskTiers || event.riskTiers.includes(riskTier);
    const allowedCrackdown = !event.crackdownTiers || event.crackdownTiers.includes(crackdownTier);
    if (!allowedRisk || !allowedCrackdown) {
      return;
    }

    const cloned = cloneEvent(event);
    const baseWeight = Number.isFinite(cloned.baseWeight) ? cloned.baseWeight : 1;
    let weight = baseWeight;

    if (cloned.difficultyBandWeights && cloned.difficultyBandWeights[difficultyBand]) {
      weight *= cloned.difficultyBandWeights[difficultyBand];
    }

    if (cloned.riskTierWeights && cloned.riskTierWeights[riskTier]) {
      weight *= cloned.riskTierWeights[riskTier];
    }

    if (cloned.crackdownTierWeights && cloned.crackdownTierWeights[crackdownTier]) {
      weight *= cloned.crackdownTierWeights[crackdownTier];
    }

    cloned.selectionWeight = Math.max(0, Number.isFinite(weight) ? weight : baseWeight);
    cloned.appliedDifficultyBand = difficultyBand;
    cloned.appliedRiskTier = riskTier;
    cloned.appliedCrackdownTier = crackdownTier;

    if (cloned.selectionWeight > 0) {
      candidateEvents.push(cloned);
    }
  };

  missionEventTable.forEach((event) => addCandidateEvent(event));

  const poiEvent = buildPoiEvent(mission?.pointOfInterest);
  if (poiEvent) {
    addCandidateEvent(poiEvent);
  }

  if (!candidateEvents.length) {
    return [];
  }

  const desiredDeckSize = (() => {
    if (difficulty >= 5) {
      return 5;
    }
    if (difficulty >= 3) {
      return 4;
    }
    return 3;
  })();

  const sortedByWeight = candidateEvents
    .slice()
    .sort((a, b) => {
      const weightDelta = (b.selectionWeight ?? 0) - (a.selectionWeight ?? 0);
      if (weightDelta !== 0) {
        return weightDelta;
      }
      return b.triggerProgress - a.triggerProgress;
    });

  const selectedEvents = sortedByWeight.slice(0, Math.max(desiredDeckSize, 1));

  return selectedEvents.sort((a, b) => {
    if (a.triggerProgress === b.triggerProgress) {
      return (b.selectionWeight ?? 0) - (a.selectionWeight ?? 0);
    }
    return a.triggerProgress - b.triggerProgress;
  });
};

export { buildMissionEventDeck, missionEventTable };
