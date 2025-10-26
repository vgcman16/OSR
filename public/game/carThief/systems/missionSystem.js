import { Vehicle } from '../entities/vehicle.js';
import { HeatSystem } from './heatSystem.js';

const defaultMissionTemplates = [
  {
    id: 'showroom-heist',
    name: 'Showroom Smash-and-Grab',
    difficulty: 2,
    payout: 15000,
    heat: 2,
    duration: 40,
    description: 'Swipe a prototype from a downtown showroom under heavy surveillance.',
  },
  {
    id: 'dockyard-swap',
    name: 'Dockyard Switcheroo',
    difficulty: 1,
    payout: 8000,
    heat: 1,
    duration: 28,
    description: 'Intercept a shipment of luxury SUVs before it leaves the harbor.',
  },
  {
    id: 'collector-estate',
    name: "Collector's Estate",
    difficulty: 3,
    payout: 22000,
    heat: 3,
    duration: 55,
    description: 'Infiltrate a fortified mansion and extract a mint condition classic.',
  },
];

class MissionSystem {
  constructor(state, { heatSystem = new HeatSystem(state) } = {}) {
    this.state = state;
    this.availableMissions = [];
    this.heatSystem = heatSystem;
  }

  generateInitialContracts() {
    this.availableMissions = defaultMissionTemplates.map((template) => ({
      ...template,
      vehicle: new Vehicle({ model: 'Target Vehicle' }),
      status: 'available',
      elapsedTime: 0,
      progress: 0,
      duration: template.duration ?? Math.max(template.difficulty * 20, 20),
      startedAt: null,
      completedAt: null,
    }));
  }

  startMission(missionId) {
    if (this.state.activeMission && this.state.activeMission.status !== 'completed') {
      return null;
    }

    const mission = this.availableMissions.find((entry) => entry.id === missionId);
    if (!mission || mission.status !== 'available') {
      return null;
    }

    mission.status = 'in-progress';
    mission.startedAt = Date.now();
    mission.elapsedTime = 0;
    mission.progress = 0;
    this.state.activeMission = mission;
    return mission;
  }

  resolveMission(missionId, outcome) {
    const mission = this.availableMissions.find((entry) => entry.id === missionId);
    if (!mission || mission.status === 'available' || mission.status === 'completed') {
      return null;
    }

    const isSuccess = outcome === 'success' && mission.status === 'awaiting-resolution';
    const isFailure =
      outcome === 'failure' &&
      (mission.status === 'awaiting-resolution' || mission.status === 'in-progress');

    if (!(isSuccess || isFailure)) {
      return null;
    }

    mission.status = 'completed';
    mission.outcome = outcome;
    mission.completedAt = Date.now();
    mission.progress = 1;
    mission.elapsedTime = mission.duration;
    this.state.activeMission = null;

    if (outcome === 'success') {
      this.state.funds += mission.payout;
      this.heatSystem.increase(mission.heat);
      this.state.garage.push(mission.vehicle);
    } else if (outcome === 'failure') {
      this.heatSystem.increase(mission.heat * 2);
    }

    return mission;
  }

  update(delta) {
    const mission = this.state.activeMission;
    if (!mission || mission.status !== 'in-progress') {
      return;
    }

    mission.elapsedTime = (mission.elapsedTime ?? 0) + delta;
    const duration = mission.duration ?? Math.max(mission.difficulty * 20, 20);
    mission.duration = duration;
    mission.progress = Math.min(mission.elapsedTime / duration, 1);

    if (mission.progress >= 1) {
      mission.status = 'awaiting-resolution';
      mission.completedAt = mission.completedAt ?? Date.now();
    }
  }
}

export { MissionSystem };
