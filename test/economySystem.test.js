import test from 'node:test';
import assert from 'node:assert/strict';

import { EconomySystem } from '../src/game/carThief/systems/economySystem.js';

test('EconomySystem normalizes state and advances days', () => {
  const state = {
    funds: 1500,
  };

  const system = new EconomySystem(state);

  assert.deepEqual(state.crew, [], 'crew defaults to an empty array');
  assert.equal(state.day, 1, 'day defaults to the first day of operations');

  assert.doesNotThrow(() => {
    system.update(system.dayLengthSeconds);
  }, 'update processes elapsed time without throwing');

  assert.equal(state.day, 2, 'day advances after one full day elapses');
  assert.equal(
    state.funds,
    1000,
    'daily expenses are deducted when a day passes and no crew upkeep is due',
  );
});
