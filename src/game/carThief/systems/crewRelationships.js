const DEFAULT_EVENT_STATE = () => ({
  pending: [],
  lastBandByTeam: {},
  cooldownByKey: {},
  history: [],
});

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
  return container;
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
