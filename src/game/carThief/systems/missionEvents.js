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
  triggered: false,
  resolved: false,
});

const buildMissionEventDeck = (mission) => {
  const difficulty = toFiniteNumber(mission?.difficulty, 1);

  return missionEventTable
    .filter((event) => difficulty >= event.minDifficulty && difficulty <= event.maxDifficulty)
    .map((event) => cloneEvent(event))
    .sort((a, b) => a.triggerProgress - b.triggerProgress);
};

export { buildMissionEventDeck, missionEventTable };
