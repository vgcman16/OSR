import { Vehicle } from '../entities/vehicle.js';
import { HeatSystem } from './heatSystem.js';
import { generateContractsFromDistricts } from './contractFactory.js';

const coerceFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

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

const REQUIRED_TEMPLATE_FIELDS = ['id', 'name'];

const sanitizeDuration = (durationValue, difficultyValue) => {
  const numericDuration = coerceFiniteNumber(durationValue, NaN);
  const numericDifficulty = coerceFiniteNumber(difficultyValue, 1);
  const fallback = Math.max(numericDifficulty * 20, 20);

  if (Number.isFinite(numericDuration) && numericDuration > 0) {
    return numericDuration;
  }

  return fallback;
};

const deriveBaseSuccessChance = (difficultyValue) => {
  const difficulty = coerceFiniteNumber(difficultyValue, 1);
  const baseline = 0.75 - difficulty * 0.08;
  return Math.max(0.3, Math.min(0.85, baseline));
};

const summarizeCrewEffect = (member, { durationDelta = 0, payoutDelta = 0, successDelta = 0 }) => {
  const adjustments = [];
  if (durationDelta) {
    const label = durationDelta < 0 ? 'faster' : 'slower';
    adjustments.push(`${Math.abs(Math.round(durationDelta * 100))}% ${label}`);
  }
  if (payoutDelta) {
    const label = payoutDelta > 0 ? 'more' : 'less';
    adjustments.push(`${Math.abs(Math.round(payoutDelta * 100))}% ${label} payout`);
  }
  if (successDelta) {
    adjustments.push(`${successDelta > 0 ? '+' : '-'}${Math.abs(Math.round(successDelta * 100))}% success`);
  }

  if (!adjustments.length) {
    return `${member.name}: steady support.`;
  }

  return `${member.name}: ${adjustments.join(', ')}`;
};

const crackdownPolicies = {
  calm: {
    label: 'Calm',
    maxMissionHeat: Infinity,
    failureHeatMultiplier: 2,
  },
  alert: {
    label: 'Alert',
    maxMissionHeat: 2,
    failureHeatMultiplier: 3,
  },
  lockdown: {
    label: 'Lockdown',
    maxMissionHeat: 1,
    failureHeatMultiplier: 4,
  },
};

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
      contractFactory = generateContractsFromDistricts,
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
    this.contractFactory = contractFactory;

    this.currentCrackdownTier = this.heatSystem.getCurrentTier();

    if (!Array.isArray(this.state.missionLog)) {
      this.state.missionLog = [];
    }

    this.refreshContractPoolFromCity();
    this.applyHeatRestrictions();
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

    const missingFields = REQUIRED_TEMPLATE_FIELDS.filter(
      (field) => template[field] === undefined || template[field] === null,
    );

    if (missingFields.length) {
      const formattedMissingFields = missingFields.join(', ');
      console.warn(
        `Mission template "${template.id ?? '<unknown>'}" missing required fields: ${formattedMissingFields}`,
      );
      return null;
    }

    const payout = coerceFiniteNumber(template.payout, 0);
    const heat = coerceFiniteNumber(template.heat, 0);
    const difficulty = coerceFiniteNumber(template.difficulty, 1);
    const duration = sanitizeDuration(template.duration, difficulty);
    const baseSuccessChance = deriveBaseSuccessChance(difficulty);
    const vehicleConfig =
      typeof template.vehicle === 'object' && template.vehicle !== null
        ? template.vehicle
        : { model: 'Target Vehicle' };

    return {
      ...template,
      payout,
      basePayout: payout,
      heat,
      baseHeat: heat,
      difficulty,
      vehicle: new Vehicle(vehicleConfig),
      status: 'available',
      restricted: false,
      restrictionReason: null,
      elapsedTime: 0,
      progress: 0,
      duration,
      baseDuration: duration,
      successChance: baseSuccessChance,
      baseSuccessChance,
      startedAt: null,
      completedAt: null,
      outcome: null,
      resolutionRoll: null,
      resolutionChance: null,
      pendingResolution: null,
      resolutionDetails: null,
      assignedCrewIds: [],
      assignedCrewImpact: null,
      crewEffectSummary: [],
      assignedVehicleId: null,
      assignedVehicleImpact: null,
      assignedVehicleSnapshot: null,
      assignedVehicleLabel: null,
    };
  }

  refreshContractPoolFromCity() {
    if (typeof this.contractFactory !== 'function') {
      return;
    }

    const districts = this.state?.city?.districts ?? [];
    if (!Array.isArray(districts) || !districts.length) {
      return;
    }

    const generatedContracts = this.contractFactory(districts);
    generatedContracts.forEach((template) => {
      if (!template || !template.id) {
        return;
      }

      if (!this.templateMap.has(template.id)) {
        this.registerTemplate(template);
      }

      const alreadyAvailable = this.availableMissions.some((mission) => mission.id === template.id);
      const alreadyQueued = this.contractPool.some((mission) => mission.id === template.id);
      if (!alreadyAvailable && !alreadyQueued) {
        this.contractPool.push({ ...template });
      }
    });
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
      this.applyHeatRestrictions();
    }
  }

  drawContractFromPool() {
    if (!this.contractPool.length) {
      this.refreshContractPoolFromCity();
    }

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
      this.applyHeatRestrictions();
    }

    return mission;
  }

  normalizeSuccessChance(mission) {
    if (!mission) {
      return 0;
    }

    const candidate = Number(mission.successChance);
    if (Number.isFinite(candidate)) {
      return Math.max(0, Math.min(1, candidate));
    }

    const fallback = Number.isFinite(mission.baseSuccessChance)
      ? mission.baseSuccessChance
      : deriveBaseSuccessChance(mission.difficulty);
    return Math.max(0, Math.min(1, fallback));
  }

  prepareAutomaticResolution(mission) {
    const successChance = this.normalizeSuccessChance(mission);
    const roll = Math.random();
    const outcome = roll <= successChance ? 'success' : 'failure';

    mission.resolutionRoll = roll;
    mission.resolutionChance = successChance;
    mission.pendingResolution = {
      roll,
      successChance,
      resolvedAutomatically: true,
      evaluatedAt: Date.now(),
    };

    return { outcome, roll, successChance };
  }

  recordMissionTelemetry(mission, outcome) {
    if (!mission) {
      return null;
    }

    const pending = mission.pendingResolution ?? null;
    const successChance = Number.isFinite(pending?.successChance)
      ? pending.successChance
      : this.normalizeSuccessChance(mission);
    const roll = Number.isFinite(pending?.roll) ? pending.roll : null;
    const automatic = Boolean(pending?.resolvedAutomatically);
    const timestamp = Date.now();

    const outcomeLabel = outcome === 'success' ? 'Success' : 'Failure';
    const chancePercent = Number.isFinite(successChance)
      ? Math.round(successChance * 100)
      : null;
    const rollPercent = Number.isFinite(roll) ? Math.round(roll * 100) : null;

    let summary = `${mission.name} — ${outcomeLabel}`;
    if (rollPercent !== null && chancePercent !== null) {
      summary = `${summary} (rolled ${rollPercent}% vs ${chancePercent}% odds)`;
    }
    if (!automatic) {
      summary = `${summary} (manual resolution)`;
    }

    mission.resolutionDetails = {
      outcome,
      roll,
      successChance,
      automatic,
      timestamp,
    };
    mission.pendingResolution = null;
    mission.resolutionRoll = roll;
    mission.resolutionChance = successChance;

    if (!Array.isArray(this.state.missionLog)) {
      this.state.missionLog = [];
    }

    const entry = {
      id: `${mission.id}-${timestamp}`,
      missionId: mission.id,
      missionName: mission.name,
      outcome,
      roll,
      successChance,
      automatic,
      timestamp,
      summary,
    };

    this.state.missionLog.unshift(entry);
    if (this.state.missionLog.length > 20) {
      this.state.missionLog.length = 20;
    }

    return entry;
  }

  computeCrewImpact(mission, crewMembers = [], vehicle = null) {
    if (!mission) {
      return null;
    }

    const baseDuration = sanitizeDuration(mission.baseDuration ?? mission.duration, mission.difficulty);
    const basePayout = coerceFiniteNumber(mission.basePayout ?? mission.payout, 0);
    const baseSuccessChance = Number.isFinite(mission.baseSuccessChance)
      ? mission.baseSuccessChance
      : deriveBaseSuccessChance(mission.difficulty);
    const baseHeat = Number.isFinite(mission.baseHeat)
      ? mission.baseHeat
      : coerceFiniteNumber(mission.heat, 0);

    let durationMultiplier = 1;
    let payoutMultiplier = 1;
    let successBonus = 0;
    const summary = [];

    crewMembers.forEach((member) => {
      if (!member) {
        return;
      }

      const loyalty = Number(member.loyalty) >= 0 ? Number(member.loyalty) : 0;
      const safeLoyalty = Number.isFinite(loyalty) ? loyalty : 0;
      const contribution = { durationDelta: 0, payoutDelta: 0, successDelta: 0 };

      switch ((member.specialty ?? '').toLowerCase()) {
        case 'wheelman': {
          const reduction = Math.min(0.3, 0.04 * safeLoyalty);
          durationMultiplier -= reduction;
          contribution.durationDelta = -reduction;
          successBonus += 0.01 * safeLoyalty;
          contribution.successDelta += 0.01 * safeLoyalty;
          break;
        }
        case 'hacker': {
          const bonus = 0.05 + 0.02 * safeLoyalty;
          successBonus += bonus;
          contribution.successDelta += bonus;
          durationMultiplier -= Math.min(0.1, 0.01 * safeLoyalty);
          contribution.durationDelta -= Math.min(0.1, 0.01 * safeLoyalty);
          break;
        }
        case 'mechanic': {
          const payoutBoost = 0.03 * (1 + safeLoyalty / 2);
          payoutMultiplier += payoutBoost;
          contribution.payoutDelta = payoutBoost;
          successBonus += 0.005 * safeLoyalty;
          contribution.successDelta += 0.005 * safeLoyalty;
          break;
        }
        case 'face': {
          const payoutBoost = 0.02 * safeLoyalty;
          payoutMultiplier += payoutBoost;
          contribution.payoutDelta = payoutBoost;
          const success = 0.03 + 0.01 * safeLoyalty;
          successBonus += success;
          contribution.successDelta += success;
          break;
        }
        default: {
          const genericBonus = 0.02 * (1 + safeLoyalty / 2);
          successBonus += genericBonus;
          contribution.successDelta += genericBonus;
          break;
        }
      }

      summary.push(summarizeCrewEffect(member, contribution));
    });

    durationMultiplier = Math.max(0.5, durationMultiplier);
    payoutMultiplier = Math.max(0.5, payoutMultiplier);

    let heatAdjustment = 0;
    let adjustedHeat = baseHeat;
    let vehicleImpact = null;

    if (vehicle) {
      const safeSpeed = Math.max(60, coerceFiniteNumber(vehicle.topSpeed, 120));
      const safeAcceleration = Math.max(1, coerceFiniteNumber(vehicle.acceleration, 5));
      const safeHandling = Math.max(1, coerceFiniteNumber(vehicle.handling, 5));
      const rawCondition = Number(vehicle.condition);
      const safeCondition = Number.isFinite(rawCondition) ? clamp(rawCondition, 0, 1) : 1;
      const rawHeat = Number(vehicle.heat);
      const safeHeatRating = Number.isFinite(rawHeat) ? Math.max(0, rawHeat) : 0;

      const speedRatio = clamp(safeSpeed / 120, 0.5, 1.8);
      const accelerationRatio = clamp(safeAcceleration / 5, 0.5, 1.6);
      const handlingRatio = clamp(safeHandling / 5, 0.5, 1.6);
      const agilityScore = clamp(speedRatio * 0.6 + accelerationRatio * 0.4, 0.4, 2);
      const conditionPenalty = clamp(1 + (1 - safeCondition) * 0.6, 0.7, 1.6);
      const vehicleDurationMultiplier = clamp((1 / agilityScore) * conditionPenalty, 0.6, 1.4);

      durationMultiplier *= vehicleDurationMultiplier;
      durationMultiplier = Math.max(0.35, durationMultiplier);

      const handlingBonus = (handlingRatio - 1) * 0.12;
      const conditionBonus = (safeCondition - 0.6) * 0.08;
      successBonus += handlingBonus + conditionBonus;

      const difficulty = coerceFiniteNumber(mission.difficulty, 1);
      const conditionHeat = Math.max(0, (1 - safeCondition) * (0.8 + 0.2 * difficulty));
      const maneuverMitigation = Math.max(0, handlingRatio - 1) * 0.15;
      heatAdjustment = safeHeatRating * 0.3 + conditionHeat - maneuverMitigation;
      adjustedHeat = Math.max(0, baseHeat + heatAdjustment);

      const wearBaseline = 0.07 + 0.025 * difficulty;
      const wearModifier = clamp(
        1.1 - (handlingRatio - 1) * 0.35 - (safeCondition - 0.7) * 0.45,
        0.5,
        1.6,
      );
      const wearOnSuccess = clamp(wearBaseline * wearModifier, 0.02, 0.5);
      const wearOnFailure = clamp(wearOnSuccess * 1.35 + 0.05, 0.04, 0.7);

      const heatGainBase = Math.max(0, 0.12 * difficulty + safeHeatRating * 0.1);
      const heatGainMitigation = Math.max(0, (handlingRatio - 1) * 0.08);
      const heatGainOnSuccess = Math.max(0, heatGainBase + conditionHeat * 0.15 - heatGainMitigation);
      const heatGainOnFailure = heatGainOnSuccess + 0.15;

      const durationDeltaPercent = Math.round((1 - vehicleDurationMultiplier) * 100);
      const successDeltaPercent = Math.round((handlingBonus + conditionBonus) * 100);
      const heatDeltaLabel = Math.abs(heatAdjustment) >= 0.05
        ? `${heatAdjustment > 0 ? '+' : '-'}${Math.abs(heatAdjustment).toFixed(1)} heat`
        : null;

      const vehicleSummaryParts = [];
      if (Math.abs(durationDeltaPercent) >= 1) {
        vehicleSummaryParts.push(
          `${Math.abs(durationDeltaPercent)}% ${durationDeltaPercent > 0 ? 'faster' : 'slower'}`,
        );
      }
      if (Math.abs(successDeltaPercent) >= 1) {
        vehicleSummaryParts.push(
          `${successDeltaPercent > 0 ? '+' : ''}${successDeltaPercent}% success`,
        );
      }
      if (heatDeltaLabel) {
        vehicleSummaryParts.push(heatDeltaLabel);
      }
      if (!vehicleSummaryParts.length) {
        vehicleSummaryParts.push('steady performance');
      }
      summary.push(
        `Vehicle (${vehicle.model ?? 'Crew wheels'}): ${vehicleSummaryParts.join(', ')}.`,
      );

      vehicleImpact = {
        vehicleId: vehicle.id,
        model: vehicle.model,
        durationMultiplier: vehicleDurationMultiplier,
        successContribution: handlingBonus + conditionBonus,
        heatAdjustment,
        wearOnSuccess,
        wearOnFailure,
        heatGainOnSuccess,
        heatGainOnFailure,
        conditionBefore: safeCondition,
        heatBefore: safeHeatRating,
      };
    } else {
      summary.push('Vehicle: No assignment selected.');
      adjustedHeat = Math.max(0, baseHeat);
      heatAdjustment = 0;
    }

    const adjustedDuration = Math.max(5, Math.round(baseDuration * durationMultiplier));
    const adjustedPayout = Math.round(basePayout * payoutMultiplier);
    const adjustedSuccessChance = Math.max(0.05, Math.min(0.98, baseSuccessChance + successBonus));

    return {
      baseDuration,
      adjustedDuration,
      basePayout,
      adjustedPayout,
      baseSuccessChance,
      adjustedSuccessChance,
      baseHeat,
      adjustedHeat,
      heatAdjustment,
      summary,
      durationMultiplier,
      payoutMultiplier,
      successBonus,
      vehicleImpact,
    };
  }

  previewCrewAssignment(missionId, crewIds = [], vehicleId = null) {
    const mission = this.availableMissions.find((entry) => entry.id === missionId);
    if (!mission) {
      return null;
    }

    const crewPool = Array.isArray(this.state?.crew) ? this.state.crew : [];
    const crewMembers = crewPool.filter((member) => crewIds.includes(member.id));
    const garage = Array.isArray(this.state?.garage) ? this.state.garage : [];
    const vehicle = vehicleId ? garage.find((entry) => entry?.id === vehicleId) ?? null : null;
    return this.computeCrewImpact(mission, crewMembers, vehicle) ?? null;
  }

  generateInitialContracts() {
    this.availableMissions = this.missionTemplates
      .map((template) => this.createMissionFromTemplate(template))
      .filter(Boolean);

    if (!this.availableMissions.length) {
      this.refreshContractPoolFromCity();
    }

    while (this.availableMissions.length < 3) {
      const mission = this.drawContractFromPool();
      if (!mission) {
        break;
      }
    }

    this.applyHeatRestrictions();
  }

  startMission(missionId, crewIds = [], vehicleId = null) {
    if (this.state.activeMission && this.state.activeMission.status !== 'completed') {
      return null;
    }

    this.syncHeatTier();
    this.state.lastVehicleReport = null;

    const mission = this.availableMissions.find((entry) => entry.id === missionId);
    if (!mission || mission.status !== 'available' || mission.restricted) {
      return null;
    }

    const crewPool = Array.isArray(this.state?.crew) ? this.state.crew : [];
    const requestedCrewIds = Array.isArray(crewIds) ? crewIds : [];
    const assignedCrew = crewPool.filter((member) => requestedCrewIds.includes(member.id));

    const crewUnavailable = assignedCrew.some((member) => member.status && member.status !== 'idle');
    if (crewUnavailable) {
      return null;
    }

    const garage = Array.isArray(this.state?.garage) ? this.state.garage : [];
    let assignedVehicle = null;

    if (vehicleId) {
      assignedVehicle = garage.find((entry) => entry?.id === vehicleId) ?? null;
      if (!assignedVehicle) {
        return null;
      }
    } else {
      assignedVehicle = garage.find((vehicle) => {
        if (!vehicle) {
          return false;
        }

        const statusLabel = (vehicle.status ?? 'idle').toLowerCase();
        const inUse = Boolean(vehicle.inUse) || statusLabel === 'in-mission';
        const conditionValue = Number(vehicle.condition);
        const operational = !Number.isFinite(conditionValue) || conditionValue > 0.05;
        return operational && !inUse;
      }) ?? null;
    }

    if (assignedVehicle) {
      const vehicleStatus = (assignedVehicle.status ?? 'idle').toLowerCase();
      const vehicleInUse = Boolean(assignedVehicle.inUse) || vehicleStatus === 'in-mission';
      const conditionValue = Number(assignedVehicle.condition);
      const vehicleOperational = !Number.isFinite(conditionValue) || conditionValue > 0.05;

      if (vehicleInUse || !vehicleOperational) {
        if (vehicleId) {
          return null;
        }

        assignedVehicle = null;
      }
    }

    const crewImpact = this.computeCrewImpact(mission, assignedCrew, assignedVehicle ?? null);
    if (crewImpact) {
      mission.duration = crewImpact.adjustedDuration;
      mission.payout = crewImpact.adjustedPayout;
      mission.successChance = crewImpact.adjustedSuccessChance;
      mission.assignedCrewImpact = crewImpact;
      mission.heat = crewImpact.adjustedHeat;
      mission.assignedVehicleImpact = assignedVehicle ? crewImpact.vehicleImpact : null;
    } else {
      mission.duration = sanitizeDuration(mission.baseDuration ?? mission.duration, mission.difficulty);
      mission.payout = coerceFiniteNumber(mission.basePayout ?? mission.payout, 0);
      mission.successChance = Number.isFinite(mission.baseSuccessChance)
        ? mission.baseSuccessChance
        : deriveBaseSuccessChance(mission.difficulty);
      mission.assignedCrewImpact = null;
      mission.heat = Number.isFinite(mission.baseHeat)
        ? mission.baseHeat
        : coerceFiniteNumber(mission.heat, 0);
      mission.assignedVehicleImpact = null;
    }

    mission.assignedCrewIds = assignedCrew.map((member) => member.id);
    mission.crewEffectSummary = crewImpact?.summary ?? [];
    mission.assignedVehicleId = assignedVehicle ? assignedVehicle.id : null;
    mission.assignedVehicleSnapshot = assignedVehicle
      ? {
          condition: Number.isFinite(assignedVehicle.condition) ? assignedVehicle.condition : null,
          heat: Number.isFinite(assignedVehicle.heat) ? assignedVehicle.heat : null,
        }
      : null;
    mission.assignedVehicleLabel = assignedVehicle ? assignedVehicle.model ?? 'Assigned vehicle' : null;

    assignedCrew.forEach((member) => {
      if (typeof member.setStatus === 'function') {
        member.setStatus('on-mission');
      } else {
        member.status = 'on-mission';
      }
    });

    if (assignedVehicle) {
      if (typeof assignedVehicle.setStatus === 'function') {
        assignedVehicle.setStatus('in-mission');
      } else {
        assignedVehicle.status = 'in-mission';
        assignedVehicle.inUse = true;
      }
    }

    mission.resolutionRoll = null;
    mission.resolutionChance = null;
    mission.pendingResolution = null;
    mission.resolutionDetails = null;
    mission.status = 'in-progress';
    mission.startedAt = Date.now();
    mission.elapsedTime = 0;
    mission.progress = 0;
    this.state.activeMission = mission;
    return mission;
  }

  resolveMission(missionId, outcome) {
    this.syncHeatTier();

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

    const crackdownPolicy = this.getCurrentCrackdownPolicy();

    const crewPool = Array.isArray(this.state?.crew) ? this.state.crew : [];
    const assignedCrew = crewPool.filter((member) => mission.assignedCrewIds?.includes(member.id));
    const garage = Array.isArray(this.state?.garage) ? this.state.garage : [];
    const assignedVehicleId = mission.assignedVehicleId ?? null;
    const assignedVehicle = assignedVehicleId
      ? garage.find((vehicle) => vehicle?.id === assignedVehicleId) ?? null
      : null;
    const vehicleImpact = mission.assignedCrewImpact?.vehicleImpact ?? mission.assignedVehicleImpact ?? null;
    const snapshot = mission.assignedVehicleSnapshot ?? {};
    const preMissionCondition = Number.isFinite(snapshot.condition)
      ? clamp(snapshot.condition, 0, 1)
      : Number.isFinite(assignedVehicle?.condition)
        ? clamp(assignedVehicle.condition, 0, 1)
        : null;
    const preMissionHeat = Number.isFinite(snapshot.heat)
      ? snapshot.heat
      : Number.isFinite(assignedVehicle?.heat)
        ? assignedVehicle.heat
        : null;

    if (outcome === 'success') {
      this.state.funds += mission.payout;
      this.heatSystem.increase(mission.heat);
      this.state.garage.push(mission.vehicle);

      assignedCrew.forEach((member) => {
        if (typeof member.adjustLoyalty === 'function') {
          member.adjustLoyalty(1);
        }
      });

      if (mission.vehicle && typeof mission.vehicle.applyWear === 'function') {
        const mechanicScore = assignedCrew
          .filter((member) => (member.specialty ?? '').toLowerCase() === 'mechanic')
          .reduce((total, member) => total + (Number(member.loyalty) || 0), 0);
        const wearReduction = Math.min(0.08, mechanicScore * 0.01);
        const wearAmount = Math.max(0.05, 0.18 - wearReduction);
        mission.vehicle.applyWear(wearAmount);
      }
      if (mission.vehicle && typeof mission.vehicle.setStatus === 'function') {
        mission.vehicle.setStatus('idle');
      } else if (mission.vehicle) {
        mission.vehicle.status = 'idle';
        mission.vehicle.inUse = false;
      }
      if (typeof mission.vehicle?.markStolen === 'function') {
        mission.vehicle.markStolen();
      }
    } else if (outcome === 'failure') {
      const multiplier = crackdownPolicy.failureHeatMultiplier ?? 2;
      this.heatSystem.increase(mission.heat * multiplier);

      assignedCrew.forEach((member) => {
        if (typeof member.adjustLoyalty === 'function') {
          member.adjustLoyalty(-1);
        }
      });
    }

    let vehicleReport = null;
    if (assignedVehicle) {
      const wearAmount = (() => {
        const value = Number.isFinite(
          outcome === 'success' ? vehicleImpact?.wearOnSuccess : vehicleImpact?.wearOnFailure,
        )
          ? outcome === 'success'
            ? vehicleImpact.wearOnSuccess
            : vehicleImpact.wearOnFailure
          : 0.12;
        return Math.max(0, value);
      })();

      const heatGainAmount = (() => {
        const value = Number.isFinite(
          outcome === 'success' ? vehicleImpact?.heatGainOnSuccess : vehicleImpact?.heatGainOnFailure,
        )
          ? outcome === 'success'
            ? vehicleImpact.heatGainOnSuccess
            : vehicleImpact.heatGainOnFailure
          : 0.2;
        return Math.max(0, value);
      })();

      const originalCondition = Number.isFinite(assignedVehicle.condition)
        ? clamp(assignedVehicle.condition, 0, 1)
        : null;
      const originalHeat = Number.isFinite(assignedVehicle.heat) ? assignedVehicle.heat : null;

      if (typeof assignedVehicle.applyWear === 'function') {
        assignedVehicle.applyWear(wearAmount);
      } else if (Number.isFinite(assignedVehicle.condition)) {
        assignedVehicle.condition = clamp(assignedVehicle.condition - wearAmount, 0, 1);
      }

      if (typeof assignedVehicle.modifyHeat === 'function') {
        assignedVehicle.modifyHeat(heatGainAmount);
      } else if (Number.isFinite(assignedVehicle.heat)) {
        assignedVehicle.heat = Math.max(0, assignedVehicle.heat + heatGainAmount);
      }

      if (typeof assignedVehicle.setStatus === 'function') {
        assignedVehicle.setStatus('idle');
      } else {
        assignedVehicle.status = 'idle';
        assignedVehicle.inUse = false;
      }

      const finalCondition = Number.isFinite(assignedVehicle.condition)
        ? clamp(assignedVehicle.condition, 0, 1)
        : null;
      const finalHeat = Number.isFinite(assignedVehicle.heat) ? assignedVehicle.heat : null;

      vehicleReport = {
        vehicleId: assignedVehicle.id,
        vehicleModel: assignedVehicle.model,
        missionName: mission.name,
        outcome,
        conditionBefore: preMissionCondition ?? originalCondition,
        conditionAfter: finalCondition,
        conditionDelta:
          finalCondition !== null && (preMissionCondition ?? originalCondition) !== null
            ? finalCondition - (preMissionCondition ?? originalCondition)
            : null,
        heatBefore: preMissionHeat ?? originalHeat,
        heatAfter: finalHeat,
        heatDelta:
          finalHeat !== null && (preMissionHeat ?? originalHeat) !== null
            ? finalHeat - (preMissionHeat ?? originalHeat)
            : null,
      };
    }

    assignedCrew.forEach((member) => {
      if (typeof member.setStatus === 'function') {
        member.setStatus('idle');
      } else {
        member.status = 'idle';
      }
    });

    this.recordMissionTelemetry(mission, outcome);

    mission.assignedCrewIds = [];
    mission.assignedCrewImpact = null;
    mission.crewEffectSummary = [];
    mission.assignedVehicleId = null;
    mission.assignedVehicleImpact = null;
    mission.assignedVehicleSnapshot = null;
    mission.assignedVehicleLabel = null;

    this.state.lastVehicleReport = vehicleReport;

    this.respawnMissionTemplate(mission.id);
    this.drawContractFromPool();
    this.applyHeatRestrictions();

    return mission;
  }

  update(delta) {
    this.syncHeatTier();

    const mission = this.state.activeMission;
    if (!mission || mission.status !== 'in-progress') {
      return;
    }

    mission.elapsedTime = (mission.elapsedTime ?? 0) + delta;
    const duration = sanitizeDuration(mission.duration, mission.difficulty);
    mission.duration = duration;
    mission.progress = Math.min(mission.elapsedTime / duration, 1);

    if (mission.progress >= 1) {
      mission.progress = 1;
      mission.elapsedTime = duration;

      if (mission.status !== 'completed') {
        mission.status = 'awaiting-resolution';
        mission.completedAt = mission.completedAt ?? Date.now();
        const { outcome } = this.prepareAutomaticResolution(mission);
        this.resolveMission(mission.id, outcome);
      }
    }
  }
}

MissionSystem.prototype.getCurrentCrackdownPolicy = function getCurrentCrackdownPolicy() {
  const tier = this.currentCrackdownTier ?? this.heatSystem.getCurrentTier();
  return crackdownPolicies[tier] ?? crackdownPolicies.calm;
};

MissionSystem.prototype.syncHeatTier = function syncHeatTier() {
  const latestTier = this.heatSystem.getCurrentTier();
  if (this.currentCrackdownTier !== latestTier) {
    this.currentCrackdownTier = latestTier;
    this.applyHeatRestrictions();
  }
};

MissionSystem.prototype.applyHeatRestrictions = function applyHeatRestrictions() {
  const policy = this.getCurrentCrackdownPolicy();
  const maxHeat = policy.maxMissionHeat ?? Infinity;

  this.availableMissions.forEach((mission) => {
    if (!mission || mission.status !== 'available') {
      mission.restricted = false;
      mission.restrictionReason = null;
      return;
    }

    if (mission.heat > maxHeat) {
      mission.restricted = true;
      mission.restrictionReason = `Unavailable during ${policy.label.toLowerCase()} crackdown`;
    } else {
      mission.restricted = false;
      mission.restrictionReason = null;
    }
  });
};

export { MissionSystem };
