import test from 'node:test';
import assert from 'node:assert/strict';

import { HeatSystem } from '../src/game/carThief/systems/heatSystem.js';
import { MissionSystem } from '../src/game/carThief/systems/missionSystem.js';
import { EconomySystem } from '../src/game/carThief/systems/economySystem.js';
import { executeHeatMitigation } from '../src/game/carThief/systems/heatMitigationService.js';

const createState = () => ({
  funds: 20_000,
  heat: 4.5,
  crew: [],
  garage: [],
  missionLog: [],
});

test('executeHeatMitigation lowers heat, deducts funds, and reopens restricted missions', () => {
  const state = createState();
  const heatSystem = new HeatSystem(state);
  const missionSystem = new MissionSystem(state, { heatSystem });
  missionSystem.generateInitialContracts();
  const economySystem = new EconomySystem(state);

  const highHeatMission = missionSystem.availableMissions.find((mission) => mission.heat >= 3);
  assert.ok(highHeatMission, 'high-heat mission exists for crackdown testing');
  assert.equal(highHeatMission.restricted, true, 'mission starts restricted under alert crackdown');
  assert.equal(missionSystem.currentCrackdownTier, 'alert', 'alert crackdown active before mitigation');

  const result = executeHeatMitigation({
    heatSystem,
    missionSystem,
    economySystem,
    reduction: 3.2,
    cost: 4500,
    label: 'Lay Low',
    metadata: { action: 'layLow-test' },
  });

  assert.ok(result.success, 'mitigation succeeds when funds available');
  assert.equal(state.funds, 15_500, 'funds are reduced by mitigation cost');
  assert.equal(state.heat.toFixed(1), '1.3', 'heat drops by configured amount');
  assert.equal(missionSystem.currentCrackdownTier, 'calm', 'crackdown tier refreshes after mitigation');
  assert.equal(highHeatMission.restricted, false, 'previously locked mission reopens');
  assert.ok(Array.isArray(state.heatMitigationLog), 'mitigation log is created on state');
  assert.equal(state.heatMitigationLog[0].label, 'Lay Low', 'telemetry entry records mitigation label');
});

test('executeHeatMitigation aborts when funds are insufficient', () => {
  const state = createState();
  state.funds = 1_000;
  const heatSystem = new HeatSystem(state);
  const missionSystem = new MissionSystem(state, { heatSystem });
  missionSystem.generateInitialContracts();
  const economySystem = new EconomySystem(state);

  const result = executeHeatMitigation({
    heatSystem,
    missionSystem,
    economySystem,
    reduction: 4,
    cost: 4_500,
    label: 'Bribe Officials',
  });

  assert.ok(!result.success, 'mitigation fails when funds insufficient');
  assert.equal(result.reason, 'insufficient-funds', 'failure reason flags missing funds');
  assert.equal(state.funds, 1_000, 'funds remain unchanged on failure');
  assert.equal(state.heat, 4.5, 'heat is unaffected when mitigation fails');
  assert.equal(state.heatMitigationLog, undefined, 'no telemetry is recorded on failure');
});
