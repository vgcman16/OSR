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

const missionEventTable = [
  {
    id: 'security-sweep',
    label: 'Security Sweep',
    description:
      'A surprise patrol sweeps the block just as the crew breaches the perimeter.',
    triggerProgress: 0.25,
    minDifficulty: 1,
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
  poiContext:
    typeof event.poiContext === 'object' && event.poiContext !== null
      ? { ...event.poiContext }
      : null,
  triggered: false,
  resolved: false,
});

const poiEventBuilders = {
  vault: (poi) => ({
    id: `poi-${poi.id ?? 'vault'}-failsafe`,
    label: 'Failsafe Countdown',
    description: `Emergency shutters begin to seal ${poi.name}, threatening to trap the crew and loot inside.`,
    triggerProgress: 0.62,
    minDifficulty: 1,
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
  const baseDeck = missionEventTable
    .filter((event) => difficulty >= event.minDifficulty && difficulty <= event.maxDifficulty)
    .map((event) => cloneEvent(event));

  const poiEvent = buildPoiEvent(mission?.pointOfInterest);
  if (poiEvent) {
    baseDeck.push(cloneEvent(poiEvent));
  }

  return baseDeck.sort((a, b) => a.triggerProgress - b.triggerProgress);
};

export { buildMissionEventDeck, missionEventTable };
