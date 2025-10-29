import { GameState, createInitialGameState } from './state/gameState.js';
import { MissionSystem } from './systems/missionSystem.js';
import { HeatSystem } from './systems/heatSystem.js';
import { EconomySystem } from './systems/economySystem.js';
import { ReconSystem } from './systems/reconSystem.js';
import { getActiveSafehouseFromState } from './world/safehouse.js';
import { GameLoop } from './loop/gameLoop.js';

const SAVE_STORAGE_KEY = 'osr.car-thief.save.v1';
const SAVE_INTERVAL_SECONDS = 12;
const memoryStorage = new Map();

const FEATURE_FLAGS = {
  animatedMissionEvents: (() => {
    if (typeof globalThis !== 'undefined' && globalThis?.OSR_FEATURES) {
      if (Object.prototype.hasOwnProperty.call(globalThis.OSR_FEATURES, 'animatedMissionEvents')) {
        return Boolean(globalThis.OSR_FEATURES.animatedMissionEvents);
      }
    }

    return true;
  })(),
};

const createMemoryStorage = () => ({
  getItem: (key) => (memoryStorage.has(key) ? memoryStorage.get(key) : null),
  setItem: (key, value) => {
    memoryStorage.set(key, typeof value === 'string' ? value : String(value));
  },
  removeItem: (key) => {
    memoryStorage.delete(key);
  },
});

const resolveStorage = (candidate) => {
  if (
    candidate
    && typeof candidate.getItem === 'function'
    && typeof candidate.setItem === 'function'
    && typeof candidate.removeItem === 'function'
  ) {
    return candidate;
  }

  if (typeof window !== 'undefined' && window?.localStorage) {
    return window.localStorage;
  }

  if (typeof globalThis !== 'undefined' && globalThis?.localStorage) {
    return globalThis.localStorage;
  }

  return createMemoryStorage();
};

const createGameSerializer = ({ storage, key = SAVE_STORAGE_KEY } = {}) => {
  const backing = resolveStorage(storage);
  const load = () => {
    try {
      const raw = backing.getItem(key);
      if (!raw || typeof raw !== 'string') {
        return null;
      }

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      console.warn('Failed to load car thief save data.', error);
      return null;
    }
  };

  const save = (payload) => {
    try {
      const serialized = JSON.stringify(payload);
      backing.setItem(key, serialized);
      return true;
    } catch (error) {
      console.warn('Failed to persist car thief save data.', error);
      return false;
    }
  };

  const clear = () => {
    try {
      backing.removeItem(key);
    } catch (error) {
      console.warn('Failed to clear car thief save data.', error);
    }
  };

  return { load, save, clear, key };
};

const cloneSerializable = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'object') {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    if (Array.isArray(value)) {
      return value.map((entry) => cloneSerializable(entry));
    }

    return { ...value };
  }
};

const captureHeatSystemSnapshot = (heatSystem) => ({
  timeAccumulator: Number.isFinite(heatSystem?.timeAccumulator) ? heatSystem.timeAccumulator : 0,
  dayLengthSeconds: Number.isFinite(heatSystem?.dayLengthSeconds) ? heatSystem.dayLengthSeconds : null,
  decayRate: Number.isFinite(heatSystem?.decayRate) ? heatSystem.decayRate : null,
});

const captureMissionSystemSnapshot = (missionSystem) => ({
  availableMissions: Array.isArray(missionSystem?.availableMissions)
    ? missionSystem.availableMissions.map((mission) => cloneSerializable(mission))
    : [],
  contractPool: Array.isArray(missionSystem?.contractPool)
    ? missionSystem.contractPool.map((contract) => cloneSerializable(contract))
    : [],
  currentCrackdownTier: missionSystem?.currentCrackdownTier ?? null,
});

const captureEconomySystemSnapshot = (economySystem) => ({
  timeAccumulator: Number.isFinite(economySystem?.timeAccumulator) ? economySystem.timeAccumulator : 0,
  dayLengthSeconds: Number.isFinite(economySystem?.dayLengthSeconds) ? economySystem.dayLengthSeconds : null,
  baseDailyOverhead: Number.isFinite(economySystem?.baseDailyOverhead)
    ? economySystem.baseDailyOverhead
    : null,
  lastExpenseReport: cloneSerializable(economySystem?.getLastExpenseReport?.() ?? economySystem?.lastExpenseReport),
  pendingExpenseReport: cloneSerializable(economySystem?.pendingExpenseReport ?? null),
});

const applyHeatSystemSnapshot = (heatSystem, snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') {
    return;
  }

  if (Number.isFinite(snapshot.timeAccumulator)) {
    heatSystem.timeAccumulator = snapshot.timeAccumulator;
  }

  if (Number.isFinite(snapshot.dayLengthSeconds) && snapshot.dayLengthSeconds > 0) {
    heatSystem.dayLengthSeconds = snapshot.dayLengthSeconds;
  }

  if (Number.isFinite(snapshot.decayRate) && snapshot.decayRate > 0) {
    heatSystem.decayRate = snapshot.decayRate;
  }

  if (typeof heatSystem.updateHeatTier === 'function') {
    heatSystem.updateHeatTier();
  }
};

const applyMissionSystemSnapshot = (missionSystem, snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') {
    return;
  }

  if (Array.isArray(snapshot.availableMissions)) {
    missionSystem.availableMissions = snapshot.availableMissions.map((mission) => cloneSerializable(mission));
  }

  if (Array.isArray(snapshot.contractPool)) {
    missionSystem.contractPool = snapshot.contractPool.map((contract) => cloneSerializable(contract));
  }

  if (snapshot.currentCrackdownTier) {
    missionSystem.currentCrackdownTier = snapshot.currentCrackdownTier;
  }
};

const applyEconomySystemSnapshot = (economySystem, snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') {
    return;
  }

  if (Number.isFinite(snapshot.timeAccumulator)) {
    economySystem.timeAccumulator = snapshot.timeAccumulator;
  }

  if (Number.isFinite(snapshot.dayLengthSeconds) && snapshot.dayLengthSeconds > 0) {
    economySystem.dayLengthSeconds = snapshot.dayLengthSeconds;
  }

  if (Number.isFinite(snapshot.baseDailyOverhead)) {
    economySystem.baseDailyOverhead = snapshot.baseDailyOverhead;
  }

  economySystem.lastExpenseReport = snapshot.lastExpenseReport
    ? cloneSerializable(snapshot.lastExpenseReport)
    : null;
  economySystem.pendingExpenseReport = snapshot.pendingExpenseReport
    ? cloneSerializable(snapshot.pendingExpenseReport)
    : null;
};

const normalizeDistrictKey = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const key = String(value).trim().toLowerCase();
  return key ? key : null;
};

const createDistrictKey = (district) => {
  const idKey = normalizeDistrictKey(district?.id);
  if (idKey) {
    return `id:${idKey}`;
  }

  const nameKey = normalizeDistrictKey(district?.name);
  return nameKey ? `name:${nameKey}` : null;
};

const createMissionDistrictKey = (mission) => {
  if (!mission) {
    return null;
  }

  const idKey = normalizeDistrictKey(mission.districtId);
  if (idKey) {
    return `id:${idKey}`;
  }

  const nameKey = normalizeDistrictKey(mission.districtName);
  return nameKey ? `name:${nameKey}` : null;
};

const determineDistrictRiskTier = (securityScore) => {
  const numeric = Number(securityScore);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (numeric >= 4) {
    return 'high';
  }

  if (numeric >= 3) {
    return 'moderate';
  }

  return 'low';
};

const createCarThiefGame = ({ canvas, context }) => {
  const serializer = createGameSerializer();
  const savedPayload = serializer.load();

  let state;
  let loadedFromSave = false;

  if (savedPayload?.state && (!savedPayload.version || savedPayload.version === 1)) {
    try {
      state = GameState.fromJSON(savedPayload.state);
      loadedFromSave = true;
    } catch (error) {
      console.warn('Failed to hydrate car thief save payload, using defaults.', error);
      state = createInitialGameState();
      serializer.clear();
    }
  } else {
    state = createInitialGameState();
    if (savedPayload?.version && savedPayload.version !== 1) {
      serializer.clear();
    }
  }

  const heatSystem = new HeatSystem(state);
  const missionSystem = new MissionSystem(state, { heatSystem });
  const economySystem = new EconomySystem(state);
  const reconSystem = new ReconSystem(state);

  if (loadedFromSave && savedPayload?.systems) {
    applyHeatSystemSnapshot(heatSystem, savedPayload.systems.heat);
    applyMissionSystemSnapshot(missionSystem, savedPayload.systems.missions);
    applyEconomySystemSnapshot(economySystem, savedPayload.systems.economy);
  }

  let saveAccumulator = 0;

  const missionEventDisplayState = {
    entries: [],
    lastProgressByMission: new Map(),
  };

  const captureStateSnapshot = () => {
    if (state && typeof state.toJSON === 'function') {
      return state.toJSON();
    }

    try {
      const hydrated = GameState.fromJSON(state);
      return typeof hydrated?.toJSON === 'function' ? hydrated.toJSON() : cloneSerializable(hydrated);
    } catch (error) {
      console.warn('Unable to serialize game state for persistence.', error);
      return null;
    }
  };

  const persistSnapshot = () => {
    const stateSnapshot = captureStateSnapshot();
    if (!stateSnapshot) {
      return false;
    }

    const payload = {
      version: 1,
      savedAt: Date.now(),
      state: stateSnapshot,
      systems: {
        heat: captureHeatSystemSnapshot(heatSystem),
        missions: captureMissionSystemSnapshot(missionSystem),
        economy: captureEconomySystemSnapshot(economySystem),
      },
    };

    return serializer.save(payload);
  };

  const clearSavedState = () => {
    serializer.clear();
    saveAccumulator = 0;
  };

  const renderHud = () => {
    if (!context || !canvas) {
      return;
    }

    const clampNormalized = (value) => {
      if (!Number.isFinite(value)) {
        return 0;
      }

      if (value <= 0) {
        return 0;
      }

      if (value >= 1) {
        return 1;
      }

      return value;
    };

    const renderBarGauge = ({
      x,
      y,
      width,
      height,
      value,
      backgroundColor = 'rgba(8, 12, 20, 0.75)',
      fillColor = '#78beff',
      borderColor = 'rgba(120, 190, 255, 0.6)',
      innerPadding = 2,
    }) => {
      if (!width || !height) {
        return null;
      }

      const normalized = clampNormalized(value);
      const innerWidth = Math.max(0, width - innerPadding * 2);
      const innerHeight = Math.max(0, height - innerPadding * 2);

      context.save();
      context.fillStyle = backgroundColor;
      context.fillRect(x, y, width, height);

      if (innerWidth > 0 && innerHeight > 0 && normalized > 0) {
        context.fillStyle = fillColor;
        context.fillRect(
          x + innerPadding,
          y + innerPadding,
          innerWidth * normalized,
          innerHeight,
        );
      }

      if (borderColor) {
        context.strokeStyle = borderColor;
        context.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
      }
      context.restore();

      return { x, y, width, height };
    };

    const renderArcGauge = ({
      x,
      y,
      radius,
      thickness = 10,
      value,
      startAngle = Math.PI * 0.75,
      endAngle = Math.PI * 2.25,
      backgroundColor = 'rgba(8, 12, 20, 0.9)',
      trackColor = 'rgba(120, 190, 255, 0.25)',
      fillColor = '#ff9266',
      label = '',
      labelFont = '12px "Segoe UI", sans-serif',
      labelColor = '#9ac7ff',
      valueLabel = '',
      valueFont = '16px "Segoe UI", sans-serif',
      valueColor = '#ffe27a',
    }) => {
      if (!radius || radius <= 0) {
        return null;
      }

      const normalized = clampNormalized(value);
      const sweep = endAngle - startAngle;
      const filledAngle = startAngle + sweep * normalized;
      const innerRadius = Math.max(0, radius - thickness * 0.5);
      const bounds = {
        x: x - radius,
        y: y - radius,
        width: radius * 2,
        height: radius * 2,
      };

      context.save();

      if (backgroundColor) {
        context.beginPath();
        context.fillStyle = backgroundColor;
        context.arc(x, y, innerRadius, 0, Math.PI * 2, false);
        context.fill();
      }

      context.lineWidth = thickness;
      context.lineCap = 'round';

      if (trackColor) {
        context.beginPath();
        context.strokeStyle = trackColor;
        context.arc(x, y, innerRadius, startAngle, endAngle, false);
        context.stroke();
      }

      if (normalized > 0) {
        context.beginPath();
        context.strokeStyle = fillColor;
        context.arc(x, y, innerRadius, startAngle, filledAngle, false);
        context.stroke();
      }

      context.textAlign = 'center';
      context.textBaseline = 'middle';

      if (valueLabel) {
        context.fillStyle = valueColor;
        context.font = valueFont;
        context.fillText(valueLabel, x, y);
      }

      if (label) {
        context.fillStyle = labelColor;
        context.font = labelFont;
        context.fillText(label, x, y + innerRadius + 16);
      }

      context.restore();
      return bounds;
    };

    const easeOutCubic = (value) => {
      if (!Number.isFinite(value)) {
        return 0;
      }

      if (value <= 0) {
        return 0;
      }

      if (value >= 1) {
        return 1;
      }

      const clamped = value;
      return 1 - (1 - clamped) * (1 - clamped) * (1 - clamped);
    };

    const ellipsize = (text, maxLength = 60) => {
      if (!text || typeof text !== 'string') {
        return '';
      }

      if (!Number.isFinite(maxLength) || maxLength <= 0) {
        return text;
      }

      const trimmed = text.trim();
      if (trimmed.length <= maxLength) {
        return trimmed;
      }

      return `${trimmed.slice(0, Math.max(0, maxLength - 1))}…`;
    };

    const computeLaneIndex = (key) => {
      if (!key) {
        return 0;
      }

      let hash = 0;
      for (let index = 0; index < key.length; index += 1) {
        hash = (hash + (key.charCodeAt(index) * (index + 1))) % 2147483647;
      }

      return Math.abs(hash) % 3;
    };

    const renderCircularEventNode = ({
      x,
      y,
      radius = 16,
      backgroundColor = 'rgba(12, 22, 32, 0.9)',
      trackColor = 'rgba(120, 190, 255, 0.25)',
      fillColor = '#ffe27a',
      icon = '◆',
      iconColor = '#0c111b',
      progress = 1,
      glow = 0,
    }) => {
      context.save();
      context.lineWidth = Math.max(2, Math.round(radius * 0.28));
      context.lineCap = 'round';

      if (backgroundColor) {
        context.beginPath();
        context.fillStyle = backgroundColor;
        context.arc(x, y, radius - context.lineWidth * 0.5, 0, Math.PI * 2, false);
        context.fill();
      }

      if (trackColor) {
        context.beginPath();
        context.strokeStyle = trackColor;
        context.arc(x, y, radius, 0, Math.PI * 2, false);
        context.stroke();
      }

      const normalized = clampNormalized(progress);
      if (normalized > 0) {
        context.beginPath();
        context.strokeStyle = fillColor;
        context.arc(
          x,
          y,
          radius,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * normalized,
          false,
        );
        context.stroke();
      }

      if (glow > 0) {
        const glowRadius = radius + Math.min(radius * 0.75, glow * radius);
        const gradient = context.createRadialGradient(x, y, radius * 0.35, x, y, glowRadius);
        gradient.addColorStop(0, `${fillColor}40`);
        gradient.addColorStop(1, 'rgba(12, 18, 28, 0)');
        context.beginPath();
        context.fillStyle = gradient;
        context.arc(x, y, glowRadius, 0, Math.PI * 2, false);
        context.fill();
      }

      if (icon) {
        context.font = `${Math.round(radius * 1.35)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = iconColor;
        context.fillText(icon, x, y + 1);
      }

      context.restore();
    };

    const renderMotionConnector = ({
      startX,
      endX,
      y,
      color = '#78beff',
      alpha = 1,
      dashOffset = 0,
      thickness = 3,
    }) => {
      if (!Number.isFinite(startX) || !Number.isFinite(endX) || startX === endX) {
        return;
      }

      context.save();
      context.globalAlpha = Math.max(0, Math.min(1, alpha));
      context.strokeStyle = color;
      context.lineWidth = thickness;
      context.lineCap = 'round';
      context.setLineDash([10, 18]);
      context.lineDashOffset = dashOffset;
      context.beginPath();
      context.moveTo(startX, y);
      context.lineTo(endX, y);
      context.stroke();
      context.restore();
    };

    const buildEventDescriptor = (mission, rawEvent, fallbackKey, now) => {
      if (!rawEvent) {
        return null;
      }

      const missionId = mission?.id ?? rawEvent.missionId ?? null;
      const missionName = mission?.name ?? rawEvent.missionName ?? 'Mission';
      const resolvedAtCandidate = [
        rawEvent.resolvedAt,
        rawEvent.completedAt,
        rawEvent.timestamp,
        rawEvent.failedAt,
      ].find((value) => Number.isFinite(value));
      const resolvedAt = Number.isFinite(resolvedAtCandidate) ? resolvedAtCandidate : now;
      const triggeredAtCandidate = [rawEvent.triggeredAt, rawEvent.startedAt, rawEvent.queuedAt]
        .find((value) => Number.isFinite(value));
      const triggeredAt = Number.isFinite(triggeredAtCandidate) ? triggeredAtCandidate : resolvedAt;
      const progressCandidate = [
        rawEvent.progressAt,
        rawEvent.progress,
        rawEvent.missionProgress,
        mission?.progress,
      ].find((value) => Number.isFinite(value));
      const progressAt = clampNormalized(progressCandidate ?? 0);

      const badgeIcon = Array.isArray(rawEvent.eventBadges) && rawEvent.eventBadges.length
        ? rawEvent.eventBadges[0]?.icon
        : null;
      const badgeColor = Array.isArray(rawEvent.eventBadges) && rawEvent.eventBadges.length
        ? rawEvent.eventBadges[0]?.color
        : null;

      const icon = rawEvent.icon ?? badgeIcon ?? '🚘';
      const accentColor = rawEvent.accentColor ?? badgeColor ?? '#78beff';

      const labelCandidates = [
        rawEvent.summary,
        rawEvent.choiceLabel,
        rawEvent.eventLabel,
        rawEvent.label,
        rawEvent.name,
      ];
      const label = labelCandidates.find((value) => typeof value === 'string' && value.trim())
        ?.trim() ?? 'Mission event';

      const detailCandidates = [rawEvent.effectSummary, rawEvent.choiceNarrative];
      const detail = detailCandidates.find((value) => typeof value === 'string' && value.trim())
        ?.trim() ?? null;

      const fromDistrict = rawEvent.fromDistrict ?? rawEvent.originDistrict ?? mission?.fromDistrict ?? null;
      const toDistrict = rawEvent.toDistrict ?? rawEvent.destinationDistrict ?? mission?.districtName ?? null;

      const keySeed = [
        missionId ?? 'mission',
        rawEvent.eventId ?? rawEvent.id ?? fallbackKey ?? label,
        resolvedAt,
      ];
      const key = keySeed.filter((value) => value !== null && value !== undefined).join(':');

      return {
        key,
        missionId,
        missionName,
        label,
        detail,
        icon,
        accentColor,
        resolvedAt,
        triggeredAt,
        progressAt,
        fromDistrict,
        toDistrict,
      };
    };

    const synchronizeMissionEventDisplay = (now) => {
      if (!FEATURE_FLAGS.animatedMissionEvents) {
        missionEventDisplayState.entries = [];
        missionEventDisplayState.lastProgressByMission.clear();
        return [];
      }

      const MAX_EVENT_ENTRIES = 6;
      const descriptors = [];
      const activeMission = state.activeMission ?? null;

      if (activeMission) {
        const eventHistory = Array.isArray(activeMission.eventHistory)
          ? activeMission.eventHistory
          : [];
        if (eventHistory.length) {
          eventHistory.slice(-MAX_EVENT_ENTRIES).forEach((entry, index) => {
            const descriptor = buildEventDescriptor(activeMission, entry, `history-${index}`, now);
            if (descriptor) {
              descriptors.push(descriptor);
            }
          });
        } else if (Array.isArray(activeMission.events)) {
          activeMission.events.slice(0, MAX_EVENT_ENTRIES).forEach((entry, index) => {
            const descriptor = buildEventDescriptor(activeMission, entry, `event-${index}`, now);
            if (descriptor) {
              descriptors.push(descriptor);
            }
          });
        }
      }

      if (descriptors.length < MAX_EVENT_ENTRIES) {
        const missionLog = Array.isArray(state.missionLog) ? state.missionLog : [];
        missionLog.slice(0, 3).forEach((logEntry) => {
          const missionStub = {
            id: logEntry?.missionId ?? null,
            name: logEntry?.missionName ?? logEntry?.summary ?? 'Mission',
            progress: 1,
            districtName: logEntry?.districtName ?? null,
          };
          const events = Array.isArray(logEntry?.events) ? logEntry.events : [];
          events.slice(0, MAX_EVENT_ENTRIES - descriptors.length).forEach((entry, index) => {
            const descriptor = buildEventDescriptor(
              missionStub,
              entry,
              `${logEntry?.id ?? 'log'}-${index}`,
              now,
            );
            if (descriptor) {
              descriptors.push(descriptor);
            }
          });
        });
      }

      const sortedDescriptors = descriptors
        .filter(Boolean)
        .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))
        .slice(0, MAX_EVENT_ENTRIES);

      const keepKeys = new Set(sortedDescriptors.map((descriptor) => descriptor.key));

      sortedDescriptors.forEach((descriptor) => {
        const {
          key,
          missionId,
          missionName,
          label,
          detail,
          icon,
          accentColor,
          resolvedAt,
          triggeredAt,
          progressAt,
          fromDistrict,
          toDistrict,
        } = descriptor;

        let entry = missionEventDisplayState.entries.find((candidate) => candidate.key === key);
        const motionDuration = 820 + Math.random() * 320;
        if (!entry) {
          const previousProgress = missionId
            ? missionEventDisplayState.lastProgressByMission.get(missionId) ?? 0
            : 0;
          entry = {
            key,
            missionId,
            missionName,
            label,
            detail,
            icon,
            accentColor,
            resolvedAt,
            triggeredAt,
            targetProgress: progressAt,
            displayProgress: previousProgress,
            startProgress: previousProgress,
            motionStart: now,
            motionDuration,
            createdAt: now,
            updatedAt: now,
            expireAt: now + 16000,
            fromDistrict,
            toDistrict,
            laneIndex: computeLaneIndex(key),
          };
          missionEventDisplayState.entries.push(entry);
        } else {
          entry.missionName = missionName;
          entry.label = label;
          entry.detail = detail;
          entry.icon = icon;
          entry.accentColor = accentColor;
          entry.resolvedAt = resolvedAt;
          entry.triggeredAt = triggeredAt;
          entry.fromDistrict = fromDistrict;
          entry.toDistrict = toDistrict;
          entry.updatedAt = now;
          entry.expireAt = now + 16000;

          if (Number.isFinite(progressAt) && Math.abs(progressAt - (entry.targetProgress ?? progressAt)) > 0.001) {
            entry.startProgress = Number.isFinite(entry.displayProgress)
              ? entry.displayProgress
              : entry.targetProgress ?? progressAt;
            entry.targetProgress = progressAt;
            entry.motionStart = now;
            entry.motionDuration = motionDuration;
          }
        }

        if (missionId) {
          missionEventDisplayState.lastProgressByMission.set(
            missionId,
            Number.isFinite(progressAt) ? progressAt : entry.targetProgress ?? 0,
          );
        }
      });

      missionEventDisplayState.entries = missionEventDisplayState.entries
        .filter((entry) => keepKeys.has(entry.key) || entry.expireAt > now)
        .slice(-MAX_EVENT_ENTRIES);

      missionEventDisplayState.lastProgressByMission.forEach((value, missionId) => {
        const stillPresent = missionEventDisplayState.entries.some((entry) => entry.missionId === missionId);
        if (!stillPresent) {
          missionEventDisplayState.lastProgressByMission.delete(missionId);
        }
      });

      return sortedDescriptors;
    };

    const renderMissionEventTimeline = ({
      x,
      y,
      width = 320,
      maxWidth = width,
      maxHeight = 176,
    }) => {
      if (!FEATURE_FLAGS.animatedMissionEvents) {
        return null;
      }

      const now = Date.now();
      const descriptors = synchronizeMissionEventDisplay(now);
      const entries = missionEventDisplayState.entries;
      if (!entries.length) {
        return null;
      }

      const availableWidth = Number.isFinite(maxWidth) && maxWidth > 0
        ? maxWidth
        : Number.isFinite(width) && width > 0
          ? width
          : 320;
      if (!Number.isFinite(availableWidth) || availableWidth < 180) {
        return null;
      }

      let resolvedWidth = Number.isFinite(width) && width > 0 ? width : availableWidth;
      resolvedWidth = Math.min(resolvedWidth, availableWidth);
      resolvedWidth = Math.max(180, resolvedWidth);

      const distinctLanes = new Set(entries.map((entry) => entry.laneIndex ?? 0));
      const lanesUsed = Math.max(1, Math.min(3, distinctLanes.size || 1));
      const baseHeight = 118;
      let resolvedHeight = baseHeight + (lanesUsed - 1) * 32;
      resolvedHeight = Math.max(baseHeight, resolvedHeight);
      if (Number.isFinite(maxHeight) && maxHeight > 0) {
        resolvedHeight = Math.min(resolvedHeight, Math.max(baseHeight, maxHeight));
      }
      const bounds = {
        x,
        y,
        width: resolvedWidth,
        height: resolvedHeight,
      };

      context.save();
      context.fillStyle = 'rgba(10, 16, 26, 0.92)';
      context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      context.strokeStyle = 'rgba(120, 190, 255, 0.45)';
      context.strokeRect(bounds.x + 0.5, bounds.y + 0.5, bounds.width - 1, bounds.height - 1);

      const headerY = bounds.y + 20;
      context.fillStyle = '#9ac7ff';
      context.font = '16px "Segoe UI", sans-serif';
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillText('Recent mission events', bounds.x + 16, headerY);

      const newestDescriptor = descriptors.length ? descriptors[0] : null;
      const newestTimestamp = newestDescriptor?.resolvedAt ?? newestDescriptor?.triggeredAt ?? null;
      if (Number.isFinite(newestTimestamp)) {
        try {
          const timestampLabel = new Date(newestTimestamp)
            .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (timestampLabel) {
            context.textAlign = 'right';
            context.font = '12px "Segoe UI", sans-serif';
            context.fillStyle = '#6f8fb2';
            context.fillText(`Updated ${timestampLabel}`, bounds.x + bounds.width - 16, headerY);
            context.textAlign = 'left';
            context.fillStyle = '#9ac7ff';
            context.font = '16px "Segoe UI", sans-serif';
          }
        } catch (error) {
          // Ignore timestamp rendering errors.
        }
      }

      const trackLeft = bounds.x + 28;
      const trackRight = bounds.x + bounds.width - 28;
      const trackWidth = Math.max(0, trackRight - trackLeft);
      const trackY = Math.min(bounds.y + bounds.height - 48, bounds.y + 64);
      context.beginPath();
      context.strokeStyle = 'rgba(120, 190, 255, 0.35)';
      context.lineWidth = 3;
      context.moveTo(trackLeft, trackY);
      context.lineTo(trackRight, trackY);
      context.stroke();

      const sortedEntries = [...entries].sort((a, b) => {
        const left = Number.isFinite(a.displayProgress) ? a.displayProgress : a.targetProgress ?? 0;
        const right = Number.isFinite(b.displayProgress) ? b.displayProgress : b.targetProgress ?? 0;
        return left - right;
      });

      sortedEntries.forEach((entry) => {
        const elapsed = now - entry.motionStart;
        const duration = entry.motionDuration > 0 ? entry.motionDuration : 800;
        const motionT = easeOutCubic(Math.max(0, Math.min(1, elapsed / duration)));
        const start = Number.isFinite(entry.startProgress) ? entry.startProgress : entry.targetProgress ?? 0;
        const target = Number.isFinite(entry.targetProgress) ? entry.targetProgress : start;
        entry.displayProgress = start + (target - start) * motionT;
        entry.displayProgress = clampNormalized(entry.displayProgress);
        const fadeIn = Math.min(1, (now - entry.createdAt) / 240);
        const fadeOut = Math.min(1, Math.max(0, (entry.expireAt - now) / 360));
        entry.currentAlpha = Math.max(0, Math.min(1, fadeIn * fadeOut));
      });

      for (let index = 1; index < sortedEntries.length; index += 1) {
        const previous = sortedEntries[index - 1];
        const current = sortedEntries[index];
        const startX = trackLeft + trackWidth * (previous.displayProgress ?? 0);
        const endX = trackLeft + trackWidth * (current.displayProgress ?? 0);
        const connectorAlpha = Math.min(previous.currentAlpha ?? 1, current.currentAlpha ?? 1) * 0.8;
        const dashOffset = -((now / 12) % 120);
        renderMotionConnector({
          startX,
          endX,
          y: trackY,
          color: current.accentColor ?? '#78beff',
          alpha: connectorAlpha,
          dashOffset,
        });

        const travelProgress = easeOutCubic(Math.max(0, Math.min(1, (now - current.motionStart) / (current.motionDuration || 800))));
        const travelX = startX + (endX - startX) * travelProgress;
        context.save();
        context.globalAlpha = connectorAlpha;
        context.fillStyle = current.accentColor ?? '#ffd15c';
        context.beginPath();
        context.arc(travelX, trackY, 4, 0, Math.PI * 2, false);
        context.fill();
        context.restore();
      }

      sortedEntries.forEach((entry) => {
        if (!entry) {
          return;
        }

        const iconX = trackLeft + trackWidth * (entry.displayProgress ?? 0);
        const laneOffsets = [0, -32, 32];
        const laneIndex = Math.max(0, Math.min(laneOffsets.length - 1, entry.laneIndex ?? 0));
        const laneOffset = laneOffsets[laneIndex];
        const iconY = trackY + laneOffset;
        const timeSpan = Math.max(1200, entry.expireAt - entry.createdAt);
        const age = Math.max(0, now - entry.createdAt);
        const recency = 1 - Math.min(1, age / timeSpan);
        const pulse = recency;

        context.save();
        context.globalAlpha = entry.currentAlpha ?? 1;
        renderCircularEventNode({
          x: iconX,
          y: iconY,
          radius: 16,
          fillColor: entry.accentColor ?? '#ffe27a',
          icon: entry.icon ?? '🚘',
          progress: Math.max(0.1, recency),
          glow: pulse * 0.85,
        });

        const labelY = iconY + (laneOffset >= 0 ? 30 : -28);
        const detailY = labelY + (laneOffset >= 0 ? 18 : -18);
        const labelAlignment = 'center';
        context.textAlign = labelAlignment;
        context.textBaseline = laneOffset >= 0 ? 'top' : 'bottom';
        context.font = '13px "Segoe UI", sans-serif';
        context.fillStyle = '#d1eaff';
        context.fillText(ellipsize(entry.label, 32), iconX, labelY);

        const timestamp = Number.isFinite(entry.resolvedAt)
          ? entry.resolvedAt
          : Number.isFinite(entry.triggeredAt)
            ? entry.triggeredAt
            : null;
        const timestampLabel = (() => {
          if (!Number.isFinite(timestamp)) {
            return null;
          }
          try {
            return new Date(timestamp)
              .toLocaleTimeString([], { minute: '2-digit', hour: '2-digit' });
          } catch (error) {
            return null;
          }
        })();

        let districtLabel = null;
        if (entry.fromDistrict && entry.toDistrict && entry.fromDistrict !== entry.toDistrict) {
          districtLabel = `${entry.fromDistrict} → ${entry.toDistrict}`;
        } else if (entry.toDistrict || entry.fromDistrict) {
          districtLabel = entry.toDistrict ?? entry.fromDistrict;
        }

        const detailParts = [
          entry.missionName,
          districtLabel,
          entry.detail,
          timestampLabel,
        ].filter((value) => typeof value === 'string' && value.trim());

        if (detailParts.length) {
          context.font = '11px "Segoe UI", sans-serif';
          context.fillStyle = '#9ac7ff';
          context.fillText(ellipsize(detailParts.join(' • '), 42), iconX, detailY);
        }
        context.restore();
      });

      context.restore();
      return bounds;
    };

    const renderDistrictMiniMap = () => {
      const city = state.city ?? null;
      const districts = Array.isArray(city?.districts) ? city.districts : [];
      if (!districts.length) {
        return null;
      }

      const mapWidth = 220;
      const mapX = canvas.width - mapWidth - 32;
      const mapY = 32;
      const maxHeight = canvas.height - mapY - 32;
      const mapHeight = Math.max(120, Math.min(maxHeight, 24 + districts.length * 34));

      context.save();
      context.fillStyle = 'rgba(12, 20, 32, 0.88)';
      context.fillRect(mapX, mapY, mapWidth, mapHeight);
      context.strokeStyle = 'rgba(120, 190, 255, 0.65)';
      context.strokeRect(mapX + 0.5, mapY + 0.5, mapWidth - 1, mapHeight - 1);

      context.font = '15px "Segoe UI", sans-serif';
      context.textAlign = 'left';
      context.textBaseline = 'top';
      context.fillStyle = '#9ac7ff';
      context.fillText('Districts', mapX + 16, mapY + 8);

      const availableHeight = mapHeight - 32;
      const rowHeightRaw = availableHeight / Math.max(districts.length, 1);
      const rowHeight = Math.max(26, Math.min(48, rowHeightRaw));
      const totalRowsHeight = rowHeight * districts.length;
      const startY = mapY + 28 + Math.max(0, (availableHeight - totalRowsHeight) / 2);

      const activeKey = createMissionDistrictKey(state.activeMission);

      districts.forEach((district, index) => {
        const cellX = mapX + 12;
        const cellWidth = mapWidth - 24;
        const cellY = startY + index * rowHeight;
        const cellHeight = rowHeight - 6;

        const districtKey = createDistrictKey(district);
        const isActive = Boolean(activeKey && districtKey === activeKey);

        let fillColor = 'rgba(80, 120, 180, 0.2)';
        let borderColor = 'rgba(120, 190, 255, 0.35)';
        let nameColor = '#d1eaff';
        let detailColor = '#9ac7ff';

        if (isActive) {
          fillColor = 'rgba(255, 214, 102, 0.3)';
          borderColor = 'rgba(255, 214, 102, 0.8)';
          nameColor = '#ffe27a';
          detailColor = '#ffd15c';
        }

        context.fillStyle = fillColor;
        context.fillRect(cellX, cellY, cellWidth, cellHeight);
        context.strokeStyle = borderColor;
        context.strokeRect(cellX + 0.5, cellY + 0.5, cellWidth - 1, cellHeight - 1);

        const riskTier = determineDistrictRiskTier(district.security);
        const riskLabel = riskTier
          ? `${riskTier.charAt(0).toUpperCase() + riskTier.slice(1)} risk`
          : 'Risk unknown';

        context.fillStyle = nameColor;
        context.fillText(district.name ?? 'Unknown', cellX + 8, cellY + 6);
        context.fillStyle = detailColor;
        context.fillText(riskLabel, cellX + 8, cellY + 22);
      });

      context.restore();
      return { x: mapX, y: mapY, width: mapWidth, height: mapHeight };
    };

    const crackdownTier = heatSystem.getCurrentTierConfig();
    const crackdownLabel = crackdownTier?.label ?? 'Unknown';
    const formatExpense = (value) => {
      const numeric = Number.isFinite(value) ? value : 0;
      const rounded = Math.round(Math.abs(numeric));
      const formatted = `$${rounded.toLocaleString()}`;
      return numeric < 0 ? `-${formatted}` : formatted;
    };
    const formatSigned = (value) => {
      if (!Number.isFinite(value) || value === 0) {
        return null;
      }
      const rounded = Math.round(Math.abs(value));
      const formatted = `$${rounded.toLocaleString()}`;
      return value >= 0 ? `+${formatted}` : `-${formatted}`;
    };
    const payroll = economySystem.getCrewPayroll();
    const projectedDaily = economySystem.getProjectedDailyExpenses();
    const lastExpenseReport = economySystem.getLastExpenseReport();
    const safehouse = getActiveSafehouseFromState(state);
    const safehouseTier = safehouse?.getCurrentTier?.() ?? null;
    const safehousePassiveIncome = typeof safehouse?.getPassiveIncome === 'function'
      ? safehouse.getPassiveIncome()
      : Number.isFinite(safehouseTier?.passiveIncome)
        ? safehouseTier.passiveIncome
        : 0;
    const safehouseHeatReduction = typeof safehouse?.getHeatReduction === 'function'
      ? safehouse.getHeatReduction()
      : Number.isFinite(safehouseTier?.heatReduction)
        ? safehouseTier.heatReduction
        : 0;
    const safehouseAmenities = typeof safehouse?.getUnlockedAmenities === 'function'
      ? safehouse.getUnlockedAmenities()
      : Array.isArray(safehouseTier?.amenities)
        ? safehouseTier.amenities
        : [];
    const safehouseOverhead = Number.isFinite(lastExpenseReport?.safehouseOverhead)
      ? lastExpenseReport.safehouseOverhead
      : 0;
    const safehouseIncome = Number.isFinite(lastExpenseReport?.safehouseIncome)
      ? lastExpenseReport.safehouseIncome
      : 0;
    const adjustmentSegments = [];
    const overheadLabel = formatSigned(safehouseOverhead);
    if (overheadLabel) {
      adjustmentSegments.push(`safehouse ${overheadLabel}`);
    }
    const perkLabel = formatSigned(-safehouseIncome);
    if (perkLabel) {
      adjustmentSegments.push(`perks ${perkLabel}`);
    }
    const adjustmentsLabel = adjustmentSegments.length ? ` + ${adjustmentSegments.join(' + ')}` : '';
    const lastExpenseLabel = lastExpenseReport
      ? `${formatExpense(lastExpenseReport.total)} (base ${formatExpense(
          lastExpenseReport.base,
        )} + crew ${formatExpense(lastExpenseReport.payroll)}${adjustmentsLabel})`
      : '—';

    const pendingDebts = Array.isArray(state.pendingDebts) ? state.pendingDebts : [];
    const totalOutstandingDebt = pendingDebts.reduce((total, entry) => {
      const remaining = Number.isFinite(entry?.remaining)
        ? entry.remaining
        : Number.isFinite(entry?.amount)
          ? entry.amount
          : 0;
      return total + Math.max(0, remaining);
    }, 0);
    const nextDebt = pendingDebts.find((entry) => {
      const remaining = Number.isFinite(entry?.remaining)
        ? entry.remaining
        : Number.isFinite(entry?.amount)
          ? entry.amount
          : 0;
      return remaining > 0;
    });

    let debtStatusLabel = 'Outstanding debt: None';
    if (totalOutstandingDebt > 0) {
      const totalLabel = `$${Math.round(totalOutstandingDebt).toLocaleString()}`;
      let nextLabel = '';
      if (nextDebt) {
        const nextAmountRaw = Number.isFinite(nextDebt?.remaining)
          ? nextDebt.remaining
          : Number.isFinite(nextDebt?.amount)
            ? nextDebt.amount
            : 0;
        const nextAmount = Math.max(0, Math.round(nextAmountRaw));
        const sourceParts = [];
        if (nextDebt?.sourceEventLabel) {
          sourceParts.push(nextDebt.sourceEventLabel);
        }
        if (nextDebt?.sourceChoiceLabel && nextDebt.sourceChoiceLabel !== nextDebt.sourceEventLabel) {
          sourceParts.push(nextDebt.sourceChoiceLabel);
        }
        const baseLabel = sourceParts.length ? sourceParts.join(' — ') : 'Debt due';
        let timestampLabel = '';
        if (Number.isFinite(nextDebt?.createdAt) && nextDebt.createdAt > 0) {
          try {
            const createdDate = new Date(nextDebt.createdAt);
            timestampLabel = createdDate.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            });
          } catch (error) {
            timestampLabel = '';
          }
        }
        const timeSuffix = timestampLabel ? ` @ ${timestampLabel}` : '';
        nextLabel = ` (Next: ${baseLabel}${timeSuffix} — $${nextAmount.toLocaleString()})`;
      }
      debtStatusLabel = `Outstanding debt: ${totalLabel}${nextLabel}`;
    }

    context.fillStyle = '#121822';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = '#78beff';
    context.font = '20px "Segoe UI", sans-serif';
    context.textAlign = 'left';
    context.fillText(`City: ${state.city.name}`, 32, 48);
    context.fillText(`Day ${state.day}`, 32, 78);
    context.fillText(`Funds: $${state.funds.toLocaleString()}`, 32, 108);
    context.fillText(debtStatusLabel, 32, 138);
    context.fillText(`Payroll: ${formatExpense(payroll)}/day`, 32, 168);
    context.fillText(`Projected burn: ${formatExpense(projectedDaily)}/day`, 32, 198);
    context.fillText(`Last upkeep: ${lastExpenseLabel}`, 32, 228);
    context.fillText(`Heat: ${state.heat.toFixed(2)}`, 32, 258);
    const heatGaugeBounds = renderArcGauge({
      x: 320,
      y: 256,
      radius: 42,
      thickness: 12,
      value: clampNormalized(state.heat / 10),
      valueLabel: state.heat.toFixed(1),
      label: 'Heat level',
    });
    const crackdownLabelY = heatGaugeBounds ? heatGaugeBounds.y + heatGaugeBounds.height + 8 : 288;
    context.fillText(`Crackdown: ${crackdownLabel}`, 32, crackdownLabelY);
    const safehouseLabel = safehouse
      ? `${safehouse.name} — ${safehouseTier?.label ?? 'Unranked'}`
      : 'None assigned';
    const safehousePerks = [];
    if (Number.isFinite(safehousePassiveIncome) && safehousePassiveIncome > 0) {
      safehousePerks.push(`+${formatExpense(safehousePassiveIncome)}/day`);
    }
    if (Number.isFinite(safehouseHeatReduction) && safehouseHeatReduction > 0) {
      safehousePerks.push(`-${safehouseHeatReduction.toFixed(2)} heat/day`);
    }
    if (Array.isArray(safehouseAmenities) && safehouseAmenities.length) {
      safehousePerks.push(`${safehouseAmenities.length} amenities online`);
    }
    const safehousePerksLabel = safehousePerks.length ? ` (${safehousePerks.join(', ')})` : '';
    const safehouseLineY = Math.max(318, crackdownLabelY + 30);
    context.fillText(`Safehouse: ${safehouseLabel}${safehousePerksLabel}`, 32, safehouseLineY);

    context.fillStyle = '#d1eaff';
    context.font = '16px "Segoe UI", sans-serif';
    const crewLabelY = Math.max(safehouseLineY + 14, 332);
    context.fillText('Crew:', 32, crewLabelY);
    const crewListStartY = crewLabelY + 30;
    state.crew.forEach((member, index) => {
      const loyaltyLabel = Number.isFinite(member.loyalty) ? `L${member.loyalty}` : 'L?';
      const statusLabel = (member.status ?? 'idle').replace(/-/g, ' ');
      const line = `- ${member.name} (${member.specialty}) — ${loyaltyLabel} • ${statusLabel}`;
      context.fillText(line, 48, crewListStartY + index * 26);
    });

    const crewSectionBottom = crewListStartY + state.crew.length * 26;
    const garageLabelY = crewSectionBottom + 40;
    context.fillText('Garage:', 32, garageLabelY);

    const garage = Array.isArray(state.garage) ? state.garage : [];
    const garageStartY = garageLabelY + 30;
    const garageColumnWidth = 200;
    const garageRowHeight = 74;
    const maxGarageColumns = Math.max(1, Math.min(3, Math.floor((canvas.width - 64) / garageColumnWidth)));
    const maxGarageRows = 3;
    const maxVehiclesVisible = maxGarageColumns * maxGarageRows;
    const vehiclesToDisplay = garage.slice(0, maxVehiclesVisible);
    const activeMissionVehicleId = state.activeMission?.assignedVehicleId ?? null;
    const lastVehicleReport = state.lastVehicleReport ?? null;

    vehiclesToDisplay.forEach((vehicle, index) => {
      const columnIndex = index % maxGarageColumns;
      const rowIndex = Math.floor(index / maxGarageColumns);
      const vehicleX = 32 + columnIndex * garageColumnWidth;
      const vehicleY = garageStartY + rowIndex * garageRowHeight;

      const isAssigned = Boolean(activeMissionVehicleId && activeMissionVehicleId === vehicle.id);
      const isRecentlyUsed = Boolean(!isAssigned && lastVehicleReport?.vehicleId === vehicle.id);

      if (isAssigned || isRecentlyUsed) {
        context.fillStyle = isAssigned ? 'rgba(255, 200, 80, 0.18)' : 'rgba(95, 150, 255, 0.18)';
        context.fillRect(vehicleX - 16, vehicleY - 28, garageColumnWidth - 24, garageRowHeight - 12);
      }

      const nameColor = isAssigned ? '#ffe27a' : '#d1eaff';
      const detailColor = isAssigned ? '#ffd15c' : '#9ac7ff';
      const secondaryColor = isAssigned ? '#ffebb1' : '#b4d4ff';

      const conditionValue = Number.isFinite(vehicle.condition)
        ? Math.max(0, Math.min(1, vehicle.condition))
        : null;
      const conditionPercent = conditionValue !== null ? Math.round(conditionValue * 100) : null;
      const conditionDelta =
        isRecentlyUsed && Number.isFinite(lastVehicleReport?.conditionDelta)
          ? Math.round(lastVehicleReport.conditionDelta * 100)
          : null;
      const conditionDeltaLabel =
        conditionDelta !== null && Math.abs(conditionDelta) >= 1
          ? ` (${conditionDelta > 0 ? '+' : ''}${conditionDelta}%)`
          : '';

      const heatValue = Number.isFinite(vehicle.heat) ? vehicle.heat.toFixed(1) : 'N/A';
      const heatDelta =
        isRecentlyUsed && Number.isFinite(lastVehicleReport?.heatDelta)
          ? lastVehicleReport.heatDelta
          : null;
      const heatDeltaLabel =
        heatDelta !== null && Math.abs(heatDelta) >= 0.05
          ? ` (${heatDelta > 0 ? '+' : ''}${heatDelta.toFixed(1)})`
          : '';

      context.fillStyle = nameColor;
      context.fillText(vehicle.model ?? 'Unknown vehicle', vehicleX, vehicleY);
      context.fillStyle = detailColor;
      context.fillText(
        `Condition: ${conditionPercent !== null ? `${conditionPercent}%` : 'N/A'}${conditionDeltaLabel}`,
        vehicleX,
        vehicleY + 22,
      );
      context.fillText(`Heat: ${heatValue}${heatDeltaLabel}`, vehicleX, vehicleY + 42);

      const statusSegments = [];
      if (isAssigned) {
        statusSegments.push('In mission');
      } else {
        const statusLabel = (vehicle.status ?? 'idle').replace(/-/g, ' ');
        if (statusLabel && statusLabel.toLowerCase() !== 'idle') {
          statusSegments.push(statusLabel);
        }
      }

      if (isRecentlyUsed && lastVehicleReport?.outcome) {
        let outcomeLabel;
        if (lastVehicleReport.outcome === 'success') {
          outcomeLabel = 'Success';
        } else if (lastVehicleReport.outcome === 'failure') {
          outcomeLabel = 'Failure';
        } else if (lastVehicleReport.outcome === 'sale') {
          const fundsLabel = Number.isFinite(lastVehicleReport.fundsDelta)
            ? formatExpense(lastVehicleReport.fundsDelta)
            : formatExpense(lastVehicleReport.salePrice);
          outcomeLabel = `Sold (${fundsLabel})`;
        } else if (lastVehicleReport.outcome === 'scrap') {
          const fundsLabel = Number.isFinite(lastVehicleReport.fundsDelta)
            ? formatExpense(lastVehicleReport.fundsDelta)
            : formatExpense(lastVehicleReport.scrapValue);
          const partsLabel = Number.isFinite(lastVehicleReport.partsRecovered)
            ? `${lastVehicleReport.partsRecovered} parts`
            : null;
          outcomeLabel = ['Scrapped', partsLabel, fundsLabel ? `+${fundsLabel}` : null]
            .filter(Boolean)
            .join(' ');
        } else if (lastVehicleReport.outcome === 'maintenance') {
          const serviceType = lastVehicleReport.maintenanceType;
          if (serviceType === 'repair') {
            outcomeLabel = 'Maintenance: Repair';
          } else if (serviceType === 'heat') {
            outcomeLabel = 'Maintenance: Heat purge';
          } else {
            outcomeLabel = 'Maintenance';
          }
        } else if (lastVehicleReport.outcome === 'vehicle-acquired') {
          const storageRequired = Number.isFinite(lastVehicleReport.storageRequired)
            ? Math.max(1, Math.round(lastVehicleReport.storageRequired))
            : null;
          const storageLabel = storageRequired !== null
            ? ` (${storageRequired === 1 ? '1 slot' : `${storageRequired} slots`})`
            : '';
          outcomeLabel = `Vehicle secured${storageLabel}`;
        } else {
          outcomeLabel = lastVehicleReport.outcome;
        }

        statusSegments.push(`Last: ${outcomeLabel}`);
      }

      if (statusSegments.length) {
        context.fillStyle = secondaryColor;
        context.fillText(statusSegments.join(' • '), vehicleX, vehicleY + 62);
      }
    });

    context.fillStyle = '#d1eaff';

    if (garage.length > vehiclesToDisplay.length) {
      const remaining = garage.length - vehiclesToDisplay.length;
      const infoY =
        garageStartY + maxGarageRows * garageRowHeight - 10;
      context.fillText(`+${remaining} more in garage`, 32, infoY);
    }

    const garageColumnsUsed = Math.min(Math.max(garage.length, 1), maxGarageColumns);
    const missionInfoXBase = Math.max(420, 32 + garageColumnsUsed * garageColumnWidth + 48);
    const miniMapBounds = renderDistrictMiniMap();
    const desiredMissionWidth = 300;
    let missionInfoX = missionInfoXBase;
    if (miniMapBounds) {
      const maxMissionX = miniMapBounds.x - 24 - desiredMissionWidth;
      if (maxMissionX < missionInfoX) {
        missionInfoX = Math.max(420, maxMissionX);
      }
    }
    missionInfoX = Math.max(420, missionInfoX);
    const missionInfoRightLimit = miniMapBounds ? miniMapBounds.x - 24 : canvas.width - 32;
    let missionPanelWidth = desiredMissionWidth;
    if (miniMapBounds) {
      const rawMissionWidth = missionInfoRightLimit - missionInfoX;
      if (rawMissionWidth <= 0) {
        missionPanelWidth = desiredMissionWidth;
      } else if (rawMissionWidth < 180) {
        missionPanelWidth = rawMissionWidth;
      } else {
        missionPanelWidth = Math.min(340, rawMissionWidth);
      }
    } else {
      missionPanelWidth = Math.min(desiredMissionWidth, canvas.width - missionInfoX - 32);
    }
    if (!Number.isFinite(missionPanelWidth) || missionPanelWidth <= 0) {
      missionPanelWidth = desiredMissionWidth;
    }

    const missionTimelineBounds = renderMissionEventTimeline({
      x: missionInfoX,
      y: 32,
      width: missionPanelWidth,
      maxWidth: missionInfoRightLimit - missionInfoX,
      maxHeight: miniMapBounds ? Math.max(120, miniMapBounds.height - 24) : 180,
    });

    let missionInfoY = missionTimelineBounds
      ? missionTimelineBounds.y + missionTimelineBounds.height + 24
      : 48;
    context.fillText('Mission Status:', missionInfoX, missionInfoY);

    missionInfoY += 30;
    const activeMission = state.activeMission;
    if (activeMission) {
      const progressPercent = Math.round((activeMission.progress ?? 0) * 100);
      const remainingSeconds = Math.max(
        (activeMission.duration ?? 0) - (activeMission.elapsedTime ?? 0),
        0,
      );
      const timeLabel = `${Math.ceil(remainingSeconds)}s remaining`;
      const statusLabel =
        activeMission.status === 'awaiting-resolution'
          ? 'Resolving outcome'
          : activeMission.status === 'in-progress'
            ? 'In progress (auto resolves)'
            : activeMission.status === 'completed'
              ? `Completed (${activeMission.outcome ?? 'unknown'})`
              : activeMission.status ?? 'Unknown';
      const activeMetadata = [
        activeMission.districtName ? `District: ${activeMission.districtName}` : null,
        activeMission.riskTier ? `Risk: ${activeMission.riskTier}` : null,
        activeMission.category ? activeMission.category.toUpperCase() : null,
      ].filter(Boolean);

      context.fillText(activeMission.name, missionInfoX, missionInfoY);
      missionInfoY += 26;
      context.fillText(`Status: ${statusLabel}`, missionInfoX, missionInfoY);
      missionInfoY += 26;

      if (activeMetadata.length) {
        context.fillText(activeMetadata.join(' • '), missionInfoX, missionInfoY);
        missionInfoY += 26;
      }

      if (activeMission.assignedVehicleLabel) {
        context.fillText(`Vehicle: ${activeMission.assignedVehicleLabel}`, missionInfoX, missionInfoY);
        missionInfoY += 26;
      }

      if (activeMission.status === 'in-progress') {
        context.fillText(
          `Progress: ${progressPercent}% — ${timeLabel}`,
          missionInfoX,
          missionInfoY,
        );
        missionInfoY += 24;
        renderBarGauge({
          x: missionInfoX,
          y: missionInfoY,
          width: missionPanelWidth,
          height: 14,
          value: clampNormalized(activeMission.progress ?? 0),
          fillColor: '#ffe27a',
          borderColor: 'rgba(255, 214, 102, 0.8)',
        });
        missionInfoY += 26;
      } else if (activeMission.status === 'awaiting-resolution') {
        context.fillText(`Progress: ${progressPercent}% — Resolving outcome`, missionInfoX, missionInfoY);
        missionInfoY += 24;
        renderBarGauge({
          x: missionInfoX,
          y: missionInfoY,
          width: missionPanelWidth,
          height: 14,
          value: clampNormalized(activeMission.progress ?? 0),
          fillColor: '#ffd15c',
          borderColor: 'rgba(255, 214, 102, 0.7)',
        });
        missionInfoY += 26;
      } else if (activeMission.status === 'completed') {
        context.fillText(`Payout: $${activeMission.payout.toLocaleString()}`, missionInfoX, missionInfoY);
        missionInfoY += 26;
      }

      const playerSummary = Array.isArray(activeMission.playerEffectSummary)
        ? activeMission.playerEffectSummary
        : [];
      if (playerSummary.length) {
        context.fillText('Player influence:', missionInfoX, missionInfoY);
        missionInfoY += 24;
        playerSummary.slice(0, 2).forEach((line) => {
          context.fillText(` • ${line}`, missionInfoX + 12, missionInfoY);
          missionInfoY += 22;
        });
        if (playerSummary.length > 2) {
          context.fillText(` • +${playerSummary.length - 2} more adjustments`, missionInfoX + 12, missionInfoY);
          missionInfoY += 22;
        }
      }

      if (Array.isArray(activeMission.assignedCrewIds) && activeMission.assignedCrewIds.length) {
        const crewMembers = activeMission.assignedCrewIds
          .map((crewId) => state.crew.find((member) => member.id === crewId))
          .filter(Boolean);
        const crewNames = crewMembers.map((member) => member.name).join(', ');
        context.fillText(`Crew: ${crewNames}`, missionInfoX, missionInfoY);
        missionInfoY += 26;

        if (Number.isFinite(activeMission.successChance)) {
          context.fillText(
            `Projected success: ${Math.round(activeMission.successChance * 100)}%`,
            missionInfoX,
            missionInfoY,
          );
          missionInfoY += 26;
        }

        const crewSummary = Array.isArray(activeMission.crewEffectSummary)
          ? activeMission.crewEffectSummary
          : [];
        crewSummary.slice(0, 3).forEach((line) => {
          context.fillText(` • ${line}`, missionInfoX + 12, missionInfoY);
          missionInfoY += 22;
        });
        if (crewSummary.length > 3) {
          context.fillText(` • +${crewSummary.length - 3} more adjustments`, missionInfoX + 12, missionInfoY);
          missionInfoY += 22;
        }
      }
    } else {
      context.fillText('No active mission', missionInfoX, missionInfoY);
      missionInfoY += 26;
    }

    const latestLogEntry =
      Array.isArray(state.missionLog) && state.missionLog.length ? state.missionLog[0] : null;
    if (latestLogEntry) {
      context.fillText(`Last result: ${latestLogEntry.summary}`, missionInfoX, missionInfoY);
      missionInfoY += 26;
    }

    missionInfoY += 32;
    context.fillText('Recon Ops:', missionInfoX, missionInfoY);
    missionInfoY += 26;

    const reconAssignments = Array.isArray(state.reconAssignments) ? state.reconAssignments : [];
    const activeRecon = reconAssignments.filter((assignment) => assignment?.status === 'in-progress');
    const crewRoster = Array.isArray(state.crew) ? state.crew : [];
    const crewById = new Map(crewRoster.map((member) => [member?.id, member]));

    if (activeRecon.length) {
      activeRecon.slice(0, 3).forEach((assignment) => {
        if (!assignment) {
          return;
        }

        const progressPercent = Math.round((assignment.progress ?? 0) * 100);
        const remainingSeconds = Number.isFinite(assignment.remainingSeconds)
          ? Math.ceil(Math.max(0, assignment.remainingSeconds))
          : null;
        const statusSegments = [
          `${progressPercent}%`,
          remainingSeconds !== null ? `${remainingSeconds}s remaining` : null,
        ].filter(Boolean);
        const statusLabel = statusSegments.length ? statusSegments.join(' — ') : 'In progress';

        context.fillText(
          `${assignment.districtName ?? 'District'} — ${statusLabel}`,
          missionInfoX,
          missionInfoY,
        );
        missionInfoY += 22;

        const crewNames = Array.isArray(assignment.crewIds)
          ? assignment.crewIds
              .map((crewId) => crewById.get(crewId)?.name ?? null)
              .filter(Boolean)
          : [];
        if (crewNames.length) {
          context.fillStyle = '#9ac7ff';
          context.fillText(`Crew: ${crewNames.join(', ')}`, missionInfoX + 12, missionInfoY);
          missionInfoY += 20;
          context.fillStyle = '#d1eaff';
        }
      });
    } else {
      const latestRecon = reconAssignments
        .filter((assignment) => ['completed', 'failed'].includes((assignment?.status ?? '').toLowerCase()))
        .sort((a, b) => {
          const timeA = a?.completedAt ?? a?.failedAt ?? 0;
          const timeB = b?.completedAt ?? b?.failedAt ?? 0;
          return (timeB ?? 0) - (timeA ?? 0);
        })[0];

      if (latestRecon) {
        const timestamp = Number.isFinite(latestRecon.completedAt)
          ? latestRecon.completedAt
          : Number.isFinite(latestRecon.failedAt)
            ? latestRecon.failedAt
            : null;
        const timeLabel = Number.isFinite(timestamp)
          ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : null;
        const summaryLabel = latestRecon.resultSummary
          ?? ((latestRecon.status ?? '').toLowerCase() === 'failed' ? 'Recon failed.' : 'Recon completed.');
        const trimmedSummary = typeof summaryLabel === 'string'
          ? summaryLabel.trim().replace(/[.]+$/, '')
          : summaryLabel;
        const reconLabel = timeLabel
          ? `${latestRecon.districtName ?? 'District'} — ${trimmedSummary} @ ${timeLabel}`
          : `${latestRecon.districtName ?? 'District'} — ${trimmedSummary}`;
        context.fillText(`Last recon: ${reconLabel}`, missionInfoX, missionInfoY);
        missionInfoY += 24;
      } else {
        context.fillText('No recon teams deployed.', missionInfoX, missionInfoY);
        missionInfoY += 24;
      }
    }

    if (activeRecon.length) {
      const latestRecon = reconAssignments
        .filter((assignment) => ['completed', 'failed'].includes((assignment?.status ?? '').toLowerCase()))
        .sort((a, b) => {
          const timeA = a?.completedAt ?? a?.failedAt ?? 0;
          const timeB = b?.completedAt ?? b?.failedAt ?? 0;
          return (timeB ?? 0) - (timeA ?? 0);
        })[0];
      if (latestRecon) {
        const timestamp = Number.isFinite(latestRecon.completedAt)
          ? latestRecon.completedAt
          : Number.isFinite(latestRecon.failedAt)
            ? latestRecon.failedAt
            : null;
        const timeLabel = Number.isFinite(timestamp)
          ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : null;
        const summaryLabel = latestRecon.resultSummary
          ?? ((latestRecon.status ?? '').toLowerCase() === 'failed' ? 'Recon failed.' : 'Recon completed.');
        const trimmedSummary = typeof summaryLabel === 'string'
          ? summaryLabel.trim().replace(/[.]+$/, '')
          : summaryLabel;
        const reconLabel = timeLabel
          ? `${latestRecon.districtName ?? 'District'} — ${trimmedSummary} @ ${timeLabel}`
          : `${latestRecon.districtName ?? 'District'} — ${trimmedSummary}`;
        context.fillStyle = '#9ac7ff';
        context.fillText(`Last recon: ${reconLabel}`, missionInfoX, missionInfoY);
        missionInfoY += 20;
        context.fillStyle = '#d1eaff';
      }
    }

    missionInfoY += 12;
    context.fillText('Contracts:', missionInfoX, missionInfoY);
    missionSystem.availableMissions.forEach((mission, index) => {
      const baseY = missionInfoY + 30 + index * 26;
      const progressPercent = Math.round((mission.progress ?? 0) * 100);
      let statusLabel = mission.status ?? 'unknown';
      if (mission.status === 'in-progress') {
        statusLabel = `in progress (${progressPercent}%)`;
      } else if (mission.status === 'awaiting-resolution') {
        statusLabel = 'awaiting outcome';
      }

      const metadataSegments = [
        mission.districtName ? `@ ${mission.districtName}` : null,
        mission.riskTier ? `risk: ${mission.riskTier}` : null,
        mission.category ? mission.category.toUpperCase() : null,
        mission.restricted ? 'LOCKED' : null,
      ].filter(Boolean);
      const metadataLabel = metadataSegments.length ? ` — ${metadataSegments.join(' • ')}` : '';

      context.fillText(
        `${mission.name} — $${mission.payout.toLocaleString()} (${statusLabel})${metadataLabel}`,
        missionInfoX,
        baseY,
      );
      if (mission.restricted && mission.restrictionReason) {
        context.fillText(`   ⛔ ${mission.restrictionReason}`, missionInfoX, baseY + 18);
      }
    });
  };

  const loop = new GameLoop({
    update: (delta) => {
      missionSystem.update(delta);
      heatSystem.update(delta);
      economySystem.update(delta);
      reconSystem.update(delta);

      saveAccumulator += delta;
      if (saveAccumulator >= SAVE_INTERVAL_SECONDS) {
        persistSnapshot();
        saveAccumulator = 0;
      }
    },
    render: renderHud,
  });

  loop.persistState = () => persistSnapshot();
  loop.clearSavedState = () => {
    clearSavedState();
    return true;
  };
  loop.saveIntervalSeconds = SAVE_INTERVAL_SECONDS;

  const handleNewGameEvent = () => {
    clearSavedState();
  };

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('osr:new-game', handleNewGameEvent);
  }

  const originalStop = loop.stop.bind(loop);
  loop.stop = () => {
    persistSnapshot();
    if (typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('osr:new-game', handleNewGameEvent);
    }
    originalStop();
  };

  const boot = () => {
    const hasMissionSnapshot = Array.isArray(savedPayload?.systems?.missions?.availableMissions)
      && savedPayload.systems.missions.availableMissions.length > 0;

    if (!loadedFromSave || !hasMissionSnapshot) {
      missionSystem.generateInitialContracts();
    }
    loop.attachCanvas(canvas);
    renderHud();
  };

  const start = () => loop.start();
  const stop = () => loop.stop();

  return {
    state,
    systems: {
      mission: missionSystem,
      heat: heatSystem,
      economy: economySystem,
      recon: reconSystem,
    },
    loop,
    boot,
    start,
    stop,
  };
};

export { createCarThiefGame, createGameSerializer };
