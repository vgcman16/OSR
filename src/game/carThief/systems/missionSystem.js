import { Vehicle } from '../entities/vehicle.js';

const defaultMissionTemplates = [
  {
    id: 'showroom-heist',
    name: 'Showroom Smash-and-Grab',
    difficulty: 2,
    payout: 15000,
    heat: 2,
    description: 'Swipe a prototype from a downtown showroom under heavy surveillance.',
  },
  {
    id: 'dockyard-swap',
    name: 'Dockyard Switcheroo',
    difficulty: 1,
    payout: 8000,
    heat: 1,
    description: 'Intercept a shipment of luxury SUVs before it leaves the harbor.',
  },
  {
    id: 'collector-estate',
    name: "Collector's Estate", 
    difficulty: 3,
    payout: 22000,
    heat: 3,
    description: 'Infiltrate a fortified mansion and extract a mint condition classic.',
  },
];

class MissionSystem {
  constructor(state) {
    this.state = state;
    this.availableMissions = [];
  }

  generateInitialContracts() {
    this.availableMissions = defaultMissionTemplates.map((template) => ({
      ...template,
      vehicle: new Vehicle({ model: 'Target Vehicle' }),
      status: 'available',
    }));
  }

  startMission(missionId) {
    const mission = this.availableMissions.find((entry) => entry.id === missionId);
    if (!mission || mission.status !== 'available') {
      return null;
    }

    mission.status = 'in-progress';
    mission.startedAt = Date.now();
    this.state.activeMission = mission;
    return mission;
  }

  resolveMission(missionId, outcome) {
    const mission = this.availableMissions.find((entry) => entry.id === missionId);
    const isActiveMission = this.state.activeMission && this.state.activeMission.id === missionId;

    if (!mission || mission.status !== 'in-progress' || !isActiveMission) {
      return null;
    }

    mission.status = 'completed';
    mission.outcome = outcome;
    this.state.activeMission = null;

    if (outcome === 'success') {
      this.state.funds += mission.payout;
      this.state.heat += mission.heat;
      this.state.garage.push(mission.vehicle);
    } else if (outcome === 'failure') {
      this.state.heat += mission.heat * 2;
    }

    return mission;
  }

  update() {
    // Placeholder for mission timers and dynamic generation.
  }
}

export { MissionSystem };
