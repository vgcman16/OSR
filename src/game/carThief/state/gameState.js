import { Player } from '../entities/player.js';
import { CrewMember, createCrewTemplate } from '../entities/crewMember.js';
import { Vehicle } from '../entities/vehicle.js';
import { CityMap } from '../world/cityMap.js';
import { SafehouseCollection, createDefaultSafehouseCollection } from '../world/safehouse.js';

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
    pendingDebts = [],
    followUpSequence = 0,
    safehouseIncursions = [],
    reconAssignments = [],
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
    this.pendingDebts = Array.isArray(pendingDebts) ? pendingDebts : [];
    this.followUpSequence = Number.isFinite(followUpSequence) ? followUpSequence : 0;
    this.safehouseIncursions = Array.isArray(safehouseIncursions)
      ? safehouseIncursions
          .filter((entry) => entry && typeof entry === 'object' && entry.id)
          .map((entry) => ({ ...entry }))
      : [];
    this.reconAssignments = normalizeReconAssignments(reconAssignments);
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
      pendingDebts: serializeArray(this.pendingDebts),
      followUpSequence: this.followUpSequence,
      safehouseIncursions: serializeArray(this.safehouseIncursions),
      reconAssignments: serializeArray(this.reconAssignments),
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
  });
};

export { GameState, createInitialGameState };
