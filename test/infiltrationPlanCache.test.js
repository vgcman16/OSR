import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  serializePlanStateForStorage,
  loadCachedMissionInfiltrationPlans,
  setCachedMissionInfiltrationPlan,
  __test as mainTestHelpers,
} from '../src/main.js';

const { infiltrationPlanDraftSerializer, resetMissionInfiltrationPlanCache } = mainTestHelpers;

describe('mission infiltration plan cache', () => {
  beforeEach(() => {
    infiltrationPlanDraftSerializer.clear();
    resetMissionInfiltrationPlanCache();
  });

  it('rebuilds cached plan metadata with maps and timestamps intact', () => {
    const missionId = 'mission-alpha';
    const updatedAt = Date.now() - 5000;
    const planState = {
      missionId,
      updatedAt,
      source: 'active',
      choices: new Map([
        ['scout-entry', 'quiet-entry'],
        ['vault-breach', 'thermal-lance'],
      ]),
      stepCatalog: [
        {
          id: 'scout-entry',
          label: '  Scout entry ',
          summary: 'unused summary',
          choices: [
            { id: 'quiet-entry', summary: 'Silent ingress ' },
            { id: 'loud-entry', summary: 'Loud' },
          ],
        },
        {
          id: 'vault-breach',
          label: 'Breach vault',
          summary: 'Melt through the vault door',
        },
        {
          id: '',
          label: '   ',
          summary: '   ',
        },
      ],
    };

    const serialized = serializePlanStateForStorage(planState);
    assert.deepStrictEqual(serialized, {
      missionId,
      choices: {
        'scout-entry': 'quiet-entry',
        'vault-breach': 'thermal-lance',
      },
      updatedAt,
      source: 'active',
      stepCatalog: [
        { id: 'scout-entry', label: 'Scout entry', summary: 'Silent ingress' },
        { id: 'vault-breach', label: 'Breach vault', summary: 'Melt through the vault door' },
      ],
    });

    setCachedMissionInfiltrationPlan(missionId, planState);

    const cache = loadCachedMissionInfiltrationPlans();
    assert.ok(cache instanceof Map);

    const hydrated = cache.get(missionId);
    assert.ok(hydrated, 'expected cached plan entry');
    assert.ok(hydrated.choices instanceof Map);
    assert.strictEqual(hydrated.choices.get('scout-entry'), 'quiet-entry');
    assert.strictEqual(hydrated.choices.get('vault-breach'), 'thermal-lance');
    assert.deepStrictEqual(hydrated.stepCatalog, serialized.stepCatalog);
    assert.strictEqual(hydrated.source, 'active');
    assert.strictEqual(hydrated.updatedAt, updatedAt);
  });

  it('ignores corrupted or legacy payloads without throwing', () => {
    infiltrationPlanDraftSerializer.save({
      'mission-legacy': {
        choices: {
          'scout-entry': 42,
          'vault-breach': '',
        },
        stepCatalog: [
          null,
          {
            id: '',
            label: '  ',
            summary: '  ',
          },
          {
            id: 'vault-breach',
            label: ' Legacy breach  ',
            summary: '  ',
          },
        ],
        source: 'legacy-mode',
        updatedAt: 'not-a-timestamp',
      },
      'mission-invalid': null,
      '': {
        choices: { orphan: 'value' },
      },
    });

    const cache = loadCachedMissionInfiltrationPlans();
    assert.ok(cache instanceof Map);

    const legacyEntry = cache.get('mission-legacy');
    assert.ok(legacyEntry, 'expected sanitized legacy record');
    assert.ok(legacyEntry.choices instanceof Map);
    assert.strictEqual(legacyEntry.choices.size, 0, 'invalid choice values should be dropped');
    assert.strictEqual(legacyEntry.source, 'preview');
    assert.ok(Number.isFinite(legacyEntry.updatedAt));
    assert.deepStrictEqual(legacyEntry.stepCatalog, [
      { id: 'vault-breach', label: 'Legacy breach', summary: '' },
    ]);

    assert.strictEqual(cache.has('mission-invalid'), false);
    assert.strictEqual(cache.has(''), false);
  });
});
