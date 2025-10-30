import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameSerializer } from '../src/game/carThief/index.js';

const createStubStorage = () => {
  const backing = new Map();
  return {
    getItem: (key) => (backing.has(key) ? backing.get(key) : null),
    setItem: (key, value) => {
      backing.set(key, typeof value === 'string' ? value : String(value));
    },
    removeItem: (key) => {
      backing.delete(key);
    },
  };
};

test('defaults to in-memory storage when no storage is provided', () => {
  const key = 'test:memory-default';
  const serializer = createGameSerializer({ key });

  assert.equal(serializer.load(), null, 'load returns null when nothing is stored');

  const payload = { meaning: 42 };
  assert.equal(serializer.save(payload), true, 'save succeeds using the in-memory fallback');

  const secondSerializer = createGameSerializer({ key });
  assert.deepEqual(
    secondSerializer.load(),
    payload,
    'subsequent serializers share the in-memory storage',
  );

  secondSerializer.clear();
  assert.equal(serializer.load(), null, 'clearing removes data from the in-memory storage');
});

test('save and load perform a successful round trip with provided storage', () => {
  const storage = createStubStorage();
  const key = 'test:roundtrip';
  const serializer = createGameSerializer({ storage, key });

  assert.equal(serializer.load(), null, 'no data exists before saving');

  const payload = {
    name: 'Wheelman',
    funds: 12345,
    completedMissions: ['heist-alpha', 'heist-beta'],
  };

  assert.equal(serializer.save(payload), true, 'save returns true when persistence succeeds');

  assert.deepEqual(
    serializer.load(),
    payload,
    'load returns a deep clone of the stored payload',
  );
});

test('clear removes persisted data from the provided storage', () => {
  const storage = createStubStorage();
  const key = 'test:clear';
  const serializer = createGameSerializer({ storage, key });

  serializer.save({ notoriety: 7 });
  assert.notEqual(storage.getItem(key), null, 'storage contains the saved value before clearing');

  serializer.clear();
  assert.equal(storage.getItem(key), null, 'underlying storage no longer contains the key after clear');
  assert.equal(serializer.load(), null, 'load returns null once the save has been cleared');
});

test('gracefully handles storage operations that throw errors', () => {
  const error = new Error('boom');
  const storage = {
    getItem: () => {
      throw error;
    },
    setItem: () => {
      throw error;
    },
    removeItem: () => {
      throw error;
    },
  };

  const serializer = createGameSerializer({ storage, key: 'test:error-handling' });

  assert.equal(
    serializer.save({ notoriety: 9 }),
    false,
    'save returns false when storage.setItem throws',
  );

  assert.equal(
    serializer.load(),
    null,
    'load swallows errors from storage.getItem and returns null',
  );

  assert.doesNotThrow(() => serializer.clear(), 'clear swallows errors from storage.removeItem');
});
