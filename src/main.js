import { createCarThiefGame } from './game/carThief/index.js';

let gameInstance = null;

const teardownGame = () => {
  if (!gameInstance) {
    return;
  }

  if (typeof gameInstance.stop === 'function') {
    gameInstance.stop();
  } else if (gameInstance.loop && typeof gameInstance.loop.stop === 'function') {
    gameInstance.loop.stop();
  }

  gameInstance = null;
};

const missionControls = {
  select: null,
  startButton: null,
  successButton: null,
  failureButton: null,
  statusText: null,
  detailDescription: null,
  detailPayout: null,
  detailHeat: null,
  detailDuration: null,
  detailRestriction: null,
  crackdownText: null,
};

let missionControlSyncHandle = null;

const CONTROL_SYNC_INTERVAL_MS = 500;

const getMissionSystem = () => gameInstance?.systems?.mission ?? null;
const getEconomySystem = () => gameInstance?.systems?.economy ?? null;
const getHeatSystem = () => gameInstance?.systems?.heat ?? null;

const triggerHudRender = () => {
  if (gameInstance?.loop?.render) {
    gameInstance.loop.render();
  }
};

const setMissionDetails = ({ description, payout, heat, duration, restriction }) => {
  const {
    detailDescription,
    detailPayout,
    detailHeat,
    detailDuration,
    detailRestriction,
  } = missionControls;

  if (
    !(
      detailDescription &&
      detailPayout &&
      detailHeat &&
      detailDuration &&
      detailRestriction
    )
  ) {
    return;
  }

  detailDescription.textContent = description;
  detailPayout.textContent = payout;
  detailHeat.textContent = heat;
  detailDuration.textContent = duration;
  detailRestriction.textContent = restriction;
};

const resetMissionDetails = (descriptionText) => {
  setMissionDetails({
    description: descriptionText,
    payout: '—',
    heat: '—',
    duration: '—',
    restriction: 'All contracts are currently open.',
  });
};

const formatMissionStatusMessage = (mission) => {
  if (!mission) {
    return 'No active mission.';
  }

  const status = mission.status ?? 'unknown';
  const progressPercent = Math.round((mission.progress ?? 0) * 100);
  const remainingSeconds = Math.max((mission.duration ?? 0) - (mission.elapsedTime ?? 0), 0);
  const roundedRemaining = Math.max(Math.ceil(remainingSeconds), 0);

  switch (status) {
    case 'in-progress':
      return `${mission.name} in progress — ${progressPercent}% complete (${roundedRemaining}s remaining)`;
    case 'awaiting-resolution':
      return `${mission.name} ready for outcome — ${progressPercent}% complete`;
    case 'completed':
      return `${mission.name} completed — outcome: ${mission.outcome ?? 'unknown'}`;
    default:
      return `${mission.name} — status: ${status}`;
  }
};

const describeCrackdownPolicy = () => {
  const missionSystem = getMissionSystem();
  const heatSystem = getHeatSystem();

  if (!missionSystem && !heatSystem) {
    return null;
  }

  const policy = missionSystem?.getCurrentCrackdownPolicy?.();
  const tierName = missionSystem?.currentCrackdownTier ?? heatSystem?.getCurrentTier?.();

  const label = policy?.label ?? (tierName ? tierName.charAt(0).toUpperCase() + tierName.slice(1) : 'Calm');
  let impact;

  if (!policy || !Number.isFinite(policy.maxMissionHeat)) {
    impact = 'All contracts are open.';
  } else {
    impact = `Contracts generating more than ${policy.maxMissionHeat} heat are grounded.`;
  }

  return {
    tierName: tierName ?? 'calm',
    label,
    impact,
  };
};

const updateMissionStatusText = () => {
  if (!missionControls.statusText) {
    return;
  }

  const missionSystem = getMissionSystem();
  if (!missionSystem) {
    missionControls.statusText.textContent = 'Game initializing…';
    return;
  }

  const activeMission = missionSystem.state.activeMission;
  let statusMessage = formatMissionStatusMessage(activeMission);

  const crackdownInfo = describeCrackdownPolicy();
  if (crackdownInfo) {
    const crackdownSentence = `Crackdown: ${crackdownInfo.label} — ${crackdownInfo.impact}`;
    statusMessage = `${statusMessage} ${crackdownSentence}`.trim();
  }

  missionControls.statusText.textContent = statusMessage;
};

const updateCrackdownIndicator = () => {
  const { crackdownText } = missionControls;
  if (!crackdownText) {
    return;
  }

  const crackdownInfo = describeCrackdownPolicy();
  if (!crackdownInfo) {
    crackdownText.textContent = 'Crackdown systems calibrating…';
    return;
  }

  crackdownText.textContent = `Crackdown level: ${crackdownInfo.label} — ${crackdownInfo.impact}`;
};

const updateMissionControls = () => {
  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();
  const {
    select,
    startButton,
    successButton,
    failureButton,
    detailDescription,
    detailPayout,
    detailHeat,
    detailDuration,
    detailRestriction,
    crackdownText,
  } = missionControls;

  const controls = [select, startButton, successButton, failureButton];
  const detailElements = [
    detailDescription,
    detailPayout,
    detailHeat,
    detailDuration,
    detailRestriction,
    crackdownText,
  ];
  const controlsReady = [...controls, ...detailElements].every(Boolean);

  if (!controlsReady) {
    return;
  }

  const isReady = Boolean(missionSystem && economySystem);
  controls.forEach((control) => {
    // Keep select enabled separately to allow mission browsing once ready.
    if (control !== select) {
      control.disabled = !isReady;
    }
  });

  if (!isReady) {
    const descriptionText = missionSystem
      ? 'Select a mission to view its briefing.'
      : 'Mission database initializing…';
    resetMissionDetails(descriptionText);
    updateMissionStatusText();
    updateCrackdownIndicator();
    return;
  }

  updateCrackdownIndicator();

  const selectedMissionId = select.value;
  const selectedMission = missionSystem.availableMissions.find(
    (mission) => mission.id === selectedMissionId,
  );
  const activeMission = missionSystem.state.activeMission;

  const missionReadyForOutcome =
    Boolean(activeMission && activeMission.status === 'awaiting-resolution');
  const missionCanFail = Boolean(
    activeMission && (activeMission.status === 'in-progress' || activeMission.status === 'awaiting-resolution'),
  );

  const isMissionAvailable = Boolean(selectedMission && selectedMission.status === 'available');
  const isMissionRestricted = Boolean(selectedMission && selectedMission.restricted);
  const isAnotherMissionRunning = Boolean(
    activeMission && activeMission.id !== selectedMissionId && activeMission.status !== 'completed',
  );

  startButton.disabled =
    !isReady || !isMissionAvailable || isAnotherMissionRunning || isMissionRestricted;
  successButton.disabled = !missionReadyForOutcome;
  failureButton.disabled = !missionCanFail;

  if (!selectedMission) {
    resetMissionDetails('Select a mission to view its briefing.');
  } else {
    const missionDescription = selectedMission.description ?? 'No description available.';
    const missionPayout = Number.isFinite(selectedMission.payout)
      ? `$${Math.round(selectedMission.payout).toLocaleString()}`
      : '—';
    const missionHeat = Number.isFinite(selectedMission.heat)
      ? `${selectedMission.heat}`
      : '—';
    const missionDuration = Number.isFinite(selectedMission.duration)
      ? `${Math.round(selectedMission.duration)}s`
      : '—';
    const crackdownInfo = describeCrackdownPolicy();
    const restrictionMessage = selectedMission.restricted
      ? selectedMission.restrictionReason ?? 'This contract is locked by the current crackdown.'
      : crackdownInfo
        ? `Eligible under the ${crackdownInfo.label.toLowerCase()} crackdown.`
        : 'All contracts are open.';

    setMissionDetails({
      description: missionDescription,
      payout: missionPayout,
      heat: missionHeat,
      duration: missionDuration,
      restriction: restrictionMessage,
    });
  }

  updateMissionStatusText();
};

const updateMissionSelect = () => {
  const { select } = missionControls;
  if (!select) {
    return;
  }

  const missionSystem = getMissionSystem();
  if (!missionSystem) {
    select.disabled = true;
    return;
  }

  select.disabled = false;

  const previousSelection = select.value;
  const missions = missionSystem.availableMissions ?? [];
  const selectionStillValid = missions.some((mission) => mission.id === previousSelection);

  select.innerHTML = '';

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = 'Select a mission';
  placeholderOption.disabled = true;
  placeholderOption.selected = !selectionStillValid;
  select.appendChild(placeholderOption);

  missions.forEach((mission) => {
    const option = document.createElement('option');
    option.value = mission.id;

    const progressPercent = Math.round((mission.progress ?? 0) * 100);
    let statusLabel = mission.status ?? 'unknown';
    if (mission.status === 'in-progress') {
      statusLabel = `in progress (${progressPercent}%)`;
    } else if (mission.status === 'awaiting-resolution') {
      statusLabel = 'awaiting outcome';
    }

    const restrictionLabel = mission.restricted ? ' [LOCKED]' : '';
    option.textContent = `${mission.name} — $${mission.payout.toLocaleString()} (${statusLabel})${restrictionLabel}`;
    option.selected = selectionStillValid && mission.id === previousSelection;
    select.appendChild(option);
  });

  if (selectionStillValid) {
    select.value = previousSelection;
  }
};

const handleMissionStart = () => {
  const missionSystem = getMissionSystem();
  const economySystem = getEconomySystem();
  const { select } = missionControls;

  if (!missionSystem || !economySystem || !select) {
    return;
  }

  const missionId = select.value;
  if (!missionId) {
    return;
  }

  const mission = missionSystem.startMission(missionId);
  if (!mission) {
    updateMissionStatusText();
    return;
  }

  economySystem.payCrew();
  updateMissionSelect();
  updateMissionControls();
  triggerHudRender();
};

const handleMissionResolution = (outcome) => {
  const missionSystem = getMissionSystem();
  if (!missionSystem) {
    return;
  }

  const activeMission = missionSystem.state.activeMission;
  if (!activeMission) {
    updateMissionStatusText();
    return;
  }

  const mission = missionSystem.resolveMission(activeMission.id, outcome);
  if (!mission) {
    updateMissionStatusText();
    return;
  }

  updateMissionSelect();
  updateMissionControls();
  triggerHudRender();
};

const setupMissionControls = () => {
  missionControls.select = document.getElementById('mission-select');
  missionControls.startButton = document.getElementById('start-mission-btn');
  missionControls.successButton = document.getElementById('mission-success-btn');
  missionControls.failureButton = document.getElementById('mission-failure-btn');
  missionControls.statusText = document.getElementById('mission-status-text');
  missionControls.detailDescription = document.getElementById('mission-detail-description');
  missionControls.detailPayout = document.getElementById('mission-detail-payout');
  missionControls.detailHeat = document.getElementById('mission-detail-heat');
  missionControls.detailDuration = document.getElementById('mission-detail-duration');
  missionControls.detailRestriction = document.getElementById('mission-detail-restriction');
  missionControls.crackdownText = document.getElementById('mission-crackdown-text');

  const {
    select,
    startButton,
    successButton,
    failureButton,
    detailDescription,
    detailPayout,
    detailHeat,
    detailDuration,
    detailRestriction,
    crackdownText,
  } = missionControls;

  const controlsReady = [
    select,
    startButton,
    successButton,
    failureButton,
    detailDescription,
    detailPayout,
    detailHeat,
    detailDuration,
    detailRestriction,
    crackdownText,
  ].every(Boolean);

  if (!controlsReady) {
    return;
  }

  startButton.addEventListener('click', handleMissionStart);
  successButton.addEventListener('click', () => handleMissionResolution('success'));
  failureButton.addEventListener('click', () => handleMissionResolution('failure'));
  select.addEventListener('change', updateMissionControls);

  if (!missionControlSyncHandle) {
    missionControlSyncHandle = window.setInterval(() => {
      updateMissionSelect();
      updateMissionControls();
    }, CONTROL_SYNC_INTERVAL_MS);
  }
};

function initGame() {
  if (gameInstance) {
    if (gameInstance.loop?.running) {
      return gameInstance;
    }

    teardownGame();
  }

  const canvas = document.getElementById('game-canvas');
  if (!canvas) {
    console.warn('Game canvas not found.');
    return null;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    console.error('Canvas context unavailable.');
    return null;
  }

  gameInstance = createCarThiefGame({ canvas, context });
  gameInstance.boot();
  gameInstance.start();

  window.dispatchEvent(
    new CustomEvent('osr:init', {
      detail: { canvas, context, game: gameInstance },
    }),
  );

  return gameInstance;
}

document.addEventListener('DOMContentLoaded', () => {
  setupMissionControls();

  if (document.readyState === 'loading') {
    window.addEventListener('load', initGame, { once: true });
  }
  initGame();
});

window.addEventListener('osr:init', () => {
  updateMissionSelect();
  updateMissionControls();
});

export { initGame, teardownGame };
