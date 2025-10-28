import { GameState } from '../state/gameState.js';

const DEFAULT_DURATION_SECONDS = 48;
const MIN_DURATION_SECONDS = 20;
const MAX_TRACKED_ASSIGNMENTS = 12;

const clampNumber = (value, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) => {
  if (!Number.isFinite(value)) {
    return min;
  }

  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
};

const averageOf = (values = []) => {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) {
    return 0;
  }

  const total = filtered.reduce((sum, value) => sum + value, 0);
  return total / filtered.length;
};

const formatDelta = (value, label) => {
  if (!Number.isFinite(value) || value === 0) {
    return null;
  }

  const rounded = Math.round(value);
  const prefix = rounded > 0 ? '+' : '';
  return `${label} ${prefix}${rounded}`;
};

const createAssignmentId = () => `recon-${Math.random().toString(36).slice(2, 10)}`;

class ReconSystem {
  constructor(
    state,
    { defaultDurationSeconds = DEFAULT_DURATION_SECONDS, maxTrackedAssignments = MAX_TRACKED_ASSIGNMENTS } = {},
  ) {
    this.state = state instanceof GameState ? state : new GameState(state ?? {});
    this.defaultDurationSeconds = Number.isFinite(defaultDurationSeconds) && defaultDurationSeconds > 0
      ? defaultDurationSeconds
      : DEFAULT_DURATION_SECONDS;
    this.maxTrackedAssignments = Number.isFinite(maxTrackedAssignments) && maxTrackedAssignments > 0
      ? Math.round(maxTrackedAssignments)
      : MAX_TRACKED_ASSIGNMENTS;

    if (!Array.isArray(this.state.reconAssignments)) {
      this.state.reconAssignments = [];
    } else {
      this.state.reconAssignments = this.state.reconAssignments
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => this.normalizeAssignment(entry));
    }

    this.syncCrewStatus();
  }

  getAssignments() {
    return Array.isArray(this.state.reconAssignments) ? this.state.reconAssignments : [];
  }

  getCrewRoster() {
    return Array.isArray(this.state?.crew) ? this.state.crew : [];
  }

  getCityDistricts() {
    const districts = this.state?.city?.districts;
    return Array.isArray(districts) ? districts : [];
  }

  getDistrictById(districtId) {
    if (!districtId) {
      return null;
    }

    const districts = this.getCityDistricts();
    return districts.find((district) => district?.id === districtId) ?? null;
  }

  normalizeAssignment(entry = {}) {
    const district = this.getDistrictById(entry.districtId);
    const duration = Number.isFinite(entry.durationSeconds) && entry.durationSeconds > 0
      ? entry.durationSeconds
      : this.defaultDurationSeconds;
    const elapsed = clampNumber(entry.elapsedSeconds ?? 0, { min: 0, max: duration });
    const status = typeof entry.status === 'string' ? entry.status : 'in-progress';

    const normalized = {
      id: entry.id ?? createAssignmentId(),
      districtId: district?.id ?? entry.districtId ?? null,
      districtName: entry.districtName ?? district?.name ?? 'Unknown District',
      crewIds: Array.isArray(entry.crewIds)
        ? entry.crewIds.filter((id) => id !== null && id !== undefined)
        : [],
      status,
      durationSeconds: duration,
      elapsedSeconds: elapsed,
      remainingSeconds: Number.isFinite(entry.remainingSeconds)
        ? Math.max(0, entry.remainingSeconds)
        : Math.max(0, duration - elapsed),
      progress: duration > 0 ? clampNumber(elapsed / duration, { min: 0, max: 1 }) : 0,
      startedAt: Number.isFinite(entry.startedAt) ? entry.startedAt : Date.now(),
      completedAt: Number.isFinite(entry.completedAt) ? entry.completedAt : null,
      cancelledAt: Number.isFinite(entry.cancelledAt) ? entry.cancelledAt : null,
      updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : Date.now(),
      resultSummary: entry.resultSummary ?? null,
      crewSummary: entry.crewSummary ?? null,
      lastLogEntryId: entry.lastLogEntryId ?? null,
      result: null,
    };

    if (entry.result && typeof entry.result === 'object') {
      const resultClone = { ...entry.result };
      if (resultClone.before && typeof resultClone.before === 'object') {
        resultClone.before = { ...resultClone.before };
      }
      if (resultClone.after && typeof resultClone.after === 'object') {
        resultClone.after = { ...resultClone.after };
      }
      if (resultClone.delta && typeof resultClone.delta === 'object') {
        resultClone.delta = { ...resultClone.delta };
      }
      normalized.result = resultClone;
    }

    return normalized;
  }

  insertAssignment(record) {
    const normalized = this.normalizeAssignment(record);

    if (typeof this.state.addReconAssignment === 'function') {
      const stored = this.state.addReconAssignment(normalized);
      this.trimAssignments();
      return stored ?? normalized;
    }

    if (!Array.isArray(this.state.reconAssignments)) {
      this.state.reconAssignments = [];
    }

    this.state.reconAssignments.unshift(normalized);
    this.trimAssignments();
    return this.state.reconAssignments[0];
  }

  trimAssignments() {
    if (!Array.isArray(this.state.reconAssignments)) {
      this.state.reconAssignments = [];
      return;
    }

    const maxEntries = Math.max(this.maxTrackedAssignments, 1);
    if (this.state.reconAssignments.length <= maxEntries) {
      return;
    }

    const active = this.state.reconAssignments.filter((assignment) => assignment?.status === 'in-progress');
    const resolved = this.state.reconAssignments
      .filter((assignment) => assignment?.status !== 'in-progress')
      .sort((a, b) => {
        const aTimestamp = a?.completedAt ?? a?.cancelledAt ?? a?.updatedAt ?? 0;
        const bTimestamp = b?.completedAt ?? b?.cancelledAt ?? b?.updatedAt ?? 0;
        return bTimestamp - aTimestamp;
      });

    const preserved = [...active];
    for (const assignment of resolved) {
      if (preserved.length >= maxEntries) {
        break;
      }
      if (!preserved.includes(assignment)) {
        preserved.push(assignment);
      }
    }

    this.state.reconAssignments = preserved;
  }

  syncCrewStatus() {
    const roster = this.getCrewRoster();
    if (!roster.length) {
      return;
    }

    const activeCrewIds = new Set();
    this.getAssignments().forEach((assignment) => {
      if (assignment?.status !== 'in-progress') {
        return;
      }
      (assignment.crewIds ?? []).forEach((crewId) => {
        if (crewId) {
          activeCrewIds.add(crewId);
        }
      });
    });

    roster.forEach((member) => {
      if (!member) {
        return;
      }

      const statusLabel = (member.status ?? '').toLowerCase();
      if (activeCrewIds.has(member.id)) {
        if (typeof member.beginRecon === 'function') {
          member.beginRecon();
        } else if (typeof member.setStatus === 'function') {
          member.setStatus('on-recon');
        } else {
          member.status = 'on-recon';
        }
        return;
      }

      if (statusLabel === 'on-recon') {
        const exhausted = typeof member.isExhausted === 'function' ? member.isExhausted() : false;
        if (exhausted) {
          if (typeof member.setStatus === 'function') {
            member.setStatus('needs-rest');
          } else {
            member.status = 'needs-rest';
          }
        } else if (typeof member.setStatus === 'function') {
          member.setStatus('idle');
        } else {
          member.status = 'idle';
        }
      }
    });
  }

  scheduleAssignment({ crewIds = [], districtId, durationSeconds } = {}) {
    const uniqueCrewIds = Array.from(new Set(crewIds.filter((id) => id))); // remove falsy/duplicates
    if (!uniqueCrewIds.length) {
      return { success: false, reason: 'no-crew', message: 'Select at least one idle crew member.' };
    }

    const crewRoster = this.getCrewRoster();
    const assignedCrew = uniqueCrewIds
      .map((crewId) => crewRoster.find((member) => member?.id === crewId) ?? null)
      .filter(Boolean);

    if (assignedCrew.length !== uniqueCrewIds.length) {
      return { success: false, reason: 'unknown-crew', message: 'One or more crew members could not be found.' };
    }

    const unavailable = assignedCrew.find((member) => {
      const statusLabel = (member.status ?? '').toLowerCase();
      if (statusLabel !== 'idle') {
        return true;
      }
      if (typeof member.isMissionReady === 'function') {
        return !member.isMissionReady();
      }
      if (typeof member.isExhausted === 'function') {
        return member.isExhausted();
      }
      return false;
    });

    if (unavailable) {
      const name = unavailable.name ?? 'Crew member';
      return {
        success: false,
        reason: 'crew-unavailable',
        message: `${name} is unavailable for recon duty.`,
      };
    }

    const district = this.getDistrictById(districtId);
    if (!district) {
      return { success: false, reason: 'unknown-district', message: 'Select a known district to scout.' };
    }

    const operationDuration = this.computeDuration(assignedCrew, durationSeconds);

    const assignment = this.insertAssignment({
      id: createAssignmentId(),
      districtId: district.id,
      districtName: district.name,
      crewIds: assignedCrew.map((member) => member.id),
      status: 'in-progress',
      durationSeconds: operationDuration,
      elapsedSeconds: 0,
      remainingSeconds: operationDuration,
      startedAt: Date.now(),
    });

    assignedCrew.forEach((member) => {
      if (typeof member.beginRecon === 'function') {
        member.beginRecon();
      } else if (typeof member.setStatus === 'function') {
        member.setStatus('on-recon');
      } else {
        member.status = 'on-recon';
      }
    });

    this.syncCrewStatus();

    return {
      success: true,
      assignment: { ...assignment },
      message: `Recon team deployed to ${district.name}.`,
    };
  }

  computeDuration(crewMembers, requestedDuration) {
    const baseDuration = Number.isFinite(requestedDuration) && requestedDuration > 0
      ? requestedDuration
      : this.defaultDurationSeconds;

    if (!crewMembers.length) {
      return Math.max(MIN_DURATION_SECONDS, Math.round(baseDuration));
    }

    const stealthAverage = averageOf(crewMembers.map((member) => Number(member?.traits?.stealth)));
    const techAverage = averageOf(crewMembers.map((member) => Number(member?.traits?.tech)));
    const tacticsAverage = averageOf(crewMembers.map((member) => Number(member?.traits?.tactics)));

    const speedBonus = crewMembers.length * 1.25 + (stealthAverage * 0.4 + techAverage * 0.35 + tacticsAverage * 0.35);
    const adjusted = baseDuration - speedBonus * 1.5;
    const randomized = adjusted + (Math.random() - 0.5) * 4;

    return Math.max(MIN_DURATION_SECONDS, Math.round(randomized));
  }

  update(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return;
    }

    const assignments = this.getAssignments();
    assignments.forEach((assignment) => {
      if (!assignment || assignment.status !== 'in-progress') {
        return;
      }

      assignment.elapsedSeconds = clampNumber(assignment.elapsedSeconds + deltaSeconds, {
        min: 0,
        max: assignment.durationSeconds,
      });
      assignment.remainingSeconds = Math.max(0, assignment.durationSeconds - assignment.elapsedSeconds);
      assignment.progress = assignment.durationSeconds > 0
        ? clampNumber(assignment.elapsedSeconds / assignment.durationSeconds, { min: 0, max: 1 })
        : 0;
      assignment.updatedAt = Date.now();

      if (assignment.elapsedSeconds >= assignment.durationSeconds) {
        this.resolveAssignment(assignment);
      }
    });
  }

  resolveAssignment(assignment) {
    if (!assignment || assignment.status !== 'in-progress') {
      return null;
    }

    const crewRoster = this.getCrewRoster();
    const assignedCrew = assignment.crewIds
      .map((crewId) => crewRoster.find((member) => member?.id === crewId) ?? null)
      .filter(Boolean);
    const district = this.getDistrictById(assignment.districtId);
    const beforeSnapshot = district && typeof district.getIntelSnapshot === 'function'
      ? district.getIntelSnapshot()
      : null;

    const outcome = this.computeAssignmentOutcome(assignedCrew, district);

    if (district) {
      district.adjustIntelLevel(outcome.intelDelta);
      district.adjustInfluence(outcome.influenceDelta);
      district.adjustCrackdownPressure(outcome.crackdownDelta);
    }

    const afterSnapshot = district && typeof district.getIntelSnapshot === 'function'
      ? district.getIntelSnapshot()
      : null;

    assignment.status = 'completed';
    assignment.completedAt = Date.now();
    assignment.updatedAt = assignment.completedAt;
    assignment.elapsedSeconds = assignment.durationSeconds;
    assignment.remainingSeconds = 0;
    assignment.progress = 1;
    assignment.result = {
      intelDelta: outcome.intelDelta,
      influenceDelta: outcome.influenceDelta,
      crackdownDelta: outcome.crackdownDelta,
      before: beforeSnapshot ? { ...beforeSnapshot } : null,
      after: afterSnapshot ? { ...afterSnapshot } : null,
      delta: {
        influence: outcome.influenceDelta,
        intelLevel: outcome.intelDelta,
        crackdownPressure: outcome.crackdownDelta,
      },
    };

    assignment.resultSummary = this.formatResultSummary(outcome);
    assignment.crewSummary = this.formatCrewSummary(assignedCrew);
    assignment.districtName = district?.name ?? assignment.districtName;

    const logEntry = this.createLogEntry(assignment, outcome, assignedCrew, beforeSnapshot, afterSnapshot);
    this.pushMissionLog(logEntry);
    assignment.lastLogEntryId = logEntry.id;

    this.releaseCrewMembers(assignedCrew);
    this.trimAssignments();
    this.syncCrewStatus();

    return assignment;
  }

  computeAssignmentOutcome(crewMembers, district) {
    const crewCount = crewMembers.length || 1;
    const stealthAverage = averageOf(crewMembers.map((member) => Number(member?.traits?.stealth)));
    const techAverage = averageOf(crewMembers.map((member) => Number(member?.traits?.tech)));
    const tacticsAverage = averageOf(crewMembers.map((member) => Number(member?.traits?.tactics)));
    const charismaAverage = averageOf(crewMembers.map((member) => Number(member?.traits?.charisma)));
    const loyaltyAverage = averageOf(crewMembers.map((member) => Number(member?.loyalty)));

    const intelGainBase = 1 + crewCount * 0.75 + stealthAverage * 0.45 + techAverage * 0.35 + tacticsAverage * 0.2;
    const influenceGainBase = 1 + crewCount * 0.6 + charismaAverage * 0.45 + tacticsAverage * 0.25 + loyaltyAverage * 0.2;
    const crackdownReductionBase = crewCount * 0.7 + stealthAverage * 0.3 + tacticsAverage * 0.35 + techAverage * 0.25;

    const districtSecurity = Number.isFinite(district?.security) ? district.security : 2;
    const securityResistance = 1 + districtSecurity * 0.15;

    const intelDelta = Math.max(1, Math.round(intelGainBase / securityResistance + Math.random() * 1.2));
    const influenceDelta = Math.max(1, Math.round(influenceGainBase / securityResistance + Math.random()));
    const crackdownDelta = -Math.max(1, Math.round(crackdownReductionBase / securityResistance + Math.random() * 0.9));

    return { intelDelta, influenceDelta, crackdownDelta };
  }

  releaseCrewMembers(crewMembers) {
    crewMembers.forEach((member) => {
      if (!member) {
        return;
      }

      const exhausted = typeof member.isExhausted === 'function' ? member.isExhausted() : false;
      if (exhausted) {
        if (typeof member.setStatus === 'function') {
          member.setStatus('needs-rest');
        } else {
          member.status = 'needs-rest';
        }
        return;
      }

      if (typeof member.setStatus === 'function') {
        member.setStatus('idle');
      } else {
        member.status = 'idle';
      }
    });
  }

  cancelAssignment(assignmentId) {
    if (!assignmentId) {
      return { success: false, reason: 'unknown-assignment', message: 'No recon assignment selected.' };
    }

    const assignments = this.getAssignments();
    const assignment = assignments.find((entry) => entry?.id === assignmentId);

    if (!assignment) {
      return { success: false, reason: 'unknown-assignment', message: 'Recon assignment not found.' };
    }

    if (assignment.status !== 'in-progress') {
      return {
        success: false,
        reason: 'not-active',
        message: 'Recon assignment is no longer active.',
        assignment: { ...assignment },
      };
    }

    const crewRoster = this.getCrewRoster();
    const assignedCrew = assignment.crewIds
      .map((crewId) => crewRoster.find((member) => member?.id === crewId) ?? null)
      .filter(Boolean);

    assignment.status = 'cancelled';
    assignment.cancelledAt = Date.now();
    assignment.updatedAt = assignment.cancelledAt;
    assignment.remainingSeconds = Math.max(0, assignment.durationSeconds - assignment.elapsedSeconds);
    assignment.resultSummary = 'Operation aborted before completion.';

    const logEntry = {
      id: `${assignment.id}-${assignment.cancelledAt}-cancelled`,
      type: 'recon',
      reconId: assignment.id,
      outcome: 'recon-cancelled',
      timestamp: assignment.cancelledAt,
      summary: `Recon sweep in ${assignment.districtName ?? 'unknown district'} aborted.`,
      crewSummary: this.formatCrewSummary(assignedCrew),
    };

    this.pushMissionLog(logEntry);
    assignment.lastLogEntryId = logEntry.id;

    this.releaseCrewMembers(assignedCrew);
    this.trimAssignments();
    this.syncCrewStatus();

    return {
      success: true,
      assignment: { ...assignment },
      message: `Recon at ${assignment.districtName ?? 'district'} aborted.`,
    };
  }

  pushMissionLog(entry) {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    if (!Array.isArray(this.state.missionLog)) {
      this.state.missionLog = [];
    }

    this.state.missionLog.unshift({ ...entry });
    if (this.state.missionLog.length > 20) {
      this.state.missionLog.length = 20;
    }
  }

  formatResultSummary(outcome) {
    const segments = [
      formatDelta(outcome.intelDelta, 'Intel'),
      formatDelta(outcome.influenceDelta, 'Influence'),
      formatDelta(outcome.crackdownDelta, 'Crackdown'),
    ].filter(Boolean);

    return segments.length ? segments.join(', ') : 'Recon resolved.';
  }

  formatCrewSummary(crewMembers) {
    if (!Array.isArray(crewMembers) || !crewMembers.length) {
      return null;
    }

    const names = crewMembers.map((member) => member?.name).filter(Boolean);
    if (!names.length) {
      return null;
    }

    return `Crew: ${names.join(', ')}`;
  }

  createLogEntry(assignment, outcome, crewMembers, beforeSnapshot, afterSnapshot) {
    const timestamp = assignment.completedAt ?? Date.now();
    const districtLabel = assignment.districtName ?? 'District';
    const summary = `Recon sweep in ${districtLabel} — ${assignment.resultSummary ?? 'Field data updated.'}`;

    const districtSummary = (() => {
      const segments = [
        formatDelta(outcome.intelDelta, 'Intel'),
        formatDelta(outcome.influenceDelta, 'Influence'),
        formatDelta(outcome.crackdownDelta, 'Crackdown'),
      ].filter(Boolean);
      return segments.length ? `${districtLabel} — ${segments.join(', ')}` : null;
    })();

    return {
      id: `${assignment.id}-${timestamp}`,
      type: 'recon',
      reconId: assignment.id,
      outcome: 'recon-complete',
      timestamp,
      summary,
      reconSummary: assignment.resultSummary ?? null,
      crewSummary: this.formatCrewSummary(crewMembers),
      districtSummary,
      districtId: assignment.districtId ?? null,
      districtName: districtLabel,
      intelBefore: beforeSnapshot ? { ...beforeSnapshot } : null,
      intelAfter: afterSnapshot ? { ...afterSnapshot } : null,
    };
  }
}

export { ReconSystem };
