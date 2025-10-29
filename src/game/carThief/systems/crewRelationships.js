const DEFAULT_EVENT_STATE = () => ({
  pending: [],
  lastBandByTeam: {},
  cooldownByKey: {},
  history: [],
  arcStateByTeam: {},
  arcHistory: [],
});

const formatRoster = (crewNames = []) => {
  if (!Array.isArray(crewNames) || crewNames.length === 0) {
    return 'The crew';
  }

  if (crewNames.length === 1) {
    return crewNames[0];
  }

  if (crewNames.length === 2) {
    return `${crewNames[0]} & ${crewNames[1]}`;
  }

  return `${crewNames[0]}, ${crewNames[1]} +${crewNames.length - 2}`;
};

const RELATIONSHIP_EVENT_CONFIG = {
  synergy: {
    type: 'synergy',
    cooldownMs: 1000 * 60 * 60 * 18,
    prompt({ crewNames, mission }) {
      const roster = crewNames.join(' & ');
      if (mission?.name) {
        return `${roster} rode their chemistry high on ${mission.name}. How do you channel the momentum?`;
      }
      return `${roster} are firing on all cylinders. How do you channel the momentum?`;
    },
    choices: [
      {
        id: 'celebrate',
        label: 'Celebrate the win',
        description: 'Spend time together to lock in goodwill. Loyalty +1 for each crew member.',
        effects: { loyaltyDelta: 1 },
      },
      {
        id: 'refocus',
        label: 'Bank the momentum',
        description: 'Redirect the energy into the next play. Affinity +4 between the squad.',
        effects: { affinityDelta: 4 },
      },
    ],
  },
  strain: {
    type: 'strain',
    cooldownMs: 1000 * 60 * 60 * 24,
    prompt({ crewNames, mission }) {
      const roster = crewNames.join(' & ');
      if (mission?.name) {
        return `${roster} clashed during ${mission.name}. How do you defuse the tension?`;
      }
      return `${roster} are grinding gears with each other. How do you defuse the tension?`;
    },
    choices: [
      {
        id: 'mediate',
        label: 'Run mediation',
        description: 'Step in personally to smooth things over. Affinity +6 between the squad, funds -$500.',
        effects: { affinityDelta: 6, fundsDelta: -500 },
      },
      {
        id: 'reassign',
        label: 'Separate assignments',
        description: 'Give them breathing room. Loyalty -1 but removes the current strain flag.',
        effects: { loyaltyDelta: -1, clearBand: true },
      },
    ],
  },
};

const RELATIONSHIP_ARC_CONFIG = [
  {
    id: 'bonding-hangout',
    band: 'synergy',
    label: 'After-hours bonding',
    cooldownMs: 1000 * 60 * 60 * 36,
    steps: [
      {
        id: 'plan-session',
        label: 'Plan the downtime session',
        buildPrompt: ({ roster, missionName }) => {
          const missionSuffix = missionName ? ` after ${missionName}` : '';
          return `${roster} scored a big win${missionSuffix}. How do you lock in the chemistry?`;
        },
        buildChoices: ({ roster }) => [
          {
            id: 'after-hours-jam',
            label: 'Host an after-hours jam',
            description: `${roster} celebrate together with music, stories, and a little contraband. Loyalty climbs.`,
            narrative: `${roster} traded stories late into the night, trading secrets and boosting loyalty.`,
            effects: { loyaltyDelta: 1, affinityDelta: 3 },
          },
          {
            id: 'sim-scrimmage',
            label: 'Run a co-op sim scrimmage',
            description: 'Turn the downtime into a light tactical sim. Keeps skills sharp while the banter flows.',
            narrative: `${roster} cooked up a co-op sim run, laughing through the glitches while sharpening instincts.`,
            effects: { affinityDelta: 2, traitAdjustments: { tactics: 1 } },
          },
        ],
      },
      {
        id: 'lock-in-rhythm',
        label: 'Lock in the new rhythm',
        buildPrompt: ({ roster }) => `${roster} ride the goodwill. What’s the follow-up move?`,
        buildChoices: ({ previousChoices = [] }) => {
          const firstChoice = previousChoices[0]?.choiceId;
          const options = [];
          options.push({
            id: 'share-network',
            label: 'Share contact networks',
            description: 'Swap key contacts and safe routes to turn bonding into better ops support.',
            narrative: 'They traded contact lists and burner channels, tightening the crew’s support web.',
            effects: { affinityDelta: 2, loyaltyDelta: 1 },
          });
          if (firstChoice === 'after-hours-jam') {
            options.push({
              id: 'mentor-pairs',
              label: 'Pair up for mentorship',
              description: 'Spin the vibes into cross-mentorship, pairing vets with up-and-comers.',
              narrative: 'Mentorship rotations formed on the spot, keeping the good energy rolling forward.',
              effects: { traitAdjustments: { charisma: 1 } },
            });
          } else {
            options.push({
              id: 'codify-sim',
              label: 'Codify the best sim plays',
              description: 'Archive the slick sim combos as playbooks for future contracts.',
              narrative: 'The crew locked their favourite sim moves into a shared playbook for future runs.',
              effects: { loyaltyDelta: 1, traitAdjustments: { tech: 1 } },
            });
          }
          return options;
        },
      },
    ],
  },
  {
    id: 'cross-training',
    band: 'synergy',
    label: 'Cross-training circuit',
    cooldownMs: 1000 * 60 * 60 * 48,
    steps: [
      {
        id: 'pick-focus',
        label: 'Set the cross-training focus',
        buildPrompt: ({ roster }) => `${roster} want to turn chemistry into mastery. What focus do you set?`,
        buildChoices: () => [
          {
            id: 'technical-clinic',
            label: 'Technical clinic',
            description: 'Dive into tech and stealth drills to tighten execution.',
            narrative: 'Holo rigs hummed as the crew ran meticulous tech and stealth drills.',
            effects: { affinityDelta: 2, traitAdjustments: { tech: 1, stealth: 1 } },
          },
          {
            id: 'wheelman-labs',
            label: 'Wheelman labs',
            description: 'Pair drivers and tacticians to perfect pursuit breakouts.',
            narrative: 'Drivers and tacticians swapped seats, mapping new pursuit breakouts together.',
            effects: { affinityDelta: 2, traitAdjustments: { driving: 1, tactics: 1 } },
          },
        ],
      },
      {
        id: 'publish-findings',
        label: 'Publish the new playbook',
        buildPrompt: ({ roster }) => `${roster} wrap the circuit. How do you deploy the gains?`,
        buildChoices: ({ previousChoices = [] }) => {
          const firstChoice = previousChoices[0]?.choiceId;
          if (firstChoice === 'technical-clinic') {
            return [
              {
                id: 'wire-the-safehouse',
                label: 'Wire upgrades into the safehouse',
                description: 'Bake the new stealth routines into safehouse security.',
                narrative: 'They wired fresh stealth protocols into the safehouse, boosting baseline defenses.',
                effects: { loyaltyDelta: 1, fundsDelta: -400 },
              },
              {
                id: 'share-with-runners',
                label: 'Share with allied runners',
                description: 'Trade the clinic notes for favours and intel from allied crews.',
                narrative: 'Clinic notes traded hands with allied runners, buying future intel markers.',
                effects: { affinityDelta: 2 },
              },
            ];
          }
          return [
            {
              id: 'build-chase-sim',
              label: 'Build a chase simulator',
              description: 'Invest in a dedicated pursuit sim to lock in improvements.',
              narrative: 'Funds flowed into a bespoke pursuit sim, keeping the team razor sharp.',
              effects: { loyaltyDelta: 1, fundsDelta: -600 },
            },
            {
              id: 'coach-the-recruits',
              label: 'Coach up the recruits',
              description: 'Extend the drills to upcoming recruits, spreading the gains.',
              narrative: 'Seasoned drivers coached the recruits, spreading calm confidence through the roster.',
              effects: { affinityDelta: 3 },
            },
          ];
        },
      },
    ],
  },
  {
    id: 'rivalry-summit',
    band: 'strain',
    label: 'Rivalry summit',
    cooldownMs: 1000 * 60 * 60 * 48,
    steps: [
      {
        id: 'call-the-summit',
        label: 'Call the summit',
        buildPrompt: ({ roster, missionName }) => {
          const suffix = missionName ? ` fallout from ${missionName}` : ' fresh friction';
          return `${roster} are sparking off each other after${suffix}. How do you open the summit?`;
        },
        buildChoices: ({ roster }) => [
          {
            id: 'air-the-grievances',
            label: 'Air grievances with a mediator',
            description: `Bring in a neutral fixer to let ${roster} vent in a controlled setting.`,
            narrative: 'A trusted fixer sat in as the crew aired grievances without going for the throat.',
            effects: { affinityDelta: 4, fundsDelta: -500 },
          },
          {
            id: 'taskforce-reset',
            label: 'Taskforce reset',
            description: 'Break the crew into a neutral planning cell to refocus on shared goals.',
            narrative: 'They built a neutral taskforce plan, swapping roles until the heat died down.',
            effects: { loyaltyDelta: -1, affinityDelta: 5 },
          },
        ],
      },
      {
        id: 'set-ground-rules',
        label: 'Set the new ground rules',
        buildPrompt: ({ roster }) => `${roster} are calmer, but it needs structure. What ground rules do you set?`,
        buildChoices: ({ previousChoices = [] }) => {
          const firstChoice = previousChoices[0]?.choiceId;
          const options = [
            {
              id: 'document-boundaries',
              label: 'Document new boundaries',
              description: 'Write down the new operating agreement and circulate it.',
              narrative: 'They codified fresh boundaries, pinning them to the safehouse warboard.',
              effects: { affinityDelta: 2 },
            },
          ];
          if (firstChoice === 'air-the-grievances') {
            options.push({
              id: 'shared-service',
              label: 'Run a shared service job',
              description: 'Assign them a neutral community favor to rebuild trust through action.',
              narrative: 'The rivals teamed up on a quiet community job, rebuilding trust through action.',
              effects: { affinityDelta: 3, loyaltyDelta: 1 },
            });
          } else {
            options.push({
              id: 'role-rotation',
              label: 'Rotate mission roles',
              description: 'Lock in rotating mission roles so no one hogs the spotlight.',
              narrative: 'They locked in a rotating roster so no one dominated the mission spotlight.',
              effects: { loyaltyDelta: -1, affinityDelta: 4 },
            });
          }
          return options;
        },
      },
    ],
  },
];

const RELATIONSHIP_ARC_BY_ID = new Map(RELATIONSHIP_ARC_CONFIG.map((arc) => [arc.id, arc]));
const RELATIONSHIP_ARCS_BY_BAND = RELATIONSHIP_ARC_CONFIG.reduce((accumulator, arc) => {
  if (!accumulator.has(arc.band)) {
    accumulator.set(arc.band, []);
  }
  accumulator.get(arc.band).push(arc);
  return accumulator;
}, new Map());

const getTeamKey = (crewIds = []) => {
  if (!Array.isArray(crewIds) || !crewIds.length) {
    return null;
  }
  const normalized = crewIds
    .map((id) => (id !== undefined && id !== null ? String(id).trim() : null))
    .filter((id) => id);
  if (normalized.length < 2) {
    return null;
  }
  normalized.sort();
  return normalized.join('|');
};

const cloneEventForOutput = (event) => {
  if (!event) {
    return null;
  }
  return {
    id: event.id,
    type: event.type,
    band: event.band,
    crewIds: event.crewIds.slice(),
    crewNames: event.crewNames.slice(),
    prompt: event.prompt,
    triggeredAt: event.triggeredAt,
    cooldownMs: event.cooldownMs,
    missionContext: event.missionContext ? { ...event.missionContext } : null,
    badges: Array.isArray(event.badges)
      ? event.badges.map((badge) => ({
          type: badge.type,
          icon: badge.icon,
          label: badge.label,
        }))
      : [],
    arc: event.arcMeta
      ? {
          arcId: event.arcMeta.arcId,
          arcLabel: event.arcMeta.arcLabel,
          stepId: event.arcMeta.stepId,
          stepIndex: event.arcMeta.stepIndex,
          stepCount: event.arcMeta.stepCount,
        }
      : null,
    choices: event.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      description: choice.description,
    })),
  };
};

const ensureEventState = (state) => {
  if (!state || typeof state !== 'object') {
    return DEFAULT_EVENT_STATE();
  }
  if (!state.relationshipEvents || typeof state.relationshipEvents !== 'object') {
    state.relationshipEvents = DEFAULT_EVENT_STATE();
    return state.relationshipEvents;
  }
  const container = state.relationshipEvents;
  if (!Array.isArray(container.pending)) {
    container.pending = [];
  }
  if (!container.lastBandByTeam || typeof container.lastBandByTeam !== 'object') {
    container.lastBandByTeam = {};
  }
  if (!container.cooldownByKey || typeof container.cooldownByKey !== 'object') {
    container.cooldownByKey = {};
  }
  if (!Array.isArray(container.history)) {
    container.history = [];
  }
  if (!container.arcStateByTeam || typeof container.arcStateByTeam !== 'object') {
    container.arcStateByTeam = {};
  }
  if (!Array.isArray(container.arcHistory)) {
    container.arcHistory = [];
  }
  return container;
};

const ensureTeamArcState = (container, teamKey) => {
  if (!teamKey) {
    return null;
  }

  if (!container.arcStateByTeam || typeof container.arcStateByTeam !== 'object') {
    container.arcStateByTeam = {};
  }

  if (!container.arcStateByTeam[teamKey] || typeof container.arcStateByTeam[teamKey] !== 'object') {
    container.arcStateByTeam[teamKey] = { active: {}, history: [] };
  }

  const teamState = container.arcStateByTeam[teamKey];
  if (!teamState.active || typeof teamState.active !== 'object') {
    teamState.active = {};
  }
  if (!Array.isArray(teamState.history)) {
    teamState.history = [];
  }

  return teamState;
};

const buildArcEvent = ({ arcConfig, arcState, missionContext }) => {
  if (!arcConfig || !arcState) {
    return null;
  }

  const stepIndex = Number(arcState.stepIndex) || 0;
  const stepConfig = arcConfig.steps?.[stepIndex];
  if (!stepConfig) {
    return null;
  }

  const roster = formatRoster(arcState.crewNames);
  const prompt = typeof stepConfig.buildPrompt === 'function'
    ? stepConfig.buildPrompt({
        roster,
        missionName: missionContext?.missionName ?? arcState.missionContext?.missionName ?? null,
      })
    : stepConfig.label;

  const previousChoices = Array.isArray(arcState.previousChoices) ? arcState.previousChoices.slice() : [];
  const choices = typeof stepConfig.buildChoices === 'function'
    ? stepConfig.buildChoices({
        roster,
        missionName: missionContext?.missionName ?? arcState.missionContext?.missionName ?? null,
        previousChoices,
      })
    : stepConfig.choices ?? [];

  if (!Array.isArray(choices) || !choices.length) {
    return null;
  }

  const normalizedChoices = choices
    .map((choice) => {
      if (!choice || typeof choice !== 'object') {
        return null;
      }

      const id = typeof choice.id === 'string' ? choice.id.trim() : null;
      const label = typeof choice.label === 'string' ? choice.label.trim() : null;
      const description = typeof choice.description === 'string' ? choice.description.trim() : null;
      if (!id || !label || !description) {
        return null;
      }

      const narrative = typeof choice.narrative === 'string' ? choice.narrative.trim() : null;
      const effects = choice.effects && typeof choice.effects === 'object' ? { ...choice.effects } : {};

      return { id, label, description, narrative, effects };
    })
    .filter(Boolean);

  if (!normalizedChoices.length) {
    return null;
  }

  const eventId = `arc-${arcConfig.id}-${stepConfig.id}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  const now = Date.now();
  return {
    id: eventId,
    type: 'arc',
    band: arcConfig.band,
    crewIds: arcState.crewIds.slice(),
    crewNames: arcState.crewNames.slice(),
    prompt,
    triggeredAt: now,
    cooldownMs: arcConfig.cooldownMs,
    missionContext: missionContext
      ? {
          missionId: missionContext.missionId ?? null,
          missionName: missionContext.missionName ?? null,
          outcome: missionContext.outcome ?? null,
        }
      : arcState.missionContext ?? null,
    choices: normalizedChoices,
    badges: [
      { type: 'relationship-arc', icon: arcConfig.band === 'synergy' ? '🤝' : '⚡', label: arcConfig.label },
      {
        type: 'arc-step',
        icon: '📈',
        label: `Step ${stepIndex + 1}/${arcConfig.steps.length}`,
      },
    ],
    arcMeta: {
      arcId: arcConfig.id,
      arcLabel: arcConfig.label,
      stepId: stepConfig.id,
      stepIndex,
      stepCount: arcConfig.steps.length,
    },
  };
};

const maybeTriggerArcForTeam = ({
  container,
  band,
  teamKey,
  crewIds,
  crewNames,
  missionContext = null,
  now = Date.now(),
}) => {
  if (!band || !teamKey) {
    return null;
  }

  const arcOptions = RELATIONSHIP_ARCS_BY_BAND.get(band) ?? [];
  if (!arcOptions.length) {
    return null;
  }

  const teamState = ensureTeamArcState(container, teamKey);

  for (let index = 0; index < arcOptions.length; index += 1) {
    const arcConfig = arcOptions[index];
    if (!arcConfig) {
      continue;
    }

    if (teamState.active[arcConfig.id]) {
      continue;
    }

    const cooldownKey = `arc:${arcConfig.id}:${teamKey}`;
    const lastTriggered = Number(container.cooldownByKey[cooldownKey]) || 0;
    if (arcConfig.cooldownMs && now - lastTriggered < arcConfig.cooldownMs) {
      continue;
    }

    const arcState = {
      arcId: arcConfig.id,
      crewIds: crewIds.slice(),
      crewNames: crewNames.slice(),
      missionContext: missionContext
        ? {
            missionId: missionContext.missionId ?? null,
            missionName: missionContext.missionName ?? null,
            outcome: missionContext.outcome ?? null,
          }
        : null,
      stepIndex: 0,
      previousChoices: [],
      startedAt: now,
      updatedAt: now,
      status: 'active',
      history: [],
    };

    const event = buildArcEvent({ arcConfig, arcState, missionContext });
    if (!event) {
      continue;
    }

    teamState.active[arcConfig.id] = arcState;
    container.cooldownByKey[cooldownKey] = now;
    container.pending.unshift(event);
    if (container.pending.length > 8) {
      container.pending = container.pending.slice(-8);
    }
    return event;
  }

  return null;
};

const applyChoiceEffects = ({ choice, crewMembers, state, band }) => {
  const adjustments = [];
  if (!choice || typeof choice !== 'object') {
    return adjustments;
  }
  const effects = choice.effects ?? {};

  if (Number.isFinite(effects.loyaltyDelta) && crewMembers.length) {
    const delta = Math.round(effects.loyaltyDelta);
    if (delta !== 0) {
      crewMembers.forEach((member) => {
        if (!member) {
          return;
        }
        if (typeof member.adjustLoyalty === 'function') {
          member.adjustLoyalty(delta);
        } else if (Number.isFinite(member.loyalty)) {
          member.loyalty += delta;
        }
      });
      adjustments.push(`Crew loyalty ${delta > 0 ? '+' : ''}${delta} each`);
    }
  }

  if (Number.isFinite(effects.affinityDelta) && crewMembers.length >= 2) {
    const delta = Math.round(effects.affinityDelta);
    if (delta !== 0) {
      for (let index = 0; index < crewMembers.length; index += 1) {
        const member = crewMembers[index];
        if (!member || typeof member.adjustAffinityForCrewmate !== 'function') {
          continue;
        }
        for (let peerIndex = index + 1; peerIndex < crewMembers.length; peerIndex += 1) {
          const peer = crewMembers[peerIndex];
          if (!peer || typeof peer.adjustAffinityForCrewmate !== 'function') {
            continue;
          }
          member.adjustAffinityForCrewmate(peer.id, delta);
          peer.adjustAffinityForCrewmate(member.id, delta);
        }
      }
      adjustments.push(`Affinity ${delta > 0 ? '+' : ''}${delta} between crew`);
    }
  }

  if (effects.traitAdjustments && crewMembers.length) {
    const traitEntries = Object.entries(effects.traitAdjustments).filter(([, value]) =>
      Number.isFinite(value) && value !== 0,
    );
    if (traitEntries.length) {
      const summaryParts = [];
      traitEntries.forEach(([traitKey, value]) => {
        crewMembers.forEach((member) => {
          if (member && typeof member.adjustTrait === 'function') {
            member.adjustTrait(traitKey, value);
          }
        });
        const delta = Math.round(value);
        summaryParts.push(`${traitKey.charAt(0).toUpperCase() + traitKey.slice(1)} ${delta > 0 ? '+' : ''}${delta}`);
      });
      if (summaryParts.length) {
        adjustments.push(`Trait gains: ${summaryParts.join(', ')}`);
      }
    }
  }

  if (Number.isFinite(effects.fundsDelta) && state && Number.isFinite(state.funds)) {
    const delta = Math.round(effects.fundsDelta);
    if (delta !== 0) {
      state.funds = Math.max(0, Math.round(state.funds + delta));
      adjustments.push(`Funds ${delta > 0 ? '+' : ''}$${Math.abs(delta).toLocaleString()}`);
    }
  }

  if (effects.clearBand && band) {
    adjustments.push(`Relationship band reset from ${band}`);
  }

  return adjustments;
};

const createCrewRelationshipService = (state) => {
  const container = ensureEventState(state);

  const recordChemistryMilestones = ({
    crewIds = [],
    crewMembers = [],
    chemistryProfile = null,
    missionContext = null,
  } = {}) => {
    const teamKey = getTeamKey(crewIds);
    if (!teamKey || !chemistryProfile) {
      return null;
    }

    const band = chemistryProfile?.band ?? 'neutral';
    const milestoneFlags = chemistryProfile?.milestones ?? {};
    const previousBand = container.lastBandByTeam[teamKey] ?? 'neutral';

    container.lastBandByTeam[teamKey] = band;

    let triggeredBand = null;
    if (band === 'synergy' && previousBand !== 'synergy' && milestoneFlags?.enteredSynergyBand) {
      triggeredBand = 'synergy';
    } else if (band === 'strain' && previousBand !== 'strain' && milestoneFlags?.enteredStrainBand) {
      triggeredBand = 'strain';
    }

    if (!triggeredBand) {
      return null;
    }

    const config = RELATIONSHIP_EVENT_CONFIG[triggeredBand];
    if (!config) {
      return null;
    }

    const cooldownKey = `${teamKey}:${triggeredBand}`;
    const now = Date.now();
    const lastTriggered = Number(container.cooldownByKey[cooldownKey]) || 0;
    if (config.cooldownMs && now - lastTriggered < config.cooldownMs) {
      return null;
    }

    const crewLookup = new Map();
    crewMembers.forEach((member) => {
      if (!member) {
        return;
      }
      const id = member.id !== undefined && member.id !== null ? String(member.id).trim() : null;
      if (id) {
        crewLookup.set(id, member);
      }
    });

    const crewNames = crewIds.map((id) => {
      const member = crewLookup.get(String(id)) ?? null;
      return member?.name ?? 'Crew member';
    });

    const prompt = config.prompt({ crewNames, mission: missionContext });
    const eventId = `relationship-${triggeredBand}-${now.toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;

    const event = {
      id: eventId,
      type: config.type,
      band: triggeredBand,
      crewIds: crewIds.slice(),
      crewNames,
      prompt,
      triggeredAt: now,
      cooldownMs: config.cooldownMs,
      missionContext: missionContext
        ? {
            missionId: missionContext.missionId ?? null,
            missionName: missionContext.missionName ?? null,
            outcome: missionContext.outcome ?? null,
          }
        : null,
      choices: config.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        description: choice.description,
        effects: choice.effects ? { ...choice.effects } : {},
      })),
    };

    container.cooldownByKey[cooldownKey] = now;
    container.pending.push(event);
    if (container.pending.length > 8) {
      container.pending = container.pending.slice(-8);
    }

    maybeTriggerArcForTeam({
      container,
      band: triggeredBand,
      teamKey,
      crewIds,
      crewNames,
      missionContext,
      now,
    });

    return cloneEventForOutput(event);
  };

  const getPendingEvents = () => {
    return container.pending.map((event) => cloneEventForOutput(event));
  };

  const resolveEventChoice = (eventId, choiceId) => {
    if (!eventId || !choiceId) {
      return null;
    }

    const eventIndex = container.pending.findIndex((entry) => entry.id === eventId);
    if (eventIndex === -1) {
      return null;
    }

    const event = container.pending[eventIndex];
    const choice = event.choices.find((entry) => entry.id === choiceId);
    if (!choice) {
      return null;
    }

    const crewMembers = event.crewIds
      .map((id) => {
        const normalized = id !== undefined && id !== null ? String(id).trim() : null;
        if (!normalized) {
          return null;
        }
        const roster = Array.isArray(state?.crew) ? state.crew : [];
        return roster.find((member) => member?.id === normalized) ?? null;
      })
      .filter(Boolean);

    const adjustments = applyChoiceEffects({
      choice,
      crewMembers,
      state,
      band: event.band,
    });

    if (choice.effects?.clearBand) {
      const teamKey = getTeamKey(event.crewIds);
      if (teamKey) {
        container.lastBandByTeam[teamKey] = 'neutral';
      }
    }

    container.pending.splice(eventIndex, 1);

    const resolution = {
      eventId: event.id,
      eventType: event.type,
      choiceId: choice.id,
      choiceLabel: choice.label,
      summary: `${event.crewNames.join(' & ')} — ${choice.label}`,
      details: adjustments,
      resolvedAt: Date.now(),
    };

    container.history.push(resolution);
    if (container.history.length > 12) {
      container.history = container.history.slice(-12);
    }

    if (event.arcMeta) {
      const teamKey = getTeamKey(event.crewIds);
      const arcConfig = RELATIONSHIP_ARC_BY_ID.get(event.arcMeta.arcId);
      const teamState = ensureTeamArcState(container, teamKey);
      const arcState = teamState?.active?.[event.arcMeta.arcId] ?? null;
      if (arcConfig && arcState) {
        arcState.previousChoices = Array.isArray(arcState.previousChoices)
          ? arcState.previousChoices
          : [];
        arcState.previousChoices.push({ stepId: event.arcMeta.stepId, choiceId: choice.id });
        arcState.history = Array.isArray(arcState.history) ? arcState.history : [];
        arcState.history.push({
          stepId: event.arcMeta.stepId,
          choiceId: choice.id,
          choiceLabel: choice.label,
          resolvedAt: resolution.resolvedAt,
          summary: resolution.summary,
          details: adjustments.slice(),
        });
        if (arcState.history.length > 6) {
          arcState.history = arcState.history.slice(-6);
        }

        arcState.stepIndex = (arcState.stepIndex ?? 0) + 1;
        arcState.updatedAt = resolution.resolvedAt;

        const cooldownKey = `arc:${arcConfig.id}:${teamKey}`;

        if (arcState.stepIndex >= arcConfig.steps.length) {
          arcState.status = 'completed';
          arcState.completedAt = resolution.resolvedAt;
          delete teamState.active[arcConfig.id];
          teamState.history.push({
            arcId: arcConfig.id,
            summary: resolution.summary,
            resolvedAt: resolution.resolvedAt,
          });
          if (teamState.history.length > 8) {
            teamState.history = teamState.history.slice(-8);
          }
          container.arcHistory.push({
            arcId: arcConfig.id,
            arcLabel: arcConfig.label,
            crewNames: event.crewNames.slice(),
            summary: resolution.summary,
            resolvedAt: resolution.resolvedAt,
          });
          if (container.arcHistory.length > 16) {
            container.arcHistory = container.arcHistory.slice(-16);
          }
          container.cooldownByKey[cooldownKey] = resolution.resolvedAt;
        } else {
          const nextEvent = buildArcEvent({
            arcConfig,
            arcState,
            missionContext: event.missionContext,
          });
          if (nextEvent) {
            teamState.active[arcConfig.id] = arcState;
            container.pending.unshift(nextEvent);
            if (container.pending.length > 8) {
              container.pending = container.pending.slice(-8);
            }
          }
        }
      }

      resolution.arc = {
        arcId: event.arcMeta.arcId,
        arcLabel: event.arcMeta.arcLabel,
        stepId: event.arcMeta.stepId,
        stepIndex: event.arcMeta.stepIndex,
        stepCount: event.arcMeta.stepCount,
      };
    }

    return {
      ...resolution,
      prompt: event.prompt,
    };
  };

  return {
    recordChemistryMilestones,
    getPendingEvents,
    resolveEventChoice,
  };
};

export { createCrewRelationshipService };
