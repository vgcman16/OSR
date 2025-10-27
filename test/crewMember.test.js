import test from 'node:test';
import assert from 'node:assert/strict';

import { CrewMember, CREW_FATIGUE_CONFIG } from '../src/game/carThief/entities/crewMember.js';

test('CrewMember fatigue increases after missions and enforces rest', () => {
  const member = new CrewMember({ name: 'Morgan', specialty: 'hacker' });
  assert.equal(member.isMissionReady(), true, 'fresh crew member is mission ready');

  member.beginMission();
  assert.equal(member.status, 'on-mission', 'beginMission sets mission status');

  member.finishMission({ fatigueImpact: CREW_FATIGUE_CONFIG.exhaustionThreshold });
  assert.equal(member.status, 'needs-rest', 'crew member requires rest after heavy fatigue');
  assert.ok(
    member.getFatigueLevel() >= CREW_FATIGUE_CONFIG.exhaustionThreshold,
    'fatigue level reaches the exhaustion threshold',
  );
  assert.equal(member.isMissionReady(), false, 'exhausted crew cannot take missions');
});

test('CrewMember recovery clears fatigue once enough time passes', () => {
  const member = new CrewMember({
    name: 'Iris',
    specialty: 'wheelman',
    fatigue: CREW_FATIGUE_CONFIG.exhaustionThreshold + 5,
  });
  member.setStatus('needs-rest');

  member.recoverFatigue(1);
  assert.ok(
    member.getFatigueLevel() < CREW_FATIGUE_CONFIG.exhaustionThreshold,
    'fatigue drops below exhaustion threshold after recovery',
  );
  assert.equal(member.status, 'idle', 'status resets to idle once recovered');

  member.beginMission();
  const fatigueBefore = member.getFatigueLevel();
  member.recoverFatigue(1);
  assert.equal(
    member.getFatigueLevel(),
    fatigueBefore,
    'fatigue does not recover while the member is on a mission',
  );
});
