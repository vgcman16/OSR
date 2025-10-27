import { Player } from '../entities/player.js';
import { CrewMember } from '../entities/crewMember.js';
import { Vehicle } from '../entities/vehicle.js';
import { CityMap } from '../world/cityMap.js';
import { SafehouseCollection, createDefaultSafehouseCollection } from '../world/safehouse.js';

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
  }
}

const createInitialGameState = () => {
  const safehouses = createDefaultSafehouseCollection();
  const defaultSafehouse = safehouses.getDefault();
  const player = new Player({ name: 'The Wheelman', safehouseId: defaultSafehouse?.id ?? null });

  return new GameState({
    player,
    safehouses,
    crew: [
      new CrewMember({ name: 'Sable', specialty: 'hacker', upkeep: 750, loyalty: 3 }),
      new CrewMember({ name: 'Torque', specialty: 'mechanic', upkeep: 600, loyalty: 2 }),
    ],
    garage: [
      new Vehicle({ model: 'Safehouse Van', topSpeed: 95, handling: 4 }),
    ],
    lastVehicleReport: null,
    recruitPool: [
      {
        id: 'candidate-glitch',
        name: 'Glitch',
        specialty: 'infiltrator',
        upkeep: 680,
        loyalty: 2,
        hiringCost: 6500,
        description: 'Ghosts through security to keep heat low and plans steady exits.',
      },
      {
        id: 'candidate-omen',
        name: 'Omen',
        specialty: 'tactician',
        upkeep: 720,
        loyalty: 3,
        hiringCost: 7800,
        description: 'Charts contingencies that trim mission time and risk.',
      },
      {
        id: 'candidate-keystroke',
        name: 'Keystroke',
        specialty: 'spotter',
        upkeep: 560,
        loyalty: 2,
        hiringCost: 5200,
        description: 'Feeds intel from rooftops to tighten odds and payouts.',
      },
    ],
    lastExpenseReport: null,
  });
};

export { GameState, createInitialGameState };
