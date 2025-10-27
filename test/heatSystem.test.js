import test from 'node:test';
import assert from 'node:assert/strict';

import { HeatSystem } from '../src/game/carThief/systems/heatSystem.js';

test('increase clamps heat to a maximum of 10', () => {
  const state = { heat: 8 };
  const system = new HeatSystem(state);

  system.increase(1);
  assert.equal(state.heat, 9, 'heat increases normally when below the cap');

  system.increase(10);
  assert.equal(state.heat, 10, 'heat is clamped to 10 even when increases exceed the cap');

  system.increase(1);
  assert.equal(state.heat, 10, 'further increases do not push heat past the maximum');
});

test('update decays heat toward zero without overshooting', () => {
  const state = { heat: 5 };
  const system = new HeatSystem(state);

  system.update(10);
  assert.equal(state.heat, 4.5, 'heat decays by decayRate * delta');

  system.update(200);
  assert.equal(state.heat, 0, 'heat does not go below zero even after large decay steps');
});

test('update is a no-op when heat is already zero', () => {
  const state = { heat: 0 };
  const system = new HeatSystem(state);

  system.update(5);
  assert.equal(state.heat, 0, 'heat remains zero when update returns early');
});
