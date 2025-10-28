import { GameState } from '../state/gameState.js';

const DEFAULT_DURATION_SECONDS = 48;
const MIN_DURATION_SECONDS = 20;
const MAX_TRACKED_ASSIGNMENTS = 12;
const DEFAULT_APPROACH_KEY = 'balanced';

const RECON_APPROACH_CONFIG = {
  stealth: {
    key: 'stealth',
    label: 'Stealth infiltration',
    deploySummary: 'stealth infiltration',
    durationMultiplier: 1.25,
    intelMultiplier: 1.2,
    influenceMultiplier: 1.1,
    crackdownMultiplier: 0.85,
    setbackChanceDelta: -0.18,
    severityRollDelta: -0.2,
    fatigueDelta: -1,
  },
  balanced: {
    key: 'balanced',
    label: 'Balanced sweep',
    deploySummary: 'balanced sweep',
    durationMultiplier: 1,
    intelMultiplier: 1,
    influenceMultiplier: 1,
    crackdownMultiplier: 1,
    setbackChanceDelta: 0,
    severityRollDelta: 0,
    fatigueDelta: 0,
  },
  aggressive: {
    key: 'aggressive',
    label: 'Aggressive breach',
    deploySummary: 'aggressive breach',
    durationMultiplier: 0.8,
    intelMultiplier: 0.9,
    influenceMultiplier: 0.95,
    crackdownMultiplier: 1.25,
    setbackChanceDelta: 0.22,
    severityRollDelta: 0.18,
    fatigueDelta: 3,
  },
};

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

  resolveApproachConfig(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return RECON_APPROACH_CONFIG[normalized] ?? RECON_APPROACH_CONFIG[DEFAULT_APPROACH_KEY];
  }

  normalizeAssignment(entry = {}) {
    const district = this.getDistrictById(entry.districtId);
    const duration = Number.isFinite(entry.durationSeconds) && entry.durationSeconds > 0
      ? entry.durationSeconds
      : this.defaultDurationSeconds;
    const elapsed = clampNumber(entry.elapsedSeconds ?? 0, { min: 0, max: duration });
    const status = typeof entry.status === 'string' ? entry.status : 'in-progress';
    const approachConfig = this.resolveApproachConfig(entry.approach);

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
      failedAt: Number.isFinite(entry.failedAt) ? entry.failedAt : null,
      cancelledAt: Number.isFinite(entry.cancelledAt) ? entry.cancelledAt : null,
      updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : Date.now(),
      resultSummary: entry.resultSummary ?? null,
      crewSummary: entry.crewSummary ?? null,
      lastLogEntryId: entry.lastLogEntryId ?? null,
      failureStates: Array.isArray(entry.failureStates) ? entry.failureStates.slice() : [],
      result: null,
      approach: approachConfig.key,
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

  scheduleAssignment({ crewIds = [], districtId, durationSeconds, approach } = {}) {
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

    const approachConfig = this.resolveApproachConfig(approach);
    const operationDuration = this.computeDuration(assignedCrew, durationSeconds, { approach: approachConfig.key });

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
      approach: approachConfig.key,
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
      message: `Recon team deployed to ${district.name} — ${approachConfig.label}.`,
    };
  }

  computeDuration(crewMembers, requestedDuration, { approach } = {}) {
    const approachConfig = this.resolveApproachConfig(approach);
    const baseDuration = Number.isFinite(requestedDuration) && requestedDuration > 0
      ? requestedDuration
      : this.defaultDurationSeconds;
    const approachAdjustedBase = baseDuration * (approachConfig.durationMultiplier ?? 1);

    if (!crewMembers.length) {
      return Math.max(MIN_DURATION_SECONDS, Math.round(approachAdjustedBase));
    }

    const stealthAverage = averageOf(crewMembers.map((member) => Number(member?.traits?.stealth)));
    const techAverage = averageOf(crewMembers.map((member) => Number(member?.traits?.tech)));
    const tacticsAverage = averageOf(crewMembers.map((member) => Number(member?.traits?.tactics)));

    const speedBonus = crewMembers.length * 1.25 + (stealthAverage * 0.4 + techAverage * 0.35 + tacticsAverage * 0.35);
    const adjusted = approachAdjustedBase - speedBonus * 1.5;
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

    const outcome = this.computeAssignmentOutcome(assignedCrew, district, { approach: assignment.approach });

    if (district) {
      district.adjustIntelLevel(outcome.intelDelta);
      district.adjustInfluence(outcome.influenceDelta);
      district.adjustCrackdownPressure(outcome.crackdownDelta);
    }

    const afterSnapshot = district && typeof district.getIntelSnapshot === 'function'
      ? district.getIntelSnapshot()
      : null;

    const failureStates = Array.isArray(outcome?.setbacks?.states)
      ? outcome.setbacks.states.slice()
      : [];
    const reconFailed = outcome?.success === false
      || failureStates.includes('intel-compromised')
      || failureStates.includes('captured');
    const resolutionTimestamp = Date.now();
    const normalizedFatigueImpact = Number.isFinite(outcome?.fatigueImpact)
      ? Math.max(0, Math.round(outcome.fatigueImpact))
      : 10;

    const capturedIds = new Set(Array.isArray(outcome?.setbacks?.capturedCrewIds) ? outcome.setbacks.capturedCrewIds : []);
    const injuredIds = new Set(Array.isArray(outcome?.setbacks?.injuredCrewIds) ? outcome.setbacks.injuredCrewIds : []);

    const crewEffects = [];
    assignedCrew.forEach((member) => {
      if (!member) {
        return;
      }

      const crewId = member.id ?? null;
      const preFatigue = typeof member.getFatigueLevel === 'function'
        ? member.getFatigueLevel()
        : Number.isFinite(member.fatigue)
          ? Number(member.fatigue)
          : 0;
      const falloutStatus = capturedIds.has(crewId)
        ? 'captured'
        : injuredIds.has(crewId)
          ? 'injured'
          : null;

      const fatigueVariance = (Math.random() - 0.5) * 2;
      const personalFatigueImpact = Math.max(
        0,
        Math.round(normalizedFatigueImpact + fatigueVariance + (falloutStatus ? 4 : 0)),
      );

      let resultingFatigue = preFatigue;
      if (typeof member.finishMission === 'function') {
        resultingFatigue = member.finishMission({
          fatigueImpact: personalFatigueImpact,
          fallout: falloutStatus
            ? {
              status: falloutStatus,
              source: 'recon',
              districtId: assignment.districtId ?? null,
              districtName: district?.name ?? assignment.districtName ?? null,
              severity: outcome?.setbacks?.severity ?? null,
              notes: Array.isArray(outcome?.setbacks?.notes)
                ? outcome.setbacks.notes.slice()
                : [],
            }
            : null,
        });
      } else {
        const nextFatigue = clampNumber(preFatigue + personalFatigueImpact, { min: 0, max: 100 });
        resultingFatigue = nextFatigue;
        member.fatigue = nextFatigue;
        if (falloutStatus && typeof member.applyMissionFallout === 'function') {
          member.applyMissionFallout({
            status: falloutStatus,
            source: 'recon',
            districtId: assignment.districtId ?? null,
            districtName: district?.name ?? assignment.districtName ?? null,
            severity: outcome?.setbacks?.severity ?? null,
            notes: Array.isArray(outcome?.setbacks?.notes)
              ? outcome.setbacks.notes.slice()
              : [],
          });
        } else if (falloutStatus) {
          member.status = falloutStatus;
        } else if (typeof member.isExhausted === 'function' && member.isExhausted()) {
          member.status = 'needs-rest';
        } else {
          member.status = 'idle';
        }
      }

      const fatigueDelta = Number.isFinite(resultingFatigue - preFatigue)
        ? Math.round(resultingFatigue - preFatigue)
        : 0;

      crewEffects.push({
        id: crewId,
        name: member.name ?? null,
        fatigueDelta,
        resultingFatigue: Number.isFinite(resultingFatigue) ? Math.round(resultingFatigue) : null,
        fallout: falloutStatus,
        status: typeof member.status === 'string' ? member.status : null,
      });
    });

    assignment.status = reconFailed ? 'failed' : 'completed';
    assignment.completedAt = resolutionTimestamp;
    assignment.failedAt = reconFailed ? resolutionTimestamp : null;
    assignment.updatedAt = resolutionTimestamp;
    assignment.elapsedSeconds = assignment.durationSeconds;
    assignment.remainingSeconds = 0;
    assignment.progress = 1;
    assignment.failureStates = failureStates;
    assignment.result = {
      intelDelta: outcome.intelDelta,
      influenceDelta: outcome.influenceDelta,
      crackdownDelta: outcome.crackdownDelta,
      success: !reconFailed,
      setbacks: outcome?.setbacks
        ? {
          ...outcome.setbacks,
          states: Array.isArray(outcome.setbacks.states) ? outcome.setbacks.states.slice() : [],
          injuredCrewIds: Array.isArray(outcome.setbacks.injuredCrewIds)
            ? outcome.setbacks.injuredCrewIds.slice()
            : [],
          capturedCrewIds: Array.isArray(outcome.setbacks.capturedCrewIds)
            ? outcome.setbacks.capturedCrewIds.slice()
            : [],
          notes: Array.isArray(outcome.setbacks.notes) ? outcome.setbacks.notes.slice() : [],
        }
        : null,
      fatigueImpact: normalizedFatigueImpact,
      crewEffects: crewEffects.map((effect) => ({ ...effect })),
      failureStates: failureStates.slice(),
      before: beforeSnapshot ? { ...beforeSnapshot } : null,
      after: afterSnapshot ? { ...afterSnapshot } : null,
      delta: {
        influence: outcome.influenceDelta,
        intelLevel: outcome.intelDelta,
        crackdownPressure: outcome.crackdownDelta,
      },
    };

    assignment.resultSummary = this.formatResultSummary(outcome, { failureStates, crewEffects });
    assignment.crewSummary = this.formatCrewSummary(assignedCrew, { crewEffects });
    assignment.districtName = district?.name ?? assignment.districtName;

    const logEntry = this.createLogEntry(
      assignment,
      outcome,
      assignedCrew,
      crewEffects,
      beforeSnapshot,
      afterSnapshot,
    );
    this.pushMissionLog(logEntry);
    assignment.lastLogEntryId = logEntry.id;

    const recoveredCrew = assignedCrew.filter((member) => {
      if (!member) {
        return false;
      }
      const crewId = member.id ?? null;
      return !capturedIds.has(crewId) && !injuredIds.has(crewId);
    });

    if (recoveredCrew.length) {
      this.releaseCrewMembers(recoveredCrew);
    }
    this.trimAssignments();
    this.syncCrewStatus();

    return assignment;
  }

  computeAssignmentOutcome(crewMembers, district, { approach } = {}) {
    const approachConfig = this.resolveApproachConfig(approach);
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
    const crackdownPressure = Number.isFinite(district?.crackdownPressure)
      ? district.crackdownPressure
      : 0;
    const securityResistance = 1 + districtSecurity * 0.15;

    const intelRandom = intelGainBase / securityResistance + Math.random() * 1.2;
    let intelDelta = Math.max(
      1,
      Math.round(intelRandom * (approachConfig.intelMultiplier ?? 1)),
    );

    const influenceRandom = influenceGainBase / securityResistance + Math.random();
    let influenceDelta = Math.max(
      1,
      Math.round(influenceRandom * (approachConfig.influenceMultiplier ?? 1)),
    );

    const crackdownRandom = crackdownReductionBase / securityResistance + Math.random() * 0.9;
    const crackdownRelief = Math.max(
      1,
      Math.round(crackdownRandom * (approachConfig.crackdownMultiplier ?? 1)),
    );
    let crackdownDelta = -crackdownRelief;

    const detectionPressure = 0.08 + districtSecurity * 0.12 + Math.max(0, crackdownPressure) * 0.02;
    const mitigation = crewCount * 0.03 + stealthAverage * 0.025 + tacticsAverage * 0.02 + techAverage * 0.015;
    const baseSetbackChance = clampNumber(detectionPressure - mitigation, { min: 0, max: 0.75 });
    const setbackChance = clampNumber(
      baseSetbackChance + (approachConfig.setbackChanceDelta ?? 0),
      { min: 0, max: 0.9 },
    );

    const crewIdPool = crewMembers
      .map((member) => member?.id)
      .filter((id, index, array) => id && array.indexOf(id) === index);

    const pickCrewIds = (count = 1) => {
      const picks = [];
      const pool = crewIdPool.slice();
      while (pool.length && picks.length < count) {
        const index = Math.floor(Math.random() * pool.length);
        const [selected] = pool.splice(index, 1);
        if (selected) {
          picks.push(selected);
        }
      }
      return picks;
    };

    const setbacks = {
      triggered: false,
      states: [],
      intelCompromised: false,
      injuredCrewIds: [],
      capturedCrewIds: [],
      severity: 'none',
      primary: null,
      notes: [],
    };

    let success = true;
    const fatigueImpactBase = Math.max(8, Math.round(10 + districtSecurity * 1.5 - crewCount));
    let fatigueImpact = Math.max(5, Math.round(fatigueImpactBase + (approachConfig.fatigueDelta ?? 0)));

    if (Math.random() < setbackChance) {
      setbacks.triggered = true;
      let severityRoll = Math.random() + districtSecurity * 0.15;
      severityRoll += approachConfig.severityRollDelta ?? 0;
      severityRoll -= (stealthAverage + tacticsAverage) * 0.025;
      severityRoll = Math.max(0, severityRoll);

      if (severityRoll >= 1.05 && crewIdPool.length) {
        setbacks.primary = 'captured';
        setbacks.states.push('captured');
        setbacks.capturedCrewIds = pickCrewIds(1);
        setbacks.severity = 'critical';
        setbacks.notes.push('Recon team member captured by security.');
        const capturedIntelBase = intelGainBase * 0.5 + Math.random() * 2;
        intelDelta = -Math.max(
          1,
          Math.round(capturedIntelBase * (approachConfig.intelMultiplier ?? 1)),
        );
        influenceDelta = 0;
        crackdownDelta = Math.max(2, Math.round(districtSecurity * 1.5 + Math.random() * 2));
        success = false;
        fatigueImpact += 8;
      } else if (severityRoll >= 0.6 && crewIdPool.length) {
        setbacks.primary = 'injury';
        setbacks.states.push('injury');
        const injuryCount = severityRoll > 0.9 && crewIdPool.length > 1 ? 2 : 1;
        setbacks.injuredCrewIds = pickCrewIds(injuryCount);
        setbacks.severity = severityRoll > 0.9 ? 'severe' : 'moderate';
        setbacks.notes.push('Recon team sustained injuries.');
        intelDelta = Math.max(0, Math.round(intelDelta * 0.6));
        influenceDelta = Math.max(0, Math.round(influenceDelta * 0.75));
        const crackdownRelief = Math.max(1, Math.round(Math.abs(crackdownDelta) * 0.4));
        crackdownDelta = -crackdownRelief;
        fatigueImpact += 6;
      } else {
        setbacks.primary = 'intel-compromised';
        setbacks.states.push('intel-compromised');
        setbacks.intelCompromised = true;
        setbacks.severity = 'moderate';
        setbacks.notes.push('Intel sweep detected — data lost.');
        const lostIntelBase = intelGainBase * 0.4 + Math.random() * 2;
        intelDelta = -Math.max(
          1,
          Math.round(lostIntelBase * (approachConfig.intelMultiplier ?? 1)),
        );
        influenceDelta = 0;
        crackdownDelta = Math.max(1, Math.round(districtSecurity * 1.2 + Math.random()));
        success = false;
        fatigueImpact += 4;
      }
    }

    return {
      intelDelta,
      influenceDelta,
      crackdownDelta,
      success,
      setbacks,
      fatigueImpact,
    };
  }

  releaseCrewMembers(crewMembers) {
    crewMembers.forEach((member) => {
      if (!member) {
        return;
      }

      const statusLabel = typeof member.status === 'string' ? member.status.toLowerCase() : '';
      if (['injured', 'captured', 'hospitalized', 'recovering'].includes(statusLabel)) {
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

  formatResultSummary(outcome, { failureStates = [] } = {}) {
    if (!outcome || typeof outcome !== 'object') {
      return 'Recon resolved.';
    }

    const deltaSegments = [
      formatDelta(outcome.intelDelta, 'Intel'),
      formatDelta(outcome.influenceDelta, 'Influence'),
      formatDelta(outcome.crackdownDelta, 'Crackdown'),
    ].filter(Boolean);

    const setbacks = outcome.setbacks ?? {};
    const failureFlags = new Set(
      Array.isArray(failureStates)
        ? failureStates.filter((state) => typeof state === 'string').map((state) => state.toLowerCase())
        : [],
    );

    if (setbacks.intelCompromised) {
      failureFlags.add('intel-compromised');
    }
    if (Array.isArray(setbacks.capturedCrewIds) && setbacks.capturedCrewIds.length) {
      failureFlags.add('captured');
    }
    if (Array.isArray(setbacks.injuredCrewIds) && setbacks.injuredCrewIds.length) {
      failureFlags.add('injury');
    }

    const isFailure = outcome.success === false
      || failureFlags.has('intel-compromised')
      || failureFlags.has('captured');

    if (isFailure) {
      const reasons = [];
      if (failureFlags.has('intel-compromised')) {
        reasons.push('Intel compromised');
      }
      if (failureFlags.has('captured')) {
        reasons.push('Crew captured');
      }
      if (failureFlags.has('injury')) {
        reasons.push('Injuries reported');
      }

      const reasonText = reasons.length ? reasons.join(', ') : 'Operation collapsed';
      const deltaText = deltaSegments.length ? ` (${deltaSegments.join(', ')})` : '';
      return `Recon failed — ${reasonText}${deltaText}.`;
    }

    const setbackSegments = [];
    if (failureFlags.has('injury')) {
      setbackSegments.push('Injuries reported');
    }

    const baseSummary = deltaSegments.length ? deltaSegments.join(', ') : 'Recon resolved';
    const combinedSummary = setbackSegments.length
      ? `${baseSummary} — ${setbackSegments.join(', ')}`
      : baseSummary;

    return combinedSummary.endsWith('.') ? combinedSummary : `${combinedSummary}.`;
  }

  formatCrewSummary(crewMembers, { crewEffects = [] } = {}) {
    if (!Array.isArray(crewMembers) || !crewMembers.length) {
      return null;
    }

    const effectsById = new Map();
    if (Array.isArray(crewEffects)) {
      crewEffects.forEach((effect) => {
        if (!effect || typeof effect !== 'object') {
          return;
        }
        if (!effect.id) {
          return;
        }
        effectsById.set(effect.id, effect);
      });
    }

    const names = crewMembers
      .map((member) => {
        if (!member) {
          return null;
        }

        const name = member.name ?? null;
        if (!name) {
          return null;
        }

        const effect = effectsById.get(member.id);
        if (!effect) {
          return name;
        }

        const annotations = [];
        if (Number.isFinite(effect.fatigueDelta) && effect.fatigueDelta !== 0) {
          const prefix = effect.fatigueDelta > 0 ? '+' : '';
          annotations.push(`Fatigue ${prefix}${effect.fatigueDelta}`);
        }
        if (effect.fallout === 'injured') {
          annotations.push('Injured');
        }
        if (effect.fallout === 'captured') {
          annotations.push('Captured');
        }
        const statusLabel = typeof effect.status === 'string' ? effect.status.toLowerCase() : '';
        if (!effect.fallout && statusLabel === 'needs-rest') {
          annotations.push('Needs rest');
        }

        if (!annotations.length) {
          return name;
        }

        return `${name} (${annotations.join(', ')})`;
      })
      .filter(Boolean);

    if (!names.length) {
      return null;
    }

    return `Crew: ${names.join(', ')}`;
  }

  createLogEntry(assignment, outcome, crewMembers, crewEffects, beforeSnapshot, afterSnapshot) {
    const timestamp = assignment.completedAt ?? Date.now();
    const districtLabel = assignment.districtName ?? 'District';
    const reconFailed = assignment.status === 'failed';
    const approachLabel = this.resolveApproachConfig(assignment.approach).label;
    const summaryDistrict = approachLabel ? `${districtLabel} (${approachLabel})` : districtLabel;
    const summary = `Recon sweep in ${summaryDistrict} — ${assignment.resultSummary ?? (reconFailed
      ? 'Recon failed.'
      : 'Field data updated.')}`;

    const districtSummary = (() => {
      const segments = [
        formatDelta(outcome.intelDelta, 'Intel'),
        formatDelta(outcome.influenceDelta, 'Influence'),
        formatDelta(outcome.crackdownDelta, 'Crackdown'),
      ].filter(Boolean);
      return segments.length ? `${districtLabel} — ${segments.join(', ')}` : null;
    })();

    const normalizedSetbacks = outcome?.setbacks
      ? {
        ...outcome.setbacks,
        states: Array.isArray(outcome.setbacks.states) ? outcome.setbacks.states.slice() : [],
        injuredCrewIds: Array.isArray(outcome.setbacks.injuredCrewIds)
          ? outcome.setbacks.injuredCrewIds.slice()
          : [],
        capturedCrewIds: Array.isArray(outcome.setbacks.capturedCrewIds)
          ? outcome.setbacks.capturedCrewIds.slice()
          : [],
        notes: Array.isArray(outcome.setbacks.notes) ? outcome.setbacks.notes.slice() : [],
      }
      : null;

    return {
      id: `${assignment.id}-${timestamp}`,
      type: 'recon',
      reconId: assignment.id,
      outcome: reconFailed ? 'recon-failed' : 'recon-complete',
      timestamp,
      summary,
      reconSummary: assignment.resultSummary ?? null,
      crewSummary: this.formatCrewSummary(crewMembers, { crewEffects }),
      districtSummary,
      districtId: assignment.districtId ?? null,
      districtName: districtLabel,
      intelBefore: beforeSnapshot ? { ...beforeSnapshot } : null,
      intelAfter: afterSnapshot ? { ...afterSnapshot } : null,
      setbacks: normalizedSetbacks,
      crewEffects: Array.isArray(crewEffects) ? crewEffects.map((effect) => ({ ...effect })) : [],
      success: !reconFailed,
      failureStates: Array.isArray(assignment.failureStates) ? assignment.failureStates.slice() : [],
    };
  }
}

export { ReconSystem };
