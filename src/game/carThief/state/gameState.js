import { Player } from '../entities/player.js';
import { CrewMember, createCrewTemplate } from '../entities/crewMember.js';
import { Vehicle } from '../entities/vehicle.js';
import { CityMap } from '../world/cityMap.js';
import { SafehouseCollection, createDefaultSafehouseCollection } from '../world/safehouse.js';
import {
  createInitialCrewGearVendorState,
  sanitizeCrewGearVendorState,
} from '../systems/crewGearVendors.js';

const MAX_ECONOMY_HISTORY_ENTRIES = 30;

const clampNumber = (value, min, max) => {
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

const sanitizeSafehouseDefenseLayout = (layout) => {
  if (!layout || typeof layout !== 'object') {
    return null;
  }

  const safehouseId = typeof layout.safehouseId === 'string' ? layout.safehouseId.trim() : null;

  const zones = Array.isArray(layout.zones)
    ? layout.zones
        .map((zone) => {
          if (!zone || typeof zone !== 'object') {
            return null;
          }

          const id = typeof zone.id === 'string' ? zone.id.trim() : null;
          const label = typeof zone.label === 'string' ? zone.label.trim() : null;
          if (!id || !label) {
            return null;
          }

          const facilityIds = Array.isArray(zone.facilityIds)
            ? zone.facilityIds
                .map((facilityId) => (typeof facilityId === 'string' ? facilityId.trim() : ''))
                .filter(Boolean)
            : [];

          const defenseScore = Number.isFinite(zone.defenseScore)
            ? clampNumber(Math.round(zone.defenseScore), 0, 20)
            : 0;

          return {
            id,
            label,
            facilityIds,
            defenseScore,
          };
        })
        .filter(Boolean)
    : [];

  return {
    safehouseId,
    zones,
  };
};

const sanitizeSafehouseDefenseScenario = (scenario) => {
  if (!scenario || typeof scenario !== 'object') {
    return null;
  }

  const alertId = typeof scenario.alertId === 'string' ? scenario.alertId.trim() : null;
  if (!alertId) {
    return null;
  }

  const safehouseId = typeof scenario.safehouseId === 'string' ? scenario.safehouseId.trim() : null;
  const status = typeof scenario.status === 'string' ? scenario.status.trim() : 'active';
  const heatTier = typeof scenario.heatTier === 'string' ? scenario.heatTier.trim() : null;
  const cooldownDays = Number.isFinite(scenario.cooldownDays)
    ? clampNumber(Math.round(scenario.cooldownDays), 0, 60)
    : null;

  const escalationTracks = Array.isArray(scenario.escalationTracks)
    ? scenario.escalationTracks
        .map((track) => {
          if (!track || typeof track !== 'object') {
            return null;
          }

          const id = typeof track.id === 'string' ? track.id.trim() : null;
          const label = typeof track.label === 'string' ? track.label.trim() : null;
          if (!id || !label) {
            return null;
          }

          const value = Number.isFinite(track.value) ? clampNumber(track.value, 0, 20) : 0;
          const max = Number.isFinite(track.max) ? clampNumber(track.max, 1, 20) : 6;
          const trackStatus = typeof track.status === 'string' ? track.status.trim() : 'active';

          return {
            id,
            label,
            value,
            max,
            status: trackStatus,
          };
        })
        .filter(Boolean)
    : [];

  const recommendedActions = Array.isArray(scenario.recommendedActions)
    ? scenario.recommendedActions
        .map((action) => {
          if (!action || typeof action !== 'object') {
            return null;
          }

          const id = typeof action.id === 'string' ? action.id.trim() : null;
          const label = typeof action.label === 'string' ? action.label.trim() : null;
          const summary = typeof action.summary === 'string' ? action.summary.trim() : null;
          if (!id || !label) {
            return null;
          }

          return { id, label, summary };
        })
        .filter(Boolean)
        .slice(0, 5)
    : [];

  const history = Array.isArray(scenario.history)
    ? scenario.history
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const choiceId = typeof entry.choiceId === 'string' ? entry.choiceId.trim() : null;
          const summary = typeof entry.summary === 'string' ? entry.summary.trim() : null;
          const resolvedAt = Number.isFinite(entry.resolvedAt) ? entry.resolvedAt : null;

          return {
            choiceId,
            summary,
            resolvedAt,
          };
        })
        .filter(Boolean)
        .slice(-6)
    : [];

  const layout = sanitizeSafehouseDefenseLayout(scenario.layout);

  return {
    alertId,
    safehouseId,
    status,
    layout,
    heatTier,
    cooldownDays,
    escalationTracks,
    recommendedActions,
    history,
    startedAt: Number.isFinite(scenario.startedAt) ? scenario.startedAt : null,
    updatedAt: Number.isFinite(scenario.updatedAt) ? scenario.updatedAt : null,
    resolvedAt: Number.isFinite(scenario.resolvedAt) ? scenario.resolvedAt : null,
    lastChoiceId: typeof scenario.lastChoiceId === 'string' ? scenario.lastChoiceId.trim() : null,
    lastSummary: typeof scenario.lastSummary === 'string' ? scenario.lastSummary.trim() : null,
  };
};

const sanitizeSafehouseDefenseState = (value) => {
  if (!value || typeof value !== 'object') {
    return {
      layoutsBySafehouse: {},
      scenariosByAlert: {},
      history: [],
    };
  }

  const layoutsSource = value.layoutsBySafehouse && typeof value.layoutsBySafehouse === 'object'
    ? value.layoutsBySafehouse
    : {};
  const layoutsBySafehouse = Object.entries(layoutsSource).reduce((accumulator, [key, layout]) => {
    const sanitized = sanitizeSafehouseDefenseLayout(layout);
    if (sanitized) {
      const safehouseId = typeof key === 'string' ? key : sanitized.safehouseId;
      if (safehouseId) {
        accumulator[safehouseId] = sanitized;
      }
    }
    return accumulator;
  }, {});

  const scenariosSource = value.scenariosByAlert && typeof value.scenariosByAlert === 'object'
    ? value.scenariosByAlert
    : {};
  const scenariosByAlert = Object.entries(scenariosSource).reduce(
    (accumulator, [alertId, scenario]) => {
      const sanitized = sanitizeSafehouseDefenseScenario({ ...scenario, alertId });
      if (sanitized) {
        accumulator[sanitized.alertId] = sanitized;
      }
      return accumulator;
    },
    {},
  );

  const history = Array.isArray(value.history)
    ? value.history
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const alertId = typeof entry.alertId === 'string' ? entry.alertId.trim() : null;
          if (!alertId) {
            return null;
          }

          const summary = typeof entry.summary === 'string' ? entry.summary.trim() : null;
          const choiceId = typeof entry.choiceId === 'string' ? entry.choiceId.trim() : null;
          const resolvedAt = Number.isFinite(entry.resolvedAt) ? entry.resolvedAt : null;

          return {
            alertId,
            summary,
            choiceId,
            resolvedAt,
          };
        })
        .filter(Boolean)
        .slice(-20)
    : [];

  return {
    layoutsBySafehouse,
    scenariosByAlert,
    history,
  };
};

const cloneReconAssignment = (assignment) => {
  if (!assignment || typeof assignment !== 'object') {
    return null;
  }

  const cloned = { ...assignment };
  cloned.crewIds = Array.isArray(assignment.crewIds)
    ? assignment.crewIds.filter((id) => id !== null && id !== undefined)
    : [];
  cloned.events = Array.isArray(assignment.events)
    ? assignment.events
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({ ...entry }))
    : [];

  if (assignment.result && typeof assignment.result === 'object') {
    const resultClone = { ...assignment.result };
    if (resultClone.before && typeof resultClone.before === 'object') {
      resultClone.before = { ...resultClone.before };
    }
    if (resultClone.after && typeof resultClone.after === 'object') {
      resultClone.after = { ...resultClone.after };
    }
    if (resultClone.delta && typeof resultClone.delta === 'object') {
      resultClone.delta = { ...resultClone.delta };
    }
    cloned.result = resultClone;
  } else {
    cloned.result = assignment.result ?? null;
  }

  if (Array.isArray(assignment.history)) {
    cloned.history = assignment.history
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({ ...entry }));
  }

  return cloned;
};

const normalizeReconAssignments = (assignments) => {
  if (!Array.isArray(assignments)) {
    return [];
  }

  return assignments
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => cloneReconAssignment(entry))
    .filter(Boolean);
};

const sanitizeGarageActivityEntry = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const summary = typeof entry.summary === 'string' ? entry.summary.trim() : '';
  if (!summary) {
    return null;
  }

  const timestamp = Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now();
  const id = entry.id
    ? String(entry.id)
    : `garage-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
  const type = typeof entry.type === 'string' && entry.type.trim()
    ? entry.type.trim()
    : 'garage';

  const details = Array.isArray(entry.details)
    ? entry.details
        .map((detail) => (typeof detail === 'string' ? detail.trim() : ''))
        .filter(Boolean)
    : [];

  const partsInventory = Number.isFinite(entry.partsInventory)
    ? Math.max(0, Math.round(entry.partsInventory))
    : undefined;

  const metadata = entry.metadata && typeof entry.metadata === 'object'
    ? { ...entry.metadata }
    : undefined;

  const sanitized = {
    id,
    type,
    summary,
    details,
    timestamp,
  };

  if (partsInventory !== undefined) {
    sanitized.partsInventory = partsInventory;
  }

  if (metadata) {
    sanitized.metadata = metadata;
  }

  return sanitized;
};

const sanitizeGarageActivityLog = (log) => {
  if (!Array.isArray(log)) {
    return [];
  }

  const entries = log
    .map((entry) => sanitizeGarageActivityEntry(entry))
    .filter(Boolean);

  if (entries.length > 40) {
    return entries.slice(0, 40);
  }

  return entries;
};

const sanitizeCrackdownHistoryEntry = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const timestamp = Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now();
  const previousTier = typeof entry.previousTier === 'string' && entry.previousTier.trim()
    ? entry.previousTier.trim().toLowerCase()
    : 'unknown';
  const newTier = typeof entry.newTier === 'string' && entry.newTier.trim()
    ? entry.newTier.trim().toLowerCase()
    : 'unknown';
  const reason = typeof entry.reason === 'string' && entry.reason.trim()
    ? entry.reason.trim()
    : 'system-sync';

  return {
    timestamp,
    previousTier,
    newTier,
    reason,
  };
};

const sanitizeCrackdownHistoryLog = (history) => {
  if (!Array.isArray(history)) {
    return [];
  }

  const entries = history
    .map((entry) => sanitizeCrackdownHistoryEntry(entry))
    .filter(Boolean);

  if (entries.length > 30) {
    return entries.slice(0, 30);
  }

  return entries;
};

const sanitizeEconomyHistoryEntry = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const normalizeAmount = (value) => (Number.isFinite(value) ? Math.round(value) : 0);
  const base = normalizeAmount(entry.base);
  const payroll = normalizeAmount(entry.payroll);
  const safehouseOverhead = normalizeAmount(entry.safehouseOverhead);
  const safehouseIncome = normalizeAmount(entry.safehouseIncome);
  const day = Number.isFinite(entry.day) ? Math.max(1, Math.round(entry.day)) : null;
  const timestamp = Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now();
  const total = Number.isFinite(entry.total)
    ? Math.round(entry.total)
    : base + payroll + safehouseOverhead - safehouseIncome;

  return {
    day,
    base,
    payroll,
    safehouseOverhead,
    safehouseIncome,
    total,
    timestamp,
  };
};

const sanitizeEconomyHistoryLog = (history) => {
  if (!Array.isArray(history)) {
    return [];
  }

  const entries = history
    .map((entry) => sanitizeEconomyHistoryEntry(entry))
    .filter(Boolean);

  if (entries.length > MAX_ECONOMY_HISTORY_ENTRIES) {
    return entries.slice(-MAX_ECONOMY_HISTORY_ENTRIES);
  }

  return entries;
};

class GameState {
  constructor({
    day = 1,
    funds = 5000,
    heat = 0,
    heatTier = 'calm',
    player = new Player({ name: 'The Wheelman' }),
    crew = [],
    garage = [],
    city = new CityMap(),
    safehouses = createDefaultSafehouseCollection(),
    activeMission = null,
    missionLog = [],
    lastVehicleReport = null,
    recruitPool = [],
    lastExpenseReport = null,
    economyHistory = [],
    pendingDebts = [],
    followUpSequence = 0,
    safehouseIncursions = [],
    reconAssignments = [],
    partsInventory = 0,
    garageActivityLog = [],
    crackdownHistory = [],
    crewGearVendors = null,
    safehouseDefense = null,
  } = {}) {
    this.day = day;
    this.funds = funds;
    this.heat = heat;
    this.heatTier = heatTier;
    this.player = player instanceof Player ? player : new Player(player);
    this.crew = crew;
    this.garage = garage;
    this.city = city;
    this.safehouses = safehouses instanceof SafehouseCollection
      ? safehouses
      : new SafehouseCollection(safehouses ?? []);

    if (!this.player.safehouseId) {
      const defaultSafehouse = this.safehouses.getDefault();
      if (defaultSafehouse) {
        this.player.assignSafehouse(defaultSafehouse.id);
      }
    }

    this.activeMission = activeMission;
    this.missionLog = Array.isArray(missionLog) ? missionLog : [];
    this.lastVehicleReport = lastVehicleReport;
    this.recruitPool = Array.isArray(recruitPool) ? recruitPool : [];
    this.lastExpenseReport = lastExpenseReport;
    this.economyHistory = sanitizeEconomyHistoryLog(economyHistory);
    this.pendingDebts = Array.isArray(pendingDebts) ? pendingDebts : [];
    this.followUpSequence = Number.isFinite(followUpSequence) ? followUpSequence : 0;
    this.safehouseIncursions = Array.isArray(safehouseIncursions)
      ? safehouseIncursions
          .filter((entry) => entry && typeof entry === 'object' && entry.id)
          .map((entry) => ({ ...entry }))
      : [];
    this.reconAssignments = normalizeReconAssignments(reconAssignments);
    this.partsInventory = Number.isFinite(partsInventory)
      ? Math.max(0, Math.round(partsInventory))
      : 0;
    this.garageActivityLog = sanitizeGarageActivityLog(garageActivityLog);
    this.crackdownHistory = sanitizeCrackdownHistoryLog(crackdownHistory);
    this.crewGearVendors = sanitizeCrewGearVendorState(crewGearVendors, { day: this.day });
    this.safehouseDefense = sanitizeSafehouseDefenseState(safehouseDefense);
  }

  toJSON() {
    const serializeArray = (collection) => {
      if (!Array.isArray(collection)) {
        return [];
      }

      return collection.map((entry) => {
        if (entry && typeof entry.toJSON === 'function') {
          return entry.toJSON();
        }

        if (entry && typeof entry === 'object') {
          return { ...entry };
        }

        return entry;
      });
    };

    const serializeObject = (value) => {
      if (!value || typeof value !== 'object') {
        return value ?? null;
      }

      if (typeof value.toJSON === 'function') {
        return value.toJSON();
      }

      return { ...value };
    };

    return {
      day: this.day,
      funds: this.funds,
      heat: this.heat,
      heatTier: this.heatTier,
      player: serializeObject(this.player),
      crew: serializeArray(this.crew),
      garage: serializeArray(this.garage),
      city: this.city instanceof CityMap
        ? {
            name: this.city.name,
            districts: Array.isArray(this.city.districts)
              ? this.city.districts.map((district) =>
                  typeof district?.toJSON === 'function' ? district.toJSON() : { ...district },
                )
              : [],
          }
        : serializeObject(this.city),
      safehouses: this.safehouses?.toJSON ? this.safehouses.toJSON() : serializeObject(this.safehouses),
      activeMission: serializeObject(this.activeMission),
      missionLog: serializeArray(this.missionLog),
      lastVehicleReport: serializeObject(this.lastVehicleReport),
      recruitPool: serializeArray(this.recruitPool),
      lastExpenseReport: serializeObject(this.lastExpenseReport),
      economyHistory: serializeArray(this.economyHistory),
      pendingDebts: serializeArray(this.pendingDebts),
      followUpSequence: this.followUpSequence,
      safehouseIncursions: serializeArray(this.safehouseIncursions),
      reconAssignments: serializeArray(this.reconAssignments),
      partsInventory: this.partsInventory,
      garageActivityLog: serializeArray(this.garageActivityLog),
      crackdownHistory: serializeArray(this.crackdownHistory),
      crewGearVendors: this.crewGearVendors
        ? sanitizeCrewGearVendorState(this.crewGearVendors, { day: this.day })
        : null,
      safehouseDefense: sanitizeSafehouseDefenseState(this.safehouseDefense),
    };
  }

  static fromJSON(data = {}) {
    if (data instanceof GameState) {
      return data;
    }

    if (!data || typeof data !== 'object') {
      return new GameState();
    }

    const safehouses = SafehouseCollection.fromJSON
      ? SafehouseCollection.fromJSON(data.safehouses)
      : new SafehouseCollection(data.safehouses ?? []);

    const player = Player.fromJSON ? Player.fromJSON(data.player) : new Player(data.player);

    const crew = Array.isArray(data.crew)
      ? data.crew
          .map((entry) => CrewMember.fromJSON?.(entry) ?? (entry ? new CrewMember(entry) : null))
          .filter(Boolean)
      : [];

    const garage = Array.isArray(data.garage)
      ? data.garage
          .map((entry) => Vehicle.fromJSON?.(entry) ?? (entry ? new Vehicle(entry) : null))
          .filter(Boolean)
      : [];

    const city = data.city instanceof CityMap ? data.city : new CityMap(data.city ?? {});

    return new GameState({
      ...data,
      player,
      crew,
      garage,
      city,
      safehouses,
      safehouseIncursions: Array.isArray(data.safehouseIncursions)
        ? data.safehouseIncursions
            .filter((entry) => entry && typeof entry === 'object' && entry.id)
            .map((entry) => ({ ...entry }))
        : [],
      reconAssignments: normalizeReconAssignments(data.reconAssignments),
      partsInventory: Number.isFinite(data.partsInventory)
        ? Math.max(0, Math.round(data.partsInventory))
        : 0,
      garageActivityLog: sanitizeGarageActivityLog(data.garageActivityLog),
      crackdownHistory: sanitizeCrackdownHistoryLog(data.crackdownHistory),
      economyHistory: sanitizeEconomyHistoryLog(data.economyHistory),
      crewGearVendors: sanitizeCrewGearVendorState(data.crewGearVendors, { day: data.day }),
      safehouseDefense: sanitizeSafehouseDefenseState(data.safehouseDefense),
    });
  }

  getReconAssignments() {
    if (!Array.isArray(this.reconAssignments)) {
      this.reconAssignments = [];
    }
    return this.reconAssignments;
  }

  addReconAssignment(assignment = {}) {
    const cloned = cloneReconAssignment(assignment);
    if (!cloned) {
      return null;
    }

    if (!Array.isArray(this.reconAssignments)) {
      this.reconAssignments = [];
    }

    this.reconAssignments.unshift(cloned);
    return cloned;
  }

  updateReconAssignment(assignmentId, updates = {}) {
    if (!assignmentId || !updates || typeof updates !== 'object') {
      return null;
    }

    if (!Array.isArray(this.reconAssignments)) {
      this.reconAssignments = [];
      return null;
    }

    const index = this.reconAssignments.findIndex((entry) => entry?.id === assignmentId);
    if (index === -1) {
      return null;
    }

    const target = this.reconAssignments[index];

    if (Array.isArray(updates.crewIds)) {
      target.crewIds = updates.crewIds.filter((id) => id !== null && id !== undefined);
    }

    if (Array.isArray(updates.events)) {
      target.events = updates.events
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({ ...entry }));
    } else if (updates.events === null) {
      target.events = [];
    }

    if ('result' in updates) {
      if (updates.result && typeof updates.result === 'object') {
        const resultClone = { ...updates.result };
        if (resultClone.before && typeof resultClone.before === 'object') {
          resultClone.before = { ...resultClone.before };
        }
        if (resultClone.after && typeof resultClone.after === 'object') {
          resultClone.after = { ...resultClone.after };
        }
        if (resultClone.delta && typeof resultClone.delta === 'object') {
          resultClone.delta = { ...resultClone.delta };
        }
        target.result = resultClone;
      } else {
        target.result = updates.result ?? null;
      }
    }

    Object.keys(updates).forEach((key) => {
      if (['crewIds', 'events', 'result'].includes(key)) {
        return;
      }
      target[key] = updates[key];
    });

    return target;
  }

  removeReconAssignment(assignmentId) {
    if (!assignmentId || !Array.isArray(this.reconAssignments)) {
      return null;
    }

    const index = this.reconAssignments.findIndex((entry) => entry?.id === assignmentId);
    if (index === -1) {
      return null;
    }

    const [removed] = this.reconAssignments.splice(index, 1);
    return removed ?? null;
  }
}

const createInitialGameState = () => {
  const safehouses = createDefaultSafehouseCollection();
  const defaultSafehouse = safehouses.getDefault();
  const player = new Player({ name: 'The Wheelman', safehouseId: defaultSafehouse?.id ?? null });

  const initialCrew = [
    new CrewMember({
      name: 'Sable',
      specialty: 'hacker',
      upkeep: 750,
      loyalty: 3,
      backgroundId: 'ghost-operative',
      traits: { stealth: 4, tech: 5, driving: 1, tactics: 3, charisma: 2, muscle: 1 },
    }),
    new CrewMember({
      name: 'Torque',
      specialty: 'mechanic',
      upkeep: 600,
      loyalty: 2,
      backgroundId: 'garage-prodigy',
      traits: { stealth: 1, tech: 5, driving: 2, tactics: 2, charisma: 1, muscle: 3 },
    }),
  ];

  const buildCandidate = ({ id, hiringCost = 0, description = '', ...rest }) => {
    const template = createCrewTemplate({ id, ...rest });
    return {
      ...template,
      id: id ?? template.id,
      hiringCost,
      description,
    };
  };

  return new GameState({
    player,
    safehouses,
    crew: initialCrew,
    garage: [
      new Vehicle({ model: 'Safehouse Van', topSpeed: 95, handling: 4 }),
    ],
    lastVehicleReport: null,
    recruitPool: [
      buildCandidate({
        id: 'candidate-glitch',
        name: 'Glitch',
        specialty: 'infiltrator',
        upkeep: 680,
        loyalty: 2,
        hiringCost: 6500,
        description: 'Ghosts through security to keep heat low and plans steady exits.',
        backgroundId: 'ghost-operative',
        traits: { stealth: 5, tech: 4, driving: 1, tactics: 3, charisma: 1, muscle: 1 },
      }),
      buildCandidate({
        id: 'candidate-omen',
        name: 'Omen',
        specialty: 'tactician',
        upkeep: 720,
        loyalty: 3,
        hiringCost: 7800,
        description: 'Charts contingencies that trim mission time and risk.',
        backgroundId: 'street-enforcer',
        traits: { stealth: 2, tech: 3, driving: 3, tactics: 4, charisma: 2, muscle: 2 },
      }),
      buildCandidate({
        id: 'candidate-keystroke',
        name: 'Keystroke',
        specialty: 'spotter',
        upkeep: 560,
        loyalty: 2,
        hiringCost: 5200,
        description: 'Feeds intel from rooftops to tighten odds and payouts.',
        backgroundId: 'syndicate-fixer',
        traits: { stealth: 3, tech: 4, driving: 2, tactics: 3, charisma: 3, muscle: 1 },
      }),
    ],
    lastExpenseReport: null,
    pendingDebts: [],
    reconAssignments: [],
    partsInventory: 0,
    garageActivityLog: [],
    crackdownHistory: [],
    crewGearVendors: createInitialCrewGearVendorState({ day: 1 }),
  });
};

export { GameState, createInitialGameState };
