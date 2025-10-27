import { Player } from '../entities/player.js';
import { CrewMember } from '../entities/crewMember.js';
import { Vehicle } from '../entities/vehicle.js';
import { CityMap } from '../world/cityMap.js';

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
    activeMission = null,
    missionLog = [],
    lastVehicleReport = null,
  } = {}) {
    this.day = day;
    this.funds = funds;
    this.heat = heat;
    this.heatTier = heatTier;
    this.player = player;
    this.crew = crew;
    this.garage = garage;
    this.city = city;
    this.activeMission = activeMission;
    this.missionLog = Array.isArray(missionLog) ? missionLog : [];
    this.lastVehicleReport = lastVehicleReport;
  }
}

const createInitialGameState = () =>
  new GameState({
    crew: [
      new CrewMember({ name: 'Sable', specialty: 'hacker', upkeep: 750, loyalty: 3 }),
      new CrewMember({ name: 'Torque', specialty: 'mechanic', upkeep: 600, loyalty: 2 }),
    ],
    garage: [
      new Vehicle({ model: 'Safehouse Van', topSpeed: 95, handling: 4 }),
    ],
    lastVehicleReport: null,
  });

export { GameState, createInitialGameState };
