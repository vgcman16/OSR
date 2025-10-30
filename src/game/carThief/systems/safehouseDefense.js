import { collectSafehouseFacilityIds } from './missionEvents.js';

const DEFAULT_DEFENSE_STATE = () => ({
  layoutsBySafehouse: {},
  scenariosByAlert: {},
  history: [],
});

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

const resolveZoneId = (facilityId, savedLayout = null, assignmentMap = null) => {
  if (!facilityId || typeof facilityId !== 'string') {
    return 'support';
  }

  const normalized = facilityId.trim();
  if (!normalized) {
    return 'support';
  }

  if (assignmentMap && assignmentMap.has(normalized)) {
    return assignmentMap.get(normalized);
  }

  if (savedLayout && Array.isArray(savedLayout.zones) && !assignmentMap) {
    for (const zone of savedLayout.zones) {
      if (!zone || !Array.isArray(zone.facilityIds)) {
        continue;
      }
      if (zone.facilityIds.some((entry) => (typeof entry === 'string' ? entry.trim() : '') === normalized)) {
        return zone.id ?? 'support';
      }
    }
  }

  if (
    savedLayout
    && Array.isArray(savedLayout.unassignedFacilityIds)
    && savedLayout.unassignedFacilityIds.some((entry) => (typeof entry === 'string' ? entry.trim() : '') === normalized)
  ) {
    return 'unassigned';
  }

  const id = normalized.toLowerCase();
  if (id.includes('ops') || id.includes('command') || id.includes('terminal') || id.includes('theater')) {
    return 'operations';
  }

  if (id.includes('dead-drop') || id.includes('courier') || id.includes('network') || id.includes('logistics')) {
    return 'logistics';
  }

  if (id.includes('rapid-response') || id.includes('security') || id.includes('armory') || id.includes('vault')) {
    return 'security';
  }

  return 'support';
};

const ZONE_CONFIG = {
  operations: { id: 'operations', label: 'Operations Deck' },
  logistics: { id: 'logistics', label: 'Logistics Wing' },
  security: { id: 'security', label: 'Security Core' },
  support: { id: 'support', label: 'Support Lanes' },
};

const cloneScenario = (scenario) => {
  if (!scenario || typeof scenario !== 'object') {
    return null;
  }

  return {
    alertId: scenario.alertId,
    safehouseId: scenario.safehouseId,
    status: scenario.status,
    heatTier: scenario.heatTier ?? null,
    cooldownDays: scenario.cooldownDays ?? null,
    startedAt: scenario.startedAt ?? null,
    updatedAt: scenario.updatedAt ?? null,
    resolvedAt: scenario.resolvedAt ?? null,
    lastChoiceId: scenario.lastChoiceId ?? null,
    lastSummary: scenario.lastSummary ?? null,
    layout: scenario.layout
      ? {
          safehouseId: scenario.layout.safehouseId ?? null,
          zones: Array.isArray(scenario.layout.zones)
            ? scenario.layout.zones.map((zone) => ({
                id: zone.id,
                label: zone.label,
                facilityIds: Array.isArray(zone.facilityIds) ? zone.facilityIds.slice() : [],
                defenseScore: zone.defenseScore,
                ordinal: zone.ordinal,
              }))
            : [],
          zoneOrder: Array.isArray(scenario.layout.zoneOrder) ? scenario.layout.zoneOrder.slice() : [],
          unassignedFacilityIds: Array.isArray(scenario.layout.unassignedFacilityIds)
            ? scenario.layout.unassignedFacilityIds.slice()
            : [],
          assignmentsByFacility:
            scenario.layout.assignmentsByFacility && typeof scenario.layout.assignmentsByFacility === 'object'
              ? { ...scenario.layout.assignmentsByFacility }
              : {},
          source: scenario.layout.source === 'custom' ? 'custom' : 'heuristic',
          updatedAt: Number.isFinite(scenario.layout.updatedAt) ? scenario.layout.updatedAt : null,
        }
      : null,
    escalationTracks: Array.isArray(scenario.escalationTracks)
      ? scenario.escalationTracks.map((track) => ({
          id: track.id,
          label: track.label,
          value: track.value,
          max: track.max,
          status: track.status ?? 'active',
        }))
      : [],
    recommendedActions: Array.isArray(scenario.recommendedActions)
      ? scenario.recommendedActions.map((action) => ({
          id: action.id,
          label: action.label,
          summary: action.summary ?? null,
        }))
      : [],
    history: Array.isArray(scenario.history)
      ? scenario.history.map((entry) => ({
          choiceId: entry.choiceId ?? null,
          summary: entry.summary ?? null,
          resolvedAt: entry.resolvedAt ?? null,
        }))
      : [],
  };
};

const buildLayout = (safehouse, savedLayout = null) => {
  const safehouseId = safehouse?.id ?? savedLayout?.safehouseId ?? null;
  const facilityIds = collectSafehouseFacilityIds(safehouse).map((facilityId) =>
    typeof facilityId === 'string' ? facilityId.trim() : '',
  );

  const assignments = new Map();
  if (savedLayout && savedLayout.assignmentsByFacility && typeof savedLayout.assignmentsByFacility === 'object') {
    Object.entries(savedLayout.assignmentsByFacility).forEach(([facilityId, zoneId]) => {
      const normalizedFacilityId = typeof facilityId === 'string' ? facilityId.trim() : '';
      if (!normalizedFacilityId || assignments.has(normalizedFacilityId)) {
        return;
      }
      const normalizedZoneId = typeof zoneId === 'string' ? zoneId.trim() : '';
      assignments.set(normalizedFacilityId, normalizedZoneId || 'support');
    });
  }
  if (savedLayout) {
    if (Array.isArray(savedLayout.zones)) {
      savedLayout.zones.forEach((zone) => {
        if (!zone || !Array.isArray(zone.facilityIds)) {
          return;
        }
        const zoneId = typeof zone.id === 'string' ? zone.id.trim() : null;
        if (!zoneId) {
          return;
        }
        zone.facilityIds.forEach((facilityId) => {
          const normalized = typeof facilityId === 'string' ? facilityId.trim() : '';
          if (normalized && !assignments.has(normalized)) {
            assignments.set(normalized, zoneId);
          }
        });
      });
    }
    if (Array.isArray(savedLayout.unassignedFacilityIds)) {
      savedLayout.unassignedFacilityIds.forEach((facilityId) => {
        const normalized = typeof facilityId === 'string' ? facilityId.trim() : '';
        if (normalized && !assignments.has(normalized)) {
          assignments.set(normalized, 'unassigned');
        }
      });
    }
  }

  const zoneMap = new Map();
  const registerZone = (zoneId, label = null) => {
    const normalizedZoneId = zoneId ?? 'support';
    if (!zoneMap.has(normalizedZoneId)) {
      const baseConfig = ZONE_CONFIG[normalizedZoneId] ?? { id: normalizedZoneId, label: label ?? normalizedZoneId };
      zoneMap.set(normalizedZoneId, {
        id: normalizedZoneId,
        label: label ?? baseConfig.label ?? normalizedZoneId,
        facilityIds: [],
        defenseScore: 0,
        ordinal: null,
      });
    }
    return zoneMap.get(normalizedZoneId);
  };

  Object.values(ZONE_CONFIG).forEach((config) => {
    registerZone(config.id, config.label);
  });

  const savedZones = Array.isArray(savedLayout?.zones) ? savedLayout.zones : [];
  savedZones.forEach((zone) => {
    const zoneId = typeof zone?.id === 'string' ? zone.id.trim() : null;
    if (!zoneId) {
      return;
    }
    const label = typeof zone.label === 'string' && zone.label.trim() ? zone.label.trim() : ZONE_CONFIG[zoneId]?.label;
    const container = registerZone(zoneId, label ?? zoneId);
    container.label = label ?? container.label;
    if (Number.isFinite(zone.ordinal)) {
      container.ordinal = clamp(Math.round(zone.ordinal), 0, 50);
    }
  });

  const unassignedFacilityIds = [];

  facilityIds
    .map((facilityId) => (typeof facilityId === 'string' ? facilityId.trim() : ''))
    .filter(Boolean)
    .forEach((facilityId) => {
      const zoneId = resolveZoneId(facilityId, savedLayout, assignments);
      if (zoneId === 'unassigned') {
        if (!unassignedFacilityIds.includes(facilityId)) {
          unassignedFacilityIds.push(facilityId);
        }
        return;
      }

      const zone = registerZone(zoneId);
      if (!zone.facilityIds.includes(facilityId)) {
        zone.facilityIds.push(facilityId);
      }
    });

  const preferredOrder = Array.isArray(savedLayout?.zoneOrder)
    ? savedLayout.zoneOrder
        .map((zoneId) => (typeof zoneId === 'string' ? zoneId.trim() : ''))
        .filter(Boolean)
    : [];

  const zones = Array.from(zoneMap.values());
  const zoneOrder = (() => {
    if (preferredOrder.length) {
      const seen = new Set();
      const ordered = [];
      preferredOrder.forEach((zoneId) => {
        if (zoneMap.has(zoneId) && !seen.has(zoneId)) {
          ordered.push(zoneId);
          seen.add(zoneId);
        }
      });
      zones
        .map((zone) => zone.id)
        .filter((zoneId) => !seen.has(zoneId))
        .forEach((zoneId) => {
          ordered.push(zoneId);
          seen.add(zoneId);
        });
      return ordered;
    }

    if (savedZones.length) {
      const seen = new Set();
      const ordered = [];
      savedZones.forEach((zone) => {
        const zoneId = typeof zone?.id === 'string' ? zone.id.trim() : null;
        if (zoneId && zoneMap.has(zoneId) && !seen.has(zoneId)) {
          ordered.push(zoneId);
          seen.add(zoneId);
        }
      });
      zones
        .map((zone) => zone.id)
        .filter((zoneId) => !seen.has(zoneId))
        .forEach((zoneId) => {
          ordered.push(zoneId);
          seen.add(zoneId);
        });
      return ordered;
    }

    return zones
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((zone) => zone.id);
  })();

  const normalizedZones = zoneOrder
    .map((zoneId) => zoneMap.get(zoneId))
    .filter(Boolean)
    .map((zone) => {
      const savedZone = savedZones.find((entry) => {
        const entryId = typeof entry?.id === 'string' ? entry.id.trim() : null;
        return entryId === zone.id;
      });

      const savedScore = Number.isFinite(savedZone?.defenseScore)
        ? clamp(Math.round(savedZone.defenseScore), 0, 20)
        : null;

      const result = {
        id: zone.id,
        label: zone.label,
        facilityIds: zone.facilityIds.slice(),
        defenseScore: savedScore ?? zone.facilityIds.length,
      };

      if (Number.isFinite(zone.ordinal)) {
        result.ordinal = clamp(Math.round(zone.ordinal), 0, 50);
      } else if (Number.isFinite(savedZone?.ordinal)) {
        result.ordinal = clamp(Math.round(savedZone.ordinal), 0, 50);
      }

      return result;
    });

  const layout = {
    safehouseId,
    zones: normalizedZones,
    zoneOrder,
    source: savedLayout?.source === 'custom' ? 'custom' : 'heuristic',
    updatedAt:
      savedLayout?.source === 'custom' && Number.isFinite(savedLayout?.updatedAt)
        ? savedLayout.updatedAt
        : Date.now(),
  };

  if (unassignedFacilityIds.length) {
    layout.unassignedFacilityIds = unassignedFacilityIds;
  }

  const assignmentsByFacility = {};
  normalizedZones.forEach((zone) => {
    zone.facilityIds.forEach((facilityId) => {
      if (facilityId && !assignmentsByFacility[facilityId]) {
        assignmentsByFacility[facilityId] = zone.id;
      }
    });
  });
  unassignedFacilityIds.forEach((facilityId) => {
    if (facilityId && !assignmentsByFacility[facilityId]) {
      assignmentsByFacility[facilityId] = 'unassigned';
    }
  });
  layout.assignmentsByFacility = assignmentsByFacility;

  return layout;
};

const heatTierEscalation = (heatTier) => {
  const normalized = typeof heatTier === 'string' ? heatTier.trim().toLowerCase() : 'calm';
  if (normalized === 'lockdown') {
    return 2;
  }
  if (normalized === 'alert') {
    return 1;
  }
  return 0;
};

const buildRecommendedActions = (scenario) => {
  if (!scenario?.layout) {
    return [];
  }

  const actions = [];
  const candidateZones = [...scenario.layout.zones].filter((zone) => zone?.id !== 'unassigned');
  const weakestZone = candidateZones.sort((a, b) => (a.defenseScore ?? 0) - (b.defenseScore ?? 0))[0];
  if (weakestZone) {
    actions.push({
      id: `fortify-${weakestZone.id}`,
      label: `Fortify ${weakestZone.label}`,
      summary: `${weakestZone.label} hosts ${weakestZone.facilityIds.length || 'no'} facilities — reinforce patrols and counter-surveillance.`,
    });
  }

  const hottestTrack = Array.isArray(scenario.escalationTracks)
    ? [...scenario.escalationTracks].sort((a, b) => b.value - a.value)[0]
    : null;
  if (hottestTrack && hottestTrack.value >= hottestTrack.max - 1) {
    actions.push({
      id: `stabilize-${hottestTrack.id}`,
      label: `Stabilize ${hottestTrack.label}`,
      summary: `${hottestTrack.label} is at ${hottestTrack.value}/${hottestTrack.max}. Deploy countermeasures now to avoid a breach.`,
    });
  }

  if (!actions.length && candidateZones.length) {
    actions.push({
      id: 'rotate-crews',
      label: 'Rotate safehouse crews',
      summary: 'No critical hotspots detected — rotate watchers and reset traps to stay ahead of incursions.',
    });
  }

  return actions.slice(0, 3);
};

const buildEscalationTracks = (existingTracks = [], { basePressure = 1, heatTier = 'calm' } = {}) => {
  const tierModifier = heatTierEscalation(heatTier);
  const tracks = existingTracks.length
    ? existingTracks.map((track) => ({ ...track }))
    : [
        { id: 'perimeter-pressure', label: 'Perimeter Pressure', value: 0, max: 6, status: 'active' },
        { id: 'systems-integrity', label: 'Systems Integrity', value: 0, max: 6, status: 'active' },
      ];

  return tracks.map((track, index) => {
    const increment = basePressure + (index === 0 ? tierModifier : Math.max(0, tierModifier - 1));
    const nextValue = clamp((track.value ?? 0) + increment, 0, track.max ?? 6);
    return {
      ...track,
      value: nextValue,
      status: nextValue >= (track.max ?? 6) - 1 ? 'escalating' : 'active',
    };
  });
};

const buildScenarioSummaryLines = (scenario) => {
  if (!scenario) {
    return [];
  }

  const lines = [];
  if (Array.isArray(scenario.escalationTracks) && scenario.escalationTracks.length) {
    scenario.escalationTracks.forEach((track) => {
      lines.push(`${track.label}: ${track.value}/${track.max} pressure (${track.status})`);
    });
  }

  if (Array.isArray(scenario.recommendedActions) && scenario.recommendedActions.length) {
    const highlights = scenario.recommendedActions.map((action) => action.label).join(', ');
    lines.push(`Recommended actions: ${highlights}`);
  }

  if (scenario.cooldownDays !== null && scenario.cooldownDays !== undefined) {
    lines.push(`Cooldown once resolved: ${scenario.cooldownDays} day${scenario.cooldownDays === 1 ? '' : 's'}.`);
  }

  return lines;
};

const createSafehouseDefenseManager = (state) => {
  if (!state || typeof state !== 'object') {
    return {
      activateScenario: () => null,
      getScenario: () => null,
      getScenarioSummaryLines: () => [],
      recordResolution: () => null,
    };
  }

  if (!state.safehouseDefense || typeof state.safehouseDefense !== 'object') {
    state.safehouseDefense = DEFAULT_DEFENSE_STATE();
  }

  const ensureState = () => {
    if (!state.safehouseDefense || typeof state.safehouseDefense !== 'object') {
      state.safehouseDefense = DEFAULT_DEFENSE_STATE();
    }

    const container = state.safehouseDefense;
    if (!container.layoutsBySafehouse || typeof container.layoutsBySafehouse !== 'object') {
      container.layoutsBySafehouse = {};
    }
    if (!container.scenariosByAlert || typeof container.scenariosByAlert !== 'object') {
      container.scenariosByAlert = {};
    }
    if (!Array.isArray(container.history)) {
      container.history = [];
    }

    return container;
  };

  const activateScenario = (alertEntry, { safehouse = null, heatTier = 'calm', cooldownDays = null } = {}) => {
    if (!alertEntry || typeof alertEntry !== 'object') {
      return null;
    }

    const defenseState = ensureState();
    const safehouseId = safehouse?.id ?? null;
    const savedLayout = safehouseId ? defenseState.layoutsBySafehouse?.[safehouseId] ?? null : null;
    const layout = buildLayout(safehouse, savedLayout);
    const layoutKey = layout.safehouseId ?? safehouseId ?? 'default';
    defenseState.layoutsBySafehouse[layoutKey] = layout;

    const alertId = alertEntry.id ?? alertEntry.alertId ?? null;
    if (!alertId) {
      return null;
    }

    const previous = defenseState.scenariosByAlert[alertId] ?? null;
    const startedAt = previous?.startedAt ?? Date.now();

    const escalationTracks = buildEscalationTracks(previous?.escalationTracks, {
      basePressure: 1,
      heatTier,
    });

    const scenario = {
      alertId,
      safehouseId: safehouse?.id ?? previous?.safehouseId ?? null,
      status: 'active',
      heatTier,
      cooldownDays: cooldownDays ?? previous?.cooldownDays ?? null,
      startedAt,
      updatedAt: Date.now(),
      resolvedAt: null,
      layout,
      escalationTracks,
      recommendedActions: buildRecommendedActions({ layout, escalationTracks }),
      history: previous?.history ? previous.history.slice(-5) : [],
      lastChoiceId: previous?.lastChoiceId ?? null,
      lastSummary: previous?.lastSummary ?? null,
    };

    defenseState.scenariosByAlert[alertId] = scenario;
    return cloneScenario(scenario);
  };

  const getScenario = (alertId) => {
    const defenseState = ensureState();
    return cloneScenario(defenseState.scenariosByAlert?.[alertId]);
  };

  const getScenarioSummaryLines = (alertId) => {
    const scenario = getScenario(alertId);
    return buildScenarioSummaryLines(scenario);
  };

  const recordResolution = (alertEntry, choice, { summary = null, resolvedAt = Date.now() } = {}) => {
    if (!alertEntry) {
      return null;
    }

    const defenseState = ensureState();
    const alertId = alertEntry.id ?? alertEntry.alertId ?? null;
    if (!alertId) {
      return null;
    }

    const scenario = defenseState.scenariosByAlert[alertId];
    if (!scenario) {
      return null;
    }

    scenario.status = 'cooldown';
    scenario.resolvedAt = resolvedAt;
    scenario.updatedAt = resolvedAt;
    scenario.lastChoiceId = choice?.id ?? null;
    scenario.lastSummary = summary ?? null;
    scenario.escalationTracks = Array.isArray(scenario.escalationTracks)
      ? scenario.escalationTracks.map((track) => ({
          ...track,
          value: clamp((track.value ?? 0) - 1, 0, track.max ?? 6),
          status: 'stabilizing',
        }))
      : [];
    scenario.recommendedActions = buildRecommendedActions(scenario);
    scenario.history = Array.isArray(scenario.history) ? scenario.history : [];
    const lastHistory = scenario.history[scenario.history.length - 1] ?? null;
    if (lastHistory && lastHistory.resolvedAt === resolvedAt) {
      lastHistory.choiceId = choice?.id ?? lastHistory.choiceId ?? null;
      lastHistory.summary = summary ?? lastHistory.summary ?? null;
    } else {
      scenario.history.push({
        choiceId: choice?.id ?? null,
        summary: summary ?? null,
        resolvedAt,
      });
      if (scenario.history.length > 6) {
        scenario.history = scenario.history.slice(-6);
      }
    }

    defenseState.history = Array.isArray(defenseState.history) ? defenseState.history : [];
    const lastGlobalEntry = defenseState.history[defenseState.history.length - 1] ?? null;
    if (lastGlobalEntry && lastGlobalEntry.alertId === alertId && lastGlobalEntry.resolvedAt === resolvedAt) {
      lastGlobalEntry.choiceId = choice?.id ?? lastGlobalEntry.choiceId ?? null;
      lastGlobalEntry.summary = summary ?? lastGlobalEntry.summary ?? null;
    } else {
      defenseState.history.push({
        alertId,
        choiceId: choice?.id ?? null,
        summary: summary ?? null,
        resolvedAt,
      });
      if (defenseState.history.length > 20) {
        defenseState.history = defenseState.history.slice(-20);
      }
    }

    defenseState.scenariosByAlert[alertId] = scenario;
    return cloneScenario(scenario);
  };

  return {
    activateScenario,
    getScenario,
    getScenarioSummaryLines,
    recordResolution,
  };
};

export { createSafehouseDefenseManager };

