import test from 'node:test';
import assert from 'node:assert/strict';

import { MissionSystem } from '../src/game/carThief/systems/missionSystem.js';
import { HeatSystem } from '../src/game/carThief/systems/heatSystem.js';

const createState = () => ({
  funds: 1000,
  heat: 0,
  garage: [],
  activeMission: null,
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
  });
});
