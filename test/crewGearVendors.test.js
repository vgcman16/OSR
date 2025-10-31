import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialCrewGearVendorState,
  sanitizeCrewGearVendorState,
  getCrewGearVendorOptions,
  purchaseCrewGearFromVendor,
} from '../src/game/carThief/systems/crewGearVendors.js';

const findOption = (options, gearId) => options.find((option) => option.gearId === gearId);

test('Crew gear vendor requirements gate inventory until fulfilled', () => {
  const state = {
    day: 1,
    city: { districts: [] },
    reconAssignments: [],
  };

  let options = getCrewGearVendorOptions(state);

  let relayDrone = findOption(options, 'relay-drone');
  assert.ok(relayDrone, 'relay drone option is defined');
  assert.equal(relayDrone.locked, true, 'day requirement locks relay drone on day 1');

  state.day = 2;
  options = getCrewGearVendorOptions(state);
  relayDrone = findOption(options, 'relay-drone');
  assert.equal(relayDrone.locked, false, 'relay drone unlocks once minimum day is reached');

  state.day = 5;
  state.city.districts = [
    { id: 'old-town', name: 'Old Town', intelLevel: 55 },
  ];
  options = getCrewGearVendorOptions(state);
  let signalForger = findOption(options, 'signal-forger-kit');
  assert.ok(signalForger, 'signal forger option is defined');
  assert.equal(signalForger.locked, true, 'intel requirement blocks purchase below threshold');

  state.city.districts[0].intelLevel = 60;
  options = getCrewGearVendorOptions(state);
  signalForger = findOption(options, 'signal-forger-kit');
  assert.equal(signalForger.locked, false, 'signal forger unlocks once intel threshold met');

  state.day = 6;
  state.city.districts = [
    {
      id: 'downtown',
      name: 'Downtown',
      intelLevel: 70,
      campaign: {
        milestones: [
          { id: 'downtown-campaign-stage-2', name: 'Stage 2', status: 'in-progress' },
        ],
        completedMilestones: [],
      },
    },
  ];
  options = getCrewGearVendorOptions(state);
  let holoDecoy = findOption(options, 'holo-decoy-projector');
  assert.ok(holoDecoy, 'holo decoy option is defined');
  assert.equal(holoDecoy.locked, true, 'milestone requirement blocks item when incomplete');

  state.city.districts[0].campaign.milestones[0].status = 'completed';
  options = getCrewGearVendorOptions(state);
  holoDecoy = findOption(options, 'holo-decoy-projector');
  assert.equal(holoDecoy.locked, false, 'milestone completion unlocks the gear');

  state.day = 3;
  state.reconAssignments = [];
  options = getCrewGearVendorOptions(state);
  let signalDisruptor = findOption(options, 'signal-disruptor');
  assert.ok(signalDisruptor, 'signal disruptor option is defined');
  assert.equal(signalDisruptor.locked, true, 'recon requirement blocks until a successful op exists');

  state.reconAssignments = [
    { id: 'recon-1', status: 'completed', result: { success: true } },
  ];
  options = getCrewGearVendorOptions(state);
  signalDisruptor = findOption(options, 'signal-disruptor');
  assert.equal(signalDisruptor.locked, false, 'successful recon unlocks the disruptor');
});

test('purchaseCrewGearFromVendor tracks inventory, restock, and telemetry', (t) => {
  const state = { day: 4 };
  state.crewGearVendors = createInitialCrewGearVendorState({ day: state.day });

  const gearId = 'relay-drone';
  const entry = state.crewGearVendors.stockById[gearId];
  entry.quantity = 1;
  entry.lastRestockedDay = state.day;
  entry.nextRestockDay = state.day;

  const originalNow = Date.now;
  Date.now = () => 4242;
  t.after(() => {
    Date.now = originalNow;
  });

  const result = purchaseCrewGearFromVendor(state, gearId);

  assert.ok(result.success, 'purchase succeeds when requirements met and stock available');
  assert.equal(result.remaining, 0, 'telemetry reports zero remaining when last item sold');
  assert.equal(result.nextRestockDay, state.day + entry.restockIntervalDays, 'telemetry includes the scheduled restock day');
  assert.equal(result.restockIntervalDays, entry.restockIntervalDays, 'restock interval is returned');
  assert.ok(Array.isArray(result.requirements), 'telemetry includes evaluated requirements');

  const updatedEntry = state.crewGearVendors.stockById[gearId];
  assert.equal(updatedEntry.quantity, 0, 'stock decrements when purchased');
  assert.equal(
    updatedEntry.nextRestockDay,
    state.day + entry.restockIntervalDays,
    'restock day reschedules when stock hits zero',
  );
  assert.equal(state.crewGearVendors.lastTransactionAt, 4242, 'vendor state records transaction timestamp');
});

test('sanitizeCrewGearVendorState clamps malformed persisted data', () => {
  const malformed = {
    vendorId: null,
    stockById: {
      'thermal-shroud': {
        quantity: -5,
        restockIntervalDays: 0,
        nextRestockDay: -10,
        lastRestockedDay: -3,
      },
      'mystery-item': {
        quantity: 99,
        restockIntervalDays: 999,
        nextRestockDay: 999,
      },
    },
    lastEvaluatedDay: -12,
    lastTransactionAt: 111,
  };

  const sanitized = sanitizeCrewGearVendorState(malformed, { day: 10 });

  assert.equal(sanitized.version, 1, 'version resets to supported value');
  assert.equal(sanitized.vendorId, 'grey-market-quartermaster', 'vendor falls back to default id');
  assert.equal(sanitized.lastEvaluatedDay, 10, 'current day persists to last evaluated');
  assert.equal(sanitized.lastTransactionAt, 111, 'transaction timestamp is preserved when valid');

  const thermal = sanitized.stockById['thermal-shroud'];
  assert.ok(thermal, 'known gear blueprint is retained');
  assert.equal(thermal.quantity >= 0, true, 'quantity clamps to a non-negative value');
  assert.equal(thermal.quantity <= thermal.maxStock, true, 'quantity never exceeds the blueprint max');
  assert.equal(thermal.restockIntervalDays >= 1, true, 'restock interval clamps to minimum of one day');
  assert.equal(thermal.nextRestockDay, 10, 'next restock day does not precede the current day');
  assert.equal(thermal.lastRestockedDay >= 1, true, 'last restocked day clamps to valid bounds');

  const relay = sanitized.stockById['relay-drone'];
  assert.ok(relay, 'missing blueprint entries are recreated');
  assert.equal(relay.quantity, relay.maxStock, 'recreated entries initialize with max stock');
});
