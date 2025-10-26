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
  constructor(
    state,
    {
      heatSystem = new HeatSystem(state),
      missionTemplates = defaultMissionTemplates,
      contractPool = [],
    } = {},
  ) {
    this.state = state;
    this.availableMissions = [];
    this.heatSystem = heatSystem;
    this.missionTemplates = missionTemplates.map((template) => ({ ...template }));
    this.templateMap = new Map(
      this.missionTemplates.map((template) => [template.id, template]),
    );
    this.contractPool = contractPool.map((template) => ({ ...template }));
  }

  registerTemplate(template) {
    if (!template || !template.id) {
      return;
    }

    if (!this.templateMap.has(template.id)) {
      const storedTemplate = { ...template };
      this.templateMap.set(template.id, storedTemplate);
      this.missionTemplates.push(storedTemplate);
    }
  }

  createMissionFromTemplate(template) {
    if (!template) {
      return null;
    }

    const duration = template.duration ?? Math.max(template.difficulty * 20, 20);
    const vehicleConfig =
      typeof template.vehicle === 'object' && template.vehicle !== null
        ? template.vehicle
        : { model: 'Target Vehicle' };

    return {
      ...template,
      vehicle: new Vehicle(vehicleConfig),
      status: 'available',
      elapsedTime: 0,
      progress: 0,
      duration,
      startedAt: null,
      completedAt: null,
      outcome: null,
    };
  }

  respawnMissionTemplate(missionId) {
    const missionIndex = this.availableMissions.findIndex((entry) => entry.id === missionId);
    if (missionIndex === -1) {
      return;
    }

    const template = this.templateMap.get(missionId);
    if (!template) {
      this.availableMissions.splice(missionIndex, 1);
      return;
    }

    const refreshedMission = this.createMissionFromTemplate(template);
    if (refreshedMission) {
      this.availableMissions.splice(missionIndex, 1, refreshedMission);
    }
  }

  drawContractFromPool() {
    if (!this.contractPool.length) {
      return null;
    }

    const nextTemplate = this.contractPool.shift();
    if (!nextTemplate) {
      return null;
    }

    this.registerTemplate(nextTemplate);
    const mission = this.createMissionFromTemplate(nextTemplate);
    if (mission) {
      const existingIndex = this.availableMissions.findIndex(
        (entry) => entry.id === mission.id,
      );
      if (existingIndex === -1) {
        this.availableMissions.push(mission);
      } else {
        this.availableMissions.splice(existingIndex, 1, mission);
      }
    }

    return mission;
  }

  generateInitialContracts() {
    this.availableMissions = this.missionTemplates
      .map((template) => this.createMissionFromTemplate(template))
      .filter(Boolean);
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

    this.respawnMissionTemplate(mission.id);
    this.drawContractFromPool();

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
