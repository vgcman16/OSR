import test from 'node:test';
import assert from 'node:assert/strict';

import { MissionSystem, GARAGE_MAINTENANCE_CONFIG } from '../src/game/carThief/systems/missionSystem.js';
import { HeatSystem } from '../src/game/carThief/systems/heatSystem.js';
import { EconomySystem } from '../src/game/carThief/systems/economySystem.js';
import { Vehicle } from '../src/game/carThief/entities/vehicle.js';
import { Safehouse, SafehouseCollection } from '../src/game/carThief/world/safehouse.js';
import { CrewMember, CREW_FATIGUE_CONFIG } from '../src/game/carThief/entities/crewMember.js';

const createState = () => ({
  funds: 1000,
  heat: 0,
  garage: [],
  activeMission: null,
  heatTier: 'calm',
  missionLog: [],
  crew: [],
  pendingDebts: [],
});

const resolvePendingDecisions = (missionSystem, mission) => {
  if (!missionSystem || !mission) {
    return;
  }

  while (mission.pendingDecision) {
    const decision = mission.pendingDecision;
    assert.ok(decision.choices?.length, 'mission event provides choices to resolve');
    const choice = decision.choices[0];
    missionSystem.chooseMissionEventOption(decision.eventId, choice.id);
    missionSystem.advanceMissionEvents(mission);
  }
};

test('Garage maintenance repairs restore condition when funds allow', (t) => {
  const state = createState();
  state.funds = 20_000;
  const vehicle = new Vehicle({ model: 'Interceptor' });
  vehicle.condition = 0.35;
  vehicle.heat = 1.2;
  state.garage.push(vehicle);

  const heatSystem = new HeatSystem(state);
  const missionSystem = new MissionSystem(state, { heatSystem });
  const economySystem = new EconomySystem(state);

  const repairCost = GARAGE_MAINTENANCE_CONFIG.repair.cost;
  const repairBoost = GARAGE_MAINTENANCE_CONFIG.repair.conditionBoost;
  const fundsBefore = state.funds;

  const result = missionSystem.repairVehicleCondition(vehicle.id, economySystem);

  assert.ok(result.success, 'repair succeeds when funds available');
  assert.equal(state.funds, fundsBefore - repairCost, 'repair deducts the configured cost');

  const expectedCondition = Math.min(1, 0.35 + repairBoost);
  assert.equal(
    vehicle.condition,
    expectedCondition,
    'vehicle condition increases and clamps at the maximum',
  );
  assert.equal(result.conditionAfter, expectedCondition, 'result reports the updated condition');
  assert.ok(result.conditionDelta > 0, 'result includes a positive delta');
  assert.equal(result.heatAfter, vehicle.heat, 'repairs do not modify vehicle heat');

  assert.ok(state.lastVehicleReport, 'maintenance creates a vehicle report');
  assert.equal(state.lastVehicleReport.maintenanceType, 'repair', 'report tracks repair type');
});

test('Garage maintenance heat purges reduce heat and clamp at zero', (t) => {
  const state = createState();
  state.funds = 15_000;
  const vehicle = new Vehicle({ model: 'Courier' });
  vehicle.condition = 0.9;
  vehicle.heat = 0.8;
  state.garage.push(vehicle);

  const heatSystem = new HeatSystem(state);
  const missionSystem = new MissionSystem(state, { heatSystem });
  const economySystem = new EconomySystem(state);

  const purgeCost = GARAGE_MAINTENANCE_CONFIG.heat.cost;
  const heatReduction = GARAGE_MAINTENANCE_CONFIG.heat.heatReduction;

  const result = missionSystem.reduceVehicleHeat(vehicle.id, economySystem);

  assert.ok(result.success, 'heat purge succeeds when funds available');
  assert.equal(state.funds, 15_000 - purgeCost, 'heat purge deducts the configured cost');

  const expectedHeat = Math.max(0, 0.8 - heatReduction);
  assert.equal(vehicle.heat, expectedHeat, 'vehicle heat is reduced and clamped');
  assert.equal(result.heatAfter, expectedHeat, 'result reports new heat value');
  assert.ok(result.heatDelta < 0, 'result delta reflects heat reduction');
  assert.equal(vehicle.condition, 0.9, 'heat purge does not alter condition');

  assert.ok(state.lastVehicleReport, 'maintenance updates last vehicle report');
  assert.equal(state.lastVehicleReport.maintenanceType, 'heat', 'report tracks heat purge');
});

test('Garage maintenance aborts when funds are insufficient', (t) => {
  const state = createState();
  state.funds = 500; // below either maintenance cost
  const vehicle = new Vehicle({ model: 'Runabout' });
  vehicle.condition = 0.2;
  vehicle.heat = 2.5;
  state.garage.push(vehicle);

  const missionSystem = new MissionSystem(state, { heatSystem: new HeatSystem(state) });
  const economySystem = new EconomySystem(state);

  const result = missionSystem.repairVehicleCondition(vehicle.id, economySystem);

  assert.ok(!result.success, 'repair fails when funds are insufficient');
  assert.equal(result.reason, 'insufficient-funds', 'failure reason flags missing funds');
  assert.equal(state.funds, 500, 'funds remain unchanged on failed maintenance');
  assert.equal(vehicle.condition, 0.2, 'vehicle condition does not change on failure');
  assert.equal(state.lastVehicleReport, undefined, 'no vehicle report is recorded on failure');
});

test('MissionSystem lifecycle from contract to resolution', (t) => {
  const state = createState();
  const missionSystem = new MissionSystem(state, { heatSystem: new HeatSystem(state) });

  missionSystem.generateInitialContracts();
  assert.ok(
    missionSystem.availableMissions.length > 0,
    'generates default missions when initialized',
  );

  const [firstMission, secondMission] = missionSystem.availableMissions;
  assert.ok(firstMission, 'default missions include a first contract');
  assert.ok(secondMission, 'default missions include a second contract');

  const originalDateNow = Date.now;
  const originalRandom = Math.random;
  t.after(() => {
    Date.now = originalDateNow;
    Math.random = originalRandom;
  });

  Date.now = () => 1_000_000;
  const startedMission = missionSystem.startMission(firstMission.id);
  assert.equal(startedMission, firstMission, 'startMission returns the mission instance');
  assert.equal(state.activeMission, firstMission, 'active mission is stored on the game state');
  assert.equal(firstMission.status, 'in-progress', 'mission status switches to in-progress');

  const blockedMission = missionSystem.startMission(secondMission.id);
  assert.equal(blockedMission, null, 'cannot start a second mission while one is active');

  const missionDuration = firstMission.duration;
  assert.ok(missionDuration > 0, 'mission has a positive duration');

  const fundsBeforeResolution = state.funds;
  const heatBeforeResolution = state.heat;
  const garageBeforeResolution = state.garage.length;

  Date.now = () => 1_200_000;
  Math.random = () => 0.1;

  missionSystem.update(missionDuration);
  resolvePendingDecisions(missionSystem, firstMission);
  missionSystem.update(0);
  assert.equal(firstMission.status, 'completed', 'mission automatically resolves once complete');
  assert.equal(firstMission.outcome, 'success', 'mission outcome is determined by the success roll');
  assert.equal(state.activeMission, null, 'active mission clears from the game state after auto resolution');
  assert.equal(firstMission.progress, 1, 'mission progress reaches 100% when duration elapses');
  const settledDebtTotal = Array.isArray(firstMission.debtSettlements)
    ? firstMission.debtSettlements.reduce(
        (total, entry) => total + (Number.isFinite(entry?.amount) ? entry.amount : 0),
        0,
      )
    : 0;
  assert.equal(
    state.funds,
    fundsBeforeResolution + firstMission.payout - settledDebtTotal,
    'successful missions pay out funds after clearing pending debts',
  );
  assert.equal(
    state.heat,
    Math.min(10, heatBeforeResolution + firstMission.heat),
    'mission heat is applied through the heat system on success',
  );
  assert.equal(
    state.garage.length,
    garageBeforeResolution + 1,
    'successful missions add the reward vehicle to the garage',
  );

  assert.ok(state.missionLog.length > 0, 'mission telemetry is recorded after resolution');
  const latestLogEntry = state.missionLog[0];
  assert.equal(latestLogEntry.missionId, firstMission.id, 'mission log references the resolved contract');
  assert.equal(latestLogEntry.outcome, 'success', 'mission log records the outcome');
  assert.equal(latestLogEntry.automatic, true, 'mission log flags automatic resolution');
  assert.match(latestLogEntry.summary, /rolled/i, 'mission log summary references the success roll');

  const refreshedMission = missionSystem.availableMissions.find(
    (mission) => mission.id === firstMission.id,
  );
  assert.ok(refreshedMission, 'mission template respawns after successful resolution');
  assert.notEqual(
    refreshedMission,
    firstMission,
    'respawned mission is a new instance separate from the completed contract',
  );
  assert.equal(refreshedMission.status, 'available', 'respawned mission is immediately available');
  assert.equal(refreshedMission.progress, 0, 'respawned mission resets progress');
  assert.equal(refreshedMission.elapsedTime, 0, 'respawned mission resets elapsed time');
  assert.equal(refreshedMission.startedAt, null, 'respawned mission clears start timestamp');
  assert.equal(refreshedMission.completedAt, null, 'respawned mission clears completion timestamp');
  assert.equal(refreshedMission.outcome, null, 'respawned mission clears prior outcome');
});

test('mission event deck filters by risk tier and crackdown context', () => {
  const state = createState();
  const missionSystem = new MissionSystem(state, { heatSystem: new HeatSystem(state) });

  const template = {
    id: 'lockdown-deck-check',
    name: 'Lockdown Deck Check',
    difficulty: 5,
    payout: 18_000,
    heat: 2,
    duration: 45,
    riskTier: 'high',
    pointOfInterest: { id: 'south-impound', name: 'South Impound', type: 'impound-lot' },
  };

  const mission = missionSystem.createMissionFromTemplate(template);
  assert.ok(mission, 'mission template is converted into a mission instance');

  mission.crackdownTier = 'lockdown';

  missionSystem.initializeMissionEvents(mission);
  const deck = mission.eventDeck;

  assert.ok(deck.length > 0, 'event deck generates entries for high-risk missions');
  assert.ok(deck.length <= 5, 'high difficulty missions cap the deck to five entries');

  assert.ok(
    deck.every((event) => !event.riskTiers || event.riskTiers.includes('high')),
    'deck excludes events that do not support the mission risk tier',
  );

  assert.ok(
    deck.some((event) => Array.isArray(event.crackdownTiers) && event.crackdownTiers.includes('lockdown')),
    'deck includes lockdown-aware events when crackdown tier is lockdown',
  );

  const poiEvent = deck.find((event) => event.poiContext?.id === template.pointOfInterest.id);
  assert.ok(poiEvent, 'point-of-interest specific event is present in the deck');
  assert.ok(
    (poiEvent.selectionWeight ?? 0) > poiEvent.baseWeight,
    'point-of-interest event weight scales under lockdown crackdown pressure',
  );

  for (let index = 1; index < deck.length; index += 1) {
    assert.ok(
      deck[index].triggerProgress >= deck[index - 1].triggerProgress,
      'deck preserves trigger order after weighting',
    );
  }

  assert.ok(
    !deck.some((event) => event.id === 'street-intel'),
    'low-risk street intel events are omitted from high-risk missions',
  );
});

test('mission event deck favors low-risk events for easier contracts', () => {
  const state = createState();
  const missionSystem = new MissionSystem(state, { heatSystem: new HeatSystem(state) });

  const template = {
    id: 'low-risk-deck-check',
    name: 'Low Risk Deck Check',
    difficulty: 1,
    payout: 6_000,
    heat: 1,
    duration: 28,
    riskTier: 'low',
    pointOfInterest: { id: 'inner-market', name: 'Inner Market', type: 'smuggling-cache' },
  };

  const mission = missionSystem.createMissionFromTemplate(template);
  assert.ok(mission, 'low risk template converts to mission instance');

  mission.crackdownTier = 'calm';

  missionSystem.initializeMissionEvents(mission);
  const deck = mission.eventDeck;

  assert.ok(deck.length > 0, 'deck contains entries for low-risk missions');
  assert.ok(deck.length <= 3, 'low difficulty missions restrict the deck to three entries');

  assert.ok(
    deck.some((event) => event.id === 'street-intel' || event.id === 'black-market-favor'),
    'low-risk tuned events appear in the deck',
  );

  assert.ok(!deck.some((event) => event.id === 'armored-response'), 'high-risk events are filtered out');

  const weightedEntry = deck.find((event) => event.id === 'street-intel');
  if (weightedEntry) {
    assert.ok(weightedEntry.selectionWeight > 1, 'low-risk event gains weight for matching context');
  }
});

test('mission event deck surfaces low-risk lockdown responses', () => {
  const state = createState();
  const missionSystem = new MissionSystem(state, { heatSystem: new HeatSystem(state) });

  const template = {
    id: 'lockdown-low-risk',
    name: 'Lockdown Low-Risk Probe',
    difficulty: 2,
    payout: 9_000,
    heat: 1,
    duration: 32,
    riskTier: 'low',
  };

  const mission = missionSystem.createMissionFromTemplate(template);
  mission.crackdownTier = 'lockdown';

  missionSystem.initializeMissionEvents(mission);
  const deck = mission.eventDeck;

  assert.ok(
    deck.some((event) => event.id === 'lockdown-hush-route'),
    'lockdown hush route event appears for low-risk lockdown missions',
  );
});

test('safehouse facilities unlock perk-driven mission events', () => {
  const facilitySafehouse = new Safehouse({
    id: 'facility-safehouse',
    owned: true,
    tierIndex: 0,
    tiers: [
      {
        level: 0,
        storageCapacity: 4,
        heatReduction: 0.2,
        amenities: [
          { id: 'dead-drop-network', status: 'active' },
          { id: 'workshop-bays', status: 'active' },
        ],
      },
    ],
  });

  const stateWithFacility = createState();
  stateWithFacility.safehouses = new SafehouseCollection([facilitySafehouse]);
  stateWithFacility.player = { safehouseId: facilitySafehouse.id };
  const missionSystemWithFacility = new MissionSystem(stateWithFacility, {
    heatSystem: new HeatSystem(stateWithFacility),
  });

  const template = {
    id: 'safehouse-event-check',
    name: 'Safehouse Event Check',
    difficulty: 2,
    payout: 10_000,
    heat: 1,
    duration: 30,
    riskTier: 'moderate',
  };

  const missionWithFacility = missionSystemWithFacility.createMissionFromTemplate({ ...template });
  missionWithFacility.crackdownTier = 'alert';
  missionSystemWithFacility.initializeMissionEvents(missionWithFacility, { safehouse: facilitySafehouse });
  const deckWithFacility = missionWithFacility.eventDeck;

  assert.ok(
    deckWithFacility.some((event) => event.id === 'safehouse-dead-drop'),
    'dead drop event appears when safehouse facility is active',
  );
  assert.ok(
    deckWithFacility.some((event) => event.id === 'safehouse-workshop-call'),
    'workshop call event appears when workshop bays are active',
  );

  const bareSafehouse = new Safehouse({
    id: 'bare-safehouse',
    owned: true,
    tierIndex: 0,
    tiers: [
      {
        level: 0,
        storageCapacity: 4,
        heatReduction: 0.1,
        amenities: [],
      },
    ],
  });

  const stateWithoutFacility = createState();
  stateWithoutFacility.safehouses = new SafehouseCollection([bareSafehouse]);
  stateWithoutFacility.player = { safehouseId: bareSafehouse.id };
  const missionSystemWithoutFacility = new MissionSystem(stateWithoutFacility, {
    heatSystem: new HeatSystem(stateWithoutFacility),
  });

  const missionWithoutFacility = missionSystemWithoutFacility.createMissionFromTemplate({ ...template, id: 'safehouse-event-check-2' });
  missionWithoutFacility.crackdownTier = 'alert';
  missionSystemWithoutFacility.initializeMissionEvents(missionWithoutFacility, { safehouse: bareSafehouse });
  const deckWithoutFacility = missionWithoutFacility.eventDeck;

  assert.ok(
    !deckWithoutFacility.some((event) => event.id === 'safehouse-dead-drop'),
    'dead drop event is gated when facility is unavailable',
  );
  assert.ok(
    !deckWithoutFacility.some((event) => event.id === 'safehouse-workshop-call'),
    'workshop tune-up event is gated when facility is unavailable',
  );
});

test('crew specialty hooks unlock matching mission events', () => {
  const hacker = new CrewMember({
    id: 'crew-hacker',
    name: 'Cipher',
    specialty: 'hacker',
    traits: { stealth: 3, tech: 5, driving: 1, tactics: 2, charisma: 1, muscle: 1 },
  });

  const stateWithHacker = createState();
  stateWithHacker.crew = [hacker];
  const missionSystemWithHacker = new MissionSystem(stateWithHacker, {
    heatSystem: new HeatSystem(stateWithHacker),
  });

  const template = {
    id: 'crew-specialty-check',
    name: 'Crew Specialty Check',
    difficulty: 3,
    payout: 12_000,
    heat: 2,
    duration: 36,
    riskTier: 'moderate',
  };

  const missionWithHacker = missionSystemWithHacker.createMissionFromTemplate({ ...template });
  missionWithHacker.crackdownTier = 'alert';
  missionWithHacker.assignedCrewIds = [hacker.id];
  missionSystemWithHacker.initializeMissionEvents(missionWithHacker, { assignedCrew: [hacker] });
  const deckWithHacker = missionWithHacker.eventDeck;

  assert.ok(
    deckWithHacker.some((event) => event.id === 'crew-hacker-pivot'),
    'hacker pivot event appears when a hacker is assigned',
  );

  const stateWithoutSpecialist = createState();
  const missionSystemWithoutSpecialist = new MissionSystem(stateWithoutSpecialist, {
    heatSystem: new HeatSystem(stateWithoutSpecialist),
  });

  const missionWithoutSpecialist = missionSystemWithoutSpecialist.createMissionFromTemplate({
    ...template,
    id: 'crew-specialty-check-2',
  });
  missionWithoutSpecialist.crackdownTier = 'alert';
  missionSystemWithoutSpecialist.initializeMissionEvents(missionWithoutSpecialist, { assignedCrew: [] });
  const deckWithoutSpecialist = missionWithoutSpecialist.eventDeck;

  assert.ok(
    !deckWithoutSpecialist.some((event) => event.id === 'crew-hacker-pivot'),
    'hacker pivot event stays hidden without matching crew',
  );
});

test('future debt event effects deduct from next successful mission payout', (t) => {
  const state = createState();
  const heatSystem = new HeatSystem(state);
  const missionSystem = new MissionSystem(state, { heatSystem });

  const template = {
    id: 'future-debt-check',
    name: 'Future Debt Check',
    difficulty: 1,
    payout: 5000,
    heat: 1,
    duration: 20,
  };

  const mission = missionSystem.createMissionFromTemplate(template);
  missionSystem.availableMissions = [mission];
  mission.status = 'decision-required';
  mission.progress = 0.25;
  mission.eventDeck = [
    {
      id: 'favor-marker',
      label: 'Favor Marker',
      triggerProgress: 0,
      resolved: false,
      choices: [
        {
          id: 'take-debt',
          label: 'Take on the marker',
          description: 'Promise a favor to pull in backup later.',
          effects: {
            futureDebt: {
              amount: 2000,
            },
          },
        },
      ],
    },
  ];

  mission.pendingDecision = {
    eventId: 'favor-marker',
    label: 'Favor Marker',
    description: 'A fixer offers emergency support — with strings attached.',
    triggerProgress: 0,
    triggeredAt: 111_111,
    poiContext: null,
    choices: mission.eventDeck[0].choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      description: choice.description,
      narrative: choice.narrative ?? null,
      effects: { ...choice.effects },
    })),
  };

  state.activeMission = mission;

  const originalNow = Date.now;
  Date.now = () => 222_222;
  t.after(() => {
    Date.now = originalNow;
  });

  const resolution = missionSystem.chooseMissionEventOption('favor-marker', 'take-debt');
  assert.ok(resolution, 'future debt choice resolves successfully');

  assert.equal(state.pendingDebts.length, 1, 'future debt queues a pending debt');
  const pendingDebt = state.pendingDebts[0];
  assert.equal(pendingDebt.amount, 2000, 'debt stores the original amount');
  assert.equal(pendingDebt.remaining, 2000, 'debt tracks the remaining balance');
  assert.equal(pendingDebt.sourceEventId, 'favor-marker', 'debt records the source event id');
  assert.equal(pendingDebt.sourceChoiceId, 'take-debt', 'debt records the source choice id');

  mission.status = 'awaiting-resolution';
  mission.progress = 1;
  mission.elapsedTime = mission.duration;

  const fundsBefore = state.funds;
  const resolvedMission = missionSystem.resolveMission(mission.id, 'success');
  assert.ok(resolvedMission, 'mission resolves successfully after debt is applied');

  assert.equal(state.pendingDebts.length, 0, 'paid debts are removed from the queue');
  assert.equal(
    state.funds,
    fundsBefore + (template.payout - 2000),
    'mission payout applies after deducting the pending debt',
  );

  const lastLog = state.missionLog[state.missionLog.length - 1];
  assert.ok(lastLog, 'mission log entry is recorded');
  assert.ok(
    lastLog.summary.includes('Debts settled'),
    'mission summary references the debt settlement for player feedback',
  );
  assert.ok(Array.isArray(lastLog.debtSettlements), 'mission log captures debt settlement details');
  assert.equal(lastLog.debtSettlements[0].amount, 2000, 'log reflects settled debt amount');
  assert.ok(lastLog.debtSettlements[0].fullySettled, 'log marks the debt as cleared');
});

test('crew fatigue blocks overwork and recovers on daily ticks', (t) => {
  const state = createState();
  const crewMember = new CrewMember({ name: 'Riley Gauge', specialty: 'hacker' });
  state.crew = [crewMember];

  const heatSystem = new HeatSystem(state);
  const missionSystem = new MissionSystem(state, { heatSystem });
  missionSystem.generateInitialContracts();
  const mission = missionSystem.availableMissions[0];
  mission.duration = 12;
  mission.baseDuration = 12;
  mission.difficulty = 5;

  const missionId = mission.id;
  const started = missionSystem.startMission(missionId, [crewMember.id]);
  assert.ok(started, 'mission can start with a rested crew member');

  const originalDateNow = Date.now;
  const originalRandom = Math.random;
  t.after(() => {
    Date.now = originalDateNow;
    Math.random = originalRandom;
  });

  Date.now = () => 1_000_000;
  Math.random = () => 0.1;

  missionSystem.update(mission.duration);
  resolvePendingDecisions(missionSystem, mission);
  missionSystem.update(0);

  assert.ok(crewMember.getFatigueLevel() > 0, 'mission completion applies fatigue to crew');

  if (crewMember.getFatigueLevel() < CREW_FATIGUE_CONFIG.exhaustionThreshold) {
    crewMember.applyMissionFatigue(
      CREW_FATIGUE_CONFIG.exhaustionThreshold - crewMember.getFatigueLevel(),
    );
  }
  crewMember.setStatus('needs-rest');

  const alternateMission = missionSystem.availableMissions.find((entry) => entry.id !== missionId)
    ?? missionSystem.availableMissions[0];
  const blocked = missionSystem.startMission(alternateMission.id, [crewMember.id]);
  assert.equal(blocked, null, 'exhausted crew cannot be assigned to a mission');
  assert.equal(crewMember.status, 'needs-rest', 'crew status reflects required rest');

  const economySystem = new EconomySystem(state);
  crewMember.fatigue = CREW_FATIGUE_CONFIG.exhaustionThreshold;
  crewMember.setStatus('needs-rest');
  economySystem.update(economySystem.dayLengthSeconds);

  assert.ok(
    crewMember.getFatigueLevel() < CREW_FATIGUE_CONFIG.exhaustionThreshold,
    'daily economy tick reduces fatigue levels',
  );
  assert.equal(crewMember.status, 'idle', 'restored crew become available after recovering');
});

test('Successful missions block reward vehicles when garage capacity is full', (t) => {
  const state = createState();
  const safehouse = new Safehouse({
    id: 'capacity-safehouse',
    owned: true,
    tiers: [
      {
        level: 0,
        storageCapacity: 1,
        passiveIncome: 0,
        heatReduction: 0,
        overheadModifier: 0,
        upgradeCost: 0,
      },
    ],
  });
  const safehouses = new SafehouseCollection([safehouse]);
  safehouses.setDefault(safehouse.id);
  state.safehouses = safehouses;
  state.player = {
    safehouseId: safehouse.id,
    assignSafehouse(id) {
      this.safehouseId = id;
    },
  };

  const missionSystem = new MissionSystem(state, { heatSystem: new HeatSystem(state) });
  missionSystem.generateInitialContracts();
  const mission = missionSystem.availableMissions[0];
  assert.ok(mission, 'a mission is available to run');

  const storedVehicle = new Vehicle({ model: 'Stored Ride' });
  state.garage.push(storedVehicle);
  assert.equal(state.garage.length, 1, 'garage starts at the storage limit');

  missionSystem.startMission(mission.id);
  mission.status = 'awaiting-resolution';

  const fundsBefore = state.funds;
  const garageBefore = state.garage.length;

  const resolvedMission = missionSystem.resolveMission(mission.id, 'success');

  assert.equal(resolvedMission, mission, 'resolveMission returns the mission instance');
  assert.equal(state.funds, fundsBefore + mission.payout, 'funds still increase on success');
  assert.equal(state.garage.length, garageBefore, 'reward vehicle is blocked when capacity is full');
  assert.ok(state.lastVehicleReport, 'blocking the reward generates a vehicle report');
  assert.equal(state.lastVehicleReport.outcome, 'storage-blocked', 'report flags the storage block outcome');
  assert.equal(state.lastVehicleReport.storageCapacity, 1, 'report records the storage capacity limit');
  assert.equal(
    state.lastVehicleReport.garageSize,
    garageBefore,
    'report records the current garage size when the block occurs',
  );
});

test('MissionSystem resolves failures from in-progress and awaiting-resolution states', async (t) => {
  await t.test('resolving failure while the mission is in-progress', async (t) => {
    const state = createState();
    const missionSystem = new MissionSystem(state, { heatSystem: new HeatSystem(state) });

    missionSystem.generateInitialContracts();
    const mission = missionSystem.availableMissions[0];

    const originalDateNow = Date.now;
    const originalRandom = Math.random;
    t.after(() => {
      Date.now = originalDateNow;
      Math.random = originalRandom;
    });

    Date.now = () => 500_000;
    missionSystem.startMission(mission.id);

    const fundsBefore = state.funds;
    const heatBefore = state.heat;

    const resolvedMission = missionSystem.resolveMission(mission.id, 'failure');

    assert.equal(resolvedMission, mission, 'resolveMission returns the mission instance on failure');
    assert.equal(resolvedMission.status, 'completed', 'mission transitions to completed on failure');
    assert.equal(resolvedMission.outcome, 'failure', 'mission outcome is recorded as failure');
    assert.equal(state.activeMission, null, 'active mission clears after a failure resolution');
    assert.equal(state.funds, fundsBefore, 'failure does not change funds');
    assert.equal(
      state.heat,
      Math.min(10, heatBefore + mission.heat * 2),
      'failure increases heat by twice the mission heat value',
    );

    const refreshedMission = missionSystem.availableMissions.find(
      (entry) => entry.id === mission.id,
    );
    assert.ok(refreshedMission, 'mission template respawns after failure resolution');
    assert.notEqual(
      refreshedMission,
      mission,
      'respawned mission is a new instance separate from the failed contract',
    );
    assert.equal(
      refreshedMission.status,
      'available',
      'respawned mission becomes available again after failure',
    );
  });

  await t.test('automatically resolves failure when success roll misses', async (t) => {
    const state = createState();
    const missionSystem = new MissionSystem(state, { heatSystem: new HeatSystem(state) });

    missionSystem.generateInitialContracts();
    const mission = missionSystem.availableMissions[0];

    const originalDateNow = Date.now;
    t.after(() => {
      Date.now = originalDateNow;
    });

    Date.now = () => 750_000;
    missionSystem.startMission(mission.id);

    const fundsBefore = state.funds;
    const heatBefore = state.heat;

    Date.now = () => 800_000;
    Math.random = () => 0.99;

    missionSystem.update(mission.duration);
    resolvePendingDecisions(missionSystem, mission);
    missionSystem.update(0);

    assert.equal(mission.status, 'completed', 'mission automatically resolves to completed on failure');
    assert.equal(mission.outcome, 'failure', 'mission outcome is recorded as failure');
    assert.equal(state.activeMission, null, 'active mission clears after automatic failure');
    assert.equal(state.funds, fundsBefore, 'failure does not change funds');
    assert.equal(
      state.heat,
      Math.min(10, heatBefore + mission.heat * 2),
      'failure increases heat by twice the mission heat value',
    );

    assert.ok(state.missionLog.length > 0, 'mission log captures automatic failure');
    const latestLogEntry = state.missionLog[0];
    assert.equal(latestLogEntry.outcome, 'failure', 'mission log records the failed outcome');
    assert.equal(latestLogEntry.automatic, true, 'mission log notes automatic resolution');
    assert.match(latestLogEntry.summary, /rolled/i, 'mission log summary references the failure roll');

    const refreshedMission = missionSystem.availableMissions.find(
      (entry) => entry.id === mission.id,
    );
    assert.ok(refreshedMission, 'mission template respawns after failure resolution');
    assert.notEqual(
      refreshedMission,
      mission,
      'respawned mission is a new instance separate from the failed contract',
    );
    assert.equal(
      refreshedMission.status,
      'available',
      'respawned mission becomes available again after failure',
    );
  });
});

test('MissionSystem sanitizes invalid mission durations', () => {
  const state = createState();
  const missionSystem = new MissionSystem(state, {
    heatSystem: new HeatSystem(state),
    missionTemplates: [
      {
        id: 'bad-duration',
        name: 'Bad Duration',
        difficulty: 1,
        payout: 5000,
        heat: 1,
        duration: 'fast',
      },
    ],
  });

  missionSystem.generateInitialContracts();
  const mission = missionSystem.availableMissions[0];

  assert.ok(mission, 'mission is generated from the template');
  assert.ok(Number.isFinite(mission.duration), 'mission duration is coerced to a finite number');
  assert.ok(mission.duration > 0, 'mission duration defaults to a positive fallback');
  assert.equal(
    mission.duration,
    Math.max(mission.difficulty * 20, 20),
    'mission duration falls back to difficulty-based default when invalid',
  );

  missionSystem.startMission(mission.id);
  missionSystem.update(mission.duration * 2);
  resolvePendingDecisions(missionSystem, mission);
  missionSystem.update(0);

  assert.equal(
    mission.status,
    'completed',
    'mission resolves automatically even when template duration is invalid',
  );
  assert.equal(mission.progress, 1, 'mission progress caps at completion');
  assert.ok(Number.isFinite(mission.progress), 'mission progress remains finite after update');
});

test('MissionSystem draws from the contract pool when available', () => {
  const state = createState();
  const extraContract = {
    id: 'midnight-sting',
    name: 'Midnight Sting',
    difficulty: 2,
    payout: 12000,
    heat: 2,
    duration: 35,
    description: 'Set an ambush for a rare hypercar on its transport route.',
  };

  const missionSystem = new MissionSystem(state, {
    heatSystem: new HeatSystem(state),
    contractPool: [extraContract],
  });

  missionSystem.generateInitialContracts();
  const [mission] = missionSystem.availableMissions;

  const originalDateNow = Date.now;
  Date.now = () => 250_000;

  try {
    missionSystem.startMission(mission.id);
    missionSystem.resolveMission(mission.id, 'failure');
  } finally {
    Date.now = originalDateNow;
  }

  const appendedMission = missionSystem.availableMissions.find(
    (entry) => entry.id === extraContract.id,
  );

  assert.ok(appendedMission, 'new contract is appended from the pool after resolution');
  assert.equal(appendedMission.status, 'available', 'contract drawn from the pool is available to start');
  assert.equal(appendedMission.progress, 0, 'contract drawn from the pool starts with zero progress');
});

test('MissionSystem sanitizes numeric rewards for templates missing payout or heat', () => {
  const state = createState();
  const missionSystem = new MissionSystem(state, { heatSystem: new HeatSystem(state) });

  const minimalTemplate = {
    id: 'mystery-contract',
    name: 'Mystery Contract',
    difficulty: 1,
  };

  missionSystem.registerTemplate(minimalTemplate);

  const createdMission = missionSystem.createMissionFromTemplate(minimalTemplate);
  assert.ok(createdMission, 'mission is created from a template missing payout and heat');
  missionSystem.availableMissions.push(createdMission);

  const originalRandom = Math.random;
  Math.random = () => 0.2;

  try {
    const fundsBefore = state.funds;
    const heatBefore = state.heat;

    const startedMission = missionSystem.startMission(createdMission.id);
    assert.equal(startedMission, createdMission, 'mission can be started after sanitizing values');

    missionSystem.update(createdMission.duration);
    resolvePendingDecisions(missionSystem, createdMission);
    missionSystem.update(0);
    assert.equal(
      createdMission.status,
      'completed',
      'mission resolves automatically after its duration elapses',
    );

    assert.equal(createdMission.outcome, 'success', 'sanitized mission resolves successfully');
    assert.equal(createdMission.payout, 0, 'missing payout defaults to 0');
    assert.equal(createdMission.heat, 0, 'missing heat defaults to 0');
    assert.ok(Number.isFinite(createdMission.payout), 'mission payout is coerced to a finite number');
    assert.doesNotThrow(() => {
      `${createdMission.name} — $${createdMission.payout.toLocaleString()} (available)`;
    }, 'UI formatting helpers can safely format sanitized mission payouts');

    assert.equal(state.funds, fundsBefore + createdMission.payout, 'funds remain numeric after resolution');
    assert.ok(Number.isFinite(state.funds), 'state funds stay a finite number after resolution');
    assert.equal(state.heat, heatBefore + createdMission.heat, 'heat increases by the sanitized mission heat');

    assert.ok(state.missionLog.length > 0, 'mission log captures sanitized mission outcome');
    const latestLogEntry = state.missionLog[0];
    assert.equal(latestLogEntry.outcome, 'success', 'mission log records the sanitized mission outcome');
    assert.equal(latestLogEntry.missionId, createdMission.id, 'mission log references the sanitized mission');
  } finally {
    Math.random = originalRandom;
  }
});

test('missions above the crackdown cap are restricted and reopen when heat cools', () => {
  const state = createState();
  state.heat = 3.4;
  const heatSystem = new HeatSystem(state);
  const missionSystem = new MissionSystem(state, { heatSystem });

  missionSystem.generateInitialContracts();

  const highHeatMission = missionSystem.availableMissions.find((mission) => mission.heat >= 3);
  assert.ok(highHeatMission, 'default missions include a high-heat contract for restriction testing');
  assert.equal(missionSystem.currentCrackdownTier, 'alert', 'alert crackdown triggered at elevated heat');
  assert.equal(highHeatMission.restricted, true, 'high heat mission is locked during alert crackdown');
  assert.ok(
    highHeatMission.restrictionReason?.toLowerCase().includes('alert'),
    'restriction reason references the active crackdown tier',
  );

  heatSystem.update(200);
  missionSystem.syncHeatTier();

  assert.equal(state.heatTier, 'calm', 'heat tier returns to calm after decay');
  assert.equal(highHeatMission.restricted, false, 'mission becomes available once crackdown lifts');
});

test('restricted missions cannot be started during a crackdown', () => {
  const state = createState();
  state.heat = 3.6;
  const heatSystem = new HeatSystem(state);
  const missionSystem = new MissionSystem(state, { heatSystem });

  missionSystem.generateInitialContracts();
  const restrictedMission = missionSystem.availableMissions.find((mission) => mission.heat > 2);
  assert.ok(restrictedMission?.restricted, 'mission is flagged as restricted under alert crackdown');

  const attemptStart = missionSystem.startMission(restrictedMission.id);
  assert.equal(attemptStart, null, 'restricted missions cannot be started');
});

test('calm-tier crackdown operations populate the contract list at calm heat', () => {
  const state = createState();
  state.heat = 0.2;
  const heatSystem = new HeatSystem(state);
  const missionSystem = new MissionSystem(state, { heatSystem });

  missionSystem.generateInitialContracts();

  const crackdownContracts = missionSystem.availableMissions.filter(
    (mission) => mission.category === 'crackdown-operation',
  );

  assert.ok(crackdownContracts.length > 0, 'calm crackdown operations are available at calm tier');
  assert.ok(
    crackdownContracts.some((mission) => mission.crackdownTier === 'calm'),
    'calm crackdown operations carry the calm tier tag',
  );
  assert.ok(
    crackdownContracts.every((mission) => !mission.restricted),
    'calm crackdown operations are not auto-restricted',
  );
});

test('failure heat penalty scales with the crackdown tier', (t) => {
  const state = createState();
  state.heat = 7.2;
  const heatSystem = new HeatSystem(state);
  const missionSystem = new MissionSystem(state, { heatSystem });

  missionSystem.generateInitialContracts();

  const mission = missionSystem.availableMissions.find((entry) => entry.heat === 1);
  assert.ok(mission, 'a low-heat mission is available even during lockdown');
  assert.equal(mission.restricted, false, 'low-heat mission stays available during lockdown');

  const originalDateNow = Date.now;
  t.after(() => {
    Date.now = originalDateNow;
  });

  Date.now = () => 900_000;
  missionSystem.startMission(mission.id);

  const heatBefore = state.heat;
  missionSystem.resolveMission(mission.id, 'failure');

  const expectedHeat = Math.min(10, heatBefore + mission.heat * 4);
  assert.equal(state.heat, expectedHeat, 'lockdown crackdown applies the higher failure multiplier');
  assert.equal(
    missionSystem.currentCrackdownTier,
    'lockdown',
    'crackdown tier persists after mission resolution under high heat',
  );
});
