import test from 'node:test';
import assert from 'node:assert/strict';

import { MissionSystem } from '../src/game/carThief/systems/missionSystem.js';
import { HeatSystem } from '../src/game/carThief/systems/heatSystem.js';

const createState = () => ({
  funds: 1000,
  heat: 0,
  garage: [],
  activeMission: null,
  heatTier: 'calm',
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
  t.after(() => {
    Date.now = originalDateNow;
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

  missionSystem.update(missionDuration);
  assert.equal(firstMission.status, 'awaiting-resolution', 'mission waits for an outcome when complete');
  assert.equal(firstMission.progress, 1, 'mission progress reaches 100% when duration elapses');

  const fundsBeforeResolution = state.funds;
  const heatBeforeResolution = state.heat;
  const garageBeforeResolution = state.garage.length;

  Date.now = () => 1_200_000;
  const resolvedMission = missionSystem.resolveMission(firstMission.id, 'success');
  assert.equal(resolvedMission, firstMission, 'resolveMission returns the mission instance');
  assert.equal(firstMission.status, 'completed', 'mission status becomes completed after resolution');
  assert.equal(state.activeMission, null, 'active mission clears from the game state');
  assert.equal(
    state.funds,
    fundsBeforeResolution + firstMission.payout,
    'successful missions pay out funds',
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

test('MissionSystem resolves failures from in-progress and awaiting-resolution states', async (t) => {
  await t.test('resolving failure while the mission is in-progress', async (t) => {
    const state = createState();
    const missionSystem = new MissionSystem(state, { heatSystem: new HeatSystem(state) });

    missionSystem.generateInitialContracts();
    const mission = missionSystem.availableMissions[0];

    const originalDateNow = Date.now;
    t.after(() => {
      Date.now = originalDateNow;
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

  await t.test('resolving failure after mission awaits resolution', async (t) => {
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

    missionSystem.update(mission.duration);
    assert.equal(
      mission.status,
      'awaiting-resolution',
      'mission transitions to awaiting-resolution after the duration elapses',
    );

    Date.now = () => 800_000;
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

  assert.equal(
    mission.status,
    'awaiting-resolution',
    'mission reaches awaiting-resolution even when template duration is invalid',
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

  const fundsBefore = state.funds;
  const heatBefore = state.heat;

  const startedMission = missionSystem.startMission(createdMission.id);
  assert.equal(startedMission, createdMission, 'mission can be started after sanitizing values');

  missionSystem.update(createdMission.duration);
  assert.equal(
    createdMission.status,
    'awaiting-resolution',
    'mission transitions to awaiting-resolution after its duration elapses',
  );

  assert.equal(createdMission.payout, 0, 'missing payout defaults to 0');
  assert.equal(createdMission.heat, 0, 'missing heat defaults to 0');
  assert.ok(Number.isFinite(createdMission.payout), 'mission payout is coerced to a finite number');
  assert.doesNotThrow(() => {
    `${createdMission.name} — $${createdMission.payout.toLocaleString()} (available)`;
  }, 'UI formatting helpers can safely format sanitized mission payouts');

  const resolvedMission = missionSystem.resolveMission(createdMission.id, 'success');
  assert.equal(resolvedMission, createdMission, 'mission resolves successfully after sanitization');
  assert.equal(state.funds, fundsBefore + createdMission.payout, 'funds remain numeric after resolution');
  assert.ok(Number.isFinite(state.funds), 'state funds stay a finite number after resolution');
  assert.equal(state.heat, heatBefore + createdMission.heat, 'heat increases by the sanitized mission heat');
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
