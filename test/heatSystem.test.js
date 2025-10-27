import test from 'node:test';
import assert from 'node:assert/strict';

import { HeatSystem } from '../src/game/carThief/systems/heatSystem.js';

test('increase clamps heat to a maximum of 10 and updates crackdown tier', () => {
  const state = { heat: 2.5 };
  const system = new HeatSystem(state);

  system.increase(1);
  assert.equal(state.heat, 3.5, 'heat increases normally when below the cap');
  assert.equal(state.heatTier, 'alert', 'heat tier elevates when alert threshold crossed');

  system.increase(10);
  assert.equal(state.heat, 10, 'heat is clamped to 10 even when increases exceed the cap');
  assert.equal(state.heatTier, 'lockdown', 'heat tier escalates to lockdown at max heat');

  system.increase(1);
  assert.equal(state.heat, 10, 'further increases do not push heat past the maximum');
});

test('update decays heat toward zero without overshooting', () => {
  const state = { heat: 5 };
  const system = new HeatSystem(state);

  system.update(10);
  assert.equal(state.heat, 4.5, 'heat decays by decayRate * delta');
  assert.equal(state.heatTier, 'alert', 'heat tier remains alert while above threshold');

  system.update(200);
  assert.equal(state.heat, 0, 'heat does not go below zero even after large decay steps');
  assert.equal(state.heatTier, 'calm', 'heat tier returns to calm when heat hits zero');
});

test('update is a no-op when heat is already zero', () => {
  const state = { heat: 0 };
  const system = new HeatSystem(state);

  system.update(5);
  assert.equal(state.heat, 0, 'heat remains zero when update returns early');
  assert.equal(state.heatTier, 'calm', 'tier remains calm when no heat is present');
});

test('initial heat tier reflects current heat value', () => {
  const state = { heat: 7.5 };
  const system = new HeatSystem(state);

  assert.equal(system.getCurrentTier(), 'lockdown', 'tier helper returns expected tier');
  assert.equal(state.heatTier, 'lockdown', 'state tier initialized based on starting heat');
});
