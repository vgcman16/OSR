import test from 'node:test';
import assert from 'node:assert/strict';

import { ReconSystem } from '../src/game/carThief/systems/reconSystem.js';

const createCrewMember = (id, name) => ({
  id,
  name,
  status: 'idle',
  fatigue: 0,
  beginRecon() {
    this.status = 'on-recon';
  },
  setStatus(nextStatus) {
    this.status = nextStatus;
  },
});

const createDistrict = (id, name) => ({
  id,
  name,
  security: 1,
  crackdownPressure: 0,
  intelLevel: 0,
  influence: 0,
  adjustIntelLevel(delta = 0) {
    this.intelLevel += delta;
  },
  adjustInfluence(delta = 0) {
    this.influence += delta;
  },
  adjustCrackdownPressure(delta = 0) {
    this.crackdownPressure += delta;
  },
  getIntelSnapshot() {
    return {
      intelLevel: this.intelLevel,
      influence: this.influence,
      crackdownPressure: this.crackdownPressure,
    };
  },
});

test('Recon assignments can be scheduled and resolved successfully', () => {
  const crewA = createCrewMember('c-1', 'Echo');
  const crewB = createCrewMember('c-2', 'Fuse');
  const district = createDistrict('d-1', 'Dockside');
  const initialState = {
    crew: [crewA, crewB],
    city: { districts: [district] },
    reconAssignments: [],
    missionLog: [],
  };

  const reconSystem = new ReconSystem(initialState);
  reconSystem.computeDuration = () => 24;

  const scheduleResult = reconSystem.scheduleAssignment({
    crewIds: [crewA.id, crewB.id],
    districtId: district.id,
    durationSeconds: 30,
    approach: 'balanced',
  });

  assert.ok(scheduleResult.success, 'scheduleAssignment should succeed for idle crew');

  const assignments = reconSystem.getAssignments();
  assert.equal(assignments.length, 1, 'a new assignment is stored on the system state');

  const assignment = assignments[0];
  assert.equal(assignment.status, 'in-progress', 'assignment starts in progress');
  assert.equal(assignment.progress, 0, 'assignment progress starts at zero');
  assert.equal(crewA.status, 'on-recon', 'crew begin recon when scheduled');
  assert.equal(crewB.status, 'on-recon', 'all assigned crew marked on recon');

  reconSystem.computeAssignmentOutcome = () => ({
    intelDelta: 2,
    influenceDelta: 1,
    crackdownDelta: -1,
    success: true,
    setbacks: { triggered: false, states: [], notes: [] },
    fatigueImpact: 4,
  });

  reconSystem.update(24);

  const resolvedAssignment = reconSystem.getAssignments()[0];
  assert.equal(resolvedAssignment.status, 'completed', 'assignment resolves as completed');
  assert.equal(resolvedAssignment.progress, 1, 'assignment progress reaches 100%');
  assert.equal(resolvedAssignment.remainingSeconds, 0, 'no time remains after completion');
  assert.ok(resolvedAssignment.result?.success, 'result marks the recon as successful');
  assert.match(
    resolvedAssignment.resultSummary,
    /Intel \+2.*Influence \+1.*Crackdown -1/,
    'result summary includes the delta breakdown',
  );
  assert.equal(district.intelLevel, 2, 'district intel updated from outcome delta');
  assert.equal(district.influence, 1, 'district influence updated from outcome delta');
  assert.equal(district.crackdownPressure, -1, 'district crackdown adjusted from outcome delta');

  const missionLog = reconSystem.state.missionLog;
  assert.equal(missionLog.length, 1, 'mission log entry recorded on completion');
  assert.equal(missionLog[0].outcome, 'recon-complete', 'mission log entry marks successful recon');
  assert.equal(missionLog[0].reconId, resolvedAssignment.id, 'mission log references the assignment');
  assert.equal(crewA.status, 'idle', 'crew released back to idle');
  assert.equal(crewB.status, 'idle', 'all crew return to idle after success');
});

test('Recon failure applies fallout, mission log, and failure summaries', () => {
  const crewA = createCrewMember('c-10', 'Shade');
  const crewB = createCrewMember('c-11', 'Nova');
  const district = createDistrict('d-2', 'Old Quarter');
  const initialState = {
    crew: [crewA, crewB],
    city: { districts: [district] },
    reconAssignments: [],
    missionLog: [],
  };

  const reconSystem = new ReconSystem(initialState);
  reconSystem.computeDuration = () => 20;

  const { assignment } = reconSystem.scheduleAssignment({
    crewIds: [crewA.id, crewB.id],
    districtId: district.id,
    durationSeconds: 25,
    approach: 'stealth',
  });

  assert.ok(assignment, 'assignment should be created');

  reconSystem.computeAssignmentOutcome = () => ({
    intelDelta: -3,
    influenceDelta: 0,
    crackdownDelta: 2,
    success: false,
    fatigueImpact: 6,
    setbacks: {
      triggered: true,
      states: ['intel-compromised', 'injury'],
      intelCompromised: true,
      injuredCrewIds: [crewB.id],
      capturedCrewIds: [crewA.id],
      severity: 'critical',
      notes: ['Test failure scenario'],
    },
  });

  reconSystem.update(20);

  const failedAssignment = reconSystem.getAssignments()[0];
  assert.equal(failedAssignment.status, 'failed', 'assignment resolves as failed');
  assert.equal(failedAssignment.result?.success, false, 'result marks the recon as failed');
  assert.ok(
    failedAssignment.failureStates.includes('intel-compromised'),
    'failure states include the intel compromised flag',
  );
  assert.equal(
    failedAssignment.result?.setbacks?.capturedCrewIds?.[0],
    crewA.id,
    'setbacks capture the first crew member',
  );
  assert.equal(
    failedAssignment.result?.setbacks?.injuredCrewIds?.[0],
    crewB.id,
    'setbacks record injured crew members',
  );
  assert.match(
    failedAssignment.resultSummary,
    /Recon failed — Intel compromised/i,
    'result summary communicates the failure reason',
  );

  const missionLog = reconSystem.state.missionLog;
  assert.equal(missionLog.length, 1, 'failure logs a mission entry');
  assert.equal(missionLog[0].outcome, 'recon-failed', 'mission log outcome marks the failure');
  assert.equal(crewA.status, 'captured', 'captured crew retain captured status');
  assert.equal(crewB.status, 'injured', 'injured crew keep the injury status');
});

test('Cancelling an assignment releases crew and records the abort', () => {
  const crewA = createCrewMember('c-21', 'Pulse');
  const crewB = createCrewMember('c-22', 'Glint');
  const district = createDistrict('d-3', 'Harborfront');
  const initialState = {
    crew: [crewA, crewB],
    city: { districts: [district] },
    reconAssignments: [],
    missionLog: [],
  };

  const reconSystem = new ReconSystem(initialState);
  reconSystem.computeDuration = () => 30;

  const scheduleResult = reconSystem.scheduleAssignment({
    crewIds: [crewA.id, crewB.id],
    districtId: district.id,
    durationSeconds: 40,
    approach: 'liaison',
  });

  assert.ok(scheduleResult.success, 'assignment scheduled before cancellation');

  const activeAssignment = reconSystem.getAssignments()[0];
  assert.equal(activeAssignment.status, 'in-progress', 'assignment starts active');
  assert.equal(crewA.status, 'on-recon');
  assert.equal(crewB.status, 'on-recon');

  const cancelResult = reconSystem.cancelAssignment(activeAssignment.id);

  assert.ok(cancelResult.success, 'cancelAssignment reports success');
  assert.equal(activeAssignment.status, 'cancelled', 'assignment marked as cancelled');
  assert.equal(
    activeAssignment.resultSummary,
    'Operation aborted before completion.',
    'cancelled assignments note the abort in the summary',
  );
  assert.equal(activeAssignment.remainingSeconds, 30, 'remaining seconds persist when cancelling');

  const missionLog = reconSystem.state.missionLog;
  assert.equal(missionLog.length, 1, 'cancellation logs an entry');
  assert.equal(missionLog[0].outcome, 'recon-cancelled', 'mission log records the abort outcome');
  assert.equal(crewA.status, 'idle', 'crew released after cancellation');
  assert.equal(crewB.status, 'idle', 'all crew return to idle on cancellation');
});
